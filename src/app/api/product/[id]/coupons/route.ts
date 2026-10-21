import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getCoupons } from '@/lib/coupons';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  try {
    return NextResponse.json(await getCoupons(product));
  } catch (e) {
    return NextResponse.json({ coupons: [], error: 'Coupon search is unavailable right now.' }, { status: 200 });
  }
}
