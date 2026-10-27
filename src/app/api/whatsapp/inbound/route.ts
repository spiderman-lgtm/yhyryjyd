import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/viasocket';
import { handleInbound, inboundKey } from '@/lib/wa-session';

export const dynamic = 'force-dynamic';

// MSG91's webhook ("On Inbound Request Received") for messages sent to the owner's WhatsApp number.
export async function POST(req: Request) {
  if (!safeEqual(new URL(req.url).searchParams.get('k') || '', inboundKey())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const raw = await req.text();
  let body: any = {};
  try {
    body = JSON.parse(raw);
  } catch {
    body = Object.fromEntries(new URLSearchParams(raw));
  }
  const result = await handleInbound(body).catch((e) => `error: ${e instanceof Error ? e.message : e}`);
  // The shape of the first messages is logged (numbers masked) so the parsing can be checked.
  console.log(`[wa] inbound ${result}: ${raw.replace(/\d{8,}/g, (n) => n.slice(0, 2) + '••' + n.slice(-2)).slice(0, 300)}`);
  return NextResponse.json({ ok: true });
}
