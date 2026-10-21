import { NextResponse } from 'next/server';
import { newId, write } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { currentUid } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const uid = currentUid();
  const { product_id } = await req.json().catch(() => ({}));
  if (!getProduct(product_id)) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  write((d) => {
    if (Object.values(d.cart).some((c) => c.uid === uid && c.product_id === product_id)) return;
    const id = newId('c');
    d.cart[id] = { id, uid, product_id, added_at: new Date().toISOString() };
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const uid = currentUid();
  const { product_id } = await req.json().catch(() => ({}));
  write((d) => {
    for (const c of Object.values(d.cart)) if (c.uid === uid && c.product_id === product_id) delete d.cart[c.id];
  });
  return NextResponse.json({ ok: true });
}
