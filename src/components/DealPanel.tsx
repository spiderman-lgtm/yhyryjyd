'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { fetchOnce } from '@/lib/fetch-once';
import type { BestPrice, StoreOffer } from '@/lib/db';
import BuyNow from './BuyNow';
import TrackForm from './TrackForm';
import { inr } from '@/lib/format';

interface Score {
  score: number;
  label: string;
  verdict: string;
  vsAverage: 'below' | 'same' | 'above';
  rows: { text: string; pts: number; max: number }[];
  action: 'buy' | 'okay' | 'skip';
  flags: string[];
}

const ACTION = {
  buy: { text: 'BUY', sub: 'Good time to buy', cls: 'bg-deal text-white' },
  okay: { text: 'OKAY', sub: 'Fair price, could drop', cls: 'bg-amber-500 text-white' },
  skip: { text: 'SKIP', sub: 'Wait for a better price', cls: 'bg-red-600 text-white' },
};

function Gauge({ score, small }: { score: number; small?: boolean }) {
  const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#16a34a'];
  const r = 52;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    return `M ${60 + r * Math.cos(a0)} ${62 - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${60 + r * Math.cos(a1)} ${62 - r * Math.sin(a1)}`;
  };
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 120 76" className={small ? 'w-20' : 'w-36'} role="img" aria-label={`Deal score ${score} out of 100`}>
      {colors.map((c, i) => (
        <path key={c} d={arc(i / 5 + 0.01, (i + 1) / 5 - 0.01)} stroke={c} strokeWidth="12" fill="none" />
      ))}
      <motion.line
        x1="60" y1="62" x2="20" y2="62" stroke="#1e293b" strokeWidth="3.5" strokeLinecap="round"
        style={{ transformOrigin: '60px 62px', transformBox: 'view-box' }}
        initial={{ rotate: reduce ? (score / 100) * 180 : 0 }}
        animate={{ rotate: (score / 100) * 180 }}
        transition={{ type: 'spring', stiffness: 60, damping: 12, delay: 0.2 }}
      />
      <circle cx="60" cy="62" r="5" fill="#1e293b" />
      <text x="6" y="75" fontSize="8" fill="#64748b">0</text>
      <text x="106" y="75" fontSize="8" fill="#64748b">100</text>
    </svg>
  );
}

