import { NextResponse, type NextRequest } from 'next/server';
import { isPin } from '@/lib/compare';
import { secureCookies } from '@/lib/config';

export const dynamic = 'force-dynamic';

const areas = new Map<string, string | null>();

// India Post's public directory names the area for a pincode; without it the pincode alone still works.
async function areaFor(pin: string): Promise<string | null> {
  if (areas.has(pin)) return areas.get(pin)!;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    const data = await res.json();
    const po = data?.[0]?.PostOffice?.[0];
    if (data?.[0]?.Status === 'Error') return null;
    const area = po ? [po.District || po.Block, po.State].filter(Boolean).join(', ') : null;
    if (areas.size > 5000) areas.clear();
    areas.set(pin, area);
    return area;
  } catch {
    return null;
  }
}

const cookie = { sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 365 };

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const pin = String(b.pin ?? '').trim();
  if (!isPin(pin)) return NextResponse.json({ error: 'Enter a 6-digit Indian pincode.' }, { status: 400 });
  const area = await areaFor(pin);
  const res = NextResponse.json({ pin, area });
  res.cookies.set('dr_pin', pin, { ...cookie, secure: secureCookies() });
  res.cookies.set('dr_area', area ?? '', { ...cookie, secure: secureCookies() });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('dr_pin');
  res.cookies.delete('dr_area');
  return res;
}
