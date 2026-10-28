import 'server-only';
import { affiliateUrl } from './coupons';
import { ACCESSORY, MODEL, queryFor, searchStore, searchTokens, storesForText, type Hit } from './storesearch';

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
  // 'exact': the model typed (iPhone 13); 'related': other models of the line (iPhone 13 Pro, iPhone 14).
  group: 'exact' | 'related';
  // How many colour versions of this listing the store has (merged into this one, the cheapest).
  colours: number;
};

// Colour names, so the same phone in five colours is one result (its cheapest) instead of five.
const COLOURS =
  /\b(?:jet |space |deep |sierra |alpine |pacific |midnight |starlight |rose |sky |light |dark |cosmic |phantom |mint |ocean |forest |natural |desert |product\s*)?(?:black|white|blue|red|green|pink|purple|gold|silver|graphite|midnight|starlight|yellow|grey|gray|titanium|orange|violet|lavender|mint|cream|beige|brown|navy|teal|coral|rose|bronze|copper|cyan|lime|peach|maroon|olive|charcoal|ivory|aqua|ultramarine|sage)\b/gi;
const sansColour = (t: string) => t.toLowerCase().replace(/\(.*?\)/g, ' ').replace(COLOURS, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const cache = new Map<string, { at: number; items: SearchItem[]; ttl: number }>();

// How much of what the shopper typed a listing contains, with the brand (first word) and model numbers
// (s24, 141, 4000) counting double.
function relevance(q: string[], hit: Hit): { score: number; exact: boolean; brand: boolean } {
  const words = new Set(searchTokens(`${hit.title} ${(hit.features ?? []).join(' ')}`));
  if (!q.length) return { score: 0, exact: false, brand: false };
  let got = 0;
  let total = 0;
  q.forEach((t, i) => {
    const w = i === 0 || /\d/.test(t) ? 2 : 1;
    total += w;
    if (words.has(t)) got += w;
  });
  // A different model of the line (iPhone 15 Plus for "iPhone 15") ranks below the one asked for.
  const otherModel = [...MODEL].some((m) => words.has(m) && !q.includes(m));
  // A listing without the model number typed (Galaxy Buds for "galaxy s24") is a different product.
  const missingNumber = q.some((t) => /\d/.test(t) && !words.has(t));
  // Without the brand (the first word typed), a listing is most likely another brand's product.
  const otherBrand = !words.has(q[0]);
  const score = (got / total) * (otherModel ? 0.8 : 1) * (missingNumber ? 0.5 : 1) * (otherBrand ? 0.6 : 1);
  return { score, exact: got === total && !otherModel, brand: !otherBrand };
}

// Searches every store we can reach for a product name, best matches first.
export async function keywordSearch(raw: string): Promise<SearchItem[]> {
  const q = queryFor(raw.trim()).slice(0, 100);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.items;

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
  const incomplete = seenStores.some((x) => !/:\d+$/.test(x));
  const wantsAccessory = ACCESSORY.test(q);
  const scored = found
    .filter((h) => h.price > 0 && h.title && h.url)
    // A search for a phone should not fill up with its cases and chargers.
    .filter((h) => wantsAccessory || !ACCESSORY.test(h.title))
    .map((h) => ({ h, r: relevance(qTokens, h) }))
    // Related models of the same brand stay (iPhone 14 for "iPhone 13"); other brands need a close match.
    .filter((x) => x.r.exact || (x.r.brand ? x.r.score >= 0.2 : x.r.score >= 0.35));

  // One result per store and product, whatever its colour: the cheapest colour, with how many there are.
  const merge = (list: typeof scored, key: (h: Hit) => string) => {
    const best = new Map<string, { x: (typeof scored)[number]; n: number }>();
    for (const x of list) {
      const k = key(x.h);
      const cur = best.get(k);
      if (!cur) best.set(k, { x, n: 1 });
      else best.set(k, { x: x.h.price < cur.x.h.price ? x : cur.x, n: cur.n + 1 });
    }
    return [...best.values()];
  };
  // The model typed: one per store, lowest price first.
  const exact = merge(scored.filter((x) => x.r.exact), (h) => h.store).sort((a, b) => a.x.h.price - b.x.h.price);
  const exactUrls = new Set(exact.map((e) => e.x.h.url));
  // Related models: colours merged per store, closest match first, then lowest price.
  const related = merge(
    scored.filter((x) => !exactUrls.has(x.h.url) && !(x.r.exact && exact.some((e) => e.x.h.store === x.h.store))),
    (h) => `${h.store}|${sansColour(h.name || h.title).slice(0, 70)}`,
  )
    .sort((a, b) => Math.round(b.x.r.score * 5) - Math.round(a.x.r.score * 5) || a.x.h.price - b.x.h.price)
    .slice(0, 24);
  const items: SearchItem[] = [...exact.map((e) => ({ ...e, group: 'exact' as const })), ...related.map((e) => ({ ...e, group: 'related' as const }))].map(({ x: { h, r }, n, group }) => ({
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
    match: Math.round(r.score * 100),
    buy: affiliateUrl(h.url),
    group,
    colours: n,
  }));
  if (cache.size > 500) cache.clear();
  // A result with a store missing (it failed this time) is kept briefly, so a retry soon includes it.
  if (items.length) cache.set(key, { at: Date.now(), items, ttl: incomplete ? 10 * 60_000 : 3600_000 });
  return items;
}

// A pasted product link (or a store address without https://), or null for a product name.
export function asLink(q: string): string | null {
  const s = q.trim();
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^(www\.|m\.|dl\.)?(amazon|amzn|flipkart|fkrt|myntra|myntr|ajio|meesho|croma|tatacliq|reliancedigital|nykaa|jiomart)\.[a-z.]+\/\S*$/i.test(s)) return `https://${s}`;
  return null;
}
