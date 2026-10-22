import 'server-only';
import { read, write, type Settings, type Tier } from './db';
import { TIER_INFO } from './alerts';
import { appUrl } from './config';
import { GMAIL, WHATSAPP, derivedKey, upsertCronFlow, type FlowStep } from './viasocket';

export const automationKey = () => derivedKey('automation');

// Each step is code that runs in viaSocket's VM. Values fixed for the operator are baked in with
// JSON.stringify; values that change per run come from context.res of the earlier step.
export function buildSteps(tier: Tier, s: Settings): FlowStep[] {
  const base = JSON.stringify(appUrl());
  const key = JSON.stringify(automationKey());
  const list: FlowStep[] = [
    {
      stepname: 'check_prices',
      service_action_functions: [],
      code: `
const res = await axios.post(${base} + "/api/cron/run", { tier: ${JSON.stringify(tier)} }, { headers: { "x-automation-key": ${key} }, timeout: 45000 });
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
  if (tier !== 'digest' && wa?.wba_id && wa.phone_id && wa.message_template_id) {
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
  write((d) => {
    d.settings.flows_activated_at = new Date().toISOString();
  });
  return ids;
}
