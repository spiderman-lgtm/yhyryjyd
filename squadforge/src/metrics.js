// All dashboard / report numbers are computed here from the database.
const { db } = require('./db');
const { members, addDays, weekday, today, hoursBetween } = require('./util');

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
                           WHERE j.value = ? AND date(r.created_at) BETWEEN ? AND ?`).all(m.id, from, to);
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
  const reqs = db.prepare(`SELECT * FROM client_requests WHERE date(created_at) BETWEEN ? AND ?`).all(from, to);
  const openAll = db.prepare(`SELECT status, COUNT(*) c FROM client_requests WHERE status != 'completed' GROUP BY status`).all();
  const completedInRange = db.prepare(`SELECT COUNT(*) c FROM client_requests WHERE date(completed_at) BETWEEN ? AND ?`).get(from, to).c;
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
