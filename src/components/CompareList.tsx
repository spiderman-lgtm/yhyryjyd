'use client';

import { useEffect, useState } from 'react';
import type { StoreOffer } from '@/lib/db';
import { inr } from '@/lib/format';
import { fetchOnce } from '@/lib/fetch-once';

export default function CompareList({ productId, store, price }: { productId: string; store: string; price: number }) {
  const [offers, setOffers] = useState<StoreOffer[] | null>(null);
  useEffect(() => {
    fetchOnce<{ offers?: StoreOffer[] }>(`/api/product/${productId}/compare`)
      .then((d) => setOffers(d.offers || []))
      .catch(() => setOffers([]));
  }, [productId]);

  const rows = [
    { store, price, href: `/api/buy/${productId}`, here: true },
    ...(offers || []).map((o, i) => ({ ...o, i })).filter((o) => o.same_variant && o.in_stock).map((o) => ({ store: o.store, price: o.price, href: `/api/buy/${productId}?o=${o.i}`, here: false })),
  ].sort((a, b) => a.price - b.price);

  return (
    <div>
      <h3 className="mb-2 font-bold">
        Compare {rows.length} available price{rows.length > 1 ? 's' : ''}
        {offers === null && <span className="ml-2 text-xs font-normal text-ink-mute">searching other stores…</span>}
      </h3>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.store}>
            <a href={r.href} target="_blank" rel="noopener" className={`flex items-center justify-between rounded-xl border px-4 py-3 transition hover:shadow-sm ${i === 0 ? 'border-deal/40 bg-deal-light' : 'border-slate-200 bg-white'}`}>
              <span>
                <span className="font-semibold">{r.store}</span>
                <span className="block text-xs text-ink-mute">{i === 0 && rows.length > 1 ? 'Lowest price' : r.here ? 'You are here' : 'Other store'}</span>
              </span>
              <span className={`font-bold ${i === 0 && rows.length > 1 ? 'text-deal' : ''}`}>{inr(r.price)} ›</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
