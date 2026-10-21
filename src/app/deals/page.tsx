import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { dealsFeed } from '@/lib/feeds';
import { STORES } from '@/lib/stores';
import type { Platform } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Best deals today — DealRadar', description: 'Products selling below their usual price on Amazon, Flipkart, Myntra and more.' };

const BUDGETS = [99, 199, 499, 999, 4999];
const DROPS = [10, 20, 30, 40, 50];

function href(q: Record<string, string | undefined>) {
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
  return `/deals${s ? `?${s}` : ''}`;
}

export default function DealsPage({ searchParams }: { searchParams: { price?: string; below?: string; store?: string } }) {
  const price = BUDGETS.includes(Number(searchParams.price)) ? Number(searchParams.price) : undefined;
  const below = DROPS.includes(Number(searchParams.below)) ? Number(searchParams.below) : undefined;
  const store = STORES.find((s) => s.slug === searchParams.store)?.slug as Platform | undefined;
  const deals = dealsFeed({ maxPrice: price, minBelowUsual: below, platform: store });
  const q = { price: price?.toString(), below: below?.toString(), store };

  const Chip = ({ on, to, children }: { on: boolean; to: string; children: React.ReactNode }) => (
    <Link href={to} scroll={false} className={on ? 'chip-on' : 'chip-off'}>{children}</Link>
  );

  return (
    <div className="space-y-6">
      <Reveal>
        <h1 className="text-3xl font-extrabold tracking-tight">Best deals right now</h1>
        <p className="mt-1 text-ink-soft">Products selling below their usual price — worked out from the prices DealRadar records, not the store’s “MRP”.</p>
      </Reveal>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 w-24">Budget</span>
          <Chip on={!price} to={href({ ...q, price: undefined })}>Any</Chip>
          {BUDGETS.map((b) => <Chip key={b} on={price === b} to={href({ ...q, price: String(b) })}>Under ₹{b.toLocaleString('en-IN')}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 w-24">Below usual</span>
          <Chip on={!below} to={href({ ...q, below: undefined })}>Any</Chip>
          {DROPS.map((d) => <Chip key={d} on={below === d} to={href({ ...q, below: String(d) })}>{d}%+</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 w-24">Store</span>
          <Chip on={!store} to={href({ ...q, store: undefined })}>All</Chip>
          {STORES.map((s) => <Chip key={s.slug} on={store === s.slug} to={href({ ...q, store: s.slug })}>{s.name}</Chip>)}
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="card p-10 text-center text-ink-soft">
          No deals match these filters yet. Deals appear as DealRadar records prices — <Link href="/" className="font-semibold text-brand underline">check a product</Link> to add more.
        </div>
      ) : (
        <Stagger key={JSON.stringify(q)} className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {deals.slice(0, 60).map((d) => (
            <StaggerItem key={d.product.id}>
              <ProductCard p={d.product} belowUsual={d.belowUsual} usual={d.usual} offMrp={d.offMrp} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
