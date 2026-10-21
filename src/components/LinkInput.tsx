'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const looksLikeLink = (s: string) => /^https?:\/\//i.test(s) || /^[\w-]+(\.[\w-]+)+\/\S*$/.test(s);

export default function LinkInput({ compact = false, initial = '' }: { compact?: boolean; initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setError('');
    if (!looksLikeLink(v)) return router.push(`/search?q=${encodeURIComponent(v)}`);
    setBusy(true);
    try {
      const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
      const res = await fetch('/api/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      router.push(`/p/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className={`relative flex flex-col gap-2 sm:flex-row ${compact ? '' : 'rounded-2xl bg-white p-2 shadow-xl shadow-orange-900/5 ring-1 ring-slate-200'}`}>
        <input
          className="input flex-1 border-0 text-base focus:ring-0"
          placeholder="Search a product or paste any Amazon, Flipkart, Myntra link…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Search a product or paste a product link"
          required
        />
        <motion.button whileTap={{ scale: 0.96 }} whileHover={{ y: -1 }} className="btn-primary px-6 py-3 text-base" disabled={busy}>
          {busy ? 'Checking price…' : looksLikeLink(value.trim()) || !value ? 'Check price' : 'Search'}
        </motion.button>
        {busy && (
          <motion.span
            className="absolute bottom-0 left-2 right-2 h-0.5 origin-left rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-orange-400"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: [0, 0.7, 0.9] }}
            transition={{ duration: 20, times: [0, 0.3, 1], ease: 'easeOut' }}
          />
        )}
      </div>
      <AnimatePresence>
        {busy && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-sm text-ink-mute">
            Reading the product page. If the store blocks us, our AI reads it instead — this can take up to two minutes.
          </motion.p>
        )}
      </AnimatePresence>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
    </form>
  );
}
