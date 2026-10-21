import Link from 'next/link';
import type { Product } from '@/lib/db';
import { inr } from '@/lib/format';
import { PLATFORM_NAMES } from '@/lib/scraper';

export default function ProductCard({ p, belowUsual, usual, offMrp, note }: { p: Product; belowUsual?: number; usual?: number | null; offMrp?: number; note?: string }) {
  return (
    <div className="card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-xl hover:shadow-orange-900/5">
      <Link href={`/p/${p.id}`} className="relative grid aspect-square place-items-center overflow-hidden bg-white p-4">
        {p.image ? (
          <img src={p.image} alt="" className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <span className="text-5xl">🛍️</span>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-ink-soft ring-1 ring-slate-200">{PLATFORM_NAMES[p.platform]}</span>
        {belowUsual ? (
          <span className="absolute right-2 top-2 rounded-md bg-deal px-1.5 py-0.5 text-[11px] font-bold text-white">{belowUsual}% below usual</span>
        ) : offMrp ? (
          <span className="absolute right-2 top-2 rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">{offMrp}% off</span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col border-t border-slate-100 p-3">
        <Link href={`/p/${p.id}`} className="line-clamp-2 text-sm font-medium hover:underline">{p.title}</Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-bold">{inr(p.price)}</span>
          {p.mrp && <span className="text-xs text-ink-mute line-through">{inr(p.mrp)}</span>}
        </div>
        {belowUsual && usual ? <div className="text-xs font-semibold text-deal">Usually {inr(usual)}</div> : null}
        {note && <div className="text-xs text-ink-mute">{note}</div>}
        <a href={`/api/buy/${p.id}`} target="_blank" rel="noopener" className="mt-auto pt-2">
          <span className="block rounded-lg bg-indigo-50 py-2 text-center text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">Buy now</span>
        </a>
      </div>
    </div>
  );
}
