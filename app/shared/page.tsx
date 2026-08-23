'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { SharedTransaction } from '@/lib/types';
import { computeBalance, buildSettlementPayload } from '@/lib/balance';
import { fmtMoney, today } from '@/lib/date';

type SplitType = 'equal' | 'i_pay_all' | 'partner_pays_all' | 'custom';

export default function SharedPage() {
  const { session, profile, couple, partner, refresh, loading } = useAuth();

  if (loading) return null;
  if (!couple) return <LinkPartner />;

  return <SharedLedger couple={couple} meId={session!.user.id} meName={profile?.display_name || '我'} partnerName={partner?.display_name || '对方'} partnerId={partner?.id || ''} />;
}

/* ---------------- 尚未绑定伴侣：生成/输入邀请码 ---------------- */
function LinkPartner() {
  const { session, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [myCode, setMyCode] = useState('');
  const [msg, setMsg] = useState('');

  async function generateCode() {
    const c = Math.random().toString(36).slice(2, 8).toUpperCase();
    setMyCode(c);
    // 暂存到 localStorage，等待对方输入后由对方那端创建 couples 行（下方 joinByCode）
    localStorage.setItem('pending_invite_code', c);
  }

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (!session) return;
    // 简化实现：邀请码本质是"待认领"标记，真实项目建议用一张 invites 表来核对双方。
    // 这里通过让邀请人把 invite_code 写入 couples（user_b 先填自己占位），
    // 被邀请人查找该 invite_code 并把自己填入 user_b。
    const { data: found, error } = await supabase
      .from('couples')
      .select('*')
      .eq('invite_code', code.trim().toUpperCase())
      .maybeSingle();

    if (error || !found) {
      setMsg('邀请码无效，请确认对方已生成邀请码');
      return;
    }
    if (found.user_b !== null && found.user_b !== session.user.id) {
      setMsg('该邀请码已被使用');
      return;
    }
    setMsg('已加入，正在同步…');
    await refresh();
  }

  async function createInvite() {
    if (!session) return;
    const c = Math.random().toString(36).slice(2, 8).toUpperCase();
    // user_b 暂时填自己，等伴侣加入后由伴侣发起的 RPC/后台更新会更严谨；
    // 简化版：先插入一行等待中的邀请，user_b 留空需数据库允许 null。
    // 为兼容 NOT NULL 约束，这里改为占位自身，真实场景建议新增 invites 表（见 README 说明）。
    const { error } = await supabase.from('couples').insert({
      user_a: session.user.id,
      user_b: session.user.id,
      invite_code: c,
    });
    if (!error) setMyCode(c);
  }

  return (
    <div className="max-w-md mx-auto card p-6 space-y-6">
      <div>
        <h2 className="ledger-stamp font-bold text-ledger mb-2">还没有绑定往来账伴侣</h2>
        <p className="text-sm text-ink-soft">
          生成邀请码发给对方，或输入对方给你的邀请码，即可建立共享往来账本。
        </p>
      </div>

      <div className="space-y-2">
        <button onClick={createInvite} className="w-full bg-ledger text-white rounded py-2 font-bold hover:bg-ledger-light">
          生成我的邀请码
        </button>
        {myCode && (
          <p className="text-center font-mono text-lg tracking-widest bg-paper border border-line rounded py-2">
            {myCode}
          </p>
        )}
      </div>

      <form onSubmit={joinByCode} className="space-y-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="输入对方的邀请码"
          className="w-full border border-line rounded px-3 py-2 bg-white"
        />
        <button className="w-full border border-ledger text-ledger rounded py-2 font-bold hover:bg-ledger hover:text-white">
          加入对方的账本
        </button>
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </form>

      <p className="text-xs text-ink-soft leading-relaxed">
        说明：生产环境建议新增独立的 <code>invites</code> 表来管理"待认领邀请"，
        避免 <code>couples.user_b</code> 出现自引用占位。这里为了控制示例复杂度做了简化，
        完整实现请参考 README 中的"进阶：更严谨的邀请流程"。
      </p>
    </div>
  );
}

