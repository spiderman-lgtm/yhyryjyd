'use client';

import Link from 'next/link';
import { useState } from 'react';

const DROPS = [
  { v: 0, t: 'Any drop' },
  { v: 5, t: '5% or more' },
  { v: 10, t: '10% or more' },
  { v: 20, t: '20% or more' },
];

export default function TrackForm({ productId, existing, defaultEmail = '', telegram: telegramOn = false }: { productId: string; existing: boolean; defaultEmail?: string; telegram?: boolean }) {
  const [drop, setDrop] = useState(0);
  const [days, setDays] = useState<7 | 15>(7);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(existing);
  const [sentTo, setSentTo] = useState('');
  const [telegram, setTelegram] = useState(false);
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [tgLinked, setTgLinked] = useState(false);
  const [waSent, setWaSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, email, phone, telegram, tier: 'urgent', drop_percent: drop, window_days: days }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not save.');
    if (data.confirmation) setSentTo(email);
    setTgLink(data.telegram_link ?? null);
    setTgLinked(!!data.telegram_linked);
    setWaSent(!!data.whatsapp_confirmation);
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl bg-deal-light p-5 text-sm">
        <div className="text-base font-bold text-deal">You are tracking this price ✓</div>
        <p className="mt-1 text-ink-soft">
          {sentTo ? <>A confirmation with the product details is on its way to <b>{sentTo}</b>. </> : null}
          {waSent ? <>We sent a confirmation to your WhatsApp too. </> : null}
          {tgLinked ? <>Your Telegram has the confirmation. </> : null}
          We will message you as soon as it drops. You can change or stop it any time.
        </p>
        {tgLink && (
          <a href={tgLink} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] py-3 font-semibold text-white shadow-md hover:opacity-90">
            <span aria-hidden="true">✈️</span> Open Telegram &amp; press Start
          </a>
        )}
        {tgLink && <p className="mt-1 text-xs text-ink-mute">One tap on “Start” in the DealRadar bot and your confirmation and price drops arrive in Telegram.</p>}
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
      {telegramOn && (
        <label className={`-mt-1 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${telegram ? 'border-[#229ED9] bg-sky-50' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
          <input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#229ED9] text-sm text-white" aria-hidden="true">✈️</span>
          <span className="flex-1">
            <b>Also alert me on Telegram</b>
            <span className="block text-xs text-ink-mute">One tap to connect — photo, price and a Buy button in every message.</span>
          </span>
        </label>
      )}
      <p className="-mt-3 text-xs text-ink-mute">{telegramOn ? 'Use any of these.' : 'Fill one or both.'} We only use them for this price alert.</p>

      <fieldset>
        <legend className="label">Alert me when the price drops by</legend>
        <div className="flex flex-wrap gap-2">
          {DROPS.map((o) => (
            <button type="button" key={o.v} onClick={() => setDrop(o.v)} className={drop === o.v ? 'chip-on' : 'chip-off'} aria-pressed={drop === o.v}>{o.t}</button>
          ))}
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
      <button className="btn-dark w-full py-3" disabled={busy || (!email && !phone && !telegram)}>{busy ? 'Saving…' : 'Track price'}</button>
    </form>
  );
}
