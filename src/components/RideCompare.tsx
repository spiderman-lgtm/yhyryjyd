'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { callApi } from '@/lib/api-client';
import { inr } from '@/lib/format';
import StoreIcon from './StoreIcon';
import 'leaflet/dist/leaflet.css';

type Kind = 'Bike' | 'Auto' | 'Cab' | 'Cab XL';
type Fare = { app: string; domain: string; kind: Kind; label: string; low: number; high: number; ref?: number; note?: string; link: string };
type Result = { from: Place; to: Place; km: number; min: number; road: boolean; line: [number, number][]; fares: Fare[]; map: string; city: string; maps?: 'google' | 'osm' };
type Place = { id?: string; name: string; area?: string; lat: number; lng: number };

const VEHICLES: { k: Kind; icon: string; t: string; sub: string }[] = [
  { k: 'Bike', icon: '🏍️', t: 'Bike', sub: '1 rider' },
  { k: 'Auto', icon: '🛺', t: 'Auto', sub: 'Up to 3' },
  { k: 'Cab', icon: '🚗', t: 'Cab', sub: 'Up to 4' },
  { k: 'Cab XL', icon: '🚙', t: 'XL / SUV', sub: 'Up to 6' },
];

// Leaflet (OpenStreetMap's map library) is bundled with the app and loaded the first time the map is shown.
const loadLeaflet = () => import('leaflet').then((m: any) => m.default ?? m);

const full = (p: Place) => (p.area && !p.name.includes(p.area) ? `${p.name}, ${p.area}` : p.name);

async function places(q: string, near?: Place | null): Promise<Place[]> {
  const p = new URLSearchParams(q ? { q } : {});
  if (near) p.set('lat', String(near.lat)), p.set('lng', String(near.lng));
  const { data } = await callApi<{ places: Place[] }>(`/api/places?${p}`, { timeoutMs: 10_000 });
  return data.places || [];
}

