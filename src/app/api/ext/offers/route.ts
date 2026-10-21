import { NextResponse, type NextRequest } from 'next/server';
import { recordOffers, write, type StoreOffer } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { PLATFORM_NAMES } from '@/lib/scraper';
import { OFFER_DOMAINS, rateLimited } from '@/lib/ext';

export const dynamic = 'force-dynamic';

// Prices the extension found from the shopper's own browser for stores that block our server.
export async function POST(req: NextRequest) {
  const limited = rateLimited(req, 120);
  if (limited) return limited;
  const b = await req.json().catch(() => ({}));
  const product = typeof b.product_id === 'string' ? getProduct(b.product_id) : null;
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });

  const here = PLATFORM_NAMES[product.platform];
  const incoming: StoreOffer[] = (Array.isArray(b.offers) ? b.offers : [])
    .slice(0, 20)
    .map((o: any): StoreOffer | null => {
      const store = typeof o?.store === 'string' ? o.store : '';
      const domain = OFFER_DOMAINS[store];
      let host = '';
      try {
        const u = new URL(String(o?.url));
        if (u.protocol !== 'https:') return null;
        host = u.hostname;
      } catch {
        return null;
      }
      const price = Number(o?.price);
      if (!domain || !domain.test(host) || store === here) return null;
      if (!(price >= product.price * 0.25 && price <= product.price * 4)) return null;
      return { store, price: Math.round(price), url: String(o.url).slice(0, 1000), in_stock: o.in_stock !== false, same_variant: o.same_variant !== false };
    })
    .filter((o: StoreOffer | null): o is StoreOffer => !!o);

  const offers = write((d) => {
    const current = d.compare[product.id]?.offers ?? [];
    const stores = new Set(incoming.map((o) => o.store));
    const merged = [...current.filter((o) => !stores.has(o.store)), ...incoming].sort((a, b) => a.price - b.price);
    // A first report from the extension must not count as a fresh server search.
    d.compare[product.id] = { offers: merged, fetched_at: d.compare[product.id]?.fetched_at ?? new Date(0).toISOString() };
    recordOffers(d, product.id, incoming);
    return merged;
  });
  return NextResponse.json({ offers, accepted: incoming.length });
}
