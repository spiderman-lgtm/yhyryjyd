// WhatsApp Cloud API gateway. Demo mode (no token) only records the message so the
// dashboard simulator can show it.
import { config } from './config.js';
import crypto from 'node:crypto';
import { get, save, logMessage, normPhone, TEST_PHONE } from './store.js';

// Credentials come from the dashboard (saved server-side in the data file) or env vars.
export function creds() {
  const d = get();
  d.integrations ||= { apps: {} };
  const w = d.integrations.whatsapp || {};
  if (!process.env.WHATSAPP_VERIFY_TOKEN && !d.integrations.wa_verify_token) {
    d.integrations.wa_verify_token = `dukaan-${crypto.randomBytes(9).toString('base64url')}`;
    save();
  }
  return {
    token: w.token || config.whatsapp.token,
    phoneId: w.phone_id || config.whatsapp.phoneId,
    appSecret: w.app_secret || process.env.WHATSAPP_APP_SECRET || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || d.integrations.wa_verify_token,
    apiVersion: config.whatsapp.apiVersion,
    display: w.display || null,
  };
}
export const live = () => { const c = creds(); return Boolean(c.token && c.phoneId); };

async function graph(path, token, init = {}) {
  const res = await fetch(`https://graph.facebook.com/${creds().apiVersion}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `WhatsApp ${res.status}`);
  return j;
}

/** Owner pastes Meta credentials in the dashboard; we verify them before saving. */
export async function saveCreds({ phone_id, token, app_secret }) {
  phone_id = String(phone_id || '').trim(); token = String(token || '').trim();
  if (!phone_id || !token) throw new Error('Both phone number ID and access token are required');
  const info = await graph(`${phone_id}?fields=display_phone_number,verified_name,quality_rating`, token);
  const d = get();
  d.integrations.whatsapp = {
    phone_id, token, app_secret: String(app_secret || '').trim() || d.integrations.whatsapp?.app_secret || '',
    display: { phone: info.display_phone_number, name: info.verified_name, quality: info.quality_rating },
    saved_at: new Date().toISOString(),
  };
  save();
  return d.integrations.whatsapp.display;
}

export function clearCreds() { const d = get(); delete d.integrations.whatsapp; save(); }

/** hello_world is a template new WhatsApp Business accounts get pre-approved, so it reaches a number that never messaged us. */
export async function sendTest(to) {
  const c = creds();
  if (!live()) throw new Error('WhatsApp is not connected');
  return graph(`${c.phoneId}/messages`, c.token, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', to: normPhone(to), type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }),
  });
}

async function post(body) {
  const { apiVersion, phoneId, token } = creds();
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sendText(to, text, meta = {}) {
  to = normPhone(to);
  if (!to) return { skipped: 'no phone number', text };
  const msg = logMessage(to, 'out', text, meta);
  // The dashboard test chat is not a real number: record only.
  if (live() && to !== TEST_PHONE) {
    try {
      const r = await post({ to, type: 'text', text: { body: text, preview_url: true } });
      msg.wa_id = r.messages?.[0]?.id;
    } catch (e) {
      msg.error = e.message;
      console.error('[whatsapp] send failed', e.message);
    }
  }
  return msg;
}

// Business-initiated messages outside the 24h window must be approved templates.
// `fallbackText` is what we record (and send in demo mode).
export async function sendTemplate(to, name, params, fallbackText, meta = {}) {
  to = normPhone(to);
  const msg = logMessage(to, 'out', fallbackText, { template: name, ...meta });
  if (live() && to !== TEST_PHONE) {
    try {
      await post({
        to, type: 'template',
        template: {
          name, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }],
        },
      });
    } catch (e) {
      msg.error = e.message;
      console.error('[whatsapp] template failed', e.message);
    }
  }
  return msg;
}

// Pull plain inbound messages out of a Cloud API webhook payload.
export function parseWebhook(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        let text = '';
        if (m.type === 'text') text = m.text?.body || '';
        else if (m.type === 'button') text = m.button?.text || '';
        else if (m.type === 'interactive') text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
        else text = `[${m.type}]`;
        out.push({ from: m.from, name: names[m.from] || '', text, id: m.id });
      }
    }
  }
  return out;
}
