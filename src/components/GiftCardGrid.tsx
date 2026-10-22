'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { storeColor } from '@/lib/stores';
import StoreIcon from './StoreIcon';

export type GiftCardView = { id: string; store: string; title: string; discount_text: string; description: string; logo_url: string | null; domain: string | null };

function Tile({ g, i }: { g: GiftCardView; i: number }) {
  const color = storeColor(g.store);
  return (
    <motion.a
      layout
      href={`/api/coupon/${g.id}`}
      target="_blank"
      rel="noopener"
      initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.45 }}
      whileHover={{ y: -8, rotate: -0.6 }}
      className="group flex flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/70 shadow-lg shadow-slate-900/5 backdrop-blur-md transition-shadow hover:shadow-2xl hover:shadow-slate-900/15"
    >
      <div className="relative grid aspect-[4/3] place-items-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
        <div aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/30 blur-2xl transition-transform duration-700 group-hover:scale-150" />
        <div aria-hidden className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-black/10 blur-2xl" />
        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }} className="relative">
          {g.logo_url ? (
            <span className="grid h-20 w-36 place-items-center rounded-2xl bg-white/95 p-2 shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.logo_url} alt={g.store} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
            </span>
          ) : (
            <StoreIcon store={g.store} domain={g.domain} className="h-20 w-20 rounded-2xl text-3xl shadow-xl" />
          )}
        </motion.div>
        <span className="absolute bottom-2 right-3 text-[10px] font-bold uppercase tracking-widest text-white/80">Gift card</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-sm font-semibold">{g.title}</div>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-ink-mute">Save</div>
        <div className="text-2xl font-black text-ink">{g.discount_text || 'Deal'}</div>
        {g.description && <p className="mt-1 line-clamp-2 text-xs text-ink-mute">{g.description}</p>}
        <span className="mt-3 rounded-xl bg-indigo-50 py-2 text-center text-sm font-semibold text-indigo-700 transition group-hover:bg-indigo-600 group-hover:text-white">Buy now</span>
      </div>
    </motion.a>
  );
}

export default function GiftCardGrid({ cards }: { cards: GiftCardView[] }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => cards.filter((g) => !q || `${g.store} ${g.title}`.toLowerCase().includes(q.toLowerCase())), [cards, q]);
  return (
    <div className="space-y-5">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute">⌕</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search gift cards — Flipkart, Myntra, Swiggy…" aria-label="Search gift cards"
          className="w-full rounded-2xl border border-white/70 bg-white/70 py-3 pl-10 pr-4 shadow-sm outline-none backdrop-blur-md focus:border-indigo-400" />
      </div>
      <motion.div layout className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <AnimatePresence mode="popLayout">
          {shown.map((g, i) => <Tile key={g.id} g={g} i={i} />)}
        </AnimatePresence>
      </motion.div>
      {shown.length === 0 && <p className="py-8 text-center text-ink-soft">No gift card matches “{q}”.</p>}
    </div>
  );
}
