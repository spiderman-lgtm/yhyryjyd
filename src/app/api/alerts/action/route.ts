import { NextResponse, type NextRequest } from 'next/server';
import { cancelAlert, extendAlert } from '@/lib/alerts';
import { linkSig } from '@/lib/config';
import { safeEqual } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';

// Signed links from alert emails, so they work without the shopper's browser cookie.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get('id') || '';
  const op = q.get('op');
  const sig = q.get('sig') || '';
  const back = (msg: string) => NextResponse.redirect(new URL(`/alerts?msg=${encodeURIComponent(msg)}`, req.url));
  if (!id || !safeEqual(sig, linkSig(id))) return back('That link is not valid.');
  if (op === 'cancel') return back(cancelAlert(id) ? 'Alerts stopped for that product.' : 'Alert not found.');
  if (op === 'extend') {
    const a = extendAlert(id);
    return back(a ? `Watching for ${a.window_days} more days.` : 'Alert not found.');
  }
  return back('Unknown action.');
}
