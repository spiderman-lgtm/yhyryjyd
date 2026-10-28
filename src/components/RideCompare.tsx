'use client';

import { useEffect, useState } from 'react';
import { callApi } from '@/lib/api-client';
import { inr } from '@/lib/format';
import StoreIcon from './StoreIcon';

type Fare = { app: string; domain: string; kind: 'Bike' | 'Auto' | 'Cab' | 'Cab XL'; label: string; low: number; high: number; note?: string; link: string };
type Result = { from: { name: string }; to: { name: string }; km: number; min: number; road: boolean; fares: Fare[]; map: string };

const KINDS = [
  { k: 'all', t: 'All' },
  { k: 'Bike', t: '🏍️ Bike' },
  { k: 'Auto', t: '🛺 Auto' },
  { k: 'Cab', t: '🚗 Cab' },
  { k: 'Cab XL', t: '🚙 XL' },
] as const;

export default function RideCompare({ initial }: { initial: { from: string; to: string; city: string } }) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [city, setCity] = useState(initial.city);
  const [kind, setKind] = useState<(typeof KINDS)[number]['k']>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<Result | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!from.trim() || !to.trim()) return setError('Enter where you start and where you are going.');
    setBusy(true);
    setError('');
    const q = new URLSearchParams({ from, to, city });
    const { ok, data } = await callApi<Result>(`/api/rides?${q}`, { timeoutMs: 40_000 });
    setBusy(false);
    if (!ok) return setError(data.error || 'Could not compare fares right now.');
    setRes(data);
    try {
      history.replaceState(null, '', `/rides?${q}`);
      localStorage.setItem('dr_ride_city', city);
    } catch {}
  }

  useEffect(() => {
    if (!initial.city) {
      try {
        const c = localStorage.getItem('dr_ride_city');
        if (c) setCity(c);
      } catch {}
    }
    if (initial.from && initial.to) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = (res?.fares || []).filter((f) => kind === 'all' || f.kind === kind);
  const cheapest = shown[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <form onSubmit={search} className="card h-fit space-y-3 p-5">
        <div>
          <label className="label" htmlFor="r-from">From</label>
          <input id="r-from" className="input" placeholder="e.g. Vijay Nagar" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex justify-center">
          <button type="button" onClick={() => (setFrom(to), setTo(from))} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-slate-50" aria-label="Swap from and to">⇅ Swap</button>
        </div>
        <div>
          <label className="label" htmlFor="r-to">To</label>
          <input id="r-to" className="input" placeholder="e.g. LIG Square" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="r-city">City</label>
          <input id="r-city" className="input" placeholder="e.g. Indore" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button className="btn-dark w-full py-3" disabled={busy}>{busy ? 'Comparing fares…' : 'Compare fares'}</button>
        <p className="text-xs text-ink-mute">Free, no sign-in needed.</p>
      </form>

      <div className="space-y-3">
        {!res && !busy && (
          <div className="card p-8 text-center text-ink-soft">
            <div className="text-4xl">🛺 🏍️ 🚗</div>
            <p className="mt-2">Enter your trip to see fares on Rapido, Ola, Uber, Namma Yatri and inDrive.</p>
          </div>
        )}
        {busy && [0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
        {res && !busy && (
          <>
            <div className="card flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
              <span className="min-w-0 flex-1">
                <b className="block truncate">{res.from.name}</b>
                <span className="block truncate text-ink-mute">→ {res.to.name}</span>
              </span>
              <span className="font-semibold">{res.km} km · ~{res.min} min</span>
              <a href={res.map} target="_blank" rel="noopener" className="text-xs font-semibold text-brand underline">Check route on map</a>
            </div>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button key={k.k} type="button" onClick={() => setKind(k.k)} className={kind === k.k ? 'chip-on' : 'chip-off'} aria-pressed={kind === k.k}>{k.t}</button>
              ))}
            </div>
            <ul className="space-y-2">
              {shown.map((f) => {
                const best = f === cheapest;
                return (
                  <li key={`${f.app}-${f.label}`}>
                    <a href={f.link} target="_blank" rel="noopener" className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:-translate-y-0.5 hover:shadow-md ${best ? 'border-deal/40 bg-deal-light' : 'border-slate-200 bg-white'}`}>
                      <StoreIcon store={f.app} domain={f.domain} className="h-9 w-9 rounded-lg text-sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{f.app} · {f.label}</span>
                        <span className="block text-xs text-ink-mute">
                          {best ? <b className="text-deal">Cheapest{kind === 'all' ? '' : ` ${kind.toLowerCase()}`}</b> : f.kind}
                          {f.note && ` · ${f.note}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block font-bold ${best ? 'text-deal' : ''}`}>{inr(f.low)}–{inr(f.high).replace('₹', '')}</span>
                        <span className="block text-xs font-semibold text-brand">Book on {f.app} ›</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-ink-mute">
              Estimated from each app’s published rate card for this {res.road ? 'road route' : 'distance'}. Surge, tolls and waiting change the final price — the app shows the exact fare before you book. Uber and Ola open with your trip filled in.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
