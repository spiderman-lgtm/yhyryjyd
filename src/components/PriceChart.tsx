import type { PricePoint } from '@/lib/db';
import { dateShort, inr } from '@/lib/format';

export default function PriceChart({ points, days }: { points: PricePoint[]; days: number }) {
  if (points.length < 2) {
    return (
      <div className="grid h-48 place-items-center rounded-xl bg-slate-50 px-6 text-center text-sm text-ink-mute">
        Price history starts today. Track this product and the chart fills in as we re-check it.
      </div>
    );
  }
  const W = 640;
  const H = 200;
  const P = { l: 64, r: 12, t: 12, b: 28 };
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.15 || max * 0.05;
  const lo = min - pad;
  const hi = max + pad;
  const t0 = Date.parse(points[0].at);
  const t1 = Math.max(Date.parse(points[points.length - 1].at), t0 + 1);
  const x = (at: string) => P.l + ((Date.parse(at) - t0) / (t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);

  // Prices hold until the next check, so draw steps rather than slopes.
  let d = `M${x(points[0].at)},${y(points[0].price)}`;
  for (let i = 1; i < points.length; i++) d += ` H${x(points[i].at)} V${y(points[i].price)}`;
  const area = `${d} V${H - P.b} H${x(points[0].at)} Z`;
  const lowIdx = prices.lastIndexOf(min);
  const ticks = [hi - pad, (lo + hi) / 2, lo + pad];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Price over the last ${days} days, low ${inr(min)}, high ${inr(max)}`}>
        <defs>
          <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ea580c" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ea580c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{inr(v)}</text>
          </g>
        ))}
        <path d={area} fill="url(#fill)" />
        <path d={d} fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(points[lowIdx].at)} cy={y(min)} r="5" fill="#16a34a" stroke="#fff" strokeWidth="2" />
        <text x={P.l} y={H - 8} fontSize="11" fill="#64748b">{dateShort(points[0].at)}</text>
        <text x={W - P.r} y={H - 8} fontSize="11" fill="#64748b" textAnchor="end">{dateShort(points[points.length - 1].at)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-ink-mute">
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-deal" /> lowest {inr(min)} on {dateShort(points[lowIdx].at)} · {points.length} checks
      </figcaption>
    </figure>
  );
}
