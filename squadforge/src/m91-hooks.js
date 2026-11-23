// M91 callbacks: who answered an alert ("Got it 👍" / "I have a question"). M91 signs callbacks but does
// not expose the secret yet, so the URL carries our own HMAC token and every answer is read back from M91
// (GET <link>/alerts/<id>) before it is stored.
const crypto = require('crypto');
const { db, addSchema, currentWorkspace } = require('./db');
const m91 = require('./m91');

addSchema(`CREATE TABLE IF NOT EXISTS m91_answers (
  key TEXT PRIMARY KEY, alert_id TEXT, custom_id TEXT, name TEXT, label TEXT, effect TEXT, note TEXT, at TEXT
)`);

const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.CRON_SECRET || 'squadforge';
const tokenFor = (ws) => crypto.createHmac('sha256', secret()).update('m91:' + ws).digest('hex').slice(0, 32);
function callbackUrl() {
  const base = (process.env.APP_URL || 'https://squadforge.embarko.app').replace(/\/$/, '');
  const ws = currentWorkspace();
  return `${base}/webhooks/m91?ws=${ws}&k=${tokenFor(ws)}`;
}
function validToken(ws, k) {
  const good = tokenFor(ws);
  return typeof k === 'string' && k.length === good.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(good));
}

// body: the M91 callback. Stores answers confirmed by reading the alert back.
async function handle(body) {
  const id = body && body.alert && (body.alert.id || body.alert._id);
  if (!id) return { ok: true, ignored: 'no alert id' };
  const known = db.prepare('SELECT id FROM broadcasts WHERE m91_alert = ? OR m91_alert = ?').get(String(id), String(body.alert.customId || ''));
  if (!known) return { ok: true, ignored: 'not ours' };
  let confirmed = true;
  try { await m91.linkStatus(id); } catch { confirmed = false; }
  if (!confirmed) return { ok: false, error: 'could not confirm with M91' };
  if (body.event === 'answered' && body.response) {
    const r = body.response;
    db.prepare(`INSERT OR IGNORE INTO m91_answers (key, alert_id, custom_id, name, label, effect, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(String(body.idempotencyKey || `${id}-${r.by && r.by.id}`), String(id), body.alert.customId || null, (r.by && r.by.name) || 'Someone', r.label || '', r.effect || '', r.note || null, r.at || body.at || new Date().toISOString());
    require('./util').logActivity('commander', `📱 ${(r.by && r.by.name) || 'Someone'} answered the M91 alert: ${r.label}${r.note ? ' — ' + String(r.note).slice(0, 80) : ''}`);
  }
  return { ok: true };
}

function answersFor(alertId) {
  return alertId ? db.prepare('SELECT name, label, note, at FROM m91_answers WHERE alert_id = ? OR custom_id = ? ORDER BY at').all(String(alertId), String(alertId)) : [];
}

module.exports = { callbackUrl, validToken, handle, answersFor };
