import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '我们的账本',
    short_name: '账本',
    description: '个人记账 + 多人群组往来账',
    start_url: '.',
    display: 'standalone',
    background_color: '#F7F3EC',
    theme_color: '#123A40',
    orientation: 'portrait',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
