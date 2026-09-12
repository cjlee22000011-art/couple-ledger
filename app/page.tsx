'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 能渲染到这里说明 AuthGate 已经确认过登录状态，直接进个人账本即可
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/personal');
  }, [router]);
  return <div className="flex items-center justify-center h-[60vh] text-ink-soft">正在加载账本…</div>;
}
