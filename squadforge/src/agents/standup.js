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
  return { id: m.id, name: m.name, role: m.role, growth, posted, plan: log.morning_text || '', update: log.evening_text || '', actions, triggers, apps: Math.max(log.apps_count || 0, pubN('app')), built,
    met: built >= target(), reviews: rv.length, passed: rv.filter((r) => r.passed).length, mistakes: rv.reduce((s, r) => s + (r.errors_count || 0), 0) };
}

function dayTally(date) {
  const ms = members().filter((m) => m.role !== 'lead');
  const people = ms.map((m) => personDay(m, date));
  const T = target();
  const label = new Date(date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const line = (p) => !p.posted && !p.built && !p.growth ? `• *${p.name}* — 💤 no update posted`
    : p.role === 'growth' ? `• *${p.name}* — 🌱 ${p.growth ? pl(p.growth, 'growth item') : 'update posted'}`
    : `• *${p.name}* — ${p.built} built (${pl(p.actions, 'action')}, ${pl(p.triggers, 'trigger')}) ${p.met ? '✅ target met' : `⚠️ ${p.built}/${T}`}${p.reviews ? ` · reviews: ${p.passed}/${p.reviews} passed, ${p.mistakes} mistake${p.mistakes === 1 ? '' : 's'}` : ''}`;
  const tech = people.filter((p) => p.role !== 'growth');
  const met = tech.filter((p) => p.met).length, none = people.filter((p) => !p.posted && !p.built && !p.growth).length;
  const short = [`📋 *Yesterday — ${label}* (target: ${T} actions + triggers each)`, ...people.map(line),
    '', `${met}/${tech.length} met the target${none ? ` · ${none} without an update` : ''}. Have a great day! 💪`].join('\n');
  const full = [`📋 *Full tally — ${label}*`, '', ...people.map((p) => [line(p),
    p.plan ? `   _Plan:_ ${p.plan.replace(/\s+/g, ' ').slice(0, 160)}` : '', p.update ? `   _Done:_ ${p.update.replace(/\s+/g, ' ').slice(0, 220)}` : ''].filter(Boolean).join('\n')),
    '', `Team total: ${people.reduce((s, p) => s + p.built, 0)} actions + triggers · ${met}/${tech.length} met the target · ${people.reduce((s, p) => s + p.reviews, 0)} reviews, ${people.reduce((s, p) => s + p.mistakes, 0)} mistakes found`].join('\n');
  return { short, full, people };
}

async function nudge(people, title, description, tag) {
  const m91 = require('../m91');
  if (!m91.ready()) return 0;
  let sent = 0;
  for (const p of people) {
    const m = db.prepare('SELECT phone FROM members WHERE id = ?').get(p.id);
    if (!m || !m.phone) continue;
    try { await m91.sendAlert({ phone: m.phone, title, description, severity: 'Low', customId: `sf-${tag}-${p.id}-${today()}` }); sent++; }
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
  if (getSetting('standup.m91_morning', true)) m91n = await nudge(members().filter((m) => m.role !== 'lead'), 'Good morning ☀️', 'Post your plan for today in the Good morning thread on Slack.', 'am');
  logActivity('herald', `☀️ Good morning posted · yesterday's tally shared${m91n ? ` · ${m91n} M91 nudges` : ''}`);
  return { message: `Good morning posted${tally.people.length ? ' with yesterday’s tally' : ''}${m91n ? ` · ${m91n} M91 alerts` : ''}` };
}

// 7 PM: nudge whoever has nothing in today's thread
async function eveningNudge(date = today()) {
  if (!getSetting('standup.m91_missing', true)) return 0;
  const missing = members().filter((m) => m.role !== 'lead').map((m) => personDay(m, date)).filter((p) => !p.update && !p.built);
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
    const built = ps.reduce((s, p) => s + p.built, 0), met = ps.filter((p) => p.met).length, posted = ps.filter((p) => p.posted || p.built).length;
    const a = ps.reduce((s, p) => s + p.actions, 0), t = ps.reduce((s, p) => s + p.triggers, 0);
    const rv = db.prepare(`SELECT * FROM reviews WHERE member_id = ? AND date BETWEEN ? AND ? AND status = 'done'`).all(m.id, from, to);
    const mis = rv.reduce((s, r) => s + (r.errors_count || 0), 0), pass = rv.filter((r) => r.passed).length;
    const titles = {}; rv.forEach((r) => { try { JSON.parse(r.findings || '[]').forEach((f) => (titles[f.title] = (titles[f.title] || 0) + 1)); } catch { /* none */ } });
    const top = Object.entries(titles).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k);
    L.push(`• *${m.name}* — ${a} actions + ${t} triggers = *${built}* · target met ${met}/${days.length} days · updates ${posted}/${days.length}${rv.length ? ` · reviews ${pass}/${rv.length} passed, ${mis} mistakes${top.length ? ` (most common: ${top.join('; ')})` : ''}` : ''}`);
    teamBuilt += built; teamMet += met; teamDays += days.length; teamRev += rv.length; teamPass += pass; teamMis += mis;
  }
  if (ms.length) L.push(`_Team: ${teamBuilt} actions + triggers · target met on ${teamDays ? Math.round(teamMet / teamDays * 100) : 0}% of person-days · ${teamRev} reviews, ${teamPass} passed first time or later, ${teamMis} mistakes found._`);
  return L.join('\n');
}

module.exports = { morning, eveningNudge, dayTally, weekSection, isStandupThread, threadOf, prevWorkday, target };
