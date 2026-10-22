import 'server-only';
import { read, recordOffers, write, type Product, type StoreOffer } from './db';
import { PLATFORM_NAMES } from './scraper';
import { askAI } from './viasocket';
import { searchStores } from './storesearch';

const TTL_MS = 6 * 3600_000;

const OFFERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['offers'],
  properties: {
    offers: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['store', 'price', 'url', 'in_stock', 'same_variant'],
        properties: {
          store: { type: 'string', description: 'store name, e.g. Amazon, Flipkart, Croma' },
          price: { type: 'number', description: 'current selling price in INR, number only' },
          url: { type: 'string', description: "direct product page URL on that store's own site" },
          in_stock: { type: 'boolean' },
          same_variant: { type: 'boolean', description: 'false if size/storage/colour/pack differs from the product asked about' },
        },
      },
    },
  },
};

const PROMPT =
  'You compare prices across Indian online stores. Search the web for the exact same product (same brand, model and ' +
  'size/storage/colour variant) on other stores: Amazon.in, Flipkart, Myntra, AJIO, Meesho, Tata CLiQ, Croma, Reliance Digital, ' +
  'Vijay Sales, Nykaa, JioMart. Search each likely store separately. For each store where you find it, give the current selling ' +
  "price in INR and the product page URL on that store's own website. Only include prices you saw on the store's own page today; " +
  'never guess or use remembered prices. Set same_variant=false when the listing is a different variant. Do not include the store ' +
  'the shopper is already on. If you find nothing, return an empty list.';

const inFlight = new Map<string, Promise<StoreOffer[]>>();

function hostOk(url: string) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && !/google\.|bing\.|smartprix|pricehistory|91mobiles|mysmartprice/.test(u.hostname);
  } catch {
    return false;
  }
}

async function searchWithAI(product: Product): Promise<StoreOffer[]> {
  const r = await askAI<{ offers: StoreOffer[] }>({
    thread_id: `compare-${product.id}-${Date.now()}`,
    prompt: PROMPT,
    message: `Product: ${product.title}\nCurrently on: ${PLATFORM_NAMES[product.platform]} at ₹${product.price}\nProduct URL: ${product.url}\nToday: ${new Date().toISOString().slice(0, 10)}`,
    schemaName: 'offers',
    schema: OFFERS_SCHEMA,
  });
  return r?.offers || [];
}

// Quick-commerce prices depend on whose delivery address the extension used, so they stay out of other pincodes' lists.
const LOCAL_ONLY = new Set(['zepto', 'blinkit', 'instamart', 'bigbasket']);

export const isPin = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{5}$/.test(v);
const keyFor = (productId: string, pin?: string | null) => (pin ? `${productId}@${pin}` : productId);

async function search(product: Product, pin: string | null, allowAi: boolean): Promise<StoreOffer[]> {
  const here = PLATFORM_NAMES[product.platform].toLowerCase();
  const key = keyFor(product.id, pin);
  // Direct store searches always run; AI web search adds stores we have no searcher for, when credits allow.
  const [direct, ai] = await Promise.all([searchStores(product, pin).catch(() => []), allowAi ? searchWithAI(product).catch(() => []) : []]);
  const seen = new Set<string>();
  const offers = [...direct, ...ai]
    .filter((o) => o.price > 0 && hostOk(o.url) && o.store.toLowerCase() !== here)
    // A price under a quarter of this one is almost always an accessory or a different item.
    .filter((o) => o.price >= product.price * 0.25)
    .filter((o) => (seen.has(o.store.toLowerCase()) ? false : (seen.add(o.store.toLowerCase()), true)))
    .map((o) => ({ store: o.store.slice(0, 40), price: Math.round(o.price), url: o.url, in_stock: o.in_stock, same_variant: o.same_variant, ...(o.delivery ? { delivery: o.delivery } : {}) }))
    .sort((a, b) => a.price - b.price);
  // Keep stores the extension reported from shoppers' browsers that the server search cannot reach.
  const merged = write((d) => {
    const found = new Set(offers.map((o) => o.store.toLowerCase()));
    const previous = [...(d.compare[key]?.offers ?? []), ...(pin ? (d.compare[product.id]?.offers ?? []).filter((o) => !LOCAL_ONLY.has(o.store.toLowerCase())) : [])];
    const kept = previous.filter((o) => !found.has(o.store.toLowerCase()) && (found.add(o.store.toLowerCase()), true));
    const all = [...offers, ...kept].sort((a, b) => a.price - b.price);
    d.compare[key] = { offers: all, fetched_at: new Date().toISOString() };
    recordOffers(d, product.id, offers);
    return all;
  });
  return merged;
}

export async function compareStores(product: Product, pin: string | null = null, { allowAi = true } = {}): Promise<{ offers: StoreOffer[]; fetched_at: string; cached: boolean }> {
  const key = keyFor(product.id, pin);
  const hit = read((d) => d.compare[key]);
  // An empty result may be a temporary block, so it is retried sooner.
  if (hit && Date.now() - Date.parse(hit.fetched_at) < (hit.offers.length ? TTL_MS : 30 * 60_000)) return { ...hit, cached: true };
  let p = inFlight.get(key);
  if (!p) {
    p = search(product, pin, allowAi).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  const offers = await p;
  return { offers, fetched_at: new Date().toISOString(), cached: false };
}

// A store's offer by name, from this pincode's comparison or the general one (where the extension adds the
// prices it found), so a link always opens the store it names.
export function offerByStore(productId: string, store: string, pin: string | null = null): StoreOffer | null {
  const name = store.toLowerCase();
  return read((d) => {
    for (const key of [keyFor(productId, pin), productId]) {
      const o = d.compare[key]?.offers.find((x) => x.store.toLowerCase() === name);
      if (o) return o;
    }
    return null;
  });
}

export function cachedOffer(productId: string, index: number, pin: string | null = null): StoreOffer | null {
  return read((d) => d.compare[keyFor(productId, pin)]?.offers[index] ?? null);
}
