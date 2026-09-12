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
  const [signedUpMsg, setSignedUpMsg] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      router.replace('/personal');
    } else {
      const { error: err, data } = await supabase.auth.signUp({ email, password });
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      if (data.session) {
        router.replace('/personal');
      } else {
        setSignedUpMsg(true);
      }
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 card p-6">
      <h1 className="ledger-stamp text-xl font-bold text-ledger mb-1">
        {mode === 'signin' ? '登记入账' : '开立新账'}
      </h1>
      <p className="text-sm text-ink-soft mb-6">
        {mode === 'signin' ? '使用邮箱登录你的账本' : '注册一个新账户，注册后可以创建或加入群组'}
      </p>

      {signedUpMsg ? (
        <p className="text-sm text-income">
          注册成功！如果 Supabase 项目开启了邮箱验证，请去邮箱点击确认链接后再登录；
          如果没开启验证，直接切换到"登录"用刚才的邮箱密码登录即可。
        </p>
      ) : (
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
      )}

      <button
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setSignedUpMsg(false);
          setError(null);
        }}
        className="mt-4 text-sm text-ink-soft hover:text-ledger underline"
      >
        {mode === 'signin' ? '还没有账户？去注册' : '已有账户？去登录'}
      </button>
    </div>
  );
}
