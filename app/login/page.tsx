'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error: err } = await fn({ email, password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace('/personal');
  }

  return (
    <div className="max-w-sm mx-auto mt-16 card p-6">
      <h1 className="ledger-stamp text-xl font-bold text-ledger mb-1">
        {mode === 'signin' ? '登记入账' : '开立新账'}
      </h1>
      <p className="text-sm text-ink-soft mb-6">
        {mode === 'signin' ? '使用邮箱登录你的账本' : '注册一个新账户'}
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-line rounded px-3 py-2 bg-white"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="密码（至少 6 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line rounded px-3 py-2 bg-white"
        />
        {error && <p className="text-expense text-sm">{error}</p>}
        <button
          disabled={busy}
          className="w-full bg-ledger text-white rounded py-2 font-bold hover:bg-ledger-light disabled:opacity-50"
        >
          {busy ? '处理中…' : mode === 'signin' ? '登录' : '注册'}
        </button>
      </form>
      <button
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        className="mt-4 text-sm text-ink-soft hover:text-ledger underline"
      >
        {mode === 'signin' ? '还没有账户？去注册' : '已有账户？去登录'}
      </button>
    </div>
  );
}
