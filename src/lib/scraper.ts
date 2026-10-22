import 'server-only';
import crypto from 'crypto';
import * as cheerio from 'cheerio';
import type { Platform } from './db';
import { askAI, askAIWithBrowser } from './viasocket';

export interface Scraped {
  title: string;
  image: string | null;
  price: number;
  mrp: number | null;
  currency: string;
  in_stock: boolean;
  source: 'page' | 'ai';
  images: string[];
  rating: number | null;
  reviews: number | null;
}

const absUrl = (u: unknown): string | null => (typeof u === 'string' && /^https?:\/\//.test(u) ? u : typeof u === 'object' && u && typeof (u as any).url === 'string' ? (u as any).url : null);

export function detectPlatform(url: URL): Platform {
  const h = url.hostname.replace(/^www\./, '');
  if (/(^|\.)amazon\.|amzn\.(in|to)$/.test(h)) return 'amazon';
  if (/flipkart\.com$|fkrt\.it$/.test(h)) return 'flipkart';
  if (/myntra\.com$/.test(h)) return 'myntra';
  if (/ajio\.com$/.test(h)) return 'ajio';
  if (/meesho\.com$/.test(h)) return 'meesho';
  if (/croma\.com$/.test(h)) return 'croma';
  if (/tatacliq\.com$/.test(h)) return 'tatacliq';
  if (/reliancedigital\.in$/.test(h)) return 'reliancedigital';
  if (/vijaysales\.com$/.test(h)) return 'vijaysales';
  if (/nykaa\.com$/.test(h)) return 'nykaa';
  if (/jiomart\.com$/.test(h)) return 'jiomart';
  return 'other';
}

export const PLATFORM_NAMES: Record<Platform, string> = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  myntra: 'Myntra',
  ajio: 'AJIO',
  meesho: 'Meesho',
  croma: 'Croma',
  tatacliq: 'Tata CLiQ',
  reliancedigital: 'Reliance Digital',
  vijaysales: 'Vijay Sales',
  nykaa: 'Nykaa',
  jiomart: 'JioMart',
  other: 'Online store',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function fetchHtml(url: string, timeoutMs = 12000): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9', Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`store answered ${res.status}`);
  return { html: await res.text(), finalUrl: res.url || url };
}

// Short links (amzn.to, fkrt.it, dl.flipkart.com) are resolved first so the canonical id is stable.
export async function resolveUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('That does not look like a link. Paste the full product URL.');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) links are supported.');
  if (/^(amzn\.(to|in)|fkrt\.it|dl\.flipkart\.com|myntr\.it)$/.test(url.hostname)) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      url = new URL(res.url);
    } catch {
      /* keep the short link */
    }
  }
  return url;
}

export function canonicalUrl(url: URL, platform: Platform): string {
  if (platform === 'amazon') {
    const asin = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1];
    if (asin) return `https://${url.hostname}/dp/${asin.toUpperCase()}`;
  }
  if (platform === 'flipkart') {
    const pid = url.searchParams.get('pid');
    return `https://www.flipkart.com${url.pathname}${pid ? `?pid=${pid}` : ''}`;
  }
  return `${url.origin}${url.pathname}`;
}

export function productIdFor(canonical: string) {
  return 'p_' + crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 12);
}

export function parsePrice(text: unknown): number | null {
  if (typeof text === 'number') return Number.isFinite(text) && text > 0 ? text : null;
  if (typeof text !== 'string') return null;
  const m = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fromJsonLd($: cheerio.CheerioAPI) {
  const out: Partial<Scraped> = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    let json: any;
    try {
      json = JSON.parse($(el).text());
    } catch {
      return;
    }
    const nodes: any[] = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];
    for (const n of nodes) {
      const type = Array.isArray(n?.['@type']) ? n['@type'] : [n?.['@type']];
      if (!type.includes('Product')) continue;
      out.title ??= n.name;
      const imgs = ((Array.isArray(n.image) ? n.image : [n.image]) as unknown[]).map(absUrl).filter((x): x is string => !!x);
      out.image ??= imgs[0] ?? null;
      if (!out.images?.length && imgs.length) out.images = imgs;
      const r = n.aggregateRating;
      if (r) {
        out.rating ??= parsePrice(r.ratingValue);
        out.reviews ??= parsePrice(r.reviewCount ?? r.ratingCount);
      }
      const offers = Array.isArray(n.offers) ? n.offers[0] : n.offers;
      const price = parsePrice(offers?.price ?? offers?.lowPrice);
      if (price) out.price ??= price;
      if (offers?.priceCurrency) out.currency ??= offers.priceCurrency;
      if (typeof offers?.availability === 'string') out.in_stock ??= !/OutOfStock|SoldOut/i.test(offers.availability);
    }
  });
  return out;
}

