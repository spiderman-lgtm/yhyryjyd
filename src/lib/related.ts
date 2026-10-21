import 'server-only';
import { read, write, type Product, type RelatedItem } from './db';
import { PLATFORM_NAMES } from './scraper';
import { askAI } from './viasocket';

const TTL_MS = 12 * 3600_000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'store', 'price', 'url', 'image'],
        properties: {
          title: { type: 'string' },
          store: { type: 'string', description: 'Amazon, Flipkart, Myntra, AJIO, Meesho, Croma…' },
          price: { type: 'number', description: 'current selling price in INR' },
          url: { type: 'string', description: "product page URL on the store's own website" },
          image: { type: ['string', 'null'], description: 'absolute URL of the product image' },
        },
      },
    },
  },
};

const PROMPT =
  'You find similar-looking alternative products on Indian online stores (Amazon.in, Flipkart, Myntra, AJIO, Meesho, Croma, ' +
  'Tata CLiQ, Reliance Digital, Nykaa). Given one product, search the web for up to 12 products of the same type and use that ' +
  "a shopper might buy instead — other brands or models, mixed price levels, several stores. Give each one's current price " +
  "from the store's own product page, that page's URL and its image URL. Never guess prices. Do not include the exact same product.";

const STOP = new Set(['with', 'for', 'and', 'the', 'pack', 'set', 'men', 'women', 'black', 'white', 'size', 'free', 'new', 'of', 'in', 'by', 'from', 'pcs']);
const tokens = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)));

// Products other shoppers already checked, ranked by shared words in the title.
function fromDatabase(product: Product): RelatedItem[] {
  const mine = tokens(product.title);
  return read((d) =>
    Object.values(d.products)
      .filter((p) => p.id !== product.id && !p.last_error)
      .map((p) => {
        const theirs = tokens(p.title);
        let shared = 0;
        for (const w of mine) if (theirs.has(w)) shared++;
        return { p, shared };
      })
      .filter((x) => x.shared >= 2)
      .sort((a, b) => b.shared - a.shared)
      .slice(0, 6)
      .map(({ p }) => ({ title: p.title, store: PLATFORM_NAMES[p.platform], price: p.price, url: p.url, image: p.image, product_id: p.id })),
  );
}

const inFlight = new Map<string, Promise<RelatedItem[]>>();

async function searchWeb(product: Product): Promise<RelatedItem[]> {
  const r = await askAI<{ items: RelatedItem[] }>({
    thread_id: `related-${product.id}-${Date.now()}`,
    prompt: PROMPT,
    message: `Product: ${product.title}\nStore: ${PLATFORM_NAMES[product.platform]}\nPrice: ₹${product.price}\nToday: ${new Date().toISOString().slice(0, 10)}`,
    schemaName: 'related',
    schema: SCHEMA,
  });
  const seen = new Set<string>();
  const items = (r?.items || [])
    .filter((i) => i.price > 0 && i.title && /^https?:\/\//.test(i.url) && !/google\.|bing\./.test(i.url))
    .filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
    .map((i) => ({ title: i.title.slice(0, 160), store: i.store.slice(0, 40), price: Math.round(i.price), url: i.url, image: i.image && /^https?:\/\//.test(i.image) ? i.image : null }));
  write((d) => {
    d.related[product.id] = { items, fetched_at: new Date().toISOString() };
  });
  return items;
}

export async function relatedProducts(product: Product): Promise<{ items: RelatedItem[]; aiError?: string }> {
  const local = fromDatabase(product);
  const hit = read((d) => d.related[product.id]);
  let web: RelatedItem[] = [];
  let aiError: string | undefined;
  if (hit && Date.now() - Date.parse(hit.fetched_at) < TTL_MS) web = hit.items;
  else {
    let p = inFlight.get(product.id);
    if (!p) {
      p = searchWeb(product).finally(() => inFlight.delete(product.id));
      inFlight.set(product.id, p);
    }
    web = await p.catch((e) => {
      aiError = e instanceof Error ? e.message : String(e);
      return hit?.items ?? [];
    });
  }
  const urls = new Set(local.map((i) => i.url));
  const items = [...local, ...web.filter((i) => !urls.has(i.url))].sort((a, b) => a.price - b.price);
  return { items, aiError };
}

export function cachedRelated(productId: string, index: number): RelatedItem | null {
  return read((d) => d.related[productId]?.items[index] ?? null);
}
