// 📜 Scribe - every Monday: last week's (Mon-Sun) team report + the lead's personal report.
const { db } = require('../db');
const llm = require('../llm');
const slack = require('../slack');
const vs = require('../viasocket');
const { logActivity, today, addDays, weekStart, hoursBetween, memberById, cfg } = require('../util');
const { teamMetrics } = require('../metrics');
const { LABEL } = require('./tracker');
const { KIND_LABEL } = require('./growth');

function lastWeek(ref = today()) {
  const from = addDays(weekStart(ref), -7);
  return { from, to: addDays(from, 6) };
}

function requestRows(from, to) {
  return db.prepare(`SELECT * FROM client_requests WHERE date(created_at) BETWEEN ? AND ?
                     OR (date(completed_at) BETWEEN ? AND ?) ORDER BY created_at`).all(from, to, from, to)
    .map((r) => {
      const names = JSON.parse(r.assigned_member_ids || '[]').map((id) => (memberById(id) || {}).name).filter(Boolean);
      const h = hoursBetween(r.started_at || r.rnd_at || r.created_at, r.completed_at);
      return { title: r.title, status: LABEL[r.status], assignees: names.join(', ') || '-', hours: h !== null ? +h.toFixed(1) : null, difficulty: r.difficulty, stuck_reason: r.stuck_reason };
    });
}

function fmt(v, suffix = '') { return v === null || v === undefined ? '-' : v + suffix; }

function buildTeamReport(t, reqs) {
  const L = [];
  L.push(`📜 *SquadForge — Weekly Team Report (${t.from} → ${t.to})*`, '');
  L.push(`*Team total:* ${t.totals.apps} apps · ${t.totals.actions} actions · ${t.totals.triggers} triggers`);
  L.push(`*Client requests:* ${t.totals.client_requests} received · ${t.totals.requests_completed} completed`);
  L.push(`*Reviews:* ${t.totals.reviews} · errors ${t.totals.review_errors} · error rate ${fmt(t.totals.error_rate)} per review`);
  L.push(`*Missed updates:* ${t.totals.missed_updates}`, '');
  L.push('*By member:*');
  for (const m of t.members) {
    if (m.role === 'growth') {
      const g = Object.entries(m.growth).map(([k, v]) => `${v} ${KIND_LABEL[k] || k}`).join(', ') || 'nothing recorded';
      L.push(`• *${m.name}* (growth) — ${g}; ${m.unblocked} requests unblocked; updates ${m.morning_updates + m.evening_updates}/${m.workdays * 2}`);
    } else {
      L.push(`• *${m.name}* — ${m.apps} apps, ${m.actions} actions, ${m.triggers} triggers | requests ${m.requests_completed}/${m.requests_assigned} (avg ${fmt(m.avg_request_hours, 'h')}, difficulty ${fmt(m.avg_difficulty)}) | error rate ${fmt(m.error_rate)}, first-pass ${fmt(m.first_pass_pct, '%')} | plan→done ${fmt(m.plan_done_pct, '%')} | updates ${m.morning_updates + m.evening_updates}/${m.workdays * 2}`);
    }
  }
  try {
    const notable = require('../work').contributions(t.from, t.to).slice(0, 8);
    if (notable.length) {
      L.push('', '*Contributions that matter* (not a ranking):');
      for (const c of notable) L.push(`• ${c.title} — ${c.who} — ${c.reasons.join('; ')}`);
    }
  } catch (e) { /* work module unavailable */ }
  if (reqs.length) {
    L.push('', '*Client requests detail:*');
    for (const r of reqs) L.push(`• ${r.title} — ${r.status} — ${r.assignees}${r.hours !== null ? ` — ${r.hours}h` : ''}${r.difficulty ? ` — difficulty ${r.difficulty}/5` : ''}${r.stuck_reason ? ` — 🧱 ${r.stuck_reason.slice(0, 80)}` : ''}`);
  }
  return L.join('\n');
}

function buildPersonalReport(t, reqs) {
  const interrupted = reqs.filter((r) => r.hours !== null).reduce((s, r) => s + r.hours, 0);
  return [
    `🔐 *Personal weekly metrics (${t.from} → ${t.to})*`, '',
    `• Client requests received: *${t.totals.client_requests}*`,
    `• Completed: *${t.totals.requests_completed}*  · Still open: ${Object.entries(t.totals.open_by_status).map(([k, v]) => `${LABEL[k]} ${v}`).join(', ') || '0'}`,
    `• Apps built: *${t.totals.apps}*  · Actions: *${t.totals.actions}*  · Triggers: *${t.totals.triggers}*`,
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
