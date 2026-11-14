// 📢 Herald - 7 PM daily alert (who did how much, who did not post an update) +
// 11:30 morning reminder. Goes to the lead as a DM; the channel reminder is switched on in Settings.
const { db, getSetting } = require('../db');
const slack = require('../slack');
const { logActivity, members, today, weekday, cfg, tzMod } = require('../util');
const { memberMetrics } = require('../metrics');
const { LABEL } = require('./tracker');

function prettyDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' });
}

// 7 PM: what changed today (outcomes and movement) first; volume only as a footnote.
// Missing updates are a gentle "no update yet", never a penalty.
function buildDaily(date) {
  const { valueMetrics, memberOutcomes } = require('../metrics');
  const v = valueMetrics(date, date);
  const people = memberOutcomes(date, date, v);
  const ms = members().filter((m) => m.role !== 'lead');
  const missing = [];
  const lines = [];
  for (const m of ms) {
    const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND date = ?').get(m.id, date) || {};
    const p = people.find((x) => x.id === m.id) || { outcomes: [], working_on: [], unblocked: [] };
    const miss = [];
    if (!log.morning_text) miss.push('morning');
    if (!log.evening_text) miss.push('evening');
    if (miss.length) missing.push({ m, miss });
    const moved = db.prepare(`SELECT r.title, e.status FROM request_events e JOIN client_requests r ON r.id = e.request_id
                              WHERE e.member_id = ? AND date(e.at, '${tzMod()}') = ? AND e.status != 'completed'`).all(m.id, date);
    const bits = [];
    if (p.outcomes.length) bits.push('shipped ' + p.outcomes.map((o) => `“${o.title}”`).join(', '));
    if (p.unblocked.length) bits.push('unblocked ' + p.unblocked.map((t) => `“${t}”`).join(', '));
    if (moved.length) bits.push(moved.map((x) => `${x.title.slice(0, 30)} → ${LABEL[x.status]}`).join(', '));
    if (!bits.length && p.working_on.length) bits.push('working on ' + p.working_on.map((w) => `“${w.title}”`).join(', '));
    lines.push(`• *${m.name}* — ${bits.join(' · ') || (log.summary || 'no update yet')}${miss.length === 2 ? ' _(no update yet)_' : ''}`);
  }
  const stuck = db.prepare(`SELECT title, stuck_reason FROM client_requests WHERE status = 'stuck' AND is_demo = 0 LIMIT 5`).all();
  const waiting = db.prepare(`SELECT COUNT(*) c FROM client_requests WHERE status = 'new' AND is_demo = 0`).get().c;
  let text = `📢 *SquadForge — Today (${prettyDate(date)})*`;
  text += v.delivered ? `\n\n✅ *Delivered today:*\n${v.outcomes.map((o) => `• ${o.title}${o.impact ? ' — ' + o.impact : ''}`).join('\n')}` : '\n\n✅ Nothing shipped today — that is fine; here is what moved.';
  text += `\n\n👥 *The team:*\n${lines.join('\n') || 'No members are set up.'}`;
  if (stuck.length) text += `\n\n🧱 *Waiting on something (context, not fault):*\n` + stuck.map((s) => `• ${s.title.slice(0, 50)} — ${(s.stuck_reason || '').slice(0, 80)}`).join('\n');
  if (waiting) text += `\n\n🧭 ${waiting} request(s) still need an owner.`;
  const t = require('../metrics').teamMetrics(date, date).totals;
  text += `\n\n_Detail: ${t.actions} actions · ${t.triggers} triggers · ${t.apps} apps published (volume, for context only)._`;
  return { text, missing };
}

async function deliverToLead(text) {
  const lead = cfg('LEAD_SLACK_USER_ID');
  if (!slack.enabled()) return 'Slack not configured — saved on the dashboard only';
  if (lead) { await slack.dm(lead, text); return 'Sent to the lead as a DM'; }
  await slack.post(cfg('ALERT_CHANNEL_ID') || cfg('SLACK_CHANNEL_ID'), text);
  return 'Posted in the channel (lead Slack user not set)';
}

async function evening(date = today()) {
  if (weekday(date) === 0 && !getSetting('herald.sunday', false)) return { message: 'Sunday — alert skipped' };
  const { text, missing } = buildDaily(date);
  db.prepare(`INSERT INTO reports (kind, period_start, period_end, content) VALUES ('daily', ?, ?, ?)`).run(date, date, text);
  const where = await deliverToLead(text);
  if (slack.enabled() && missing.length && getSetting('herald.channel_reminder', false)) {
    const tags = missing.map((x) => require('../util').tag(x.m)).join(' ');
    if (tags) await slack.post(cfg('SLACK_CHANNEL_ID'), `⏰ ${tags} today's update hasn't come in yet — please post it in the thread.`);
  }
  logActivity('herald', `7 PM alert: ${missing.length} member(s) missing an update. ${where}`);
  return { message: `7 PM alert sent (${missing.length} missing)`, text };
}

async function morning(date = today()) {
  if (weekday(date) === 0) return { message: 'Sunday — skipped' };
  const ms = members().filter((m) => m.role !== 'lead');
  const missing = ms.filter((m) => !(db.prepare('SELECT morning_text FROM daily_logs WHERE member_id = ? AND date = ?').get(m.id, date) || {}).morning_text);
  if (!missing.length) { logActivity('herald', 'Everyone posted their morning plan ✅'); return { message: 'Everyone posted their morning plan' }; }
  const text = `🌅 *Morning plan not posted yet:* ${missing.map((m) => m.name).join(', ')}`;
  await deliverToLead(text);
  if (slack.enabled() && getSetting('herald.channel_reminder', false)) {
    const tags = missing.map((m) => require('../util').tag(m)).join(' ');
    if (tags) await slack.post(cfg('SLACK_CHANNEL_ID'), `🌅 ${tags} good morning! Please post today's plan in the thread.`);
  }
  logActivity('herald', text.replace(/\*/g, ''));
  return { message: `${missing.length} member(s) missing a morning plan` };
}

module.exports = { evening, morning, buildDaily };
