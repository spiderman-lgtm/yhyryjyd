'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { StoreOffer } from '@/lib/db';
import { deliveryText, inr } from '@/lib/format';
import { fetchOnce } from '@/lib/fetch-once';

type Row = StoreOffer & { index: number | null; here?: boolean };

export default function PriceCompare({ productId, store, price, url }: { productId: string; store: string; price: number; url: string }) {
  const router = useRouter();
  const [offers, setOffers] = useState<StoreOffer[] | null>(null);
  const [note, setNote] = useState('');
  const [secs, setSecs] = useState(0);
  const [opening, setOpening] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    fetchOnce<{ offers?: StoreOffer[]; error?: string }>(`/api/product/${productId}/compare`)
      .then((data) => {
        if (!alive) return;
        setOffers(data.offers || []);
        setNote(data.error || '');
      })
      .catch(() => {
        if (!alive) return;
        setOffers([]);
        setNote('Price comparison is unavailable right now.');
      })
      .finally(() => clearInterval(tick));
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, [productId]);

  async function trackThere(row: Row) {
    setOpening(row.index);
    const res = await fetch('/api/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: row.url }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) router.push(`/p/${data.id}`);
    else {
      setOpening(null);
      setNote(data.error || 'Could not open that store’s page.');
    }
  }

  if (offers === null) {
    return (
      <div>
        <div className="space-y-3">
          {[90, 70, 55].map((w) => (
            <div key={w} className="flex items-center gap-3">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              <div className="h-8 animate-pulse rounded-lg bg-slate-100" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-mute">Searching Flipkart, Tata CLiQ, Croma, AJIO, Reliance Digital, Amazon and Myntra for this exact product… {secs}s</p>
      </div>
    );
  }

  const here: Row = { store, price, url, in_stock: true, same_variant: true, index: null, here: true };
  const buyable = (o: StoreOffer) => o.same_variant && o.in_stock && o.delivery?.ok !== false;
  const same = offers.map((o, i) => ({ ...o, index: i }) as Row).filter(buyable);
  const other = offers.map((o, i) => ({ ...o, index: i }) as Row).filter((o) => !buyable(o));
  const rows = [here, ...same].sort((a, b) => a.price - b.price);
  const best = rows[0];
  const max = Math.max(...rows.map((r) => r.price), ...other.map((r) => r.price));
  const saving = price - best.price;

  return (
    <div>
      <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${best.here ? 'bg-deal-light text-deal' : 'bg-brand-light text-brand-dark'}`}>
        {same.length === 0
          ? `We could not find this exact product on other stores right now — ${store} is the only price we have.`
          : best.here
            ? `${store} already has the lowest price we found (${inr(price)}).`
            : `Cheapest on ${best.store}: ${inr(best.price)} — you save ${inr(saving)} (${Math.round((saving / price) * 100)}%) compared with ${store}.`}
      </div>

      <div className="space-y-2.5" role="list" aria-label="Price on each store">
        {rows.map((r) => {
          const lowest = r === best && rows.length > 1;
          return (
            <div key={r.store} role="listitem" className="grid grid-cols-[96px_1fr_auto] items-center gap-3 sm:grid-cols-[120px_1fr_auto]">
              <div className="truncate text-sm font-semibold" title={r.store}>
                {r.store}
                {r.here && <div className="text-[11px] font-normal text-ink-mute">you are here</div>}
                {r.delivery && <div className="text-[11px] font-normal text-deal">{deliveryText(r.delivery)}</div>}
              </div>
              <div className="relative h-9 rounded-lg bg-slate-50">
                <div
                  className={`flex h-full items-center rounded-lg px-3 text-sm font-bold text-white transition-all duration-700 ${lowest ? 'bg-deal' : r.here ? 'bg-ink' : 'bg-slate-400'}`}
                  style={{ width: `${Math.max(18, (r.price / max) * 100)}%` }}
                >
                  {inr(r.price)}
                </div>
                {lowest && <span className="absolute -top-2 right-2 rounded-full bg-deal px-2 py-0.5 text-[10px] font-bold uppercase text-white">Lowest</span>}
              </div>
              <div className="flex gap-1.5">
                <a href={r.here ? `/api/buy/${productId}` : `/api/buy/${productId}?o=${r.index}`} target="_blank" rel="noopener" className={lowest ? 'btn-primary px-3 py-1.5' : 'btn-ghost px-3 py-1.5'}>Buy</a>
                {!r.here && (
                  <button onClick={() => trackThere(r)} disabled={opening !== null} className="btn-ghost hidden px-3 py-1.5 sm:inline-flex" title={`Open the ${r.store} listing in DealRadar to track its price`}>
                    {opening === r.index ? '…' : 'Track there'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {other.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="label">Similar listings (different variant, out of stock or not delivered to you)</div>
          <ul className="space-y-1 text-sm text-ink-soft">
            {other.map((o) => (
              <li key={o.index} className="flex justify-between gap-3">
                <span>{o.store}{!o.in_stock && ' · out of stock'}{!o.same_variant && ' · different variant'}{o.delivery?.ok === false && ` · ${deliveryText(o.delivery)}`}</span>
                <a href={`/api/buy/${productId}?o=${o.index}`} target="_blank" rel="noopener" className="font-semibold underline">{inr(o.price)}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {note && <p className="mt-3 text-sm text-ink-mute">{note}</p>}
      <p className="mt-3 text-xs text-ink-mute">Prices found automatically on each store’s own page — confirm on the store before you buy. Updated every 6 hours.</p>
    </div>
  );
}
