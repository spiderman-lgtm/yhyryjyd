// Small helpers: IST dates, config, activity log, agent status.
const { db, getSetting } = require('./db');

const TZ = process.env.TEAM_TIMEZONE || 'Asia/Kolkata';

function dateInTz(d = new Date()) {
  // YYYY-MM-DD in team timezone
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function today() { return dateInTz(new Date()); }
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
function cfg(key, fallback = null) {
  const env = process.env[key];
  if (env !== undefined && env !== '') return env;
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
  if (running.has(agent)) return { skipped: true, reason: 'already running' };
  running.add(agent);
  setAgent(agent, 'working', label);
  try {
    const result = await fn();
    setAgent(agent, 'idle', (result && result.message) || 'Kaam ho gaya');
    return result;
  } catch (err) {
    console.error(err);
    setAgent(agent, 'error', String(err.message || err).slice(0, 200));
    logActivity(agent, 'Error: ' + String(err.message || err).slice(0, 300), 'error');
    return { error: String(err.message || err) };
  } finally {
    running.delete(agent);
  }
}

function members({ includeInactive = false } = {}) {
  return db.prepare(`SELECT * FROM members ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY role, name`).all();
}
function memberBySlack(id) {
  return id ? db.prepare('SELECT * FROM members WHERE slack_user_id = ?').get(id) : null;
}
function memberById(id) { return db.prepare('SELECT * FROM members WHERE id = ?').get(id); }

module.exports = {
  TZ, today, addDays, weekday, weekStart, tsToDate, tsToIso, hoursBetween, dateInTz,
  cfg, list, logActivity, setAgent, runAgent, members, memberBySlack, memberById,
};
