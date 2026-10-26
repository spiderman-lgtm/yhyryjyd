import { NextResponse } from 'next/server';
import { read } from '@/lib/db';
import { readTeamAlert } from '@/lib/m91';
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
