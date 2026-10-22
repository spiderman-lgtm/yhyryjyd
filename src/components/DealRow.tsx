'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { CatalogItem } from '@/lib/db';
import { inr } from '@/lib/format';
import StoreIcon from './StoreIcon';

const PERKS = ['Top Brands', 'Best Deals', 'Max Savings'];

export function DealCard({ item, i = 0 }: { item: CatalogItem; i?: number }) {
  return (
    <motion.a
      href={`/${item.url}`}
      title={item.title}
      initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay: i * 0.05, duration: 0.45, ease: 'easeOut' }}
      whileHover={{ y: -6 }}
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/75 shadow-lg shadow-indigo-900/5 backdrop-blur-md transition-shadow hover:shadow-xl hover:shadow-indigo-900/10 sm:w-auto"
    >
      <div className="relative grid aspect-square place-items-center bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.image && <img src={item.image} alt="" loading="lazy" className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-110" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-1 text-xs text-ink-soft">{item.title}</div>
        <div className="flex items-center gap-1.5">
          <StoreIcon store={item.store} className="h-5 w-5 rounded-full text-[9px]" />
          <span className="font-extrabold">{inr(item.price)}</span>
          <span className="text-[11px] text-ink-mute line-through">{inr(item.mrp)}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-deal">
          <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-deal text-[8px] text-white">↓</span>
          {item.off}% <span className="font-normal text-ink-mute">({inr(item.mrp - item.price)}) off</span>
        </div>
      </div>
    </motion.a>
  );
}

export default function DealRow({ slug, title, items, tone = 0 }: { slug: string; title: string; items: CatalogItem[]; tone?: number }) {
  const best = Math.max(...items.map((x) => x.off));
  const tones = ['from-indigo-100/80 via-violet-50/80 to-sky-50/80', 'from-orange-100/80 via-rose-50/80 to-amber-50/80', 'from-emerald-100/70 via-teal-50/80 to-sky-50/80', 'from-fuchsia-100/70 via-violet-50/80 to-indigo-50/80'];
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${tones[tone % tones.length]} px-4 pb-6 pt-14 ring-1 ring-white/70 sm:px-6`}
    >
      {/* soft moving colour behind the glass */}
      <motion.div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-indigo-300/40 blur-3xl" animate={{ x: [0, -30, 0], y: [0, 20, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-orange-200/50 blur-3xl" animate={{ x: [0, 40, 0], y: [0, -20, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />

      <motion.div
        className="absolute left-4 top-0 rounded-b-2xl bg-gradient-to-r from-indigo-600 to-violet-500 px-5 py-2.5 text-lg font-black text-white shadow-lg shadow-indigo-600/30 sm:left-8 sm:text-2xl"
        animate={{ y: [0, 3, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        Up to {best}% off
      </motion.div>

      <div className="relative mb-5 text-center">
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-soft sm:text-sm">
          {PERKS.map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="text-slate-300">—</span>
              <span className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-orange-500 to-pink-500 text-[9px] font-black text-white">₹</span>
              {p}
            </span>
          ))}
          <span className="text-slate-300">—</span>
        </div>
      </div>

      <div className="relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {items.slice(0, 6).map((it, i) => (
          <div key={it.url} className="w-44 shrink-0 snap-start sm:w-auto">
            <DealCard item={it} i={i} />
          </div>
        ))}
      </div>

      {items.length > 6 && (
        <div className="relative mt-5 text-center">
          <Link href={`/trending/${slug}`} className="inline-flex rounded-xl border border-indigo-300 bg-white/70 px-10 py-2.5 font-semibold text-indigo-700 backdrop-blur transition hover:bg-white hover:shadow-md">
            View all
          </Link>
        </div>
      )}
    </motion.section>
  );
}
