// HTTP entry point: WhatsApp webhook, viaSocket callbacks, dashboard API, static pages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, modes } from './config.js';
import * as store from './store.js';
import { parseWebhook, creds as waCreds, live as waLive, saveCreds as waSave, clearCreds as waClear, sendTest as waTest } from './whatsapp.js';
import { handleCustomer, aiProvider, runToolFromAi, aiToolSecret } from './brain.js';
import * as integ from './integrations.js';
import * as vs from './vs.js';
import { handleOwner } from './owner.js';
import { markPaid, markFulfilled, cancelOrder, ensurePaymentLink, publicOrder, dueList } from './orders.js';
import { analyze } from './analyzer.js';
import { connectApp, disconnectApp } from './apps.js';
import * as scheduler from './scheduler.js';
import * as clock from './time.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const html = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); };

async function readBody(req, limit = 1_000_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('payload too large'), { status: 413 }); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  req.rawBody = raw;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

const safeEq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function adminOk(req) {
  if (!config.adminToken) return true;
  const h = req.headers.authorization || '';
  return safeEq(h.replace(/^Bearer\s+/i, ''), config.adminToken);
}

// Meta signs webhook bodies with the app secret; verify when the secret is configured.
function whatsappSignatureOk(req) {
  const secret = waCreds().appSecret;
  if (!secret) return true;
  const sig = req.headers['x-hub-signature-256'] || '';
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex')}`;
  return safeEq(sig, expected);
}

export async function processInbound({ from, text, name = '' }) {
  const phone = store.normPhone(from);
  store.upsertCustomer(phone, name);
  store.logMessage(phone, 'in', text, { name });
  if (phone === store.normPhone(store.get().shop.owner_phone)) return handleOwner(text);
  return handleCustomer(phone, text, name);
}

const routes = [];
const route = (method, pattern, handler, { admin = false } = {}) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, keys, handler, admin });
};

// ---------- WhatsApp ----------
route('GET', '/webhook/whatsapp', (req, res, { query }) => {
  if (query.get('hub.mode') === 'subscribe' && query.get('hub.verify_token') === waCreds().verifyToken) {
    res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(query.get('hub.challenge') || '');
  }
  return json(res, 403, { error: 'verify token mismatch' });
});
route('POST', '/webhook/whatsapp', async (req, res, { body }) => {
  if (!whatsappSignatureOk(req)) return json(res, 401, { error: 'bad signature' });
  json(res, 200, { ok: true }); // ack fast; Meta retries slow webhooks
  for (const m of parseWebhook(body)) {
    await processInbound(m).catch((e) => console.error('[inbound]', e));
  }
});

// ---------- viaSocket callbacks ----------
route('POST', '/api/viasocket/payment-received', async (req, res, { body }) => {
  if (!safeEq(req.headers['x-dukaan-secret'] || '', integ.callbackSecret())) return json(res, 401, { error: 'bad secret' });
  const orderId = body.order_id || body.notes?.order_id || body.reference_id;
  if (!orderId) return json(res, 400, { error: 'order_id required' });
  try {
    const r = await markPaid(orderId, { amount: body.amount ?? (body.amount_paise != null ? body.amount_paise / 100 : undefined), payment_id: body.payment_id || '', source: 'viasocket' });
    return json(res, 200, { ok: true, stage: publicOrder(r.order).stage, partial: !!r.partial, already: !!r.already });
  } catch (e) { return json(res, 404, { error: e.message }); }
});