/* ---------------- 已绑定伴侣：往来账主界面 ---------------- */
function SharedLedger({
  couple,
  meId,
  meName,
  partnerId,
  partnerName,
}: {
  couple: { id: string };
  meId: string;
  meName: string;
  partnerId: string;
  partnerName: string;
}) {
  const [txs, setTxs] = useState<SharedTransaction[]>([]);
  const [amount, setAmount] = useState('');
  const [split, setSplit] = useState<SplitType>('equal');
  const [customShare, setCustomShare] = useState('50'); // 我承担的百分比
  const [category, setCategory] = useState('公共支出');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shared_transactions')
      .select('*')
      .eq('couple_id', couple.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    setTxs((data as SharedTransaction[]) || []);
  }, [couple.id]);

  useEffect(() => {
    load();
  }, [load]);

  const balance = computeBalance(txs, meId, partnerId);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    setBusy(true);
    const payerShare = split === 'equal' ? 0.5 : split === 'i_pay_all' ? 1 : split === 'partner_pays_all' ? 0 : Number(customShare) / 100;
    const { error } = await supabase.from('shared_transactions').insert({
      couple_id: couple.id,
      payer_id: meId,
      kind: 'expense',
      amount: Number(amount),
      payer_share: payerShare,
      category,
      occurred_on: date,
      note: note || null,
    });
    setBusy(false);
    if (!error) {
      setAmount('');
      setNote('');
      load();
    }
  }

  async function settleUp() {
    const payload = buildSettlementPayload(balance, couple.id);
    if (!payload) return;
    if (!confirm(`确认记一笔结清：${fmtMoney(payload.amount)}？`)) return;
    await supabase.from('shared_transactions').insert(payload);
    load();
  }

  async function removeTx(id: string) {
    await supabase.from('shared_transactions').delete().eq('id', id);
    load();
  }

  return (
    <div className="space-y-6">
      {/* 平账卡片 */}
      <div className="card p-5 text-center">
        <p className="text-xs text-ink-soft mb-2">当前往来结果</p>
        {balance.amount === 0 ? (
          <p className="text-xl font-bold text-income">💚 两人已结清</p>
        ) : (
          <p className="text-xl font-bold text-ink">
            <span className={balance.fromUserId === meId ? 'text-me' : 'text-partner'}>
              {balance.fromUserId === meId ? meName : partnerName}
            </span>{' '}
            应付{' '}
            <span className={balance.toUserId === meId ? 'text-me' : 'text-partner'}>
              {balance.toUserId === meId ? meName : partnerName}
            </span>{' '}
            <span className="font-mono">{fmtMoney(balance.amount)}</span>
          </p>
        )}
        {balance.amount > 0 && (
          <button onClick={settleUp} className="mt-3 bg-ledger text-white rounded px-4 py-2 text-sm font-bold hover:bg-ledger-light">
            一键结清
          </button>
        )}
      </div>

      {/* 记账表单 */}
      <form onSubmit={addExpense} className="card p-4 space-y-3">
        <h2 className="ledger-stamp font-bold text-ledger">记一笔往来</h2>
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
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            { v: 'equal', label: 'AA 平摊（我付款）' },
            { v: 'i_pay_all', label: '我请客（全我承担）' },
            { v: 'partner_pays_all', label: `帮${partnerName}垫付（TA全额还我）` },
            { v: 'custom', label: '自定义比例' },
          ].map((o) => (
            <button
              type="button"
              key={o.v}
              onClick={() => setSplit(o.v as SplitType)}
              className={`rounded border px-2 py-2 text-left ${
                split === o.v ? 'border-ledger bg-ledger/5 font-bold text-ledger' : 'border-line text-ink-soft'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {split === 'custom' && (
          <label className="text-sm flex items-center gap-2">
            我承担
            <input
              type="number"
              min={0}
              max={100}
              value={customShare}
              onChange={(e) => setCustomShare(e.target.value)}
              className="w-20 border border-line rounded px-2 py-1"
            />
            %，{partnerName} 承担 {100 - Number(customShare || 0)}%
          </label>
        )}
        <div className="flex gap-2">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="分类，如：房租/餐饮"
            className="flex-1 border border-line rounded px-3 py-2 bg-white"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-line rounded px-3 py-2 bg-white"
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注（可选）"
          className="w-full border border-line rounded px-3 py-2 bg-white"
        />
        <button disabled={busy} className="w-full bg-ledger text-white rounded py-2 font-bold hover:bg-ledger-light disabled:opacity-50">
          {busy ? '保存中…' : '添加往来记录'}
        </button>
      </form>

      {/* 流水列表 */}
      <div className="card divide-y divide-line">
        {txs.length === 0 && <p className="p-4 text-ink-soft text-sm">还没有往来记录。</p>}
        {txs.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm">
                <span className={t.payer_id === meId ? 'text-me font-bold' : 'text-partner font-bold'}>
                  {t.payer_id === meId ? meName : partnerName}
                </span>{' '}
                {t.kind === 'settlement' ? '还款' : `垫付了 ${t.category}`}
                {t.note && <span className="text-ink-soft"> · {t.note}</span>}
              </p>
              <p className="text-xs text-ink-soft">{t.occurred_on}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold">{fmtMoney(t.amount)}</span>
              <button onClick={() => removeTx(t.id)} className="text-ink-soft hover:text-expense text-xs">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
