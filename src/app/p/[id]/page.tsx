import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { currentUser, viewerUid } from '@/lib/auth';
import BuyNow from '@/components/BuyNow';
import CartAndEnquire from '@/components/CartAndEnquire';
import CompareList from '@/components/CompareList';
import DealPanel from '@/components/DealPanel';
import Gallery from '@/components/Gallery';
import HistoryChart from '@/components/HistoryChart';
import KeyFeatures from '@/components/KeyFeatures';
import LinkInput from '@/components/LinkInput';
import LocationPin from '@/components/LocationPin';
import LookAlike from '@/components/LookAlike';
import PriceCompare from '@/components/PriceCompare';
import ShareButtons from '@/components/ShareButtons';
import { historyFor, read } from '@/lib/db';
import { dealScore, getProduct, markViewed } from '@/lib/products';
import { PLATFORM_NAMES } from '@/lib/scraper';
import { storeColor } from '@/lib/stores';
import { isPin } from '@/lib/compare';
import { giftCardFor } from '@/lib/storecoupons';
import { dateShort, inr } from '@/lib/format';

export const dynamic = 'force-dynamic';

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-hidden="true">
      {'★★★★★'.slice(0, Math.round(rating))}
      <span className="text-slate-300">{'★★★★★'.slice(Math.round(rating))}</span>
    </span>
  );
}

export default function ProductPage({ params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p) notFound();
  markViewed(p.id);
  const uid = viewerUid();
  const user = currentUser();
  const history = historyFor(p.id);
  const deal = dealScore(p.id, p.price);
  const inCart = read((d) => Object.values(d.cart).some((c) => c.uid === uid && c.product_id === p.id));
  const tracking = read((d) => Object.values(d.alerts).some((a) => a.uid === uid && a.product_id === p.id && a.status === 'active'));
  const off = p.mrp ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const store = PLATFORM_NAMES[p.platform];
  const images = p.images?.length ? p.images : p.image ? [p.image] : [];
  const gift = giftCardFor(p.platform);
  const pinCookie = cookies().get('dr_pin')?.value;
  const pin = isPin(pinCookie) ? pinCookie : null;
  const area = pin ? cookies().get('dr_area')?.value || null : null;
  // Every other store's recorded prices, drawn beside this store's in the history graph.
  const storeLines = read((d) => {
    const offers = d.compare[pin ? `${p.id}@${pin}` : p.id]?.offers ?? d.compare[p.id]?.offers ?? [];
    return Object.entries(d.offer_history[p.id] ?? {})
      .filter(([s]) => s.toLowerCase() !== store.toLowerCase())
      .map(([s, points]) => {
        const now = offers.find((o) => o.store === s && o.in_stock);
        return { store: s, color: storeColor(s), points, live: !!now, current: now?.price ?? null, variant: now ? !now.same_variant : false };
      });
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,4.5fr)]">
        <Gallery images={images} title={p.title} />

        <div className="space-y-4">
          <span className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-ink-soft">{store}</span>
          <h1 className="text-xl font-semibold leading-snug">{p.title}</h1>
          {p.rating ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-brand">{p.rating.toFixed(1)}</span>
              <Stars rating={p.rating} />
              {p.reviews ? <span className="text-ink-mute">{p.reviews >= 1000 ? `${(p.reviews / 1000).toFixed(1)}K` : p.reviews} ratings</span> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-extrabold">{inr(p.price)}</span>
            {p.mrp && <span className="text-lg text-ink-mute line-through">{inr(p.mrp)}</span>}
            {off > 0 && <span className="rounded-lg bg-deal-light px-2 py-0.5 text-sm font-bold text-deal">{off}% off</span>}
            {!p.in_stock && <span className="rounded-lg bg-red-50 px-2 py-0.5 text-sm font-bold text-red-600">Out of stock</span>}
          </div>
          <KeyFeatures productId={p.id} initial={p.features_at && Date.now() - Date.parse(p.features_at) < 3 * 86400_000 ? p.features ?? [] : null} />
          <ShareButtons title={p.title} />
          <BuyNow productId={p.id} store={store} priceLabel={inr(p.price)} />
          {gift && (
            <a href={`/api/coupon/${gift.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-2.5 text-sm transition hover:shadow-md">
              <span className="text-xl" aria-hidden="true">🎁</span>
              <span className="flex-1">
                Save <b>{gift.discount_text}</b> more — pay with a {store} gift card
                {gift.pct > 0 && <span className="text-ink-mute"> (about {inr((p.price * gift.pct) / 100)} on this order)</span>}
              </span>
              <span className="font-semibold text-indigo-700">Get it ›</span>
            </a>
          )}
          <CartAndEnquire productId={p.id} inCart={inCart} />
          <LocationPin pin={pin} area={area} />
          <CompareList productId={p.id} store={store} price={p.price} />
          <p className="text-xs text-ink-mute">
            Checked {dateShort(p.last_checked_at)}, {new Date(p.last_checked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            {p.source === 'ai' && ' · read by AI because the store blocked a direct check'}
          </p>
        </div>

        <DealPanel
          productId={p.id}
          price={p.price}
          store={store}
          deal={deal}
          trackingSince={history[0]?.at ?? null}
          tracking={tracking}
          userEmail={user?.email ?? null}
        />
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-4 text-xl font-bold">Price History{storeLines.length > 0 && <span className="ml-2 text-sm font-normal text-ink-mute">{store} vs {storeLines.length} other store{storeLines.length > 1 ? 's' : ''}</span>}</h2>
        <HistoryChart history={history.map((h) => ({ price: h.price, at: h.at }))} current={p.price} store={store} color={storeColor(store)} stores={storeLines} />
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-bold">Compare prices on other stores</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">The same product on Amazon, Flipkart, Croma and more — cheapest first.</p>
        <PriceCompare productId={p.id} store={store} price={p.price} url={p.url} />
      </section>

      <section>
        <h2 className="mb-1 text-xl font-bold">LookAlike <span className="text-brand">✦</span></h2>
        <LookAlike productId={p.id} />
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">Check another product</h2>
        <LinkInput compact />
      </section>
    </div>
  );
}
