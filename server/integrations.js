// The shop's real app connections through viaSocket: Google Sheets (order sheet),
// Razorpay (payment links + "link paid" event) and any other app the owner connects
// after the App Analyzer says GO. Ids below are copied from each app's viaSocket
// document (fetched fresh per task); version ids run/list/subscribe, plain ids go to
// the Connect popup.
import crypto from 'node:crypto';
import { config } from './config.js';
import { get, save, findOrder } from './store.js';
import * as vs from './vs.js';
import { fmt } from './time.js';

export const SHEETS = {
  service_id: 'rowqm5xi2',
  name: 'Google Sheets',
  icon: 'https://stuff.thingsofbrand.com/google.com/images/img4_googlesheet.png',
  actions: {
    addRows: { action_version_id: 'rowdd8u5lg1k', action_id: 'rowfudy5tu2q' }, // Add Multiple Rows
    batchUpdate: { action_version_id: 'row2eh6do90m', action_id: 'rowfz61wiorf' }, // Batch Update Cell Values
    getRange: { action_version_id: 'rowzb4wbvcpz', action_id: 'rowew4bwgsqk' }, // Get Rows From Range
    createSpreadsheet: { action_version_id: 'rowwy37z95y1', action_id: 'rowpt94c8qh3' }, // Create a Spreadsheet
  },
};

export const RAZORPAY = {
  service_id: 'row2n5tu2hd9',
  name: 'Razorpay',
  icon: 'https://stuff.thingsofbrand.com/razorpay.com/images/img678aa307e6_razorpay.jpg',
  actions: { createLink: { action_version_id: 'rowx80i9iaui', action_id: 'rowtl0joo241' } }, // Create Payment Link
  triggers: { linkPaid: { trigger_version_id: 'rowmibzre7ee', trigger_id: 'row7jnx5qnyp' } }, // Any Payment Link Gets Paid
};

// Column order of the order sheet. A fresh tab gets these headers on the first row we add
// (Add Multiple Rows with JSON creates them in this order).
export const COLUMNS = ['Order ID', 'Created', 'Customer', 'Phone', 'Items', 'Total', 'Mode', 'When', 'Address', 'Stage', 'Paid At', 'Payment Link'];
const LIVE_COLUMNS = ['Stage', 'Paid At', 'Payment Link'];
const letter = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

// ---------- state ----------
function state() {
  const d = get();
  d.integrations ||= { apps: {} };
  d.integrations.apps ||= {};
  if (!d.shop.uid) { d.shop.uid = `dukaan-${crypto.randomUUID()}`; save(); }
  if (!d.integrations.callback_secret) { d.integrations.callback_secret = crypto.randomBytes(24).toString('base64url'); save(); }
  return d.integrations;
}
export const shopUid = () => { state(); return get().shop.uid; };
export const callbackSecret = () => config.viasocket.callbackSecret || state().callback_secret;
const conn = (serviceId) => state().apps[serviceId];

export const sheetsReady = () => { const c = conn(SHEETS.service_id); return Boolean(vs.configured() && c?.script_id && c.sheet?.spreadsheet_id && c.sheet?.columns); };
export const razorpayReady = () => { const c = conn(RAZORPAY.service_id); return Boolean(vs.configured() && c?.script_id && c.link_type); };

/** What the dashboard may see: no script_id, no secret, no flow URL. */
export function publicState() {
  const apps = Object.values(state().apps).map((a) => ({
    service_id: a.service_id, name: a.name, icon: a.icon, auth_id: a.auth_id, connected_at: a.connected_at,
    expired: !!a.expired, enabled: !!a.script_id,
    sheet: a.sheet ? { spreadsheet_label: a.sheet.spreadsheet_label, sheet_label: a.sheet.sheet_label, url: a.sheet.url || '' } : undefined,
    link_type: a.link_type, paid_subscription: a.subscription ? { created_at: a.subscription.created_at } : undefined,
    flows: (a.flows || []).map((f) => ({ id: f.id, title: f.title, status: f.status })),
  }));
  return {
    configured: vs.configured(),
    sheets: { ...SHEETS, actions: undefined, ready: sheetsReady() },
    razorpay: { ...RAZORPAY, actions: undefined, triggers: undefined, ready: razorpayReady(), filteredActions: [RAZORPAY.actions.createLink.action_id, RAZORPAY.triggers.linkPaid.trigger_id] },
    sheetsFilteredActions: Object.values(SHEETS.actions).map((a) => a.action_id),
    apps,
  };
}

