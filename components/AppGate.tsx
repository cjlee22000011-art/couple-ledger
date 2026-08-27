'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ledger_access_ok';

/**
 * 可选的"访问码"软门槛。
 * 如果设置了环境变量 NEXT_PUBLIC_ACCESS_CODE，首次打开网页时会要求输入这个码，
 * 输入正确后记在本机浏览器（localStorage），以后不用重复输入。
 *
 * 注意：这不是真正的登录认证，只是防止陌生人随手点进网址看到你们的账本，
 * 因为访问码本身也会被打包进静态网页里，懂技术的人依然能看到。
 * 如果需要更强的隐私保护，建议改回 Supabase Auth 登录方案。
 */
export default function AppGate({ children }: { children: React.ReactNode }) {
  const requiredCode = process.env.NEXT_PUBLIC_ACCESS_CODE;
  const [unlocked, setUnlocked] = useState(!requiredCode);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!requiredCode) {
      setReady(true);
      return;
    }
    const ok = localStorage.getItem(STORAGE_KEY) === '1';
    setUnlocked(ok);
    setReady(true);
  }, [requiredCode]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (input === requiredCode) {
      localStorage.setItem(STORAGE_KEY, '1');
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  }

  if (!ready) return null;

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <form onSubmit={submit} className="card p-6 w-full max-w-xs space-y-3">
          <h1 className="ledger-stamp text-lg font-bold text-ledger">请输入访问码</h1>
          <input
            type="password"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 bg-white"
            placeholder="访问码"
          />
          {error && <p className="text-expense text-sm">访问码不对，再试一次</p>}
          <button className="w-full bg-ledger text-white rounded py-2 font-bold hover:bg-ledger-light">
            进入账本
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
