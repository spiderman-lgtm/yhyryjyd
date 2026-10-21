import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'DealRadar — never overpay online',
  description: 'Paste any product link. Get the best coupon now, or a price-drop alert on email and WhatsApp later.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-extrabold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">₹</span>
              Deal<span className="text-brand">Radar</span>
            </Link>
            <div className="flex items-center gap-1 text-sm font-medium sm:gap-4">
              <Link href="/cart" className="rounded-lg px-2 py-1.5 hover:bg-slate-100">My cart</Link>
              <Link href="/alerts" className="rounded-lg px-2 py-1.5 hover:bg-slate-100">My alerts</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-ink-mute">
          DealRadar may earn a commission when you buy through its links. Prices and coupons are checked automatically; confirm them at checkout.
        </footer>
      </body>
    </html>
  );
}
