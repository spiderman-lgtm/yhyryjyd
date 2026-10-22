import 'server-only';
import { read, write, type Settings, type Tier } from './db';
import { TIER_INFO } from './alerts';
import { appUrl } from './config';
import { GMAIL, WHATSAPP, derivedKey, runFlow, upsertCronFlow, upsertWebhookFlow, type FlowStep } from './viasocket';

export const automationKey = () => derivedKey('automation');

// Each step is code that runs in viaSocket's VM. Values fixed for the operator are baked in with
// JSON.stringify; values that change per run come from context.res of the earlier step.
// The 'mail' flow is the same pipeline, but its first step collects the queued one-off emails.
export function buildSteps(tier: Tier | 'mail', s: Settings): FlowStep[] {
  const base = JSON.stringify(appUrl());
  const key = JSON.stringify(automationKey());
  const source = JSON.stringify(tier === 'mail' ? '/api/cron/outbox' : '/api/cron/run');
  const list: FlowStep[] = [
    {
      stepname: 'check_prices',
      service_action_functions: [],
      code: `
const res = await axios.post(${base} + ${source}, { tier: ${JSON.stringify(tier)} }, { headers: { "x-automation-key": ${key} }, timeout: 45000 });
const d = res.data || {};
console.log("### Checked " + (d.checked || 0) + " of " + (d.products || 0) + " products; " + (d.notifications || []).length + " notifications due");
return d;`,
    },
  ];

  if (s.gmail) {
    const fromField = s.gmail.from ? `, from: ${JSON.stringify(s.gmail.from)}` : '';
    list.push({
      stepname: 'send_emails',
      service_action_functions: [{ name: 'sendEmail', auth_id: s.gmail.auth_id, action_id: GMAIL.send_email.action_id }],
      code: `
const d = context?.res?.check_prices;
const due = (d && !d.error && Array.isArray(d.notifications)) ? d.notifications.filter((n) => n.email) : [];
const sent = [];
for (const n of due) {
  try {
    const r = await sendEmail({ inputData: { to: n.email, subject: n.subject, messageBody: n.html, fromName: "DealRadar"${fromField} } });
    sent.push(r && r.error ? { id: n.id, ok: false, error: JSON.stringify(r.error).slice(0, 300) } : { id: n.id, ok: true });
  } catch (e) {
    sent.push({ id: n.id, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
}
console.log("### Emails sent: " + sent.filter((x) => x.ok).length + "/" + sent.length);
return { sent };`,
    });
  }

  const wa = s.whatsapp;
  if (tier !== 'digest' && tier !== 'mail' && wa?.wba_id && wa.phone_id && wa.message_template_id) {
    list.push({
      stepname: 'send_whatsapp',
      service_action_functions: [{ name: 'sendTemplate', auth_id: wa.auth_id, action_id: WHATSAPP.send_template.action_id }],
      code: `
const d = context?.res?.check_prices;
const due = (d && !d.error && Array.isArray(d.notifications)) ? d.notifications.filter((n) => n.phone && n.whatsapp_vars) : [];
const sent = [];
for (const n of due) {
  try {
    const r = await sendTemplate({ inputData: {
      wba_id: ${JSON.stringify(wa.wba_id)},
      phone_id: ${JSON.stringify(wa.phone_id)},
      to: [n.phone],
      message_template_id: ${JSON.stringify(wa.message_template_id)},
      variables: n.whatsapp_vars
    } });
    sent.push(r && r.error ? { id: n.id, ok: false, error: JSON.stringify(r.error).slice(0, 300) } : { id: n.id, ok: true });
  } catch (e) {
    sent.push({ id: n.id, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
}
console.log("### WhatsApp sent: " + sent.filter((x) => x.ok).length + "/" + sent.length);
return { sent };`,
    });
  }

  list.push({
    stepname: 'report_delivery',
    service_action_functions: [],
    code: `
const email = (context?.res?.send_emails && context.res.send_emails.sent) || [];
const whatsapp = (context?.res?.send_whatsapp && context.res.send_whatsapp.sent) || [];
if (!email.length && !whatsapp.length) { console.log("### Nothing was sent this run"); return { reported: false }; }
await axios.post(${base} + "/api/cron/ack", { tier: ${JSON.stringify(tier)}, email, whatsapp }, { headers: { "x-automation-key": ${key} }, timeout: 8000 });
console.log("### Delivery reported to DealRadar");
return { reported: true };`,
  });
  return list;
}

// Keeps the schedules in step with the Gmail/WhatsApp setup, so the owner never has to apply it by hand.
export async function syncFlows(): Promise<{ ok: boolean; error?: string } | null> {
  const s = read((d) => d.settings);
  if (!s.gmail && !s.whatsapp?.message_template_id) return null;
  try {
    await activateFlows();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function activateFlows() {
  const s = read((d) => d.settings);
  if (!s.gmail && !s.whatsapp?.message_template_id) throw new Error('Connect Gmail or finish the WhatsApp setup first.');
  const ids: Partial<Record<Tier, string>> = {};
  for (const tier of ['urgent', 'normal', 'digest'] as Tier[]) {
    ids[tier] = await upsertCronFlow({
      scriptId: s.flows[tier],
      title: `DealRadar — ${TIER_INFO[tier].label} price check`,
      description: `${TIER_INFO[tier].every}: re-check prices of products shoppers track on the "${TIER_INFO[tier].label}" setting and send their price-drop alerts by email${tier === 'digest' ? '' : ' and WhatsApp'}.`,
      cronStatement: TIER_INFO[tier].cron,
      steps: buildSteps(tier, s),
    });
    write((d) => {
      d.settings.flows[tier] = ids[tier];
    });
  }
  if (s.gmail) await ensureMailFlow(true);
  write((d) => {
    d.settings.flows_activated_at = new Date().toISOString();
  });
  return ids;
}

let creatingMailFlow: Promise<string | null> | null = null;

// Creates (or, with refresh, rebuilds) the on-demand email flow. Needs a connected Gmail.
export async function ensureMailFlow(refresh = false): Promise<string | null> {
  const s = read((d) => d.settings);
  if (s.mail_flow && !refresh) return s.mail_flow;
  // Two alerts at the same moment share one creation instead of making two flows.
  creatingMailFlow ??= buildMailFlow().finally(() => (creatingMailFlow = null));
  return creatingMailFlow;
}

async function buildMailFlow(): Promise<string | null> {
  const s = read((d) => d.settings);
  if (!s.gmail) return null;
  const id = await upsertWebhookFlow({
    scriptId: s.mail_flow,
    title: 'DealRadar — instant emails',
    description: 'Started by DealRadar the moment a shopper sets a price alert: sends the confirmation email through your Gmail.',
    steps: buildSteps('mail', s),
  });
  write((d) => {
    d.settings.mail_flow = id;
  });
  return id;
}

// Asks viaSocket to send the queued emails now. If this fails, the next scheduled check sends them.
export async function sendQueuedMailNow() {
  const id = await ensureMailFlow();
  if (id) await runFlow(id);
}
