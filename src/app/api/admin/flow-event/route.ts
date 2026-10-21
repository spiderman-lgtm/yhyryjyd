import { NextResponse } from 'next/server';
import { guard } from '@/lib/admin-guard';
import { write, type Tier } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The prebuilt UI reports flow changes to the page, which forwards them here.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const { id, status } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || typeof status !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  write((d) => {
    d.settings.flow_status = { ...(d.settings.flow_status || {}), [id]: status };
    if (status === 'deleted') {
      for (const t of Object.keys(d.settings.flows) as Tier[]) if (d.settings.flows[t] === id) delete d.settings.flows[t];
    }
  });
  return NextResponse.json({ ok: true });
}
