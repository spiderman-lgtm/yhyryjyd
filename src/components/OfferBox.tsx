'use client';

import { useEffect, useState } from 'react';
import type { BestPrice } from '@/lib/db';
import type { BankOffer } from '@/lib/offer-text';
import { fetchOnce } from '@/lib/fetch-once';
import { inr } from '@/lib/format';

// The store's own "Buy at ₹…" after its bank/card offers, with the offers themselves, as the store shows them.
export default function OfferBox({ productId, store, price, initial }: { productId: string; store: string; price: number; initial: { best: number | null; offers: BankOffer[] } }) {
  const [best, setBest] = useState(initial.best);
  const [offers, setOffers] = useState(initial.offers);
  const [loading, setLoading] = useState(!initial.best);
  useEffect(() => {
    fetchOnce<{ stores?: BestPrice[] }>(`/api/product/${productId}/best`)
      .then((d) => {
        const own = (d.stores || []).find((s) => s.store.toLowerCase() === store.toLowerCase());
        if (own && own.best < price) {
          setBest(own.best);
          setOffers(own.offers?.length ? own.offers : own.offer ? [{ amount: price - own.best, text: own.offer }] : []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId, store, price]);

  if (!best || best >= price) {
    return loading ? <div className="h-16 animate-pulse rounded-2xl bg-sky-50" aria-label="Checking bank offers" /> : null;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-sky-200">
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white">🏷️ Offers for maximum savings on {store}</div>
      <div className="bg-sky-50 p-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-extrabold">Buy at {inr(best)}</span>
          <span className="text-sm font-semibold text-deal">save {inr(price - best)} more</span>
        </div>
        {offers.length > 0 && (
          <>
            <div className="mt-3 text-xs font-bold uppercase tracking-wide text-ink-mute">Bank offers</div>
            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
              {offers.map((o, i) => (
                <div key={o.text} className="min-w-[11rem] shrink-0 rounded-xl border border-slate-200 bg-white p-3">
                  {i === 0 && <span className="mb-1 inline-block rounded bg-amber-200 px-1.5 text-[11px] font-bold text-amber-900">Best value for you</span>}
                  <div className="font-bold">{inr(o.amount)} off</div>
                  <div className="text-xs text-ink-soft">{o.text.replace(/^[^·]*·\s*/, '')}</div>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="mt-2 text-[11px] text-ink-mute">Applied at {store} checkout with the card shown.</p>
      </div>
    </div>
  );
}
