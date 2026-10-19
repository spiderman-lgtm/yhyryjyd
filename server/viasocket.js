// viaSocket embed = the hands. Every external action is a POST to that flow's webhook
// URL (set via VIASOCKET_FLOW_<NAME>). Without a URL the flow runs a local demo
// stand-in so the whole order → payment → reminder loop works before setup.
import { config } from './config.js';
import { get, save } from './store.js';

const demo = {
  save_order: (p) => ({ row_id: `demo-row-${p.order_id}` }),
  update_order: () => ({ ok: true }),
  create_payment_link: (p) => ({ id: `plink_demo_${p.order_id}`, url: `${config.publicUrl}/pay/${p.order_id}` }),
  send_reminder: () => ({ ok: true, delivered_by: 'dukaan-demo' }),
  escalate_to_owner: () => ({ ok: true, delivered_by: 'dukaan-demo' }),
  monthly_report: () => ({ ok: true, delivered_by: 'dukaan-demo' }),
  connect_new_app: (p) => ({ ok: true, auth_url: `${config.publicUrl}/app#apps`, app: p.app }),
};

export const isLive = (name) => Boolean(config.viasocket.flows[name]);

export async function triggerFlow(name, payload) {
  const url = config.viasocket.flows[name];
  const entry = { flow: name, mode: url ? 'live' : 'demo', payload, at: new Date().toISOString() };
  try {
    if (url) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: name, ...payload }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`viaSocket ${name} ${res.status}: ${text.slice(0, 200)}`);
      try { entry.result = JSON.parse(text); } catch { entry.result = { raw: text }; }
    } else {
      entry.result = (demo[name] || (() => ({ ok: true })))(payload);
    }
    entry.ok = true;
  } catch (e) {
    entry.ok = false;
    entry.error = e.message;
    console.error('[viasocket]', e.message);
  }
  const d = get();
  d.flow_log.push(entry);
  if (d.flow_log.length > 1000) d.flow_log.splice(0, d.flow_log.length - 1000);
  save();
  return entry;
}
