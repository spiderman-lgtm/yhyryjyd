// Company view: departments above the team workspaces, and an "Everyone" page that shows what
// every person in the company is doing. Lives in the main database (next to the workspace list).
//   - A team (workspace) joins the company when a company admin puts it in a department.
//   - Team members come from their workspace; Slack keeps their "right now" and numbers fresh.
//   - People without a team workspace (CEO, other departments) are added by hand and post
//     their own "what I'm doing" line.
// Person keys: "m-<workspace>-<member id>" for team members, "p-<id>" for people added by hand.
const { mainDb: db, withWorkspace } = require('./db');
const workspaces = require('./workspaces');

db.exec(`CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS org_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  title TEXT,
  department_id INTEGER,
  reports_to TEXT,
  ws_id INTEGER,
  member_id INTEGER,
  now_text TEXT,
  now_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ws_id, member_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS org_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
try { db.exec('ALTER TABLE workspaces ADD COLUMN department_id INTEGER'); } catch { /* already there */ }
try { db.exec('ALTER TABLE departments ADD COLUMN head_key TEXT'); } catch { /* already there */ }
// a hand-added person's state (building / stuck / leave, or just a note) and demo rows
for (const col of ['now_kind TEXT', 'now_reason TEXT', 'is_demo INTEGER NOT NULL DEFAULT 0']) { try { db.exec('ALTER TABLE org_people ADD COLUMN ' + col); } catch { /* already there */ } }
// Projects inside a department (e.g. Development → Plugins, Memory). A project can be linked to a
// team workspace; its people and Slack numbers then show under the project.
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  ws_id INTEGER,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const DEFAULT_TITLE = { tech: 'Developer', growth: 'Growth', lead: 'Team lead' };
const clean = (s, n = 80) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (e) => String(e || '').trim().toLowerCase();

// ---------- structure ----------
function departments() { return db.prepare('SELECT * FROM departments ORDER BY sort, name').all(); }
function teams() { return db.prepare('SELECT id, name, department_id FROM workspaces ORDER BY id').all(); }
function companyTeams() { return teams().filter((t) => t.department_id); }
// The team a person outside every team lands in (read-only): the first company team.
function homeWorkspace() { const t = companyTeams()[0]; return t ? t.id : 1; }

function saveDepartment({ id, name, emoji }) {
  const n = clean(name, 40);
  if (!n) throw new Error('Give the department a name');
  const e = clean(emoji, 4) || null;
  if (id) db.prepare('UPDATE departments SET name = ?, emoji = ? WHERE id = ?').run(n, e, Number(id));
  else db.prepare('INSERT INTO departments (name, emoji, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM departments))').run(n, e);
  return departments();
}
function deleteDepartment(id) {
  db.prepare('DELETE FROM projects WHERE department_id = ?').run(Number(id));
  db.prepare('UPDATE workspaces SET department_id = NULL WHERE department_id = ?').run(Number(id));
  db.prepare('UPDATE org_people SET department_id = NULL WHERE department_id = ?').run(Number(id));
  db.prepare('DELETE FROM departments WHERE id = ?').run(Number(id));
  return departments();
}
function setTeamDepartment(wsId, deptId) {
  if (!workspaces.get(wsId)) throw new Error('No such team');
  if (deptId && !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(Number(deptId))) throw new Error('No such department');
  db.prepare('UPDATE workspaces SET department_id = ? WHERE id = ?').run(deptId ? Number(deptId) : null, Number(wsId));
  return teams();
}

// Everyone in the company: team members (from their workspace) and people added by hand.
// all: every team workspace (company admins see everyone, even before any setup);
// otherwise only teams that sit in a department.
function directory(all = false) {
  const depts = Object.fromEntries(departments().map((d) => [d.id, d]));
  const overrides = db.prepare('SELECT * FROM org_people WHERE ws_id IS NOT NULL').all();
  const ov = (ws, id) => overrides.find((o) => o.ws_id === ws && o.member_id === id) || {};
  const people = [];
  for (const t of (all ? teams() : companyTeams())) {
    const ms = withWorkspace(t.id, () => require('./util').members());
    const lead = ms.find((m) => m.role === 'lead');
    for (const m of ms) {
      const o = ov(t.id, m.id);
      people.push({
        key: `m-${t.id}-${m.id}`, kind: 'team', ws: t.id, member_id: m.id, role: m.role, name: m.name,
        title: o.title || DEFAULT_TITLE[m.role] || 'Team member', email: o.email || null,
        department: depts[t.department_id] || null, team: t.name,
        reports_to: o.reports_to || (lead && lead.id !== m.id ? `m-${t.id}-${lead.id}` : null),
        org_id: o.id || null,
      });
    }
  }
  for (const p of db.prepare('SELECT * FROM org_people WHERE ws_id IS NULL ORDER BY name').all()) {
    people.push({ key: `p-${p.id}`, kind: 'manual', role: 'manual', name: p.name, title: p.title || '', email: p.email || null, department: depts[p.department_id] || null, team: null, reports_to: p.reports_to || null, org_id: p.id, now_text: p.now_text, now_at: p.now_at, now_kind: p.now_kind, now_reason: p.now_reason, demo: !!p.is_demo });
  }
  // the group a person is filed under: their department, else their team
  for (const p of people) p.group = p.department ? { key: 'd-' + p.department.id, name: p.department.name, emoji: p.department.emoji || '🏢' } : p.team ? { key: 't-' + p.ws, name: p.team, emoji: '👥' } : { key: 'none', name: 'No department', emoji: '·' };
  const byKey = Object.fromEntries(people.map((p) => [p.key, p]));
  for (const p of people) p.reports_to_name = p.reports_to && byKey[p.reports_to] ? byKey[p.reports_to].name : null;
  return people;
}

function parseKey(key) {
  let m = String(key || '').match(/^m-(\d+)-(\d+)$/);
  if (m) return { kind: 'team', ws: Number(m[1]), member_id: Number(m[2]) };
  m = String(key || '').match(/^p-(\d+)$/);
  return m ? { kind: 'manual', id: Number(m[1]) } : null;
}

// Add or edit a person. Team members can only get a title, email and manager here (their name and
// team come from the workspace); people added by hand get everything.
function savePerson(body) {
  const title = clean(body.title, 60) || null, email = body.email ? norm(body.email) : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email');
  const reportsTo = body.reports_to && parseKey(body.reports_to) ? String(body.reports_to) : null;
  if (reportsTo && reportsTo === body.key) throw new Error('A person cannot report to themselves');
  const k = body.key ? parseKey(body.key) : null;
  if (body.key && !k) throw new Error('Unknown person');
  if (k && k.kind === 'team') {
    db.prepare(`INSERT INTO org_people (ws_id, member_id, title, email, reports_to) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(ws_id, member_id) DO UPDATE SET title = excluded.title, email = excluded.email, reports_to = excluded.reports_to`).run(k.ws, k.member_id, title, email, reportsTo);
    return body.key;
  }
  const name = clean(body.name, 60);
  if (!name) throw new Error('Give the person a name');
  const dept = body.department_id ? Number(body.department_id) : null;
  if (k) {
    if (!db.prepare('SELECT 1 FROM org_people WHERE id = ? AND ws_id IS NULL').get(k.id)) throw new Error('Unknown person');
    db.prepare('UPDATE org_people SET name = ?, title = ?, email = ?, department_id = ?, reports_to = ? WHERE id = ?').run(name, title, email, dept, reportsTo, k.id);
    return body.key;
  }
  const info = db.prepare('INSERT INTO org_people (name, title, email, department_id, reports_to) VALUES (?, ?, ?, ?, ?)').run(name, title, email, dept, reportsTo);
  return `p-${info.lastInsertRowid}`;
}
function deletePerson(key) {
  const k = parseKey(key);
  if (!k || k.kind !== 'manual') throw new Error('Only people added by hand can be removed here — team members are removed in their team settings');
  db.prepare('DELETE FROM org_updates WHERE person_id = ?').run(k.id);
  db.prepare('DELETE FROM org_people WHERE id = ?').run(k.id);
  db.prepare('UPDATE org_people SET reports_to = NULL WHERE reports_to = ?').run(key);
}

// "What I'm doing": anyone whose email is on a person posts their own line.
function personForEmail(email) {
  const e = norm(email);
  return e ? directory().find((p) => p.email === e) || null : null;
}
function postStatus(email, text) {
  const t = clean(text, 200);
  if (!t) throw new Error('Write what you are doing');
  const p = personForEmail(email);
  if (!p) throw new Error('Your email is not on anyone in the company yet — ask a company admin to add it in Admin');
  let id = p.org_id;
  if (!id) id = db.prepare('INSERT INTO org_people (ws_id, member_id, email) VALUES (?, ?, ?)').run(p.ws, p.member_id, p.email).lastInsertRowid;
  const now = new Date().toISOString();
  db.prepare('UPDATE org_people SET now_text = ?, now_at = ?, now_kind = NULL, now_reason = NULL WHERE id = ?').run(t, now, id);
  db.prepare('INSERT INTO org_updates (person_id, text, created_at) VALUES (?, ?, ?)').run(id, t, now);
  return p.key;
}

// Who may open the company pages: company admins, and anyone in a team that is part of the company.
function adminEmails() { return String(process.env.ADMIN_EMAILS || '').split(',').map(norm).filter(Boolean); }
function isAdmin(cx) { return cx.email ? adminEmails().includes(norm(cx.email)) : cx.role === 'admin'; }
function canSee(cx) {
  if (isAdmin(cx)) return true;
  const inDept = new Set(companyTeams().map((t) => t.id));
  if (!cx.email) return inDept.has(1);
  if (workspaces.forEmail(cx.email).some((w) => inDept.has(w.id))) return true;
  return !!personForEmail(cx.email);
}

// ---------- what everyone is doing ----------
function teamData(wsId) {
  return withWorkspace(wsId, () => {
    const standup = require('./agents/standup');
    const now = standup.nowBoard();
    const ms = require('./util').members();
    const out = {};
    for (const m of ms) out[m.id] = { prof: standup.memberProfile(m.id), now: now.people.find((x) => x.id === m.id) || null };
    return { target: now.target, open: now.open, people: out };
  });
}
function nowOf(p, d) {
  if (p.kind === 'manual') {
    if (p.now_kind === 'leave') return { kind: 'leave', text: 'On leave today' };
    if (!p.now_text) return { kind: 'none', text: 'No update yet' };
    if (p.now_kind === 'building') return { kind: 'started', label: 'Building', text: p.now_text, since: p.now_at };
    if (p.now_kind === 'stuck') return { kind: 'stuck', label: 'Stuck', text: p.now_text, reason: p.now_reason || null, since: p.now_at };
    return { kind: 'note', text: p.now_text, since: p.now_at };
  }
  const n = d && d.now;
  if (p.role === 'lead') {
    const t = d && d.team;
    return t ? { kind: 'lead', text: `Leading ${p.team}: ${t.open.started} building, ${t.open.rnd} in R&D${t.open.stuck ? `, ${t.open.stuck} stuck` : ''}${t.open.new ? `, ${t.open.new} not started` : ''}` } : { kind: 'none', text: 'No update yet' };
  }
  if (!n) return { kind: 'none', text: 'No update yet today' };
  if (n.leave) return { kind: 'leave', text: 'On leave today' };
  const w = n.working.find((x) => x.status === 'stuck') || n.working.find((x) => x.status === 'started') || n.working.find((x) => x.status === 'rnd') || n.working[0];
  if (w) return { kind: w.status, label: w.label, text: w.title, reason: w.reason || null, since: w.since };
  if (n.plan) return { kind: 'plan', text: n.plan.replace(/\s+/g, ' ').slice(0, 160) };
  return { kind: 'none', text: 'No plan posted yet today' };
}
function statsOf(p, d) {
  if (p.kind === 'manual') return [{ label: 'Updates this week', value: String(d.updates) }];
  const t = d.prof ? d.prof.totals : null;
  if (!t) return [];
  if (p.role === 'lead') return [{ label: 'Team this week', value: `${d.team_built} built` }, { label: 'Requests done', value: String(d.team_shipped) }, { label: 'Team', value: `${d.team_size} people` }];
  if (p.role === 'growth') return [{ label: 'This week', value: `${t.growth} item${t.growth === 1 ? '' : 's'}` }, { label: 'Updates', value: `${t.updates}/${t.workdays} days` }, { label: 'Requests done', value: String(t.shipped) }];
  return [{ label: 'This week', value: `${t.built} built` }, { label: 'Reviews', value: t.reviews ? `${t.passed}/${t.reviews} passed` : 'none yet' }, { label: 'Requests done', value: String(t.shipped) }];
}
function feedOf(p, d, limit) {
  const items = [];
  if (p.kind === 'manual') {
    for (const u of d.updates_list || []) items.push({ icon: '📝', text: u.text, when: u.created_at });
    return items.slice(0, limit);
  }
  const pr = d.prof; if (!pr) return items;
  for (const r of pr.requests) {
    if (r.status === 'completed') items.push({ icon: '✅', text: `${r.title}${r.impact ? ` — ${r.impact}` : ''}`, when: r.completed_at });
    else if (r.status === 'stuck') items.push({ icon: '⚠️', text: `Stuck: ${r.title}${r.reason ? ` — ${r.reason}` : ''}`, when: null });
  }
  for (const r of pr.reviews) items.push({ icon: r.passed ? '🔍' : '❌', text: `Review “${r.subject}”: ${r.passed ? 'passed' : `${r.mistakes || 0} mistake${r.mistakes === 1 ? '' : 's'} to fix`}`, when: r.date });
  for (const day of [...pr.days].reverse()) {
    if (day.built) items.push({ icon: '🛠️', text: `${day.built} built (${day.actions} actions, ${day.triggers} triggers)`, when: day.date });
    else if (day.growth) items.push({ icon: '🌱', text: `${day.growth} growth item${day.growth === 1 ? '' : 's'}`, when: day.date });
    else if (day.leave) items.push({ icon: '🌴', text: 'On leave', when: day.date });
  }
  return items.slice(0, limit);
}

// Build every person's card. feedLimit: how many recent items each card lists.
function cards(feedLimit = 3, all = false) {
  const people = directory(all);
  const data = {};
  for (const ws of new Set(people.filter((p) => p.kind === 'team').map((p) => p.ws))) data[ws] = teamData(ws);
  const updates = db.prepare("SELECT person_id, text, created_at FROM org_updates WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at DESC").all();
  return people.map((p) => {
    let d;
    if (p.kind === 'manual') { const list = updates.filter((u) => u.person_id === p.org_id); d = { updates: list.length, updates_list: list }; }
    else {
      const td = data[p.ws], own = td.people[p.member_id] || {};
      d = { ...own, team: td };
      if (p.role === 'lead') {
        const mates = Object.entries(td.people).filter(([id]) => Number(id) !== p.member_id).map(([, x]) => x.prof).filter(Boolean);
        d.team_built = mates.reduce((n, x) => n + x.totals.built, 0); d.team_shipped = mates.reduce((n, x) => n + x.totals.shipped, 0); d.team_size = mates.length;
      }
    }
    const own = p.org_id ? db.prepare('SELECT now_text, now_at FROM org_people WHERE id = ?').get(p.org_id) : null;
    const note = p.kind === 'team' && own && own.now_text && own.now_at && Date.now() - Date.parse(own.now_at) < 864e5 ? { text: own.now_text, since: own.now_at } : null;
    return { ...p, org_id: undefined, now: nowOf(p, d), note, stats: statsOf(p, d), feed: feedOf(p, d, feedLimit), built_week: d.prof ? d.prof.totals.built : null, _d: d };
  });
}

// Numbers for the top of Everyone: the whole company, then each department / team.
function metricsOf(list) {
  const sum = (rows) => {
    const t = (r) => (r._d.prof ? r._d.prof.totals : null);
    const tot = rows.map(t).filter(Boolean);
    const add = (f) => tot.reduce((n, x) => n + (x[f] || 0), 0);
    const reviews = add('reviews'), passed = add('passed');
    return {
      people: rows.length,
      building: rows.filter((r) => ['started', 'rnd'].includes(r.now.kind)).length,
      stuck: rows.filter((r) => r.now.kind === 'stuck').length,
      leave: rows.filter((r) => r.now.kind === 'leave').length,
      no_update: rows.filter((r) => r.now.kind === 'none' && r.role !== 'lead').length,
      built: add('built'), growth: add('growth'), shipped: add('shipped'),
      reviews, passed, pass_rate: reviews ? Math.round((passed / reviews) * 100) : null,
      updates: rows.filter((r) => r.kind === 'manual').reduce((n, r) => n + (r._d.updates || 0), 0),
    };
  };
  const groups = [];
  for (const p of list) { let g = groups.find((x) => x.key === p.group.key); if (!g) groups.push((g = { ...p.group, rows: [] })); g.rows.push(p); }
  return { total: sum(list), groups: groups.map(({ rows, ...g }) => ({ ...g, ...sum(rows) })).sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)) };
}

const LEADER = /\b(ceo|cto|coo|cfo|founder|co-founder|director|head|vp|chief)\b/i;
function everyone(cx) {
  const admin = isAdmin(cx);
  const raw = cards(3, admin);
  const metrics = metricsOf(raw);
  const list = raw.map(({ _d, ...c }) => c);
  const me = cx.email ? list.find((p) => p.email === norm(cx.email)) : null;
  const depts = departments().map((d) => ({ ...d, people: list.filter((p) => p.department && p.department.id === d.id).length }));
  const groups = [];
  for (const p of list) { const g = groups.find((x) => x.key === p.group.key); if (g) g.people++; else groups.push({ ...p.group, people: 1 }); }
  groups.sort((a, b) => (a.key[0] === b.key[0] ? 0 : a.key[0] === 'd' ? -1 : 1) || a.name.localeCompare(b.name));
  return {
    departments: depts, groups, people: list.map((p) => ({ ...p, leader: LEADER.test(p.title || '') })),
    metrics, me: me ? me.key : null, admin, teams: companyTeams().length,
  };
}

// One person, in full: what they are on, their week, who they work with, and their peer group.
function person(key, everyTeam = false) {
  const all = cards(20, everyTeam);
  const p = all.find((x) => x.key === key);
  if (!p) return null;
  const strip = ({ _d, ...c }) => c;
  const peers = p.kind === 'team' && p.role !== 'lead' ? all.filter((x) => x.kind === 'team' && x.key !== p.key && x.role === p.role && (x.title || '') === (p.title || '')) : [];
  const avg = peers.length ? Math.round(peers.reduce((n, x) => n + (p.role === 'growth' ? (x._d.prof ? x._d.prof.totals.growth : 0) : (x.built_week || 0)), 0) / peers.length) : null;
  const mine = p.role === 'growth' ? (p._d.prof ? p._d.prof.totals.growth : 0) : p.built_week;
  return {
    person: strip(p),
    days: p._d.prof ? p._d.prof.days.map((d) => ({ date: d.date, built: d.built, growth: d.growth, leave: d.leave, plan: d.plan, update: d.update, met: d.met })) : [],
    target: p._d.team ? p._d.team.target : null,
    reports_to: p.reports_to ? strip(all.find((x) => x.key === p.reports_to) || { name: p.reports_to_name, key: p.reports_to }) : null,
    team: all.filter((x) => x.reports_to === p.key).map(strip),
    peers: peers.length ? { title: p.title, count: peers.length, average: avg, mine, unit: p.role === 'growth' ? 'growth items' : 'built', names: peers.map((x) => ({ key: x.key, name: x.name, value: p.role === 'growth' ? (x._d.prof ? x._d.prof.totals.growth : 0) : x.built_week })).sort((a, b) => b.value - a.value) } : null,
  };
}

// ---------- org chart (viaSocket structure) ----------
const VIASOCKET = [
  ['Development', '💻', ['Plugins', 'Memory', 'Plugin API Change Automation', 'AI-Agent Skill Docs Review', 'Nolt Plugin']],
  ['Product Management', '🧭', ['Agent Readiness', 'Sirius', 'Strategy', 'viaSocket Pass']],
  ['Marketing', '📣', ['Landing Page B Version']],
  ['Partnership', '🤝', ['Inbound Agent System', 'Outbound Agent System', 'Keka']],
  ['Design', '🎨', []], ['Motion Graphics', '🎬', []],
  ['Operations', '⚙️', []], ['Finance', '💰', []], ['HR', '🧑‍💼', []],
];
// company-wide settings live in the main database (workspace 1), whatever team the request is for
const setting = (k, v) => withWorkspace(1, () => { const { getSetting, setSetting } = require('./db'); return v === undefined ? getSetting(k, null) : setSetting(k, v); });
// The first time the org chart opens with no departments, lay out viaSocket's structure.
// The Plugins project links to a team whose name mentions "plugin".
function seedOnce() {
  if (setting('org.seeded') || departments().length) return;
  const plugTeam = teams().find((t) => /plugin/i.test(t.name));
  VIASOCKET.forEach(([name, emoji, projects], i) => {
    const d = db.prepare('INSERT INTO departments (name, emoji, sort) VALUES (?, ?, ?)').run(name, emoji, i + 1).lastInsertRowid;
    projects.forEach((pr, j) => {
      const ws = pr === 'Plugins' && plugTeam ? plugTeam.id : null;
      db.prepare('INSERT INTO projects (department_id, name, ws_id, sort) VALUES (?, ?, ?, ?)').run(d, pr, ws, j + 1);
      if (ws) db.prepare('UPDATE workspaces SET department_id = ? WHERE id = ?').run(d, ws);
    });
  });
  setting('org.seeded', true);
  if (!setting('org.company')) setting('org.company', 'viaSocket');
}
function saveProject({ id, department_id, name, ws_id }) {
  const n = clean(name, 60);
  const ws = ws_id ? Number(ws_id) : null;
  if (ws && !workspaces.get(ws)) throw new Error('No such team');
  if (id) {
    const pr = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(id));
    if (!pr) throw new Error('No such project');
    db.prepare('UPDATE projects SET name = ?, ws_id = ? WHERE id = ?').run(n || pr.name, ws, pr.id);
    if (ws) db.prepare('UPDATE workspaces SET department_id = ? WHERE id = ?').run(pr.department_id, ws);
  } else {
    if (!n) throw new Error('Give the project a name');
    if (!db.prepare('SELECT 1 FROM departments WHERE id = ?').get(Number(department_id))) throw new Error('No such department');
    db.prepare('INSERT INTO projects (department_id, name, ws_id, sort) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM projects WHERE department_id = ?))').run(Number(department_id), n, ws, Number(department_id));
    if (ws) db.prepare('UPDATE workspaces SET department_id = ? WHERE id = ?').run(Number(department_id), ws);
  }
}
function deleteProject(id) { db.prepare('DELETE FROM projects WHERE id = ?').run(Number(id)); }
function setDepartmentHead(id, key) {
  if (key && !parseKey(key)) throw new Error('Unknown person');
  db.prepare('UPDATE departments SET head_key = ? WHERE id = ?').run(key || null, Number(id));
}

function org(cx) {
  seedOnce();
  const admin = isAdmin(cx);
  const list = cards(1, admin);
  const mini = (p) => ({ key: p.key, name: p.name, title: p.title || '', now: p.now, note: p.note });
  const stat = (rows) => ({
    people: rows.length,
    building: rows.filter((r) => ['started', 'rnd'].includes(r.now.kind)).length,
    stuck: rows.filter((r) => r.now.kind === 'stuck').length,
    leave: rows.filter((r) => r.now.kind === 'leave').length,
    active: rows.filter((r) => !['none', 'leave'].includes(r.now.kind)).length, // on something today
    built: rows.reduce((n, r) => n + (r._d.prof ? r._d.prof.totals.built : 0), 0),
    done: rows.reduce((n, r) => n + (r._d.prof ? r._d.prof.totals.shipped : 0), 0),
  });
  const wsName = Object.fromEntries(teams().map((t) => [t.id, t.name]));
  const byKey = Object.fromEntries(list.map((p) => [p.key, p]));
  const ceo = list.find((p) => /\bceo\b/i.test(p.title || ''));
  const depts = departments().map((d) => {
    const projects = db.prepare('SELECT * FROM projects WHERE department_id = ? ORDER BY sort, id').all(d.id).map((pr) => {
      const rows = pr.ws_id ? list.filter((p) => p.kind === 'team' && p.ws === pr.ws_id) : [];
      return { id: pr.id, name: pr.name, team: pr.ws_id ? { id: pr.ws_id, name: wsName[pr.ws_id] || 'team' } : null, stats: stat(rows), people: rows.map(mini) };
    });
    const linked = new Set(projects.filter((x) => x.team).map((x) => x.team.id));
    const inDept = list.filter((p) => p.department && p.department.id === d.id && (!ceo || p.key !== ceo.key));
    const head = d.head_key && byKey[d.head_key] ? mini(byKey[d.head_key]) : null;
    return {
      id: d.id, name: d.name, emoji: d.emoji || '🏢', head, projects, stats: stat(inDept),
      people: inDept.filter((p) => p.key !== d.head_key && !(p.kind === 'team' && linked.has(p.ws))).map(mini),
    };
  });
  // ---- dashboard numbers: this week vs last week, the last two weeks day by day, today's mix ----
  const U = require('./util');
  const t = U.today(), thisWeek = U.weekStart(t), lastWeek = U.addDays(thisWeek, -7);
  const builders = list.filter((p) => p.kind === 'team' && p.role !== 'lead');
  const lastProfs = builders.map((p) => withWorkspace(p.ws, () => require('./agents/standup').memberProfile(p.member_id, lastWeek))).filter(Boolean);
  const sum = (profs, f) => profs.reduce((n, x) => n + (x.totals[f] || 0), 0);
  const nowProfs = builders.map((p) => p._d.prof).filter(Boolean);
  const daily = {};
  for (let d = lastWeek; d <= t; d = U.addDays(d, 1)) if (U.weekday(d) !== 0) daily[d] = { date: d, built: 0, posted: 0 };
  for (const pr of [...lastProfs, ...nowProfs]) for (const d of pr.days) if (daily[d.date]) { daily[d.date].built += d.built; if (d.posted || d.built || d.growth) daily[d.date].posted++; }
  const kinds = (k) => list.filter((p) => k.includes(p.now.kind)).length;
  const today = { building: kinds(['started', 'rnd']), stuck: kinds(['stuck']), planned: kinds(['plan', 'note', 'lead', 'new']), leave: kinds(['leave']), none: kinds(['none']) };
  const top = builders.filter((p) => p.built_week > 0).sort((a, b) => b.built_week - a.built_week).slice(0, 4)
    .map((p) => ({ key: p.key, name: p.name, title: p.title || '', dept: p.department ? p.department.name : (p.team || ''), built: p.built_week }));
  const projects = depts.flatMap((x) => x.projects);
  const todo = [
    today.stuck && { icon: '🧱', text: `Clear ${today.stuck} blocker${today.stuck === 1 ? '' : 's'}`, sub: 'people are waiting on something' },
    today.none && { icon: '💤', text: `${today.none} without an update today`, sub: 'a plan or a “right now” line' },
    depts.filter((x) => !x.head).length && { icon: '👤', text: `Add heads to ${depts.filter((x) => !x.head).length} departments`, sub: 'Edit structure → Head' },
    projects.filter((x) => !x.team).length && { icon: '🔗', text: `Link ${projects.filter((x) => !x.team).length} projects to teams`, sub: 'so their work shows here' },
    !ceo && { icon: '⭐', text: 'Add the CEO', sub: 'they sit at the top' },
  ].filter(Boolean).slice(0, 3);
  const dash = {
    week: { from: thisWeek, to: U.addDays(thisWeek, 6), built: sum(nowProfs, 'built'), last_built: sum(lastProfs, 'built'), done: sum(nowProfs, 'shipped'), last_done: sum(lastProfs, 'shipped') },
    daily: Object.values(daily), today, top, todo,
  };
  return {
    dash, demo: !!setting('org.demo'), company: setting('org.company') || 'viaSocket', admin, ceo: ceo ? mini(ceo) : null, departments: depts, total: stat(list),
    teams: admin ? teams().map((t) => ({ id: t.id, name: t.name })) : [], people: admin ? list.map((p) => ({ key: p.key, name: p.name, title: p.title || '' })) : [],
  };
}

// ---------- demo company: people in every department + a demo Plugins team, for trying it out ----------
const DEMO = {
  ceo: ['Rohan Mehta (demo)', 'CEO', 'note', 'Partner call with 2 new app makers, then Q4 plugin targets'],
  depts: {
    Development: [['Neha Kapoor (demo)', 'Head of Development', 'note', 'Reviewing the new plugin review rules'], ['Yash Malik (demo)', 'Backend developer', 'building', 'Memory: shared notes API'], ['Zoya Khan (demo)', 'Developer', 'building', 'Plugin API change automation']],
    'Product Management': [['Arjun Rao (demo)', 'Head of Product', 'note', 'Q4 roadmap review with the CEO'], ['Kavya Iyer (demo)', 'Product manager', 'building', 'Agent Readiness spec v2'], ['Rahul Verma (demo)', 'Product manager', 'stuck', 'viaSocket Pass pricing', 'waiting on finance numbers']],
    Marketing: [['Sana Khan (demo)', 'Marketing lead', 'building', 'Landing page B copy and screenshots'], ['Ishaan Malhotra (demo)', 'Content writer', 'note', ''], ['Tara Singh (demo)', 'Growth marketer', 'building', 'Launch email for 30 new plugs']],
    Partnership: [['Vikram Jain (demo)', 'Partnerships head', 'note', 'Calls with 3 SaaS partners'], ['Ananya Das (demo)', 'Partner manager', 'stuck', 'Keka integration', 'API access still pending from Keka'], ['Rohit Sen (demo)', 'Partner manager', 'stuck', 'Outbound agent pilot', 'contract waiting on legal']],
    Design: [['Mira Shah (demo)', 'Design lead', 'building', 'New dashboard icons'], ['Dev Patel (demo)', 'Product designer', 'note', '']],
    'Motion Graphics': [['Arnav Gupta (demo)', 'Motion designer', 'building', 'Product tour video v3']],
    Operations: [['Riya Sharma (demo)', 'Operations lead', 'building', 'Ticket 4821: Gmail trigger not firing'], ['Nikhil Joshi (demo)', 'Support engineer', 'leave', ''], ['Pooja Nair (demo)', 'Support engineer', 'building', 'Clearing the weekend ticket queue']],
    Finance: [['Mohit Gupta (demo)', 'Finance lead', 'note', 'November close and invoices']],
    HR: [['Sneha Reddy (demo)', 'HR lead', 'building', 'Hiring 2 plugin developers']],
  },
  history: ['Shared the weekly plan', 'Closed 3 open items', 'Synced with the team', 'Finished the draft', 'Review done, notes sent', 'Unblocked a teammate', 'Demo to the CEO', 'Planning next week'],
};
function clearDemo() {
  const st = setting('org.demo');
  const ids = db.prepare('SELECT id FROM org_people WHERE is_demo = 1').all().map((r) => r.id);
  for (const id of ids) {
    db.prepare('DELETE FROM org_updates WHERE person_id = ?').run(id);
    db.prepare('UPDATE departments SET head_key = NULL WHERE head_key = ?').run('p-' + id);
    db.prepare('UPDATE org_people SET reports_to = NULL WHERE reports_to = ?').run('p-' + id);
  }
  db.prepare('DELETE FROM org_people WHERE is_demo = 1').run();
  if (st && st.ws) {
    if (st.project_created) db.prepare('DELETE FROM projects WHERE id = ?').run(st.project);
    else if (st.project) db.prepare('UPDATE projects SET ws_id = NULL WHERE id = ? AND ws_id = ?').run(st.project, st.ws);
    db.prepare('DELETE FROM org_people WHERE ws_id = ?').run(st.ws);
    db.prepare('DELETE FROM memberships WHERE ws_id = ?').run(st.ws);
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(st.ws);
  }
  setting('org.demo', null);
}
function loadDemo(email) {
  seedOnce();
  if (setting('org.demo') || db.prepare('SELECT 1 FROM org_people WHERE is_demo = 1').get()) clearDemo();
  const D = Object.fromEntries(departments().map((d) => [d.name, d]));
  // a demo Plugins team with real-looking Slack work, so the charts and numbers move
  const ws = workspaces.create('Plugins team (demo)', email || 'demo@squadforge.app');
  withWorkspace(ws.id, () => require('./demo').load());
  const dev = D.Development ? D.Development.id : null;
  let proj = dev ? db.prepare("SELECT * FROM projects WHERE department_id = ? AND name = 'Plugins' AND ws_id IS NULL").get(dev) : null, created = false;
  if (!proj && dev) { const id = db.prepare("INSERT INTO projects (department_id, name, ws_id, sort) VALUES (?, 'Plugins (demo team)', ?, 0)").run(dev, ws.id).lastInsertRowid; proj = { id }; created = true; }
  else if (proj) db.prepare('UPDATE projects SET ws_id = ? WHERE id = ?').run(ws.id, proj.id);
  if (dev) db.prepare('UPDATE workspaces SET department_id = ? WHERE id = ?').run(dev, ws.id);
  const now = Date.now();
  const add = ([name, title, kind, text, reason], deptId, reportsTo) => {
    const at = new Date(now - Math.floor(Math.random() * 3 * 3600e3)).toISOString();
    const id = db.prepare('INSERT INTO org_people (name, title, department_id, reports_to, now_text, now_at, now_kind, now_reason, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
      .run(name, title, deptId, reportsTo || null, text || null, text ? at : null, kind === 'note' ? null : kind, reason || null).lastInsertRowid;
    // a few updates over the last days, for each person's recent work
    for (let i = 1; i <= 2 + (id % 3); i++) db.prepare('INSERT INTO org_updates (person_id, text, created_at) VALUES (?, ?, ?)').run(id, DEMO.history[(id + i) % DEMO.history.length], new Date(now - i * 864e5 * 1.3).toISOString());
    if (text) db.prepare('INSERT INTO org_updates (person_id, text, created_at) VALUES (?, ?, ?)').run(id, text, at);
    return 'p-' + id;
  };
  const existingCeo = directory(true).find((p) => /\bceo\b/i.test(p.title || ''));
  const ceo = existingCeo ? existingCeo.key : add(DEMO.ceo, null, null);
  for (const [dn, people] of Object.entries(DEMO.depts)) {
    const d = D[dn]; if (!d) continue;
    const head = add(people[0], d.id, ceo);
    if (!d.head_key) db.prepare('UPDATE departments SET head_key = ? WHERE id = ?').run(head, d.id);
    for (const p of people.slice(1)) add(p, d.id, head);
  }
  setting('org.demo', { ws: ws.id, project: proj ? proj.id : null, project_created: created });
  return { ok: true, team: ws.id };
}

module.exports = { loadDemo, clearDemo, org, saveProject, deleteProject, setDepartmentHead, homeWorkspace, departments, teams, saveDepartment, deleteDepartment, setTeamDepartment, directory, savePerson, deletePerson, postStatus, personForEmail, isAdmin, canSee, everyone, person };
