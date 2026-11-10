// 📢 Herald - 7 PM daily alert (kisne kitna kiya, kisne update nahi daala) +
// 11:30 subah ka reminder. Lead ko DM jaata hai; channel reminder Settings se on hota hai.
const { db, getSetting } = require('../db');
const slack = require('../slack');
const { logActivity, members, today, weekday, cfg } = require('../util');
const { memberMetrics } = require('../metrics');
const { LABEL } = require('./tracker');

function prettyDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' });
}

function buildDaily(date) {
  const ms = members().filter((m) => m.role !== 'lead');
  const lines = [];
  const missing = [];
  for (const m of ms) {
    const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND date = ?').get(m.id, date) || {};
    const mm = memberMetrics(m, date, date);
    const miss = [];
    if (!log.morning_text) miss.push('subah');
    if (!log.evening_text) miss.push('shaam');
    if (miss.length) missing.push({ m, miss });
    const bits = [];
    if (m.role === 'growth') {
      const g = Object.entries(mm.growth).map(([k, v]) => `${v} ${k.replace('_', ' ')}`);
      if (g.length) bits.push(g.join(' · '));
      if (mm.unblocked) bits.push(`${mm.unblocked} unblock`);
    } else {
      bits.push(`${mm.actions} actions · ${mm.triggers} triggers${mm.apps ? ' · ' + mm.apps + ' apps' : ''}`);
      if (log.planned_count) bits.push(`plan ${log.done_count || 0}/${log.planned_count}`);
    }
    const moved = db.prepare(`SELECT r.title, e.status FROM request_events e JOIN client_requests r ON r.id = e.request_id
                              WHERE e.member_id = ? AND date(e.at) = ?`).all(m.id, date);
    if (moved.length) bits.push('req: ' + moved.map((x) => `${x.title.slice(0, 30)} → ${LABEL[x.status]}`).join(', '));
    const icon = miss.length === 2 ? '❌' : miss.length ? '⚠️' : '✅';
    lines.push(`${icon} *${m.name}* — ${bits.join(' | ') || 'kuch record nahi hua'}${miss.length ? ` _(${miss.join(' + ')} update missing)_` : ''}`);
  }
  const open = db.prepare(`SELECT status, COUNT(*) c FROM client_requests WHERE status != 'completed' AND is_demo = 0 GROUP BY status`).all();
  const stuck = db.prepare(`SELECT title, stuck_reason FROM client_requests WHERE status = 'stuck' AND is_demo = 0 LIMIT 5`).all();
  let text = `📢 *SquadForge — Aaj ka report (${prettyDate(date)})*\n\n${lines.join('\n') || 'Koi member configure nahi hai.'}`;
  if (open.length) text += `\n\n📜 *Open client requests:* ${open.map((o) => `${LABEL[o.status]} ${o.c}`).join(' · ')}`;
  if (stuck.length) text += '\n' + stuck.map((s) => `   🧱 ${s.title.slice(0, 50)} — ${(s.stuck_reason || '').slice(0, 80)}`).join('\n');
  return { text, missing };
}

async function deliverToLead(text) {
  const lead = cfg('LEAD_SLACK_USER_ID');
  if (!slack.enabled()) return 'Slack configure nahi — sirf dashboard pe save hua';
  if (lead) { await slack.dm(lead, text); return 'Lead ko DM bheja'; }
  await slack.post(cfg('ALERT_CHANNEL_ID') || cfg('SLACK_CHANNEL_ID'), text);
  return 'Channel mein post kiya (LEAD_SLACK_USER_ID set nahi)';
}

async function evening(date = today()) {
  if (weekday(date) === 0 && !getSetting('herald.sunday', false)) return { message: 'Sunday — alert skip' };
  const { text, missing } = buildDaily(date);
  db.prepare(`INSERT INTO reports (kind, period_start, period_end, content) VALUES ('daily', ?, ?, ?)`).run(date, date, text);
  const where = await deliverToLead(text);
  if (slack.enabled() && missing.length && getSetting('herald.channel_reminder', false)) {
    const tags = missing.filter((x) => x.m.slack_user_id).map((x) => `<@${x.m.slack_user_id}>`).join(' ');
    if (tags) await slack.post(cfg('SLACK_CHANNEL_ID'), `⏰ ${tags} aaj ka update abhi tak nahi aaya — thread mein daal do please.`);
  }
  logActivity('herald', `7 PM alert: ${missing.length} logon ka update missing. ${where}`);
  return { message: `7 PM alert bheja (${missing.length} missing)`, text };
}

async function morning(date = today()) {
  if (weekday(date) === 0) return { message: 'Sunday — skip' };
  const ms = members().filter((m) => m.role !== 'lead');
  const missing = ms.filter((m) => !(db.prepare('SELECT morning_text FROM daily_logs WHERE member_id = ? AND date = ?').get(m.id, date) || {}).morning_text);
  if (!missing.length) { logActivity('herald', 'Subah ka plan sabne daal diya ✅'); return { message: 'Sabka subah ka plan aa gaya' }; }
  const text = `🌅 *Subah ka plan abhi tak nahi aaya:* ${missing.map((m) => m.name).join(', ')}`;
  await deliverToLead(text);
  if (slack.enabled() && getSetting('herald.channel_reminder', false)) {
    const tags = missing.filter((m) => m.slack_user_id).map((m) => `<@${m.slack_user_id}>`).join(' ');
    if (tags) await slack.post(cfg('SLACK_CHANNEL_ID'), `🌅 ${tags} good morning! Aaj ka plan thread mein daal do.`);
  }
  logActivity('herald', text.replace(/\*/g, ''));
  return { message: `${missing.length} logon ka subah ka plan missing` };
}

module.exports = { evening, morning, buildDaily };
