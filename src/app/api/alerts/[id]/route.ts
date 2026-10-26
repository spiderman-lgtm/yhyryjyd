import { NextResponse } from 'next/server';
import { read, type Channel } from '@/lib/db';
import { cancelAlert, extendAlert, setAlertChannel } from '@/lib/alerts';
import { currentUid } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const uid = currentUid();
  const alert = read((d) => d.alerts[params.id]);
  if (!alert || alert.uid !== uid) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { op, channel, on } = await req.json().catch(() => ({}));
  if (op === 'cancel') return NextResponse.json({ alert: cancelAlert(alert.id) });
  // Stop one channel of this alert (Email, WhatsApp, Telegram, phone ring), or turn it back on.
  if (op === 'channel') {
    if (!['email', 'whatsapp', 'telegram', 'm91'].includes(channel)) return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
    const r = setAlertChannel(alert.id, channel as Channel, on === true);
    return 'error' in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  }
  if (op === 'extend') return NextResponse.json({ alert: extendAlert(alert.id) });
  return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
}
