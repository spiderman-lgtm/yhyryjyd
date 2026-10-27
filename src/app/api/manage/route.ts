import { NextResponse } from 'next/server';
import { write, type Channel } from '@/lib/db';
import { block, manageOk, type Kind } from '@/lib/contacts';

export const dynamic = 'force-dynamic';

// The magic link's buttons: pause or delete one alert sent to this address, or stop everything to it.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const kind = b.k as Kind;
  const value = String(b.v || '');
  if (!manageOk(kind, value, String(b.t || ''))) return NextResponse.json({ error: 'That link is not valid.' }, { status: 403 });
  if (b.op === 'stop_all' || b.op === 'not_me') {
    block(kind, value, b.op === 'not_me' ? 'not me' : 'stopped everything');
    return NextResponse.json({ ok: true });
  }
  const id = String(b.alert_id || '');
  const ok = write((d) => {
    const a = d.alerts[id];
    const mine = a && (kind === 'email' ? a.email === value : a.phone === value || a.m91_phone === value);
    if (!a || !mine || a.status !== 'active') return false;
    if (b.op === 'delete') {
      a.status = 'cancelled';
      return true;
    }
    if (b.op === 'pause') {
      // Only this address's channels stop; the alert keeps going to the shopper's other ones.
      const mineCh: Channel[] = kind === 'email' ? ['email'] : [...(a.phone === value ? (['whatsapp'] as Channel[]) : []), ...((a.m91_phone || a.phone) === value ? (['m91'] as Channel[]) : [])];
      a.channels = a.channels.filter((c) => !mineCh.includes(c));
      a.stopped = [...new Set([...(a.stopped ?? []), ...mineCh])];
      if (!a.channels.length) a.status = 'cancelled';
      return true;
    }
    return false;
  });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'That alert is not active any more.' }, { status: 404 });
}
