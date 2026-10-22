import { NextResponse } from 'next/server';
import { write } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { SEARCH_STORES, match, queryFor, searchStore } from '@/lib/storesearch';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const inFlight = new Map<string, Promise<string[]>>();

// The product's key features, read from its own store's listing and kept for a few days.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  if (p.features_at && Date.now() - Date.parse(p.features_at) < 3 * 86400_000) return NextResponse.json({ features: p.features ?? [] });
  if (!SEARCH_STORES.includes(p.platform)) return NextResponse.json({ features: p.features ?? [] });
  let job = inFlight.get(p.id);
  if (!job) {
    job = searchStore(p.platform, queryFor(p.title))
      .then((hits) => {
        const best = hits
          .map((h) => ({ h, m: match(p, h) }))
          .filter((x) => x.m.ok && x.h.features?.length)
          .sort((a, b) => b.m.score - a.m.score)[0];
        return best?.h.features ?? [];
      })
      .catch(() => p.features ?? [])
      .then((features) => {
        write((d) => {
          const x = d.products[p.id];
          if (!x) return;
          x.features = features;
          x.features_at = new Date().toISOString();
        });
        return features;
      })
      .finally(() => inFlight.delete(p.id));
    inFlight.set(p.id, job);
  }
  return NextResponse.json({ features: await job });
}