// The store's price after its best bank/card/coupon offer, and the same for other stores, cheapest first.
function LowestForYou({ productId, price, store }: { productId: string; price: number; store: string }) {
  const [rows, setRows] = useState<BestPrice[] | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    fetchOnce<{ stores?: BestPrice[] }>(`/api/product/${productId}/best`)
      .then((d) => setRows((d.stores || []).filter((s) => s.best > 0)))
      .catch(() => setRows([]));
  }, [productId]);
  if (rows === null)
    return (
      <div className="rounded-xl bg-slate-50 p-3 text-sm text-ink-mute">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        <p className="mt-2 text-xs">Checking bank offers and coupons on every store…</p>
      </div>
    );
  const sorted = [...rows].sort((a, b) => a.best - b.best);
  const top = sorted[0];
  if (!top || top.best >= price) return null;
  const href = (s: BestPrice) => (s.store.toLowerCase() === store.toLowerCase() ? `/api/buy/${productId}` : `/api/buy/${productId}?s=${encodeURIComponent(s.store)}`);
  return (
    <div className="rounded-xl border-2 border-deal/30 bg-deal-light p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-deal">Lowest price for you</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-black text-ink">{inr(top.best)}</span>
        <span className="text-sm text-ink-mute line-through">{inr(top.price)}</span>
        <span className="text-sm font-semibold text-ink-soft">on {top.store} with offers</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {top.offer}
        {top.source_url && (
          <a href={top.source_url} target="_blank" rel="noopener nofollow" className="ml-1 text-xs text-brand underline">
            offer details
          </a>
        )}
      </p>
      {sorted.length > 1 && (
        <>
          <button onClick={() => setMore((m) => !m)} className="mt-2 text-xs font-semibold text-brand">
            {more ? 'Hide' : `Compare offer prices on ${sorted.length} stores`} ›
          </button>
          {more && (
            <ul className="mt-2 divide-y divide-deal/10 text-sm">
              {sorted.map((s) => (
                <li key={s.store} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <b>{s.store}</b>
                    <span className="block truncate text-xs text-ink-mute">{s.offer || 'No offer found'}</span>
                  </span>
                  <a href={href(s)} target="_blank" rel="noopener" className="shrink-0 text-right">
                    <b className="text-ink">{inr(s.best)}</b>
                    {s.best < s.price && <span className="block text-xs text-ink-mute line-through">{inr(s.price)}</span>}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-2 text-[11px] text-ink-mute">Offer prices depend on your card and the store&apos;s terms; check at checkout.</p>
    </div>
  );
}

export default function DealPanel(props: {
  productId: string;
  price: number;
  store: string;
  deal: Score | null;
  trackingSince: string | null;
  tracking: boolean;
  userEmail: string | null;
  signedIn: boolean;
  telegram?: boolean;
  m91?: boolean;
  verified?: { emails: string[]; phones: string[] };
  waVerify?: boolean;
}) {
  const { productId, price, store, deal, userEmail, signedIn } = props;
  const [details, setDetails] = useState(false);
  const [cheaper, setCheaper] = useState<{ store: string; price: number; i: number } | null>(null);
  useEffect(() => {
    fetchOnce<{ offers?: StoreOffer[] }>(`/api/product/${productId}/compare`)
      .then((d) => {
        const best = (d.offers || []).map((o, i) => ({ ...o, i })).filter((o) => o.same_variant && o.in_stock && o.delivery?.ok !== false && o.price < price).sort((a, b) => a.price - b.price)[0];
        if (best) setCheaper({ store: best.store, price: best.price, i: best.i });
      })
      .catch(() => {});
  }, [productId, price]);
  // Browsing is open; setting an alert or buying asks the shopper to sign in first, then brings them back here.
  const login = `/login?next=${encodeURIComponent(`/p/${productId}#alert`)}`;
  const tone = !deal ? 'bg-slate-100 text-ink-soft' : deal.score >= 70 ? 'bg-deal-light text-deal' : deal.score >= 50 ? 'bg-lime-50 text-lime-700' : 'bg-red-50 text-red-600';

  return (
    <div id="alert" className="card scroll-mt-24 overflow-hidden">
      <div className="space-y-4 p-5">
        <LowestForYou productId={productId} price={price} store={store} />
        {cheaper && (
          <a href={`/api/buy/${productId}?o=${cheaper.i}`} target="_blank" rel="noopener" className="block rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
            {inr(price - cheaper.price)} cheaper on {cheaper.store} ({inr(cheaper.price)}) — buy there →
          </a>
        )}

        <div className="border-b border-slate-200 pb-2 text-sm font-bold text-brand">🔔 Price Drop Alert</div>

        {/* The deal score, so the shopper sees whether waiting is worth it while setting the alert. */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          {deal ? (
            <>
              <div className="flex items-center gap-3">
                <div className="shrink-0 text-center">
                  <Gauge score={deal.score} small />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg px-2.5 py-0.5 text-sm font-black tracking-wide ${ACTION[deal.action].cls}`}>{ACTION[deal.action].text}</span>
                    <b>Deal Score {deal.score}</b>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{deal.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">{ACTION[deal.action].sub} · {deal.vsAverage === 'below' ? 'less than' : deal.vsAverage === 'same' ? 'same as' : 'more than'} average price</p>
                </div>
              </div>
              {deal.flags.map((f) => (
                <div key={f} className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">⚠ {f}</div>
              ))}
              <button onClick={() => setDetails((v) => !v)} className="mt-2 text-xs font-semibold text-brand">
                {details ? 'Hide score details' : 'Why this score?'} ›
              </button>
              {details && (
                <div className="mt-2">
                  <p className="mb-2 text-ink-soft">{deal.verdict}</p>
                  <ul className="space-y-1.5">
                    {deal.rows.map((r) => (
                      <li key={r.text} className="flex justify-between gap-3">
                        <span className="text-ink-soft">{r.text}</span>
                        <span className={`shrink-0 font-semibold ${r.pts >= r.max * 0.7 ? 'text-deal' : r.pts > 0 ? 'text-amber-600' : 'text-red-600'}`}>{r.pts}/{r.max}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs italic text-ink-mute">Based on the prices DealRadar has recorded for this product.</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-ink-soft">
              <b className="text-ink">Deal Score coming soon.</b> We need a few days of prices to judge this deal
              {props.trackingSince ? ` — tracking started ${new Date(props.trackingSince).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}. Set an alert and we will tell you when it drops.
            </p>
          )}
        </div>

        {signedIn ? (
          <TrackForm productId={productId} existing={props.tracking} defaultEmail={userEmail ?? ''} telegram={props.telegram} m91={props.m91} verified={props.verified} waVerify={props.waVerify} />
        ) : (
          <a href={login} className="block w-full rounded-xl border-2 border-brand bg-brand-light py-3 text-center text-sm font-bold text-brand-dark transition hover:bg-orange-100">
            🔔 Set price drop alert · Email · WhatsApp
            <span className="block text-xs font-medium text-ink-mute">Sign in to get alerts</span>
          </a>
        )}

        <div className="border-t border-slate-100 pt-4">
          <div className="mb-3 text-center text-xs text-ink-mute">OR BUY NOW</div>
          {signedIn ? (
            <BuyNow productId={productId} store={store} priceLabel={inr(price)} />
          ) : (
            <a href={login} className="btn-primary block w-full py-3.5 text-center text-base">Buy on {store} · {inr(price)}</a>
          )}
        </div>
      </div>
    </div>
  );
}
