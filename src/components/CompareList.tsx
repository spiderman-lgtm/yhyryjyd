'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { StoreOffer } from '@/lib/db';
import { deliveryText, inr } from '@/lib/format';
import { fetchOnce } from '@/lib/fetch-once';
import { storeColor } from '@/lib/stores';

type Row = { store: string; price: number; href: string; here: boolean; variant?: boolean; delivery?: StoreOffer['delivery'] };


export default function CompareList({ productId, store, price }: { productId: string; store: string; price: number }) {
  const [offers, setOffers] = useState<StoreOffer[] | null>(null);
  useEffect(() => {
    fetchOnce<{ offers?: StoreOffer[] }>(`/api/product/${productId}/compare`)
      .then((d) => setOffers(d.offers || []))
      .catch(() => setOffers([]));
  }, [productId]);

  // The same item ranks above other sizes or colours, which are not a like-for-like price.
  const rows: Row[] = [
    { store, price, href: `/api/buy/${productId}`, here: true },
    ...(offers || [])
      .map((o, i) => ({ ...o, i }))
      .filter((o) => o.in_stock && o.delivery?.ok !== false)
      .map((o) => ({ store: o.store, price: o.price, href: `/api/buy/${productId}?o=${o.i}`, here: false, variant: !o.same_variant, delivery: o.delivery })),
  ];
  const all = rows.sort((a, b) => Number(!!a.variant) - Number(!!b.variant) || a.price - b.price);
  const top = all.slice(0, 5);
  const hereRow = top.some((r) => r.here) ? null : all.find((r) => r.here)!;
  const lowest = all[0];
  const notHere = (offers || []).filter((o) => o.delivery?.ok === false);

  const Item = ({ r, i }: { r: Row; i: number }) => {
    const isLowest = r === lowest && all.length > 1;
    return (
      <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
        <a href={r.href} target="_blank" rel="noopener" className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:-translate-y-0.5 hover:shadow-md ${isLowest ? 'border-deal/40 bg-deal-light' : 'border-slate-200 bg-white'}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black text-white" style={{ background: storeColor(r.store) }}>{r.store[0]}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{r.store}</span>
            <span className="block text-xs text-ink-mute">
              {isLowest ? 'Lowest price' : r.here ? 'You are here' : `${inr(r.price - lowest.price)} more than lowest`}
              {r.variant && ' · other colour/variant'}
              {r.delivery && <span className="text-deal"> · {deliveryText(r.delivery)}</span>}
            </span>
          </span>
          <span className={`font-bold ${isLowest ? 'text-deal' : ''}`}>{inr(r.price)} ›</span>
        </a>
      </motion.li>
    );
  };

  return (
    <div>
      <h3 className="mb-2 font-bold">
        Compare {all.length} available price{all.length > 1 ? 's' : ''}
        {offers === null && <span className="ml-2 text-xs font-normal text-ink-mute">searching Flipkart, Tata CLiQ, Croma, AJIO, Reliance…</span>}
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