// ---------- connecting ----------
/** Called after the Connect popup reports success. Verifies the auth_id belongs to this shop. */
export async function connected({ serviceId, authId, name = '', icon = '' }) {
  const uid = shopUid();
  const list = await vs.listConnections(uid);
  const found = (list || []).find((a) => a.id === authId);
  if (!found || found.service_id !== serviceId) throw new Error('connection not found for this shop');
  const apps = state().apps;
  const prev = apps[serviceId] || {};
  const entry = {
    ...prev, service_id: serviceId, name: found.service_name || name || prev.name, icon: found.iconUrl || icon || prev.icon,
    auth_id: authId, connected_at: new Date().toISOString(), expired: false,
  };
  // Only apps whose actions this product runs get enabled (a script_id).
  if (serviceId === SHEETS.service_id || serviceId === RAZORPAY.service_id) {
    entry.script_id = await vs.enableApp(uid, serviceId, authId);
  }
  apps[serviceId] = entry;
  if (serviceId === RAZORPAY.service_id && !entry.link_type) entry.link_type = 'standard';
  // Mirror into the analyzer's list of connected apps.
  const d = get();
  const listed = d.connected_apps.find((a) => a.service_id === serviceId || a.name.toLowerCase() === String(entry.name).toLowerCase());
  if (listed) Object.assign(listed, { pending_connect: false, service_id: serviceId, icon: entry.icon });
  else d.connected_apps.push({ name: entry.name, service_id: serviceId, icon: entry.icon, verdict: 'GO', added_at: entry.connected_at });
  save();
  if (serviceId === RAZORPAY.service_id && entry.subscription?.auth_id !== authId) {
    await subscribeRazorpayPaid().catch((e) => { entry.subscription_error = e.message; save(); });
  }
  return entry;
}

/** Marks expired connections so the dashboard can show Reconnect. */
export async function refreshConnections() {
  if (!vs.configured()) return [];
  const list = await vs.listConnections(shopUid());
  for (const a of Object.values(state().apps)) {
    const f = (list || []).find((x) => x.id === a.auth_id);
    a.expired = !f || !!f.isExpired;
  }
  save();
  return list;
}

export function recordFlow(serviceId, flow) {
  const a = state().apps[serviceId];
  if (!a) return;
  a.flows ||= [];
  const i = a.flows.findIndex((f) => f.id === flow.id);
  const rec = { id: flow.id, title: flow.title || '', status: flow.status || flow.action, webhookurl: flow.webhookurl || a.flows[i]?.webhookurl || '' };
  if (flow.action === 'deleted') a.flows = a.flows.filter((f) => f.id !== flow.id);
  else if (i >= 0) a.flows[i] = rec; else a.flows.push(rec);
  save();
}

// ---------- Google Sheets ----------
const sheetsConn = () => {
  const c = conn(SHEETS.service_id);
  if (!c?.script_id) throw new Error('Google Sheets connect nahi hai');
  return c;
};

/** Picker data for the order-sheet settings. The owner chooses; nothing is fixed in code. */
export async function sheetsOptions(field, { spreadsheet_id, search } = {}) {
  const c = sheetsConn();
  const uid = shopUid();
  const avid = SHEETS.actions.addRows.action_version_id;
  if (field === 'spreadsheet') return vs.listOptions(uid, avid, 'spreadSheet_Id', {}, c.auth_id, search);
  if (field === 'sheet') return vs.listOptions(uid, avid, 'sheet_id', { spreadSheet_Id: spreadsheet_id }, c.auth_id);
  throw new Error('unknown field');
}

