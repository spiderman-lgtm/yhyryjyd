// 📜 Scribe - every Monday: last week's (Mon-Sun) team report + the lead's personal report.
const { db } = require('../db');
const llm = require('../llm');
const slack = require('../slack');
const vs = require('../viasocket');
const { logActivity, today, addDays, weekStart, hoursBetween, memberById, cfg, tzMod } = require('../util');
const { teamMetrics } = require('../metrics');
const { LABEL } = require('./tracker');
const { KIND_LABEL } = require('./growth');

function lastWeek(ref = today()) {
  const from = addDays(weekStart(ref), -7);
  return { from, to: addDays(from, 6) };
}

function requestRows(from, to) {
  return db.prepare(`SELECT * FROM client_requests WHERE date(created_at, '${tzMod()}') BETWEEN ? AND ?
                     OR (date(completed_at, '${tzMod()}') BETWEEN ? AND ?) ORDER BY created_at`).all(from, to, from, to)
    .map((r) => {
      const names = JSON.parse(r.assigned_member_ids || '[]').map((id) => (memberById(id) || {}).name).filter(Boolean);
      const h = hoursBetween(r.started_at || r.rnd_at || r.created_at, r.completed_at);
      return { title: r.title, status: LABEL[r.status], assignees: names.join(', ') || '-', hours: h !== null ? +h.toFixed(1) : null, difficulty: r.difficulty, stuck_reason: r.stuck_reason };
    });
}

function fmt(v, suffix = '') { return v === null || v === undefined ? '-' : v + suffix; }

// Weekly report: value first (outcomes, time to value, quality, blockers), people by what they
// delivered, contributions with reasons. Volume only as context at the end.
function buildTeamReport(t, reqs) {
  const { valueMetrics, memberOutcomes } = require('../metrics');
  const v = valueMetrics(t.from, t.to), people = memberOutcomes(t.from, t.to, v);
  const L = [];
  L.push(`📜 *SquadForge — Weekly report (${t.from} → ${t.to})*`, '_We measure the value of work, not the number of tasks._', '');
  L.push('*Value delivered*');
  L.push(`• Outcomes delivered: *${v.delivered}* (${v.verified} verified)`);
  L.push(`• Time to value: *${fmt(v.time_to_value_h, 'h')}* median from request to live${v.stuck_share_pct !== null ? ` · ${v.stuck_share_pct}% of that time was spent blocked` : ''}`);
  L.push(`• First-pass quality: *${fmt(v.first_pass_pct, '%')}*${v.first_pass_n ? ` of ${v.first_pass_n} first reviews` : ''}`);
  L.push(`• Blockers cleared: *${v.blockers_cleared}* · Requests still waiting for an owner: ${v.waiting_on_us}`);
  if (v.outcomes.length) {
    L.push('', '*What changed*');
    for (const o of v.outcomes.slice(0, 10)) L.push(`• ${o.verified ? '🏅' : '✅'} ${o.title}${o.impact ? ' — ' + o.impact : ''}${o.evidence ? ` (<${o.evidence}|evidence>)` : ''}`);
  }
  L.push('', '*The team* (A–Z, not a ranking)');
  for (const p of people) {
    const bits = [];
    bits.push(p.outcomes.length ? 'delivered ' + p.outcomes.map((o) => `“${o.title}”`).join(', ') : 'nothing shipped this week');
    if (p.hardest) bits.push(`hardest: ${p.hardest.title} (${p.hardest.difficulty}/5)`);
    if (p.through_blockers) bits.push(`got through ${p.through_blockers} blocker(s)`);
    if (p.unblocked.length) bits.push('unblocked ' + p.unblocked.join(', '));
    if (p.working_on.length) bits.push('now on ' + p.working_on.map((w) => w.title).join(', '));
    L.push(`• *${p.name}* — ${bits.join(' · ')}`);
  }
  try {
    const notable = require('../work').contributions(t.from, t.to).slice(0, 8);
    if (notable.length) {
      L.push('', '*Contributions that matter* (not a ranking):');
      for (const c of notable) L.push(`• ${c.title} — ${c.who} — ${c.reasons.join('; ')}`);
    }
  } catch (e) { /* work module unavailable */ }
  const stuck = reqs.filter((r) => r.stuck_reason);
  if (stuck.length) { L.push('', '*Still waiting on something* (context, not fault)'); for (const r of stuck) L.push(`• ${r.title} — ${r.assignees} — 🧱 ${r.stuck_reason.slice(0, 80)}`); }
  L.push('', `_Volume, for context only: ${t.totals.actions} actions · ${t.totals.triggers} triggers · ${t.totals.apps} apps · ${t.totals.client_requests} requests received._`);
  return L.join('\n');
}

