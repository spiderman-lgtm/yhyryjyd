import Link from 'next/link';
import AutoRefresh from '@/components/AutoRefresh';
import DealRow, { DealCard } from '@/components/DealRow';
import ProductCard from '@/components/ProductCard';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { catalog, catalogStale, flashDeals, refreshCatalog } from '@/lib/catalog';
import { latestDrops, trendingFeed } from '@/lib/feeds';
import { liveSales, refreshSales, salesStale } from '@/lib/sales';
import { affiliateUrl } from '@/lib/coupons';
import StoreIcon from '@/components/StoreIcon';
import { inr } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Live sales & trending deals — DealRadar',
  description: 'Every sale live now on Amazon, Flipkart, Myntra, AJIO, Meesho, Tata CLiQ, Croma, Reliance Digital, Nykaa and JioMart, plus the latest price drops and biggest discounts.',
};

export default function TrendingPage() {
  // Rows are searched in the background; the page shows the last results meanwhile.
  if (catalogStale()) void refreshCatalog();
  const rows = catalog().filter((r) => r.items.length > 0);
  const filling = rows.length === 0;
  const items = trendingFeed(20);
  if (salesStale()) void refreshSales();
  const { sales } = liveSales();
  const drops = latestDrops(10);
  const latest = flashDeals(12).deals;
  // Sale dates are Indian dates.
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const dayText = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const endsText = (end: string | null) => {
    if (!end) return null;
    const days = Math.round((Date.parse(end) - Date.parse(today)) / 86400_000);
    return days <= 0 ? 'Ends today' : days === 1 ? 'Ends tomorrow' : `Ends ${dayText(end)}`;
  };
  const ago = (at: string) => {
    const h = Math.floor((Date.now() - Date.parse(at)) / 3600_000);
    return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="space-y-10">
      <Reveal>
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 px-6 py-10 text-white shadow-2xl shadow-indigo-900/20 sm:px-12">
          <div aria-hidden className="absolute -right-10 -top-16 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-orange-300/30 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">Updated every few hours</span>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Live sales &amp; trending deals</h1>
            <p className="mt-2 text-white/85">Every sale running now on Amazon, Flipkart, Myntra, AJIO, Meesho, Tata CLiQ, Croma and more — plus the latest price drops and the biggest real discounts. Tap a product to see its price history.</p>
          </div>
        </section>
      </Reveal>

      <section id="sales">
        <Reveal>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            Live sales on every store
          </h2>
          <p className="mb-4 mt-1 text-ink-soft">Sale events running now and starting this week, with the bank offer to use.</p>
        </Reveal>
        {sales.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sales.map((s) => (
              <a key={`${s.store}-${s.name}`} href={affiliateUrl(s.url)} target="_blank" rel="noopener nofollow" className="card group flex flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-center gap-2">
                  <StoreIcon store={s.store} className="h-8 w-8 rounded-lg text-sm" />
                  <span className="font-bold">{s.store}</span>
                  {s.status === 'live' ? (
                    <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">LIVE</span>
                  ) : (
                    <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{s.starts ? `Starts ${dayText(s.starts)}` : 'Coming soon'}</span>
                  )}
                </div>
                <div className="text-lg font-extrabold leading-tight">{s.name}</div>
                {s.highlight && <div className="text-sm font-semibold text-deal">{s.highlight}</div>}
                {s.bank_offer && <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-ink-soft">💳 {s.bank_offer}</div>}
                <div className="mt-auto flex items-center justify-between pt-1 text-xs">
                  <span className="text-ink-mute">{s.status === 'live' ? endsText(s.ends) : s.ends ? `Till ${dayText(s.ends)}` : ''}</span>
                  <span className="font-semibold text-brand group-hover:underline">Shop the sale →</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="card p-6 text-center text-sm text-ink-soft">
            <AutoRefresh every={8000} times={15} />
            Checking every store for sales running today…
          </div>
        )}
      </section>

      {(drops.length > 0 || latest.length > 0) && (
        <section id="latest">
          <Reveal>
            <h2 className="text-2xl font-extrabold">Latest deals</h2>
            <p className="mb-4 mt-1 text-ink-soft">Fresh price drops DealRadar just caught, then today’s deepest genuine discounts.</p>
          </Reveal>
          {drops.length > 0 && (
            <Stagger className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {drops.map((x) => (
                <StaggerItem key={x.product.id}>
                  <ProductCard p={x.product} note={`↓ ${inr(x.was - x.product.price)} · dropped ${ago(x.at)}`} offMrp={x.product.mrp && x.product.mrp > x.product.price ? Math.round(((x.product.mrp - x.product.price) / x.product.mrp) * 100) : 0} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
          {latest.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {latest.map((it, i) => <DealCard key={it.url} item={it} i={i % 6} />)}
            </div>
          )}
        </section>
      )}

      {rows.map((r, i) => (
        <DealRow key={r.category.slug} slug={r.category.slug} title={r.category.title} items={r.items} tone={i} />
      ))}

      {filling && (
        <>
          <AutoRefresh />
          <div className="space-y-6">
            {[0, 1].map((k) => (
              <div key={k} className="rounded-[2rem] bg-gradient-to-br from-indigo-50 to-violet-50 p-6">
                <div className="mx-auto mb-6 h-7 w-56 animate-pulse rounded-lg bg-white/80" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {[0, 1, 2, 3, 4, 5].map((j) => <div key={j} className="aspect-[3/4] animate-pulse rounded-2xl bg-white/70" />)}
                </div>
              </div>
            ))}
            <p className="text-center text-sm text-ink-mute">Finding today’s best discounts across stores…</p>
          </div>
        </>
      )}

      {items.length > 0 && (
        <section>
          <Reveal>
            <h2 className="text-2xl font-extrabold">Trending on DealRadar</h2>
            <p className="mb-4 mt-1 text-ink-soft">What shoppers are checking and watching most this week.</p>
          </Reveal>
          <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {items.map((t, i) => (
              <StaggerItem key={t.product.id}>
                <ProductCard p={t.product} note={`#${i + 1} trending${t.watchers ? ` · ${t.watchers} watching` : ''}`} offMrp={t.product.mrp && t.product.mrp > t.product.price ? Math.round(((t.product.mrp - t.product.price) / t.product.mrp) * 100) : 0} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {!rows.length && !items.length && !filling && (
        <div className="card p-10 text-center text-ink-soft">Nothing trending yet. <Link href="/" className="font-semibold text-brand underline">Check a product</Link>.</div>
      )}
    </div>
  );
}
