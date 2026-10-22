import type { Platform } from './db';

export const STORES: { slug: Platform; name: string; color: string; example: string }[] = [
  { slug: 'amazon', name: 'Amazon', color: '#ff9900', example: 'https://www.amazon.in/dp/B0XXXXXXXX' },
  { slug: 'flipkart', name: 'Flipkart', color: '#2874f0', example: 'https://www.flipkart.com/…/p/itm…?pid=…' },
  { slug: 'myntra', name: 'Myntra', color: '#ff3f6c', example: 'https://www.myntra.com/…/12345678/buy' },
  { slug: 'ajio', name: 'AJIO', color: '#2c4152', example: 'https://www.ajio.com/…/p/…' },
  { slug: 'meesho', name: 'Meesho', color: '#9f2089', example: 'https://www.meesho.com/…/p/…' },
  { slug: 'croma', name: 'Croma', color: '#12daa8', example: 'https://www.croma.com/…/p/…' },
  { slug: 'tatacliq', name: 'Tata CLiQ', color: '#da1c5c', example: 'https://www.tatacliq.com/…/p-mp…' },
  { slug: 'reliancedigital', name: 'Reliance Digital', color: '#e42529', example: 'https://www.reliancedigital.in/…/p/…' },
  { slug: 'nykaa', name: 'Nykaa', color: '#fc2779', example: 'https://www.nykaa.com/…/p/…' },
  { slug: 'jiomart', name: 'JioMart', color: '#0078ad', example: 'https://www.jiomart.com/p/…' },
];

export const storeBySlug = (s: string) => STORES.find((x) => x.slug === s) ?? null;

// Brand colours for stores we compare against but do not open links from.
const EXTRA_COLORS: Record<string, string> = { zepto: '#5a189a', blinkit: '#0c831f', instamart: '#fc8019', bigbasket: '#84c225' };
const FALLBACK = ['#0891b2', '#7c3aed', '#be185d', '#4d7c0f', '#b45309', '#475569'];

export function storeColor(name: string) {
  const key = name.toLowerCase();
  const known = STORES.find((s) => s.name.toLowerCase() === key)?.color ?? EXTRA_COLORS[key];
  if (known) return known;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

// Each store's web address, used to show its real logo (see /api/logo).
export const STORE_DOMAINS: Record<string, string> = {
  amazon: 'amazon.in',
  flipkart: 'flipkart.com',
  myntra: 'myntra.com',
  ajio: 'ajio.com',
  meesho: 'meesho.com',
  croma: 'croma.com',
  'tata cliq': 'tatacliq.com',
  'reliance digital': 'reliancedigital.in',
  'vijay sales': 'vijaysales.com',
  nykaa: 'nykaa.com',
  jiomart: 'jiomart.com',
  zepto: 'zeptonow.com',
  blinkit: 'blinkit.com',
  instamart: 'swiggy.com',
  bigbasket: 'bigbasket.com',
};

export const storeDomain = (name: string) => STORE_DOMAINS[name.toLowerCase()] ?? null;

export function hostOf(url: string | null | undefined) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}
