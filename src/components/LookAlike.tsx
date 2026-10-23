'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { inr } from '@/lib/format';
import { fetchOnce } from '@/lib/fetch-once';
import { callApi } from '@/lib/api-client';

type Item = { title: string; store: string; price: number; url: string; image: string | null; product_id?: string; buy: string | null };

export default function LookAlike({ productId }: { productId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    fetchOnce<{ items?: Item[] }>(`/api/product/${productId}/related`)
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  }, [productId]);

  async function open(item: Item) {
    if (item.product_id) return router.push(`/p/${item.product_id}`);
    setOpening(item.url);
    const { ok, data } = await callApi<{ id: string }>('/api/product', { body: { url: item.url }, timeoutMs: 150_000 });
    if (ok && data.id) router.push(`/p/${data.id}`);
    else setOpening(null);
  }

  if (items === null) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-64 animate-pulse bg-slate-50" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return <p className="rounded-xl bg-white p-5 text-sm text-ink-soft ring-1 ring-slate-200">No similar products found yet. As more shoppers check products, alternatives show up here.</p>;
  }

  return (
    <div>
      <p className="mb-4 text-ink-soft">
        Found {items.length} similar product{items.length > 1 ? 's' : ''} starting at <b className="text-deal">{inr(items[0].price)}</b>
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.url} className="card flex flex-col overflow-hidden transition hover:shadow-md">
            <button onClick={() => open(it)} className="relative grid aspect-square place-items-center bg-white p-3" title="Open in DealRadar to see its price history">
              {it.image ? <img src={it.image} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-5xl">🛍️</span>}
              <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-ink-soft ring-1 ring-slate-200">{it.store}</span>
              {opening === it.url && <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold">Opening…</span>}
            </button>
            <div className="flex flex-1 flex-col border-t border-slate-100 p-3">
              <button onClick={() => open(it)} className="line-clamp-2 text-left text-sm font-medium hover:underline">{it.title}</button>
              <div className="mt-1 text-lg font-bold">{inr(it.price)}</div>
              {it.buy && (
                <a href={it.buy} target="_blank" rel="noopener" className="mt-auto rounded-lg bg-indigo-50 py-2 text-center text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Buy now</a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
