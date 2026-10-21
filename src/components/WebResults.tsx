'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { inr } from '@/lib/format';

type Hit = { title: string; store: string; price: number; url: string; image: string | null; buy: string };

export default function WebResults({ q }: { q: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Hit[] | null>(null);
  const [note, setNote] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setItems(d.items || []);
        setNote(d.error || '');
      })
      .catch(() => alive && (setItems([]), setNote('Web search is unavailable right now.')));
    return () => {
      alive = false;
    };
  }, [q]);

  async function open(h: Hit) {
    setOpening(h.url);
    const res = await fetch('/api/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: h.url }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.id) router.push(`/p/${d.id}`);
    else setOpening(null);
  }

  if (items === null) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="card h-64 animate-pulse bg-slate-50" />)}
      </div>
    );
  }
  if (!items.length) return <p className="rounded-xl bg-white p-5 text-sm text-ink-soft ring-1 ring-slate-200">{note || 'No results from other stores.'}</p>;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {items.map((h, i) => (
        <motion.div key={h.url} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -6 }} className="card flex flex-col overflow-hidden">
          <button onClick={() => open(h)} className="relative grid aspect-square place-items-center bg-white p-3">
            {h.image ? <img src={h.image} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-5xl">🛍️</span>}
            <span className="absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-ink-soft ring-1 ring-slate-200">{h.store}</span>
            {opening === h.url && <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold">Opening…</span>}
          </button>
          <div className="flex flex-1 flex-col border-t border-slate-100 p-3">
            <button onClick={() => open(h)} className="line-clamp-2 text-left text-sm font-medium hover:underline">{h.title}</button>
            <div className="mt-1 text-lg font-bold">{inr(h.price)}</div>
            <a href={h.buy} target="_blank" rel="noopener nofollow" className="mt-auto rounded-lg bg-indigo-50 py-2 text-center text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Buy now</a>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
