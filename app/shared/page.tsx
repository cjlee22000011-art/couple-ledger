'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWhoAmI } from '@/lib/WhoAmIContext';
import WhoAmIPicker from '@/components/WhoAmIPicker';
import { SharedTransaction } from '@/lib/types';
import { computeBalance, buildSettlementPayload } from '@/lib/balance';
import { fmtMoney, today } from '@/lib/date';

type SplitType = 'equal' | 'i_pay_all' | 'partner_pays_all' | 'custom';

export default function SharedPage() {
  const { me, partner, profiles, loading } = useWhoAmI();

  if (loading) return null;
  if (!me) return <WhoAmIPicker />;
  if (!partner) {
    return (
      <div className="max-w-md mx-auto card p-6 text-sm text-ink-soft leading-relaxed">
        <h2 className="ledger-stamp font-bold text-ledger mb-2">还差一个人</h2>
        <p>
          往来账需要两个人。请去 Supabase 的 <code>profiles</code> 表确认里面有两条记录
          （建表脚本会自动插入"我"和"对方"），或去设置页检查名字是否正确。
        </p>
      </div>
    );
  }

  return <SharedLedger meId={me.id} meName={me.display_name} partnerId={partner.id} partnerName={partner.display_name} />;
}

function SharedLedger({
  meId,
  meName,
  partnerId,
  partnerName,
}: {
  meId: string;
  meName: string;
  partnerId: string;
  partnerName: string;
}) {
  const [txs, setTxs] = useState<SharedTransaction[]>([]);
  const [amount, setAmount] = useState('');
  const [split, setSplit] = useState<SplitType>('equal');
  const [customShare, setCustomShare] = useState('50');
  const [category, setCategory] = useState('公共支出');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shared_transactions')
      .select('*')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);
    setTxs((data as SharedTransaction[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const balance = computeBalance(txs, meId, partnerId);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    setBusy(true);
    const payerShare =
      split === 'equal' ? 0.5 : split === 'i_pay_all' ? 1 : split === 'partner_pays_all' ? 0 : Number(customShare) / 100;
    const { error } = await supabase.from('shared_transactions').insert({
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
    const payload = buildSettlementPayload(balance);
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
