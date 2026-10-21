import 'server-only';
import { read, write, recordPrice, historyFor, type Product } from './db';
import { canonicalUrl, detectPlatform, productIdFor, resolveUrl, scrapeProduct } from './scraper';

export async function addProduct(rawUrl: string): Promise<Product> {
  const url = await resolveUrl(rawUrl);
  const platform = detectPlatform(url);
  const canonical = canonicalUrl(url, platform);
  const id = productIdFor(canonical);

  const existing = read((d) => d.products[id]);
  if (existing && Date.now() - Date.parse(existing.last_checked_at) < 30 * 60_000) return existing;

  const s = await scrapeProduct(canonical, platform, id, { allowBrowser: true });
  const now = new Date().toISOString();
  const product: Product = {
    id,
    url: canonical,
    platform,
    title: s.title,
    image: s.image,
    price: s.price,
    mrp: s.mrp,
    currency: s.currency,
    in_stock: s.in_stock,
    source: s.source,
    images: s.images.length ? s.images : existing?.images,
    rating: s.rating ?? existing?.rating ?? null,
    reviews: s.reviews ?? existing?.reviews ?? null,
    last_viewed_at: existing?.last_viewed_at,
    created_at: existing?.created_at ?? now,
    last_checked_at: now,
  };
  write((d) => {
    d.products[id] = product;
  });
  recordPrice(id, product.price);
  return product;
}

// Used by the scheduled check. AI fallback is allowed but slow, so callers budget their time.
export async function refreshProduct(product: Product, opts: { allowAi?: boolean } = {}): Promise<Product> {
  try {
    const s = await scrapeProduct(product.url, product.platform, product.id, { allowAi: opts.allowAi });
    const updated: Product = {
      ...product,
      title: s.title || product.title,
      image: s.image || product.image,
      price: s.price,
      mrp: s.mrp,
      in_stock: s.in_stock,
      source: s.source,
      images: s.images.length ? s.images : product.images,
      rating: s.rating ?? product.rating ?? null,
      reviews: s.reviews ?? product.reviews ?? null,
      last_checked_at: new Date().toISOString(),
      last_error: undefined,
    };
    write((d) => {
      d.products[product.id] = updated;
    });
    recordPrice(product.id, s.price);
    return updated;
  } catch (e) {
    const failed = { ...product, last_checked_at: new Date().toISOString(), last_error: e instanceof Error ? e.message : String(e) };
    write((d) => {
      d.products[product.id] = failed;
    });
    return failed;
  }
}

export function getProduct(id: string) {
  return read((d) => d.products[id] ?? null);
}

export function priceStats(productId: string, current: number) {
  const stat = (days: number) => {
    const pts = historyFor(productId, days).map((h) => h.price);
    if (!pts.length) return { low: current, high: current };
    return { low: Math.min(...pts), high: Math.max(...pts) };
  };
  const all = historyFor(productId);
  return {
    d7: stat(7),
    d15: stat(15),
    allTimeLow: all.length ? Math.min(...all.map((h) => h.price)) : current,
    points: all.length,
    trackingSince: all[0]?.at ?? null,
  };
}

// Viewed products are re-checked on a schedule too, so their price history keeps growing.
export function markViewed(id: string) {
  const p = getProduct(id);
  if (!p || (p.last_viewed_at && Date.now() - Date.parse(p.last_viewed_at) < 3600_000)) return;
  write((d) => {
    if (d.products[id]) d.products[id].last_viewed_at = new Date().toISOString();
  });
}

export interface DealScore {
  score: number;
  label: string;
  verdict: string;
  vsAverage: 'below' | 'same' | 'above';
  rows: { text: string; pts: number; max: number }[];
}

export function dealScore(productId: string, current: number): DealScore | null {
  const all = historyFor(productId);
  if (all.length < 3 || Date.now() - Date.parse(all[0].at) < 3 * 86400_000) return null;
  const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
  const prices = all.map((h) => h.price);
  const atl = Math.min(...prices);
  const d90 = historyFor(productId, 90).map((h) => h.price);
  const low90 = Math.min(...d90);
  // Time-weighted average: each price counts for as long as it lasted.
  let weighted = 0;
  let span = 0;
  for (let i = 0; i < all.length; i++) {
    const end = i + 1 < all.length ? Date.parse(all[i + 1].at) : Date.now();
    const dur = Math.max(end - Date.parse(all[i].at), 60_000);
    weighted += all[i].price * dur;
    span += dur;
  }
  const avg = weighted / span;

  const last30 = historyFor(productId, 30);
  const before = last30[0]?.price ?? current;
  const peak = Math.max(...last30.map((h) => h.price), before);
  const hikedThenCut = peak > before * 1.03 && current >= before * 0.98;
  const closeness = (low: number, max: number) => (current <= low ? max : Math.max(0, max * (1 - ((current - low) / low) * 5)));
  let avgPts: number;
  if (current < avg * 0.995) avgPts = Math.min(20, 10 + ((avg - current) / avg) * 100);
  else if (current <= avg * 1.005) avgPts = 5;
  else avgPts = Math.max(0, 5 - ((current - avg) / avg) * 50);

  const rows = [
    { text: hikedThenCut ? `Price was raised to ${inr(peak)} before this “sale”` : 'No price hike before this price', pts: hikedThenCut ? 0 : 30, max: 30 },
    { text: current <= atl ? `At the all-time low (${inr(atl)})` : `Above the all-time low (${inr(atl)})`, pts: closeness(atl, 30), max: 30 },
    { text: current <= low90 ? `At the 3-month low (${inr(low90)})` : `Above the 3-month low (${inr(low90)})`, pts: closeness(low90, 20), max: 20 },
    { text: `${current < avg * 0.995 ? 'Below' : current <= avg * 1.005 ? 'Same as' : 'Above'} the average price (${inr(avg)})`, pts: avgPts, max: 20 },
  ].map((r) => ({ ...r, pts: Math.round(r.pts) }));
  const score = Math.max(0, Math.min(100, rows.reduce((s, r) => s + r.pts, 0)));
  const [label, verdict] =
    score >= 85 ? ['Great deal', 'One of the best prices we have seen. A good time to buy.']
    : score >= 70 ? ['Good deal', 'Better than usual for this product.']
    : score >= 50 ? ['Decent catch', 'An okay price, but it has been cheaper.']
    : ['Wait for a drop', 'Higher than usual. Set a price alert and buy later.'];
  return { score, label, verdict, vsAverage: current < avg * 0.995 ? 'below' : current <= avg * 1.005 ? 'same' : 'above', rows };
}
