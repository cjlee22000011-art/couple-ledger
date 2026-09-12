'use client';

import { useEffect, useState } from 'react';

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setInstalled(standalone);

    const ua = window.navigator.userAgent || '';
    setIsIOS(/iphone|ipad|ipod/i.test(ua));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (installed) return null;

  async function handleClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowHelp(true);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="text-xs border border-ledger text-ledger rounded px-2 py-1 whitespace-nowrap hover:bg-ledger hover:text-white"
      >
        下载 App
      </button>

      {showHelp && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div className="card p-5 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="ledger-stamp font-bold text-ledger mb-2">添加到主屏幕</h3>
            {isIOS ? (
              <p className="text-sm text-ink-soft leading-relaxed">
                在 Safari 里点底部的分享按钮（方框加向上箭头），下拉找到"添加到主屏幕"点一下即可。
              </p>
            ) : (
              <p className="text-sm text-ink-soft leading-relaxed">
                在浏览器右上角菜单里找到"安装应用"或"添加到主屏幕"选项即可（不同浏览器位置略有不同，
                Chrome 通常在地址栏右侧也有一个安装图标）。
              </p>
            )}
            <button
              onClick={() => setShowHelp(false)}
              className="mt-4 w-full bg-ledger text-white rounded py-2 text-sm font-bold hover:bg-ledger-light"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
