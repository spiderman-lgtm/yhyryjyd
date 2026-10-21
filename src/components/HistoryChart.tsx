'use client';

import { useMemo, useRef, useState } from 'react';
import { inr } from '@/lib/format';

type Pt = { price: number; at: string };
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

export default function HistoryChart({ history, current }: { history: Pt[]; current: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['k']>('Max');
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const pts = useMemo(() => {
    const days = RANGES.find((r) => r.k === range)!.days;
    const since = days ? Date.now() - days * 86400_000 : 0;
    const all = history.map((h) => ({ price: h.price, t: Date.parse(h.at) })).sort((a, b) => a.t - b.t);
    // Carry the price in force at the start of the range, and extend the line to now.
    const before = all.filter((p) => p.t < since).pop();
    const inRange = all.filter((p) => p.t >= since);
    const out = before ? [{ price: before.price, t: since }, ...inRange] : inRange;
    if (out.length) out.push({ price: current, t: Date.now() });
    return out;
  }, [history, current, range]);

  if (pts.length < 2 || history.length < 2) {
    return (
      <div className="grid h-56 place-items-center rounded-xl bg-slate-50 px-6 text-center text-sm text-ink-mute">
        Price history starts today. DealRadar re-checks this product regularly — the graph fills in with every rise and drop.
      </div>
    );
  }

  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.2 || max * 0.05;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const t0 = pts[0].t;
  const t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const x = (t: number) => P.l + ((t - t0) / (t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);

  let line = `M${x(pts[0].t)},${y(pts[0].price)}`;
  for (let i = 1; i < pts.length; i++) line += ` H${x(pts[i].t)} V${y(pts[i].price)}`;
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
    let idx = 0;
    for (let i = 0; i < pts.length; i++) if (pts[i].t <= t) idx = i;
    setHover(idx);
  }

  const h = hover !== null ? pts[hover] : null;
  const hPrev = hover ? pts[hover - 1]?.price : undefined;

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
          <path d={area} fill="url(#hc-fill)" />
          <path d={line} fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinejoin="round" />
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
              <circle cx={x(h.t)} cy={y(h.price)} r="5" fill="#0f172a" />
            </g>
          )}
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-2 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: `${Math.min(80, Math.max(2, (x(h.t) / W) * 100 - 8))}%` }}>
            <div className="font-semibold">{fmtDate(h.t)}</div>
            <div className="text-base font-bold">{inr(h.price)}</div>
            {hPrev !== undefined && hPrev !== h.price && (
              <div className={h.price < hPrev ? 'text-green-300' : 'text-red-300'}>
                {h.price < hPrev ? '▼' : '▲'} {inr(Math.abs(h.price - hPrev))} ({(((h.price - hPrev) / hPrev) * 100).toFixed(1)}%)
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-mute">
        <span className="text-deal">▼</span> price dropped · <span className="text-red-600">▲</span> price increased · prices recorded by DealRadar since {fmtDate(Date.parse(history[0].at))}
      </p>
    </div>
  );
}
