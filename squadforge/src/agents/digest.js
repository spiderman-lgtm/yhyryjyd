// 🧭 Analysis — what happened in the channel's threads on one day: who was given what (and what is
// urgent), how each request moved, which reviews came in and how they went, and what everyone said.
// The facts come straight from the database; the AI adds a short summary and what needs attention.
const { db } = require('../db');
const llm = require('../llm');
require('./tracker'); // adds the urgent columns
require('./standup'); // adds the leaves table
const { members, today, tzMod, logActivity } = require('../util');

const LABEL = { new: 'Not started', rnd: 'R&D', started: 'Building', stuck: 'Stuck', completed: 'Completed' };
const nameOf = (id) => (db.prepare('SELECT name FROM members WHERE id = ?').get(id) || {}).name || null;
const hoursSince = (iso) => (iso ? Math.round((Date.now() - new Date(iso)) / 36e5) : null);

function facts(date) {
  const T = tzMod();
  const touched = db.prepare(`SELECT DISTINCT r.* FROM client_requests r LEFT JOIN request_events e ON e.request_id = r.id
    WHERE date(r.created_at, '${T}') = ? OR date(e.at, '${T}') = ? OR (r.urgent = 1 AND r.status != 'completed') ORDER BY r.created_at`).all(date, date);
  const assignments = touched.map((r) => {
    const ev = db.prepare(`SELECT status, reason, member_id, at FROM request_events WHERE request_id = ? AND date(at, '${T}') = ? ORDER BY at`).all(r.id, date)
      .map((e) => ({ status: LABEL[e.status] || e.status, who: nameOf(e.member_id), reason: e.reason, at: e.at }));
    return { id: r.id, title: r.title, owners: JSON.parse(r.assigned_member_ids || '[]').map(nameOf).filter(Boolean), status: LABEL[r.status], urgent: !!r.urgent,
      new_today: (r.created_at || '').slice(0, 10) <= date && ev.some((e) => e.status === 'Not started'), stuck_reason: r.status === 'stuck' ? r.stuck_reason : null, moves: ev };
  });
  const urgent = touched.filter((r) => r.urgent && r.status !== 'completed').map((r) => ({
    id: r.id, title: r.title, owners: JSON.parse(r.assigned_member_ids || '[]').map(nameOf).filter(Boolean), status: LABEL[r.status],
    started: ['started', 'completed'].includes(r.status) || !!r.started_at, waiting_h: hoursSince(r.urgent_at || r.created_at), reason: r.stuck_reason,
  }));
  const reviews = db.prepare(`SELECT * FROM reviews WHERE date = ? ORDER BY id`).all(date).map((r) => {
    let f = []; try { f = JSON.parse(r.findings || '[]'); } catch { /* none */ }
    return { who: nameOf(r.member_id), subject: r.subject, status: r.status, passed: !!r.passed, attempt: r.attempt, mistakes: r.errors_count, findings: f.slice(0, 4).map((x) => x.title) };
  });
  const people = members().filter((m) => m.role !== 'lead').map((m) => {
    const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND date = ?').get(m.id, date) || {};
    const leave = !!db.prepare('SELECT 1 FROM leaves WHERE member_id = ? AND date = ?').get(m.id, date);
    return { name: m.name, role: m.role, leave, plan: (log.morning_text || '').replace(/\s+/g, ' ').slice(0, 220), update: (log.evening_text || '').replace(/\s+/g, ' ').slice(0, 260),
      built: (log.actions_count || 0) + (log.triggers_count || 0) };
  });
  return { date, assignments, urgent, reviews, people };
}

async function generate(date = today(), { ai = true } = {}) {
  const f = facts(date);
  let summary = [], attention = [];
  if (ai && llm.enabled() && (f.assignments.length || f.reviews.length || f.people.some((p) => p.plan || p.update))) {
    try {
      const out = await llm.askJson({
        system: 'You help a team lead read one day of their Slack channel (a team building app integrations). Use only the facts given. Short, plain English. Name people. No blame; blockers are context.',
        prompt: `Facts for ${date} (JSON):\n${JSON.stringify(f).slice(0, 14000)}\n\nWrite: summary — 3 to 6 short bullets of what happened today (who was given what, what moved, reviews and how they went); attention — up to 4 bullets the lead should act on (urgent work not started, long blockers, failed reviews, people without updates).`,
        schema: { type: 'object', additionalProperties: false, properties: { summary: { type: 'array', items: { type: 'string' } }, attention: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'attention'] },
      });
      summary = out.summary || []; attention = out.attention || [];
    } catch (e) { logActivity('analyst', 'Day analysis (AI) failed: ' + e.message, 'warn'); }
  }
  const data = { ...f, summary, attention, generated_at: new Date().toISOString() };
  db.prepare("DELETE FROM reports WHERE kind = 'digest' AND period_start = ?").run(date);
  db.prepare("INSERT INTO reports (kind, period_start, period_end, content, data) VALUES ('digest', ?, ?, ?, ?)").run(date, date, summary.join('\n') || '(facts only)', JSON.stringify(data));
  if (summary.length) logActivity('analyst', `🧭 Day analysis ready for ${date}`);
  return data;
}

// stored analysis (AI summary) + fresh facts
function get(date = today()) {
  const row = db.prepare("SELECT data FROM reports WHERE kind = 'digest' AND period_start = ? ORDER BY id DESC LIMIT 1").get(date);
  const saved = row ? JSON.parse(row.data || '{}') : {};
  return { ...facts(date), summary: saved.summary || [], attention: saved.attention || [], generated_at: saved.generated_at || null };
}

module.exports = { facts, generate, get };
