import 'server-only';
import { read, write, type Product, type StoreOffer } from './db';
import { PLATFORM_NAMES } from './scraper';
import { askAI } from './viasocket';

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

async function search(product: Product): Promise<StoreOffer[]> {
  const here = PLATFORM_NAMES[product.platform].toLowerCase();
  const r = await askAI<{ offers: StoreOffer[] }>({
    thread_id: `compare-${product.id}-${Date.now()}`,
    prompt: PROMPT,
    message: `Product: ${product.title}\nCurrently on: ${PLATFORM_NAMES[product.platform]} at ₹${product.price}\nProduct URL: ${product.url}\nToday: ${new Date().toISOString().slice(0, 10)}`,
    schemaName: 'offers',
    schema: OFFERS_SCHEMA,
  });
  const seen = new Set<string>();
  const offers = (r?.offers || [])
    .filter((o) => o.price > 0 && hostOk(o.url) && o.store.toLowerCase() !== here)
    // A price under a quarter of this one is almost always an accessory or a different item.
    .filter((o) => o.price >= product.price * 0.25)
    .filter((o) => (seen.has(o.store.toLowerCase()) ? false : (seen.add(o.store.toLowerCase()), true)))
    .map((o) => ({ store: o.store.slice(0, 40), price: Math.round(o.price), url: o.url, in_stock: o.in_stock, same_variant: o.same_variant }))
    .sort((a, b) => a.price - b.price);
  write((d) => {
    d.compare[product.id] = { offers, fetched_at: new Date().toISOString() };
  });
  return offers;
}

export async function compareStores(product: Product): Promise<{ offers: StoreOffer[]; fetched_at: string; cached: boolean }> {
  const hit = read((d) => d.compare[product.id]);
  if (hit && Date.now() - Date.parse(hit.fetched_at) < TTL_MS) return { ...hit, cached: true };
  let p = inFlight.get(product.id);
  if (!p) {
    p = search(product).finally(() => inFlight.delete(product.id));
    inFlight.set(product.id, p);
  }
  const offers = await p;
  return { offers, fetched_at: new Date().toISOString(), cached: false };
}

export function cachedOffer(productId: string, index: number): StoreOffer | null {
  return read((d) => d.compare[productId]?.offers[index] ?? null);
}
