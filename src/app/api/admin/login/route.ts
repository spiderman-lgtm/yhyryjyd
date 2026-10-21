import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminSessionValue } from '@/lib/session';
import { safeEqual } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return NextResponse.json({ error: 'ADMIN_KEY is not configured on the server.' }, { status: 503 });
  const { key } = await req.json().catch(() => ({}));
  if (typeof key !== 'string' || !safeEqual(key, expected)) return NextResponse.json({ error: 'Wrong admin key.' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminSessionValue(), { httpOnly: true, sameSite: 'strict', secure: req.url.startsWith('https:'), path: '/', maxAge: 60 * 60 * 24 * 7 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