function PlaceInput({ id, label, dot, value, onPick, near, extra }: { id: string; label: string; dot: string; value: Place | null; onPick: (p: Place) => void; near: Place | null; extra?: React.ReactNode }) {
  const [text, setText] = useState(value?.name ?? '');
  const [list, setList] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const typed = useRef(false);
  useEffect(() => {
    if (value && !typed.current) setText(value.name);
  }, [value]);
  useEffect(() => {
    if (!typed.current || text.trim().length < 2) return setList([]);
    setBusy(true);
    const t = setTimeout(() => places(text.trim(), near).then((l) => (setList(l), setOpen(true))).finally(() => setBusy(false)), 300);
    return () => clearTimeout(t);
  }, [text, near]);
  return (
    <div className="relative">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <span className={`absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${dot}`} aria-hidden="true" />
        <input
          id={id}
          className="input pl-8"
          autoComplete="off"
          placeholder="Search area, landmark or street"
          value={text}
          onChange={(e) => ((typed.current = true), setText(e.target.value))}
          onFocus={() => list.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {busy && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-mute">…</span>}
      </div>
      {extra}
      {open && list.length > 0 && (
        <ul className="absolute z-[1000] mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {list.map((p, i) => (
            <li key={`${p.lat},${p.lng},${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  typed.current = false;
                  setText(p.name);
                  setOpen(false);
                  // A Google suggestion carries an id; its point is looked up on pick.
                  if (p.id && !p.lat) {
                    const { data } = await callApi<{ places: Place[] }>(`/api/places?id=${encodeURIComponent(p.id)}`);
                    const hit = data.places?.[0];
                    if (hit) onPick({ ...hit, name: p.name, area: p.area || hit.area });
                  } else onPick(p);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span aria-hidden="true">📍</span>
                <span className="min-w-0">
                  <b className="block truncate">{p.name}</b>
                  {p.area && <span className="block truncate text-xs text-ink-mute">{p.area}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The trip on Google Maps (its standard embed, no key needed): the route once pickup and drop are set,
// otherwise the one point chosen.
function GoogleMap({ from, to }: { from: Place | null; to: Place | null }) {
  const ll = (p: Place) => `${p.lat},${p.lng}`;
  const src =
    from && to
      ? `https://maps.google.com/maps?saddr=${ll(from)}&daddr=${ll(to)}&output=embed`
      : from || to
        ? `https://maps.google.com/maps?q=${ll((from || to)!)}&z=15&output=embed`
        : 'https://maps.google.com/maps?q=India&z=5&output=embed';
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <iframe title="Trip on Google Maps" src={src} className="h-80 w-full border-0" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
    </div>
  );
}

function TripMap({ from, to, line, onMove }: { from: Place | null; to: Place | null; line: [number, number][]; onMove: (which: 'from' | 'to', p: Place) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const m = useRef<{ map: any; a: any; b: any; line: any; L: any } | null>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  const state = useRef({ from, to });
  state.current = { from, to };

  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L: any) => {
      if (dead || !box.current || m.current) return;
      const map = L.map(box.current, { zoomControl: true }).setView([22.72, 75.86], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      const pin = (color: string, letter: string) =>
        L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 28], html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;box-shadow:0 2px 6px #0004"><b style="transform:rotate(45deg);font:700 12px system-ui">${letter}</b></div>` });
      const named = async (which: 'from' | 'to', ll: { lat: number; lng: number }) => {
        const hit = (await places('', { name: '', ...ll }).catch(() => []))[0];
        move.current(which, { name: hit?.name ? `${hit.name}${hit.area ? ', ' + hit.area.split(',')[0] : ''}` : 'Pinned location', lat: ll.lat, lng: ll.lng });
      };
      const marker = (which: 'from' | 'to', color: string, letter: string) => {
        const mk = L.marker([0, 0], { draggable: true, icon: pin(color, letter) });
        mk.on('dragend', () => named(which, mk.getLatLng()));
        return mk;
      };
      // Tapping the map drops the pickup first, then the drop.
      map.on('click', (e: any) => named(!state.current.from ? 'from' : 'to', e.latlng));
      m.current = { map, L, a: marker('from', '#16a34a', 'A'), b: marker('to', '#dc2626', 'B'), line: null };
      setTick((t) => t + 1);
    }).catch(() => setFailed(true));
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    const c = m.current;
    if (!c) return;
    for (const [mk, p] of [[c.a, from], [c.b, to]] as const) {
      if (p) mk.setLatLng([p.lat, p.lng]).addTo(c.map);
      else mk.remove();
    }
    c.line?.remove();
    c.line = line.length ? c.L.polyline(line, { color: '#ea580c', weight: 5, opacity: 0.85 }).addTo(c.map) : null;
    const pts = [from, to].filter(Boolean).map((p) => [p!.lat, p!.lng]);
    if (c.line) c.map.fitBounds(c.line.getBounds(), { padding: [30, 30] });
    else if (pts.length === 2) c.map.fitBounds(pts, { padding: [40, 40] });
    else if (pts.length === 1) c.map.setView(pts[0], 15);
  }, [from, to, line, tick]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200">
      <div ref={box} className="h-72 w-full bg-slate-100 sm:h-80" />
      {failed && <p className="absolute inset-0 grid place-items-center text-sm text-ink-mute">The map could not load — the search above still works.</p>}
      <p className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-lg bg-white/90 px-2 py-1 text-[11px] text-ink-soft shadow">Tap the map or drag a pin to set the exact spot</p>
    </div>
  );
}

// "My app showed ₹X": the shopper's real price corrects this city's estimates for everyone.
function ReportPrice({ fare, city }: { fare: Fare; city: string }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState('');
  if (!fare.ref || !city) return null;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const actual = Number(val.replace(/[^\d.]/g, ''));
    if (!actual) return setMsg('Enter the price your app showed.');
    const { ok, data } = await callApi('/api/rides/report', { body: { app: fare.app, label: fare.label, city, estimate: fare.ref, actual } });
    setMsg(ok ? 'Thanks! Fares here now use real prices like yours.' : data.error || 'Could not send.');
    if (ok) setOpen(false);
  }
  return (
    <div className="px-3 pb-2 pt-1 text-xs">
      {!open ? (
        <button type="button" onClick={() => (setOpen(true), setMsg(''))} className="text-ink-mute underline hover:text-brand">
          {msg || `${fare.app} showed a different price?`}
        </button>
      ) : (
        <form onSubmit={send} className="flex items-center gap-2">
          <span className="text-ink-soft">{fare.app} {fare.label} showed ₹</span>
          <input autoFocus inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} className="input w-24 py-1 text-xs" placeholder="e.g. 60" aria-label={`Price ${fare.app} showed`} />
          <button className="btn-dark px-3 py-1 text-xs">Send</button>
          <button type="button" onClick={() => setOpen(false)} className="text-ink-mute">✕</button>
          {msg && <span className="text-red-600">{msg}</span>}
        </form>
      )}
    </div>
  );
}

