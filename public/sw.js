// 简单的离线缓存 Service Worker：
// - 页面/静态资源（同源请求）：优先网络，失败时退回缓存，让用户即使没网也能打开上次访问过的页面
// - Supabase 的跨域数据请求：完全不拦截，直接放行给网络（离线时数据本来就读不到，这是正常的）
const CACHE_NAME = 'couple-ledger-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（Supabase）请求不缓存，直接走网络

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
