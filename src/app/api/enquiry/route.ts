import { NextResponse } from 'next/server';
import { newId, write } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { currentUid } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const uid = currentUid();
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 100);
  const email = String(b.email || '').trim().slice(0, 200);
  if (!getProduct(b.product_id)) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Name and a valid email are required.' }, { status: 400 });
  const budget = Number(b.budget);
  write((d) => {
    d.enquiries.push({
      id: newId('enq'),
      uid,
      product_id: b.product_id,
      name,
      email,
      phone: b.phone ? String(b.phone).replace(/[^\d+]/g, '').slice(0, 16) : null,
      budget: Number.isFinite(budget) && budget > 0 ? budget : null,
      message: String(b.message || '').slice(0, 1000),
      created_at: new Date().toISOString(),
    });
  });
  return NextResponse.json({ ok: true });
}
