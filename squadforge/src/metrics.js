// All dashboard / report numbers are computed here from the database.
const { db } = require('./db');
const { members, addDays, weekday, today, hoursBetween, tzMod } = require('./util');

function workdays(from, to) {
  const out = [];
  const t = today();
  for (let d = from; d <= to && d <= t; d = addDays(d, 1)) {
    if (weekday(d) !== 0) out.push(d); // Sunday off
  }
  return out;
}

function memberMetrics(m, from, to) {
  const logs = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND date BETWEEN ? AND ?').all(m.id, from, to);
  const pubs = db.prepare(`SELECT date, kind, COUNT(*) c FROM publishes WHERE member_id = ? AND date BETWEEN ? AND ?
                           GROUP BY date, kind`).all(m.id, from, to);
  // Per day: webhook/manual publishes win; otherwise counts parsed from the evening update.
  const byDay = {};
  for (const l of logs) byDay[l.date] = { action: l.actions_count || 0, trigger: l.triggers_count || 0, app: l.apps_count || 0, fromLog: true };
  const pubDays = {};
  for (const p of pubs) {
    pubDays[p.date] = pubDays[p.date] || { action: 0, trigger: 0, app: 0 };
    pubDays[p.date][p.kind] = p.c;
  }
  Object.assign(byDay, pubDays);
  let actions = 0, triggers = 0, apps = 0;
  for (const d of Object.values(byDay)) { actions += d.action; triggers += d.trigger; apps += d.app; }

  const days = workdays(from, to);
  const morning = logs.filter((l) => l.morning_text).length;
  const evening = logs.filter((l) => l.evening_text).length;
  const planned = logs.reduce((s, l) => s + (l.planned_count || 0), 0);
  const done = logs.reduce((s, l) => s + (l.done_count || 0), 0);

  const reqs = db.prepare(`SELECT r.* FROM client_requests r, json_each(r.assigned_member_ids) j
                           WHERE j.value = ? AND date(r.created_at, '${tzMod()}') BETWEEN ? AND ?`).all(m.id, from, to);
  const completed = reqs.filter((r) => r.status === 'completed');
  const hrs = completed.map((r) => hoursBetween(r.started_at || r.rnd_at || r.created_at, r.completed_at)).filter((h) => h !== null);
  const diffs = completed.map((r) => r.difficulty).filter(Boolean);

  const reviews = db.prepare(`SELECT * FROM reviews WHERE member_id = ? AND status = 'done' AND date BETWEEN ? AND ?`).all(m.id, from, to);
  const errors = reviews.reduce((s, r) => s + r.errors_count, 0);
  const firstTry = reviews.filter((r) => r.attempt === 1);
  const firstPass = firstTry.filter((r) => r.passed).length;

  const growth = db.prepare(`SELECT kind, COUNT(*) c FROM growth_items WHERE member_id = ? AND date BETWEEN ? AND ? GROUP BY kind`).all(m.id, from, to);
  const growthBy = Object.fromEntries(growth.map((g) => [g.kind, g.c]));
  const unblocked = db.prepare(`SELECT COUNT(*) c FROM growth_items WHERE member_id = ? AND unblocked_request_id IS NOT NULL AND date BETWEEN ? AND ?`).get(m.id, from, to).c;

  const xp = actions * 10 + triggers * 10 + apps * 25 + completed.length * 30 + (morning + evening) * 2
    + Object.values(growthBy).reduce((a, b) => a + b, 0) * 8 + unblocked * 15 - errors * 3;

  return {
    id: m.id, name: m.name, role: m.role, slack_user_id: m.slack_user_id,
    workdays: days.length,
    morning_updates: morning, evening_updates: evening,
    missed_updates: Math.max(0, days.length * 2 - morning - evening),
    planned, done, plan_done_pct: planned ? Math.round((done / planned) * 100) : null,
    actions, triggers, apps,
    requests_assigned: reqs.length, requests_completed: completed.length,
    requests_open: reqs.filter((r) => r.status !== 'completed').length,
    requests_stuck: reqs.filter((r) => r.status === 'stuck').length,
    avg_request_hours: hrs.length ? +(hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(1) : null,
    avg_difficulty: diffs.length ? +(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1) : null,
    reviews: reviews.length, review_errors: errors,
    error_rate: reviews.length ? +(errors / reviews.length).toFixed(2) : null,
    first_pass_pct: firstTry.length ? Math.round((firstPass / firstTry.length) * 100) : null,
    growth: growthBy, unblocked,
    xp: Math.max(0, xp), level: Math.floor(Math.sqrt(Math.max(0, xp) / 20)) + 1,
  };
}

function teamMetrics(from, to) {
  const ms = members().filter((m) => m.role !== 'lead');
  const per = ms.map((m) => memberMetrics(m, from, to));
  const reqs = db.prepare(`SELECT * FROM client_requests WHERE date(created_at, '${tzMod()}') BETWEEN ? AND ?`).all(from, to);
  const openAll = db.prepare(`SELECT status, COUNT(*) c FROM client_requests WHERE status != 'completed' GROUP BY status`).all();
  const completedInRange = db.prepare(`SELECT COUNT(*) c FROM client_requests WHERE date(completed_at, '${tzMod()}') BETWEEN ? AND ?`).get(from, to).c;
  const sum = (k) => per.reduce((s, p) => s + (p[k] || 0), 0);
  const reviews = sum('reviews');
  return {
    from, to,
    members: per,
    totals: {
      actions: sum('actions'), triggers: sum('triggers'), apps: sum('apps'),
      client_requests: reqs.length, requests_completed: completedInRange,
      open_by_status: Object.fromEntries(openAll.map((o) => [o.status, o.c])),
      reviews, review_errors: sum('review_errors'),
      error_rate: reviews ? +(sum('review_errors') / reviews).toFixed(2) : null,
      missed_updates: sum('missed_updates'),
      growth_items: per.reduce((s, p) => s + Object.values(p.growth).reduce((a, b) => a + b, 0), 0),
    },
  };
}

// Day-by-day series for charts
function dailySeries(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const t = teamMetrics(d, d).totals;
    out.push({ date: d, actions: t.actions, triggers: t.triggers, apps: t.apps, requests: t.client_requests });
  }
  return out;
}

