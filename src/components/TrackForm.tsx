'use client';

import Link from 'next/link';
import { useState } from 'react';
import { callApi } from '@/lib/api-client';
import VerifyPhone from './VerifyPhone';

const DROPS = [
  { v: 0, t: 'Any drop' },
  { v: 5, t: '5% or more' },
  { v: 10, t: '10% or more' },
  { v: 20, t: '20% or more' },
];

export default function TrackForm({ productId, existing, defaultEmail = '', telegram: telegramOn = false, m91: m91On = false, verified: verified0 = { emails: [], phones: [] }, waVerify = false }: { productId: string; existing: boolean; defaultEmail?: string; telegram?: boolean; m91?: boolean; verified?: { emails: string[]; phones: string[] }; waVerify?: boolean }) {
  const [drop, setDrop] = useState(0);
  const [days, setDays] = useState<7 | 15>(7);
  const [email, setEmail] = useState(defaultEmail);
  // Numbers this account already verified come pre-filled, so a returning shopper sees no code.
  const [verifiedPhones, setVerifiedPhones] = useState(verified0.phones);
  const [phone, setPhone] = useState(verified0.phones[0] ? `+${verified0.phones[0]}` : '');
  const [emailPending, setEmailPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(existing);
  const [sentTo, setSentTo] = useState('');
  const [telegram, setTelegram] = useState(false);
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgLinked, setTgLinked] = useState(false);
  const [waSent, setWaSent] = useState(false);
  const [ring, setRing] = useState(false);
  const [ringPhone, setRingPhone] = useState(verified0.phones[0] ? `+${verified0.phones[0]}` : '');
  const [ringState, setRingState] = useState<null | { reachable: boolean; state: string }>(null);

  const isVerifiedNum = (v: string) => {
    const d = v.replace(/\D/g, '');
    return verifiedPhones.includes(d.length === 10 ? '91' + d : d);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { ok, data } = await callApi<Record<string, any>>('/api/alerts', {
      body: { product_id: productId, email, phone, telegram, m91: ring, m91_phone: ring ? ringPhone : '', tier: 'urgent', drop_percent: drop, window_days: days },
      timeoutMs: 25_000,
    });
    setBusy(false);
    if (!ok) return setError(data.error || 'Could not save.');
    if (data.confirmation) setSentTo(email);
    setTgLink(data.telegram_link ?? null);
    setTgCode(data.telegram_code ?? null);
    setTgLinked(!!data.telegram_linked);
    setWaSent(!!data.whatsapp_confirmation);
    setRingState(data.m91 ?? null);
    setEmailPending(!!data.email_pending);
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl bg-deal-light p-5 text-sm">
        <div className="text-base font-bold text-deal">You are tracking this price ✓</div>
        <p className="mt-1 text-ink-soft">
          {sentTo ? <>A confirmation with the product details is on its way to <b>{sentTo}</b>. </> : null}
          {emailPending ? <>📩 Open the email we sent to <b>{email}</b> and tap “Yes, send me price alerts” — email alerts start after that. </> : null}
          {waSent ? <>We sent a confirmation to your WhatsApp too. </> : null}
          {tgLinked ? <>Your Telegram has the confirmation. </> : null}
          We will message you as soon as it drops. You can change or stop it any time.
        </p>
        {tgLink && (
          <a href={tgLink} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] py-3 font-semibold text-white shadow-md hover:opacity-90">
            <span aria-hidden="true">✈️</span> Open Telegram &amp; press Start
          </a>
        )}
        {tgLink && (
          <p className="mt-1 text-xs text-ink-mute">
            Tap “Start” in the DealRadar bot and your confirmation and price drops arrive in Telegram.
            {tgCode && <> No Start button? Send this code to the bot: <b className="select-all font-mono text-sm text-ink">{tgCode}</b></>}
          </p>
        )}
        {ringState?.reachable && <p className="mt-2 text-ink-soft">🚨 <b>{ringPhone}</b> will ring the moment the price drops.</p>}
        {ringState && !ringState.reachable && (
          <div className="mt-3 rounded-xl border border-orange-200 bg-white p-3">
            <p className="font-semibold">📳 One step left for the phone ring</p>
            <p className="mt-1 text-ink-soft">
              Install the M91 app, sign in with <b>{ringPhone}</b>, and accept the invite from <b>DealRadar price alerts</b>. Until then your phone stays silent.
            </p>
            <div className="mt-2 flex gap-2">
              <a href="https://apps.apple.com/app/id6759090472" target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-xs">App Store</a>
              <a href="https://play.google.com/store/apps/details?id=com.msg91.m91" target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-xs">Google Play</a>
            </div>
          </div>
        )}
        <Link href="/alerts" className="mt-3 inline-block font-semibold text-brand underline">Manage my alerts</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-3">
        <div>
          <label className="label" htmlFor="tf-email">Email</label>
          <input id="tf-email" type="email" className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <VerifyPhone id="tf-phone" label="WhatsApp number" value={phone} onChange={setPhone} verified={verifiedPhones} onVerified={(p) => setVerifiedPhones((v) => [...new Set([...v, p])])} waVerify={waVerify} />
      </div>
      <p className="-mt-3 text-xs text-ink-mute">Fill one or both. We only use them for this price alert.</p>

      {/* Telegram and the phone ring are extras: a button each, opened only when the shopper wants it. */}
      {((telegramOn && !telegram) || (m91On && !ring)) && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-mute">Optional</p>
          <div className="flex flex-wrap gap-2">
            {telegramOn && !telegram && (
              <button type="button" onClick={() => setTelegram(true)} className="flex items-center gap-1.5 rounded-full border border-[#229ED9] px-3 py-1.5 text-sm font-semibold text-[#1b84b8] hover:bg-sky-50">
                <span aria-hidden="true">✈️</span> + Telegram
              </button>
            )}
            {m91On && !ring && (
              <button type="button" onClick={() => setRing(true)} className="flex items-center gap-1.5 rounded-full border border-red-400 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                <span aria-hidden="true">🚨</span> + Most urgent alert
              </button>
            )}
          </div>
        </div>
      )}

      {telegramOn && telegram && (
        <div className="flex items-center gap-3 rounded-xl border border-[#229ED9] bg-sky-50 px-3 py-2.5 text-sm">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#229ED9] text-sm text-white" aria-hidden="true">✈️</span>
          <span className="flex-1">
            <b>Telegram alerts on</b>
            <span className="block text-xs text-ink-mute">One tap to connect after you save — photo, price and a Buy button in every message.</span>
          </span>
          <button type="button" onClick={() => setTelegram(false)} className="text-ink-mute hover:text-ink" aria-label="Remove Telegram">✕</button>
        </div>
      )}

      {m91On && ring && (
        <div className="rounded-xl border border-red-400 bg-red-50 p-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-red-500 text-base text-white" aria-hidden="true">📳</span>
            <span className="flex-1">
              <b>🚨 Most urgent alert: ring my phone</b>
              <span className="block text-xs text-ink-mute">Your phone rings at full volume, even on silent, until you answer. Uses the free M91 app.</span>
            </span>
            <button type="button" onClick={() => setRing(false)} className="text-ink-mute hover:text-ink" aria-label="Remove most urgent alert">✕</button>
          </div>
          <div className="mt-3">
            <VerifyPhone id="tf-m91" label="Mobile number to ring" value={ringPhone} onChange={setRingPhone} verified={verifiedPhones} onVerified={(p) => setVerifiedPhones((v) => [...new Set([...v, p])])} waVerify={waVerify} />
          </div>
        </div>
      )}

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
      {email && !verified0.emails.includes(email.trim().toLowerCase()) && <p className="-mt-2 text-xs text-ink-mute">We'll email {email.trim()} a link to confirm it's yours before any alert goes there.</p>}
      <button className="btn-dark w-full py-3" disabled={busy || (!email && !phone && !telegram && !ring) || (ring && !ringPhone) || (!!phone && !isVerifiedNum(phone)) || (ring && !isVerifiedNum(ringPhone))}>{busy ? 'Saving…' : 'Track price'}</button>
    </form>
  );
}
