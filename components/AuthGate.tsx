'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

// 不需要登录就能访问的路径（登录/注册页）
const PUBLIC_PATHS = ['/login'];

function isPublicPath(pathname: string | null) {
  if (!pathname) return false;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * 全局路由守卫：
 * - 未登录时，除了 /login，输入任何网址都会被弹回登录页
 * - 已登录时，如果还停留在 /login（比如浏览器历史记录），自动跳去个人账本
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const publicPath = isPublicPath(pathname);

  useEffect(() => {
    if (loading) return;
    if (!session && !publicPath) {
      router.replace('/login');
    } else if (session && publicPath) {
      router.replace('/personal');
    }
  }, [loading, session, publicPath, router]);

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh] text-ink-soft">正在加载账本…</div>;
  }
  // 正在跳转途中，不渲染受保护内容，避免闪一下未登录也能看到页面骨架
  if (!session && !publicPath) return null;
  if (session && publicPath) return null;

  return <>{children}</>;
}