module.exports = { memberMetrics, teamMetrics, dailySeries, workdays };

// ---------- value, not volume ----------
// Outcomes delivered, time to value, quality on first review, blockers cleared and work waiting.
// Counts of actions/triggers are kept only as detail inside an outcome.
for (const sql of ['ALTER TABLE client_requests ADD COLUMN impact_note TEXT', 'ALTER TABLE client_requests ADD COLUMN evidence_url TEXT']) {
  try { db.exec(sql); } catch { /* exists */ }
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1); };

// Where the time of one request went: waiting for someone to start, working, blocked.
function journeyOf(r) {
  const ev = db.prepare('SELECT status, at FROM request_events WHERE request_id = ? ORDER BY at').all(r.id);
  const end = r.completed_at || new Date().toISOString();
  let waiting = 0, working = 0, stuck = 0, started = null;
  for (let i = 0; i < ev.length; i++) {
    const from = ev[i].at, to = i + 1 < ev.length ? ev[i + 1].at : end;
    const h = Math.max(0, (new Date(to) - new Date(from)) / 36e5);
    if (ev[i].status === 'new') waiting += h;
    else if (ev[i].status === 'stuck') stuck += h;
    else if (ev[i].status !== 'completed') { working += h; if (!started) started = from; }
  }
  if (!ev.length) working = Math.max(0, (new Date(end) - new Date(r.created_at)) / 36e5);
  return { waiting: +waiting.toFixed(1), working: +working.toFixed(1), stuck: +stuck.toFixed(1), total: +(waiting + working + stuck).toFixed(1) };
}

