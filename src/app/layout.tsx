import type { Metadata } from 'next';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import { currentUser } from '@/lib/auth';
import { STORES } from '@/lib/stores';
import './globals.css';

export const metadata: Metadata = {
  title: 'DealRadar — never overpay online',
  description: 'Compare prices across Amazon, Flipkart, Myntra and more, see price history, get coupons and price-drop alerts on email and WhatsApp.',
};

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/deals', label: 'Deals' },
  { href: '/trending', label: 'Trending' },
  { href: '/coupons', label: 'Coupons' },
  { href: '/gift-cards', label: 'Gift cards' },
  { href: '/extension', label: 'Extension' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const user = currentUser();
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md">
          <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href={user ? '/dashboard' : '/'} className="flex shrink-0 items-center gap-2 text-lg font-extrabold">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 text-white shadow-md shadow-orange-500/30">₹</span>
                Deal<span className="text-brand">Radar</span>
              </Link>
              <div className="hidden items-center gap-1 text-sm font-medium md:flex">
                {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 hover:bg-slate-100">{n.label}</Link>)}
              </div>
            </div>
            <div className="flex items-center gap-1 whitespace-nowrap text-sm font-medium sm:gap-3">
              {user && <Link href="/dashboard" className="rounded-lg px-2 py-1.5 hover:bg-slate-100">Dashboard</Link>}
              <Link href="/cart" className="hidden rounded-lg px-2 py-1.5 hover:bg-slate-100 sm:block">My cart</Link>
              <Link href="/alerts" className="hidden rounded-lg px-2 py-1.5 hover:bg-slate-100 sm:block">My alerts</Link>
              {user ? (
                <UserMenu name={user.name} email={user.email} owner={user.role === 'owner'} />
              ) : (
                <>
                  <Link href="/login" className="rounded-lg px-2 py-1.5 hover:bg-slate-100">Sign in</Link>
                  <Link href="/signup" className="btn-primary px-3 py-1.5">Sign up</Link>
                </>
              )}
            </div>
          </nav>
          <div className="flex gap-1 overflow-x-auto whitespace-nowrap border-t border-slate-100 px-4 py-1.5 text-sm font-medium md:hidden">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1 hover:bg-slate-100">{n.label}</Link>)}
            <Link href="/alerts" className="rounded-lg px-3 py-1 hover:bg-slate-100 sm:hidden">My alerts</Link>
            <Link href="/cart" className="rounded-lg px-3 py-1 hover:bg-slate-100 sm:hidden">My cart</Link>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        <footer className="mt-10 border-t border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 text-lg font-extrabold">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 text-white">₹</span>
                Deal<span className="text-brand">Radar</span>
              </div>
              <p className="mt-2 text-ink-mute">Compare prices, see real price history, and get alerted when it drops.</p>
            </div>
            <div>
              <div className="label">Shop smarter</div>
              <ul className="space-y-1.5">
                {[...NAV, { href: '/search', label: 'Search' }, { href: '/alerts', label: 'Price alerts' }].map((n) => (
                  <li key={n.href}><Link href={n.href} className="text-ink-soft hover:text-brand">{n.label}</Link></li>
                ))}
              </ul>
            </div>
            <div className="sm:col-span-2">
              <div className="label">Price history trackers</div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {STORES.map((s) => (
                  <li key={s.slug}><Link href={`/price-tracker/${s.slug}`} className="text-ink-soft hover:text-brand">{s.name} price tracker</Link></li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mx-auto max-w-7xl px-4 pb-8 text-xs text-ink-mute">
            DealRadar may earn a commission when you buy through its links. Prices and coupons are checked automatically; confirm them at checkout.
          </p>
        </footer>
      </body>
    </html>
  );
}
