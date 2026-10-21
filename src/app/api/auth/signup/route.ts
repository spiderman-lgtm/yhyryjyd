import { NextResponse, type NextRequest } from 'next/server';
import { secureCookies } from '@/lib/config';
import { ANON_COOKIE, createUser, findUserByEmail, hashPassword, mergeAnonymous, normalizeEmail, setSession, validEmail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(b.email || ''));
  const name = String(b.name || '').trim().slice(0, 80);
  const password = String(b.password || '');
  if (!name) return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });
  if (!validEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Use at least 8 characters for the password.' }, { status: 400 });
  if (findUserByEmail(email)) return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });

  const user = createUser({ email, name, password_hash: hashPassword(password), google_sub: null });
  mergeAnonymous(req.cookies.get(ANON_COOKIE)?.value, user.id);
  const res = NextResponse.json({ ok: true, role: user.role });
  setSession(res, user.id, secureCookies());
  return res;
}
