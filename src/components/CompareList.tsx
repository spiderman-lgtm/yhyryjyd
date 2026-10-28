'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { BestPrice, StoreOffer } from '@/lib/db';
import { deliveryText, inr } from '@/lib/format';
import { fetchOnce } from '@/lib/fetch-once';
import StoreIcon from './StoreIcon';

type Row = { store: string; price: number; list: number; offer?: string; href: string; here: boolean; variant?: boolean; title?: string; delivery?: StoreOffer['delivery'] };


export default function CompareList({ productId, store, price }: { productId: string; store: string; price: number }) {
  const [offers, setOffers] = useState<StoreOffer[] | null>(null);
  // Each store's price after its best bank/card offer; the list is sorted by what the shopper actually pays.
  const [best, setBest] = useState<BestPrice[] | null>(null);
  useEffect(() => {
    fetchOnce<{ offers?: StoreOffer[] }>(`/api/product/${productId}/compare`)
      .then((d) => setOffers(d.offers || []))
      .catch(() => setOffers([]));
    fetchOnce<{ stores?: BestPrice[] }>(`/api/product/${productId}/best`)
      .then((d) => setBest(d.stores || []))
      .catch(() => setBest([]));
  }, [productId]);
  const after = (s: string, p: number) => {
    const b = best?.find((x) => x.store.toLowerCase() === s.toLowerCase());
    return b && b.best < p && b.price === p ? { price: b.best, offer: b.offers?.[0]?.text || b.offer } : { price: p, offer: undefined };
  };

  // Cheapest first. "Lowest price" is only ever the same item: another size or colour can be cheaper, and says so.
  const rows: Row[] = [
    { store, list: price, ...after(store, price), href: `/api/buy/${productId}`, here: true },
    ...(offers || [])
      .map((o, i) => ({ ...o, i }))
      .filter((o) => o.in_stock && o.delivery?.ok !== false)
      .map((o) => ({ store: o.store, list: o.price, ...after(o.store, o.price), href: `/api/buy/${productId}?o=${o.i}`, here: false, variant: !o.same_variant, title: o.title, delivery: o.delivery })),
  ];
  const all = rows.sort((a, b) => a.price - b.price || Number(!!a.variant) - Number(!!b.variant));
  const top = all.slice(0, 5);
  const hereRow = top.some((r) => r.here) ? null : all.find((r) => r.here)!;
  const lowest = all.find((r) => !r.variant) ?? all[0];
  const diff = (r: Row) => (r.price === lowest.price ? 'Same lowest price' : r.price > lowest.price ? `${inr(r.price - lowest.price)} more than lowest` : `${inr(lowest.price - r.price)} less`);
  const notHere = (offers || []).filter((o) => o.delivery?.ok === false);

  const Item = ({ r, i }: { r: Row; i: number }) => {
    const isLowest = r === lowest && all.length > 1;
    const cheaperVariant = !!r.variant && r.price < lowest.price;
    return (
      <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
        <a href={r.href} target="_blank" rel="noopener" className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:-translate-y-0.5 hover:shadow-md ${isLowest ? 'border-deal/40 bg-deal-light' : cheaperVariant ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <StoreIcon store={r.store} className="h-8 w-8 rounded-lg text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{r.store}</span>
            <span className="block text-xs text-ink-mute">
              {isLowest ? (all.some((x) => x.variant && x.price < r.price) ? 'Lowest for this exact item' : r.price < r.list ? 'Lowest price after offers' : 'Lowest price') : cheaperVariant ? <b className="text-amber-700">Cheapest · other size/colour — check before buying</b> : r.here ? 'You are here' : diff(r)}
              {r.variant && !cheaperVariant && ' · other size/colour'}
              {r.variant && r.title && <span className="block truncate text-ink-soft">{r.title}</span>}
              {r.delivery && <span className="text-deal"> · {deliveryText(r.delivery)}</span>}
              {r.offer && <span className="block truncate text-blue-700">💳 {r.offer}</span>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block font-bold ${isLowest ? 'text-deal' : cheaperVariant ? 'text-amber-700' : ''}`}>{inr(r.price)} ›</span>
            {r.price < r.list && <span className="block text-[11px] text-ink-mute"><s>{inr(r.list)}</s> · after offer</span>}
          </span>
        </a>
      </motion.li>
    );
  };

  return (
    <div>
      <h3 className="mb-2 font-bold">
        Compare {all.length} price{all.length > 1 ? 's' : ''} after bank offers
        {offers === null && <span className="ml-2 text-xs font-normal text-ink-mute">searching Flipkart, Amazon, Croma, Tata CLiQ, AJIO, brand stores and more…</span>}
      </h3>
      {offers === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : (
        <ul className="space-y-2">
          {top.map((r, i) => <Item key={r.store} r={r} i={i} />)}
          {hereRow && (
            <>
              <li className="pt-1 text-center text-[11px] uppercase tracking-wide text-ink-mute">where you came from</li>
              <Item r={hereRow} i={top.length} />
            </>
          )}
        </ul>
      )}
      {notHere.length > 0 && <p className="mt-2 text-xs text-ink-mute">Not delivered to {notHere[0].delivery!.pin}: {notHere.map((o) => o.store).join(', ')}</p>}
      {offers !== null && all.length > 5 && <p className="mt-2 text-xs text-ink-mute">Showing the 5 lowest of {all.length} stores — see all below.</p>}
    </div>
  );
}
