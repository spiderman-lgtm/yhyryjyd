// WhatsApp Cloud API gateway. Demo mode (no token) only records the message so the
// dashboard simulator can show it.
import { config } from './config.js';
import { logMessage, normPhone } from './store.js';

const live = () => Boolean(config.whatsapp.token && config.whatsapp.phoneId);

async function post(body) {
  const { apiVersion, phoneId, token } = config.whatsapp;
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
  const msg = logMessage(to, 'out', text, meta);
  if (live()) {
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
  if (live()) {
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
