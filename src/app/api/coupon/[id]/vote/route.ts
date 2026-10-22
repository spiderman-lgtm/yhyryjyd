import { NextResponse, type NextRequest } from 'next/server';
import { viewerUid } from '@/lib/auth';
import { write } from '@/lib/db';
import { rateLimited } from '@/lib/ext';

export const dynamic = 'force-dynamic';

// "Worked" / "Didn't work" — one vote per shopper per coupon; voting again changes it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const limited = rateLimited(req, 120);
  if (limited) return limited;
  const uid = viewerUid();
  if (!uid) return NextResponse.json({ error: 'Reload the page and try again.' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const vote = b.vote === 'up' ? 1 : b.vote === 'down' ? -1 : 0;
  if (!vote) return NextResponse.json({ error: 'Bad vote' }, { status: 400 });
  const result = write((d) => {
    const c = d.store_coupons[params.id];
    if (!c) return null;
    const voters = (c.voters ??= {});
    const before = voters[uid];
    if (before !== vote) {
      if (before === 1) c.votes_up = Math.max(0, (c.votes_up ?? 0) - 1);
      if (before === -1) c.votes_down = Math.max(0, (c.votes_down ?? 0) - 1);
      if (vote === 1) c.votes_up = (c.votes_up ?? 0) + 1;
      else c.votes_down = (c.votes_down ?? 0) + 1;
      voters[uid] = vote;
      // Only the most recent voters are remembered, to keep the data file small.
      const ids = Object.keys(voters);
      if (ids.length > 1000) for (const k of ids.slice(0, ids.length - 1000)) delete voters[k];
    }
    return { up: c.votes_up ?? 0, down: c.votes_down ?? 0, mine: vote };
  });
  if (!result) return NextResponse.json({ error: 'That coupon no longer exists.' }, { status: 404 });
  return NextResponse.json(result);
}
