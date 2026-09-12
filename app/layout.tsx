import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';
import Nav from '@/components/Nav';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: '我们的账本',
  description: '个人记账 + 多人群组往来账',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '我们的账本',
  },
};

export const viewport: Viewport = {
  themeColor: '#123A40',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-body min-h-screen">
        <AuthProvider>
          <ServiceWorkerRegister />
          <Nav />
          <main className="max-w-3xl mx-auto px-4 pb-24 pt-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
