import { NextResponse, type NextRequest } from 'next/server';
import { write } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { affiliateLink } from '@/lib/coupons';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.redirect(new URL('/', req.url));
  write((d) => {
    d.clicks.push({ product_id: product.id, uid: req.cookies.get('dr_uid')?.value || req.nextUrl.searchParams.get('a') || 'email', at: new Date().toISOString() });
  });
  return NextResponse.redirect(affiliateLink(product), 302);
}
