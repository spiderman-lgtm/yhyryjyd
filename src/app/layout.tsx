import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import HeaderLocation from '@/components/HeaderLocation';
import UserMenu from '@/components/UserMenu';
import { currentUser } from '@/lib/auth';
import { STORES } from '@/lib/stores';
import { startOpsWatchdog } from '@/lib/ops-alerts';
import { appUrl } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: 'DealRadar — never overpay online',
  description: 'Free Indian price tracker: price history, lowest price after bank offers, live sales on every store, coupons and price-drop alerts on email, WhatsApp and Telegram for Amazon, Flipkart, Myntra, AJIO and more.',
  keywords: ['price tracker India', 'price history', 'Amazon price tracker', 'Flipkart price tracker', 'price drop alert', 'live sales', 'coupons', 'bank offers', 'deal score'],
  alternates: { types: { 'text/plain': '/llms.txt' } },
  openGraph: { siteName: 'DealRadar', type: 'website', title: 'DealRadar — never overpay online', description: 'Price history, lowest price after offers, live sales and price-drop alerts for Indian online stores.' },
};

// Tells search engines and AI assistants what DealRadar is and how to search it.
function siteJsonLd() {
  const u = appUrl();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${u}/#org`, name: 'DealRadar', url: u, logo: `${u}/icon.png` },
      {
        '@type': 'WebSite',
        '@id': `${u}/#site`,
        name: 'DealRadar',
        url: u,
        description: 'Free Indian price tracker with price history, deal score, lowest price after offers, live sales and price-drop alerts.',
        publisher: { '@id': `${u}/#org` },
        potentialAction: { '@type': 'SearchAction', target: `${u}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
      },
    ],
  };
}

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/deals', label: 'Deals' },
  { href: '/trending', label: 'Trending' },
  { href: '/coupons', label: 'Coupons' },
  { href: '/gift-cards', label: 'Gift cards' },
  { href: '/extension', label: 'Extension' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  startOpsWatchdog();
  const user = currentUser();
  // Signed-in shoppers find Gift cards in their account menu.
  const nav = user ? NAV.filter((n) => n.href !== '/gift-cards') : NAV;
  const pin = cookies().get('dr_pin')?.value ?? null;
  const area = cookies().get('dr_area')?.value || null;
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }} />
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md">
          <nav className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4">
            <div className="flex items-center gap-6">
              <Link href={user ? '/dashboard' : '/'} className="flex shrink-0 items-center gap-2 text-lg font-extrabold">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 text-white shadow-md shadow-orange-500/30">₹</span>
                Deal<span className="text-brand">Radar</span>
              </Link>
              <div className="hidden items-center gap-1 text-sm font-medium md:flex">
                {nav.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 hover:bg-slate-100">{n.label}</Link>)}
              </div>
            </div>
            <div className="flex items-center gap-1 whitespace-nowrap text-sm font-medium sm:gap-3">
              <HeaderLocation pin={pin} area={area} />
              {user && <Link href="/dashboard" className="rounded-lg px-2 py-1.5 hover:bg-slate-100">Dashboard</Link>}
              {!user && <Link href="/cart" className="hidden rounded-lg px-2 py-1.5 hover:bg-slate-100 sm:block">My cart</Link>}
              {!user && <Link href="/alerts" className="hidden rounded-lg px-2 py-1.5 hover:bg-slate-100 sm:block">My alerts</Link>}
              {user ? (
                <UserMenu name={user.name} email={user.email} owner={user.role === 'owner'} />
              ) : (
                <>
                  <Link href="/login" className="rounded-lg px-1.5 py-1.5 hover:bg-slate-100 sm:px-2">Sign in</Link>
                  <Link href="/signup" className="btn-primary px-3 py-1.5">Sign up</Link>
                </>
              )}
            </div>
          </nav>
          <div className="flex gap-1 overflow-x-auto whitespace-nowrap border-t border-slate-100 px-4 py-1.5 text-sm font-medium md:hidden">
            {nav.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1 hover:bg-slate-100">{n.label}</Link>)}
            {!user && <Link href="/alerts" className="rounded-lg px-3 py-1 hover:bg-slate-100 sm:hidden">My alerts</Link>}
            {!user && <Link href="/cart" className="rounded-lg px-3 py-1 hover:bg-slate-100 sm:hidden">My cart</Link>}
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