/** Check the chosen tab: empty (we create headers) or already has our headers. */
export async function chooseSheet({ spreadsheet_id, spreadsheet_label = '', sheet_id, sheet_label = '' }) {
  const c = sheetsConn();
  if (!spreadsheet_id || sheet_id == null || sheet_id === '') throw new Error('spreadsheet aur sheet dono chuniye');
  const head = await vs.runAction(c.script_id, SHEETS.actions.getRange.action_version_id, { spreadsheet_Id: spreadsheet_id, grid_Id: String(sheet_id), range: 'A1:Z1' })
    .catch(() => []);
  const first = Array.isArray(head) ? head[0] : null;
  let columns;
  if (!first) {
    columns = Object.fromEntries(LIVE_COLUMNS.map((k) => [k, letter(COLUMNS.indexOf(k))]));
  } else {
    const headers = Object.keys(first).filter((k) => k !== 'Row Number');
    const missing = COLUMNS.filter((h) => !headers.some((x) => x.toLowerCase() === h.toLowerCase()));
    if (missing.length) throw new Error(`Is tab mein pehle se data hai par Dukaan ke columns nahi (${missing.slice(0, 3).join(', ')}…). Khaali tab chuniye ya "Nayi sheet banao".`);
    columns = Object.fromEntries(LIVE_COLUMNS.map((k) => [k, letter(headers.findIndex((x) => x.toLowerCase() === k.toLowerCase()))]));
  }
  c.sheet = { spreadsheet_id, spreadsheet_label, sheet_id: String(sheet_id), sheet_label, columns, url: `https://docs.google.com/spreadsheets/d/${spreadsheet_id}/edit` };
  save();
  return c.sheet;
}

export async function createOrderSheet(title) {
  const c = sheetsConn();
  const r = await vs.runAction(c.script_id, SHEETS.actions.createSpreadsheet.action_version_id, { spreadsheet_title: title || `${get().shop.name} — Orders` });
  const spreadsheet_id = r.spreadsheetId || r.data?.spreadsheetId;
  if (!spreadsheet_id) throw new Error('spreadsheet nahi bani');
  const tabs = await sheetsOptions('sheet', { spreadsheet_id });
  if (!tabs.length) throw new Error('sheet tab nahi mila');
  return chooseSheet({ spreadsheet_id, spreadsheet_label: title || `${get().shop.name} — Orders`, sheet_id: tabs[0].value, sheet_label: tabs[0].label });
}

const orderRow = (o, stage) => ({
  'Order ID': o.id,
  Created: fmt(o.created_at),
  Customer: o.customer_name || '',
  Phone: o.phone,
  Items: o.items.map((l) => `${l.qty} × ${l.name}`).join(', '),
  Total: o.total,
  Mode: o.mode,
  When: fmt(o.fulfil_at),
  Address: o.address || '',
  Stage: stage,
  'Paid At': o.paid_at ? fmt(o.paid_at) : '',
  'Payment Link': o.payment_link?.url || '',
});

export async function sheetsAppend(order, stage) {
  const c = sheetsConn();
  const r = await vs.runAction(c.script_id, SHEETS.actions.addRows.action_version_id, {
    spreadSheet_Id: c.sheet.spreadsheet_id,
    sheet_id: c.sheet.sheet_id,
    use_json_rows: true, // one row shape for every shop; headers come from the keys
    rows_json: JSON.stringify([orderRow(order, stage)]),
  });
  // Live response: data.updates.updatedRange = "Sheet1!A2:L2"
  const range = r?.updates?.updatedRange || r?.data?.updates?.updatedRange || '';
  const m = range.match(/!?[A-Z]+(\d+)/);
  return { row_id: m ? Number(m[1]) : null, range };
}

export async function sheetsUpdate(orderId, stage) {
  const c = sheetsConn();
  const o = findOrder(orderId);
  if (!o?.sheet_row) return { skipped: 'no sheet row' };
  const cols = c.sheet.columns;
  const values = { Stage: stage, 'Paid At': o.paid_at ? fmt(o.paid_at) : '', 'Payment Link': o.payment_link?.url || '' };
  const letters = LIVE_COLUMNS.map((k) => cols[k]);
  const contiguous = letters.every((l, i) => i === 0 || l.charCodeAt(l.length - 1) === letters[i - 1].charCodeAt(letters[i - 1].length - 1) + 1);
  const batch = (range, row) => vs.runAction(c.script_id, SHEETS.actions.batchUpdate.action_version_id, {
    spreadSheet_id: c.sheet.spreadsheet_id,
    sheet_id: c.sheet.sheet_id,
    value_input_option: 'RAW', // phone numbers and ids stay text, never reformatted
    updates: { range, values: JSON.stringify([row]), major_dimension: 'ROWS' },
    include_values_in_response: false, // nothing reads the written values back
  });
  if (contiguous) return batch(`${letters[0]}${o.sheet_row}:${letters.at(-1)}${o.sheet_row}`, LIVE_COLUMNS.map((k) => values[k]));
  for (const k of LIVE_COLUMNS) await batch(`${cols[k]}${o.sheet_row}`, [values[k]]);
  return { ok: true };
}

