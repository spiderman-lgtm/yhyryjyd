import { NextResponse, type NextRequest } from 'next/server';
import { write } from '@/lib/db';
import { absolute } from '@/lib/config';
import { markVerified, readEmailConfirm } from '@/lib/contacts';

export const dynamic = 'force-dynamic';

// The link in the "confirm your price alerts" email: proves the inbox, then starts the alerts waiting on it.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ok = readEmailConfirm(q.get('p') || '', q.get('s') || '');
  const back = (msg: string) => NextResponse.redirect(absolute(`/manage/done?msg=${encodeURIComponent(msg)}`));
  if (!ok) return back('That confirmation link has expired or is not valid. Set the alert again to get a new one.');
  markVerified(ok.uid, 'email', ok.email);
  const started = write((d) => {
    let n = 0;
    for (const a of Object.values(d.alerts)) {
      if (a.uid !== ok.uid || a.status !== 'active' || a.email !== ok.email || !a.pending?.includes('email')) continue;
      a.pending = a.pending.filter((c) => c !== 'email');
      if (!a.channels.includes('email')) a.channels.push('email');
      n++;
    }
    return n;
  });
  return back(`Email confirmed ✓ ${started ? `Price alerts for ${started} product${started > 1 ? 's' : ''} will now come to ${ok.email}.` : `${ok.email} can now get DealRadar alerts.`}`);
}
