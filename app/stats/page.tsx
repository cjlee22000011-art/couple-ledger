'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';
import { useWhoAmI } from '@/lib/WhoAmIContext';
import WhoAmIPicker from '@/components/WhoAmIPicker';
import { PersonalTransaction, Category } from '@/lib/types';
import { monthKey, yearKey, fmtMoney } from '@/lib/date';

const PIE_COLORS = ['#B3562B', '#3F6FA6', '#2F7A4F', '#8A6B3A', '#6E5A9C', '#C08A2B', '#4B7A8C'];

export default function StatsPage() {
  const { me, loading } = useWhoAmI();
  const [txs, setTxs] = useState<PersonalTransaction[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [range, setRange] = useState<'month' | 'year'>('month');

  const load = useCallback(async () => {
    if (!me) return;
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('personal_transactions').select('*').eq('owner_id', me.id),
      supabase.from('categories').select('*').eq('owner_id', me.id),
    ]);
    setTxs((t as PersonalTransaction[]) || []);
    setCats((c as Category[]) || []);
  }, [me]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const keyFn = range === 'month' ? monthKey : yearKey;
    const map = new Map<string, { period: string; income: number; expense: number }>();
    for (const t of txs) {
      const k = keyFn(t.occurred_on);
      if (!map.has(k)) map.set(k, { period: k, income: 0, expense: 0 });
      const row = map.get(k)!;
      if (t.type === 'income') row.income += Number(t.amount);
      else row.expense += Number(t.amount);
    }
    return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
  }, [txs, range]);

  const currentPeriod = range === 'month' ? monthKey(new Date().toISOString()) : yearKey(new Date().toISOString());
  const byCategory = useMemo(() => {
    const keyFn = range === 'month' ? monthKey : yearKey;
    const map = new Map<string, number>();
    for (const t of txs) {
      if (t.type !== 'expense') continue;
      if (keyFn(t.occurred_on) !== currentPeriod) continue;
      const cat = cats.find((c) => c.id === t.category_id);
      const name = cat ? `${cat.icon} ${cat.name}` : '未分类';
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [txs, cats, range, currentPeriod]);

  if (loading) return null;
  if (!me) return <WhoAmIPicker />;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['month', 'year'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded px-4 py-1.5 text-sm font-bold border ${
              range === r ? 'bg-ledger text-white border-ledger' : 'border-line text-ink-soft'
            }`}
          >
            {r === 'month' ? '按月' : '按年'}
          </button>
        ))}
      </div>

      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">收支趋势（近 12 期）</h2>
        {grouped.length === 0 ? (
          <p className="text-ink-soft text-sm">暂无数据</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={grouped}>
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Legend />
              <Bar dataKey="income" name="收入" fill="#2F7A4F" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="支出" fill="#B3562B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">
          本{range === 'month' ? '月' : '年'}支出分类占比
        </h2>
        {byCategory.length === 0 ? (
          <p className="text-ink-soft text-sm">暂无数据</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={100} label={(d) => d.name}>
                {byCategory.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
