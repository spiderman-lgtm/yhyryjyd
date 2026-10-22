import 'server-only';
import { read, write, type CatalogItem } from './db';
import { ACCESSORY, searchStore } from './storesearch';

// The Trending page's categories. Each is filled by searching the stores we can reach and keeping
// the biggest genuine discounts (selling price below the listed MRP).
export const CATEGORIES = [
  { slug: 'smartphones', title: 'Latest Smartphones', query: '5g smartphone', min: 6000, must: /phone|5g|mobile|galaxy|iphone|redmi|realme|oneplus|vivo|oppo|nothing|motorola|poco|iqoo/i },
  { slug: 'headphones', title: 'Headphones & Earbuds', query: 'wireless earbuds', min: 400, must: /earbud|headphone|headset|earphone|tws|buds|neckband/i },
  { slug: 'air-fryers', title: 'Top Rated Air Fryers', query: 'air fryer', min: 1500, must: /air fryer|airfryer/i },
  { slug: 'smartwatches', title: 'Smartwatches', query: 'smartwatch', min: 900, must: /watch/i },
  { slug: 'laptops', title: 'Laptops', query: 'laptop', min: 18000, must: /laptop|notebook|macbook|chromebook/i },
  { slug: 'televisions', title: 'Smart TVs', query: 'smart tv', min: 8000, must: /tv|television/i },
  { slug: 'washing-machines', title: 'Washing Machines', query: 'washing machine', min: 8000, must: /washing machine|washer/i },
  { slug: 'refrigerators', title: 'Refrigerators', query: 'refrigerator', min: 10000, must: /refrigerator|fridge/i },
] as const;

export type Category = (typeof CATEGORIES)[number];

const STORES = ['flipkart', 'croma', 'reliancedigital', 'tatacliq'];
const TTL_MS = 6 * 3600_000;

async function fill(c: Category): Promise<CatalogItem[]> {
  const found = await Promise.all(STORES.map((s) => searchStore(s, c.query).catch(() => [])));
  const seen = new Set<string>();
  return found
    .flat()
    .filter((h) => h.price >= c.min && h.mrp && h.mrp > h.price && h.in_stock && h.image && c.must.test(h.title) && !ACCESSORY.test(h.title))
    .map((h) => ({ title: h.title, store: h.store, price: Math.round(h.price), mrp: Math.round(h.mrp!), off: Math.round(((h.mrp! - h.price) / h.mrp!) * 100), url: h.url, image: h.image }))
    // Discounts above 80% are almost always an inflated MRP, not a real saving.
    .filter((i) => i.off >= 5 && i.off <= 80)
    .sort((a, b) => b.off - a.off)
    .filter((i) => {
      const key = i.title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 5).join(' ');
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .slice(0, 18);
}

let running: Promise<void> | null = null;

// Re-searches stale categories one at a time, so the server is never doing all of them at once.
export function refreshCatalog(force = false): Promise<void> {
  running ??= (async () => {
    for (const c of CATEGORIES) {
      const hit = read((d) => d.catalog[c.slug]);
      if (!force && hit && hit.items.length && Date.now() - Date.parse(hit.fetched_at) < TTL_MS) continue;
      const items = await fill(c).catch(() => []);
      // A failed search keeps the last good list (and is retried next time) instead of emptying the row.
      if (items.length) write((d) => void (d.catalog[c.slug] = { items, fetched_at: new Date().toISOString() }));
    }
  })().finally(() => (running = null));
  return running;
}

export function catalog(): { category: Category; items: CatalogItem[]; fetched_at: string | null }[] {
  return read((d) => CATEGORIES.map((c) => ({ category: c, items: d.catalog[c.slug]?.items ?? [], fetched_at: d.catalog[c.slug]?.fetched_at ?? null })));
}

export function catalogStale() {
  return read((d) => CATEGORIES.some((c) => !d.catalog[c.slug] || Date.now() - Date.parse(d.catalog[c.slug].fetched_at) > TTL_MS));
}
