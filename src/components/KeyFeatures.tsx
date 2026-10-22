'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

// The product's highlights from its store listing; nothing is shown when the store lists none.
export default function KeyFeatures({ productId, initial }: { productId: string; initial: string[] | null }) {
  const [features, setFeatures] = useState<string[] | null>(initial);
  useEffect(() => {
    if (initial) return;
    fetch(`/api/product/${productId}/features`)
      .then((r) => r.json())
      .then((d) => setFeatures(d.features || []))
      .catch(() => setFeatures([]));
  }, [productId, initial]);

  if (features === null) return <div className="h-16 animate-pulse rounded-xl bg-slate-100" />;
  if (!features.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3 backdrop-blur">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-mute">
        <span className="grid h-4 w-4 place-items-center rounded bg-gradient-to-br from-violet-600 to-indigo-600 text-[9px] text-white">✦</span>
        Key features
      </div>
      <ul className="grid gap-1 text-sm text-ink-soft sm:grid-cols-2">
        {features.map((f, i) => (
          <motion.li key={f} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex gap-2">
            <span className="text-deal">✓</span>
            {f}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
