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
    people.push({ key: `p-${p.id}`, kind: 'manual', role: 'manual', name: p.name, title: p.title || '', email: p.email || null, department: depts[p.department_id] || null, team: null, reports_to: p.reports_to || null, org_id: p.id, now_text: p.now_text, now_at: p.now_at });
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
  db.prepare('UPDATE org_people SET now_text = ?, now_at = ? WHERE id = ?').run(t, now, id);
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
  if (p.kind === 'manual') return p.now_text ? { kind: 'note', text: p.now_text, since: p.now_at } : { kind: 'none', text: 'No update yet' };
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
    built: rows.reduce((n, r) => n + (r._d.prof ? r._d.prof.totals.built : 0), 0),
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
  return {
    company: setting('org.company') || 'viaSocket', admin, ceo: ceo ? mini(ceo) : null, departments: depts, total: stat(list),
    teams: admin ? teams().map((t) => ({ id: t.id, name: t.name })) : [], people: admin ? list.map((p) => ({ key: p.key, name: p.name, title: p.title || '' })) : [],
  };
}

module.exports = { org, saveProject, deleteProject, setDepartmentHead, homeWorkspace, departments, teams, saveDepartment, deleteDepartment, setTeamDepartment, directory, savePerson, deletePerson, postStatus, personForEmail, isAdmin, canSee, everyone, person };
