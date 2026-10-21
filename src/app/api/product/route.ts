import { NextResponse } from 'next/server';
import { addProduct } from '@/lib/products';

export const dynamic = 'force-dynamic';
export const maxDuration = 150;

export async function POST(req: Request) {
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== 'string' || !url.trim()) return NextResponse.json({ error: 'Paste a product link.' }, { status: 400 });
  try {
    const product = await addProduct(url);
    return NextResponse.json({ id: product.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read that product.' }, { status: 422 });
  }
}