// ---------- Razorpay ----------
const rzpConn = () => {
  const c = conn(RAZORPAY.service_id);
  if (!c?.script_id) throw new Error('Razorpay connect nahi hai');
  return c;
};

export function setLinkType(type) {
  if (!['standard', 'upi'].includes(type)) throw new Error('link type: standard ya upi');
  rzpConn().link_type = type;
  save();
}

export async function razorpayLink(order) {
  const c = rzpConn();
  const r = await vs.runAction(c.script_id, RAZORPAY.actions.createLink.action_version_id, {
    link_type: c.link_type, // owner's choice: all methods, or UPI only
    amount: Math.round(order.total * 100),
    currency: 'INR', // Indian shops; UPI links accept only INR
    description: `Order #${order.id} — ${get().shop.name}`.slice(0, 2048),
    reference_id: `${shopUid().slice(-8)}-${order.id}`, // unique per shop + order
    expiry_mode: 'days',
    expire_by_days: 30, // outlives the udhaar ladder (day 7) with room to spare
    add_customer: true,
    customer: { name: order.customer_name || 'Customer', contact: `+${order.phone}` },
    accept_partial: false, // a part payment is recorded, but the order stays due
    notes: { order_id: order.id, shop: shopUid() },
  });
  const url = r?.short_url || r?.data?.short_url;
  if (!url) throw new Error('Razorpay link nahi bana');
  return { id: r.id || r.data?.id || '', url };
}

/** "Any Payment Link Gets Paid" → handler on viaSocket calls our callback (Template B). */
export async function subscribeRazorpayPaid() {
  const c = rzpConn();
  if (!/^https:\/\//.test(config.publicUrl)) throw new Error('PUBLIC_URL https hona chahiye (deploy ke baad)');
  const url = `${config.publicUrl}/api/viasocket/razorpay-paid`;
  const code = `
  const event = context.req.body
  const res = await fetch(${JSON.stringify(url)}, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dukaan-secret": ${JSON.stringify(callbackSecret())} },
    body: JSON.stringify({ event })
  })
  return { delivered: res.status }
`;
  const inputData = {};
  if (c.subscription?.script_id) {
    await vs.updateSubscription(shopUid(), c.subscription.script_id, { code });
    c.subscription.code = code;
  } else {
    const script_id = await vs.subscribeEvent(shopUid(), RAZORPAY.triggers.linkPaid.trigger_version_id, c.auth_id, inputData, code, { user_id: shopUid() });
    c.subscription = { script_id, service_id: RAZORPAY.service_id, trigger_version_id: RAZORPAY.triggers.linkPaid.trigger_version_id, auth_id: c.auth_id, inputData, code, created_at: new Date().toISOString() };
  }
  save();
  return true;
}

/** Find our order in a Razorpay payment-link event, whatever wrapper it arrives in. */
export function orderFromRazorpayEvent(ev) {
  const seen = new Set();
  const walk = (x, depth = 0) => {
    if (!x || typeof x !== 'object' || depth > 6 || seen.has(x)) return null;
    seen.add(x);
    if (x.notes && typeof x.notes === 'object' && x.notes.order_id && (!x.notes.shop || x.notes.shop === shopUid())) {
      return { order_id: String(x.notes.order_id), amount_paise: x.amount_paid ?? x.amount, payment_id: x.payment_id || x.id || '' };
    }
    if (typeof x.reference_id === 'string' && x.reference_id.startsWith(`${shopUid().slice(-8)}-`)) {
      return { order_id: x.reference_id.split('-').pop(), amount_paise: x.amount_paid ?? x.amount, payment_id: x.id || '' };
    }
    for (const v of Object.values(x)) { const r = walk(v, depth + 1); if (r) return r; }
    return null;
  };
  return walk(ev);
}
