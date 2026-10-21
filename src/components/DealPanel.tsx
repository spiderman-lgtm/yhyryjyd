'use client';

import Link from 'next/link';
import { useState } from 'react';
import BuyNow from './BuyNow';
import TrackForm from './TrackForm';
import { inr } from '@/lib/format';

interface Score {
  score: number;
  label: string;
  verdict: string;
  vsAverage: 'below' | 'same' | 'above';
  rows: { text: string; pts: number; max: number }[];
}

function Gauge({ score }: { score: number }) {
  const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#16a34a'];
  const r = 52;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    return `M ${60 + r * Math.cos(a0)} ${62 - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${60 + r * Math.cos(a1)} ${62 - r * Math.sin(a1)}`;
  };
  const angle = Math.PI * (1 - score / 100);
  return (
    <svg viewBox="0 0 120 76" className="w-36" role="img" aria-label={`Deal score ${score} out of 100`}>
      {colors.map((c, i) => (
        <path key={c} d={arc(i / 5 + 0.01, (i + 1) / 5 - 0.01)} stroke={c} strokeWidth="12" fill="none" />
      ))}
      <line x1="60" y1="62" x2={60 + 40 * Math.cos(angle)} y2={62 - 40 * Math.sin(angle)} stroke="#1e293b" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="60" cy="62" r="5" fill="#1e293b" />
      <text x="6" y="75" fontSize="8" fill="#64748b">0</text>
      <text x="106" y="75" fontSize="8" fill="#64748b">100</text>
    </svg>
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
}) {
  const { productId, price, store, deal, userEmail } = props;
  const [tab, setTab] = useState<'scan' | 'drop'>('scan');
  const [target, setTarget] = useState(String(Math.floor(price * 0.9)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(props.tracking ? { ok: true, text: 'You are already tracking this price.' } : null);

  async function quickAlert() {
    const t = Number(target);
    if (!(t > 0 && t < price)) return setMsg({ ok: false, text: `Enter a price below ${inr(price)}.` });
    if (!userEmail) return setTab('drop');
    setBusy(true);
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, email: userEmail, target_price: t, drop_percent: 5, tier: 'normal', window_days: 15 }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Done — we will email ${userEmail} when it reaches ${inr(t)} or drops 5%.` } : { ok: false, text: data.error || 'Could not set the alert.' });
  }

  const tone = !deal ? 'bg-slate-100 text-ink-soft' : deal.score >= 70 ? 'bg-deal-light text-deal' : deal.score >= 50 ? 'bg-lime-50 text-lime-700' : 'bg-red-50 text-red-600';

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-2 border-b border-slate-200 text-sm font-semibold">
        {(['scan', 'drop'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`py-3 ${tab === t ? 'border-b-2 border-brand text-brand' : 'text-ink-mute hover:text-ink'}`}>
            {t === 'scan' ? 'Deal Scanner' : 'Price Drop Alert'}
          </button>
        ))}
      </div>

      {tab === 'scan' ? (
        <div className="space-y-4 p-5">
          {deal ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${tone}`}>{deal.label}</span>
                  <p className="mt-2 text-sm text-ink-soft">{deal.verdict}</p>
                </div>
                <div className="text-center">
                  <Gauge score={deal.score} />
                  <div className="-mt-1 text-sm">Deal Score <b>{deal.score}</b></div>
                </div>
              </div>
              <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${deal.vsAverage === 'below' ? 'bg-deal-light text-deal' : deal.vsAverage === 'same' ? 'bg-slate-100 text-ink-soft' : 'bg-amber-50 text-amber-700'}`}>
                {deal.vsAverage === 'below' ? 'Less than average price' : deal.vsAverage === 'same' ? 'Same as average price' : 'More than average price'}
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs font-bold uppercase text-ink-mute"><span>Deal score breakdown</span><span>Pts</span></div>
                <ul className="space-y-1.5 text-sm">
                  {deal.rows.map((r) => (
                    <li key={r.text} className="flex justify-between gap-3">
                      <span className="text-ink-soft">{r.text}</span>
                      <span className={`shrink-0 font-semibold ${r.pts >= r.max * 0.7 ? 'text-deal' : r.pts > 0 ? 'text-amber-600' : 'text-red-600'}`}>{r.pts}/{r.max}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs italic text-ink-mute">Based on the prices DealRadar has recorded for this product.</p>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-ink-soft">
              <b className="text-ink">Deal Score coming soon.</b> We need a few days of prices to judge this deal
              {props.trackingSince ? ` — tracking started ${new Date(props.trackingSince).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}. Set an alert and we will tell you when it drops.
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <div className="mb-2 text-center text-sm font-bold">Set a price drop alert to buy later</div>
            <div className="flex overflow-hidden rounded-xl border border-slate-300 focus-within:border-brand">
              <span className="grid place-items-center pl-3 text-ink-mute">₹</span>
              <input value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} inputMode="numeric" aria-label="Alert me at this price" className="min-w-0 flex-1 px-2 py-2.5 text-sm outline-none" />
              <button onClick={quickAlert} disabled={busy} className="bg-brand-light px-4 text-sm font-bold text-brand-dark hover:bg-orange-100">{busy ? '…' : 'Set Price Alert'}</button>
            </div>
            {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-deal' : 'text-red-600'}`}>{msg.text}</p>}
            {!userEmail && <p className="mt-1 text-xs text-ink-mute"><Link href={`/login?next=/p/${productId}`} className="underline">Sign in</Link> for one-click alerts.</p>}
            <div className="my-3 text-center text-xs text-ink-mute">OR</div>
            <BuyNow productId={productId} store={store} priceLabel={inr(price)} />
          </div>
        </div>
      ) : (
        <div className="p-5">
          <TrackForm key={target} productId={productId} price={price} existing={props.tracking} defaultEmail={userEmail ?? ''} defaultTarget={target} />
        </div>
      )}
    </div>
  );
}
