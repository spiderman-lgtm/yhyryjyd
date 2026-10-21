import 'server-only';
import { read, write, type Coupon, type Product } from './db';
import { PLATFORM_NAMES } from './scraper';
import { askAI } from './viasocket';

const TTL_MS = 6 * 3600_000;

const COUPON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['coupons'],
  properties: {
    coupons: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'title', 'discount_text', 'conditions', 'source_url'],
        properties: {
          code: { type: ['string', 'null'], description: 'coupon code to type at checkout, or null for an automatic/bank offer' },
          title: { type: 'string', description: 'short name of the offer' },
          discount_text: { type: 'string', description: 'e.g. "10% off up to ₹1,500"' },
          conditions: { type: 'string', description: 'minimum order, bank, card, or first-order rules; empty if none' },
          source_url: { type: 'string', description: 'page where you found this offer' },
        },
      },
    },
  },
};

const inFlight = new Map<string, Promise<Coupon[]>>();

export async function getCoupons(product: Product): Promise<{ coupons: Coupon[]; cached: boolean }> {
  const key = `${product.platform}:${product.id}`;
  const hit = read((d) => d.coupons[key]);
  if (hit && Date.now() - Date.parse(hit.fetched_at) < TTL_MS) return { coupons: hit.coupons, cached: true };
  // A retry while the first search is still running joins it instead of starting another.
  let search = inFlight.get(key);
  if (!search) {
    search = searchCoupons(product, key).finally(() => inFlight.delete(key));
    inFlight.set(key, search);
  }
  return { coupons: await search, cached: false };
}

async function searchCoupons(product: Product, key: string): Promise<Coupon[]> {

  const store = PLATFORM_NAMES[product.platform];
  const r = await askAI<{ coupons: Coupon[] }>({
    thread_id: `coupons-${product.id}-${Date.now()}`,
    prompt:
      'You find currently valid shopping coupons and offers for Indian online stores. Search the web. ' +
      'Only include offers you saw on a page that is current (this month), and give that page as source_url. ' +
      'Prefer offers that apply to the given product or its category, then store-wide bank/card offers. ' +
      'Never invent codes. If nothing current is found, return an empty list.',
    message: `Store: ${store}\nProduct: ${product.title}\nPrice: ${product.currency} ${product.price}\nProduct URL: ${product.url}\nToday: ${new Date().toISOString().slice(0, 10)}`,
    schemaName: 'coupons',
    schema: COUPON_SCHEMA,
  });
  const coupons = (r?.coupons || []).filter((c) => c.title && /^https?:\/\//.test(c.source_url));
  write((d) => {
    d.coupons[key] = { key, coupons, fetched_at: new Date().toISOString() };
  });
  return coupons;
}

export function cachedCoupon(product: Product): Coupon | null {
  const hit = read((d) => d.coupons[`${product.platform}:${product.id}`]);
  return hit?.coupons.find((c) => c.code) ?? hit?.coupons[0] ?? null;
}

export function affiliateLink(product: Product): string {
  const tag = process.env.AMAZON_ASSOCIATE_TAG;
  if (product.platform === 'amazon' && tag) {
    const u = new URL(product.url);
    u.searchParams.set('tag', tag);
    return u.toString();
  }
  const cid = process.env.CUELINKS_CID;
  if (cid) return `https://linksredirect.com/?cid=${encodeURIComponent(cid)}&source=linkkit&url=${encodeURIComponent(product.url)}`;
  return product.url;
}
