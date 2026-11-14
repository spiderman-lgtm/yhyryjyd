// ☀️ Standup - the daily rhythm in the team channel:
//   11:00 (Mon–Sat)  a friendly "Good morning team" post; its thread is the day's update thread.
//                    First reply in it: yesterday's tally (short, for the team) + the full version to the lead (DM).
//                    Optional M91 nudge to everyone.
//   19:00            Herald reads the thread (7 PM alert); M91 nudge to anyone without an update.
//   Monday           the weekly report adds a per-person record of targets and reviews (weekSection).
// Target: actions + triggers built in a day (default 10). Shown as met / not yet — never a ranking.
const { db, getSetting, setSetting } = require('../db');
const slack = require('../slack');
const llm = require('../llm');
const { logActivity, members, today, addDays, weekday, cfg, tzMod } = require('../util');

const LINES = [
  'Good morning team ☀️ New day, fresh coffee, let’s build something great.',
  'Good morning everyone 🌱 Small steps, steady progress — let’s make today count.',
  'Rise and shine, team ☀️ Let’s ship something clients will love today.',
  'Good morning, builders 🛠️ Clear plan, focused work, happy clients.',
  'Morning team 🌤️ One request at a time — let’s go!',
  'Good morning all ☕ Let’s keep the momentum going today.',
];
const ASK = '👉 *Reply in this thread* with your plan for today, and come back before 7 PM with what you finished (app name + how many actions & triggers).';

const target = () => Number(getSetting('standup.target', 10)) || 10;
require('../db').addSchema(`CREATE TABLE IF NOT EXISTS leaves (
  member_id INTEGER NOT NULL, date TEXT NOT NULL, source TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, date)
)`);
function onLeave(memberId, date) { return !!db.prepare('SELECT 1 FROM leaves WHERE member_id = ? AND date = ?').get(memberId, date); }
function setLeave(memberId, date, on, source = 'dashboard', note = null) {
  if (on) db.prepare('INSERT INTO leaves (member_id, date, source, note) VALUES (?, ?, ?, ?) ON CONFLICT(member_id, date) DO UPDATE SET source = excluded.source, note = excluded.note').run(memberId, date, source, note);
  else db.prepare('DELETE FROM leaves WHERE member_id = ? AND date = ?').run(memberId, date);
}
const threadOf = (date) => getSetting('standup.thread.' + date, null);
function isStandupThread(ts) { return !!getSetting('standup.ts.' + ts, null); }
// last working day before `date` (Mon → Sat)
function prevWorkday(date) { let d = addDays(date, -1); if (weekday(d) === 0) d = addDays(d, -1); return d; }

async function morningMessage(date) {
  let line = LINES[Number(date.replace(/-/g, '')) % LINES.length];
  if (llm.enabled()) {
    try {
      const out = await llm.askJson({ effort: 'low', system: 'You write one short, warm good-morning line for a team of plugin developers in Slack. English, one emoji, max 18 words, no hashtags.', prompt: `Date: ${date}. Weekday: ${new Date(date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })}.`, schema: { type: 'object', additionalProperties: false, properties: { line: { type: 'string' } }, required: ['line'] } });
      if (out.line) line = out.line.trim();
    } catch { /* keep the template */ }
  }
  return `${line}\n\n${ASK}`;
}

// One person's day: what they built, whether they posted, their reviews.
function personDay(m, date) {
  const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND date = ?').get(m.id, date) || {};
  const pub = db.prepare('SELECT kind, COUNT(*) c FROM publishes WHERE member_id = ? AND date = ? GROUP BY kind').all(m.id, date);
  const pubN = (k) => (pub.find((p) => p.kind === k) || {}).c || 0;
  const actions = Math.max(log.actions_count || 0, pubN('action'));
  const triggers = Math.max(log.triggers_count || 0, pubN('trigger'));
  const rv = db.prepare(`SELECT * FROM reviews WHERE member_id = ? AND date = ? AND status = 'done'`).all(m.id, date);
  const posted = !!(log.morning_text || log.evening_text);
  const built = actions + triggers;
  const growth = m.role === 'growth' ? db.prepare('SELECT COUNT(*) c FROM growth_items WHERE member_id = ? AND date = ?').get(m.id, date).c : 0;
  const leave = onLeave(m.id, date);
  return { id: m.id, date, name: m.name, role: m.role, growth, leave, posted, plan: log.morning_text || '', update: log.evening_text || '', actions, triggers, apps: Math.max(log.apps_count || 0, pubN('app')), built,
    met: !leave && built >= target(), reviews: rv.length, passed: rv.filter((r) => r.passed).length, mistakes: rv.reduce((s, r) => s + (r.errors_count || 0), 0) };
}

