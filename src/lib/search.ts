import 'server-only';
import { affiliateUrl } from './coupons';
import { ACCESSORY, queryFor, searchStore, searchTokens, storesForText, type Hit } from './storesearch';

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

// How much of what the shopper typed a listing contains, with the brand (first word) and model numbers
// (s24, 141, 4000) counting double.
function relevance(q: string[], hit: Hit) {
  const words = new Set(searchTokens(`${hit.title} ${(hit.features ?? []).join(' ')}`));
  if (!q.length) return 0;
  let got = 0;
  let total = 0;
  q.forEach((t, i) => {
    const w = i === 0 || /\d/.test(t) ? 2 : 1;
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
  const seenStores: string[] = [];
  const found = (
    await Promise.all(
      storesForText(q).map((s) =>
        searchStore(s, q)
          .then((hits) => (seenStores.push(`${s}:${hits.length}`), hits))
          .catch((e) => (seenStores.push(`${s}:${e instanceof Error ? e.message.slice(0, 30) : 'error'}`), [] as Hit[])),
      ),
    )
  ).flat();
  // One line per search: how many results each store sent back.
  console.log(`[search] "${q}" ${seenStores.join(' ')}`);
  const wantsAccessory = ACCESSORY.test(q);
  const seen = new Set<string>();
  const ranked = found
    .filter((h) => h.price > 0 && h.title && h.url)
    // A search for a phone should not fill up with its cases and chargers.
    .filter((h) => wantsAccessory || !ACCESSORY.test(h.title))
    .map((h) => ({ h, match: relevance(qTokens, h) }))
    .filter((x) => x.match >= 0.35)
    .sort((a, b) => b.match - a.match || a.h.price - b.h.price)
    .filter(({ h }) => {
      const k = `${h.store}|${(h.name || h.title).toLowerCase().slice(0, 60)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  // Stores take turns, best result of each first, so every store that has the product shows up
  // instead of the first few stores filling the page.
  const byStore = new Map<string, typeof ranked>();
  for (const x of ranked) byStore.set(x.h.store, [...(byStore.get(x.h.store) ?? []), x]);
  const queues = [...byStore.values()].sort((a, b) => b[0].match - a[0].match);
  const picked: typeof ranked = [];
  for (let round = 0; round < 5 && picked.length < 24; round++)
    for (const list of queues) if (list[round] && picked.length < 24) picked.push(list[round]);
  const items = picked
    .sort((a, b) => b.match - a.match || a.h.price - b.h.price)
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
