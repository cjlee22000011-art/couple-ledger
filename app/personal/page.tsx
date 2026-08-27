'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWhoAmI } from '@/lib/WhoAmIContext';
import WhoAmIPicker from '@/components/WhoAmIPicker';
import { Category, PersonalTransaction, TxType } from '@/lib/types';
import { fmtMoney, today } from '@/lib/date';

export default function PersonalPage() {
  const { me, loading } = useWhoAmI();
  const [txs, setTxs] = useState<PersonalTransaction[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase
        .from('personal_transactions')
        .select('*')
        .eq('owner_id', me.id)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('categories').select('*').eq('owner_id', me.id).order('name'),
    ]);
    setTxs((t as PersonalTransaction[]) || []);
    setCats((c as Category[]) || []);
  }, [me]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  if (!me) return <WhoAmIPicker />;

  const catsForType = cats.filter((c) => c.type === type);

  async function addTx(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !amount) return;
    setBusy(true);
    const { error } = await supabase.from('personal_transactions').insert({
      owner_id: me.id,
      type,
      amount: Number(amount),
      category_id: categoryId || null,
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

  async function removeTx(id: string) {
    await supabase.from('personal_transactions').delete().eq('id', id);
    load();
  }

  const monthIncome = sumByType(txs, 'income');
  const monthExpense = sumByType(txs, 'expense');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs text-ink-soft">近期收入</p>
          <p className="text-2xl font-bold text-income">{fmtMoney(monthIncome)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-soft">近期支出</p>
          <p className="text-2xl font-bold text-expense">{fmtMoney(monthExpense)}</p>
        </div>
      </div>

      <form onSubmit={addTx} className="card p-4 space-y-3">
        <h2 className="ledger-stamp font-bold text-ledger">记一笔</h2>
        <div className="flex gap-2">
          {(['expense', 'income'] as TxType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => {
                setType(t);
                setCategoryId('');
              }}
              className={`flex-1 rounded py-2 text-sm font-bold border ${
                type === t
                  ? t === 'income'
                    ? 'bg-income text-white border-income'
                    : 'bg-expense text-white border-expense'
                  : 'border-line text-ink-soft'
              }`}
            >
              {t === 'income' ? '收入' : '支出'}
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
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 border border-line rounded px-3 py-2 bg-white"
          />
          <input
            type="text"
            placeholder="备注（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 border border-line rounded px-3 py-2 bg-white"
          />
        </div>
        <button disabled={busy} className="w-full bg-ledger text-white rounded py-2 font-bold hover:bg-ledger-light disabled:opacity-50">
          {busy ? '保存中…' : '添加记录'}
        </button>
      </form>

      <div className="card divide-y divide-line">
        {txs.length === 0 && <p className="p-4 text-ink-soft text-sm">还没有记录，从上面开始记第一笔吧。</p>}
        {txs.map((t) => {
          const cat = cats.find((c) => c.id === t.category_id);
          return (
            <div key={t.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm">
                  {cat ? `${cat.icon} ${cat.name}` : '未分类'}{' '}
                  {t.note && <span className="text-ink-soft">· {t.note}</span>}
                </p>
                <p className="text-xs text-ink-soft">{t.occurred_on}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-mono font-bold ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                  {t.type === 'income' ? '+' : '-'}
                  {fmtMoney(t.amount)}
                </span>
                <button onClick={() => removeTx(t.id)} className="text-ink-soft hover:text-expense text-xs">
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
  return txs.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount), 0);
}
