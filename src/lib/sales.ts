import 'server-only';
import { read, write } from './db';
import { askAI } from './viasocket';
import { hostOf, storeDomain } from './stores';

// Sale events running now (or starting within a week) on Indian stores — Big Billion Days, Great Indian Festival,
// End of Reason Sale and the like — found by viaSocket AI web search and refreshed every 6 hours.

export interface Sale {
  store: string;
  name: string;
  status: 'live' | 'upcoming';
  starts: string | null;
  ends: string | null;
  highlight: string;
  bank_offer: string;
  url: string;
}

const STORES = ['Amazon', 'Flipkart', 'Myntra', 'AJIO', 'Meesho', 'Tata CLiQ', 'Croma', 'Reliance Digital', 'Vijay Sales', 'Nykaa', 'JioMart'];
const TTL_MS = 6 * 3600_000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sales'],
  properties: {
    sales: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['store', 'name', 'status', 'starts', 'ends', 'highlight', 'bank_offer', 'url'],
        properties: {
          store: { type: 'string', enum: STORES },
          name: { type: 'string', description: 'the sale name as the store calls it' },
          status: { type: 'string', enum: ['live', 'upcoming'] },
          starts: { type: ['string', 'null'], description: 'start date YYYY-MM-DD if known' },
          ends: { type: ['string', 'null'], description: 'end date YYYY-MM-DD if known' },
          highlight: { type: 'string', description: 'the headline discount, e.g. "Up to 80% off on electronics"' },
          bank_offer: { type: 'string', description: 'bank/card offer during the sale, or empty' },
          url: { type: 'string', description: "the sale page on the store's own website" },
        },
      },
    },
  },
};

const PROMPT =
  'You track sale events on Indian online stores. Search the web for sales that are running today or start within the next 7 days on: ' +
  STORES.join(', ') +
  '. Include big festive sales and smaller store-wide sale events. Only include a sale you saw announced on a current page (the store, ' +
  'or a news site this month); never guess dates. Give the sale page on the store\'s own website as url. If none are running, return an empty list.';

// Each store's own sale/offers page, shown even when no sale details could be found, so a shopper can always
// check what is live there right now.
export const SALE_PAGES: { store: string; url: string }[] = [
  { store: 'Amazon', url: 'https://www.amazon.in/deals' },
  { store: 'Flipkart', url: 'https://www.flipkart.com/offers-store' },
  { store: 'Myntra', url: 'https://www.myntra.com/' },
  { store: 'AJIO', url: 'https://www.ajio.com/' },
  { store: 'Meesho', url: 'https://www.meesho.com/' },
  { store: 'Tata CLiQ', url: 'https://www.tatacliq.com/' },
  { store: 'Croma', url: 'https://www.croma.com/' },
  { store: 'Reliance Digital', url: 'https://www.reliancedigital.in/' },
  { store: 'Vijay Sales', url: 'https://www.vijaysales.com/' },
  { store: 'Nykaa', url: 'https://www.nykaa.com/' },
  { store: 'JioMart', url: 'https://www.jiomart.com/' },
];

// Whether a search is running now (the page then waits for it a little).
export const salesSearching = () => !!running;

let running: Promise<Sale[]> | null = null;
let lastTry = 0;

async function find(): Promise<Sale[]> {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const r = await askAI<{ sales: Sale[] }>({ thread_id: `sales-${Date.now()}`, prompt: PROMPT, message: `Today: ${today}`, schemaName: 'sales', schema: SCHEMA });
  const seen = new Set<string>();
  const sales = (r?.sales || [])
    // The link must open the store it names, and a sale that already ended is dropped.
    .filter((s) => {
      const host = hostOf(s.url);
      const dom = storeDomain(s.store);
      return !!host && !!dom && (host === dom || host.endsWith('.' + dom));
    })
    .filter((s) => !s.ends || s.ends >= today)
    .map((s) => ({ ...s, status: (s.starts && s.starts > today ? 'upcoming' : s.status) as Sale['status'], name: s.name.slice(0, 80), highlight: s.highlight.slice(0, 120), bank_offer: s.bank_offer.slice(0, 120) }))
    .filter((s) => (seen.has(`${s.store}:${s.name}`.toLowerCase()) ? false : (seen.add(`${s.store}:${s.name}`.toLowerCase()), true)))
    .sort((a, b) => (a.status === b.status ? (a.ends ?? '9').localeCompare(b.ends ?? '9') : a.status === 'live' ? -1 : 1));
  write((d) => void (d.sales = { items: sales, fetched_at: new Date().toISOString() }));
  return sales;
}

export function liveSales(): { sales: Sale[]; fetched_at: string | null } {
  const hit = read((d) => d.sales);
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return { sales: (hit?.items ?? []).filter((s) => !s.ends || s.ends >= today), fetched_at: hit?.fetched_at ?? null };
}

export function salesStale() {
  const at = read((d) => d.sales?.fetched_at ?? null);
  // A failed search is not retried for 30 minutes, so page views don't keep spending AI credits.
  return Date.now() - lastTry > 30 * 60_000 && (!at || Date.now() - Date.parse(at) > TTL_MS);
}

export function refreshSales(): Promise<Sale[]> {
  lastTry = Date.now();
  running ??= find()
    .catch((e) => {
      console.error('[sales] search failed:', e instanceof Error ? e.message : e);
      return [];
    })
    .finally(() => (running = null));
  return running;
}
