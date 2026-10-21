import { NextResponse } from 'next/server';
import { write, type Tier } from '@/lib/db';
import { automationKey } from '@/lib/flows';
import { safeEqual } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!safeEqual(req.headers.get('x-automation-key') || '', automationKey())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  const clean = (list: unknown) =>
    (Array.isArray(list) ? list : []).slice(0, 100).map((x: any) => ({ id: String(x?.id || ''), ok: !!x?.ok, ...(x?.error ? { error: String(x.error).slice(0, 300) } : {}) }));
  write((d) => {
    d.deliveries.push({ at: new Date().toISOString(), tier: b.tier as Tier, email: clean(b.email), whatsapp: clean(b.whatsapp) });
  });
  return NextResponse.json({ ok: true });
}
