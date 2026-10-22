import { NextResponse } from 'next/server';
import { guard } from '@/lib/admin-guard';
import { write } from '@/lib/db';
import { cleanCoupon } from '@/lib/storecoupons';

export const dynamic = 'force-dynamic';

// Add a coupon, or edit one when the body has its id.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const result = write((d) => {
    const existing = typeof b.id === 'string' ? d.store_coupons[b.id] : undefined;
    if (b.id && !existing) return { error: 'That coupon no longer exists.' };
    const c = cleanCoupon(b, existing);
    if ('error' in c) return c;
    d.store_coupons[c.id] = c;
    return c;
  });
  if ('error' in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ coupon: result });
}

// Pause or resume a coupon.
export async function PATCH(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const coupon = write((d) => {
    const c = d.store_coupons[String(b.id)];
    if (!c) return null;
    c.active = !!b.active;
    c.updated_at = new Date().toISOString();
    return c;
  });
  if (!coupon) return NextResponse.json({ error: 'That coupon no longer exists.' }, { status: 404 });
  return NextResponse.json({ coupon });
}

export async function DELETE(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  write((d) => {
    delete d.store_coupons[id];
  });
  return NextResponse.json({ ok: true });
}
