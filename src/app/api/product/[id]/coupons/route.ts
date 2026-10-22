import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getCoupons } from '@/lib/coupons';
import { couponsForPlatform } from '@/lib/storecoupons';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  // Coupons the owner added for this store come first; the AI search adds what it finds on the web.
  const own = couponsForPlatform(product.platform);
  try {
    const found = await getCoupons(product);
    const extra = found.coupons.filter((c) => !own.some((o) => (c.code ? o.code === c.code : o.title === c.title)));
    return NextResponse.json({ ...found, coupons: [...own, ...extra] });
  } catch {
    return NextResponse.json(own.length ? { coupons: own } : { coupons: [], error: 'Coupon search is unavailable right now.' });
  }
}
