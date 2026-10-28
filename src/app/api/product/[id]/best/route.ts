import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { bestPrices } from '@/lib/bestprice';

export const dynamic = 'force-dynamic';
export const maxDuration = 150;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  try {
    return NextResponse.json(await bestPrices(product));
  } catch {
    return NextResponse.json({ stores: [], error: 'Offer prices are unavailable right now.' });
  }
}
