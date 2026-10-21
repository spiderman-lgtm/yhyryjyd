import { NextResponse } from 'next/server';
import { read } from '@/lib/db';
import { cancelAlert, extendAlert } from '@/lib/alerts';
import { currentUid } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const uid = currentUid();
  const alert = read((d) => d.alerts[params.id]);
  if (!alert || alert.uid !== uid) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { op } = await req.json().catch(() => ({}));
  if (op === 'cancel') return NextResponse.json({ alert: cancelAlert(alert.id) });
  if (op === 'extend') return NextResponse.json({ alert: extendAlert(alert.id) });
  return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
}
