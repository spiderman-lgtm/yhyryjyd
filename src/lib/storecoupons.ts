import 'server-only';
import { COUPON_CATEGORIES, newId, read, type Coupon, type CouponCategory, type Platform, type StoreCoupon } from './db';
import { absolute } from './config';
import { PLATFORM_NAMES } from './scraper';
import { hostOf, storeDomain } from './stores';

export const CATEGORY_LABELS: Record<CouponCategory, string> = {
  fashion: 'Fashion',
  beauty: 'Beauty',
  electronics: 'Electronics',
  travel: 'Travel',
  food: 'Food',
  grocery: 'Grocery',
  recharge: 'Recharge',
  ott: 'OTT',
  education: 'Education',
  health: 'Health',
  other: 'Other',
};

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function httpsUrl(v: unknown): string | null {
  try {
    const u = new URL(text(v, 1000));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// "2026-11-30", "30/11/2026" or "30-11-2026" → end of that day in India; empty means no expiry.
function expiry(v: unknown): string | null | undefined {
  const s = text(v, 30);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return undefined;
  const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const at = new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T23:59:59+05:30`);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

function category(v: unknown): CouponCategory {
  const s = text(v, 30).toLowerCase();
  return (COUPON_CATEGORIES as readonly string[]).includes(s) ? (s as CouponCategory) : 'other';
}

const yes = (v: unknown) => v === true || /^(1|y|yes|true)$/i.test(text(v, 5));

// Checks one coupon from the Admin form or a CSV row. Returns the fields to store, or what is wrong.
export function cleanCoupon(b: Record<string, unknown>, existing?: StoreCoupon): StoreCoupon | { error: string } {
  const store = text(b.store, 60);
  const title = text(b.title, 200);
  const url = httpsUrl(b.url);
  const expires = expiry(b.expires_at);
  if (!store) return { error: 'Store is required.' };
  if (!title) return { error: 'Title is required.' };
  if (!url) return { error: 'Offer link must be a full https:// address.' };
  if (expires === undefined) return { error: 'Expiry must be a date like 2026-11-30.' };
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? newId('cpn'),
    store,
    url,
    logo_url: httpsUrl(b.logo_url),
    title,
    discount_text: text(b.discount_text, 40),
    code: text(b.code, 40).replace(/\s/g, '') || null,
    description: text(b.description, 400),
    category: category(b.category),
    expires_at: expires,
    exclusive: yes(b.exclusive),
    featured: yes(b.featured),
    active: b.active === undefined ? existing?.active ?? true : yes(b.active),
    clicks: existing?.clicks ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

// A small CSV reader: quoted fields, commas and new lines inside quotes, "" for a quote.
export function parseCsv(csv: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(field), rows.push(row), (row = []), (field = '');
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const ALIASES: Record<string, string> = { discount: 'discount_text', expires: 'expires_at', expiry: 'expires_at', link: 'url', logo: 'logo_url', conditions: 'description' };
  const keys = head.map((h) => {
    const k = h.trim().toLowerCase().replace(/\s+/g, '_');
    return ALIASES[k] ?? k;
  });
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const live = (c: StoreCoupon) => c.active && (!c.expires_at || Date.parse(c.expires_at) > Date.now());

export function liveCoupons(): StoreCoupon[] {
  return read((d) => Object.values(d.store_coupons).filter(live));
}

export type StoreSummary = { store: string; slug: string; count: number; clicks: number; logo_url: string | null; domain: string | null };

export const storeSlug = (store: string) => store.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const couponDomain = (c: StoreCoupon) => storeDomain(c.store) ?? hostOf(c.url);

// Stores with live coupons, most used first.
export function couponStores(list = liveCoupons()): StoreSummary[] {
  const by = new Map<string, StoreSummary>();
  for (const c of list) {
    const slug = storeSlug(c.store);
    const s = by.get(slug) ?? { store: c.store, slug, count: 0, clicks: 0, logo_url: null, domain: couponDomain(c) };
    s.count++;
    s.clicks += c.clicks;
    s.logo_url ??= c.logo_url;
    by.set(slug, s);
  }
  return [...by.values()].sort((a, b) => b.clicks - a.clicks || b.count - a.count || a.store.localeCompare(b.store));
}

// The owner's coupons for the store a product is on, shaped like the coupons found by AI.
export function couponsForPlatform(platform: Platform): Coupon[] {
  const name = storeSlug(PLATFORM_NAMES[platform]);
  return liveCoupons()
    .filter((c) => storeSlug(c.store) === name)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.clicks - a.clicks)
    .slice(0, 5)
    .map((c) => ({
      code: c.code,
      title: c.title,
      discount_text: c.discount_text,
      conditions: c.description,
      source_url: absolute(`/api/coupon/${c.id}`).toString(),
    }));
}
