import { NextResponse, type NextRequest } from 'next/server';

// DealRadar is for signed-in shoppers: every page but the home page and the sign-in pages sends a visitor to
// /login first (and back afterwards), and the API answers 401. Open without signing in: what messages link to
// (stop, manage, confirm, buy), what viaSocket, M91 and Telegram call, and static files.
const OPEN_PAGES = ['/', '/login', '/signup', '/forgot', '/reset', '/manage', '/manage/done'];
const OPEN_API = ['/api/auth/', '/api/cron/', '/api/telegram/', '/api/m91/', '/api/buy/', '/api/alerts/action', '/api/logo/', '/api/manage', '/api/verify/'];
const isOpen = (path: string) => OPEN_PAGES.includes(path) || OPEN_API.some((p) => path.startsWith(p)) || /\.(png|jpe?g|svg|ico|webp|zip|txt|xml|webmanifest)$/.test(path);

const enc = new TextEncoder();
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
  let s = '';
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The same check as currentUser() in src/lib/auth.ts: "<id>.<expiry>.<signature>", signed with the session key.
async function signedIn(req: NextRequest): Promise<boolean> {
  const raw = req.cookies.get('dr_session')?.value;
  const secret = process.env.VIASOCKET_EMBED_SECRET;
  if (!raw || !secret) return false;
  const [id, exp, sig] = raw.split('.');
  if (!id || !exp || !sig || Number(exp) < Date.now()) return false;
  return sig === (await hmac(await hmac(secret, 'dealradar:session'), `${id}.${exp}`));
}

function withVisitorId(req: NextRequest) {
  if (req.cookies.get('dr_uid')) return NextResponse.next();
  const uid = crypto.randomUUID();
  // Make the id visible to this same request's server code, then persist it.
  const headers = new Headers(req.headers);
  headers.set('cookie', `${req.headers.get('cookie') ? req.headers.get('cookie') + '; ' : ''}dr_uid=${uid}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set('dr_uid', uid, { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https', maxAge: 60 * 60 * 24 * 365, path: '/' });
  return res;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!isOpen(path) && !(await signedIn(req))) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in to DealRadar.', login: '/login' }, { status: 401 });
    const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, '');
    return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(path + req.nextUrl.search)}`);
  }
  return withVisitorId(req);
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