// ---------- Dashboard API ----------
route('GET', '/api/status', (req, res) => json(res, 200, {
  modes: { ...modes(), whatsapp: waLive() ? 'live' : 'demo', ai: aiProvider(), sheets: integ.sheetsReady() ? 'live' : 'demo', razorpay: integ.razorpayReady() ? 'live' : 'demo' },
  viasocket_configured: vs.configured(),
  checklist: {
    shop: Boolean(store.get().shop.setup_done && store.get().catalog.length),
    whatsapp: waLive(),
    sheets: integ.sheetsReady(),
    razorpay: integ.razorpayReady(),
  },
  test_phone: store.TEST_PHONE,
  shop: store.get().shop, now: clock.now().toISOString(), travelled_hours: clock.travelledHours(),
  admin_required: Boolean(config.adminToken), webhook_url: `${config.publicUrl}/webhook/whatsapp`,
  payment_callback_url: `${config.publicUrl}/api/viasocket/payment-received`,
}), { admin: true });
route('POST', '/api/simulate', async (req, res, { body }) => {
  if (!body.text || !body.phone) return json(res, 400, { error: 'phone and text required' });
  const before = store.get().messages.length;
  await processInbound({ from: body.phone, text: String(body.text).slice(0, 2000), name: body.name || '' });
  return json(res, 200, { messages: store.get().messages.slice(before) });
}, { admin: true });
route('GET', '/api/messages', (req, res, { query }) => {
  const phone = store.normPhone(query.get('phone'));
  const since = query.get('since') || '';
  const list = store.get().messages.filter((m) => (!phone || m.phone === phone) && (!since || m.at > since));
  return json(res, 200, list.slice(-300));
}, { admin: true });
route('GET', '/api/conversations', (req, res) => {
  const map = {};
  for (const m of store.get().messages) map[m.phone] = { phone: m.phone, last: m.text, at: m.at, name: store.get().customers.find((c) => c.phone === m.phone)?.name || '' };
  return json(res, 200, Object.values(map).sort((a, b) => b.at.localeCompare(a.at)));
}, { admin: true });
route('GET', '/api/orders', (req, res) => json(res, 200, store.get().orders.map(publicOrder).reverse()), { admin: true });
route('POST', '/api/orders/:id/:action', async (req, res, { params, body }) => {
  try {
    let o;
    if (params.action === 'paid') o = (await markPaid(params.id, { source: 'owner_cash' })).order;
    else if (params.action === 'fulfilled') o = await markFulfilled(params.id);
    else if (params.action === 'cancel') o = await cancelOrder(params.id, body.reason || 'owner');
    else if (params.action === 'link') o = await ensurePaymentLink(params.id);
    else return json(res, 404, { error: 'unknown action' });
    return json(res, 200, publicOrder(o));
  } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('GET', '/api/summary', (req, res) => {
  const s = scheduler.monthStats();
  return json(res, 200, { ...s, line: scheduler.monthLine(s), due: dueList().map(publicOrder) });
}, { admin: true });
route('GET', '/api/shop', (req, res) => json(res, 200, { shop: store.get().shop, catalog: store.get().catalog }), { admin: true });
route('PUT', '/api/shop', (req, res, { body }) => {
  const d = store.get();
  if (body.shop) {
    const allowed = ['name', 'type', 'owner_phone', 'address', 'open_hours', 'policies', 'upi_id'];
    for (const k of allowed) if (typeof body.shop[k] === 'string') d.shop[k] = body.shop[k].trim();
  }
  if (Array.isArray(body.catalog)) {
    d.catalog = body.catalog.filter((c) => c.name && Number(c.price) > 0).map((c, i) => ({
      id: String(c.id || c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `item-${i}`,
      name: String(c.name).trim(),
      aliases: (Array.isArray(c.aliases) ? c.aliases : String(c.aliases || '').split(',')).map((a) => a.trim().toLowerCase()).filter(Boolean),
      price: Math.round(Number(c.price)), unit: c.unit || 'piece', lead_time_hours: Math.max(0, Number(c.lead_time_hours) || 0),
    }));
  }
  d.shop.setup_done = true;
  store.save();
  return json(res, 200, { shop: d.shop, catalog: d.catalog });
}, { admin: true });
route('POST', '/api/test-chat/clear', (req, res) => { store.clearTestData(); return json(res, 200, { ok: true }); }, { admin: true });
route('GET', '/api/apps', (req, res) => json(res, 200, store.get().connected_apps), { admin: true });
route('POST', '/api/analyze-app', async (req, res, { body }) => {
  try { return json(res, 200, await analyze({ app: body.app, category: body.category, goal: body.goal })); } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('POST', '/api/apps/connect', async (req, res, { body }) => {
  const r = await connectApp(body.result, { force: !!body.force });
  return json(res, r.ok ? 200 : 400, r);
}, { admin: true });
route('POST', '/api/apps/disconnect', (req, res, { body }) => json(res, 200, disconnectApp(String(body.name || ''))), { admin: true });
route('GET', '/api/flows', (req, res) => json(res, 200, store.get().flow_log.slice(-200).reverse()), { admin: true });
route('POST', '/api/scheduler/run', async (req, res, { body }) => {
  if (body.force_report) await scheduler.monthlyReport(clock.now(), true);
  else await scheduler.tick();
  return json(res, 200, { ok: true, now: clock.now().toISOString() });
}, { admin: true });

// ---------- viaSocket: Razorpay "link paid" handler and AI tools (secret-header auth) ----------
route('POST', '/api/viasocket/razorpay-paid', async (req, res, { body }) => {
  if (!safeEq(req.headers['x-dukaan-secret'] || '', integ.callbackSecret())) return json(res, 401, { error: 'bad secret' });
  const d = store.get();
  d.integrations.last_razorpay_events = [{ at: new Date().toISOString(), event: body.event }, ...(d.integrations.last_razorpay_events || [])].slice(0, 5);
  store.save();
  const hit = integ.orderFromRazorpayEvent(body.event);
  if (!hit) return json(res, 200, { ok: true, ignored: 'no order of this shop in event' });
  try {
    const r = await markPaid(hit.order_id, { amount: hit.amount_paise != null ? Number(hit.amount_paise) / 100 : undefined, payment_id: hit.payment_id, source: 'razorpay' });
    return json(res, 200, { ok: true, order_id: hit.order_id, partial: !!r.partial, already: !!r.already });
  } catch (e) { return json(res, 404, { error: e.message }); }
});
route('POST', '/api/ai-tools/:phone/:tool', async (req, res, { params, body }) => {
  if (!safeEq((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), aiToolSecret())) return json(res, 401, { error: 'bad tool secret' });
  return json(res, 200, await runToolFromAi(params.phone, params.tool, body || {}));
});

// ---------- viaSocket: owner's connections (dashboard) ----------
const needVs = (res) => { if (!vs.configured()) { json(res, 409, { error: 'VIASOCKET_ORG_ID / VIASOCKET_PROJECT_ID / VIASOCKET_EMBED_SECRET are not set' }); return true; } return false; };
route('GET', '/api/viasocket/token', (req, res) => {
  if (needVs(res)) return;
  return json(res, 200, { token: vs.embedToken(integ.shopUid()) });
}, { admin: true });
route('GET', '/api/integrations', async (req, res) => {
  if (vs.configured()) await integ.refreshConnections().catch(() => {});
  return json(res, 200, integ.publicState());
}, { admin: true });
route('POST', '/api/viasocket/connected', async (req, res, { body }) => {
  if (needVs(res)) return;
  try { await integ.connected({ serviceId: body.serviceId, authId: body.authId, name: body.name, icon: body.icon }); return json(res, 200, integ.publicState()); } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('GET', '/api/viasocket/apps/search', async (req, res, { query }) => {
  try { return json(res, 200, (await vs.searchApps(query.get('q') || '')).slice(0, 8)); } catch (e) { return json(res, 502, { error: e.message }); }
}, { admin: true });
route('POST', '/api/viasocket/sheets/options', async (req, res, { body }) => {
  try { return json(res, 200, await integ.sheetsOptions(body.field, body)); } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('POST', '/api/viasocket/sheets/choose', async (req, res, { body }) => {
  try { await integ.chooseSheet(body); return json(res, 200, integ.publicState()); } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('POST', '/api/viasocket/sheets/create', async (req, res, { body }) => {
  try { await integ.createOrderSheet(body.title); return json(res, 200, integ.publicState()); } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('POST', '/api/viasocket/razorpay/settings', async (req, res, { body }) => {
  try {
    if (body.link_type) integ.setLinkType(body.link_type);
    if (body.resubscribe) await integ.subscribeRazorpayPaid();
    return json(res, 200, integ.publicState());
  } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('POST', '/api/viasocket/flow', (req, res, { body }) => {
  if (body?.service_id && body?.flow?.id) integ.recordFlow(body.service_id, body.flow);
  return json(res, 200, { ok: true });
}, { admin: true });

// ---------- WhatsApp number (owner pastes Meta credentials) ----------
route('GET', '/api/whatsapp', (req, res) => {
  const c = waCreds();
  return json(res, 200, {
    connected: waLive(), display: c.display, phone_id: c.phoneId || '', has_app_secret: Boolean(c.appSecret),
    verify_token: c.verifyToken, webhook_url: `${config.publicUrl}/webhook/whatsapp`,
  });
}, { admin: true });
route('POST', '/api/whatsapp', async (req, res, { body }) => {
  try { return json(res, 200, { ok: true, display: await waSave(body) }); } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('POST', '/api/whatsapp/test', async (req, res, { body }) => {
  try { await waTest(body.to || store.get().shop.owner_phone); return json(res, 200, { ok: true }); } catch (e) { return json(res, 400, { error: e.message }); }
}, { admin: true });
route('POST', '/api/whatsapp/disconnect', (req, res) => { waClear(); return json(res, 200, { ok: true }); }, { admin: true });

// ---------- Embarko schedule: reminders, overdue-payment ladder, monthly report ----------
route('GET', '/tasks/tick', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEq(req.headers.authorization || '', `Bearer ${secret}`)) return json(res, 401, { error: 'unauthorized' });
  const before = store.get().messages.length;
  await scheduler.tick();
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  return res.end(`tick ok — ${store.get().messages.length - before} messages sent`);
});

// ---------- static ----------
function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '/app') pathname = '/app.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/healthz') return json(res, 200, { ok: true });
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        if (r.admin && config.onEmbarko && !config.adminToken) return json(res, 503, { error: 'Set the ADMIN_TOKEN env var — the dashboard stays locked until then' });
        if (r.admin && !adminOk(req)) return json(res, 401, { error: 'admin token required' });
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
        return await r.handler(req, res, { params, query: url.searchParams, body });
      }
      if (req.method === 'GET') return serveStatic(req, res, url.pathname);
      return json(res, 404, { error: 'not found' });
    } catch (e) {
      console.error('[http]', e);
      if (!res.headersSent) json(res, e.status || 500, { error: e.message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  store.load();
  // On Embarko the scheduler runs from embarko.json (GET /tasks/tick); elsewhere, in-process.
  if (!process.env.CRON_SECRET) scheduler.start();
  const server = createServer();
  server.listen(config.port, '0.0.0.0', () => {
    const m = modes();
    console.log(`Dukaan AI Manager on :${config.port} — WhatsApp ${m.whatsapp}, AI ${aiProvider()}`);
    console.log(`Dashboard: ${config.publicUrl}/   Webhook: ${config.publicUrl}/webhook/whatsapp`);
  });
  const shutdown = () => { store.flush(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