function parseHtml(html: string, platform: Platform): Partial<Scraped> {
  const $ = cheerio.load(html);
  const ld = fromJsonLd($);
  const meta = (p: string) => $(`meta[property="${p}"]`).attr('content') || $(`meta[name="${p}"]`).attr('content') || null;

  let title = ld.title || meta('og:title') || $('title').text() || '';
  let image = ld.image || meta('og:image') || null;
  let price = ld.price || parsePrice(meta('product:price:amount')) || parsePrice(meta('og:price:amount'));
  let mrp: number | null = null;
  let images = ld.images ?? [];
  let rating = ld.rating ?? null;
  let reviews = ld.reviews ?? null;

  if (platform === 'amazon') {
    rating = rating || parsePrice($('#acrPopover').attr('title'));
    reviews = reviews || parsePrice($('#acrCustomerReviewText').first().text());
    // Thumbnails carry a size token (._SS40_.); removing it gives the full-size image.
    const alt = $('#altImages img')
      .map((_, el) => $(el).attr('src') || '')
      .get()
      .filter((s) => /\/images\/I\//.test(s))
      .map((s) => s.replace(/\._[^/]+_\./, '.'));
    if (alt.length) images = alt;
    title = $('#productTitle').text().trim() || title;
    // Amazon has several price layouts; some leave the first .a-offscreen empty, so take the first that holds a number.
    const first = (sel: string) => $(sel).toArray().map((el) => parsePrice($(el).text())).find((n) => n) ?? null;
    const inBox = (inner: string) =>
      ['#corePriceDisplay_desktop_feature_div', '#corePrice_feature_div', '#apex_desktop', '#apex_offerDisplay_desktop'].map((b) => `${b} ${inner}`).join(', ');
    price =
      first(inBox('.priceToPay .a-offscreen') + ', ' + inBox('.priceToPay .aok-offscreen')) ||
      first(inBox('.a-price .a-offscreen')) ||
      first(inBox('.a-price-whole')) ||
      parsePrice($('#twister-plus-price-data-price').attr('value')) ||
      parsePrice(html.match(/"priceAmount"\s*:\s*([\d.]+)/)?.[1]) ||
      first('#priceblock_ourprice, #priceblock_dealprice, #tp_price_block_total_price_ww .a-offscreen') ||
      first('.a-price .a-offscreen') ||
      price;
    mrp = parsePrice($('.basisPrice .a-offscreen').first().text()) || parsePrice($('.a-price.a-text-price .a-offscreen').first().text());
    image = $('#landingImage').attr('data-old-hires') || $('#landingImage').attr('src') || image;
  }
  if (platform === 'myntra') {
    price = price || parsePrice(html.match(/"discounted"\s*:\s*(\d+)/)?.[1]);
    mrp = parsePrice(html.match(/"mrp"\s*:\s*(\d+)/)?.[1]);
  }
  if (!mrp) mrp = parsePrice(html.match(/"mrp"\s*:\s*"?(\d[\d,.]*)/i)?.[1]);

  return {
    title: title.replace(/\s+/g, ' ').replace(/\s*[|:-]\s*(Amazon\.in|Flipkart\.com|Myntra).*$/i, '').trim(),
    image,
    price: price ?? undefined,
    mrp: mrp && price && mrp > price ? mrp : null,
    currency: ld.currency || 'INR',
    in_stock: ld.in_stock ?? !/currently unavailable|out of stock|sold out/i.test($('body').text().slice(0, 50000)),
    images: [...new Set([image, ...images].filter((x): x is string => !!x))].slice(0, 8),
    rating: rating && rating <= 5 ? rating : null,
    reviews,
  };
}

const PRODUCT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'title', 'price', 'mrp', 'image', 'images', 'rating', 'review_count', 'currency', 'in_stock'],
  properties: {
    images: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'absolute URLs of the product gallery images' },
    rating: { type: ['number', 'null'], description: 'average star rating out of 5, if shown' },
    review_count: { type: ['number', 'null'], description: 'number of ratings or reviews, if shown' },
    found: { type: 'boolean', description: 'true only if the page was read and a selling price was seen on it' },
    title: { type: 'string' },
    price: { type: ['number', 'null'], description: 'current selling price, number only' },
    mrp: { type: ['number', 'null'], description: 'list price / MRP if shown, else null' },
    image: { type: ['string', 'null'], description: 'absolute URL of the main product image' },
    currency: { type: 'string', description: 'ISO code, e.g. INR' },
    in_stock: { type: 'boolean' },
  },
};

