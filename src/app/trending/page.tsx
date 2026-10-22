import Link from 'next/link';
import AutoRefresh from '@/components/AutoRefresh';
import DealRow from '@/components/DealRow';
import ProductCard from '@/components/ProductCard';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { catalog, catalogStale, refreshCatalog } from '@/lib/catalog';
import { trendingFeed } from '@/lib/feeds';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Trending deals — DealRadar',
  description: 'The latest discounts on smartphones, earbuds, air fryers, laptops, TVs and more across Flipkart, Croma, Reliance Digital and Tata CLiQ.',
};

export default function TrendingPage() {
  // Rows are searched in the background; the page shows the last results meanwhile.
  if (catalogStale()) void refreshCatalog();
  const rows = catalog().filter((r) => r.items.length > 0);
  const filling = rows.length === 0;
  const items = trendingFeed(20);

  return (
    <div className="space-y-10">
      <Reveal>
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 px-6 py-10 text-white shadow-2xl shadow-indigo-900/20 sm:px-12">
          <div aria-hidden className="absolute -right-10 -top-16 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
          <div aria-hidden className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-orange-300/30 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">Updated every few hours</span>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Trending deals</h1>
            <p className="mt-2 text-white/85">The biggest real discounts right now on phones, earbuds, kitchen and home appliances — across Flipkart, Croma, Reliance Digital and Tata CLiQ. Tap a product to see its price history.</p>
          </div>
        </section>
      </Reveal>

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
