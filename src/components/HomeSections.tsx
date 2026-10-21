import Link from 'next/link';
import ProductCard from './ProductCard';
import { Reveal, Stagger, StaggerItem } from './Motion';
import { read } from '@/lib/db';
import { dealsFeed, trendingFeed } from '@/lib/feeds';
import { STORES } from '@/lib/stores';

const STEPS = [
  { n: '1', t: 'Search or paste a link', d: 'Any product from Amazon, Flipkart, Myntra, AJIO, Meesho, Croma and more — or just type what you want.' },
  { n: '2', t: 'See the real deal', d: 'Price history, a Deal Score with Buy / Skip, the same product on other stores, and live coupons.' },
  { n: '3', t: 'Not yet? We watch it', d: 'Set a price. The moment it drops, you get an email or a WhatsApp with the buy link.' },
];

function SectionHead({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
      {href && <Link href={href} className="text-sm font-semibold text-brand hover:underline">{cta ?? 'See all'} →</Link>}
    </div>
  );
}

export function TopDeals({ limit = 10 }: { limit?: number }) {
  const deals = dealsFeed().slice(0, limit);
  if (!deals.length) return null;
  return (
    <section>
      <Reveal><SectionHead title="Today's best deals" href="/deals" cta="All deals" /></Reveal>
      <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {deals.map((d) => (
          <StaggerItem key={d.product.id}>
            <ProductCard p={d.product} belowUsual={d.belowUsual} usual={d.usual} offMrp={d.offMrp} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

export function Trending({ limit = 5 }: { limit?: number }) {
  const items = trendingFeed(limit);
  if (!items.length) return null;
  return (
    <section>
      <Reveal><SectionHead title="Trending now" href="/trending" /></Reveal>
      <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {items.map((t, i) => (
          <StaggerItem key={t.product.id}>
            <ProductCard p={t.product} note={`#${i + 1} trending${t.watchers ? ` · ${t.watchers} watching` : ''}`} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

export function ShopByStore() {
  return (
    <section>
      <Reveal><SectionHead title="Price trackers by store" /></Reveal>
      <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" gap={0.04}>
        {STORES.map((s) => (
          <StaggerItem key={s.slug}>
            <Link href={`/price-tracker/${s.slug}`} className="card flex items-center gap-3 p-4 transition hover:shadow-lg">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-black text-white shadow-md" style={{ background: s.color }}>{s.name[0]}</span>
              <span className="text-sm font-semibold leading-tight">{s.name}<span className="block text-xs font-normal text-ink-mute">price history</span></span>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section>
      <Reveal><SectionHead title="How DealRadar works" /></Reveal>
      <Stagger className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <StaggerItem key={s.n}>
            <div className="card h-full p-6">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">{s.n}</div>
              <h3 className="mt-4 font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

export function RecentlyChecked() {
  const recent = read((d) =>
    Object.values(d.products)
      .filter((p) => !p.last_error)
      .sort((a, b) => Date.parse(b.last_checked_at) - Date.parse(a.last_checked_at))
      .slice(0, 10),
  );
  if (!recent.length) return null;
  return (
    <section>
      <Reveal><SectionHead title="Recently checked" /></Reveal>
      <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {recent.map((p) => (
          <StaggerItem key={p.id}>
            <ProductCard p={p} offMrp={p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
