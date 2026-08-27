'use client';

import { useWhoAmI } from '@/lib/WhoAmIContext';

export default function WhoAmIPicker() {
  const { profiles, loading, chooseMe } = useWhoAmI();

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-ink-soft">正在加载…</div>;
  }

  if (profiles.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-16 card p-6 text-sm text-ink-soft leading-relaxed">
        <h1 className="ledger-stamp text-lg font-bold text-ledger mb-2">还没有找到任何人物</h1>
        <p>
          请先去 Supabase 的 SQL Editor 运行一次 <code>supabase/schema.sql</code> 里的建表脚本，
          它会自动插入"我"和"对方"两条初始记录，之后可以在设置页改成你们的真实名字。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-16 card p-6 text-center space-y-4">
      <h1 className="ledger-stamp text-xl font-bold text-ledger">你是谁？</h1>
      <p className="text-sm text-ink-soft">选好之后本设备会记住，之后不用再选。</p>
      <div className="space-y-2">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => chooseMe(p.id)}
            className="w-full rounded border border-line py-3 font-bold hover:border-ledger hover:bg-ledger/5"
            style={{ color: p.color }}
          >
            {p.display_name}
          </button>
        ))}
      </div>
    </div>
  );
}
