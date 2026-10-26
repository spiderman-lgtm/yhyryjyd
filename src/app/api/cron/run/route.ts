import { NextResponse } from 'next/server';
import type { Tier } from '@/lib/db';
import { runTier } from '@/lib/alerts';
import { automationKey, ensureFlowsCurrent } from '@/lib/flows';
import { safeEqual } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Called by the DealRadar viaSocket automations on their schedule.
export async function POST(req: Request) {
  if (!safeEqual(req.headers.get('x-automation-key') || '', automationKey())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { tier } = await req.json().catch(() => ({}));
  if (!['urgent', 'normal', 'digest'].includes(tier)) return NextResponse.json({ error: 'bad tier' }, { status: 400 });
  // The first scheduled run after a release that changed the automations' steps rebuilds them.
  void ensureFlowsCurrent();
  return NextResponse.json(await runTier(tier as Tier));
}
