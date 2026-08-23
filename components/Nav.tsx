'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

const links = [
  { href: '/personal', label: '个人账本' },
  { href: '/shared', label: '往来账' },
  { href: '/stats', label: '统计' },
  { href: '/settings', label: '设置' },
];

export default function Nav() {
  const pathname = usePathname();
  const { session, profile, signOut } = useAuth();

  return (
    <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="ledger-stamp text-lg font-bold text-ledger">
          我们的账本
        </Link>
        {session && (
          <nav className="flex items-center gap-4 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={
                  pathname?.startsWith(l.href)
                    ? 'text-ledger font-bold'
                    : 'text-ink-soft hover:text-ink'
                }
              >
                {l.label}
              </Link>
            ))}
            <span className="text-ink-soft hidden sm:inline">{profile?.display_name}</span>
            <button onClick={signOut} className="text-ink-soft hover:text-expense text-xs border border-line rounded px-2 py-1">
              退出
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
