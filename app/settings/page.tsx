'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWhoAmI } from '@/lib/WhoAmIContext';
import WhoAmIPicker from '@/components/WhoAmIPicker';
import { Category, TxType } from '@/lib/types';

export default function SettingsPage() {
  const { me, profiles, refresh, loading } = useWhoAmI();
  const [cats, setCats] = useState<Category[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TxType>('expense');
  const [newCatIcon, setNewCatIcon] = useState('🏷️');

  const load = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase.from('categories').select('*').eq('owner_id', me.id).order('type');
    setCats((data as Category[]) || []);
  }, [me]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const init: Record<string, string> = {};
    profiles.forEach((p) => (init[p.id] = p.display_name));
    setNames(init);
  }, [profiles]);

  if (loading) return null;
  if (!me) return <WhoAmIPicker />;

  async function saveName(id: string) {
    await supabase.from('profiles').update({ display_name: names[id] }).eq('id', id);
    refresh();
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !newCatName.trim()) return;
    const { error } = await supabase.from('categories').insert({
      owner_id: me.id,
      name: newCatName.trim(),
      type: newCatType,
      icon: newCatIcon || '🏷️',
    });
    if (!error) {
      setNewCatName('');
      load();
    }
  }

  async function removeCategory(id: string) {
    await supabase.from('categories').delete().eq('id', id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">两人的名字</h2>
        <div className="space-y-2">
          {profiles.map((p) => (
            <div key={p.id} className="flex gap-2">
              <input
                value={names[p.id] ?? ''}
                onChange={(e) => setNames({ ...names, [p.id]: e.target.value })}
                className="flex-1 border border-line rounded px-3 py-2 bg-white"
              />
              <button
                onClick={() => saveName(p.id)}
                className="bg-ledger text-white rounded px-4 font-bold hover:bg-ledger-light"
              >
                保存
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-soft mt-2">改名后，往来账里对应的历史记录也会自动显示新名字。</p>
      </div>

      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">
          {names[me.id] || me.display_name} 的自定义分类
        </h2>
        <form onSubmit={addCategory} className="flex gap-2 mb-4">
          <input
            value={newCatIcon}
            onChange={(e) => setNewCatIcon(e.target.value)}
            className="w-14 border border-line rounded px-2 py-2 text-center bg-white"
            maxLength={2}
          />
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="分类名称"
            className="flex-1 border border-line rounded px-3 py-2 bg-white"
          />
          <select
            value={newCatType}
            onChange={(e) => setNewCatType(e.target.value as TxType)}
            className="border border-line rounded px-2 py-2 bg-white"
          >
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
          <button className="bg-ledger text-white rounded px-4 font-bold hover:bg-ledger-light">添加</button>
        </form>

        <div className="space-y-1">
          {cats.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b border-line py-2 text-sm">
              <span>
                {c.icon} {c.name} <span className="text-ink-soft">({c.type === 'income' ? '收入' : '支出'})</span>
              </span>
              <button onClick={() => removeCategory(c.id)} className="text-ink-soft hover:text-expense text-xs">
                删除
              </button>
            </div>
          ))}
          {cats.length === 0 && <p className="text-ink-soft text-sm">还没有自定义分类，添加一个吧。</p>}
        </div>
      </div>
    </div>
  );
}
