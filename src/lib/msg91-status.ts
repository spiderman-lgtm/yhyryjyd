import 'server-only';
import { read, write, type Msg91Template } from './db';
import { MSG91, listOptions, runOperatorAction } from './viasocket';
import { MSG91_TEMPLATES, msg91Ready, type Msg91TemplateKey } from './msg91';
import { syncFlows } from './flows';

const KEYS: Msg91TemplateKey[] = ['confirm', 'drop'];
const RECHECK_MS = 10 * 60_000;

// The send action's field for each {{n}} of a template, in order, when MSG91's list does not name them.
async function sendFields(authId: string, number: string, name: string): Promise<string[]> {
  const opts: any[] = await listOptions(MSG91.send_template.action_version_id, 'components', { integrated_number: number, name }, authId);
  const keys = opts.map((o) => String(o?.key ?? o?.value ?? '')).filter(Boolean);
  const n = (k: string) => Number((k.match(/(\d+)(?!.*\d)/) || [])[1] ?? 0);
  return keys.sort((a, b) => n(a) - n(b));
}

// Reads what Meta said about the two templates; once both are approved the automations are rebuilt to send
// WhatsApp through MSG91.
export async function refreshMsg91Templates() {
  const m = read((d) => d.settings.msg91);
  if (!m?.number) throw new Error('Choose your MSG91 WhatsApp number first.');
  const out: Record<string, Msg91Template> = {};
  for (const k of KEYS) {
    // The current name first, then earlier versions: the first one Meta approved is used.
    let best: Msg91Template | null = null;
    for (const name of [MSG91_TEMPLATES[k].name, ...MSG91_TEMPLATES[k].also]) {
      const r: any = await runOperatorAction(MSG91.service_id, m.auth_id, MSG91.list_templates.action_version_id, { number: m.number, template_name: name });
      const list: any[] = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : r?.name ? [r] : [];
      const found = list.find((x) => x?.name === name);
      if (!found) continue;
      const lang = found.languages?.find((l: any) => l?.language === 'en') ?? found.languages?.[0];
      const status = String(lang?.status ?? found.status ?? 'PENDING').toUpperCase();
      // MSG91 lists each template's variables as the send action's field names (body_1, body_2, …).
      const listed: string[] = Array.isArray(lang?.variables) ? lang.variables.map(String) : [];
      const fields = status === 'APPROVED' ? (listed.length ? listed : await sendFields(m.auth_id, m.number, name)) : undefined;
      const t: Msg91Template = { name, status, fields, category: found.category, reason: lang?.rejection_reason && lang.rejection_reason !== 'NONE' ? String(lang.rejection_reason) : undefined };
      if (status === 'APPROVED') {
        best = t;
        break;
      }
      best ??= t;
    }
    out[k] = best ?? { name: MSG91_TEMPLATES[k].name, status: 'NOT CREATED' };
  }
  const wasReady = msg91Ready();
  write((d) => {
    d.settings.msg91 = { ...d.settings.msg91!, templates: out as { confirm: Msg91Template; drop: Msg91Template }, checked_at: new Date().toISOString() };
  });
  const ready = msg91Ready();
  const schedules = ready && !wasReady ? await syncFlows() : null;
  if (ready && !wasReady) console.log('[msg91] both templates approved: WhatsApp now goes out through MSG91');
  return { templates: out, ready, schedules };
}

// Called by the scheduled runs: while a template is waiting for Meta, look again every 10 minutes, so
// WhatsApp switches to MSG91 by itself the moment both are approved.
export async function checkPendingMsg91() {
  const m = read((d) => d.settings.msg91);
  if (!m?.number || msg91Ready()) return;
  const t = m.templates;
  if (t && KEYS.every((k) => ['APPROVED', 'REJECTED'].includes(t[k].status))) return;
  if (m.checked_at && Date.now() - Date.parse(m.checked_at) < RECHECK_MS) return;
  await refreshMsg91Templates().catch((e) => console.error('[msg91] status check failed:', e instanceof Error ? e.message : e));
}
