'use client';

import { useCallback, useState } from 'react';
import Modal from './Modal';
import type { Coupon } from '@/lib/db';

export default function BuyNow({ productId, store, priceLabel }: { productId: string; store: string; priceLabel: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const close = useCallback(() => setOpen(false), []);

  async function start() {
    setOpen(true);
    if (state !== 'idle') return;
    setState('loading');
    // A slow web search can outlast the hosting proxy; the server keeps going, so one retry joins it.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`/api/product/${productId}/coupons`);
        // Ordering needs an account: sign in, then come back to this product.
        if (res.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setCoupons(data.coupons || []);
        setNote(data.error || '');
        break;
      } catch {
        setNote('Coupon search is unavailable right now.');
      }
    }
    setState('done');
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      setCopied(null);
    }
  }

  return (
    <>
      <button onClick={start} className="btn-primary w-full py-3.5 text-base">Buy on {store} · {priceLabel}</button>
      <Modal open={open} onClose={close} title={`Best offers on ${store}`}>
        {state === 'loading' && (
          <div className="space-y-3 py-4">
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            <p className="text-center text-sm text-ink-mute">Searching the web for live coupons and bank offers…</p>
          </div>
        )}
        {state === 'done' && (
          <div className="space-y-3">
            {coupons.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-ink-soft">{note || `No current coupon found for this product on ${store}. The price shown is the best we know of.`}</p>}
            {coupons.map((c, i) => (
              <div key={i} className="rounded-xl border-2 border-dashed border-brand/50 bg-brand-light p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{c.discount_text || c.title}</div>
                    <div className="text-sm text-ink-soft">{c.title}</div>
                    {c.conditions && <div className="mt-1 text-xs text-ink-mute">{c.conditions}</div>}
                  </div>
                  {c.code ? (
                    <button onClick={() => copy(c.code!)} className="btn-dark shrink-0 font-mono">{copied === c.code ? 'Copied ✓' : c.code}</button>
                  ) : (
                    <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-deal">Auto-applied</span>
                  )}
                </div>
                <a href={c.source_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-xs text-ink-mute underline">source</a>
              </div>
            ))}
            <a href={`/api/buy/${productId}`} target="_blank" rel="noopener" className="btn-primary mt-2 w-full py-3 text-base">
              {coupons.some((c) => c.code) ? 'Copy a code, then go to ' : 'Go to '}{store} →
            </a>
            <p className="text-center text-xs text-ink-mute">Coupons are found automatically from public pages — confirm the discount at checkout.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
