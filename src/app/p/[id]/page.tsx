import { notFound } from 'next/navigation';
import { currentUser, viewerUid } from '@/lib/auth';
import BuyNow from '@/components/BuyNow';
import CartAndEnquire from '@/components/CartAndEnquire';
import PriceChart from '@/components/PriceChart';
import TrackForm from '@/components/TrackForm';
import LinkInput from '@/components/LinkInput';
import { historyFor, read } from '@/lib/db';
import { getProduct, priceStats } from '@/lib/products';
import { PLATFORM_NAMES } from '@/lib/scraper';
import { dateShort, inr } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function ProductPage({ params, searchParams }: { params: { id: string }; searchParams: { days?: string } }) {
  const p = getProduct(params.id);
  if (!p) notFound();
  const uid = viewerUid();
  const user = currentUser();
  const days = searchParams.days === '7' ? 7 : 15;
  const stats = priceStats(p.id, p.price);
  const points = historyFor(p.id, days);
  const inCart = read((d) => Object.values(d.cart).some((c) => c.uid === uid && c.product_id === p.id));
  const tracking = read((d) => Object.values(d.alerts).some((a) => a.uid === uid && a.product_id === p.id && a.status === 'active'));
  const off = p.mrp ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const store = PLATFORM_NAMES[p.platform];
  const atLow = stats.points > 1 && p.price <= stats.d15.low;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="card grid aspect-square place-items-center p-6">
          {p.image ? <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" /> : <span className="text-7xl">🛍️</span>}
        </div>

        <div className="space-y-5">
          <div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-soft">{store}</span>
            <h1 className="mt-3 text-xl font-bold leading-snug sm:text-2xl">{p.title}</h1>
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-extrabold">{inr(p.price)}</span>
            {p.mrp && <span className="text-lg text-ink-mute line-through">{inr(p.mrp)}</span>}
            {off > 0 && <span className="rounded-lg bg-deal-light px-2 py-0.5 text-sm font-bold text-deal">{off}% off</span>}
            {!p.in_stock && <span className="rounded-lg bg-red-50 px-2 py-0.5 text-sm font-bold text-red-600">Out of stock</span>}
          </div>

          {atLow && <div className="rounded-xl bg-deal-light px-4 py-2 text-sm font-semibold text-deal">Lowest price we have seen in the last 15 days — a good time to buy.</div>}

          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { k: '7-day low', v: stats.d7.low },
              { k: '15-day low', v: stats.d15.low },
              { k: '15-day high', v: stats.d15.high },
            ].map((s) => (
              <div key={s.k} className="card p-3">
                <div className="text-xs text-ink-mute">{s.k}</div>
                <div className="font-bold">{inr(s.v)}</div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <BuyNow productId={p.id} store={store} priceLabel={inr(p.price)} />
            <CartAndEnquire productId={p.id} inCart={inCart} />
          </div>

          <p className="text-xs text-ink-mute">
            Checked {dateShort(p.last_checked_at)} at {new Date(p.last_checked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            {p.source === 'ai' && ' · read by AI because the store blocked a direct check'}
            {stats.trackingSince && ` · price history since ${dateShort(stats.trackingSince)}`}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Price history</h2>
            <div className="flex gap-1 text-sm">
              {[7, 15].map((d) => (
                <a key={d} href={`?days=${d}`} className={days === d ? 'chip-on py-1' : 'chip-off py-1'}>{d} days</a>
              ))}
            </div>
          </div>
          <PriceChart points={points} days={days} />
        </section>

        <section className="card p-5">
          <h2 className="font-bold">Not buying today? Get a price-drop alert</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">We re-check the price and message you the moment it falls, with the best coupon and a buy link.</p>
          <TrackForm productId={p.id} price={p.price} existing={tracking} defaultEmail={user?.email ?? ''} />
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">Check another product</h2>
        <LinkInput compact />
      </section>
    </div>
  );
}
