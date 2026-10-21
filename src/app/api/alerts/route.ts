import { NextResponse } from 'next/server';
import { newId, read, type Channel, type Tier } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { createAlert } from '@/lib/alerts';
import { currentUid } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TIERS: Tier[] = ['urgent', 'normal', 'digest'];

export async function POST(req: Request) {
  const uid = currentUid();
  const b = await req.json().catch(() => ({}));
  const product = getProduct(b.product_id);
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });

  const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase().slice(0, 200) : null;
  // WhatsApp wants the number with country code and no '+'; a bare 10-digit Indian number gets 91.
  let phone = typeof b.phone === 'string' ? b.phone.replace(/\D/g, '') : '';
  if (phone.length === 10) phone = '91' + phone;
  const channels: Channel[] = [];
  if (email) channels.push('email');
  if (phone) channels.push('whatsapp');

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  if (phone && (phone.length < 11 || phone.length > 15)) return NextResponse.json({ error: 'Enter the WhatsApp number with country code.' }, { status: 400 });
  if (!channels.length) return NextResponse.json({ error: 'Add an email or a WhatsApp number to be alerted.' }, { status: 400 });

  const tier: Tier = TIERS.includes(b.tier) ? b.tier : 'normal';
  if (tier === 'digest' && !email) return NextResponse.json({ error: 'The daily digest is sent by email — add an email.' }, { status: 400 });
  const drop = [0, 5, 10, 20].includes(Number(b.drop_percent)) ? Number(b.drop_percent) : 5;
  const target = Number(b.target_price);
  const window_days = Number(b.window_days) === 15 ? 15 : 7;

  const duplicate = read((d) => Object.values(d.alerts).find((a) => a.uid === uid && a.product_id === product.id && a.status === 'active'));
  if (duplicate) return NextResponse.json({ error: 'You are already tracking this product. Manage it under My alerts.' }, { status: 409 });

  const alert = createAlert({
    id: newId('al'),
    uid,
    product_id: product.id,
    email,
    phone: phone || null,
    channels,
    tier,
    drop_percent: drop,
    target_price: Number.isFinite(target) && target > 0 && target < product.price ? target : null,
    window_days,
    baseline_price: product.price,
  });
  return NextResponse.json({ alert });
}

export async function GET() {
  const uid = currentUid();
  const alerts = read((d) => Object.values(d.alerts).filter((a) => a.uid === uid));
  return NextResponse.json({ alerts });
}
