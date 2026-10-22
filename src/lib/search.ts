import 'server-only';
import { affiliateUrl } from './coupons';
import { SEARCH_STORES, queryFor, searchStore, searchTokens, type Hit } from './storesearch';

export type SearchItem = {
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
};

const cache = new Map<string, { at: number; items: SearchItem[] }>();

// How much of what the shopper typed a listing contains, with the brand (first word) counting double.
function relevance(q: string[], hit: Hit) {
  const words = new Set(searchTokens(`${hit.title} ${(hit.features ?? []).join(' ')}`));
  if (!q.length) return 0;
  let got = 0;
  let total = 0;
  q.forEach((t, i) => {
    const w = i === 0 ? 2 : 1;
    total += w;
    if (words.has(t)) got += w;
  });
  return got / total;
}

// Searches every store we can reach for a product name, best matches first.
export async function keywordSearch(raw: string): Promise<SearchItem[]> {
  const q = queryFor(raw.trim()).slice(0, 100);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.items;

  const qTokens = [...new Set(searchTokens(q))];
  const found = (await Promise.all(SEARCH_STORES.map((s) => searchStore(s, q).catch(() => [] as Hit[])))).flat();
  const perStore = new Map<string, number>();
  const seen = new Set<string>();
  const items = found
    .filter((h) => h.price > 0 && h.title && h.url)
    .map((h) => ({ h, match: relevance(qTokens, h) }))
    .filter((x) => x.match >= 0.35)
    .sort((a, b) => b.match - a.match || a.h.price - b.h.price)
    .filter(({ h }) => {
      const k = `${h.store}|${(h.name || h.title).toLowerCase().slice(0, 60)}`;
      const n = perStore.get(h.store) ?? 0;
      if (seen.has(k) || n >= 6) return false;
      seen.add(k);
      perStore.set(h.store, n + 1);
      return true;
    })
    .slice(0, 20)
    .map(({ h, match }) => ({
      title: (h.name || h.title).slice(0, 160),
      store: h.store,
      price: Math.round(h.price),
      mrp: h.mrp && h.mrp > h.price ? Math.round(h.mrp) : null,
      off: h.mrp && h.mrp > h.price ? Math.round(((h.mrp - h.price) / h.mrp) * 100) : 0,
      url: h.url,
      image: h.image,
      features: h.features ?? [],
      rating: h.rating ?? null,
      reviews: h.reviews ?? null,
      match: Math.round(match * 100),
      buy: affiliateUrl(h.url),
    }));
  if (cache.size > 500) cache.clear();
  if (items.length) cache.set(key, { at: Date.now(), items });
  return items;
}

// A pasted product link (or a store address without https://), or null for a product name.
export function asLink(q: string): string | null {
  const s = q.trim();
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^(www\.|m\.|dl\.)?(amazon|amzn|flipkart|fkrt|myntra|myntr|ajio|meesho|croma|tatacliq|reliancedigital|nykaa|jiomart)\.[a-z.]+\/\S*$/i.test(s)) return `https://${s}`;
  return null;
}
