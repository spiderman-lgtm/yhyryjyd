import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { compareStores } from '@/lib/compare';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  try {
    return NextResponse.json(await compareStores(product));
  } catch {
    return NextResponse.json({ offers: [], error: 'Price comparison is unavailable right now.' });
  }
}
