// Manager view: one read-only page that tells a boss what the team delivered this week
// and what the lead did to make it happen. Plain sentences first, numbers second.
const { db } = require('./db');
const U = require('./util');
const metrics = require('./metrics');
const work = require('./work');

const name = (id) => (U.memberById(id) || {}).name || null;
const names = (ids) => ids.map(name).filter(Boolean);
const tz = () => U.tzMod();
const plural = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + 's'}`;

function leadName(fallback) {
  const l = db.prepare("SELECT name FROM members WHERE role = 'lead' AND active = 1 AND is_demo = 0 ORDER BY id LIMIT 1").get();
  return l ? l.name.replace(/\s*\(.*\)$/, '') : fallback || 'The lead';
}

function leadWork(from, to) {
  const T = tz();
  const n = (sql, ...a) => db.prepare(sql).get(...a).c;
  const brought = n(`SELECT COUNT(*) c FROM client_requests WHERE date(created_at, '${T}') BETWEEN ? AND ?`, from, to);
  const assigned = n(`SELECT COUNT(*) c FROM client_requests WHERE date(created_at, '${T}') BETWEEN ? AND ? AND assigned_member_ids != '[]'`, from, to);
  const verified = n(`SELECT COUNT(*) c FROM verifications WHERE status = 'verified' AND date(at, '${T}') BETWEEN ? AND ?`, from, to);
  const evidence = n(`SELECT COUNT(*) c FROM verifications WHERE status = 'needs_evidence' AND date(at, '${T}') BETWEEN ? AND ?`, from, to);
  const messages = n(`SELECT COUNT(*) c FROM broadcasts WHERE date(created_at, '${T}') BETWEEN ? AND ?`, from, to);
  const alerts = n(`SELECT COUNT(*) c FROM reports WHERE kind = 'daily' AND date(created_at, '${T}') BETWEEN ? AND ?`, from, to);
  const reviews = n(`SELECT COUNT(*) c FROM reviews WHERE status = 'done' AND date BETWEEN ? AND ?`, from, to);
  let changes = 0; try { changes = n(`SELECT COUNT(*) c FROM audit_log WHERE date(at, '${T}') BETWEEN ? AND ?`, from, to); } catch { /* no audit yet */ }
  // what the lead did, newest first
  const tl = [];
  const iso = (s) => (s && !s.includes('T') ? s.replace(' ', 'T') + 'Z' : s);
  try { db.prepare(`SELECT at, kind, text FROM audit_log WHERE date(at, '${T}') BETWEEN ? AND ? AND kind NOT IN ('agents', 'settings', 'integrations') ORDER BY at DESC LIMIT 40`).all(from, to).forEach((a) => tl.push({ at: iso(a.at), icon: { requests: '✏️', members: '👥', settings: '⚙️', integrations: '🔌', alerts: '📣', reviews: '🔍' }[a.kind] || '•', text: a.text })); } catch { /* none */ }
  db.prepare(`SELECT v.*, r.title FROM verifications v LEFT JOIN client_requests r ON v.kind = 'request' AND r.id = v.ref_id WHERE date(v.at, '${T}') BETWEEN ? AND ? ORDER BY v.at DESC`).all(from, to)
    .forEach((v) => tl.push({ at: iso(v.at), icon: v.status === 'verified' ? '🏅' : '📎', text: `${v.status === 'verified' ? 'Verified the outcome of' : 'Asked for evidence on'} “${v.title || 'a task'}”` }));
  db.prepare(`SELECT created_at, message, important FROM broadcasts WHERE date(created_at, '${T}') BETWEEN ? AND ? ORDER BY created_at DESC`).all(from, to)
    .forEach((b) => tl.push({ at: iso(b.created_at), icon: '⚔️', text: `Messaged the team${b.important ? ' (with an M91 alert)' : ''}: “${b.message.slice(0, 90)}${b.message.length > 90 ? '…' : ''}”` }));
  db.prepare(`SELECT title, created_at FROM client_requests WHERE date(created_at, '${T}') BETWEEN ? AND ? ORDER BY created_at DESC`).all(from, to)
    .forEach((r) => tl.push({ at: iso(r.created_at), icon: '📨', text: `Brought in a client request: “${r.title}”` }));
  tl.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { brought, assigned, verified, evidence, messages, alerts, reviews, changes, timeline: tl.slice(0, 25) };
}

function summary(weekStartDate, leadFallback) {
  const today = U.today();
  const from = U.weekStart(weekStartDate || today);
  const to = U.addDays(from, 6) < today ? U.addDays(from, 6) : today;
  const prevFrom = U.addDays(from, -7), prevTo = U.addDays(from, -1);
  const v = metrics.valueMetrics(from, to), pv = metrics.valueMetrics(prevFrom, prevTo);
  const lead = leadName(leadFallback);
  const lw = leadWork(from, to);
  const blocked = work.blocked().filter((b) => b.kind === 'request');
  const moving = db.prepare(`SELECT * FROM client_requests WHERE status IN ('rnd','started') ORDER BY created_at`).all()
    .map((r) => ({ id: r.id, title: r.title, status: r.status === 'rnd' ? 'R&D' : 'Building', who: names(JSON.parse(r.assigned_member_ids || '[]')).join(', ') || 'Unassigned' }));
  const waiting = db.prepare(`SELECT COUNT(*) c FROM client_requests WHERE status = 'new'`).get().c;
  const shipped = v.outcomes.map((o) => ({ title: o.title, who: names(o.who).join(', '), date: o.date, impact: o.impact, evidence: o.evidence, verified: o.verified, days: o.journey ? Math.round(o.journey.total / 24 * 10) / 10 : null, wasBlocked: o.blocked }));
  const trend = [3, 2, 1, 0].map((k) => {
    const f = U.addDays(from, -7 * k), t = k === 0 ? to : U.addDays(f, 6);
    const m = k === 0 ? v : metrics.valueMetrics(f, t);
    return { week: f, delivered: m.delivered, ttv: m.time_to_value_h, blockers: m.blockers_cleared };
  });

  // the story, in plain sentences
  const s = [];
  if (v.delivered) s.push(`The team shipped ${plural(v.delivered, 'piece')} of client work${v.verified ? ` (${v.verified} verified with proof)` : ''}${pv.delivered !== undefined ? `, ${v.delivered > pv.delivered ? 'up from' : v.delivered < pv.delivered ? 'down from' : 'same as'} ${pv.delivered} last week` : ''}.`);
  else s.push('Nothing was shipped yet this week.');
  if (v.time_to_value_h != null) s.push(`A request took about ${v.time_to_value_h < 48 ? Math.round(v.time_to_value_h) + ' hours' : Math.round(v.time_to_value_h / 24) + ' days'} from asking to live.`);
  if (v.blockers_cleared || blocked.length) s.push(`${v.blockers_cleared ? plural(v.blockers_cleared, 'blocker') + ' cleared' : 'No blockers cleared'}${blocked.length ? `; ${blocked.length} still open (${blocked.slice(0, 2).map((b) => `${b.what} — waiting on ${b.waitingOn}`).join('; ')})` : '; nothing is blocked right now'}.`);
  const leadBits = [lw.brought && `brought in ${plural(lw.brought, 'client request')}`, lw.assigned && `gave ${lw.assigned === lw.brought ? 'all of them' : lw.assigned} an owner`, lw.verified && `verified ${plural(lw.verified, 'outcome')}`, lw.reviews && `had ${plural(lw.reviews, 'submission')} reviewed against the team's quality rules`, lw.messages && `sent ${plural(lw.messages, 'instruction')} to the team`, lw.alerts && `sent ${plural(lw.alerts, 'daily update')}`].filter(Boolean);
  if (leadBits.length) s.push(`${lead} ${leadBits.slice(0, -1).join(', ')}${leadBits.length > 1 ? ' and ' : ''}${leadBits[leadBits.length - 1]}.`);
  if (moving.length || waiting) s.push(`${plural(moving.length, 'request')} ${moving.length === 1 ? 'is' : 'are'} in progress${waiting ? ` and ${waiting} ${waiting === 1 ? 'is' : 'are'} waiting to start` : ''}.`);

  const weekly = db.prepare(`SELECT content, period_start, period_end, created_at FROM reports WHERE kind = 'weekly' ORDER BY id DESC LIMIT 1`).get() || null;
  return {
    from, to, prev: { from: prevFrom, to: prevTo }, lead, story: s,
    kpis: { delivered: v.delivered, prev_delivered: pv.delivered, verified: v.verified, ttv: v.time_to_value_h, prev_ttv: pv.time_to_value_h, blockers_cleared: v.blockers_cleared, prev_blockers: pv.blockers_cleared, blocked_now: blocked.length, first_pass: v.first_pass_pct },
    lead_work: lw, shipped, blocked, moving, waiting, trend, weekly,
  };
}

module.exports = { summary };
