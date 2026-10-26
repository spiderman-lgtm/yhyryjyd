import 'server-only';
import { newId, read, write, type CouponCategory, type CouponSuggestion } from './db';
import { PLATFORM_NAMES } from './scraper';
import { cleanCoupon } from './storecoupons';
import { askOffers } from './ops-alerts';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

type Draft = Omit<CouponSuggestion, 'id' | 'created_at' | 'status'>;

// Adds suggestions the owner has not seen yet (approved, rejected or pending ones are skipped).
export function addSuggestions(drafts: Draft[]): number {
  return write((d) => {
    const known = new Set(Object.values(d.coupon_suggestions).map((s) => s.key));
    let added = 0;
    for (const x of drafts) {
      if (known.has(x.key)) continue;
      known.add(x.key);
      const id = newId('sg');
      d.coupon_suggestions[id] = { ...x, id, created_at: new Date().toISOString(), status: 'pending' };
      added++;
    }
    // Keep the queue small: the oldest pending suggestions go first.
    const pending = Object.values(d.coupon_suggestions).filter((s) => s.status === 'pending').sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    for (const s of pending.slice(0, Math.max(0, pending.length - 400))) delete d.coupon_suggestions[s.id];
    return added;
  });
}

// Pulls one JSON object out of a page, starting at its opening brace.
function objectAt(text: string, start: number): unknown {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length && i < start + 60000; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const AMAZON_CATEGORY: [RegExp, CouponCategory][] = [
  [/beauty|luxury_beauty/, 'beauty'],
  [/health|personal_care|drugstore/, 'health'],
  [/grocery|gourmet/, 'grocery'],
  [/apparel|shoes|jewelry|watch|luggage|fashion/, 'fashion'],
  [/electronics|wireless|pc|camera|video_games|home_entertainment|major_appliances/, 'electronics'],
  [/book|software/, 'education'],
];

// Amazon's own coupons page: products with a coupon to clip, and what you pay with it.
async function amazonCoupons(): Promise<Draft[]> {
  const res = await fetch('https://www.amazon.in/coupons', { headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9' }, signal: AbortSignal.timeout(20000), cache: 'no-store' });
  if (!res.ok) throw new Error(`amazon coupons ${res.status}`);
  const html = await res.text();
  const out: Draft[] = [];
  let at = -1;
  while ((at = html.indexOf('{"asin":"', at + 1)) >= 0 && out.length < 60) {
    const o = objectAt(html, at) as any;
    if (!o?.asin || !o.title || !o.coupon) continue;
    const price = Number(o.price?.priceToPay?.price);
    const pay = Number(o.coupon?.label?.fragments?.find((f: any) => f.money)?.money?.amount);
    if (!(price > 0 && pay > 0 && pay < price)) continue;
    const saving = Math.round(price - pay);
    const pct = Math.round((saving / price) * 100);
    if (saving < 10) continue;
    const symbol = String(o.productCategory?.symbol ?? '');
    const category = AMAZON_CATEGORY.find(([re]) => re.test(symbol))?.[1] ?? 'other';
    const title = String(o.title).replace(/\s+/g, ' ').trim();
    out.push({
      key: `amazon:${o.asin}:${o.coupon.id ?? ''}`,
      source: 'amazon-coupons',
      store: 'Amazon',
      title: `Extra ₹${saving} off with coupon: ${title.slice(0, 90)}`,
      discount_text: pct >= 5 ? `${pct}% off` : `₹${saving} off`,
      code: null,
      description: `Tick “Apply coupon” on the product page. Price ₹${Math.round(price)}, you pay ₹${Math.round(pay)}.`,
      url: `https://www.amazon.in/dp/${o.asin}`,
      image: o.image?.lowRes?.baseUrl ? `${o.image.lowRes.baseUrl}._SL300_.jpg` : null,
      category,
      // Amazon coupons change often, so an approved one is shown for 3 days unless edited.
      expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
      submitted_by: null,
    });
  }
  return out;
}

// Bank and card offers already found on tracked products' pages.
function productOffers(): Draft[] {
  return read((d) => {
    const out: Draft[] = [];
    for (const [key, cache] of Object.entries(d.coupons)) {
      const [platform, productId] = key.split(':');
      const p = d.products[productId];
      if (!p || Date.now() - Date.parse(cache.fetched_at) > 7 * 86400_000) continue;
      for (const c of cache.coupons) {
        out.push({
          key: `offer:${platform}:${(c.code || c.title).toLowerCase()}`,
          source: 'product-offers',
          store: PLATFORM_NAMES[p.platform],
          title: c.title,
          discount_text: c.discount_text.slice(0, 40),
          code: c.code,
          description: c.conditions,
          url: p.url,
          image: p.image,
          category: 'other',
          expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
          submitted_by: null,
        });
      }
    }
    return out;
  });
}

let running: Promise<{ added: number; errors: string[] }> | null = null;

// Reads the stores' offer pages and queues what is new for the owner. Runs at most every 6 hours
// on its own; the owner can force it from Admin.
export function checkStoreOffers(force = false) {
  const last = read((d) => d.settings.offers_checked_at);
  if (!force && last && Date.now() - Date.parse(last) < 6 * 3600_000) return Promise.resolve({ added: 0, errors: [] as string[] });
  running ??= (async () => {
    const errors: string[] = [];
    const drafts: Draft[] = [];
    await amazonCoupons().then((x) => drafts.push(...x)).catch((e) => errors.push(`Amazon coupons page: ${e instanceof Error ? e.message : e}`));
    drafts.push(...productOffers());
    const added = addSuggestions(drafts);
    write((d) => void (d.settings.offers_checked_at = new Date().toISOString()));
    if (added > 0) await askOffers(added, read((d) => Object.values(d.coupon_suggestions).filter((s) => s.status === 'pending').length));
    return { added, errors };
  })().finally(() => (running = null));
  return running;
}

// Publishes a suggestion as a live coupon.
export function approveSuggestion(id: string): { ok: true; coupon_id: string } | { error: string } {
  return write((d) => {
    const s = d.coupon_suggestions[id];
    if (!s) return { error: 'That suggestion no longer exists.' };
    if (s.status === 'approved' && s.coupon_id) return { ok: true as const, coupon_id: s.coupon_id };
    const c = cleanCoupon({ ...s, expires_at: s.expires_at ? s.expires_at.slice(0, 10) : '' });
    if ('error' in c) return c;
    d.store_coupons[c.id] = c;
    s.status = 'approved';
    s.coupon_id = c.id;
    return { ok: true as const, coupon_id: c.id };
  });
}

export function rejectSuggestion(id: string) {
  write((d) => {
    const s = d.coupon_suggestions[id];
    if (s) s.status = 'rejected';
  });
}
