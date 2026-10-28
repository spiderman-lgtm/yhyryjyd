'use client';

import { useEffect, useState } from 'react';
import { callApi } from '@/lib/api-client';
import { inr } from '@/lib/format';
import StoreIcon from './StoreIcon';

type Mode = 'bus' | 'train' | 'flight';
type City = { name: string; air?: string; rail?: string };
type Site = { name: string; domain: string; url: string };
type Option = { name: string; detail: string; depart: string; arrive: string; duration: string; price: number; site: string; url: string; final?: number; coupon?: { code: string | null; text: string; off: number } };
type Offer = { site: string; code: string | null; text: string; source: 'dealradar' | 'web' };
type Result = { from: City; to: City; date: string; links: Site[]; options: Option[]; offers?: Offer[]; note?: string };

const ICON: Record<Mode, string> = { bus: '🚌', train: '🚆', flight: '✈️' };
const tomorrow = () => new Date(Date.now() + 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);

// Bus, train or flight between two cities: live fares where found, and every booking site's search for the trip.
export default function TravelCompare({ mode }: { mode: Mode }) {
  const [cities, setCities] = useState<City[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(tomorrow());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    callApi<{ cities: City[] }>('/api/travel?cities=1').then(({ data }) => setCities(data.cities || []));
    try {
      setFrom(localStorage.getItem('dr_travel_from') || '');
    } catch {}
  }, []);
  useEffect(() => setRes(null), [mode]);

  const usable = cities.filter((c) => (mode === 'flight' ? c.air : mode === 'train' ? c.rail : true));

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setRes(null);
    const { ok, data } = await callApi<Result>(`/api/travel?${new URLSearchParams({ mode, from, to, date })}`, { timeoutMs: 100_000 });
    setBusy(false);
    if (!ok) return setError(data.error || 'Could not compare right now.');
    setRes(data);
    try {
      localStorage.setItem('dr_travel_from', from);
    } catch {}
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <form onSubmit={search} className="card h-fit space-y-3 p-5">
        <datalist id="travel-cities">{usable.map((c) => <option key={c.name} value={c.name} />)}</datalist>
        <div>
          <label className="label" htmlFor="t-from">From</label>
          <input id="t-from" list="travel-cities" className="input" placeholder="e.g. Indore" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </div>
        <div className="-my-1 flex justify-center">
          <button type="button" onClick={() => (setFrom(to), setTo(from))} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-slate-50">⇅ Swap</button>
        </div>
        <div>
          <label className="label" htmlFor="t-to">To</label>
          <input id="t-to" list="travel-cities" className="input" placeholder="e.g. Delhi" value={to} onChange={(e) => setTo(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="t-date">Date</label>
          <input id="t-date" type="date" className="input" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button className="btn-dark w-full py-3" disabled={busy}>{busy ? 'Checking every site…' : `Compare ${mode === 'bus' ? 'buses' : mode === 'train' ? 'trains' : 'flights'}`}</button>
      </form>

      <div className="space-y-3">
        {!res && !busy && (
          <div className="card p-8 text-center text-ink-soft">
            <div className="text-4xl" aria-hidden="true">{ICON[mode]}</div>
            <p className="mt-2">Enter your trip to compare {mode === 'bus' ? 'redBus, AbhiBus, MakeMyTrip and more' : mode === 'train' ? 'IRCTC, ixigo, ConfirmTkt and RailYatri' : 'Google Flights, MakeMyTrip, ixigo, Cleartrip and more'}.</p>
          </div>
        )}
        {busy && [0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
        {res && (
          <>
            <div className="card p-4 text-sm">
              <b>{ICON[mode]} {res.from.name} → {res.to.name}</b>
              <span className="ml-2 text-ink-mute">{new Date(res.date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
            </div>
            {res.options.length > 0 ? (
              <>
                <h3 className="font-extrabold">Fares found today · cheapest after coupons first</h3>
                <ul className="space-y-2">
                  {res.options.map((o, i) => (
                    <li key={`${o.name}-${o.depart}-${o.detail}-${i}`}>
                      <a href={o.url} target="_blank" rel="noopener nofollow" className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition hover:shadow-md ${i === 0 ? 'border-deal/40 bg-deal-light' : 'border-slate-200 bg-white'}`}>
                        <span className="min-w-0 flex-1">
                          <b className="block truncate">{o.name}</b>
                          <span className="block text-xs text-ink-soft">{[o.depart && o.arrive ? `${o.depart} → ${o.arrive}` : '', o.duration, o.detail].filter(Boolean).join(' · ')}</span>
                          <span className="block text-xs text-ink-mute">on {o.site}{i === 0 ? ' · Cheapest' : ''}</span>
                          {o.coupon && (
                            <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-0.5 text-xs ring-1 ring-dashed ring-brand/50">
                              🏷️ {o.coupon.code ? <b className="font-mono text-brand">{o.coupon.code}</b> : <b>Offer</b>} saves {inr(o.coupon.off)}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={`block text-lg font-extrabold ${i === 0 ? 'text-deal' : ''}`}>{inr(o.final ?? o.price)}</span>
                          {o.final !== undefined && o.final < o.price && <span className="block text-xs text-ink-mute line-through">{inr(o.price)}</span>}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                {/* No fares found right now: every competitor still listed by name, each opening its own search for this trip. */}
                <h3 className="font-extrabold">{res.links.length} sites to compare</h3>
                <ul className="space-y-2">
                  {res.links.map((s) => (
                    <li key={s.name}>
                      <a href={s.url} target="_blank" rel="noopener nofollow" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition hover:-translate-y-0.5 hover:shadow-md">
                        <StoreIcon store={s.name} domain={s.domain} className="h-9 w-9 rounded-xl text-sm" />
                        <span className="min-w-0 flex-1">
                          <b className="block">{s.name}</b>
                          <span className="block text-xs text-ink-mute">{res.from.name} → {res.to.name}</span>
                        </span>
                        <span className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white">See fares ›</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-mute">Live fares will show here, cheapest first, as soon as fare search is back.</p>
              </>
            )}
            {(res.offers?.length ?? 0) > 0 && (
              <>
                <h3 className="pt-2 font-extrabold">Coupons to apply</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {res.offers!.map((o, i) => (
                    <li key={`${o.site}-${o.code}-${i}`} className="rounded-xl border-2 border-dashed border-brand/40 bg-brand-light p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <b>{o.site}</b>
                        {o.code ? (
                          <button type="button" onClick={() => navigator.clipboard?.writeText(o.code!).catch(() => {})} className="rounded-lg bg-white px-2 py-0.5 font-mono text-xs font-bold text-brand ring-1 ring-brand/40" title="Copy code">
                            {o.code} ⧉
                          </button>
                        ) : (
                          <span className="text-xs text-ink-mute">No code needed</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">{o.text}</p>
                      {o.source === 'dealradar' && <p className="mt-1 text-[11px] font-semibold text-deal">✓ Added by DealRadar</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {res.options.length > 0 && <h3 className="pt-2 font-extrabold">Compare on every site</h3>}
            {res.options.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {res.links.map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener nofollow" className="card flex items-center gap-2 px-3 py-2.5 text-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <StoreIcon store={s.name} domain={s.domain} className="h-7 w-7 rounded-lg text-xs" />
                  <b className="min-w-0 flex-1 truncate">{s.name}</b>
                  <span className="text-brand">›</span>
                </a>
              ))}
            </div>
            )}
            <p className="text-xs text-ink-mute">Fares change fast; the site shows the final price before you pay.</p>
          </>
        )}
      </div>
    </div>
  );
}
