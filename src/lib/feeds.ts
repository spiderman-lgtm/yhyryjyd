import 'server-only';
import { read, type Coupon, type Platform, type Product } from './db';

export interface DealItem {
  product: Product;
  usual: number | null;
  belowUsual: number;
  offMrp: number;
}

// Time-weighted average of the last 90 days: what the product "usually" costs.
function usualPrice(history: { price: number; at: string }[]): number | null {
  const since = Date.now() - 90 * 86400_000;
  const pts = history.filter((h) => Date.parse(h.at) >= since);
  if (pts.length < 2) return null;
  let sum = 0;
  let span = 0;
  for (let i = 0; i < pts.length; i++) {
    const end = i + 1 < pts.length ? Date.parse(pts[i + 1].at) : Date.now();
    const dur = Math.max(end - Date.parse(pts[i].at), 60_000);
    sum += pts[i].price * dur;
    span += dur;
  }
  return sum / span;
}

export function dealsFeed(opts: { maxPrice?: number; minBelowUsual?: number; minOffMrp?: number; platform?: Platform } = {}): DealItem[] {
  return read((d) => {
    const byProduct = new Map<string, { price: number; at: string }[]>();
    for (const h of d.history) {
      const list = byProduct.get(h.product_id);
      if (list) list.push(h);
      else byProduct.set(h.product_id, [h]);
    }
    return Object.values(d.products)
      .filter((p) => !p.last_error && p.in_stock)
      .filter((p) => !opts.maxPrice || p.price <= opts.maxPrice)
      .filter((p) => !opts.platform || p.platform === opts.platform)
      .map((p) => {
        const usual = usualPrice(byProduct.get(p.id) ?? []);
        const belowUsual = usual && usual > p.price ? Math.round(((usual - p.price) / usual) * 100) : 0;
        const offMrp = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
        return { product: p, usual, belowUsual, offMrp };
      })
      .filter((x) => (opts.minBelowUsual ? x.belowUsual >= opts.minBelowUsual : true))
      .filter((x) => (opts.minOffMrp ? x.offMrp >= opts.minOffMrp : true))
      .filter((x) => x.belowUsual > 0 || x.offMrp > 0)
      .sort((a, b) => b.belowUsual - a.belowUsual || b.offMrp - a.offMrp);
  });
}

export function trendingFeed(limit = 20): { product: Product; score: number; watchers: number }[] {
  return read((d) => {
    const weekAgo = Date.now() - 7 * 86400_000;
    const watchers = new Map<string, number>();
    for (const a of Object.values(d.alerts)) if (a.status === 'active') watchers.set(a.product_id, (watchers.get(a.product_id) ?? 0) + 1);
    const carts = new Map<string, number>();
    for (const c of Object.values(d.cart)) carts.set(c.product_id, (carts.get(c.product_id) ?? 0) + 1);
    const clicks = new Map<string, number>();
    for (const c of d.clicks) if (Date.parse(c.at) > weekAgo) clicks.set(c.product_id, (clicks.get(c.product_id) ?? 0) + 1);
    return Object.values(d.products)
      .filter((p) => !p.last_error)
      .map((p) => ({
        product: p,
        watchers: watchers.get(p.id) ?? 0,
        score: (p.views ?? 0) + 3 * (watchers.get(p.id) ?? 0) + 2 * (carts.get(p.id) ?? 0) + 2 * (clicks.get(p.id) ?? 0),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  });
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

export function searchProducts(q: string, limit = 24): Product[] {
  const terms = words(q);
  if (!terms.length) return [];
  return read((d) =>
    Object.values(d.products)
      .filter((p) => !p.last_error)
      .map((p) => {
        const t = words(p.title);
        const score = terms.reduce((s, w) => s + (t.includes(w) ? 2 : t.some((x) => x.startsWith(w)) ? 1 : 0), 0);
        return { p, score };
      })
      .filter((x) => x.score >= Math.max(1, terms.length))
      .sort((a, b) => b.score - a.score || (b.p.views ?? 0) - (a.p.views ?? 0))
      .slice(0, limit)
      .map((x) => x.p),
  );
}

export function couponDirectory(): { platform: Platform; coupons: (Coupon & { product: Product; fetched_at: string })[] }[] {
  return read((d) => {
    const groups = new Map<Platform, (Coupon & { product: Product; fetched_at: string })[]>();
    for (const [key, cache] of Object.entries(d.coupons)) {
      const [platform, productId] = key.split(':') as [Platform, string];
      const product = d.products[productId];
      if (!product || Date.now() - Date.parse(cache.fetched_at) > 7 * 86400_000) continue;
      const list = groups.get(platform) ?? [];
      for (const c of cache.coupons) {
        if (list.some((x) => (c.code ? x.code === c.code : x.title === c.title))) continue;
        list.push({ ...c, product, fetched_at: cache.fetched_at });
      }
      groups.set(platform, list);
    }
    return [...groups.entries()].map(([platform, coupons]) => ({ platform, coupons })).sort((a, b) => b.coupons.length - a.coupons.length);
  });
}

export function siteStats() {
  return read((d) => ({
    products: Object.keys(d.products).length,
    alerts: Object.values(d.alerts).filter((a) => a.status === 'active').length,
    drops: Object.values(d.alerts).filter((a) => a.last_notified_at).length,
  }));
}

// The newest price cuts DealRadar saw on products it tracks: the last change was a drop, within the last 3 days.
export function latestDrops(limit = 12): { product: Product; was: number; at: string }[] {
  return read((d) => {
    const since = Date.now() - 3 * 86400_000;
    const last = new Map<string, { price: number; at: string }[]>();
    for (const h of d.history) {
      const list = last.get(h.product_id) ?? [];
      // Only price changes matter, so repeats of the same price are skipped.
      if (!list.length || list[list.length - 1].price !== h.price) list.push(h);
      if (list.length > 2) list.shift();
      last.set(h.product_id, list);
    }
    const out: { product: Product; was: number; at: string }[] = [];
    for (const [id, pts] of last) {
      const p = d.products[id];
      if (!p || p.last_error || !p.in_stock || pts.length < 2) continue;
      const [prev, now] = pts;
      if (now.price < prev.price && now.price === p.price && Date.parse(now.at) >= since) out.push({ product: p, was: prev.price, at: now.at });
    }
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
  });
}
