'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Category, TxType } from '@/lib/types';

export default function SettingsPage() {
  const { session, profile, couple, partner, refresh, loading } = useAuth();
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TxType>('expense');
  const [newCatIcon, setNewCatIcon] = useState('🏷️');

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('categories').select('*').eq('user_id', session.user.id).order('type');
    setCats((data as Category[]) || []);
  }, [session]);

  useEffect(() => {
    load();
    setName(profile?.display_name || '');
  }, [load, profile]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    await supabase.from('profiles').update({ display_name: name }).eq('id', session.user.id);
    refresh();
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !newCatName.trim()) return;
    const { error } = await supabase.from('categories').insert({
      user_id: session.user.id,
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

  async function unlinkPartner() {
    if (!couple) return;
    if (!confirm('确定要解除往来账绑定吗？历史往来记录会一并保留在数据库中，但页面将不再显示。')) return;
    await supabase.from('couples').delete().eq('id', couple.id);
    refresh();
  }

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">我的资料</h2>
        <form onSubmit={saveName} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-line rounded px-3 py-2 bg-white"
          />
          <button className="bg-ledger text-white rounded px-4 font-bold hover:bg-ledger-light">保存</button>
        </form>
      </div>

      {couple && (
        <div className="card p-4">
          <h2 className="ledger-stamp font-bold text-ledger mb-2">往来账伴侣</h2>
          <p className="text-sm text-ink-soft mb-3">当前已与 {partner?.display_name || '对方'} 绑定往来账本。</p>
          <button onClick={unlinkPartner} className="text-expense text-sm border border-expense rounded px-3 py-1.5 hover:bg-expense hover:text-white">
            解除绑定
          </button>
        </div>
      )}

      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">自定义分类</h2>
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
