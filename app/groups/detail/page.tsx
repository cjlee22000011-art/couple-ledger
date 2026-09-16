'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Group, Profile, GroupExpense, GroupExpenseShare, GroupSettlement, GroupCategory } from '@/lib/types';
import { computeGroupBalances, simplifyDebts, splitEqually } from '@/lib/groupBalance';
import { fmtMoney, today } from '@/lib/date';

// 群组账单的默认分类（跟个人账本的分类是分开的两套，不需要用户手动输入）
const GROUP_CATEGORIES = ['餐饮', '交通', '住宿', '娱乐', '购物', '门票', '其他'];

export default function GroupDetailPage() {
  return (
    <Suspense fallback={null}>
      <GroupDetailInner />
    </Suspense>
  );
}

type SplitMode = 'equal' | 'custom';

function GroupDetailInner() {
  const params = useSearchParams();
  const groupId = params.get('id');
  const { session, loading } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [shares, setShares] = useState<GroupExpenseShare[]>([]);
  const [settlements, setSettlements] = useState<GroupSettlement[]>([]);
  const [groupCategories, setGroupCategories] = useState<GroupCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const [payerId, setPayerId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(GROUP_CATEGORIES[0]);
  const [date, setDate] = useState(today());
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  const categoryOptions = groupCategories.length > 0 ? groupCategories.map((c) => c.name) : GROUP_CATEGORIES;

  const load = useCallback(async () => {
    if (!groupId || !session) return;
    const [{ data: g }, { data: mems }, { data: exps }, { data: st }, { data: cats }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase.from('group_members').select('user_id').eq('group_id', groupId),
      supabase.from('group_expenses').select('*').eq('group_id', groupId).order('occurred_on', { ascending: false }),
      supabase.from('group_settlements').select('*').eq('group_id', groupId).order('occurred_on', { ascending: false }),
      supabase.from('group_categories').select('*').eq('group_id', groupId).order('name'),
    ]);
    setGroup((g as Group) || null);
    setGroupCategories((cats as GroupCategory[]) || []);
    const memberIds = (mems || []).map((m: any) => m.user_id);
    if (memberIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', memberIds);
      setMembers((profs as Profile[]) || []);
      setPayerId((prev) => prev || session.user.id);
      setParticipants((prev) => (prev.size === 0 ? new Set(memberIds) : prev));
    }
    const expenseList = (exps as GroupExpense[]) || [];
    setExpenses(expenseList);
    setSettlements((st as GroupSettlement[]) || []);
    if (expenseList.length > 0) {
      const { data: shareRows } = await supabase
        .from('group_expense_shares')
        .select('*')
        .in('expense_id', expenseList.map((e) => e.id));
      setShares((shareRows as GroupExpenseShare[]) || []);
    } else {
      setShares([]);
    }
  }, [groupId, session]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (groupCategories.length > 0 && !groupCategories.some((c) => c.name === category)) {
      setCategory(groupCategories[0].name);
    }
  }, [groupCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const balances = useMemo(
    () => computeGroupBalances(memberIds, expenses, shares, settlements),
    [memberIds, expenses, shares, settlements]
  );
  const suggestions = useMemo(() => simplifyDebts(balances), [balances]);

  // 每个人在这个群组里"总共花了多少钱"——即他们在所有账单里分摊到的金额总和，
  // 跟"垫付了多少钱"是两回事：垫付体现在净余额里，这里体现的是实际消费/该出的钱。
  const totalSpent = useMemo(() => {
    const totals: Record<string, number> = {};
    memberIds.forEach((id) => (totals[id] = 0));
    for (const s of shares) {
      totals[s.user_id] = (totals[s.user_id] ?? 0) + Number(s.share_amount);
    }
    return totals;
  }, [memberIds, shares]);

  const myExpenses = useMemo(
    () => expenses.filter((e) => e.created_by === session?.user.id),
    [expenses, session]
  );
  const otherExpenses = useMemo(
    () => expenses.filter((e) => e.created_by !== session?.user.id),
    [expenses, session]
  );

  function nameOf(id: string) {
    return members.find((m) => m.id === id)?.display_name || '未知';
  }
  function colorOf(id: string) {
    return members.find((m) => m.id === id)?.color || '#5B6B76';
  }

  function toggleParticipant(id: string) {
    const next = new Set(participants);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setParticipants(next);
  }

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !session || !amount || participants.size === 0) return;
    const total = Number(amount);
    const partIds = Array.from(participants);

    let shareValues: number[];
    if (splitMode === 'equal') {
      shareValues = splitEqually(total, partIds.length);
    } else {
      shareValues = partIds.map((id) => Number(customAmounts[id] || 0));
      const sum = shareValues.reduce((s, v) => s + v, 0);
      if (Math.abs(sum - total) > 0.01) {
        alert(`自定义金额总和(${sum.toFixed(2)})必须等于总金额(${total.toFixed(2)})`);
        return;
      }
    }

    setBusy(true);

    if (editingExpenseId) {
      const { error } = await supabase
        .from('group_expenses')
        .update({
          payer_id: payerId || session.user.id,
          amount: total,
          description: description || null,
          category,
          occurred_on: date,
        })
        .eq('id', editingExpenseId);

      if (error) {
        setBusy(false);
        alert('保存失败：' + error.message);
        return;
      }

      await supabase.from('group_expense_shares').delete().eq('expense_id', editingExpenseId);
      const shareRows = partIds.map((id, i) => ({
        expense_id: editingExpenseId,
        user_id: id,
        share_amount: shareValues[i],
      }));
      await supabase.from('group_expense_shares').insert(shareRows);

      setBusy(false);
      resetExpenseForm();
      load();
      return;
    }

    const { data: exp, error } = await supabase
      .from('group_expenses')
      .insert({
        group_id: groupId,
        payer_id: payerId || session.user.id,
        amount: total,
        description: description || null,
        category,
        occurred_on: date,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (error || !exp) {
      setBusy(false);
      alert('保存失败：' + error?.message);
      return;
    }

    const shareRows = partIds.map((id, i) => ({
      expense_id: exp.id,
      user_id: id,
      share_amount: shareValues[i],
    }));
    await supabase.from('group_expense_shares').insert(shareRows);

    setBusy(false);
    resetExpenseForm();
    load();
  }

  function resetExpenseForm() {
    setEditingExpenseId(null);
    setAmount('');
    setDescription('');
    setCustomAmounts({});
    setSplitMode('equal');
    setCategory(categoryOptions[0] || GROUP_CATEGORIES[0]);
    setPayerId(session?.user.id || '');
    setParticipants(new Set(memberIds));
    setDate(today());
  }

  function startEditExpense(exp: GroupExpense) {
    setEditingExpenseId(exp.id);
    setPayerId(exp.payer_id);
    setAmount(String(exp.amount));
    setDescription(exp.description || '');
    setCategory(exp.category || categoryOptions[0] || GROUP_CATEGORIES[0]);
    setDate(exp.occurred_on);
    const expShares = shares.filter((s) => s.expense_id === exp.id);
    setParticipants(new Set(expShares.map((s) => s.user_id)));
    const amounts = expShares.map((s) => Number(s.share_amount));
    const allEqual = amounts.length > 0 && amounts.every((a) => Math.abs(a - amounts[0]) < 0.02);
    if (allEqual) {
      setSplitMode('equal');
      setCustomAmounts({});
    } else {
      setSplitMode('custom');
      const custom: Record<string, string> = {};
      expShares.forEach((s) => (custom[s.user_id] = String(s.share_amount)));
      setCustomAmounts(custom);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function addGroupCategory() {
    if (!groupId || !newCategoryName.trim()) return;
    const name = newCategoryName.trim();
    const { error } = await supabase.from('group_categories').insert({ group_id: groupId, name });
    if (error) {
      alert('添加分类失败：' + error.message);
      return;
    }
    setNewCategoryName('');
    setShowAddCategory(false);
    setCategory(name);
    load();
  }

  function inviteLink() {
    if (!group) return '';
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ? `/${process.env.NEXT_PUBLIC_BASE_PATH}` : '';
    return `${window.location.origin}${basePath}/groups/?join=${group.invite_code}`;
  }

  async function shareInviteLink() {
    const url = inviteLink();
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `加入群组「${group?.name}」`, url });
      } catch {
        // 用户取消分享，忽略
      }
    } else {
      await navigator.clipboard.writeText(url);
      setInviteMsg('邀请链接已复制，发给朋友即可');
    }
  }

  async function inviteByEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteMsg(null);
    const { data: found, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', inviteEmail.trim().toLowerCase())
      .maybeSingle();

    if (error || !found) {
      setInviteBusy(false);
      setInviteMsg('还没找到这个邮箱对应的账号，请先让 TA 注册，或用上面的邀请链接/邀请码分享给 TA');
      return;
    }
    if (members.some((m) => m.id === found.id)) {
      setInviteBusy(false);
      setInviteMsg(`${found.display_name} 已经在这个群组里了`);
      return;
    }
    const { error: joinErr } = await supabase.from('group_members').insert({ group_id: groupId, user_id: found.id });
    setInviteBusy(false);
    if (joinErr) {
      setInviteMsg('添加失败：' + joinErr.message);
      return;
    }
    setInviteEmail('');
    setInviteMsg(`已把 ${found.display_name} 加入群组`);
    load();
  }

  async function recordSettlement(from: string, to: string, amt: number) {
    if (!groupId) return;
    if (!confirm(`确认记一笔结清：${nameOf(from)} 付给 ${nameOf(to)} ${fmtMoney(amt)}？`)) return;
    await supabase.from('group_settlements').insert({
      group_id: groupId,
      from_user: from,
      to_user: to,
      amount: amt,
      occurred_on: today(),
      note: '一键结清',
    });
    load();
  }

  async function removeExpense(id: string) {
    await supabase.from('group_expenses').delete().eq('id', id);
    load();
  }

  async function leaveGroup() {
    if (!groupId || !session) return;
    if (!confirm(`确定要退出群组"${group?.name}"吗？退出后你添加的历史账单仍会保留，但你不会再看到这个群组。`)) return;
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', session.user.id);
    if (error) {
      alert('退出失败：' + error.message);
      return;
    }
    router.replace('/groups');
  }

  if (loading) return null;
  if (!groupId) return <p className="text-ink-soft text-sm">缺少群组 ID。</p>;
  if (!group) return <p className="text-ink-soft text-sm">正在加载群组…</p>;

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="ledger-stamp text-lg font-bold text-ledger break-words">{group.name}</h1>
            <p className="text-xs text-ink-soft mt-1 leading-relaxed break-words">
              邀请码 <span className="font-mono">{group.invite_code}</span>　分享给朋友，让 TA 在"群组"页面输入即可加入。
              成员：{members.map((m) => m.display_name).join('、')}
            </p>
          </div>
          <button
            onClick={leaveGroup}
            className="text-xs text-ink-soft hover:text-expense border border-line rounded px-2 py-1 whitespace-nowrap shrink-0"
          >
            退出群组
          </button>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">邀请成员</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={shareInviteLink}
            className="bg-ledger text-white rounded px-4 py-2 text-sm font-bold hover:bg-ledger-light"
          >
            分享邀请链接
          </button>
          <span className="text-xs text-ink-soft self-center">或者把邀请码 <span className="font-mono">{group.invite_code}</span> 发给朋友</span>
        </div>
        <form onSubmit={inviteByEmail} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="朋友已注册的邮箱，直接把 TA 加进来"
            className="flex-1 min-w-0 border border-line rounded px-3 py-2 bg-white"
          />
          <button
            disabled={inviteBusy}
            className="border border-ledger text-ledger rounded px-4 py-2 font-bold hover:bg-ledger hover:text-white disabled:opacity-50 whitespace-nowrap"
          >
            {inviteBusy ? '处理中…' : '直接添加'}
          </button>
        </form>
        {inviteMsg && <p className="text-xs text-ink-soft mt-2 break-words">{inviteMsg}</p>}
      </div>

      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">当前每人净余额</h2>
        <div className="space-y-1 mb-4">
          {members.map((m) => {
            const b = balances[m.id] ?? 0;
            return (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span style={{ color: m.color }} className="font-bold">
                  {m.display_name}
                </span>
                <span className={`font-mono ${b > 0 ? 'text-income' : b < 0 ? 'text-expense' : 'text-ink-soft'}`}>
                  {b > 0 ? `被欠 ${fmtMoney(b)}` : b < 0 ? `欠 ${fmtMoney(-b)}` : '已结清'}
                </span>
              </div>
            );
          })}
        </div>
        {suggestions.length === 0 ? (
          <p className="text-income text-sm font-bold">💚 所有人已结清</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-soft">建议转账（已算出最少笔数）：</p>
            {suggestions.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 bg-paper rounded px-3 py-2 text-sm">
                <span className="break-words">
                  <span style={{ color: colorOf(s.from) }} className="font-bold">
                    {nameOf(s.from)}
                  </span>{' '}
                  →{' '}
                  <span style={{ color: colorOf(s.to) }} className="font-bold">
                    {nameOf(s.to)}
                  </span>{' '}
                  <span className="font-mono">{fmtMoney(s.amount)}</span>
                </span>
                <button
                  onClick={() => recordSettlement(s.from, s.to, s.amount)}
                  className="text-xs bg-ledger text-white rounded px-2 py-1 hover:bg-ledger-light whitespace-nowrap"
                >
                  标记已转
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">每人总花费</h2>
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span style={{ color: m.color }} className="font-bold">
                {m.display_name}
              </span>
              <span className="font-mono">{fmtMoney(totalSpent[m.id] ?? 0)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-soft mt-2">这里统计的是每个人在这个群组里实际分摊到的总金额，跟"净余额"是两回事。</p>
      </div>

      <form onSubmit={submitExpense} className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="ledger-stamp font-bold text-ledger">{editingExpenseId ? '编辑这笔账单' : '记一笔账单'}</h2>
          {editingExpenseId && (
            <button type="button" onClick={resetExpenseForm} className="text-xs text-ink-soft hover:text-expense">
              取消编辑
            </button>
          )}
        </div>

        <label className="text-sm block">
          谁付的钱
          <select
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 bg-white mt-1"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>

        <input
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="总金额"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border border-line rounded px-3 py-2 bg-white"
        />

        <div>
          <p className="text-sm mb-1">谁需要分摊这笔钱</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => toggleParticipant(m.id)}
                className={`rounded border px-3 py-1.5 text-sm ${
                  participants.has(m.id) ? 'border-ledger bg-ledger/5 font-bold text-ledger' : 'border-line text-ink-soft'
                }`}
              >
                {m.display_name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 text-sm">
          {(['equal', 'custom'] as SplitMode[]).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setSplitMode(m)}
              className={`flex-1 rounded border py-2 font-bold ${
                splitMode === m ? 'border-ledger bg-ledger/5 text-ledger' : 'border-line text-ink-soft'
              }`}
            >
              {m === 'equal' ? '平均分摊' : '自定义每人金额'}
            </button>
          ))}
        </div>

        {splitMode === 'custom' && (
          <div className="space-y-2 bg-paper rounded p-3">
            {Array.from(participants).map((id) => (
              <div key={id} className="flex items-center justify-between gap-2 text-sm">
                <span style={{ color: colorOf(id) }} className="font-bold truncate">
                  {nameOf(id)}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customAmounts[id] || ''}
                  onChange={(e) => setCustomAmounts({ ...customAmounts, [id]: e.target.value })}
                  placeholder="0.00"
                  className="w-24 sm:w-28 border border-line rounded px-2 py-1 bg-white text-right shrink-0"
                />
              </div>
            ))}
            <p className="text-xs text-ink-soft leading-relaxed">
              已填 {fmtMoney(Object.values(customAmounts).reduce((s, v) => s + Number(v || 0), 0))}
              ，需要等于总金额 {amount ? fmtMoney(Number(amount)) : '¥0.00'}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 min-w-0 border border-line rounded px-3 py-2 bg-white"
          >
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-line rounded px-3 py-2 bg-white w-full sm:w-auto"
          />
        </div>

        {showAddCategory ? (
          <div className="flex gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="新分类名称"
              className="flex-1 min-w-0 border border-line rounded px-3 py-2 bg-white"
            />
            <button type="button" onClick={addGroupCategory} className="bg-ledger text-white rounded px-4 font-bold hover:bg-ledger-light whitespace-nowrap">
              添加
            </button>
            <button type="button" onClick={() => setShowAddCategory(false)} className="text-xs text-ink-soft hover:text-expense">
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddCategory(true)}
            className="text-xs text-ledger hover:underline"
          >
            + 添加新分类
          </button>
        )}

        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="备注，如：民宿两晚"
          className="w-full border border-line rounded px-3 py-2 bg-white"
        />

        <button disabled={busy} className="w-full bg-ledger text-white rounded py-2 font-bold hover:bg-ledger-light disabled:opacity-50">
          {busy ? '保存中…' : editingExpenseId ? '保存修改' : '添加账单'}
        </button>
      </form>

      <div className="card divide-y divide-line">
        <h2 className="ledger-stamp font-bold text-ledger p-4 pb-2">我添加的账单</h2>
        {myExpenses.length === 0 && <p className="p-4 text-ink-soft text-sm">你还没有添加过账单。</p>}
        {myExpenses.map((exp) => (
          <ExpenseRow key={exp.id} exp={exp} shares={shares} nameOf={nameOf} colorOf={colorOf} canDelete onEdit={startEditExpense} onDelete={removeExpense} />
        ))}
      </div>

      <div className="card divide-y divide-line">
        <h2 className="ledger-stamp font-bold text-ledger p-4 pb-2">其他人添加的账单</h2>
        {otherExpenses.length === 0 && <p className="p-4 text-ink-soft text-sm">还没有其他人添加的账单。</p>}
        {otherExpenses.map((exp) => (
          <ExpenseRow key={exp.id} exp={exp} shares={shares} nameOf={nameOf} colorOf={colorOf} canDelete={false} onDelete={removeExpense} />
        ))}
      </div>

      {settlements.length > 0 && (
        <div className="card divide-y divide-line">
          <h2 className="ledger-stamp font-bold text-ledger p-4 pb-2">结清记录</h2>
          {settlements.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 text-sm">
              <span>
                <span style={{ color: colorOf(s.from_user) }} className="font-bold">
                  {nameOf(s.from_user)}
                </span>{' '}
                →{' '}
                <span style={{ color: colorOf(s.to_user) }} className="font-bold">
                  {nameOf(s.to_user)}
                </span>
              </span>
              <span className="font-mono">{fmtMoney(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseRow({
  exp,
  shares,
  nameOf,
  colorOf,
  canDelete,
  onEdit,
  onDelete,
}: {
  exp: GroupExpense;
  shares: GroupExpenseShare[];
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
  canDelete: boolean;
  onEdit?: (exp: GroupExpense) => void;
  onDelete: (id: string) => void;
}) {
  const expShares = shares.filter((s) => s.expense_id === exp.id);
  return (
    <div className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm break-words">
          <span style={{ color: colorOf(exp.payer_id) }} className="font-bold">
            {nameOf(exp.payer_id)}
          </span>{' '}
          垫付了 {exp.category} {exp.description && `· ${exp.description}`}
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono font-bold">{fmtMoney(exp.amount)}</span>
          {canDelete && onEdit && (
            <button onClick={() => onEdit(exp)} className="text-ink-soft hover:text-ledger text-xs">
              编辑
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(exp.id)} className="text-ink-soft hover:text-expense text-xs">
              删除
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-ink-soft mt-1 break-words">
        {exp.occurred_on} ·{' '}
        {expShares.map((s) => `${nameOf(s.user_id)} ${fmtMoney(s.share_amount)}`).join('，')}
      </p>
    </div>
  );
}
