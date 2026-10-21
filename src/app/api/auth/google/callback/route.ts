import { NextResponse, type NextRequest } from 'next/server';
import { absolute, secureCookies } from '@/lib/config';
import {
  ANON_COOKIE,
  createUser,
  findUserByEmail,
  findUserByGoogle,
  googleEnabled,
  googleRedirectUri,
  linkGoogle,
  mergeAnonymous,
  normalizeEmail,
  safeNext,
  setSession,
} from '@/lib/auth';
import { safeEqual } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const [state, rawNext] = (req.cookies.get('dr_oauth')?.value || '').split('|');
  const next = safeNext(rawNext);
  const fail = (code: string) => {
    const res = NextResponse.redirect(absolute(`/login?error=${code}&next=${encodeURIComponent(next)}`));
    res.cookies.delete('dr_oauth');
    return res;
  };
  if (!googleEnabled()) return fail('google_off');
  if (q.get('error')) return fail('google_cancelled');
  if (!state || !safeEqual(q.get('state') || '', state) || !q.get('code')) return fail('google_failed');

  // The ID token comes straight from Google's token endpoint over TLS with our client secret,
  // so its claims can be read without re-verifying the signature.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: q.get('code')!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  }).catch(() => null);
  const tokens = tokenRes?.ok ? await tokenRes.json() : null;
  let claims: any = null;
  try {
    claims = JSON.parse(Buffer.from(String(tokens?.id_token).split('.')[1], 'base64url').toString());
  } catch {
    return fail('google_failed');
  }
  if (
    !claims?.sub ||
    claims.aud !== process.env.GOOGLE_CLIENT_ID ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    Number(claims.exp) * 1000 < Date.now() ||
    !claims.email ||
    claims.email_verified !== true
  ) {
    return fail('google_failed');
  }

  const email = normalizeEmail(claims.email);
  let user = findUserByGoogle(claims.sub);
  if (!user) {
    const byEmail = findUserByEmail(email);
    if (byEmail) {
      linkGoogle(byEmail.id, claims.sub);
      user = byEmail;
    } else {
      user = createUser({ email, name: String(claims.name || email.split('@')[0]).slice(0, 80), password_hash: null, google_sub: claims.sub });
    }
  }
  mergeAnonymous(req.cookies.get(ANON_COOKIE)?.value, user.id);
  const res = NextResponse.redirect(absolute(next));
  res.cookies.delete('dr_oauth');
  setSession(res, user.id, secureCookies());
  return res;
}
