import { NextResponse } from 'next/server';
import { guard } from '@/lib/admin-guard';
import { write, type WhatsAppVarSource } from '@/lib/db';
import { syncFlows } from '@/lib/flows';
import { normalizeBot, stopListening } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCES: WhatsAppVarSource[] = ['product_title', 'price', 'old_price', 'drop_percent', 'coupon', 'buy_link'];
const str = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 200) : null);

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (b.telegram && 'bot' in b.telegram && !normalizeBot(b.telegram.bot)) {
    return NextResponse.json({ error: 'Enter the bot username from @BotFather, e.g. DealRadarAlertsBot (it ends in “bot”).' }, { status: 400 });
  }
  if (b.disconnect === 'telegram') await stopListening();
  const settings = write((d) => {
    if (b.telegram && d.settings.telegram) d.settings.telegram.bot = normalizeBot(b.telegram.bot);
    if (b.disconnect === 'telegram') d.settings.telegram = null;
    if (b.gmail && d.settings.gmail) d.settings.gmail.from = str(b.gmail.from);
    if (b.whatsapp && d.settings.whatsapp) {
      const w = b.whatsapp;
      const map: Record<string, WhatsAppVarSource> = {};
      for (const [k, v] of Object.entries(w.variable_map || {})) if (SOURCES.includes(v as WhatsAppVarSource)) map[k.slice(0, 200)] = v as WhatsAppVarSource;
      const confirmMap: Record<string, WhatsAppVarSource> = {};
      for (const [k, v] of Object.entries(w.confirm_variable_map || {})) if (SOURCES.includes(v as WhatsAppVarSource)) confirmMap[k.slice(0, 200)] = v as WhatsAppVarSource;
      Object.assign(d.settings.whatsapp, {
        wba_id: str(w.wba_id),
        phone_id: str(w.phone_id),
        message_template_id: str(w.message_template_id),
        variable_map: map,
        confirm_template_id: str(w.confirm_template_id),
        confirm_variable_map: confirmMap,
      });
    }
    if (b.disconnect === 'gmail') d.settings.gmail = null;
    if (b.disconnect === 'whatsapp') d.settings.whatsapp = null;
    return d.settings;
  });
  return NextResponse.json({ settings, schedules: await syncFlows() });
}
