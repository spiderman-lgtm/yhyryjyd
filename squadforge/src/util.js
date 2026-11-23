// Small helpers: IST dates, config, activity log, agent status.
const { db, getSetting } = require('./db');

const TZ = process.env.TEAM_TIMEZONE || 'Asia/Kolkata';

function dateInTz(d = new Date()) {
  // YYYY-MM-DD in team timezone
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function today() { return dateInTz(new Date()); }
// SQLite modifier that shifts a UTC timestamp into the team timezone, e.g. date(col, '+330 minutes')
function tzMod() {
  const d = new Date(), local = new Date(d.toLocaleString('en-US', { timeZone: TZ })), utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const min = Math.round((local - utc) / 60000);
  return `${min >= 0 ? '+' : ''}${min} minutes`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(dateStr) { return new Date(dateStr + 'T12:00:00Z').getUTCDay(); } // 0=Sun
// Monday of the week containing dateStr
function weekStart(dateStr) {
  const wd = weekday(dateStr);
  return addDays(dateStr, wd === 0 ? -6 : 1 - wd);
}
function tsToDate(ts) { return dateInTz(new Date(parseFloat(ts) * 1000)); }
function tsToIso(ts) { return new Date(parseFloat(ts) * 1000).toISOString(); }
function hoursBetween(a, b) {
  if (!a || !b) return null;
  return Math.max(0, (new Date(b) - new Date(a)) / 36e5);
}

// Config: env var wins, then dashboard setting, then default.
// Slack via viaSocket connection: channel and "me" are chosen once on the Integrations page.
const VS_FALLBACK = { SLACK_CHANNEL_ID: 'channel_id', LEAD_SLACK_USER_ID: 'me_id' };
const WS_SCOPED = new Set(['SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID', 'LEAD_SLACK_USER_ID', 'ALERT_CHANNEL_ID', 'SLACK_WORKSPACE_URL']);
function cfg(key, fallback = null) {
  const env = process.env[key];
  const ws1 = require('./db').currentWorkspace() === 1;
  if (env !== undefined && env !== '' && (ws1 || !WS_SCOPED.has(key))) return env;
  if (VS_FALLBACK[key]) {
    const vs = require('./viasocket'); // lazy: avoids a require cycle
    const v = vs.connected('slack') ? vs.settings('slack')[VS_FALLBACK[key]] : null;
    if (v) return v;
  }
  const s = getSetting('cfg.' + key);
  return s !== null && s !== '' ? s : fallback;
}
function list(key, fallback) {
  const v = cfg(key, null);
  if (!v) return fallback;
  return String(v).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function logActivity(agent, message, level = 'info') {
  db.prepare('INSERT INTO activity (agent, message, level) VALUES (?, ?, ?)').run(agent, message, level);
  db.prepare('DELETE FROM activity WHERE id < (SELECT MAX(id) - 2000 FROM activity)').run();
  console.log(`[${agent}] ${message}`);
}

function setAgent(agent, state, message) {
  db.prepare(`INSERT INTO agent_status (agent, state, message, last_run_at, updated_at)
              VALUES (?, ?, ?, CASE WHEN ? = 'idle' THEN datetime('now') END, datetime('now'))
              ON CONFLICT(agent) DO UPDATE SET state = excluded.state, message = excluded.message,
                last_run_at = COALESCE(excluded.last_run_at, agent_status.last_run_at), updated_at = excluded.updated_at`)
    .run(agent, state, message || null, state);
}

// Wrap an agent run: status bubble + activity + error capture. One run at a time per agent.
const running = new Set();
async function runAgent(agent, label, fn) {
  const key = require('./db').currentWorkspace() + ':' + agent; // one run per agent per workspace
  if (running.has(key)) return { skipped: true, reason: 'already running' };
  running.add(key);
  setAgent(agent, 'working', label);
  try {
    const result = await fn();
    if (result && result.error) { setAgent(agent, 'error', String(result.error).slice(0, 200)); trackFailure(agent, result.error); }
    else { setAgent(agent, 'idle', (result && result.message) || 'Done'); trackSuccess(agent); }
    return result;
  } catch (err) {
    console.error(err);
    setAgent(agent, 'error', String(err.message || err).slice(0, 200));
    logActivity(agent, 'Error: ' + String(err.message || err).slice(0, 300), 'error');
    trackFailure(agent, err.message || err);
    return { error: String(err.message || err) };
  } finally {
    running.delete(key);
  }
}

// Two failures in a row → tell the lead (Slack DM + M91), at most once every 6 hours per agent.
const AGENT_NAMES = { scout: 'Scout (reads Slack)', herald: 'Herald (alerts)', scribe: 'Scribe (weekly report)', inspector: 'Inspector (reviews)', analyst: 'Analyst', commander: 'Commander', tracker: 'Tracker', growth: 'Sprout' };
function trackSuccess(agent) { const { setSetting } = require('./db'); if (getSetting('health.fail.' + agent, null)) setSetting('health.fail.' + agent, null); }
function trackFailure(agent, error) {
  const { setSetting } = require('./db');
  const cur = getSetting('health.fail.' + agent, null) || { count: 0 };
  const next = { count: (cur.count || 0) + 1, error: String(error).slice(0, 300), at: new Date().toISOString() };
  setSetting('health.fail.' + agent, next);
  const last = Number(getSetting('health.alerted.' + agent, 0)) || 0;
  if (next.count < 2 || Date.now() - last < 6 * 3600 * 1000) return;
  setSetting('health.alerted.' + agent, Date.now());
  const title = `${AGENT_NAMES[agent] || agent} is failing`;
  const text = `⚠️ *${title}* — ${next.count} times in a row.\nLast error: ${next.error}\nOpen SquadForge → Settings → System health.`;
  setImmediate(async () => {
    try { const lead = cfg('LEAD_SLACK_USER_ID'); const slack = require('./slack'); if (lead && slack.enabled() && agent !== 'scout') await slack.dm(lead, text); } catch { /* Slack may be the thing that is down */ }
    // M91 to the admin only: the private admin channel (M91_ADMIN_LINK), else the lead's own phone via viaSocket.
    // Never the team channel — that would ring everyone.
    try {
      const m91 = require('./m91'), vs = require('./viasocket');
      if (m91.hasAdminLink()) {
        await m91.channelAlert({ admin: true, title: `SquadForge: ${title}`, description: `Failed ${next.count} times in a row.\nLast error: ${next.error}\nOpen SquadForge → Settings → System health.`, severity: 'MEDIUM', customId: 'health-' + agent,
          responseOptions: [{ label: "I'll look at it", effect: 'SHARED' }, { label: 'Seen', effect: 'PERSONAL' }] });
        return logActivity(agent, `Told the admin on M91: ${title}`, 'warn');
      }
      const leadM = db.prepare("SELECT phone FROM members WHERE role = 'lead' AND active = 1 AND phone IS NOT NULL LIMIT 1").get();
      if (vs.connected('m91') && leadM) return await m91.sendAlert({ phone: leadM.phone, title, description: `Failed ${next.count} times in a row. Last error: ${next.error}`, severity: 'Low', customId: 'health-' + agent });
    } catch { /* ignore */ }
    logActivity(agent, `Told the lead: ${title}`, 'warn');
  });
}

// <@U…> for real Slack users; test teammates and demo people (SIM_…, DEMO…) are written as plain names
function tag(m) { return m && /^[UW][A-Z0-9]{6,}$/.test(m.slack_user_id || '') ? `<@${m.slack_user_id}>` : (m ? `*${String(m.name || '').replace(/\s*\((test|demo)\)$/, '')}*` : ''); }

function members({ includeInactive = false } = {}) {
  return db.prepare(`SELECT * FROM members ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY role, name`).all();
}
function memberBySlack(id) {
  return id ? db.prepare('SELECT * FROM members WHERE slack_user_id = ?').get(id) : null;
}
function memberById(id) { return db.prepare('SELECT * FROM members WHERE id = ?').get(id); }

function failing() {
  return db.prepare("SELECT key, value FROM settings WHERE key LIKE 'health.fail.%'").all()
    .map((r) => { try { return { agent: r.key.slice(12), ...JSON.parse(r.value) }; } catch { return null; } })
    .filter((x) => x && x.count >= 2);
}
module.exports = { tag, failing, AGENT_NAMES,
  TZ, today, tzMod, addDays, weekday, weekStart, tsToDate, tsToIso, hoursBetween, dateInTz,
  cfg, list, logActivity, setAgent, runAgent, members, memberBySlack, memberById,
};
