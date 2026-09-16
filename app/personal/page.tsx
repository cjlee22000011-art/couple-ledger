"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Category, PersonalTransaction, TxType } from "@/lib/types";
import { fmtMoney, today } from "@/lib/date";

export default function PersonalPage() {
  const { session, loading } = useAuth();
  const [txs, setTxs] = useState<PersonalTransaction[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase
        .from("personal_transactions")
        .select("*")
        .eq("user_id", session.user.id)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("categories")
        .select("*")
        .eq("user_id", session.user.id)
        .order("name"),
    ]);
    setTxs((t as PersonalTransaction[]) || []);
    setCats((c as Category[]) || []);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;

  const catsForType = cats.filter((c) => c.type === type);

  async function submitTx(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !amount) return;
    setBusy(true);
    const payload = {
      type,
      amount: Number(amount),
      category_id: categoryId || null,
      occurred_on: date,
      note: note || null,
    };
    const { error } = editingId
      ? await supabase
          .from("personal_transactions")
          .update(payload)
          .eq("id", editingId)
      : await supabase
          .from("personal_transactions")
          .insert({ ...payload, user_id: session.user.id });
    setBusy(false);
    if (!error) {
      resetForm();
      load();
    }
  }

  function resetForm() {
    setEditingId(null);
    setAmount("");
    setNote("");
    setCategoryId("");
    setDate(today());
    setType("expense");
  }

  function startEdit(t: PersonalTransaction) {
    setEditingId(t.id);
    setType(t.type);
    setAmount(String(t.amount));
    setCategoryId(t.category_id || "");
    setDate(t.occurred_on);
    setNote(t.note || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeTx(id: string) {
    if (!confirm("确定要删除这条记录吗？删除后无法恢复。")) return;
    await supabase.from("personal_transactions").delete().eq("id", id);
    if (editingId === id) resetForm();
    load();
  }

  const monthIncome = sumByType(txs, "income");
  const monthExpense = sumByType(txs, "expense");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs text-ink-soft">近期收入</p>
          <p className="text-2xl font-bold text-income">
            {fmtMoney(monthIncome)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-soft">近期支出</p>
          <p className="text-2xl font-bold text-expense">
            {fmtMoney(monthExpense)}
          </p>
        </div>
      </div>

      <form onSubmit={submitTx} className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="ledger-stamp font-bold text-ledger">
            {editingId ? "编辑这笔记录" : "记一笔"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-ink-soft hover:text-expense"
            >
              取消编辑
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {(["expense", "income"] as TxType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => {
                setType(t);
                setCategoryId("");
              }}
              className={`flex-1 rounded py-2 text-sm font-bold border ${
                type === t
                  ? t === "income"
                    ? "bg-income text-white border-income"
                    : "bg-expense text-white border-expense"
                  : "border-line text-ink-soft"
              }`}
            >
              {t === "income" ? "收入" : "支出"}
            </button>
          ))}
        </div>
        <input
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="金额"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border border-line rounded px-3 py-2 bg-white"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full border border-line rounded px-3 py-2 bg-white"
        >
          <option value="">未分类</option>
          {catsForType.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-line rounded px-3 py-2 bg-white w-full sm:w-auto"
          />
          <input
            type="text"
            placeholder="备注（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 min-w-0 border border-line rounded px-3 py-2 bg-white"
          />
        </div>
        <button
          disabled={busy}
          className="w-full bg-ledger text-white rounded py-2 font-bold hover:bg-ledger-light disabled:opacity-50"
        >
          {busy ? "保存中…" : editingId ? "保存修改" : "添加记录"}
        </button>
      </form>

      <div className="card divide-y divide-line">
        {txs.length === 0 && (
          <p className="p-4 text-ink-soft text-sm">
            还没有记录，从上面开始记第一笔吧。
          </p>
        )}
        {txs.map((t) => {
          const cat = cats.find((c) => c.id === t.category_id);
          return (
            <div
              key={t.id}
              className="flex flex-wrap items-start justify-between gap-2 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm break-words">
                  {cat ? `${cat.icon} ${cat.name}` : "未分类"}{" "}
                  {t.note && <span className="text-ink-soft">· {t.note}</span>}
                </p>
                <p className="text-xs text-ink-soft">{t.occurred_on}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`font-mono font-bold ${t.type === "income" ? "text-income" : "text-expense"}`}
                >
                  {t.type === "income" ? "+" : "-"}
                  {fmtMoney(t.amount)}
                </span>
                <button
                  onClick={() => startEdit(t)}
                  className="text-ink-soft hover:text-ledger text-xs"
                >
                  编辑
                </button>
                <button
                  onClick={() => removeTx(t.id)}
                  className="text-ink-soft hover:text-expense text-xs"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sumByType(txs: PersonalTransaction[], type: TxType) {
  return txs
    .filter((t) => t.type === type)
    .reduce((s, t) => s + Number(t.amount), 0);
}
