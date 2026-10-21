import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (req.cookies.get('dr_uid')) return NextResponse.next();
  const uid = crypto.randomUUID();
  // Make the id visible to this same request's server code, then persist it.
  const headers = new Headers(req.headers);
  headers.set('cookie', `${req.headers.get('cookie') ? req.headers.get('cookie') + '; ' : ''}dr_uid=${uid}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set('dr_uid', uid, { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', maxAge: 60 * 60 * 24 * 365, path: '/' });
  return res;
}

export const config = { matcher: ['/((?!_next/|favicon.ico|api/cron/).*)'] };
