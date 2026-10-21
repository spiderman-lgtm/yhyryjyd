'use client';

import { useMemo, useRef, useState } from 'react';
import { inr } from '@/lib/format';

type Pt = { price: number; at: string };
export type StoreSeries = { store: string; color: string; points: Pt[]; live: boolean; current: number | null; variant: boolean };
type Line = { store: string; color: string; pts: { price: number; t: number }[]; variant: boolean; main: boolean };
const RANGES = [
  { k: '1M', days: 30 },
  { k: '3M', days: 90 },
  { k: 'Max', days: 0 },
] as const;

const W = 960;
const H = 300;
const P = { l: 70, r: 20, t: 20, b: 34 };
const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const short = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `₹${Math.round(n)}`);

// The points inside the range, starting with the price in force when the range begins and, while the
// price is still offered, extended to now.
function clip(points: Pt[], since: number, now: number | null) {
  const all = points.map((h) => ({ price: h.price, t: Date.parse(h.at) })).sort((a, b) => a.t - b.t);
  const before = all.filter((p) => p.t < since).pop();
  const inRange = all.filter((p) => p.t >= since);
  const out = before ? [{ price: before.price, t: since }, ...inRange] : inRange;
  if (out.length && now !== null) out.push({ price: now, t: Date.now() });
  return out;
}

const priceAt = (pts: { price: number; t: number }[], t: number) => {
  let v: number | null = null;
  for (const p of pts) if (p.t <= t) v = p.price;
  return v;
};

