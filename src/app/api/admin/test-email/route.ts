import { NextResponse } from 'next/server';
import { guard } from '@/lib/admin-guard';
import { currentUser } from '@/lib/auth';
import { queueMail } from '@/lib/alerts';
import { appUrl } from '@/lib/config';
import { sendQueuedMailNow } from '@/lib/flows';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Sends the owner a short email through the instant email automation, to check it end to end.
export async function POST() {
  const denied = guard();
  if (denied) return denied;
  const user = currentUser()!;
  queueMail(
    user.email,
    'DealRadar test email',
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f172a">
<div style="font-size:20px;font-weight:bold;color:#ea580c;margin-bottom:12px">DealRadar</div>
<p>Instant emails work. Shoppers get their price-alert confirmation from this Gmail account as soon as they tap <b>Track price</b>.</p>
<a href="${appUrl()}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open DealRadar</a></div>`,
  );
  try {
    const started = await sendQueuedMailNow();
    if (!started) return NextResponse.json({ error: 'Gmail is not connected in DealRadar — connect it above first.' }, { status: 400 });
    return NextResponse.json({ ok: true, to: user.email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
