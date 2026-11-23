// History: everything that changed in a workspace, newest first.
// Built from what the agents already store (request status changes, reviews, growth posts,
// reports, Commander messages, agent activity) plus an audit log of changes people make in the app.
const { db, addSchema, getSetting } = require('./db');

addSchema(`CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,
  actor TEXT,
  text TEXT NOT NULL,
  ref TEXT
)`);

// d: a workspace db handle (writes can happen after the request's async context ended)
function record(d, kind, actor, text, ref = null) {
  try { d.prepare('INSERT INTO audit_log (kind, actor, text, ref) VALUES (?, ?, ?, ?)').run(kind, actor || null, String(text).slice(0, 400), ref); }
  catch (e) { console.error('[history]', e.message); }
}

const iso = (s) => (!s ? null : s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
const STATUS = { new: 'came in', rnd: 'moved to R&D', started: 'moved to Started', stuck: 'is Stuck', completed: 'was Completed' };
const GROWTH = { support_request: 'support request', app_listing: 'app listing', blog: 'blog', newsletter: 'newsletter', credentials: 'credentials / docs', other: 'update' };
const REPORT = { daily: '7 PM daily alert sent', weekly: 'Weekly team report written', personal: 'Personal weekly reports written' };

function list({ days = 7, kind = 'all', limit = 400 } = {}) {
  const since = new Date(Date.now() - Math.min(90, Math.max(1, days)) * 864e5).toISOString();
  const W = (col) => `datetime(${col}) >= datetime(@since)`;
  const out = [];
  const want = (k) => kind === 'all' || kind === k;
  const name = (id) => { const m = id && db.prepare('SELECT name FROM members WHERE id = ?').get(id); return m ? m.name : null; };

  const byHand = new Set(db.prepare(`SELECT ref, at FROM audit_log WHERE ref LIKE 'status:%' AND ${W('at')}`).all({ since }).map((a) => a.ref.slice(7) + '|' + iso(a.at).slice(0, 16)));
  if (want('requests')) {
    for (const e of db.prepare(`SELECT e.*, r.title, r.is_demo FROM request_events e JOIN client_requests r ON r.id = e.request_id WHERE ${W('e.at')} ORDER BY e.at DESC LIMIT 300`).all({ since })) {
      out.push({ at: iso(e.at), kind: 'requests', icon: { new: '📨', rnd: '🔎', started: '🔨', stuck: '🧱', completed: '✅' }[e.status] || '•',
        text: `“${e.title}” ${STATUS[e.status] || e.status}`, detail: e.status === 'stuck' && e.reason ? e.reason : null,
        actor: name(e.member_id), demo: !!e.is_demo, ref: 'request:' + e.request_id, skip: !e.member_id && byHand.has(e.request_id + '|' + iso(e.at).slice(0, 16)), tone: e.status === 'stuck' ? 'warn' : e.status === 'completed' ? 'ok' : null });
    }
  }
  if (want('reviews')) {
    for (const r of db.prepare(`SELECT * FROM reviews WHERE status = 'done' AND ${W('date')} ORDER BY date DESC LIMIT 200`).all({ since })) {
      out.push({ at: r.date.length === 10 ? new Date(r.date + 'T00:00:00+05:30').toISOString() : iso(r.date), kind: 'reviews', icon: r.passed ? '🏅' : '🔍',
        text: `Inspector reviewed “${r.subject || 'a submission'}”${r.passed ? ' — passed' : ` — ${r.errors_count} fix${r.errors_count === 1 ? '' : 'es'} asked`}`,
        detail: r.summary || null, actor: name(r.member_id), demo: !!r.is_demo, tone: r.passed ? 'ok' : null, dateOnly: r.date.length === 10 });
    }
  }
  if (want('growth')) {
    for (const g of db.prepare(`SELECT * FROM growth_items WHERE ${W('date')} ORDER BY date DESC LIMIT 200`).all({ since })) {
      out.push({ at: new Date(g.date + 'T00:00:00+05:30').toISOString(), kind: 'growth', icon: '🌱', text: `Posted a ${GROWTH[g.kind] || g.kind}${g.app_name ? ' — ' + g.app_name : ''}`,
        detail: g.text ? g.text.slice(0, 200) : null, actor: name(g.member_id), demo: !!g.is_demo, dateOnly: true });
    }
  }
  if (want('alerts')) {
    for (const r of db.prepare(`SELECT id, kind, period_start, period_end, created_at FROM reports WHERE ${W('created_at')} ORDER BY created_at DESC LIMIT 100`).all({ since })) {
      out.push({ at: iso(r.created_at), kind: 'alerts', icon: r.kind === 'daily' ? '📢' : '📜', text: REPORT[r.kind] || `${r.kind} report`, detail: r.period_start && r.period_end && r.period_start !== r.period_end ? `${r.period_start} → ${r.period_end}` : null, actor: r.kind === 'daily' ? 'Herald' : 'Scribe', ref: 'report:' + r.id });
    }
    for (const b of db.prepare(`SELECT * FROM broadcasts WHERE ${W('created_at')} ORDER BY created_at DESC LIMIT 100`).all({ since })) {
      out.push({ at: iso(b.created_at), kind: 'alerts', icon: '⚔️', text: `Commander message sent${b.important ? ' with an M91 alert' : ''}`, detail: b.message.slice(0, 240), actor: 'Commander' });
    }
  }
  for (const a of db.prepare(`SELECT * FROM audit_log WHERE ${W('at')} ${kind === 'all' ? '' : 'AND kind = @kind'} ORDER BY at DESC LIMIT 300`).all({ since, kind })) {
    out.push({ at: iso(a.at), kind: a.kind, detail: null, icon: { requests: '✏️', members: '👥', settings: '⚙️', integrations: '🔌', alerts: '📣', agents: '▶️', reviews: '🔍' }[a.kind] || '•', text: a.text, actor: a.actor, ref: a.ref && a.ref.startsWith('status:') ? 'request:' + a.ref.slice(7) : a.ref, tone: a.ref && a.ref.startsWith('status:') && /Stuck/.test(a.text) ? 'warn' : null });
  }
  if (want('agents')) {
    // agent chatter only in the Agents filter; problems show everywhere
    const rows = kind === 'agents'
      ? db.prepare(`SELECT * FROM activity WHERE ${W('created_at')} ORDER BY id DESC LIMIT 300`).all({ since })
      : db.prepare(`SELECT * FROM activity WHERE level = 'error' AND ${W('created_at')} ORDER BY id DESC LIMIT 50`).all({ since });
    const NAMES = { scout: 'Scout', tracker: 'Tracker', growth: 'Sprout', inspector: 'Inspector', analyst: 'Analyst', herald: 'Herald', scribe: 'Scribe', commander: 'Commander' };
    for (const a of rows) out.push({ at: iso(a.created_at), kind: 'agents', icon: a.level === 'error' ? '⚠️' : '🤖', text: a.message, actor: NAMES[a.agent] || a.agent, tone: a.level === 'error' ? 'warn' : null });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : -1));
  return out.filter((x) => !x.skip).slice(0, limit);
}

module.exports = { record, list };
