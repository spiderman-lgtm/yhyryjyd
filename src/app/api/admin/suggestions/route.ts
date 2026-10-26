import { NextResponse } from 'next/server';
import { guard } from '@/lib/admin-guard';
import { approveSuggestion, checkStoreOffers, rejectSuggestion } from '@/lib/offerfeed';
import { read } from '@/lib/db';
import { closeAsked } from '@/lib/ops-alerts';

// Handled here: the phone alerts asking about these have nothing left to ask.
async function closeHandled(ids: string[]) {
  await Promise.all(ids.map((id) => closeAsked(`coupon-${id}`)));
  if (!read((d) => Object.values(d.coupon_suggestions).some((s) => s.status === 'pending'))) await closeAsked('offers-waiting');
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Approve or reject a suggested coupon, or check the stores' offer pages now.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (b.action === 'check') return NextResponse.json(await checkStoreOffers(true));
  const ids: string[] = (Array.isArray(b.ids) ? b.ids : [b.id]).filter((x: unknown) => typeof x === 'string').slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: 'Nothing selected.' }, { status: 400 });
  if (b.action === 'reject') {
    ids.forEach(rejectSuggestion);
    await closeHandled(ids);
    return NextResponse.json({ ok: true, rejected: ids.length });
  }
  if (b.action === 'approve') {
    const results = ids.map((id) => ({ id, ...approveSuggestion(id) }));
    const failed = results.filter((r) => 'error' in r);
    await closeHandled(ids);
    return NextResponse.json({ ok: failed.length === 0, approved: results.length - failed.length, errors: failed });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