function dayTally(date) {
  const ms = members().filter((m) => m.role !== 'lead');
  const people = ms.map((m) => personDay(m, date));
  const T = target();
  const label = new Date(date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const line = (p) => p.leave ? `• *${p.name}* — 🌴 on leave`
    : !p.posted && !p.built && !p.growth ? `• *${p.name}* — 💤 no update posted`
    : p.role === 'growth' ? `• *${p.name}* — 🌱 ${p.growth ? pl(p.growth, 'growth item') : 'update posted'}`
    : `• *${p.name}* — ${p.built} built (${pl(p.actions, 'action')}, ${pl(p.triggers, 'trigger')}) ${p.met ? '✅ target met' : `⚠️ ${p.built}/${T}`}${p.reviews ? ` · reviews: ${p.passed}/${p.reviews} passed, ${p.mistakes} mistake${p.mistakes === 1 ? '' : 's'}` : ''}`;
  const tech = people.filter((p) => p.role !== 'growth' && !p.leave);
  const met = tech.filter((p) => p.met).length, none = people.filter((p) => !p.leave && !p.posted && !p.built && !p.growth).length;
  const away = people.filter((p) => p.leave).length;
  const short = [`📋 *Yesterday — ${label}* (target: ${T} actions + triggers each)`, ...people.map(line),
    '', `${met}/${tech.length} met the target${none ? ` · ${none} without an update` : ''}${away ? ` · ${away} on leave` : ''}. Have a great day! 💪`].join('\n');
  const full = [`📋 *Full tally — ${label}*`, '', ...people.map((p) => [line(p),
    p.plan ? `   _Plan:_ ${p.plan.replace(/\s+/g, ' ').slice(0, 160)}` : '', p.update ? `   _Done:_ ${p.update.replace(/\s+/g, ' ').slice(0, 220)}` : ''].filter(Boolean).join('\n')),
    '', `Team total: ${people.reduce((s, p) => s + p.built, 0)} actions + triggers · ${met}/${tech.length} met the target · ${people.reduce((s, p) => s + p.reviews, 0)} reviews, ${people.reduce((s, p) => s + p.mistakes, 0)} mistakes found`].join('\n');
  return { short, full, people };
}

// description: text, or (person) => text for a personal message
async function nudge(people, title, description, tag) {
  const m91 = require('../m91');
  if (!m91.ready() || m91.hasLink()) return 0;
  let sent = 0;
  for (const p of people) {
    const m = db.prepare('SELECT phone FROM members WHERE id = ?').get(p.id);
    if (!m || !m.phone) continue;
    try { await m91.sendAlert({ phone: m.phone, title: typeof title === 'function' ? title(p) : title, description: typeof description === 'function' ? description(p) : description, severity: 'Low', customId: `sf-${tag}-${p.id}-${today()}` }); sent++; }
    catch (e) { logActivity('herald', `M91 to ${p.name} failed: ${e.message}`, 'warn'); }
  }
  return sent;
}

async function morning(date = today()) {
  if (weekday(date) === 0 && !getSetting('herald.sunday', false)) return { message: 'Sunday — no standup' };
  if (!slack.enabled()) return { message: 'Connect Slack and choose the channel first' };
  if (threadOf(date)) return { message: 'Good morning is already posted today' };
  const channel = cfg('SLACK_CHANNEL_ID');
  const posted = await slack.post(channel, await morningMessage(date));
  const ts = posted && posted.ts;
  if (ts) { setSetting('standup.thread.' + date, ts); setSetting('standup.ts.' + ts, date); }
  const y = prevWorkday(date);
  const tally = dayTally(y);
  db.prepare(`INSERT INTO reports (kind, period_start, period_end, content) VALUES ('tally', ?, ?, ?)`).run(y, y, tally.full);
  if (ts && tally.people.length) await slack.post(channel, tally.short, ts);
  const lead = cfg('LEAD_SLACK_USER_ID');
  if (lead && tally.people.length) { try { await slack.dm(lead, tally.full); } catch (e) { logActivity('herald', 'DM failed: ' + e.message, 'warn'); } }
  let m91n = 0;
  const m91 = require('../m91');
  if (getSetting('standup.m91_morning', true) && m91.hasLink()) {
    // send link = the whole M91 channel: one calm notification with everyone's tally
    try {
      await m91.channelAlert({ title: 'Good morning team ☀️ Post today’s plan in Slack', description: tally.people.length ? tally.short.replace(/[*_]/g, '') : 'Reply in the Good morning thread with your plan for today.', severity: 'LOW', customId: `standup-am-${date}` });
      m91n = 1;
    } catch (e) { logActivity('herald', 'M91 morning alert failed: ' + e.message, 'warn'); }
  }
  // each person gets their own yesterday: what they built vs the target
  const T = target();
  if (getSetting('standup.m91_morning', true) && !m91.hasLink()) m91n = await nudge(members().filter((m) => m.role !== 'lead' && !onLeave(m.id, date)),
    (p) => `Good morning ${p.name.split(' ')[0]} ☀️`,
    (p) => { const y2 = tally.people.find((x) => x.id === p.id); const yl = !y2 ? '' : y2.role === 'growth' ? `Yesterday: ${y2.growth} growth item(s). ` : !y2.posted && !y2.built ? 'Yesterday: no update posted. ' : `Yesterday you built ${y2.built} (${y2.actions} actions, ${y2.triggers} triggers) — ${y2.met ? 'target met ✅' : `${y2.built}/${T} of the target`}. `; return `${yl}Post today's plan in the Good morning thread.`; }, 'am');
  logActivity('herald', `☀️ Good morning posted · yesterday's tally shared${m91n ? ` · ${m91n} M91 nudges` : ''}`);
  return { message: `Good morning posted${tally.people.length ? ' with yesterday’s tally' : ''}${m91n ? ` · ${m91n} M91 alerts` : ''}` };
}

// 7 PM: nudge whoever has nothing in today's thread
async function eveningNudge(date = today()) {
  if (!getSetting('standup.m91_missing', true)) return 0;
  const missing = members().filter((m) => m.role !== 'lead').map((m) => personDay(m, date)).filter((p) => !p.leave && !p.update && !p.built && !p.growth);
  const m91 = require('../m91');
  if (m91.hasLink()) {
    if (!missing.length) return 0;
    try {
      await m91.channelAlert({ title: `Update missing: ${missing.map((p) => p.name.split(' ')[0]).join(', ')}`.slice(0, 200), description: 'Please post what you finished today (app name + actions & triggers) in the Good morning thread on Slack.', severity: 'LOW', customId: `standup-pm-${date}` });
      logActivity('herald', `⏰ M91 channel nudge: ${missing.length} without an update`);
      return missing.length;
    } catch (e) { logActivity('herald', 'M91 evening alert failed: ' + e.message, 'warn'); return 0; }
  }
  const n = await nudge(missing, 'Your update is missing', 'Please post what you finished today (app + actions & triggers) in the Good morning thread.', 'pm');
  if (n) logActivity('herald', `⏰ M91 nudge to ${n} without an evening update`);
  return n;
}

// Monday report section: per person over the week
function weekSection(from, to) {
  const ms = members().filter((m) => m.role !== 'lead');
  const days = []; for (let d = from; d <= to; d = addDays(d, 1)) if (weekday(d) !== 0) days.push(d);
  const T = target();
  const L = ['', `*Daily target & reviews* (target ${T} actions + triggers a day · not a ranking)`];
  let teamBuilt = 0, teamMet = 0, teamDays = 0, teamRev = 0, teamPass = 0, teamMis = 0;
  for (const m of ms.sort((a, b) => a.name.localeCompare(b.name))) {
    const ps = days.map((d) => personDay(m, d));
    if (m.role === 'growth') { L.push(`• *${m.name}* (growth) — ${ps.reduce((s, p) => s + p.growth, 0)} growth items · updates ${ps.filter((p) => p.posted || p.growth).length}/${days.length} days`); continue; }
    const away = ps.filter((p) => p.leave).length, work = days.length - away;
    const built = ps.reduce((s, p) => s + p.built, 0), met = ps.filter((p) => p.met).length, posted = ps.filter((p) => !p.leave && (p.posted || p.built)).length;
    const a = ps.reduce((s, p) => s + p.actions, 0), t = ps.reduce((s, p) => s + p.triggers, 0);
    const rv = db.prepare(`SELECT * FROM reviews WHERE member_id = ? AND date BETWEEN ? AND ? AND status = 'done'`).all(m.id, from, to);
    const mis = rv.reduce((s, r) => s + (r.errors_count || 0), 0), pass = rv.filter((r) => r.passed).length;
    const titles = {}; rv.forEach((r) => { try { JSON.parse(r.findings || '[]').forEach((f) => (titles[f.title] = (titles[f.title] || 0) + 1)); } catch { /* none */ } });
    const top = Object.entries(titles).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k);
    L.push(`• *${m.name}* — ${a} actions + ${t} triggers = *${built}* · target met ${met}/${work} days · updates ${posted}/${work}${away ? ` · 🌴 ${away} day${away === 1 ? '' : 's'} on leave` : ''}${rv.length ? ` · reviews ${pass}/${rv.length} passed, ${mis} mistakes${top.length ? ` (most common: ${top.join('; ')})` : ''}` : ''}`);
    teamBuilt += built; teamMet += met; teamDays += work; teamRev += rv.length; teamPass += pass; teamMis += mis;
  }
  if (ms.length) L.push(`_Team: ${teamBuilt} actions + triggers · target met on ${teamDays ? Math.round(teamMet / teamDays * 100) : 0}% of person-days · ${teamRev} reviews, ${teamPass} passed first time or later, ${teamMis} mistakes found._`);
  return L.join('\n');
}