function valueMetrics(from, to) {
  const tz = tzMod();
  const verified = (kind, id) => { try { const v = db.prepare('SELECT status FROM verifications WHERE kind = ? AND ref_id = ?').get(kind, id); return !!(v && v.status === 'verified'); } catch { return false; } };
  const done = db.prepare(`SELECT * FROM client_requests WHERE status = 'completed' AND date(completed_at, '${tz}') BETWEEN ? AND ? ORDER BY completed_at DESC`).all(from, to);
  let doneTasks = [];
  try { doneTasks = db.prepare(`SELECT * FROM tasks WHERE status = 'done' AND date(done_at, '${tz}') BETWEEN ? AND ?`).all(from, to); } catch { /* no tasks table yet */ }
  const outcomes = [
    ...done.map((r) => ({ kind: 'request', id: r.id, title: r.title, who: JSON.parse(r.assigned_member_ids || '[]'), date: (r.completed_at || '').slice(0, 10), difficulty: r.difficulty, impact: r.impact_note, evidence: r.evidence_url, verified: verified('request', r.id), journey: journeyOf(r), blocked: r.stuck_count > 0 })),
    ...doneTasks.map((t) => ({ kind: 'task', id: t.id, title: t.title, who: t.member_id ? [t.member_id] : [], date: (t.done_at || '').slice(0, 10), difficulty: null, impact: t.evidence_note, evidence: t.evidence_url, verified: verified('task', t.id), journey: null, blocked: false })),
  ];
  const ttv = outcomes.filter((o) => o.journey).map((o) => o.journey.total);
  const stuckShare = outcomes.filter((o) => o.journey && o.journey.total).map((o) => o.journey.stuck / o.journey.total);
  const first = db.prepare(`SELECT passed FROM reviews WHERE status = 'done' AND attempt = 1 AND date BETWEEN ? AND ?`).all(from, to);
  const unblocks = db.prepare(`SELECT COUNT(*) c FROM growth_items WHERE unblocked_request_id IS NOT NULL AND date BETWEEN ? AND ?`).get(from, to).c;
  const cleared = db.prepare(`SELECT COUNT(DISTINCT e.request_id) c FROM request_events e WHERE e.status IN ('started','rnd','completed') AND date(e.at, '${tz}') BETWEEN ? AND ?
                              AND EXISTS (SELECT 1 FROM request_events s WHERE s.request_id = e.request_id AND s.status = 'stuck' AND s.at < e.at)`).get(from, to).c;
  const waiting = db.prepare(`SELECT COUNT(*) c FROM client_requests WHERE status = 'new'`).get().c;
  return {
    outcomes,
    delivered: outcomes.length,
    verified: outcomes.filter((o) => o.verified).length,
    time_to_value_h: median(ttv),
    stuck_share_pct: stuckShare.length ? Math.round((stuckShare.reduce((a, b) => a + b, 0) / stuckShare.length) * 100) : null,
    first_pass_pct: first.length ? Math.round((first.filter((f) => f.passed).length / first.length) * 100) : null,
    first_pass_n: first.length,
    blockers_cleared: cleared + unblocks,
    waiting_on_us: waiting,
  };
}

// Per person: what they delivered and how — names, not scores. Sorted A-Z, never ranked.
function memberOutcomes(from, to, value) {
  const v = value || valueMetrics(from, to);
  return members().filter((m) => m.role !== 'lead').sort((a, b) => a.name.localeCompare(b.name)).map((m) => {
    const mine = v.outcomes.filter((o) => o.who.includes(m.id));
    const hardest = mine.filter((o) => o.difficulty).sort((a, b) => b.difficulty - a.difficulty)[0] || null;
    const first = db.prepare(`SELECT passed FROM reviews WHERE member_id = ? AND status = 'done' AND attempt = 1 AND date BETWEEN ? AND ?`).all(m.id, from, to);
    const unblocked = db.prepare(`SELECT r.title FROM growth_items g JOIN client_requests r ON r.id = g.unblocked_request_id WHERE g.member_id = ? AND g.date BETWEEN ? AND ?`).all(m.id, from, to).map((x) => x.title);
    const through = mine.filter((o) => o.blocked).length;
    const active = db.prepare(`SELECT r.title, r.status FROM client_requests r, json_each(r.assigned_member_ids) j WHERE j.value = ? AND r.status IN ('rnd','started','stuck')`).all(m.id);
    return {
      id: m.id, name: m.name, role: m.role,
      outcomes: mine.map((o) => ({ title: o.title, verified: o.verified, impact: o.impact, kind: o.kind })),
      hardest: hardest ? { title: hardest.title, difficulty: hardest.difficulty } : null,
      first_pass: first.length ? `${first.filter((f) => f.passed).length}/${first.length}` : null,
      unblocked, through_blockers: through,
      working_on: active.map((a) => ({ title: a.title, status: a.status })),
    };
  });
}

module.exports.valueMetrics = valueMetrics;
module.exports.memberOutcomes = memberOutcomes;
module.exports.journeyOf = journeyOf;
