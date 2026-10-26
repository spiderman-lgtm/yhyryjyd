import { NextResponse } from 'next/server';
import { newId, write } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { currentUid } from '@/lib/auth';
import { askEnquiry } from '@/lib/ops-alerts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const uid = currentUid();
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 100);
  const email = String(b.email || '').trim().slice(0, 200);
  const product = getProduct(b.product_id);
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Name and a valid email are required.' }, { status: 400 });
  const budget = Number(b.budget);
  const enquiry = write((d) => {
    const e = {
      id: newId('enq'),
      uid,
      product_id: b.product_id,
      name,
      email,
      phone: b.phone ? String(b.phone).replace(/[^\d+]/g, '').slice(0, 16) : null,
      budget: Number.isFinite(budget) && budget > 0 ? budget : null,
      message: String(b.message || '').slice(0, 1000),
      created_at: new Date().toISOString(),
    };
    d.enquiries.push(e);
    return e;
  });
  // The owner's phone rings with the enquiry (M91); the shopper does not wait for it.
  void askEnquiry(enquiry, product.title);
  return NextResponse.json({ ok: true });
}
