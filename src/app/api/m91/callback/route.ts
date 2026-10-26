import { NextResponse } from 'next/server';
import { read } from '@/lib/db';
import { readShopperAlert, readTeamAlert } from '@/lib/m91';
import { STOP_LABEL, cancelAlert } from '@/lib/alerts';
import { m91CallbackKey } from '@/lib/ops-alerts';
import { approveSuggestion, rejectSuggestion } from '@/lib/offerfeed';
import { safeEqual } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';

// M91 posts here when the owner answers a coupon alert on their phone. The post is only a signal: the answer
// is read back from M91 before anything is published or dropped.
export async function POST(req: Request) {
  if (!safeEqual(new URL(req.url).searchParams.get('k') || '', m91CallbackKey())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b: any = await req.json().catch(() => ({}));
  const customId = String(b?.customId ?? b?.alert?.customId ?? b?.data?.customId ?? '');
  // A shopper's price-drop ring: "Stop this alert" ends their DealRadar alert.
  const drop = customId.match(/^drop-(al_[a-z0-9]+)-\d+$/);
  if (drop) {
    const a = read((d) => d.alerts[drop[1]]);
    const phone = a?.m91_phone || a?.phone;
    if (!a || a.status !== 'active' || !phone) return NextResponse.json({ ok: true });
    const answer = (await readShopperAlert(phone, customId).catch(() => null))?.decision?.label;
    if (answer === STOP_LABEL) cancelAlert(a.id);
    return NextResponse.json({ ok: true });
  }
  const m = customId.match(/^coupon-(sg_[a-z0-9]+)$/);
  if (!m) return NextResponse.json({ ok: true });
  const id = m[1];
  if (read((d) => d.coupon_suggestions[id]?.status) !== 'pending') return NextResponse.json({ ok: true });
  const alert = await readTeamAlert(customId).catch(() => null);
  const answer = alert?.decision?.label;
  if (answer === 'Approve') approveSuggestion(id);
  else if (answer === 'Reject') rejectSuggestion(id);
  return NextResponse.json({ ok: true });
}
