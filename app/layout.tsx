import type { Metadata } from 'next';
import './globals.css';
import { WhoAmIProvider } from '@/lib/WhoAmIContext';
import AppGate from '@/components/AppGate';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: '我们的账本',
  description: '个人记账 + 双人往来账',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-body min-h-screen">
        <AppGate>
          <WhoAmIProvider>
            <Nav />
            <main className="max-w-3xl mx-auto px-4 pb-24 pt-6">{children}</main>
          </WhoAmIProvider>
        </AppGate>
      </body>
    </html>
  );
}
