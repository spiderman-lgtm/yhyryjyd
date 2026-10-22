import { NextResponse } from 'next/server';
import { claimOutbox } from '@/lib/alerts';
import { automationKey } from '@/lib/flows';
import { safeEqual } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';

// Called by the instant-email automation: the queued emails to send now.
export async function POST(req: Request) {
  if (!safeEqual(req.headers.get('x-automation-key') || '', automationKey())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ notifications: claimOutbox() });
}
