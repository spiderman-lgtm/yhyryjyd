'use client';

import { useEffect, useState } from 'react';

const IOS = 'https://apps.apple.com/app/id6759090472';
const ANDROID = 'https://play.google.com/store/apps/details?id=com.msg91.m91';

type Status = { team: null | { name: string } | { error: string }; shoppers: null | { phone: string } | { error: string } };

async function post(body: unknown) {
  const r = await fetch('/api/admin/m91', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}

// The owner's M91 setup: who gets woken and why, how to connect, and a test that rings a real phone.
export default function M91Setup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    post({ op: 'status' }).then(setStatus).catch((e) => setMsg(e.message));
  }, []);

  const run = async (label: string, body: unknown, done: (d: any) => string) => {
    setBusy(label);
    setMsg('');
    try {
      setMsg(done(await post(body)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const team = status?.team;
  const shoppers = status?.shoppers;
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-bold">📳 M91 — your phone rings when DealRadar needs you</h2>
        <p className="text-sm text-ink-soft">M91 rings at full volume, even on silent, until somebody answers — so nothing that stops shoppers' alerts waits until morning.</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 text-sm">
        <p className="font-semibold">Your team gets a ring when…</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
          <li>price checks stop running (shoppers stop getting alerts) → <i>I'll handle it · Seen</i></li>
          <li>Email, WhatsApp or Telegram alerts keep failing to send → <i>I'll handle it · Seen</i></li>
          <li>a store blocks DealRadar's price checks for 2 hours → <i>I'll handle it · Seen</i></li>
        </ul>
        <p className="mt-3 font-semibold">Shoppers get a ring when…</p>
        <ul className="mt-1 list-disc pl-5 text-ink-soft">
          <li>a product they track drops in price, if they ticked “Ring my phone when it drops” → <i>Open the deal · Not now</i></li>
        </ul>
      </div>

      <div className="text-sm">
        <p className="font-semibold">Set up your team</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-soft">
          <li>Install M91 on your phone — <a href={IOS} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">iOS</a> · <a href={ANDROID} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">Android</a></li>
          <li>In the app, create a channel called “DealRadar Ops” and add whoever should answer.</li>
          <li>Tap ✈ on that channel, copy the link, and send it to whoever looks after DealRadar's settings.</li>
        </ol>
        <p className="mt-1 text-xs text-ink-mute">Everyone in the channel needs M91 installed and the invitation accepted, or their phone stays silent.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {team === undefined || status === null ? (
            <span className="text-ink-mute">Checking…</span>
          ) : team && 'name' in team ? (
            <span className="text-emerald-700">✓ Connected to “{team.name}”</span>
          ) : team && 'error' in team ? (
            <span className="text-red-600">The team link does not work: {team.error}</span>
          ) : (
            <span className="text-ink-mute">Not connected yet.</span>
          )}
          {team && 'name' in team && (
            <button className="btn-ghost" disabled={busy === 'team'} onClick={() => run('team', { op: 'test-team' }, (d) => (d.delivered ? `Ringing ${d.delivered} phone${d.delivered > 1 ? 's' : ''} now.` : 'Nobody could be reached — the people need M91 installed and the invite accepted.'))}>
              {busy === 'team' ? 'Ringing…' : 'Ring my phone to test'}
            </button>
          )}
        </div>
      </div>

      <div className="text-sm">
        <p className="font-semibold">Shoppers' phone rings</p>
        {shoppers && 'phone' in shoppers ? (
          <>
            <p className="text-emerald-700">✓ On — shoppers see “Ring my phone when it drops” on every product.</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <label className="label" htmlFor="m91-shopper">Try it as a shopper</label>
                <input id="m91-shopper" className="input" placeholder="+91 98765 43210" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <button className="btn-ghost" disabled={!phone || busy === 'shop'} onClick={() => run('shop', { op: 'test-shopper', phone }, (d) => (d.reachable ? (d.delivered ? 'Ringing that phone now.' : 'Nobody could be reached on that number yet.') : 'Invite sent — open M91 on that phone, accept “DealRadar price alerts”, then test again.'))}>
                {busy === 'shop' ? 'Ringing…' : 'Ring this number'}
              </button>
            </div>
          </>
        ) : shoppers && 'error' in shoppers ? (
          <p className="text-red-600">Shopper rings do not work: {shoppers.error}</p>
        ) : (
          <p className="text-ink-mute">Off. Turned on by an M91 API key (M91 app → Settings → API keys), which goes with DealRadar's other private settings.</p>
        )}
      </div>

      {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{msg}</p>}
    </section>
  );
}
