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
export async function refreshProduct(product: Product): Promise<Product> {
  try {
    const s = await scrapeProduct(product.url, product.platform, product.id);
    const updated: Product = {
      ...product,
      title: s.title || product.title,
      image: s.image || product.image,
      price: s.price,
      mrp: s.mrp,
      in_stock: s.in_stock,
      source: s.source,
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
