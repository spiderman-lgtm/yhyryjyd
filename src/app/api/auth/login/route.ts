import { NextResponse, type NextRequest } from 'next/server';
import { secureCookies } from '@/lib/config';
import {
  ANON_COOKIE,
  clearFailures,
  findUserByEmail,
  mergeAnonymous,
  normalizeEmail,
  recordFailure,
  setSession,
  tooManyAttempts,
  verifyPassword,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(b.email || ''));
  const password = String(b.password || '');
  const key = `login:${email}`;
  if (tooManyAttempts(key)) return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailure(key);
    const googleOnly = user && !user.password_hash && user.google_sub;
    return NextResponse.json({ error: googleOnly ? 'This account uses Google. Click “Continue with Google”.' : 'Wrong email or password.' }, { status: 401 });
  }
  clearFailures(key);
  mergeAnonymous(req.cookies.get(ANON_COOKIE)?.value, user.id);
  const res = NextResponse.json({ ok: true, role: user.role });
  setSession(res, user.id, secureCookies());
  return res;
}
