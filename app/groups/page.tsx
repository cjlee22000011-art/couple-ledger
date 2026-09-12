'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Group } from '@/lib/types';

export default function GroupsPage() {
  const { session, loading } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', session.user.id);
    const ids = (memberships || []).map((m: any) => m.group_id);
    if (ids.length === 0) {
      setGroups([]);
      return;
    }
    const { data } = await supabase.from('groups').select('*').in('id', ids).order('created_at', { ascending: false });
    setGroups((data as Group[]) || []);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !newName.trim()) return;
    setBusy(true);
    setMsg(null);

    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert({ name: newName.trim(), created_by: session.user.id })
      .select()
      .single();

    if (groupErr || !group) {
      setBusy(false);
      setMsg('创建群组失败：' + (groupErr?.message || '未知错误'));
      return;
    }

    const { error: memberErr } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: session.user.id });

    setBusy(false);

    if (memberErr) {
      // 群组已经建好了，但把自己加进成员失败了，明确告诉用户，而不是"看起来没反应"
      setMsg('群组已创建，但加入成员失败：' + memberErr.message + '（可以尝试重新加入，或联系我修复）');
      // 依然把这条加进列表，避免用户以为完全没成功而重复创建
      setGroups((prev) => [group as Group, ...prev]);
      return;
    }

    // 立即把新群组加到列表最前面，不用等下一次网络请求也能马上看到反馈
    setGroups((prev) => [group as Group, ...prev]);
    setNewName('');
    setMsg(`已创建群组 "${group.name}"`);
    load();
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !joinCode.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data: group, error } = await supabase
      .from('groups')
      .select('*')
      .eq('invite_code', joinCode.trim().toLowerCase())
      .maybeSingle();
    if (error || !group) {
      setBusy(false);
      setMsg('邀请码无效，请检查是否输入正确');
      return;
    }
    const { error: joinErr } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: session.user.id });
    setBusy(false);
    if (joinErr && !joinErr.message.includes('duplicate')) {
      setMsg('加入失败：' + joinErr.message);
      return;
    }
    setJoinCode('');
    setMsg(`已加入 "${group.name}"`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">新建一个群组</h2>
        <p className="text-xs text-ink-soft mb-3">
          群组可以是你和女友两人，也可以拉一群朋友一起旅行分账，人数不限。
        </p>
        <form onSubmit={createGroup} className="flex flex-col sm:flex-row gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="群组名称，如：日本旅行 2026"
            className="flex-1 min-w-0 border border-line rounded px-3 py-2 bg-white"
          />
          <button
            disabled={busy}
            className="bg-ledger text-white rounded px-4 py-2 font-bold hover:bg-ledger-light disabled:opacity-50 whitespace-nowrap"
          >
            创建
          </button>
        </form>
      </div>

      <div className="card p-4">
        <h2 className="ledger-stamp font-bold text-ledger mb-3">用邀请码加入群组</h2>
        <form onSubmit={joinGroup} className="flex flex-col sm:flex-row gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="输入朋友分享的邀请码"
            className="flex-1 min-w-0 border border-line rounded px-3 py-2 bg-white"
          />
          <button
            disabled={busy}
            className="border border-ledger text-ledger rounded px-4 py-2 font-bold hover:bg-ledger hover:text-white disabled:opacity-50 whitespace-nowrap"
          >
            加入
          </button>
        </form>
        {msg && <p className="text-sm text-ink-soft mt-2 break-words">{msg}</p>}
      </div>

      <div className="card divide-y divide-line">
        <h2 className="ledger-stamp font-bold text-ledger p-4 pb-0">我的群组</h2>
        {groups.length === 0 && <p className="p-4 text-ink-soft text-sm">还没有加入任何群组，先创建或加入一个吧。</p>}
        {groups.map((g) => (
          <Link
            key={g.id}
            href={`/groups/detail?id=${g.id}`}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-4 hover:bg-paper"
          >
            <span className="font-bold break-words">{g.name}</span>
            <span className="text-xs text-ink-soft font-mono whitespace-nowrap">邀请码 {g.invite_code}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
