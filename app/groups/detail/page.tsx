"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import {
  Group,
  Profile,
  GroupExpense,
  GroupExpenseShare,
  GroupSettlement,
} from "@/lib/types";
import {
  computeGroupBalances,
  simplifyDebts,
  splitEqually,
} from "@/lib/groupBalance";
import { fmtMoney, today } from "@/lib/date";
const GROUP_CATEGORIES = [
  "餐饮",
  "交通",
  "住宿",
  "娱乐",
  "购物",
  "门票",
  "其他",
];

export default function GroupDetailPage() {
  return (
    <Suspense fallback={null}>
      <GroupDetailInner />
    </Suspense>
  );
}

type SplitMode = "equal" | "custom";

function GroupDetailInner() {
  const params = useSearchParams();
  const groupId = params.get("id");
  const { session, loading } = useAuth();
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [shares, setShares] = useState<GroupExpenseShare[]>([]);
  const [settlements, setSettlements] = useState<GroupSettlement[]>([]);
  const [busy, setBusy] = useState(false);

  const [payerId, setPayerId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(GROUP_CATEGORIES[0]);
  const [date, setDate] = useState(today());
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(
    {},
  );

  const load = useCallback(async () => {
    if (!groupId || !session) return;
    const [{ data: g }, { data: mems }, { data: exps }, { data: st }] =
      await Promise.all([
        supabase.from("groups").select("*").eq("id", groupId).single(),
        supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId),
        supabase
          .from("group_expenses")
          .select("*")
          .eq("group_id", groupId)
          .order("occurred_on", { ascending: false }),
        supabase
          .from("group_settlements")
          .select("*")
          .eq("group_id", groupId)
          .order("occurred_on", { ascending: false }),
      ]);
    setGroup((g as Group) || null);
    const memberIds = (mems || []).map((m: any) => m.user_id);
    if (memberIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("*")
        .in("id", memberIds);
      setMembers((profs as Profile[]) || []);
      setPayerId((prev) => prev || session.user.id);
      setParticipants((prev) => (prev.size === 0 ? new Set(memberIds) : prev));
    }
    const expenseList = (exps as GroupExpense[]) || [];
    setExpenses(expenseList);
    setSettlements((st as GroupSettlement[]) || []);
    if (expenseList.length > 0) {
      const { data: shareRows } = await supabase
        .from("group_expense_shares")
        .select("*")
        .in(
          "expense_id",
          expenseList.map((e) => e.id),
        );
      setShares((shareRows as GroupExpenseShare[]) || []);
    } else {
      setShares([]);
    }
  }, [groupId, session]);

  useEffect(() => {
    load();
  }, [load]);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const balances = useMemo(
    () => computeGroupBalances(memberIds, expenses, shares, settlements),
    [memberIds, expenses, shares, settlements],
  );
  const suggestions = useMemo(() => simplifyDebts(balances), [balances]);
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
    [expenses, session],
  );
  const otherExpenses = useMemo(
    () => expenses.filter((e) => e.created_by !== session?.user.id),
    [expenses, session],
  );

  function nameOf(id: string) {
    return members.find((m) => m.id === id)?.display_name || "未知";
  }
  function colorOf(id: string) {
    return members.find((m) => m.id === id)?.color || "#5B6B76";
  }

  function toggleParticipant(id: string) {
    const next = new Set(participants);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setParticipants(next);
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !session || !amount || participants.size === 0) return;
    const total = Number(amount);
    const partIds = Array.from(participants);

    let shareValues: number[];
    if (splitMode === "equal") {
      shareValues = splitEqually(total, partIds.length);
    } else {
      shareValues = partIds.map((id) => Number(customAmounts[id] || 0));
      const sum = shareValues.reduce((s, v) => s + v, 0);
      if (Math.abs(sum - total) > 0.01) {
        alert(
          `自定义金额总和(${sum.toFixed(2)})必须等于总金额(${total.toFixed(2)})`,
        );
        return;
      }
    }

    setBusy(true);
    const { data: exp, error } = await supabase
      .from("group_expenses")
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
      alert("保存失败：" + error?.message);
      return;
    }

    const shareRows = partIds.map((id, i) => ({
      expense_id: exp.id,
      user_id: id,
      share_amount: shareValues[i],
    }));
    await supabase.from("group_expense_shares").insert(shareRows);

    setBusy(false);
    setAmount("");
    setDescription("");
    setCustomAmounts({});
    load();
  }

  async function recordSettlement(from: string, to: string, amt: number) {
    if (!groupId) return;
    if (
      !confirm(
        `确认记一笔结清：${nameOf(from)} 付给 ${nameOf(to)} ${fmtMoney(amt)}？`,
      )
    )
      return;
    await supabase.from("group_settlements").insert({
      group_id: groupId,
      from_user: from,
      to_user: to,
      amount: amt,
      occurred_on: today(),
      note: "一键结清",
    });
    load();
  }

  async function removeExpense(id: string) {
    await supabase.from("group_expenses").delete().eq("id", id);
    load();
  }

  async function leaveGroup() {
    if (!groupId || !session) return;
    if (
      !confirm(
        `确定要退出群组"${group?.name}"吗？退出后你添加的历史账单仍会保留，但你不会再看到这个群组。`,
      )
    )
      return;
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", session.user.id);
    if (error) {
      alert("退出失败：" + error.message);
      return;
    }
    router.replace("/groups");
  }

  if (loading) return null;
  if (!groupId) return <p className="text-ink-soft text-sm">缺少群组 ID。</p>;
  if (!group) return <p className="text-ink-soft text-sm">正在加载群组…</p>;

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="ledger-stamp text-lg font-bold text-ledger break-words">
              {group.name}
            </h1>
            <p className="text-xs text-ink-soft mt-1 leading-relaxed break-words">
              邀请码 <span className="font-mono">{group.invite_code}</span>
              　分享给朋友，让 TA 在"群组"页面输入即可加入。 成员：
              {members.map((m) => m.display_name).join("、")}
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
        <h2 className="ledger-stamp font-bold text-ledger mb-3">
          当前每人净余额
        </h2>
        <div className="space-y-1 mb-4">
          {members.map((m) => {
            const b = balances[m.id] ?? 0;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between text-sm"
              >
                <span style={{ color: m.color }} className="font-bold">
                  {m.display_name}
                </span>
                <span
                  className={`font-mono ${b > 0 ? "text-income" : b < 0 ? "text-expense" : "text-ink-soft"}`}
                >
                  {b > 0
                    ? `被欠 ${fmtMoney(b)}`
                    : b < 0
                      ? `欠 ${fmtMoney(-b)}`
                      : "已结清"}
                </span>
              </div>
            );
          })}
        </div>
        {suggestions.length === 0 ? (
          <p className="text-income text-sm font-bold">💚 所有人已结清</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-soft">
              建议转账（已算出最少笔数）：
            </p>
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 bg-paper rounded px-3 py-2 text-sm"
              >
                <span className="break-words">
                  <span
                    style={{ color: colorOf(s.from) }}
                    className="font-bold"
                  >
                    {nameOf(s.from)}
                  </span>{" "}
                  →{" "}
                  <span style={{ color: colorOf(s.to) }} className="font-bold">
                    {nameOf(s.to)}
                  </span>{" "}
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
            <div
              key={m.id}
              className="flex items-center justify-between text-sm"
            >
              <span style={{ color: m.color }} className="font-bold">
                {m.display_name}
              </span>
              <span className="font-mono">
                {fmtMoney(totalSpent[m.id] ?? 0)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-soft mt-2">
          这里统计的是每个人在这个群组里实际分摊到的总金额，跟"净余额"是两回事。
        </p>
      </div>

      <form onSubmit={addExpense} className="card p-4 space-y-3">
        <h2 className="ledger-stamp font-bold text-ledger">记一笔账单</h2>

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
                  participants.has(m.id)
                    ? "border-ledger bg-ledger/5 font-bold text-ledger"
                    : "border-line text-ink-soft"
                }`}
              >
                {m.display_name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 text-sm">
          {(["equal", "custom"] as SplitMode[]).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setSplitMode(m)}
              className={`flex-1 rounded border py-2 font-bold ${
                splitMode === m
                  ? "border-ledger bg-ledger/5 text-ledger"
                  : "border-line text-ink-soft"
              }`}
            >
              {m === "equal" ? "平均分摊" : "自定义每人金额"}
            </button>
          ))}
        </div>

        {splitMode === "custom" && (
          <div className="space-y-2 bg-paper rounded p-3">
            {Array.from(participants).map((id) => (
              <div
                key={id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span
                  style={{ color: colorOf(id) }}
                  className="font-bold truncate"
                >
                  {nameOf(id)}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customAmounts[id] || ""}
                  onChange={(e) =>
                    setCustomAmounts({ ...customAmounts, [id]: e.target.value })
                  }
                  placeholder="0.00"
                  className="w-24 sm:w-28 border border-line rounded px-2 py-1 bg-white text-right shrink-0"
                />
              </div>
            ))}
            <p className="text-xs text-ink-soft leading-relaxed">
              已填{" "}
              {fmtMoney(
                Object.values(customAmounts).reduce(
                  (s, v) => s + Number(v || 0),
                  0,
                ),
              )}
              ，需要等于总金额 {amount ? fmtMoney(Number(amount)) : "¥0.00"}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 min-w-0 border border-line rounded px-3 py-2 bg-white"
          >
            {GROUP_CATEGORIES.map((c) => (
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
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="备注，如：民宿两晚"
          className="w-full border border-line rounded px-3 py-2 bg-white"
        />

        <button
          disabled={busy}
          className="w-full bg-ledger text-white rounded py-2 font-bold hover:bg-ledger-light disabled:opacity-50"
        >
          {busy ? "保存中…" : "添加账单"}
        </button>
      </form>

      <div className="card divide-y divide-line">
        <h2 className="ledger-stamp font-bold text-ledger p-4 pb-2">
          我添加的账单
        </h2>
        {myExpenses.length === 0 && (
          <p className="p-4 text-ink-soft text-sm">你还没有添加过账单。</p>
        )}
        {myExpenses.map((exp) => (
          <ExpenseRow
            key={exp.id}
            exp={exp}
            shares={shares}
            nameOf={nameOf}
            colorOf={colorOf}
            canDelete
            onDelete={removeExpense}
          />
        ))}
      </div>

      <div className="card divide-y divide-line">
        <h2 className="ledger-stamp font-bold text-ledger p-4 pb-2">
          其他人添加的账单
        </h2>
        {otherExpenses.length === 0 && (
          <p className="p-4 text-ink-soft text-sm">还没有其他人添加的账单。</p>
        )}
        {otherExpenses.map((exp) => (
          <ExpenseRow
            key={exp.id}
            exp={exp}
            shares={shares}
            nameOf={nameOf}
            colorOf={colorOf}
            canDelete={false}
            onDelete={removeExpense}
          />
        ))}
      </div>

      {settlements.length > 0 && (
        <div className="card divide-y divide-line">
          <h2 className="ledger-stamp font-bold text-ledger p-4 pb-2">
            结清记录
          </h2>
          {settlements.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 text-sm"
            >
              <span>
                <span
                  style={{ color: colorOf(s.from_user) }}
                  className="font-bold"
                >
                  {nameOf(s.from_user)}
                </span>{" "}
                →{" "}
                <span
                  style={{ color: colorOf(s.to_user) }}
                  className="font-bold"
                >
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
  onDelete,
}: {
  exp: GroupExpense;
  shares: GroupExpenseShare[];
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  const expShares = shares.filter((s) => s.expense_id === exp.id);
  return (
    <div className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm break-words">
          <span style={{ color: colorOf(exp.payer_id) }} className="font-bold">
            {nameOf(exp.payer_id)}
          </span>{" "}
          垫付了 {exp.category} {exp.description && `· ${exp.description}`}
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono font-bold">{fmtMoney(exp.amount)}</span>
          {canDelete && (
            <button
              onClick={() => onDelete(exp.id)}
              className="text-ink-soft hover:text-expense text-xs"
            >
              删除
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-ink-soft mt-1 break-words">
        {exp.occurred_on} ·{" "}
        {expShares
          .map((s) => `${nameOf(s.user_id)} ${fmtMoney(s.share_amount)}`)
          .join("，")}
      </p>
    </div>
  );
}
