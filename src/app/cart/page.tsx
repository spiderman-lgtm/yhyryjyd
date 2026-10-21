import Link from 'next/link';
import { viewerUid } from '@/lib/auth';
import RemoveFromCart from '@/components/RemoveFromCart';
import { read } from '@/lib/db';
import { inr } from '@/lib/format';
import { priceStats } from '@/lib/products';
import { PLATFORM_NAMES } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export default function CartPage() {
  const uid = viewerUid();
  const items = read((d) =>
    Object.values(d.cart)
      .filter((c) => c.uid === uid && d.products[c.product_id])
      .sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))
      .map((c) => ({ item: c, product: d.products[c.product_id] })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My cart</h1>
        <p className="text-sm text-ink-soft">Products you saved for later. Buy when you are ready, or set a price alert so you don&apos;t have to keep checking.</p>
      </div>
      {items.length === 0 && (
        <div className="card p-10 text-center text-ink-soft">
          Nothing saved yet. <Link href="/" className="font-semibold text-brand underline">Check a product</Link>.
        </div>
      )}
      <div className="space-y-3">
        {items.map(({ item, product: p }) => {
          const s = priceStats(p.id, p.price);
          return (
            <div key={item.id} className="card flex gap-4 p-4">
              <Link href={`/p/${p.id}`} className="grid h-24 w-24 shrink-0 place-items-center">
                {p.image ? <img src={p.image} alt="" className="max-h-full max-w-full object-contain" /> : '🛍️'}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/p/${p.id}`} className="line-clamp-2 font-medium hover:underline">{p.title}</Link>
                <div className="mt-1 text-xs text-ink-mute">{PLATFORM_NAMES[p.platform]} · 15-day low {inr(s.d15.low)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="text-lg font-bold">{inr(p.price)}</span>
                  <a href={`/api/buy/${p.id}`} target="_blank" rel="noopener" className="btn-primary py-1.5">Buy</a>
                  <Link href={`/p/${p.id}`} className="btn-ghost py-1.5">Coupons & alert</Link>
                  <RemoveFromCart productId={p.id} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