export default function RideCompare({ initial }: { initial: { from: string; to: string; city: string; vehicle?: string } }) {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [kind, setKind] = useState<Kind>((VEHICLES.find((v) => v.k === initial.vehicle)?.k as Kind) || 'Bike');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<Result | null>(null);

  const compare = useCallback(async (a: Place | null, b: Place | null, text?: { from: string; to: string; city: string }) => {
    if (!text && (!a || !b)) return;
    setBusy(true);
    setError('');
    const q = new URLSearchParams(
      text
        ? text
        : { from: full(a!), to: full(b!), from_lat: String(a!.lat), from_lng: String(a!.lng), to_lat: String(b!.lat), to_lng: String(b!.lng) },
    );
    const { ok, data } = await callApi<Result>(`/api/rides?${q}`, { timeoutMs: 40_000 });
    setBusy(false);
    if (!ok) return setError(data.error || 'Could not compare fares right now.');
    setRes(data);
    if (text) setFrom(data.from), setTo(data.to);
  }, []);

  // A shared link (/rides?from=…&to=…) runs straight away; otherwise the pickup starts at where the shopper is,
  // like the ride apps (the browser asks once; saying no just leaves the box empty).
  useEffect(() => {
    if (initial.from && initial.to) void compare(null, null, { from: initial.from, to: initial.to, city: initial.city });
    else myLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, compare]);

  // Re-compare whenever both points are set or one moves.
  useEffect(() => {
    if (from && to && (res?.from.lat !== from.lat || res?.from.lng !== from.lng || res?.to.lat !== to.lat || res?.to.lng !== to.lng)) void compare(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search);
      q.set('vehicle', kind);
      history.replaceState(null, '', `/rides?${q}`);
    } catch {}
  }, [kind]);

  function myLocation(quiet = false) {
    if (!navigator.geolocation) return quiet ? undefined : setError('Your browser cannot share its location. Search for the place instead.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const hit = (await places('', { name: '', ...ll }).catch(() => []))[0];
        setFrom({ name: hit ? `${hit.name}${hit.area ? ', ' + hit.area.split(',')[0] : ''}` : 'My location', ...ll });
        setLocating(false);
      },
      () => (setLocating(false), quiet ? undefined : setError('Location permission was not given. Search for the place instead.')),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const shown = (res?.fares || []).filter((f) => f.kind === kind).sort((a, b) => a.low - b.low);
  const cheapest = shown[0];
  const v = VEHICLES.find((x) => x.k === kind)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <div>
            <p className="label">Choose your ride</p>
            <div className="grid grid-cols-4 gap-2">
              {VEHICLES.map((x) => (
                <button key={x.k} type="button" onClick={() => setKind(x.k)} aria-pressed={kind === x.k} className={`rounded-xl border-2 px-1 py-2 text-center transition ${kind === x.k ? 'border-brand bg-brand-light' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <span className="block text-2xl" aria-hidden="true">{x.icon}</span>
                  <span className="block text-sm font-bold">{x.t}</span>
                  <span className="block text-[11px] text-ink-mute">{x.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <PlaceInput
            id="r-from"
            label="Pickup"
            dot="bg-green-600"
            value={from}
            onPick={setFrom}
            near={to}
            extra={
              <button type="button" onClick={() => myLocation()} disabled={locating} className="mt-1.5 text-xs font-semibold text-brand">
                {locating ? 'Finding you…' : '◎ Use my current location'}
              </button>
            }
          />
          <div className="-my-2 flex justify-center">
            <button type="button" onClick={() => (setFrom(to), setTo(from))} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-slate-50" aria-label="Swap pickup and drop">⇅ Swap</button>
          </div>
          <PlaceInput id="r-to" label="Drop" dot="bg-red-600" value={to} onPick={setTo} near={from} />
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <p className="text-xs text-ink-mute">Pick from the suggestions, use your location, or tap the map. Free, no sign-in needed.</p>
        </div>
        <GoogleMap from={from} to={to} />
        {/* Google's embed can't take a tap, so the exact spot is set on a pin map when needed. */}
        <button type="button" onClick={() => setPinning((v) => !v)} className="text-xs font-semibold text-brand">
          {pinning ? 'Hide pin map' : '📍 Set the exact spot by dragging a pin'}
        </button>
        {pinning && <TripMap from={from} to={to} line={res?.line ?? []} onMove={(w, p) => (w === 'from' ? setFrom(p) : setTo(p))} />}
      </div>

      <div className="space-y-3">
        {!res && !busy && (
          <div className="card p-8 text-center text-ink-soft">
            <div className="text-4xl" aria-hidden="true">{v.icon}</div>
            <p className="mt-2">Set your pickup and drop to compare <b>{v.t.toLowerCase()}</b> fares on Rapido, Ola, Uber, Namma Yatri and inDrive.</p>
          </div>
        )}
        {busy && [0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
        {res && !busy && (
          <>
            <div className="card flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
              <span className="min-w-0 flex-1">
                <b className="block truncate">🟢 {res.from.name}</b>
                <span className="block truncate text-ink-soft">🔴 {res.to.name}</span>
              </span>
              <span className="text-right font-semibold">
                {res.km} km · ~{res.min} min
                <span className="block text-[11px] font-normal text-ink-mute">{res.maps === 'google' ? 'Route & traffic from Google Maps' : 'Route from OpenStreetMap'}</span>
              </span>
            </div>
            <h2 className="pt-1 text-lg font-extrabold">
              {v.icon} {v.t} fares on every app
            </h2>
            {shown.length === 0 && <div className="card p-5 text-sm text-ink-soft">No app offers a {v.t.toLowerCase()} on this trip. Try another ride type.</div>}
            <ul className="space-y-2">
              {shown.map((f) => {
                const best = f === cheapest;
                return (
                  <li key={`${f.app}-${f.label}`} className={`rounded-xl border ${best ? 'border-deal/40 bg-deal-light' : 'border-slate-200 bg-white'}`}>
                    <a href={f.link} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/60">
                      <StoreIcon store={f.app} domain={f.domain} className="h-10 w-10 rounded-xl text-sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{f.app}</span>
                        <span className="block text-xs text-ink-mute">
                          {f.label}
                          {f.note && ` · ${f.note}`}
                        </span>
                        <span className={`block text-xs font-semibold ${best ? 'text-deal' : 'text-ink-soft'}`}>
                          {best ? `Cheapest ${v.t.toLowerCase()}` : `${inr(f.low - cheapest.low)} more than ${cheapest.app}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-lg font-extrabold ${best ? 'text-deal' : ''}`}>{inr(f.low)}–{inr(f.high).replace('₹', '')}</span>
                        <span className="block text-xs font-semibold text-brand">Book on {f.app} ›</span>
                      </span>
                    </a>
                    <ReportPrice fare={f} city={res.city} />
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
