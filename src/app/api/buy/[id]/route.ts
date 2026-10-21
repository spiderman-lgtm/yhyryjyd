import { NextResponse, type NextRequest } from 'next/server';
import { absolute } from '@/lib/config';
import { viewerUid } from '@/lib/auth';
import { write } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { affiliateLink, affiliateUrl } from '@/lib/coupons';
import { cachedOffer } from '@/lib/compare';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.redirect(absolute('/'));
  // ?o=<n> sends the shopper to another store's offer from this product's own comparison, never an arbitrary URL.
  const o = req.nextUrl.searchParams.get('o');
  const offer = o !== null && /^\d$/.test(o) ? cachedOffer(product.id, Number(o)) : null;
  write((d) => {
    d.clicks.push({ product_id: product.id, uid: viewerUid() || req.nextUrl.searchParams.get('a') || 'email', at: new Date().toISOString() });
  });
  return NextResponse.redirect(offer ? affiliateUrl(offer.url) : affiliateLink(product), 302);
}
