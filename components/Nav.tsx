'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWhoAmI } from '@/lib/WhoAmIContext';

const links = [
  { href: '/personal', label: '个人账本' },
  { href: '/shared', label: '往来账' },
  { href: '/stats', label: '统计' },
  { href: '/settings', label: '设置' },
];

export default function Nav() {
  const pathname = usePathname();
  const { me, clearMe } = useWhoAmI();

  return (
    <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="ledger-stamp text-lg font-bold text-ledger">
          我们的账本
        </Link>
        {me && (
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
            <span className="hidden sm:inline font-bold" style={{ color: me.color }}>
              {me.display_name}
            </span>
            <button
              onClick={clearMe}
              className="text-ink-soft hover:text-expense text-xs border border-line rounded px-2 py-1"
            >
              切换身份
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