export default function HistoryChart({ history, current, store = 'This store', color = '#ea580c', stores = [] }: { history: Pt[]; current: number; store?: string; color?: string; stores?: StoreSeries[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['k']>('Max');
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const svg = useRef<SVGSVGElement>(null);

  const { pts, lines } = useMemo(() => {
    const days = RANGES.find((r) => r.k === range)!.days;
    const since = days ? Date.now() - days * 86400_000 : 0;
    const main = clip(history, since, current);
    const others: Line[] = stores
      .map((s) => ({ store: s.store, color: s.color, pts: clip(s.points, since, s.live ? s.current : null), variant: s.variant, main: false }))
      .filter((l) => l.pts.length > 0);
    return { pts: main, lines: [{ store, color, pts: main, variant: false, main: true }, ...others] };
  }, [history, current, range, stores, store, color]);

  const shown = lines.filter((l) => l.main || !hidden.has(l.store));
  const hasOthers = lines.length > 1;

  if (pts.length < 2 || (history.length < 2 && !hasOthers)) {
    return (
      <div className="grid h-56 place-items-center rounded-xl bg-slate-50 px-6 text-center text-sm text-ink-mute">
        Price history starts today. DealRadar re-checks this product regularly — the graph fills in with every rise and drop.
      </div>
    );
  }

  const prices = shown.flatMap((l) => l.pts.map((p) => p.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.2 || max * 0.05;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const t0 = Math.min(...shown.map((l) => l.pts[0].t));
  const t1 = Math.max(...shown.map((l) => l.pts[l.pts.length - 1].t), t0 + 1);
  const x = (t: number) => P.l + ((t - t0) / (t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const stepPath = (ps: { price: number; t: number }[]) => {
    let d = `M${x(ps[0].t)},${y(ps[0].price)}`;
    for (let i = 1; i < ps.length; i++) d += ` H${x(ps[i].t)} V${y(ps[i].price)}`;
    return d;
  };
  const changesOf = (ps: { price: number; t: number }[]) =>
    ps.slice(1).map((p, i) => ({ ...p, prev: ps[i].price })).filter((p) => p.price !== p.prev);

  const line = stepPath(pts);
  const area = `${line} V${H - P.b} H${x(pts[0].t)} Z`;

  const changes = pts.slice(1, -1).map((p, i) => ({ ...p, prev: pts[i].price })).filter((p) => p.price !== p.prev);
  const drops = changes.filter((c) => c.price < c.prev).length;
  const rises = changes.length - drops;
  const lowPt = pts.reduce((a, b) => (b.price <= a.price ? b : a));
  const highPt = pts.reduce((a, b) => (b.price >= a.price ? b : a));
  let weighted = 0;
  for (let i = 0; i < pts.length - 1; i++) weighted += pts[i].price * (pts[i + 1].t - pts[i].t);
  const avg = weighted / (t1 - t0);

  const yTicks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const xTicks = Array.from({ length: 6 }, (_, i) => t0 + ((t1 - t0) * i) / 5);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svg.current!.getBoundingClientRect();
    const t = t0 + (((e.clientX - rect.left) / rect.width) * W - P.l) / (W - P.l - P.r) * (t1 - t0);
    setHover(Math.min(t1, Math.max(t0, t)));
  }

  // At the hovered time: every shown store's price then, and how this store's price had just moved.
  const h = hover !== null ? { t: hover, price: priceAt(pts, hover) } : null;
  const hIdx = h ? pts.reduce((a, p, i) => (p.t <= h.t ? i : a), 0) : 0;
  const hPrev = h && hIdx > 0 ? pts[hIdx - 1].price : undefined;
  const hRows = h ? shown.map((l) => ({ l, price: priceAt(l.pts, h.t) })).filter((r) => r.price !== null).sort((a, b) => a.price! - b.price!) : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-deal-light px-2.5 py-1 font-semibold text-deal">Lowest {inr(lowPt.price)} · {fmtDate(lowPt.t)}</span>
          <span className="rounded-lg bg-red-50 px-2.5 py-1 font-semibold text-red-600">Highest {inr(highPt.price)} · {fmtDate(highPt.t)}</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-ink-soft">Average {inr(avg)}</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-ink-soft">▼ {drops} drops · ▲ {rises} rises</span>
        </div>
        <div className="flex rounded-full bg-slate-100 p-1 text-sm">
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRange(r.k)} className={`rounded-full px-3 py-1 ${range === r.k ? 'bg-white font-semibold text-brand shadow-sm' : 'text-ink-soft'}`}>
              {r.k === '1M' ? '1 Month' : r.k === '3M' ? '3 Months' : 'Max'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
          aria-label={`Price history: lowest ${inr(lowPt.price)}, highest ${inr(highPt.price)}, ${drops} drops and ${rises} rises`}>
          <defs>
            <linearGradient id="hc-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fca5a5" stopOpacity="0.75" />
              <stop offset="0.5" stopColor="#fde68a" stopOpacity="0.5" />
              <stop offset="1" stopColor="#bbf7d0" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
              <text x={P.l - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#64748b">{hi - lo < 6000 ? inr(v) : short(v)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize="12" fill="#64748b">{fmtDate(t)}</text>
          ))}
          <path key={`a-${range}`} d={area} fill="url(#hc-fill)" className="fade-area" />
          {shown.slice(1).map((l) => (
            <g key={`${l.store}-${range}`}>
              {l.variant ? (
                <path d={stepPath(l.pts)} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeOpacity="0.9" strokeDasharray="6 4" />
              ) : (
                <path d={stepPath(l.pts)} pathLength={1} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeOpacity="0.9" className="draw-line" />
              )}
              <circle cx={x(l.pts[0].t)} cy={y(l.pts[0].price)} r="3.5" fill={l.color} />
              {changesOf(l.pts).slice(0, 40).map((c) => {
                const cx = x(c.t);
                const cy = y(c.price);
                return c.price < c.prev ? (
                  <path key={c.t} d={`M${cx - 4},${cy + 6} h8 l-4,6 z`} fill="#16a34a" stroke={l.color} strokeWidth="1" />
                ) : (
                  <path key={c.t} d={`M${cx - 4},${cy - 6} h8 l-4,-6 z`} fill="#dc2626" stroke={l.color} strokeWidth="1" />
                );
              })}
            </g>
          ))}
          <path key={`l-${range}`} d={line} pathLength={1} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" className="draw-line" />
          {changes.length <= 60 &&
            changes.map((c) => {
              const down = c.price < c.prev;
              const cx = x(c.t);
              const cy = y(c.price);
              return down ? (
                <path key={c.t} d={`M${cx - 6},${cy + 8} h12 l-6,9 z`} fill="#16a34a" />
              ) : (
                <path key={c.t} d={`M${cx - 6},${cy - 8} h12 l-6,-9 z`} fill="#dc2626" />
              );
            })}
          <circle cx={x(lowPt.t)} cy={y(lowPt.price)} r="5" fill="#16a34a" stroke="#fff" strokeWidth="2" />
          {h && (
            <g>
              <line x1={x(h.t)} x2={x(h.t)} y1={P.t} y2={H - P.b} stroke="#0f172a" strokeDasharray="4 4" />
              {hRows.map((r) => <circle key={r.l.store} cx={x(h.t)} cy={y(r.price!)} r={r.l.main ? 5 : 4} fill={r.l.color} stroke="#fff" strokeWidth="1.5" />)}
            </g>
          )}
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-2 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: `${Math.min(80, Math.max(2, (x(h.t) / W) * 100 - 8))}%` }}>
            <div className="font-semibold">{fmtDate(h.t)}</div>
            {hasOthers ? (
              <div className="mt-1 space-y-0.5">
                {hRows.map((r) => (
                  <div key={r.l.store} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="h-2 w-2 rounded-full" style={{ background: r.l.color }} />
                    <span className={r.l.main ? 'font-bold' : ''}>{r.l.store}</span>
                    <span className="ml-auto pl-3 font-bold">{inr(r.price!)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-base font-bold">{h.price !== null ? inr(h.price) : '—'}</div>
            )}
            {hPrev !== undefined && h.price !== null && hPrev !== h.price && (
              <div className={h.price < hPrev ? 'text-green-300' : 'text-red-300'}>
                {store}: {h.price < hPrev ? '▼' : '▲'} {inr(Math.abs(h.price - hPrev))} ({(((h.price - hPrev) / hPrev) * 100).toFixed(1)}%)
              </div>
            )}
          </div>
        )}
      </div>
      {hasOthers && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {lines.map((l) => {
            const off = !l.main && hidden.has(l.store);
            const ch = changesOf(l.pts);
            const down = ch.filter((c) => c.price < c.prev).length;
            return (
              <button
                key={l.store}
                disabled={l.main}
                onClick={() => setHidden((s) => { const n = new Set(s); if (n.has(l.store)) n.delete(l.store); else n.add(l.store); return n; })}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${off ? 'border-slate-200 text-ink-mute line-through' : 'border-slate-300 bg-white font-semibold'}`}
                title={l.main ? 'The store you are viewing' : off ? 'Show this store' : 'Hide this store'}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                {l.store}
                {l.variant && <span className="font-normal text-ink-mute">(variant)</span>}
                <span className="font-normal text-ink-mute">{inr(l.pts[l.pts.length - 1].price)}</span>
                {ch.length > 0 && <span className="font-normal text-ink-mute">· ▼{down} ▲{ch.length - down}</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-mute">
        <span className="text-deal">▼</span> price dropped · <span className="text-red-600">▲</span> price increased · prices recorded by DealRadar since {fmtDate(Date.parse(history[0].at))}
        {hasOthers && ' · other stores are drawn from each price comparison; dashed lines are a different size or colour'}
      </p>
    </div>
  );
}