type AiProduct = {
  found: boolean;
  title: string;
  price: number | null;
  mrp: number | null;
  image: string | null;
  images: string[];
  rating: number | null;
  review_count: number | null;
  currency: string;
  in_stock: boolean;
};

const EXTRACT_PROMPT =
  'You read e-commerce product pages. Open the URL you are given and report what the page shows right now: ' +
  'current selling price, MRP, title, main image and stock. ' +
  'Never guess or use remembered prices: if you cannot see a current price on the page, set found=false and price=null.';

export class UnavailableError extends Error {}

async function aiExtract(url: string, productId: string, useBrowser: boolean): Promise<Scraped | null> {
  const req = { prompt: EXTRACT_PROMPT, message: `Product page: ${url}`, schemaName: 'product', schema: PRODUCT_SCHEMA };
  let r = await askAI<AiProduct>({ ...req, thread_id: `extract-${productId}-${Date.now()}` }).catch(() => null);
  if ((!r?.found || !r.price) && useBrowser) {
    r = (await askAIWithBrowser<AiProduct>({ ...req, thread_id: `extract-br-${productId}-${Date.now()}`, timeoutMs: 75_000 }).catch(() => null)) ?? r;
  }
  if (r && !r.found && r.in_stock === false && r.title && !/not found|404/i.test(r.title)) {
    throw new UnavailableError(`"${r.title}" shows no price right now — it looks out of stock or unavailable.`);
  }
  if (!r?.found || !r.price || r.price <= 0) return null;
  return {
    title: r.title,
    image: r.image,
    price: r.price,
    mrp: r.mrp && r.mrp > r.price ? r.mrp : null,
    currency: r.currency || 'INR',
    in_stock: r.in_stock,
    source: 'ai',
    images: [...new Set([r.image, ...(r.images || [])].map(absUrl).filter((x): x is string => !!x))].slice(0, 8),
    rating: r.rating && r.rating <= 5 ? r.rating : null,
    reviews: r.review_count && r.review_count > 0 ? Math.round(r.review_count) : null,
  };
}

// Names what the store sent back when a page has no price, so the shopper sees the real reason.
function whyNoPrice(html: string) {
  if (/captcha|Type the characters you see|To discuss automated access/i.test(html)) return 'the store showed a robot check instead of the product';
  if (/buybox-see-all-buying-choices|See All Buying Options/i.test(html)) return 'no seller has a buy button on it right now';
  if (/Currently unavailable/i.test(html)) return 'it is currently unavailable';
  return 'price not found on the page';
}

export async function scrapeProduct(url: string, platform: Platform, productId: string, opts: { allowAi?: boolean; allowBrowser?: boolean } = {}): Promise<Scraped> {
  let pageError = '';
  try {
    const { html } = await fetchHtml(url);
    const p = parseHtml(html, platform);
    if (p.price && p.title) {
      return {
        title: p.title,
        image: p.image ?? null,
        price: p.price,
        mrp: p.mrp ?? null,
        currency: p.currency || 'INR',
        in_stock: p.in_stock ?? true,
        source: 'page',
        images: p.images ?? [],
        rating: p.rating ?? null,
        reviews: p.reviews ?? null,
      };
    }
    pageError = whyNoPrice(html);
    console.log(`[scrape] no price on ${platform} ${url}: ${pageError} | title="${(p.title || '').slice(0, 80)}" len=${html.length}`);
  } catch (e) {
    pageError = e instanceof Error ? e.message : String(e);
  }
  if (opts.allowAi !== false) {
    const ai = await aiExtract(url, productId, opts.allowBrowser ?? false);
    if (ai) return ai;
  }
  throw new Error(`Could not read the price for this product (${pageError}).`);
}
