import { NextResponse } from 'next/server';
import { guard, errorJson } from '@/lib/admin-guard';
import { read } from '@/lib/db';
import { GMAIL, WHATSAPP, listOptions } from '@/lib/viasocket';

export const dynamic = 'force-dynamic';

const PICKERS = {
  gmail: { actionVersionId: GMAIL.send_email.action_version_id, fields: ['from'] },
  whatsapp: { actionVersionId: WHATSAPP.send_template.action_version_id, fields: ['wba_id', 'phone_id', 'message_template_id', 'variables'] },
} as const;

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const { app, fieldKey, existingFields } = await req.json().catch(() => ({}));
  const picker = PICKERS[app as keyof typeof PICKERS];
  if (!picker || !(picker.fields as readonly string[]).includes(fieldKey)) return NextResponse.json({ error: 'Unknown field' }, { status: 400 });
  const authId = read((d) => (app === 'gmail' ? d.settings.gmail?.auth_id : d.settings.whatsapp?.auth_id));
  if (!authId) return NextResponse.json({ error: 'Connect the app first.' }, { status: 400 });
  try {
    const options = await listOptions(picker.actionVersionId, fieldKey, existingFields && typeof existingFields === 'object' ? existingFields : {}, authId);
    return NextResponse.json({ options });
  } catch (e) {
    return errorJson(e);
  }
}
