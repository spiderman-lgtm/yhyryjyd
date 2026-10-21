import { NextResponse } from 'next/server';
import { read } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { relatedProducts } from '@/lib/related';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  const { items, aiError } = await relatedProducts(product);
  const cached = read((d) => d.related[product.id]?.items ?? []);
  // Buy links only point at our own redirect, which looks the URL up server-side.
  const withLinks = items.map((i) => {
    const idx = cached.findIndex((c) => c.url === i.url);
    return { ...i, buy: i.product_id ? `/api/buy/${i.product_id}` : idx >= 0 ? `/api/buy/${product.id}?r=${idx}` : null };
  });
  return NextResponse.json({ items: withLinks, partial: !!aiError });
}