// "Right now": what each person is on today — plan, update, built vs target, open requests with blockers.
function nowBoard(date = today()) {
  const STATUS = { rnd: 'R&D', started: 'Building', stuck: 'Stuck', new: 'Not started' };
  const reqs = db.prepare(`SELECT * FROM client_requests WHERE status IN ('new','rnd','started','stuck') ORDER BY created_at`).all();
  const people = members().filter((m) => m.role !== 'lead').map((m) => {
    const d = personDay(m, date);
    const working = reqs.filter((r) => JSON.parse(r.assigned_member_ids || '[]').includes(m.id))
      .map((r) => ({ id: r.id, title: r.title, status: r.status, label: STATUS[r.status], reason: r.status === 'stuck' ? r.stuck_reason : null, since: r.status === 'stuck' ? r.stuck_at : (r.started_at || r.rnd_at || r.created_at) }));
    return { ...d, working };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const count = (st) => reqs.filter((r) => r.status === st).length;
  return { date, target: target(), people, open: { new: count('new'), rnd: count('rnd'), started: count('started'), stuck: count('stuck') }, unassigned: reqs.filter((r) => JSON.parse(r.assigned_member_ids || '[]').length === 0).length };
}

// One person's week, for the profile a manager or lead opens from Right now / Manager view.
function memberProfile(memberId, weekStartDate) {
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!m) return null;
  const { weekStart } = require('../util');
  const t = today(), from = weekStart(weekStartDate || t);
  const end = addDays(from, 6) < t ? addDays(from, 6) : t;
  const days = []; for (let d = from; d <= end; d = addDays(d, 1)) if (weekday(d) !== 0) days.push(personDay(m, d));
  const STATUS = { new: 'Not started', rnd: 'R&D', started: 'Building', stuck: 'Stuck', completed: 'Completed' };
  const reqs = db.prepare(`SELECT * FROM client_requests WHERE (status != 'completed' OR date(completed_at, '${tzMod()}') BETWEEN ? AND ?) ORDER BY created_at DESC`).all(from, end)
    .filter((r) => JSON.parse(r.assigned_member_ids || '[]').includes(m.id))
    .map((r) => ({ id: r.id, title: r.title, status: r.status, label: STATUS[r.status], reason: r.stuck_reason, completed_at: r.completed_at, impact: r.impact_note }));
  const reviews = db.prepare(`SELECT * FROM reviews WHERE member_id = ? AND date BETWEEN ? AND ? AND status = 'done' ORDER BY date DESC`).all(m.id, from, end)
    .map((r) => { let f = []; try { f = JSON.parse(r.findings || '[]'); } catch { /* none */ } return { subject: r.subject, date: r.date, passed: !!r.passed, attempt: r.attempt, mistakes: r.errors_count, summary: r.summary, findings: f.slice(0, 5).map((x) => x.title) }; });
  const work = days.filter((d) => !d.leave);
  return {
    member: { id: m.id, name: m.name, role: m.role }, from, to: end, target: target(), days,
    totals: { built: days.reduce((s, d) => s + d.built, 0), actions: days.reduce((s, d) => s + d.actions, 0), triggers: days.reduce((s, d) => s + d.triggers, 0), met: days.filter((d) => d.met).length, workdays: work.length, leave: days.length - work.length, updates: work.filter((d) => d.posted || d.built).length, growth: days.reduce((s, d) => s + d.growth, 0), reviews: reviews.length, passed: reviews.filter((r) => r.passed).length, mistakes: reviews.reduce((s, r) => s + (r.mistakes || 0), 0), shipped: reqs.filter((r) => r.status === 'completed').length },
    requests: reqs, reviews,
  };
}

// Leaderboard: ranked by actions + triggers built; ties go to the lower review error rate.
// range: today | week | month. Growth people are listed on their own (they don't build actions).
function leaderboard(range = 'week') {
  const { weekStart } = require('../util');
  const t = today();
  const from = range === 'today' ? t : range === 'month' ? t.slice(0, 8) + '01' : weekStart(t);
  const days = []; for (let d = from; d <= t; d = addDays(d, 1)) if (weekday(d) !== 0) days.push(d);
  const T = tzMod();
  const rows = members().filter((m) => m.role !== 'lead').map((m) => {
    const ps = days.map((d) => personDay(m, d));
    const leave = ps.filter((p) => p.leave).length;
    const rv = db.prepare(`SELECT passed, errors_count FROM reviews WHERE member_id = ? AND status = 'done' AND date BETWEEN ? AND ?`).all(m.id, from, t);
    const reviews = rv.length, passed = rv.filter((r) => r.passed).length, mistakes = rv.reduce((n, r) => n + (r.errors_count || 0), 0);
    const completed = db.prepare(`SELECT assigned_member_ids FROM client_requests WHERE status = 'completed' AND date(completed_at, '${T}') BETWEEN ? AND ?`).all(from, t)
      .filter((r) => JSON.parse(r.assigned_member_ids || '[]').includes(m.id)).length;
    return {
      id: m.id, name: m.name, role: m.role,
      actions: ps.reduce((n, p) => n + p.actions, 0), triggers: ps.reduce((n, p) => n + p.triggers, 0), built: ps.reduce((n, p) => n + p.built, 0),
      growth: ps.reduce((n, p) => n + p.growth, 0), days_met: ps.filter((p) => p.met).length, workdays: days.length - leave, leave,
      updates: ps.filter((p) => !p.leave && (p.posted || p.built)).length, completed, reviews, passed, mistakes,
      error_rate: reviews ? Math.round(((reviews - passed) / reviews) * 100) : null,
    };
  });
  const er = (x) => (x.error_rate === null ? 101 : x.error_rate);
  const tech = rows.filter((r) => r.role !== 'growth').sort((a, b) => b.built - a.built || er(a) - er(b) || a.name.localeCompare(b.name));
  tech.forEach((r, i) => { r.rank = i > 0 && r.built === tech[i - 1].built && er(r) === er(tech[i - 1]) ? tech[i - 1].rank : i + 1; });
  const growth = rows.filter((r) => r.role === 'growth').sort((a, b) => b.growth - a.growth || a.name.localeCompare(b.name));
  return { range, from, to: t, target: target(), workdays: days.length, tech, growth,
    team: { built: tech.reduce((n, r) => n + r.built, 0), reviews: rows.reduce((n, r) => n + r.reviews, 0), passed: rows.reduce((n, r) => n + r.passed, 0), completed: tech.reduce((n, r) => n + r.completed, 0) } };
}

module.exports = { leaderboard, memberProfile, onLeave, setLeave, nowBoard, morning, eveningNudge, dayTally, weekSection, isStandupThread, threadOf, prevWorkday, target };
