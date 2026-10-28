import 'server-only';
import { read, write, type BestPrice, type Product } from './db';
import { PLATFORM_NAMES } from './scraper';
import { askAI } from './viasocket';
import { compareStores } from './compare';

// "Lowest price for you": what each store charges after its best offer (a bank or card discount, a coupon), like
// the "₹3,582 with offers" a store shows under its price. Found by viaSocket AI web search, cached for 6 hours.

const TTL_MS = 6 * 3600_000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stores'],
  properties: {
    stores: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['store', 'best_price', 'offer', 'source_url'],
        properties: {
          store: { type: 'string', description: 'store name exactly as given in the list' },
          best_price: { type: ['number', 'null'], description: 'price in INR after the single best offer, or null if no current offer applies' },
          offer: { type: 'string', description: 'the offer, e.g. "₹787 off with HDFC Bank credit card EMI" or "Coupon SAVE10: 10% off up to ₹500"' },
          source_url: { type: 'string', description: 'page where you saw the offer' },
        },
      },
    },
  },
};

const PROMPT =
  'You find the lowest price a shopper in India can pay for a product on each store after offers. For each store in the list, ' +
  'look at the product page and the store\'s current offers: bank and card instant discounts, coupons, and the store\'s own "price with offers" ' +
  '(Flipkart shows it as "₹X with Bank offer" / "Buy at ₹X", Amazon lists bank offers under the price). Pick the single offer that lowers ' +
  'the price most and that most shoppers can use (a common bank card or a coupon; not exchange, not membership-only, not cashback paid later). ' +
  'best_price = selling price minus that discount. Only use offers you saw today on a current page; never guess. If none applies, best_price = null.';

const inFlight = new Map<string, Promise<BestPrice[]>>();

async function find(product: Product): Promise<BestPrice[]> {
  const compared = await compareStores(product).catch(() => ({ offers: [] as { store: string; price: number; url: string; same_variant: boolean; in_stock: boolean }[] }));
  const list = [
    { store: PLATFORM_NAMES[product.platform], price: product.price, url: product.url },
    ...compared.offers.filter((o) => o.same_variant && o.in_stock).slice(0, 5),
  ];
  const r = await askAI<{ stores: { store: string; best_price: number | null; offer: string; source_url: string }[] }>({
    thread_id: `best-${product.id}-${Date.now()}`,
    prompt: PROMPT,
    message: `Product: ${product.title}\nToday: ${new Date().toISOString().slice(0, 10)}\nStores:\n${list.map((s) => `- ${s.store}: ₹${s.price} — ${s.url}`).join('\n')}`,
    schemaName: 'best_prices',
    schema: SCHEMA,
  }).catch(() => ({ stores: [] }));
  const stores: BestPrice[] = list.map((s) => {
    const hit = (r?.stores || []).find((x) => x.store.toLowerCase() === s.store.toLowerCase());
    // An offer must lower the price, and by no more than half: anything else is a misread.
    const ok = hit && hit.best_price && hit.best_price < s.price && hit.best_price >= s.price * 0.5 && hit.offer && /^https?:\/\//.test(hit.source_url);
    return { store: s.store, price: s.price, best: ok ? Math.round(hit!.best_price!) : s.price, offer: ok ? hit!.offer.slice(0, 120) : '', source_url: ok ? hit!.source_url : '' };
  });
  write((d) => {
    (d.best_price ??= {})[product.id] = { stores, fetched_at: new Date().toISOString() };
  });
  return stores;
}

export function cachedBestPrices(productId: string): BestPrice[] | null {
  return read((d) => d.best_price?.[productId]?.stores ?? null);
}

export async function bestPrices(product: Product): Promise<{ stores: BestPrice[]; fetched_at: string; cached: boolean }> {
  const hit = read((d) => d.best_price?.[product.id]);
  // The shopper's own store price may have changed since: then it is looked up again.
  const fresh = hit && Date.now() - Date.parse(hit.fetched_at) < TTL_MS && hit.stores[0]?.price === product.price;
  if (fresh) return { ...hit!, cached: true };
  let p = inFlight.get(product.id);
  if (!p) {
    p = find(product).finally(() => inFlight.delete(product.id));
    inFlight.set(product.id, p);
  }
  return { stores: await p, fetched_at: new Date().toISOString(), cached: false };
}
