import 'server-only';
import { read, write, type Settings, type Tier } from './db';
import { TIER_INFO } from './alerts';
import { msg91Ready } from './msg91';
import { appUrl } from './config';
import { GMAIL, MSG91, TELEGRAM, WHATSAPP, WHATSAPP_NOTIFY, derivedKey, listConnections, listFlows, runFlow, upsertCronFlow, upsertWebhookFlow, type FlowStep } from './viasocket';

export const automationKey = () => derivedKey('automation');

// Bumped whenever buildSteps changes, so automations created by an older release are rebuilt once.
const STEPS_VERSION = 5; // 2: WhatsApp through viaSocket's own WhatsApp; 3: through the operator's MSG91; 4: Telegram stop button; 5: WhatsApp sends reported again

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
      message_template_id: n.whatsapp_template || ${JSON.stringify(wa.message_template_id)},
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

  if (tier !== 'digest') {
    list.push({
      stepname: 'send_whatsapp_note',
      service_action_functions: [{ name: 'notifyWhatsApp', auth_id: 'NoAuth', action_id: WHATSAPP_NOTIFY.send_notification.action_id }],
      code: `
const d = context?.res?.check_prices;
const due = (d && !d.error && Array.isArray(d.notifications)) ? d.notifications.filter((n) => n.whatsapp_note && n.whatsapp_note.to) : [];
const sent = [];
for (const n of due) {
  try {
    // The link is part of the text: the action's own link field breaks the message.
    const r = await notifyWhatsApp({ inputData: { to: n.whatsapp_note.to, title: n.whatsapp_note.title, summary: n.whatsapp_note.summary } });
    const failed = r && (r.error || r.hasError || (r.status && r.status >= 400));
    sent.push(failed ? { id: n.id, ok: false, error: JSON.stringify(r.error || r).slice(0, 300) } : { id: n.id, ok: true });
  } catch (e) {
    sent.push({ id: n.id, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
}
console.log("### WhatsApp (viaSocket) sent: " + sent.filter((x) => x.ok).length + "/" + sent.length);
return { sent };`,
    });
  }

  const m91 = s.msg91;
  if (tier !== 'digest' && m91?.number && msg91Ready(s)) {
    // Each template's {{n}} variables go into the send action's field for that variable, in order.
    const templates = {
      confirm: { name: m91.templates!.confirm.name, fields: m91.templates!.confirm.fields },
      drop: { name: m91.templates!.drop.name, fields: m91.templates!.drop.fields },
    };
    list.push({
      stepname: 'send_msg91',
      service_action_functions: [{ name: 'sendMsg91', auth_id: m91.auth_id, action_id: MSG91.send_template.action_id }],
      code: `
const d = context?.res?.check_prices;
const due = (d && !d.error && Array.isArray(d.notifications)) ? d.notifications.filter((n) => n.msg91 && n.msg91.to) : [];
const TEMPLATES = ${JSON.stringify(templates)};
const sent = [];
for (const n of due) {
  try {
    const t = TEMPLATES[n.msg91.template];
    const components = Object.fromEntries(t.fields.map((key, i) => [key, n.msg91.vars[i] ?? "-"]));
    const r = await sendMsg91({ inputData: { integrated_number: ${JSON.stringify(m91.number)}, name: t.name, components, to: n.msg91.to } });
    const failed = r && (r.hasError || r.error || (r.status && Number(r.status) >= 400));
    sent.push(failed ? { id: n.id, ok: false, error: JSON.stringify(r.errors || r.error || r).slice(0, 300) } : { id: n.id, ok: true });
  } catch (e) {
    sent.push({ id: n.id, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
}
console.log("### WhatsApp (MSG91) sent: " + sent.filter((x) => x.ok).length + "/" + sent.length);
return { sent };`,
    });
  }

  if (s.telegram) {
    list.push({
      stepname: 'send_telegram',
      service_action_functions: [{ name: 'sendTelegram', auth_id: s.telegram.auth_id, action_id: TELEGRAM.send_message.action_id }],
      code: `
const d = context?.res?.check_prices;
const due = (d && !d.error && Array.isArray(d.notifications)) ? d.notifications.filter((n) => n.telegram && n.telegram.chat) : [];
const sent = [];
for (const n of due) {
  try {
    // One button per link; a price alert's messages also carry "Stop this alert".
    const links = {};
    if (n.telegram.url) links[n.telegram.label || "Open in DealRadar"] = n.telegram.url;
    if (n.telegram.stop) links["🔕 Stop this alert"] = n.telegram.stop;
    const buttons = Object.keys(links).length ? { inline_buttons: links } : {};
    // With a product photo the message is a picture with the text as its caption (Telegram allows 1,024 characters).
    const photo = n.telegram.image && /^https:/.test(n.telegram.image) && n.telegram.text.length <= 1000;
    const r = await sendTelegram({ inputData: photo
      ? { chat: String(n.telegram.chat), message_type: "photo", media_details: { media_url: n.telegram.image, caption: n.telegram.text }, buttons }
      : { chat: String(n.telegram.chat), message_type: "text", text_message: { text: n.telegram.text }, buttons } });
    const failed = r && (r.error || r.ok === false);
    sent.push(failed ? { id: n.id, ok: false, error: JSON.stringify(r.error || r).slice(0, 300) } : { id: n.id, ok: true });
  } catch (e) {
    sent.push({ id: n.id, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
}
console.log("### Telegram sent: " + sent.filter((x) => x.ok).length + "/" + sent.length);
return { sent };`,
    });
  }

  list.push({
    stepname: 'report_delivery',
    service_action_functions: [],
    code: `
const email = (context?.res?.send_emails && context.res.send_emails.sent) || [];
// Each step is named outright: viaSocket hands a step only the results it names (a computed name gets nothing).
const whatsapp = [].concat((context?.res?.send_whatsapp && context.res.send_whatsapp.sent) || [], (context?.res?.send_whatsapp_note && context.res.send_whatsapp_note.sent) || [], (context?.res?.send_msg91 && context.res.send_msg91.sent) || []);
const telegram = (context?.res?.send_telegram && context.res.send_telegram.sent) || [];
if (!email.length && !whatsapp.length && !telegram.length) { console.log("### Nothing was sent this run"); return { reported: false }; }
await axios.post(${base} + "/api/cron/ack", { tier: ${JSON.stringify(tier)}, email, whatsapp, telegram }, { headers: { "x-automation-key": ${key} }, timeout: 8000 });
console.log("### Delivery reported to DealRadar");
return { reported: true };`,
  });
  return list;
}

