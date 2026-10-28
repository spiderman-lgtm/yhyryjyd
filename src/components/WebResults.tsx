'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { inr } from '@/lib/format';
import StoreIcon from './StoreIcon';
import { callApi } from '@/lib/api-client';

type Hit = {
  title: string;
  store: string;
  price: number;
  mrp: number | null;
  off: number;
  url: string;
  image: string | null;
  features: string[];
  rating: number | null;
  reviews: number | null;
  match: number;
  buy: string;
  group?: 'exact' | 'related';
  colours?: number;
};

const SORTS = [
  { k: 'match', t: 'Best match' },
  { k: 'price', t: 'Lowest price' },
  { k: 'off', t: 'Biggest discount' },
] as const;

export default function WebResults({ q }: { q: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Hit[] | null>(null);
  const [note, setNote] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [sort, setSort] = useState<(typeof SORTS)[number]['k']>('match');
  const [store, setStore] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setStore(null);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setItems(d.items || []);
        setNote(d.error || '');
      })
      .catch(() => alive && (setItems([]), setNote('Search is unavailable right now. Paste the product link instead.')));
    return () => {
      alive = false;
    };
  }, [q]);

  // The model typed, one per store, lowest price first; everything else is a related model.
  const exact = useMemo(() => (items ?? []).filter((h) => h.group === 'exact').sort((a, b) => a.price - b.price), [items]);
  const related = useMemo(() => (items ?? []).filter((h) => h.group !== 'exact'), [items]);
  const stores = useMemo(() => [...new Set(related.map((h) => h.store))], [related]);
  const shown = useMemo(() => {
    const list = related.filter((h) => !store || h.store === store);
    if (sort === 'price') return [...list].sort((a, b) => a.price - b.price);
    if (sort === 'off') return [...list].sort((a, b) => b.off - a.off);
    return list;
  }, [related, sort, store]);
  const cheapest = related.length ? Math.min(...related.map((h) => h.price)) : 0;

  async function open(h: Hit) {
    setOpening(h.url);
    const { ok, data: d0 } = await callApi<{ id: string }>('/api/product', { body: { url: h.url }, timeoutMs: 150_000 });
    const d = d0;
    if (ok && d.id) router.push(`/p/${d.id}`);
    else {
      setOpening(null);
      setNote(d.error || 'Could not open that product — try its Buy now link.');
    }
  }

  if (items === null) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-ink-mute">
          <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} className="inline-block">✦</motion.span>
          Searching Flipkart, Amazon, Myntra, AJIO, Nykaa, Croma, Reliance Digital, Tata CLiQ, Decathlon and brand stores…
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-white/70 ring-1 ring-slate-100" />)}
        </div>
      </div>
    );
  }
  if (!items.length) return <p className="rounded-xl bg-white p-5 text-sm text-ink-soft ring-1 ring-slate-200">{note || 'No results from other stores.'}</p>;

  return (
    <div className="space-y-4">
      {exact.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3">
            <h3 className="font-extrabold">“{q}” on every store</h3>
            <p className="text-xs text-ink-soft">Lowest price first · colours merged, cheapest colour shown</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {exact.map((h, i) => (
              <li key={h.url} className={`flex items-center gap-3 px-4 py-3 ${i === 0 ? 'bg-deal-light/60' : ''}`}>
                <button onClick={() => open(h)} className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {h.image ? <img src={h.image} alt="" className="max-h-12 max-w-12 object-contain" /> : <span className="text-2xl">🛍️</span>}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <StoreIcon store={h.store} className="h-5 w-5 rounded text-[9px]" /> {h.store}
                    {i === 0 && exact.length > 1 && <span className="rounded-full bg-deal px-2 py-0.5 text-[10px] font-bold text-white">Lowest price</span>}
                  </span>
                  <button onClick={() => open(h)} className="line-clamp-1 text-left text-xs text-ink-soft hover:underline">{h.title}</button>
                  <span className="block text-[11px] text-ink-mute">
                    {i === 0 ? (exact.length > 1 ? `${inr(exact[1].price - h.price)} less than ${exact[1].store}` : 'Only store with this model') : `${inr(h.price - exact[0].price)} more than ${exact[0].store}`}
                    {(h.colours ?? 1) > 1 && ` · ${h.colours} colours`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-lg font-extrabold ${i === 0 ? 'text-deal' : ''}`}>{inr(h.price)}</span>
                  {h.mrp && <span className="block text-[11px] text-ink-mute line-through">{inr(h.mrp)}</span>}
                </span>
                <span className="flex shrink-0 flex-col gap-1">
                  <a href={h.buy} target="_blank" rel="noopener nofollow" className="rounded-lg bg-indigo-50 px-3 py-1.5 text-center text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Buy</a>
                  <button onClick={() => open(h)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand">{opening === h.url ? '…' : 'Track'}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {related.length > 0 && exact.length > 0 && <h3 className="pt-2 text-lg font-extrabold">Related models</h3>}
      {related.length > 0 && (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStore(null)} className={!store ? 'chip-on' : 'chip-off'}>All stores ({related.length})</button>
          {stores.map((s) => (
            <button key={s} onClick={() => setStore(s === store ? null : s)} className={`${store === s ? 'chip-on' : 'chip-off'} gap-1.5`}>
              <StoreIcon store={s} className="h-4 w-4 rounded text-[8px]" /> {s}
            </button>
          ))}
        </div>
        <div className="flex rounded-full bg-slate-100 p-1 text-sm">
          {SORTS.map((o) => (
            <button key={o.k} onClick={() => setSort(o.k)} className={`rounded-full px-3 py-1 ${sort === o.k ? 'bg-white font-semibold text-brand shadow-sm' : 'text-ink-soft'}`}>{o.t}</button>
          ))}
        </div>
      </div>
      )}
      {note && <p className="text-sm text-red-600">{note}</p>}

      <motion.div layout className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {shown.map((h, i) => (
            <motion.div
              layout
              key={h.url}
              initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
              whileHover={{ y: -6 }}
              className="group flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/80 shadow-sm backdrop-blur transition-shadow hover:shadow-xl"
            >
              <button onClick={() => open(h)} className="relative grid aspect-square place-items-center bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {h.image ? <img src={h.image} alt="" className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105" /> : <span className="text-5xl">🛍️</span>}
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/95 py-0.5 pl-0.5 pr-2 text-[11px] font-bold text-ink-soft shadow-sm ring-1 ring-slate-200">
                  <StoreIcon store={h.store} className="h-4 w-4 rounded-full text-[8px]" /> {h.store}
                </span>
                {i === 0 && sort === 'match' && !store && !exact.length && <span className="absolute right-2 top-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">✦ Best match</span>}
                {h.price === cheapest && related.length > 1 && !(i === 0 && sort === 'match' && !store && !exact.length) && <span className="absolute right-2 top-2 rounded-full bg-deal px-2 py-0.5 text-[10px] font-bold text-white">Lowest price</span>}
                {opening === h.url && <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold backdrop-blur-sm">Opening…</span>}
              </button>
              <div className="flex flex-1 flex-col gap-1.5 border-t border-slate-100 p-3">
                <button onClick={() => open(h)} className="line-clamp-2 text-left text-sm font-medium hover:underline">{h.title}</button>
                {h.rating ? (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="rounded bg-deal px-1.5 py-0.5 font-bold text-white">{h.rating.toFixed(1)} ★</span>
                    {h.reviews ? <span className="text-ink-mute">{h.reviews >= 1000 ? `${(h.reviews / 1000).toFixed(1)}K` : h.reviews} ratings</span> : null}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg font-extrabold">{inr(h.price)}</span>
                  {(h.colours ?? 1) > 1 && <span className="text-[11px] text-ink-mute">{h.colours} colours</span>}
                  {h.mrp && <span className="text-xs text-ink-mute line-through">{inr(h.mrp)}</span>}
                  {h.off > 0 && <span className="text-xs font-bold text-deal">{h.off}% off</span>}
                </div>
                {h.features.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] text-ink-soft">
                    {h.features.slice(0, 3).map((f) => (
                      <li key={f} className="flex gap-1.5"><span className="text-brand">•</span><span className="line-clamp-1">{f}</span></li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
                  <button onClick={() => open(h)} className="rounded-lg border border-slate-200 py-2 text-xs font-semibold hover:border-brand hover:text-brand">Track price</button>
                  <a href={h.buy} target="_blank" rel="noopener nofollow" className="rounded-lg bg-indigo-50 py-2 text-center text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Buy now</a>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
