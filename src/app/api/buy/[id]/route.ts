import { NextResponse, type NextRequest } from 'next/server';
import { absolute } from '@/lib/config';
import { viewerUid } from '@/lib/auth';
import { write } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { affiliateLink } from '@/lib/coupons';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.redirect(absolute('/'));
  write((d) => {
    d.clicks.push({ product_id: product.id, uid: viewerUid() || req.nextUrl.searchParams.get('a') || 'email', at: new Date().toISOString() });
  });
  return NextResponse.redirect(affiliateLink(product), 302);
}
