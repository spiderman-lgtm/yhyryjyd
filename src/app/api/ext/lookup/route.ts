import { NextResponse, type NextRequest } from 'next/server';
import { historyFor, read } from '@/lib/db';
import { addProduct, dealScore, markViewed, upsertFromPage } from '@/lib/products';
import { detectPlatform, PLATFORM_NAMES } from '@/lib/scraper';
import { appUrl } from '@/lib/config';
import { rateLimited } from '@/lib/ext';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e8 ? v : null);
const httpUrl = (v: unknown) => (typeof v === 'string' && /^https:\/\//.test(v) ? v.slice(0, 1000) : null);

// Called by the DealRadar browser extension on a store's product page.
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, 300);
  if (limited) return limited;
  const b = await req.json().catch(() => ({}));
  const url = httpUrl(b.url);
  if (!url) return NextResponse.json({ error: 'A product page URL is required.' }, { status: 400 });
  const title = str(b.title, 300);
  const price = num(b.price);
  // Stores DealRadar has no reader for are taken from what the extension saw on the page; the server
  // never fetches those sites itself.
  const known = detectPlatform(new URL(url)) !== 'other';
  if (!known && !(title.length >= 3 && price)) return NextResponse.json({ error: 'Open a product page to compare its price.' }, { status: 422 });
  let product;
  try {
    product =
      title.length >= 3 && price
        ? upsertFromPage({
            url,
            title,
            price,
            mrp: num(b.mrp),
            image: httpUrl(b.image),
            images: Array.isArray(b.images) ? b.images.map(httpUrl).filter((x: string | null): x is string => !!x) : [],
            rating: num(b.rating) && b.rating <= 5 ? b.rating : null,
            reviews: num(b.reviews),
            in_stock: b.in_stock !== false,
          })
        : await addProduct(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read this product.' }, { status: 422 });
  }
  markViewed(product.id);

  const since = Date.now() - 180 * 86400_000;
  const history = historyFor(product.id)
    .filter((h) => Date.parse(h.at) >= since)
    .map((h) => ({ p: h.price, t: Date.parse(h.at) }));
  const watchers = read((d) => Object.values(d.alerts).filter((a) => a.product_id === product.id && a.status === 'active').length);

  return NextResponse.json({
    id: product.id,
    title: product.title,
    price: product.price,
    store: known ? PLATFORM_NAMES[product.platform] : str(b.store, 40) || PLATFORM_NAMES.other,
    deal: dealScore(product.id, product.price),
    history,
    watchers,
    page: `${appUrl()}/p/${product.id}`,
    alert: `${appUrl()}/p/${product.id}#alert`,
  });
}
