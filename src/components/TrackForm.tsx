'use client';

import Link from 'next/link';
import { useState } from 'react';
import { inr } from '@/lib/format';

const DROPS = [
  { v: 0, t: 'Any drop' },
  { v: 5, t: '5% or more' },
  { v: 10, t: '10% or more' },
  { v: 20, t: '20% or more' },
];

export default function TrackForm({ productId, price, existing, defaultEmail = '', defaultTarget = '' }: { productId: string; price: number; existing: boolean; defaultEmail?: string; defaultTarget?: string }) {
  const [drop, setDrop] = useState(0);
  const [days, setDays] = useState<7 | 15>(7);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState('');
  const [target, setTarget] = useState(defaultTarget);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(existing);
  const [sentTo, setSentTo] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, email, phone, tier: 'normal', drop_percent: drop, target_price: target, window_days: days }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not save.');
    if (data.confirmation) setSentTo(email);
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl bg-deal-light p-5 text-sm">
        <div className="text-base font-bold text-deal">You are tracking this price ✓</div>
        <p className="mt-1 text-ink-soft">
          {sentTo ? <>A confirmation with the product details is on its way to <b>{sentTo}</b>. </> : null}
          We will message you as soon as it drops. You can change or stop it any time.
        </p>
        <Link href="/alerts" className="mt-3 inline-block font-semibold text-brand underline">Manage my alerts</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="tf-email">Email</label>
          <input id="tf-email" type="email" className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="tf-phone">WhatsApp number</label>
          <input id="tf-phone" className="input" placeholder="+91 98765 43210" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <p className="-mt-3 text-xs text-ink-mute">Fill one or both. We only use them for this price alert.</p>

      <fieldset>
        <legend className="label">Alert me when the price drops by</legend>
        <div className="flex flex-wrap gap-2">
          {DROPS.map((o) => (
            <button type="button" key={o.v} onClick={() => setDrop(o.v)} className={drop === o.v ? 'chip-on' : 'chip-off'} aria-pressed={drop === o.v}>{o.t}</button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <label htmlFor="tf-target" className="text-ink-soft">…or when it reaches</label>
          <input id="tf-target" type="number" min="1" max={Math.floor(price) - 1} className="input w-32" placeholder={inr(price * 0.9).replace('₹', '₹ ')} value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Watch for</legend>
        <div className="flex gap-2">
          {[7, 15].map((d) => (
            <button type="button" key={d} onClick={() => setDays(d as 7 | 15)} className={days === d ? 'chip-on' : 'chip-off'} aria-pressed={days === d}>{d} days</button>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <button className="btn-dark w-full py-3" disabled={busy || (!email && !phone)}>{busy ? 'Saving…' : 'Track price'}</button>
    </form>
  );
}
