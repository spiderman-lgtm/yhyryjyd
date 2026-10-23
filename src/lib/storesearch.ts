import 'server-only';
import * as cheerio from 'cheerio';
import type { Platform, Product, StoreOffer } from './db';

// Each store's own public search, read the way a browser would. Stores that block automated
// requests from the server simply return nothing; the rest still give a comparison.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export interface Hit {
  store: string;
  platform: Platform;
  title: string;
  price: number;
  mrp: number | null;
  url: string;
  image: string | null;
  in_stock: boolean;
  ref?: string;
  // For showing results: the plain product name (title may carry extra words used for matching),
  // the store's own highlights, and its rating.
  name?: string;
  features?: string[];
  rating?: number | null;
  reviews?: number | null;
}

const tidy = (list: string[]) =>
  list.map((x) => x.replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim()).filter((x) => x.length > 1 && x.length < 90).slice(0, 5);

async function get(url: string, headers: Record<string, string> = {}, timeoutMs = 12000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9', Accept: 'text/html,application/json,*/*', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

// At most this many store searches run at once across the server. Each reads and parses a large page; letting
// every comparison run all of its stores together starved the server's memory and stalled other requests.
const MAX_SEARCHES = 6;
let running = 0;
const queue: (() => void)[] = [];
async function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_SEARCHES) await new Promise<void>((go) => queue.push(go));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) || 0 : 0);

const SEARCHERS: Record<string, (q: string, pin: string | null) => Promise<Hit[]>> = {
  async flipkart(q) {
    const html = await get(`https://www.flipkart.com/search?q=${encodeURIComponent(q)}`);
    const i = html.indexOf('window.__INITIAL_STATE__ =');
    if (i < 0) return [];
    const j = html.indexOf('</script>', i);
    const state = JSON.parse(html.slice(i + 'window.__INITIAL_STATE__ ='.length, j).trim().replace(/;\s*$/, ''));
    const hits: Hit[] = [];
    const walk = (o: any, d: number) => {
      if (!o || typeof o !== 'object' || d > 14 || hits.length >= 12) return;
      if (o.titles && o.pricing && o.baseUrl) {
        const prices: { strikeOff: boolean; value: number }[] = o.pricing.prices || [];
        const price = prices.find((p) => !p.strikeOff)?.value ?? 0;
        const mrp = prices.find((p) => p.strikeOff)?.value ?? null;
        const img = o.media?.images?.[0]?.url as string | undefined;
        if (price > 0)
          hits.push({
            store: 'Flipkart',
            platform: 'flipkart',
            title: [o.titles.title || o.titles.newTitle, o.titles.subtitle].filter(Boolean).join(' '),
            price,
            mrp,
            url: `https://www.flipkart.com${String(o.baseUrl).split('&')[0]}`,
            image: img ? img.replace('{@width}', '416').replace('{@height}', '416').replace('{@quality}', '70').replace(/^http:/, 'https:') : null,
            in_stock: o.availability?.displayState !== 'out_of_stock',
            name: o.titles.title || o.titles.newTitle,
            features: o.titles.subtitle ? tidy(String(o.titles.subtitle).split(',')) : [],
            rating: typeof o.rating?.average === 'number' ? o.rating.average : null,
            reviews: typeof o.rating?.count === 'number' ? o.rating.count : null,
          });
        return;
      }
      for (const v of Object.values(o)) walk(v, d + 1);
    };
    walk(state, 0);
    return hits;
  },

  // Croma prices and stock by pincode (its channelCode); without one it uses a Mumbai default.
  async croma(q, pin) {
    const json = JSON.parse(
      await get(
        `https://api.croma.com/searchservices/v1/search?currentPage=0&query=${encodeURIComponent(q)}%3Arelevance&fields=FULL&channel=WEB&channelCode=${pin || '400049'}&spellOpt=DEFAULT`,
        { Origin: 'https://www.croma.com', Referer: 'https://www.croma.com/' },
      ),
    );
    return (json.products || []).slice(0, 12).map((p: any) => ({
      store: 'Croma',
      platform: 'croma',
      title: p.name,
      price: num(p.pincodePrice?.value ?? p.pincodePrice) || num(p.price?.value),
      mrp: num(p.mrp?.value) || null,
      url: p.url ? `https://www.croma.com${p.url}` : `https://www.croma.com/p/${p.code}`,
      image: p.plpImage || null,
      in_stock: true,
      ref: p.code ? String(p.code) : undefined,
      features: tidy([...String(p.quickViewDesc || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))),
      rating: num(p.averageRating) || null,
    }));
  },

  async reliancedigital(q) {
    const json = JSON.parse(await get(`https://www.reliancedigital.in/ext/raven-api/catalog/v1.0/products?q=${encodeURIComponent(q)}&page_size=12`));
    return (json.items || []).map((p: any) => ({
      store: 'Reliance Digital',
      platform: 'reliancedigital',
      title: p.name,
      price: num(p.price?.effective?.min),
      mrp: num(p.price?.marked?.min) || null,
      url: `https://www.reliancedigital.in/product/${p.slug}`,
      image: p.medias?.find((m: any) => m.type === 'image')?.url ?? null,
      in_stock: p.sellable !== false,
    }));
  },

  async tatacliq(q) {
    const json = JSON.parse(
      await get(
        `https://searchbff.tatacliq.com/products/mpl/search/?searchText=${encodeURIComponent(q)}%3Arelevance&isKeywordRedirect=true&isKeywordRedirectEnabled=true&channel=WEB&isMDE=true&isTextSearch=false&isFilter=false&qc=false&page=0&isSuggested=false&isPwa=true&pageSize=20&typeID=all`,
        { Origin: 'https://www.tatacliq.com', Referer: 'https://www.tatacliq.com/' },
      ),
    );
    return (json.searchresult || []).map((p: any) => ({
      store: 'Tata CLiQ',
      platform: 'tatacliq',
      title: p.productname,
      price: num(p.price?.sellingPrice?.doubleValue),
      mrp: num(p.price?.mrpPrice?.doubleValue) || null,
      url: p.webURL ? (String(p.webURL).startsWith('http') ? p.webURL : `https://www.tatacliq.com${p.webURL}`) : `https://www.tatacliq.com/p-${String(p.productId).toLowerCase()}`,
      image: p.imageURL ? `https:${String(p.imageURL).replace(/^https?:/, '')}` : null,
      in_stock: p.inStockFlag !== false,
      rating: num(p.averageRating) || null,
      reviews: num(p.ratingCount) || null,
    }));
  },

  async ajio(q) {
    const json = JSON.parse(
      await get(`https://www.ajio.com/api/search?fields=SITE&currentPage=0&pageSize=24&format=json&query=${encodeURIComponent(q)}%3Arelevance&sortBy=relevance&text=${encodeURIComponent(q)}`, {}, 10000),
    );
    return (json.products || []).map((p: any) => ({
      store: 'AJIO',
      platform: 'ajio',
      title: [p.fnlColorVariantData?.brandName, p.name].filter(Boolean).join(' '),
      price: num(p.offerPrice?.value) || num(p.price?.value),
      mrp: num(p.wasPriceData?.value) || null,
      url: `https://www.ajio.com${p.url}`,
      image: p.images?.[0]?.url ?? p.fnlColorVariantData?.outfitPictureURL ?? null,
      in_stock: true,
    }));
  },

  async amazon(q) {
    const $ = cheerio.load(await get(`https://www.amazon.in/s?k=${encodeURIComponent(q)}`));
    const hits: Hit[] = [];
    $('div[data-component-type="s-search-result"]').each((_, el) => {
      const c = $(el);
      if (c.find('.puis-sponsored-label-text').length) return;
      const title = c.find('h2').text().trim();
      const href = c.find('a.a-link-normal[href*="/dp/"]').first().attr('href') || '';
      const asin = c.attr('data-asin') || href.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
      const price = num(c.find('.a-price:not(.a-text-price) .a-offscreen').first().text());
      if (title && asin && price) {
        hits.push({
          store: 'Amazon',
          platform: 'amazon',
          title,
          price,
          mrp: num(c.find('.a-price.a-text-price .a-offscreen').first().text()) || null,
          url: `https://www.amazon.in/dp/${asin}`,
          image: c.find('img.s-image').attr('src') || null,
          in_stock: true,
        });
      }
    });
    return hits.slice(0, 12);
  },

  async myntra(q) {
    const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const html = await get(`https://www.myntra.com/${slug}?rawQuery=${encodeURIComponent(q)}`);
    const m = html.match(/window\.__myx\s*=\s*(\{[\s\S]*?\})<\/script>/);
    if (!m) return [];
    const products = JSON.parse(m[1])?.searchData?.results?.products || [];
    return products.slice(0, 12).map((p: any) => ({
      store: 'Myntra',
      platform: 'myntra',
      title: [p.brand, p.productName].filter(Boolean).join(' '),
      price: num(p.price),
      mrp: num(p.mrp) || null,
      url: `https://www.myntra.com/${p.landingPageUrl}`,
      image: p.searchImage || null,
      in_stock: true,
    }));
  },
};

// Croma's own delivery promise for a pincode: whether it ships there, and by when.
async function cromaDelivery(code: string, pin: string): Promise<StoreOffer['delivery']> {
  const res = await fetch('https://api.croma.com/inventory/oms/v2/tms/details-pwa/', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://www.croma.com', Referer: 'https://www.croma.com/' },
    body: JSON.stringify({
      promise: {
        allocationRuleID: 'SYSTEM',
        checkInventory: 'Y',
        organizationCode: 'CROMA',
        sourcingClassification: 'EC',
        promiseLines: { promiseLine: [{ fulfillmentType: 'HDEL', itemID: code, lineId: '1', requiredQty: '1', shipToAddress: { zipCode: pin }, extn: { widerStoreFlag: 'Y' } }] },
      },
    }),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const line = (await res.json())?.promise?.suggestedOption?.option?.promiseLines?.promiseLine?.[0];
  const by = line?.assignments?.assignment?.[0]?.deliveryDate;
  return { pin, ok: !!line, by: typeof by === 'string' ? by : null };
}

// One store's search results, for the trending catalog. Throws when the store cannot be reached.
export function searchStore(store: string, q: string, pin: string | null = null): Promise<Hit[]> {
  const fn = SEARCHERS[store];
  if (!fn) return Promise.resolve([]);
  return inTurn(() => fn(q, pin));
}

// Brand stores on Shopify: each one's public storefront search (/search/suggest.json). A brand store only
// sells its own brand, so it is asked only when the product or search is that brand or its category.
type BrandStore = { key: string; name: string; domain: string; brands: string[]; cats: string[] };
export const BRAND_STORES: BrandStore[] = [
  { key: 'boat', name: 'boAt', domain: 'www.boat-lifestyle.com', brands: ['boat'], cats: ['audio', 'wearable'] },
  { key: 'noise', name: 'Noise', domain: 'www.gonoise.com', brands: ['noise'], cats: ['audio', 'wearable'] },
  { key: 'boult', name: 'Boult', domain: 'www.boultaudio.com', brands: ['boult'], cats: ['audio', 'wearable'] },
  { key: 'fireboltt', name: 'Fire-Boltt', domain: 'www.fireboltt.com', brands: ['fireboltt', 'boltt'], cats: ['wearable', 'audio'] },
  { key: 'ptron', name: 'pTron', domain: 'www.ptron.in', brands: ['ptron'], cats: ['audio', 'wearable'] },
  { key: 'zebronics', name: 'Zebronics', domain: 'www.zebronics.com', brands: ['zebronics', 'zeb'], cats: ['audio', 'computer'] },
  { key: 'plum', name: 'Plum', domain: 'plumgoodness.com', brands: ['plum'], cats: ['beauty'] },
  { key: 'sugar', name: 'SUGAR Cosmetics', domain: 'in.sugarcosmetics.com', brands: ['sugar'], cats: ['beauty'] },
  { key: 'mamaearth', name: 'Mamaearth', domain: 'mamaearth.in', brands: ['mamaearth'], cats: ['beauty'] },
  { key: 'mcaffeine', name: 'mCaffeine', domain: 'www.mcaffeine.com', brands: ['mcaffeine'], cats: ['beauty'] },
  { key: 'bsc', name: 'Bombay Shaving Company', domain: 'www.bombayshavingcompany.com', brands: ['bombay'], cats: ['grooming'] },
  { key: 'beardo', name: 'Beardo', domain: 'www.beardo.in', brands: ['beardo'], cats: ['grooming'] },
  { key: 'snitch', name: 'Snitch', domain: 'www.snitch.co.in', brands: ['snitch'], cats: ['fashion'] },
  { key: 'miraggio', name: 'Miraggio', domain: 'miraggiolife.com', brands: ['miraggio'], cats: ['bags'] },
];

const CATS: Record<string, RegExp> = {
  audio: /earbud|earphone|headphone|headset|neckband|\btws\b|speaker|soundbar|airdopes|\bbuds\b/i,
  wearable: /smart ?watch|fitness band|\bwatch\b/i,
  computer: /keyboard|mouse|webcam|speaker|soundbar|monitor/i,
  beauty: /face ?wash|serum|cream|moisturi|sunscreen|lipstick|kajal|foundation|shampoo|conditioner|cleanser|lotion|toner|body ?wash|lip balm|makeup|skin ?care/i,
  grooming: /beard|trimmer|razor|shaving|shave|perfume|deodorant|face ?wash/i,
  fashion: /shirt|t-shirt|tshirt|jeans|trouser|cargo|jacket|hoodie|polo|chinos|shorts/i,
  bags: /\b(hand ?bag|tote|sling ?bag|shoulder bag|backpack|wallet|clutch|purse)/i,
  style: /\b(hand ?bag|tote|sling|backpack|wallet|clutch|purse|kurta|kurti|saree|dress|shirt|t-shirt|tshirt|jeans|trouser|jacket|hoodie|shoes?|sneaker|sandal|heels|flats|slipper|sunglass|earring|necklace|jewel)/i,
  sports: /running|cycling|\bcycle\b|\bgym\b|yoga|football|cricket|badminton|trekking|hiking|camping|swim|fitness|dumbbell|sports? shoe/i,
};
const DECATHLON_BRANDS = /\b(decathlon|kiprun|kalenji|quechua|forclaz|btwin|domyos|nabaiji|artengo|kipsta|tribord|inesis|wedze|perfly|tarmak|corength|rockrider|triban|simond|olaian)\b/i;

for (const b of BRAND_STORES) {
  SEARCHERS[`brand:${b.key}`] = async (q) => {
    const json = JSON.parse(await get(`https://${b.domain}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=10`, { Accept: 'application/json' }, 8000));
    return (json?.resources?.results?.products ?? []).map((p: any): Hit => {
      const name = String(p.title ?? '').replace(/\s+/g, ' ').trim();
      const price = num(p.price);
      const mrp = num(p.compare_at_price_max);
      const img = p.image || p.featured_image?.url;
      return {
        store: b.name,
        platform: 'other',
        // Titles often leave out the brand; the matcher needs it.
        title: name.toLowerCase().includes(b.brands[0]) ? name : `${b.name} ${name}`,
        name,
        price,
        mrp: mrp > price ? mrp : null,
        url: `https://${b.domain}${String(p.url ?? '').split('?')[0]}`,
        image: img ? String(img).replace(/^\/\//, 'https://') : null,
        in_stock: p.available !== false,
      };
    });
  };
}

// Decathlon renders its search results on the server with labelled product cards.
SEARCHERS.decathlon = async (q) => {
  const $ = cheerio.load(await get(`https://www.decathlon.in/search?query=${encodeURIComponent(q)}`, {}, 10000));
  const hits: Hit[] = [];
  $('a[data-test-id="product-card-link"]').each((_, el) => {
    const a = $(el);
    const title = a.find('[data-test-id="product-card:product-card:title"]').text().replace(/\s+/g, ' ').trim();
    const price = num(a.find('[data-test-id="product-card-product-card:selling-price"]').first().text());
    const mrp = num(a.find('[data-test-id="product-card-product-card:mrp"]').first().text());
    const href = a.attr('href') || '';
    if (title && price && href)
      hits.push({
        store: 'Decathlon',
        platform: 'other',
        title,
        price,
        mrp: mrp > price ? mrp : null,
        url: href.startsWith('http') ? href : `https://www.decathlon.in${href}`,
        image: a.find('img').attr('src')?.replace(/&amp;/g, '&') ?? null,
        in_stock: true,
      });
  });
  return hits.slice(0, 12);
};

// Nykaa and Nykaa Fashion render their search results into a JSON state block on the page.
const preloaded = (html: string, pattern: RegExp): any => {
  const m = html.match(pattern);
  return m ? JSON.parse(m[1]) : null;
};

SEARCHERS.nykaa = async (q) => {
  const st = preloaded(await get(`https://www.nykaa.com/search/result/?q=${encodeURIComponent(q)}`, {}, 10000), /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  return (st?.searchListingPage?.listingData?.products ?? []).slice(0, 20).map((p: any): Hit => {
    const price = num(p.price);
    const mrp = num(p.mrp);
    const slug = String(p.slug ?? '');
    return {
      store: 'Nykaa',
      platform: 'nykaa',
      title: String(p.name ?? p.title ?? ''),
      price,
      mrp: mrp > price ? mrp : null,
      url: `https://www.nykaa.com/${slug.includes('/p/') ? slug.replace(/^\//, '') : `${slug}/p/${p.productId ?? p.id}`}`,
      image: p.imageUrl ?? null,
      in_stock: p.inStock !== false,
      rating: typeof p.rating === 'number' ? p.rating : null,
      reviews: typeof p.ratingCount === 'number' ? p.ratingCount : null,
    };
  });
};

SEARCHERS.nykaafashion = async (q) => {
  const st = preloaded(await get(`https://www.nykaafashion.com/catalogsearch/result/?q=${encodeURIComponent(q)}`, {}, 10000), /<script[^>]*id="__PRELOADED_STATE__"[^>]*>([\s\S]*?)<\/script>/);
  return (st?.listingV2?.products ?? []).slice(0, 20).map((p: any): Hit => {
    const price = num(p.discountedPrice) || num(p.price);
    const mrp = num(p.price);
    // title is the brand, subTitle the product name.
    const name = String(p.subTitle ?? '').trim();
    return {
      store: 'Nykaa Fashion',
      platform: 'other',
      title: [p.title, name].filter(Boolean).join(' '),
      name,
      price,
      mrp: mrp > price ? mrp : null,
      url: `https://www.nykaafashion.com${String(p.actionUrl ?? '').split('?')[0]}`,
      image: p.imageUrl ?? null,
      in_stock: String(p.isOutOfStock) !== '1',
    };
  });
};

// Snapdeal renders its search results on the server as product cards.
SEARCHERS.snapdeal = async (q) => {
  const $ = cheerio.load(await get(`https://www.snapdeal.com/search?keyword=${encodeURIComponent(q)}`, {}, 10000));
  const hits: Hit[] = [];
  $('.product-tuple-listing').each((_, el) => {
    const c = $(el);
    const title = c.find('.product-title').attr('title') || c.find('.product-title').text().trim();
    const price = num(c.find('.product-price').attr('data-price')) || num(c.find('.product-price').text());
    const mrp = num(c.find('.product-desc-price.strike').text());
    const url = c.find('a.dp-widget-link').attr('href') || '';
    if (title && price && url.startsWith('https://www.snapdeal.com/'))
      hits.push({ store: 'Snapdeal', platform: 'other', title, price, mrp: mrp > price ? mrp : null, url: url.split('?')[0], image: c.find('img.product-image').attr('src') ?? null, in_stock: !c.find('.sold-out-err').length });
  });
  return hits.slice(0, 15);
};

// Shoppers Stop and Lifestyle are Next.js sites: the search results are in the page's __NEXT_DATA__.
const nextData = (html: string): any => {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

SEARCHERS.shoppersstop = async (q) => {
  const html = await get(`https://www.shoppersstop.com/search/result?q=${encodeURIComponent(q)}`, {}, 10000);
  const products = nextData(html)?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.response?.products ?? [];
  return products.slice(0, 20).map((p: any): Hit => {
    const brand = [].concat(p.brand ?? [])[0] ?? '';
    const title = String(p.title ?? '');
    const price = num(p.promotionPrice) || num(p.price);
    const mrp = num(p.price);
    return {
      store: 'Shoppers Stop',
      platform: 'other',
      title: [brand, title].filter(Boolean).join(' '),
      name: title,
      price,
      mrp: mrp > price ? mrp : null,
      url: `https://www.shoppersstop.com/${slug(`${brand} ${title}`)}/p-${p.sku}`,
      image: [].concat(p.imageUrl ?? [])[0] ?? null,
      in_stock: true,
    };
  });
};

SEARCHERS.lifestyle = async (q) => {
  const html = await get(`https://www.lifestylestores.com/in/en/search?q=${encodeURIComponent(q)}`, {}, 10000);
  const products = nextData(html)?.props?.initialState?.unbxdListingPageReducer?.data?.response?.products ?? [];
  return products.slice(0, 20).map((p: any): Hit => {
    const price = num(p.price);
    const mrp = num(p.wasPrice);
    return {
      store: 'Lifestyle',
      platform: 'other',
      title: String(p.name ?? ''),
      price,
      mrp: mrp > price ? mrp : null,
      url: `https://www.lifestylestores.com/in/en${p.productUrl}`,
      image: [].concat(p.imageUrl ?? [])[0] ?? null,
      in_stock: String(p.inStock) !== '0',
    };
  });
};

// The big general stores, asked for everything.
export const SEARCH_STORES = ['flipkart', 'croma', 'reliancedigital', 'tatacliq', 'ajio', 'amazon', 'myntra', 'snapdeal'];

// Stores that sell one kind of thing: Nykaa for beauty and grooming, Nykaa Fashion and Lifestyle for clothes,
// bags and shoes, Shoppers Stop for both.
function categoryStores(text: string) {
  const beauty = CATS.beauty.test(text) || CATS.grooming.test(text);
  const style = CATS.style.test(text);
  return [...(beauty ? ['nykaa'] : []), ...(style ? ['nykaafashion', 'lifestyle'] : []), ...(style || beauty ? ['shoppersstop'] : [])];
}

// General stores, plus brand stores and Decathlon when the text names their brand or category.
export function storesForText(text: string, maxBrandStores = 6): string[] {
  const t = text.toLowerCase();
  const words = new Set(tokens(t));
  const byBrand = BRAND_STORES.filter((b) => b.brands.some((w) => words.has(w) || t.includes(w)));
  const byCat = BRAND_STORES.filter((b) => !byBrand.includes(b) && b.cats.some((c) => CATS[c]?.test(t)));
  const extra = [...byBrand, ...byCat].slice(0, maxBrandStores).map((b) => `brand:${b.key}`);
  if (DECATHLON_BRANDS.test(t) || CATS.sports.test(t)) extra.push('decathlon');
  return [...SEARCH_STORES, ...extra, ...categoryStores(t)];
}

// Every store we can search for this product, except the one the shopper is already on. Stores that do
// not sell it simply return no match; they all run in parallel.
function storesFor(p: Product) {
  // A brand's own store only for that brand (its first word), never just for the category.
  const brand = tokens(p.title)[0] ?? '';
  const own = BRAND_STORES.filter((b) => b.brands.includes(brand)).map((b) => `brand:${b.key}`);
  const extra = DECATHLON_BRANDS.test(p.title) || CATS.sports.test(p.title) ? ['decathlon'] : [];
  return [...SEARCH_STORES, ...own, ...extra, ...categoryStores(p.title)].filter((s) => s !== p.platform);
}

export const searchTokens = (s: string) => tokens(s);

const STOP = new Set(['with', 'for', 'and', 'the', 'of', 'in', 'by', 'from', 'new', 'latest', 'free', 'pack', 'combo', 'online', 'buy', 'gb', 'ram', 'rom',
  // Who it is for and how it is pitched; stores word these differently for the same item.
  'women', 'womens', 'men', 'mens', 'ladies', 'girls', 'boys', 'unisex', 'office', 'use', 'stylish', 'trendy', 'solid', 'casual',
  // Sales and spec-sheet words that long titles add.
  'fast', 'charging', 'input', 'output', 'compatible', 'premium', 'strong', 'upto', 'up', 'to', 'support', 'supports', 'usb', 'type', 'c']);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(?:"|”|''|-?inches\b|-inch\b)/g, '$1inch ')
    .replace(/(\d+(?:\.\d+)?)\s*(gb|tb|mah|w|inch|cm|ml|kg|g|l|ltr)\b/g, '$1$2')
    .split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w && !STOP.has(w));
const COLORS = new Set(
  'black white blue green red yellow pink purple grey gray silver gold orange brown beige navy maroon teal olive cream violet titanium graphite midnight starlight natural desert ultramarine'.split(' '),
);
export const ACCESSORY = /\b(case|cover|protector|tempered|glass|guard|charger|cable|adapter|stand|holder|strap|pouch|refurbished|renewed)\b/i;
// Words that name a different model of the same line: an iPhone 15 is not an iPhone 15 Pro.
const MODEL = new Set(['plus', 'pro', 'max', 'mini', 'ultra', 'lite', 'fe', 'neo', 'prime', 'air']);
// Pack sizes: a different size is the same product in another variant, not a different product.
const SIZE = /^\d+(\.\d+)?(ml|g|kg|l|ltr|inch|cm)$/;

// The search query: brand, model and size words from the title, without marketing filler.
export function queryFor(title: string) {
  return title
    .replace(/\(.*?\)/g, (m) => m.replace(/[(),|]/g, ' '))
    .replace(/[|,].*$/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 9)
    .join(' ');
}

export function match(source: Product, hit: Hit): { ok: boolean; same: boolean; score: number } {
  const none = { ok: false, same: false, score: 0 };
  // Compare on the core name (brand, model, size), not the long marketing title.
  const src = [...new Set(tokens(queryFor(source.title)))];
  const candList = tokens(hit.title);
  const cand = new Set(candList);
  if (src.filter((t) => !SIZE.test(t)).length < 2) return none;
  // What comes after "with" is what is included (a bag with a strap), not what the item is.
  const what = (t: string) => t.replace(/\bwith\b.*$/i, '');
  if (ACCESSORY.test(what(hit.title)) && !ACCESSORY.test(what(source.title))) return none;
  if (hit.price < source.price * 0.4 || hit.price > source.price * 2.5) return none;
  if (!cand.has(src[0])) return none; // the brand
  // A different model number or storage (15 vs 16, 128gb vs 256gb) is a different product. A store that
  // leaves the number out may list another version, so that is kept only as a close name match.
  const core = src.filter((t) => !SIZE.test(t));
  const missing = core.filter((t) => /\d/.test(t) && !cand.has(t));
  if (missing.length && candList.some((t) => /\d/.test(t) && !SIZE.test(t) && !src.includes(t))) return none;
  const fullSrc = new Set(tokens(source.title));
  const hasModelNo = core.some((t) => /\d/.test(t));
  if (hasModelNo && [...MODEL].some((m) => cand.has(m) !== fullSrc.has(m))) return none;
  // Sizes are compared separately below, so the name score leaves them out.
  const shared = core.filter((t) => cand.has(t)).length;
  // How much of the shorter name the other one contains, and how much of ours it covers.
  const contain = shared / Math.min(core.length, new Set(candList.filter((t) => !SIZE.test(t))).size);
  const cover = shared / core.length;
  if (shared < 2 || cover < 0.4) return none;
  const score = contain * 0.7 + cover * 0.3;
  const srcColors = src.filter((t) => COLORS.has(t));
  const candColors = [...cand].filter((t) => COLORS.has(t));
  const otherColour = srcColors.length > 0 && candColors.length > 0 && !srcColors.some((c) => cand.has(c));
  const srcSize = src.find((t) => SIZE.test(t)) ?? [...fullSrc].find((t) => SIZE.test(t));
  const candSizes = candList.filter((t) => SIZE.test(t));
  const otherSize = !!srcSize && candSizes.length > 0 && !candSizes.includes(srcSize);
  const same = score >= 0.7 && !otherColour && !otherSize && !missing.length;
  // A listing that is not an exact match and costs far more or less is a different product, not a variant.
  if (!same && (hit.price < source.price * 0.6 || hit.price > source.price * 2)) return none;
  return {
    ok: score >= (missing.length ? 0.7 : 0.6),
    same,
    score: score - (otherColour || otherSize ? 0.2 : 0) - (missing.length ? 0.1 : 0),
  };
}

export async function searchStores(product: Product, pin: string | null = null): Promise<StoreOffer[]> {
  const q = queryFor(product.title);
  const stores = storesFor(product);
  const seen: string[] = [];
  const results = await Promise.all(
    stores.map(async (s) => {
      try {
        const hits = await inTurn(() => SEARCHERS[s](q, pin));
        const scored = hits.filter((h) => h.price > 0 && h.title).map((h) => ({ h, m: match(product, h) }));
        const best = scored.filter((x) => x.m.ok).sort((a, b) => b.m.score - a.m.score || a.h.price - b.h.price)[0];
        seen.push(`${s}:${hits.length}${best ? '✓' : ''}`);
        if (!best) return null;
        const offer: StoreOffer = { store: best.h.store, price: Math.round(best.h.price), url: best.h.url, in_stock: best.h.in_stock, same_variant: best.m.same };
        if (pin && s === 'croma' && best.h.ref) offer.delivery = await cromaDelivery(best.h.ref, pin).catch(() => undefined);
        return offer;
      } catch (e) {
        seen.push(`${s}:${e instanceof Error ? e.message.slice(0, 40) : 'error'}`);
        return null;
      }
    }),
  );
  // One line per search: how many results each store sent back, ✓ where one matched.
  console.log(`[compare] ${product.id} "${q}" ${seen.join(' ')}`);
  return results.filter((x): x is StoreOffer => !!x);
}
