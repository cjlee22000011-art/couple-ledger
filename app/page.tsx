'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? '/personal' : '/login');
  }, [loading, session, router]);

  return (
    <div className="flex items-center justify-center h-[60vh] text-ink-soft">
      正在加载账本…
    </div>
  );
}
