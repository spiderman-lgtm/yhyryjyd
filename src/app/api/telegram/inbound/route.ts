import { NextResponse } from 'next/server';
import { automationKey } from '@/lib/flows';
import { handleBotMessage } from '@/lib/telegram';
import { safeEqual } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Called by the viaSocket subscription for every message the DealRadar bot receives.
export async function POST(req: Request) {
  if (!safeEqual(req.headers.get('x-automation-key') || '', automationKey())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));
  return NextResponse.json({ result: await handleBotMessage(b.event) });
}
