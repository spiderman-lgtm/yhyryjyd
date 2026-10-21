import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { Reveal, Stagger, StaggerItem } from '@/components/Motion';
import { trendingFeed } from '@/lib/feeds';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trending products — DealRadar', description: 'The products shoppers are checking and tracking most on DealRadar.' };

export default function TrendingPage() {
  const items = trendingFeed(40);
  return (
    <div className="space-y-6">
      <Reveal>
        <h1 className="text-3xl font-extrabold tracking-tight">Trending on DealRadar</h1>
        <p className="mt-1 text-ink-soft">What shoppers are checking, watching and buying most this week.</p>
      </Reveal>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-ink-soft">Nothing trending yet. <Link href="/" className="font-semibold text-brand underline">Check a product</Link> to get things started.</div>
      ) : (
        <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {items.map((t, i) => (
            <StaggerItem key={t.product.id}>
              <ProductCard p={t.product} note={`#${i + 1} trending${t.watchers ? ` · ${t.watchers} watching` : ''}`} offMrp={t.product.mrp && t.product.mrp > t.product.price ? Math.round(((t.product.mrp - t.product.price) / t.product.mrp) * 100) : 0} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
