import 'server-only';
import { read, write, type BestPrice, type Product } from './db';
import type { BankOffer } from './offer-text';
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
        required: ['store', 'best_price', 'offer', 'offers', 'source_url'],
        properties: {
          store: { type: 'string', description: 'store name exactly as given in the list' },
          best_price: { type: ['number', 'null'], description: 'price in INR after the single best offer, or null if no current offer applies' },
          offer: { type: 'string', description: 'the offer, e.g. "₹787 off with HDFC Bank credit card EMI" or "Coupon SAVE10: 10% off up to ₹500"' },
          offers: {
            type: 'array',
            maxItems: 3,
            description: 'the bank/card offers on this store for this product, biggest saving first',
            items: { type: 'object', additionalProperties: false, required: ['amount', 'text'], properties: { amount: { type: 'number' }, text: { type: 'string', description: 'e.g. "₹56 off · Flipkart Axis Credit Card"' } } },
          },
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
  const r = await askAI<{ stores: { store: string; best_price: number | null; offer: string; offers: BankOffer[]; source_url: string }[] }>({
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
    const offers = (hit?.offers || []).filter((o) => o.amount > 0 && o.amount <= s.price * 0.5 && o.text).map((o) => ({ amount: Math.round(o.amount), text: o.text.slice(0, 90) }));
    return { store: s.store, price: s.price, best: ok ? Math.round(hit!.best_price!) : s.price, offer: ok ? hit!.offer.slice(0, 120) : '', offers: ok ? offers : [], source_url: ok ? hit!.source_url : '', from: 'ai' as const };
  });
  write((d) => {
    (d.best_price ??= {})[product.id] = { stores, fetched_at: new Date().toISOString() };
  });
  return stores;
}

// What the store's own page shows ("Buy at ₹1,057" and its bank offers) beats a web search for that store.
function withOwnPage(stores: BestPrice[], product: Product): BestPrice[] {
  const name = PLATFORM_NAMES[product.platform];
  const offers = product.bank_offers ?? [];
  const best = product.offer_price && product.offer_price < product.price ? product.offer_price : offers[0] ? product.price - offers[0].amount : null;
  const rest = stores.filter((s) => s.store.toLowerCase() !== name.toLowerCase());
  const ai = stores.find((s) => s.store.toLowerCase() === name.toLowerCase());
  const own: BestPrice = best
    ? { store: name, price: product.price, best, offer: offers[0]?.text ?? 'Price after bank offers on the store page', offers, source_url: product.url, from: 'page' }
    : ai && ai.price === product.price
      ? ai
      : { store: name, price: product.price, best: product.price, offer: '', offers: [], source_url: '', from: 'page' };
  return [own, ...rest];
}

export function cachedBestPrices(productId: string): BestPrice[] | null {
  return read((d) => d.best_price?.[productId]?.stores ?? null);
}

export async function bestPrices(product: Product): Promise<{ stores: BestPrice[]; fetched_at: string; cached: boolean }> {
  const hit = read((d) => d.best_price?.[product.id]);
  // The shopper's own store price may have changed since: then it is looked up again.
  // Other stores' prices are compared afresh every 6 hours, so their offers are too.
  const fresh = hit && Date.now() - Date.parse(hit.fetched_at) < TTL_MS;
  if (fresh) return { ...hit!, stores: withOwnPage(hit!.stores, product), cached: true };
  let p = inFlight.get(product.id);
  if (!p) {
    p = find(product).finally(() => inFlight.delete(product.id));
    inFlight.set(product.id, p);
  }
  return { stores: withOwnPage(await p, product), fetched_at: new Date().toISOString(), cached: false };
}