// Keeps the schedules in step with the Gmail/WhatsApp setup, so the owner never has to apply it by hand.
export async function syncFlows(): Promise<{ ok: boolean; error?: string } | null> {
  const s = read((d) => d.settings);
  if (!s.gmail && !s.whatsapp?.message_template_id && !s.telegram) return null;
  try {
    await activateFlows();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function activateFlows() {
  const s = read((d) => d.settings);
  if (!s.gmail && !s.whatsapp?.message_template_id && !s.telegram) throw new Error('Connect Gmail, Telegram or finish the WhatsApp setup first.');
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
  if (s.gmail || s.telegram || s.whatsapp?.confirm_template_id) await ensureMailFlow(true);
  write((d) => {
    d.settings.flows_activated_at = new Date().toISOString();
    d.settings.flows_steps = STEPS_VERSION;
  });
  return ids;
}

let updatingFlows: Promise<unknown> | null = null;

// Rebuilds the automations once when they were made by an older release. A failure is retried on the next call.
export async function ensureFlowsCurrent() {
  const s = read((d) => d.settings);
  if (s.flows_steps === STEPS_VERSION || !s.flows_activated_at) return;
  updatingFlows ??= syncFlows()
    .then((r) => r && !r.ok && console.error('[flows] update failed:', r.error))
    .finally(() => (updatingFlows = null));
  await updatingFlows;
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

const MAIL_FLOW_TITLE = 'DealRadar — instant emails';

const mailError = (error: string | null) =>
  write((d) => {
    d.settings.mail_flow_error = error;
  });

// The operator's Gmail connection in viaSocket, when DealRadar's own settings lost track of it
// (the price-check schedules may still be sending through it).
async function adoptGmail(): Promise<boolean> {
  const conn = (await listConnections().catch(() => [])).find((c) => c.id.endsWith(`_${GMAIL.service_id}`) && !c.isExpired);
  if (!conn) return false;
  write((d) => {
    d.settings.gmail ??= { auth_id: conn.id, from: null };
  });
  return true;
}

async function buildMailFlow(): Promise<string | null> {
  if (!read((d) => d.settings.gmail)) await adoptGmail();
  const s = read((d) => d.settings);
  if (!s.gmail && !s.telegram && !s.whatsapp?.confirm_template_id) {
    mailError('Gmail is not connected in DealRadar — connect it above.');
    return null;
  }
  try {
    // Reuse the flow if one already exists, so two requests at once never leave two copies.
    const existing = s.mail_flow ?? (await listFlows().catch(() => [])).find((f) => f.title === MAIL_FLOW_TITLE && f.status === 'active')?.id;
    const id = await upsertWebhookFlow({
      scriptId: existing,
      title: MAIL_FLOW_TITLE,
      description: 'Started by DealRadar the moment a shopper sets a price alert: sends the confirmation by email (your Gmail), WhatsApp and Telegram (your bot).',
      steps: buildSteps('mail', s),
    });
    write((d) => {
      d.settings.mail_flow = id;
      d.settings.mail_flow_error = null;
    });
    return id;
  } catch (e) {
    mailError(`Could not set up the instant email automation: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

// Asks viaSocket to send the queued emails now. If this fails, the next scheduled check sends them.
export async function sendQueuedMailNow() {
  await ensureFlowsCurrent();
  let id = await ensureMailFlow();
  if (!id) return false;
  try {
    await runFlow(id).catch(async () => {
      // The saved flow may have been deleted in viaSocket: find or rebuild it once, then retry.
      write((d) => void delete d.settings.mail_flow);
      id = await ensureMailFlow();
      if (id) await runFlow(id);
    });
    if (read((d) => d.settings.mail_flow_error)) mailError(null);
    return true;
  } catch (e) {
    mailError(`The instant email automation did not start: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
