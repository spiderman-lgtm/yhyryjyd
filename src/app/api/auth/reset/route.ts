import { NextResponse, type NextRequest } from 'next/server';
import { secureCookies } from '@/lib/config';
import { ANON_COOKIE, clearFailures, mergeAnonymous, setPassword, setSession, userForResetToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Sets the new password from a reset link and signs the shopper in.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const password = String(b.password || '');
  if (password.length < 8) return NextResponse.json({ error: 'Use at least 8 characters.' }, { status: 400 });
  const user = userForResetToken(String(b.token || ''));
  if (!user) return NextResponse.json({ error: 'This reset link has expired or was already used. Ask for a new one.' }, { status: 400 });
  setPassword(user.id, password);
  clearFailures(`login:${user.email}`);
  mergeAnonymous(req.cookies.get(ANON_COOKIE)?.value, user.id);
  const res = NextResponse.json({ ok: true });
  setSession(res, user.id, secureCookies());
  return res;
}
