"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import InstallAppButton from "./InstallAppButton";

const links = [
  { href: "/personal", label: "个人账本" },
  { href: "/groups", label: "群组" },
  { href: "/stats", label: "统计" },
  { href: "/settings", label: "设置" },
];

export default function Nav() {
  const pathname = usePathname();
  const { session, profile, signOut } = useAuth();

  return (
    <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="ledger-stamp text-lg font-bold text-ledger">
          我们的账本
        </Link>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <InstallAppButton />
          {session && (
            <>
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={
                    "text-xs sm:text-sm " +
                    (pathname?.startsWith(l.href)
                      ? "text-ledger font-bold"
                      : "text-ink-soft hover:text-ink")
                  }
                >
                  {l.label}
                </Link>
              ))}
              <span className="hidden md:inline text-xs sm:text-sm text-ink-soft">
                {profile?.display_name}
              </span>
              <button
                onClick={signOut}
                className="text-xs text-ink-soft hover:text-expense border border-line rounded px-2 py-1"
              >
                退出
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
