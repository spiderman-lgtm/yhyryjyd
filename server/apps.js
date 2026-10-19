// Connecting an app the analyzer approved. Only GO verdicts connect unless the owner
// overrides from the dashboard.
import { get, save } from './store.js';
import { triggerFlow } from './viasocket.js';
import { now } from './time.js';
import * as vs from './vs.js';
import { config } from './config.js';

export async function connectApp(result, { force = false } = {}) {
  if (!result?.app) return { ok: false, error: 'app missing' };
  if (result.verdict !== 'GO' && !force) return { ok: false, error: `verdict ${result.verdict} — sirf GO connect hota hai` };
  const d = get();
  if (d.connected_apps.some((a) => a.name.toLowerCase() === result.app.toLowerCase())) return { ok: true, already: true };
  const flow = await triggerFlow('connect_new_app', {
    app: result.app,
    shop: d.shop.name,
    use_cases: (result.use_cases || []).map((u) => ({ trigger: u.trigger, action: u.action, result: u.result })),
  });
  if (!flow.ok) return { ok: false, error: flow.error };
  // With viaSocket set up, the owner finishes the connection in the browser (Connect popup);
  // the entry stays pending until integrations.connected() sees the auth_id.
  const pending = vs.configured();
  d.connected_apps.push({
    name: result.app, verdict: result.verdict, score: result.score, forced: force && result.verdict !== 'GO',
    use_cases: result.use_cases, added_at: now().toISOString(), pending_connect: pending,
  });
  save();
  return { ok: true, pending_connect: pending, auth_url: pending ? `${config.publicUrl}/app#apps` : flow.result?.auth_url || '' };
}

export function disconnectApp(name) {
  const d = get();
  const core = ['whatsapp business'];
  if (core.includes(name.toLowerCase())) return { ok: false, error: 'core app' };
  d.connected_apps = d.connected_apps.filter((a) => a.name.toLowerCase() !== name.toLowerCase());
  save();
  return { ok: true };
}
