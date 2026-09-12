'use client';

import { useEffect } from 'react';

/**
 * 注册 Service Worker，实现"添加到主屏幕"后基本的离线打开能力。
 * 用相对当前页面 origin + basePath 拼出的绝对路径注册，
 * 避免在 /groups/detail 这类子路径下用相对路径注册导致 scope 算错。
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ? `/${process.env.NEXT_PUBLIC_BASE_PATH}` : '';
    const swUrl = `${basePath}/sw.js`;
    navigator.serviceWorker.register(swUrl).catch(() => {
      // 注册失败（比如本地 http 开发环境某些浏览器限制）不影响正常使用，静默忽略即可
    });
  }, []);

  return null;
}
