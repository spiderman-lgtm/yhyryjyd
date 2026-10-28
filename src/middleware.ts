import { NextResponse, type NextRequest } from 'next/server';

// Anyone can search, browse products, compare prices, read coupons and see trending deals. Signing in is asked for
// only when the shopper acts: sets an alert, adds to cart, enquires, orders (Buy), or opens their own pages.
// Buy links inside alert messages carry ?a=<alert> and open straight to the store.
const PROTECTED_PAGES = ['/alerts', '/cart', '/dashboard', '/admin'];
const PROTECTED_API = ['/api/alerts', '/api/cart', '/api/enquiry', '/api/admin/', '/api/otp', '/api/coupons/submit', '/api/buy/'];
const OPEN_EXCEPTIONS = ['/api/alerts/action'];
const isProtected = (req: NextRequest, path: string) => {
  if (OPEN_EXCEPTIONS.some((p) => path.startsWith(p))) return false;
  if (path.startsWith('/api/buy/') && req.nextUrl.searchParams.get('a')) return false;
  if (/^\/api\/product\/[^/]+\/coupons/.test(path)) return true;
  return PROTECTED_PAGES.some((p) => path === p || path.startsWith(p + '/')) || PROTECTED_API.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/'));
};

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
  if (isProtected(req, path) && !(await signedIn(req))) {
    // Buy is a link (a page visit), so it goes to the sign-in page like a page does.
    if (path.startsWith('/api/') && !path.startsWith('/api/buy/')) return NextResponse.json({ error: 'Please sign in to DealRadar.', login: '/login' }, { status: 401 });
    const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, '');
    return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(path + req.nextUrl.search)}`);
  }
  return withVisitorId(req);
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
