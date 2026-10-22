import { NextResponse } from 'next/server';
import { guard, errorJson } from '@/lib/admin-guard';
import { write } from '@/lib/db';
import { APPS, listConnections, type AppKey } from '@/lib/viasocket';
import { syncFlows } from '@/lib/flows';
import { listenToBot } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The Connect popup reports an auth_id; confirm it belongs to the operator before storing it.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const { app, authId } = await req.json().catch(() => ({}));
  if (!(app in APPS) || typeof authId !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const service = APPS[app as AppKey];
  try {
    const conns = await listConnections();
    if (!conns.some((c) => c.id === authId && c.id.endsWith(`_${service.service_id}`))) {
      return NextResponse.json({ error: `That ${service.name} connection was not found.` }, { status: 404 });
    }
  } catch (e) {
    return errorJson(e);
  }
  write((d) => {
    if (app === 'gmail') d.settings.gmail = { auth_id: authId, from: d.settings.gmail?.from ?? null };
    else if (app === 'telegram')
      d.settings.telegram = { auth_id: authId, bot: d.settings.telegram?.bot ?? null, subscription: d.settings.telegram?.subscription ?? null, error: null };
    else
      d.settings.whatsapp =
        d.settings.whatsapp?.auth_id === authId
          ? d.settings.whatsapp
          : { auth_id: authId, wba_id: null, phone_id: null, message_template_id: null, variable_map: {} };
  });
  // The bot must hear "/start" from shoppers to link their chats.
  if (app === 'telegram') await listenToBot();
  return NextResponse.json({ ok: true, schedules: await syncFlows() });
}
