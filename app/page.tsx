'use client';

import { useWhoAmI } from '@/lib/WhoAmIContext';
import WhoAmIPicker from '@/components/WhoAmIPicker';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { me, loading } = useWhoAmI();
  const router = useRouter();

  useEffect(() => {
    if (!loading && me) router.replace('/personal');
  }, [loading, me, router]);

  if (loading) return <div className="flex items-center justify-center h-[60vh] text-ink-soft">正在加载账本…</div>;
  if (!me) return <WhoAmIPicker />;
  return null;
}
