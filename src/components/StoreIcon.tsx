'use client';

import { useState } from 'react';
import { storeColor, storeDomain } from '@/lib/stores';

// A store's real logo; its first letter on the store's colour if the logo cannot be loaded.
export default function StoreIcon({ store, domain, className = 'h-8 w-8 rounded-lg text-sm' }: { store: string; domain?: string | null; className?: string }) {
  const host = domain ?? storeDomain(store);
  const [failed, setFailed] = useState(false);
  if (host && !failed) {
    return (
      <span className={`grid shrink-0 place-items-center overflow-hidden border border-slate-200 bg-white p-0.5 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/logo/${host}`} alt={store} title={store} className="h-full w-full object-contain" loading="lazy" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className={`grid shrink-0 place-items-center font-black text-white ${className}`} style={{ background: storeColor(store) }} title={store}>
      {store[0]}
    </span>
  );
}
