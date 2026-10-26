import { NextResponse } from 'next/server';
import { write, type Tier } from '@/lib/db';
import { automationKey } from '@/lib/flows';
import { safeEqual } from '@/lib/viasocket';
import { noteDeliveries } from '@/lib/ops-alerts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!safeEqual(req.headers.get('x-automation-key') || '', automationKey())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  const clean = (list: unknown) =>
    (Array.isArray(list) ? list : []).slice(0, 100).map((x: any) => ({ id: String(x?.id || ''), ok: !!x?.ok, ...(x?.error ? { error: String(x.error).slice(0, 300) } : {}) }));
  const email = clean(b.email);
  const telegram = clean(b.telegram);
  const whatsapp = clean(b.whatsapp);
  write((d) => {
    d.deliveries.push({ at: new Date().toISOString(), tier: b.tier === 'mail' ? 'mail' : (b.tier as Tier), email, whatsapp, telegram });
    // Queued one-off messages that went out are done; failed ones are retried on a later run.
    const sent = new Set([...email, ...telegram, ...whatsapp].filter((e) => e.ok).map((e) => e.id));
    for (const m of d.outbox) if (sent.has(m.id)) m.sent_at = new Date().toISOString();
  });
  // Wakes the owner when one channel keeps failing (3 reports in a row with nothing delivered).
  await noteDeliveries({ email, whatsapp, telegram });
  return NextResponse.json({ ok: true });
}
