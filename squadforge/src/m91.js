// M91 (alert escalation: push, SMS, call until answered) through the lead's viaSocket connection.
// Field keys are read at run time from the action's published form and matched by their labels,
// so nothing is typed from memory; the first use logs the fields it found.
const vs = require('./viasocket');
const { logActivity } = require('./util');

const SERVICE_ID = 'rowzi2rxrvo0';
const ACTIONS = {
  send: { id: 'rowrdphmcwo6', key: 'Send_Direct_Alert', version: 'V4' },
  invite: { id: 'rowm6gkj8ozo', key: 'Invite_Direct_Recipient', version: 'V3' },
  get: { id: 'rowqohw5b5ec', key: 'Get_Direct_Alert_by_ID', version: 'V3' },
};
const logged = new Set();
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digits = (p) => String(p || '').replace(/[^0-9]/g, '');

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let o = obj;
  parts.slice(0, -1).forEach((p) => { o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {}; o = o[p]; });
  o[parts[parts.length - 1]] = value;
}
// For a dropdown, send the option's own value for the label we want ("High" → "HIGH").
function optionValue(block, want) {
  const opts = block.options || [];
  const hit = opts.find((o) => norm(o && o.label) === norm(want) || norm(o && o.value) === norm(want));
  return hit ? hit.value : want;
}

// wanted: { 'to': '9198…', 'title': '…', 'severity': 'High', ... } keyed by (normalised) field label
async function buildInput(action, wanted, required = []) {
  const schema = await vs.actionSchema(SERVICE_ID, action.id);
  const blocks = schema.blocks || {};
  const input = {}, found = new Set();
  for (const [key, block] of Object.entries(blocks)) {
    const label = norm(block && block.label);
    if (!label || !(label in wanted)) continue;
    const v = wanted[label];
    setPath(input, key, block.type === 'dropdown' ? optionValue(block, v) : v);
    found.add(label);
  }
  if (!logged.has(action.key)) {
    logged.add(action.key);
    console.log(`[m91] ${action.key} form fields:`, Object.entries(blocks).map(([k, b]) => `${k}=${b && b.label}`).join(' | '));
  }
  const missing = required.filter((l) => !found.has(l));
  if (missing.length) throw new Error(`M91 form changed: could not find ${missing.join(', ')}`);
  return input;
}

async function sendAlert({ phone, title, description, severity = 'High', customId }) {
  const to = digits(phone);
  if (!to) throw new Error('No phone number');
  const t = String(title || '').trim();
  const input = await buildInput(ACTIONS.send, {
    'to': to,
    'title': (t.length >= 5 ? t : `${t} — SquadForge`).slice(0, 2000),
    'description': String(description || '').slice(0, 2000),
    'severity': severity,
    'custom alert id': customId ? String(customId).slice(0, 200) : undefined,
    'allow response options': 'Yes',
    'labels': 'On it,Seen',
    'effects': 'SHARED,PERSONAL',
  }, ['to', 'title']);
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);
  return vs.runActionFor('m91', ACTIONS.send.key, ACTIONS.send.version, input);
}

async function invite(phone, from = 'SquadForge') {
  const input = await buildInput(ACTIONS.invite, { 'from': from, 'to': digits(phone) }, ['to']);
  const out = await vs.runActionFor('m91', ACTIONS.invite.key, ACTIONS.invite.version, input);
  logActivity('commander', `🔔 M91 invite sent to ${digits(phone).replace(/\d(?=\d{4})/g, '•')}`);
  return out;
}

async function alertStatus(phone, alertId) {
  const input = await buildInput(ACTIONS.get, { 'alert id custom id': alertId, 'phone': digits(phone) }, ['phone']);
  return vs.runActionFor('m91', ACTIONS.get.key, ACTIONS.get.version, input);
}

// ---------- M91 send link (one channel, e.g. "Squadforge") ----------
// https://m91-api.msg91.com/s/sk_… alerts everyone in that channel. It is a credential: kept in the
// M91_SEND_LINK env var (workspace 1) or the workspace setting, never logged, never sent to the browser.
const { getSetting } = require('./db');
function sendLink() {
  const ws = require('./db').currentWorkspace();
  const env = ws === 1 ? process.env.M91_SEND_LINK : '';
  const v = String(env || getSetting('m91.send_link', '') || '').trim();
  return /^https:\/\/[a-z0-9.-]+\/s\/sk_[A-Za-z0-9]+$/.test(v) ? v : '';
}
const hasLink = () => !!sendLink();
const clip = (t, n) => String(t || '').slice(0, n);
async function linkCall(path, body) {
  const link = sendLink();
  if (!link) throw new Error('M91 send link is not set');
  const res = await fetch(link + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const e = data.error || {};
    const extra = e.code === 'CHANNEL_EMPTY' ? ' — nobody in the M91 channel has installed the app yet' : '';
    throw new Error(`M91 ${res.status} ${e.code || ''}: ${e.message || 'request failed'}${extra}`.trim());
  }
  return data.data || data;
}
// Alert the whole channel. Notification-only unless responseOptions are given.
async function channelAlert({ title, description, severity = 'LOW', responseOptions, customId, callbackUrl }) {
  let t = String(title || '').trim(); if (t.length < 5) t = `${t} — SquadForge`;
  const body = { title: clip(t, 2000), severity: String(severity).toUpperCase() };
  if (description) body.description = clip(description, 2000);
  if (Array.isArray(responseOptions) && responseOptions.length) { body.responseOptions = responseOptions; body.other = true; }
  else { body.responseOptions = []; body.isAutoClose = true; } // a clean notification that closes itself
  if (customId) body.customId = clip(customId, 200);
  if (callbackUrl) body.callbackUrl = callbackUrl;
  return linkCall('', body);
}
const linkStatus = (alertId) => linkCall('/alerts/' + encodeURIComponent(alertId));
async function linkInfo() { try { return await linkCall(''); } catch (e) { return { error: e.message }; } }

function ready() { return vs.connected('m91') || hasLink(); }

module.exports = { ready, sendAlert, invite, alertStatus, hasLink, channelAlert, linkStatus, linkInfo };
