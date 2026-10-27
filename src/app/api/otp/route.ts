import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { checkPhoneCode, isVerified, normPhone, sendPhoneCode, validPhone, verifiedList } from '@/lib/contacts';
import { startWaVerify } from '@/lib/wa-session';

export const dynamic = 'force-dynamic';

// Proves a phone number belongs to the signed-in shopper: a 6-digit code on WhatsApp, typed back here.
export async function POST(req: NextRequest) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in to DealRadar.', login: '/login' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const phone = normPhone(b.phone);
  if (!validPhone(phone)) return NextResponse.json({ error: 'Enter the number with country code.' }, { status: 400 });
  if (b.op === 'send') {
    if (isVerified(user.id, 'phone', phone)) return NextResponse.json({ verified: true });
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const r = await sendPhoneCode(user.id, phone, ip).catch((e) => ({ error: `Could not send the code: ${e instanceof Error ? e.message : e}` }));
    return 'error' in r ? NextResponse.json(r, { status: 429 }) : NextResponse.json({ sent: true });
  }
  // "Verify on WhatsApp": a wa.me link with a code the shopper sends to DealRadar's number; the page then asks
  // for "status" until the message has arrived.
  if (b.op === 'wa_start') {
    const r = startWaVerify(user.id, phone);
    return 'error' in r ? NextResponse.json(r, { status: 429 }) : NextResponse.json(r);
  }
  if (b.op === 'status') return NextResponse.json({ verified: verifiedList(user.id).phones });
  if (b.op === 'check') {
    const r = checkPhoneCode(user.id, phone, String(b.code || ''));
    return 'error' in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json({ verified: true });
  }
  return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
}
