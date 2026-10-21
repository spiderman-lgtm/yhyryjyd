import crypto from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { absolute, secureCookies } from '@/lib/config';
import { googleEnabled, googleRedirectUri, safeNext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  if (!googleEnabled()) return NextResponse.redirect(absolute(`/login?error=google_off&next=${encodeURIComponent(next)}`));
  const state = crypto.randomBytes(16).toString('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set('dr_oauth', `${state}|${next}`, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: 600 });
  return res;
}