function buildPersonalReport(t, reqs) {
  const interrupted = reqs.filter((r) => r.hours !== null).reduce((s, r) => s + r.hours, 0);
  return [
    `🔐 *Personal weekly metrics (${t.from} → ${t.to})*`, '',
    `• Client requests received: *${t.totals.client_requests}*`,
    `• Completed: *${t.totals.requests_completed}*  · Still open: ${Object.entries(t.totals.open_by_status).map(([k, v]) => `${LABEL[k]} ${v}`).join(', ') || '0'}`,
    `• Outcomes delivered: *${require('../metrics').valueMetrics(t.from, t.to).delivered}*  · time to value ${fmt(require('../metrics').valueMetrics(t.from, t.to).time_to_value_h, 'h')}`,
    `• Time spent on client requests: ~${interrupted.toFixed(1)} hours (taken away from planned work)`,
    `• Review error rate: ${fmt(t.totals.error_rate)} per review`,
  ].join('\n');
}

async function run(ref = today()) {
  const { from, to } = lastWeek(ref);
  const t = teamMetrics(from, to);
  const reqs = requestRows(from, to);
  let team = buildTeamReport(t, reqs);
  const personal = buildPersonalReport(t, reqs);

  if (llm.enabled()) {
    try {
      const out = await llm.askJson({
        effort: 'high',
        system: 'You help a team lead write the weekly report for their manager. Be factual and use only the numbers given. Write short bullet points in clear English.',
        prompt: `Weekly metrics JSON:\n${JSON.stringify({ totals: t.totals, members: t.members, requests: reqs })}\n\nWrite 3-5 highlights, 2-4 concerns/risks, and 2-3 suggestions for next week.`,
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            highlights: { type: 'array', items: { type: 'string' } },
            concerns: { type: 'array', items: { type: 'string' } },
            next_week: { type: 'array', items: { type: 'string' } },
          },
          required: ['highlights', 'concerns', 'next_week'],
        },
      });
      team += `\n\n*✨ Highlights*\n${out.highlights.map((x) => '• ' + x).join('\n')}\n\n*⚠️ Concerns*\n${out.concerns.map((x) => '• ' + x).join('\n')}\n\n*➡️ Next week*\n${out.next_week.map((x) => '• ' + x).join('\n')}`;
    } catch (e) { logActivity('scribe', 'AI summary failed: ' + e.message, 'warn'); }
  }

  db.prepare(`INSERT INTO reports (kind, period_start, period_end, content, data) VALUES ('weekly', ?, ?, ?, ?)`).run(from, to, team, JSON.stringify(t));
  db.prepare(`INSERT INTO reports (kind, period_start, period_end, content) VALUES ('personal', ?, ?, ?)`).run(from, to, personal);

  const lead = cfg('LEAD_SLACK_USER_ID');
  if (slack.enabled() && lead) {
    try { await slack.dm(lead, team); await slack.dm(lead, personal); }
    catch (e) { logActivity('scribe', 'DM failed: ' + e.message, 'warn'); }
  }
  await sendOutside(from, to, team, t);
  logActivity('scribe', `Weekly report ready: ${from} → ${to}`);
  return { message: `Weekly report ${from} → ${to} created` };
}

// viaSocket outputs: email to the manager (Gmail), one row per member (Google Sheets)
async function sendOutside(from, to, team, t) {
  const g = vs.settings('gmail');
  if (vs.connected('gmail') && g.manager_email && g.weekly_email !== false) {
    try {
      await vs.gmailSend(g.manager_email, `SquadForge weekly report: ${from} to ${to}`, team.replace(/\*/g, ''));
      logActivity('scribe', `📧 Weekly report emailed to ${g.manager_email}`);
    } catch (e) { logActivity('scribe', 'Email failed: ' + e.message, 'warn'); }
  }
  const sh = vs.settings('google-sheets');
  if (vs.connected('google-sheets') && sh.spreadsheet_id && sh.tab && sh.weekly_rows !== false) {
    try {
      await vs.sheetsAppend(sh.spreadsheet_id, sh.tab, sheetRows(from, to, t));
      logActivity('scribe', `📗 Added ${t.members.length} rows to the Google Sheet`);
    } catch (e) { logActivity('scribe', 'Sheet failed: ' + e.message, 'warn'); }
  }
}
const SHEET_HEADER = ['Week start', 'Week end', 'Member', 'Role', 'Actions', 'Triggers', 'Apps', 'Requests done', 'Requests assigned', 'Avg hours', 'Avg difficulty', 'Reviews', 'Error rate', 'First pass %', 'Plan→done %', 'Updates posted', 'Updates expected', 'Growth posts', 'Unblocked'];
function sheetRows(from, to, t) {
  return t.members.map((m) => [from, to, m.name, m.role, m.actions, m.triggers, m.apps, m.requests_completed, m.requests_assigned,
    m.avg_request_hours ?? '', m.avg_difficulty ?? '', m.reviews, m.error_rate ?? '', m.first_pass_pct ?? '', m.plan_done_pct ?? '',
    m.morning_updates + m.evening_updates, m.workdays * 2, Object.values(m.growth).reduce((a, b) => a + b, 0), m.unblocked]);
}

module.exports = { run, lastWeek, SHEET_HEADER, sheetRows };
