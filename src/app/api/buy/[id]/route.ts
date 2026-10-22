import { NextResponse, type NextRequest } from 'next/server';
import { absolute } from '@/lib/config';
import { viewerUid } from '@/lib/auth';
import { write } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { affiliateLink, affiliateUrl } from '@/lib/coupons';
import { cachedOffer, isPin, offerByStore } from '@/lib/compare';
import { cachedRelated } from '@/lib/related';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.redirect(absolute('/'));
  // ?s=<store> or ?o=<n> sends the shopper to another store's offer from this product's own comparison, never an
  // arbitrary URL.
  const s = req.nextUrl.searchParams.get('s');
  const o = req.nextUrl.searchParams.get('o');
  const r = req.nextUrl.searchParams.get('r');
  const pin = req.cookies.get('dr_pin')?.value;
  const at = isPin(pin) ? pin : null;
  const offer = s
    ? offerByStore(product.id, s.slice(0, 40), at)
    : o !== null && /^\d{1,2}$/.test(o)
      ? cachedOffer(product.id, Number(o), at)
      : r !== null && /^\d{1,2}$/.test(r)
        ? cachedRelated(product.id, Number(r))
        : null;
  write((d) => {
    d.clicks.push({ product_id: product.id, uid: viewerUid() || req.nextUrl.searchParams.get('a') || 'email', at: new Date().toISOString() });
  });
  return NextResponse.redirect(offer ? affiliateUrl(offer.url) : affiliateLink(product), 302);
}
