// Work module: tasks, contribution verification, and the manager insights built on top of the
// records (queue, where to intervene, blocked work, deadline risks, contributions that matter,
// journeys) plus the member-side "My Work". Rules are fixed and explainable — no scoring of people.
const { db } = require('./db');
const { today, tzMod, addDays, hoursBetween, memberById, members, logActivity } = require('./util');

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  request_id INTEGER,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo',      -- todo | doing | blocked | done
  progress INTEGER NOT NULL DEFAULT 0,      -- 0..100
  blocker TEXT,
  evidence_url TEXT, evidence_note TEXT, evidence_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);
CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, text TEXT, by TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                        -- task | request
  ref_id INTEGER NOT NULL,
  status TEXT NOT NULL,                      -- verified | needs_evidence
  note TEXT, by TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, ref_id)
);
`);
for (const sql of ['ALTER TABLE members ADD COLUMN email TEXT', 'ALTER TABLE client_requests ADD COLUMN analysis_ack TEXT']) {
  try { db.exec(sql); } catch { /* already there */ }
}

const nowIso = () => new Date().toISOString();
const name = (id) => { const m = id ? memberById(id) : null; return m ? m.name : 'Unassigned'; };
const firstName = (n) => String(n || '').replace(/\s*\(.*\)/, '').split(' ')[0];
const sqlTime = (s) => (s && !String(s).includes('T') ? String(s).replace(' ', 'T') + 'Z' : s);
const hoursSince = (iso) => (iso ? hoursBetween(sqlTime(iso), nowIso()) : null);

// ---------- tasks ----------
function taskView(t) {
  const v = db.prepare('SELECT status, note, by, at FROM verifications WHERE kind = ? AND ref_id = ?').get('task', t.id);
  return { ...t, member: t.member_id ? name(t.member_id) : null, verification: v || null };
}
function listTasks({ member_id } = {}) {
  const rows = member_id
    ? db.prepare('SELECT * FROM tasks WHERE member_id = ? ORDER BY status = \'done\', due_date IS NULL, due_date, id DESC').all(member_id)
    : db.prepare('SELECT * FROM tasks ORDER BY status = \'done\', due_date IS NULL, due_date, id DESC LIMIT 500').all();
  return rows.map(taskView);
}
function getTask(id) { const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id); return t ? taskView(t) : null; }
function event(taskId, kind, text, by) { db.prepare('INSERT INTO task_events (task_id, kind, text, by) VALUES (?, ?, ?, ?)').run(taskId, kind, text || null, by || null); }

function createTask(b, by) {
  const title = String(b.title || '').trim().slice(0, 200);
  if (!title) throw new Error('A task needs a title');
  const info = db.prepare(`INSERT INTO tasks (title, description, member_id, request_id, due_date, status, progress, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(title, b.description || null, b.member_id ? Number(b.member_id) : null, b.request_id ? Number(b.request_id) : null, b.due_date || null, ['todo', 'doing', 'blocked', 'done'].includes(b.status) ? b.status : 'todo', 0, by || null);
  event(info.lastInsertRowid, 'created', `Created${b.member_id ? ' for ' + name(Number(b.member_id)) : ''}${b.due_date ? ', due ' + b.due_date : ''}`, by);
  logActivity('tracker', `New task: "${title}"${b.member_id ? ' → ' + name(Number(b.member_id)) : ''}`);
  return getTask(info.lastInsertRowid);
}
function updateTask(id, b, by) {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!t) throw new Error('Task not found');
  const n = { ...t };
  ['title', 'description', 'due_date', 'blocker', 'evidence_url', 'evidence_note'].forEach((k) => { if (b[k] !== undefined) n[k] = b[k] === '' ? null : String(b[k]).slice(0, 2000); });
  if (b.member_id !== undefined) n.member_id = b.member_id ? Number(b.member_id) : null;
  if (b.progress !== undefined) n.progress = Math.max(0, Math.min(100, Math.round(Number(b.progress) || 0)));
  if (b.status && ['todo', 'doing', 'blocked', 'done'].includes(b.status)) n.status = b.status;
  if (n.status === 'done') { n.progress = 100; n.done_at = t.done_at || nowIso(); } else n.done_at = null;
  if (n.status !== 'blocked' && b.status) n.blocker = n.status === 'blocked' ? n.blocker : (b.blocker !== undefined ? n.blocker : null);
  if ((b.evidence_url !== undefined && b.evidence_url !== t.evidence_url) || (b.evidence_note !== undefined && b.evidence_note !== t.evidence_note)) n.evidence_at = nowIso();
  db.prepare(`UPDATE tasks SET title=?, description=?, member_id=?, due_date=?, status=?, progress=?, blocker=?, evidence_url=?, evidence_note=?, evidence_at=?, done_at=?, updated_at=datetime('now') WHERE id=?`)
    .run(n.title, n.description, n.member_id, n.due_date, n.status, n.progress, n.blocker, n.evidence_url, n.evidence_note, n.evidence_at, n.done_at, id);
  if (n.status !== t.status) event(id, 'status', `${t.status} → ${n.status}${n.status === 'blocked' && n.blocker ? ': ' + n.blocker : ''}`, by);
  else if (n.progress !== t.progress) event(id, 'progress', `${n.progress}% done`, by);
  if (n.evidence_at !== t.evidence_at) event(id, 'evidence', n.evidence_note || n.evidence_url || 'Evidence added', by);
  if (n.status === 'done' && t.status !== 'done') logActivity('tracker', `Task done: "${n.title}" (${name(n.member_id)})`);
  return getTask(id);
}
function deleteTask(id) { db.prepare('DELETE FROM tasks WHERE id = ?').run(id); }

// ---------- verification (contribution reviews) ----------
function verify(kind, refId, status, note, by) {
  if (!['task', 'request'].includes(kind) || !['verified', 'needs_evidence'].includes(status)) throw new Error('Bad verification');
  db.prepare(`INSERT INTO verifications (kind, ref_id, status, note, by, at) VALUES (?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(kind, ref_id) DO UPDATE SET status = excluded.status, note = excluded.note, by = excluded.by, at = excluded.at`)
    .run(kind, refId, status, note || null, by || null);
  if (kind === 'task') event(refId, status === 'verified' ? 'verified' : 'evidence_requested', note || (status === 'verified' ? 'Outcome verified' : 'More evidence requested'), by);
  logActivity('scribe', status === 'verified' ? `✓ Outcome verified (${kind} #${refId})` : `More evidence asked for (${kind} #${refId})`);
}
const verOf = (kind, id) => db.prepare('SELECT * FROM verifications WHERE kind = ? AND ref_id = ?').get(kind, id);

// ---------- insights ----------
function requestRows() {
  return db.prepare('SELECT * FROM client_requests ORDER BY created_at DESC LIMIT 400').all().map((r) => ({ ...r, assigned: JSON.parse(r.assigned_member_ids || '[]') }));
}
function lastMove(r) {
  const e = db.prepare('SELECT at FROM request_events WHERE request_id = ? ORDER BY at DESC LIMIT 1').get(r.id);
  return (e && e.at) || r.created_at;
}

function queue() {
  const since = addDays(today(), -30);
  const reqs = requestRows();
  const submissions = db.prepare(`SELECT * FROM reviews WHERE status = 'pending' ORDER BY id DESC`).all()
    .map((r) => ({ kind: 'review', id: r.id, title: r.subject || 'Review', who: name(r.member_id), at: r.date }));
  const analyses = reqs.filter((r) => r.status === 'completed' && r.ai_analysis && !r.analysis_ack)
    .map((r) => ({ kind: 'request', id: r.id, title: r.title, who: r.assigned.map(name).join(', '), text: r.ai_analysis, difficulty: r.difficulty }));
  const decisions = reqs.filter((r) => r.status === 'new' && !r.assigned.length)
    .map((r) => ({ kind: 'request', id: r.id, title: r.title, at: r.created_at, waited: Math.round(hoursSince(r.created_at) || 0) }));
  const outcomes = [];
  reqs.filter((r) => r.status === 'completed' && (r.completed_at || '').slice(0, 10) >= since && !verOf('request', r.id))
    .forEach((r) => outcomes.push({ kind: 'request', id: r.id, title: r.title, who: r.assigned.map(name).join(', '), at: r.completed_at, evidence: [r.impact_note, r.evidence_url].filter(Boolean).join(' · ') || null }));
  db.prepare(`SELECT * FROM tasks WHERE status = 'done' AND date(done_at, '${tzMod()}') >= ?`).all(since).filter((t) => !verOf('task', t.id))
    .forEach((t) => outcomes.push({ kind: 'task', id: t.id, title: t.title, who: name(t.member_id), at: t.done_at, evidence: t.evidence_url || t.evidence_note || null }));
  const evidence = [];
  db.prepare(`SELECT * FROM verifications WHERE status = 'needs_evidence'`).all().forEach((v) => {
    if (v.kind === 'task') {
      const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(v.ref_id); if (!t) return;
      const answered = t.evidence_at && sqlTime(t.evidence_at) > sqlTime(v.at);
      evidence.push({ kind: 'task', id: t.id, title: t.title, who: name(t.member_id), note: v.note, answered, evidence: t.evidence_url || t.evidence_note });
    } else {
      const r = db.prepare('SELECT * FROM client_requests WHERE id = ?').get(v.ref_id); if (!r) return;
      evidence.push({ kind: 'request', id: r.id, title: r.title, who: JSON.parse(r.assigned_member_ids || '[]').map(name).join(', '), note: v.note, answered: false });
    }
  });
  return { submissions, analyses, decisions, outcomes, evidence };
}

// Fixed, explainable rules → what the manager could do next. Never about blame.
function interventions() {
  const out = [];
  const reqs = requestRows();
  for (const r of reqs) {
    if (r.status === 'stuck') {
      const h = hoursSince(r.stuck_at) || 0;
      if (h >= 24) out.push({ id: `blk-r${r.id}`, severity: h >= 72 ? 'high' : 'medium', kind: 'long_blocker', title: `“${r.title}” has been blocked for ${Math.round(h)}h`,
        context: r.stuck_reason || 'Waiting on something outside the team', suggestion: /credential|doc|access|sandbox|api/i.test(r.stuck_reason || '') ? 'Ask growth/support to chase the credentials or docs, or pause it and reassign time.' : 'Check in on what would unblock it; consider pairing someone with context.', link: { tab: 'requests' } });
    } else if (['rnd', 'started'].includes(r.status)) {
      const h = hoursSince(lastMove(r)) || 0;
      if (h >= 48) out.push({ id: `stl-r${r.id}`, severity: 'medium', kind: 'stalled', title: `“${r.title}” hasn't moved in ${Math.round(h / 24)} days`, context: `Last status: ${r.status === 'rnd' ? 'R&D' : 'Started'} · ${r.assigned.map(name).join(', ') || 'unassigned'}`, suggestion: 'A quick thread reply asking for the next step usually gets it moving.', link: { tab: 'requests' } });
    } else if (r.status === 'new' && !r.assigned.length) {
      const h = hoursSince(r.created_at) || 0;
      if (h >= 4) out.push({ id: `dec-r${r.id}`, severity: h >= 24 ? 'high' : 'low', kind: 'decide', title: `“${r.title}” is waiting for an owner (${Math.round(h)}h)`, context: 'New client request with nobody assigned', suggestion: 'Assign it, or reply in the thread with when it can start.', link: { tab: 'requests' } });
    }
  }
  db.prepare(`SELECT * FROM reviews WHERE status = 'pending'`).all().forEach((rv) => {
    const h = rv.date ? (Date.now() - new Date(rv.date + 'T12:00:00Z')) / 36e5 : 0;
    if (h >= 24) out.push({ id: `rev-${rv.id}`, severity: 'medium', kind: 'pending_review', title: `Review waiting: ${rv.subject || 'submission'}`, context: `${name(rv.member_id)} asked for a review`, suggestion: 'Add review instructions / an AI key so Inspector can run, or review it by hand.', link: { tab: 'reviews' } });
  });
  for (const t of db.prepare(`SELECT * FROM tasks WHERE status != 'done'`).all()) {
    const due = t.due_date, d = today();
    if (due && due < d) out.push({ id: `od-t${t.id}`, severity: 'high', kind: 'risky_deadline', title: `“${t.title}” is past its due date (${due})`, context: `${name(t.member_id)} · ${t.progress}% done${t.blocker ? ' · blocked: ' + t.blocker : ''}`, suggestion: 'Agree a new date or cut scope — and remove the blocker if there is one.', link: { tab: 'tasks' } });
    else if (due && due <= addDays(d, 2) && t.progress < 50) out.push({ id: `ar-t${t.id}`, severity: 'medium', kind: 'risky_deadline', title: `“${t.title}” is due ${due === d ? 'today' : 'soon'} at ${t.progress}%`, context: name(t.member_id), suggestion: 'Check if it needs help or a smaller first version.', link: { tab: 'tasks' } });
    if (t.status === 'blocked' && (hoursSince(t.updated_at) || 0) >= 24) out.push({ id: `blk-t${t.id}`, severity: 'medium', kind: 'long_blocker', title: `Task blocked: “${t.title}”`, context: t.blocker || 'No reason given', suggestion: 'Find who can unblock it and connect them.', link: { tab: 'tasks' } });
  }
  // two workdays in a row without a check-in: a nudge, never a penalty
  const d1 = addDays(today(), -1), d2 = addDays(today(), -2);
  members().filter((m) => m.role !== 'lead').forEach((m) => {
    const c = db.prepare(`SELECT COUNT(*) c FROM daily_logs WHERE member_id = ? AND date IN (?, ?) AND (morning_text IS NOT NULL OR evening_text IS NOT NULL)`).get(m.id, d1, d2).c;
    const wd = [d1, d2].filter((x) => new Date(x + 'T12:00:00Z').getUTCDay() !== 0).length;
    if (wd === 2 && c === 0) out.push({ id: `ci-${m.id}`, severity: 'low', kind: 'check_in', title: `No check-ins from ${firstName(m.name)} for 2 days`, context: 'Could be leave, deep work or a missed thread', suggestion: 'A friendly hello — not a reminder — is usually enough.', link: { tab: 'team' } });
  });
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 20);
}

// Who is waiting on what — shown as context, never a fault.
function blocked() {
  const growth = members().find((m) => m.role === 'growth');
  const out = [];
  requestRows().filter((r) => r.status === 'stuck').forEach((r) => {
    const who = r.assigned.length ? r.assigned.map(name) : ['Unassigned'];
    const needs = /credential|doc|access|sandbox|account|api key/i.test(r.stuck_reason || '') ? 'credentials or docs from the client' : /review|approval/i.test(r.stuck_reason || '') ? 'a review or approval' : 'something outside the team';
    out.push({ kind: 'request', id: r.id, what: r.title, who: who.join(', '), since: r.stuck_at, hours: Math.round(hoursSince(r.stuck_at) || 0), context: r.stuck_reason || 'Reason not shared yet', waitingOn: needs, helper: needs.startsWith('credentials') && growth ? growth.name : null });
  });
  db.prepare(`SELECT * FROM tasks WHERE status = 'blocked'`).all().forEach((t) => out.push({ kind: 'task', id: t.id, what: t.title, who: name(t.member_id), since: t.updated_at, hours: Math.round(hoursSince(t.updated_at) || 0), context: t.blocker || 'Reason not shared yet', waitingOn: 'an unblock', helper: null }));
  return out.sort((a, b) => b.hours - a.hours);
}

function deadlineRisks() {
  const d = today(), overdue = [], atRisk = [], stalled = [];
  db.prepare(`SELECT * FROM tasks WHERE status != 'done'`).all().forEach((t) => {
    const v = { id: t.id, title: t.title, who: name(t.member_id), due: t.due_date, progress: t.progress, status: t.status, blocker: t.blocker };
    if (t.due_date && t.due_date < d) overdue.push({ ...v, days: Math.round((new Date(d) - new Date(t.due_date)) / 864e5) });
    else if (t.due_date && t.due_date <= addDays(d, 2) && (t.progress < 50 || t.status === 'blocked')) atRisk.push(v);
    else if ((hoursSince(t.updated_at) || 0) >= 72) stalled.push({ ...v, idleDays: Math.round((hoursSince(t.updated_at) || 0) / 24) });
  });
  return { overdue, at_risk: atRisk, stalled };
}

// Notable work with the reason it matters. Chronological — not a ranking.
function contributions(from, to) {
  const out = [];
  db.prepare(`SELECT * FROM client_requests WHERE status = 'completed' AND date(completed_at, '${tzMod()}') BETWEEN ? AND ?`).all(from, to).forEach((r) => {
    const reasons = [];
    if (r.difficulty >= 4) reasons.push(`Complex work (difficulty ${r.difficulty}/5)`);
    if (r.stuck_count > 0) reasons.push('Got through a blocker');
    const v = verOf('request', r.id); if (v && v.status === 'verified') reasons.push('Outcome verified by the lead');
    const firstPass = db.prepare(`SELECT 1 FROM reviews WHERE request_id = ? AND attempt = 1 AND passed = 1`).get(r.id); if (firstPass) reasons.push('Passed review first time');
    if (!reasons.length) reasons.push('Client request delivered');
    out.push({ kind: 'request', id: r.id, title: r.title, who: JSON.parse(r.assigned_member_ids || '[]').map(name).join(', ') || '—', date: (r.completed_at || '').slice(0, 10), reasons, verified: !!(v && v.status === 'verified') });
  });
  db.prepare(`SELECT * FROM tasks WHERE status = 'done' AND date(done_at, '${tzMod()}') BETWEEN ? AND ?`).all(from, to).forEach((t) => {
    const reasons = []; const v = verOf('task', t.id);
    if (v && v.status === 'verified') reasons.push('Outcome verified by the lead');
    if (t.evidence_url || t.evidence_note) reasons.push('Evidence attached');
    if (db.prepare(`SELECT 1 FROM task_events WHERE task_id = ? AND kind = 'status' AND text LIKE '%blocked%'`).get(t.id)) reasons.push('Worked through a blocker');
    if (reasons.length) out.push({ kind: 'task', id: t.id, title: t.title, who: name(t.member_id), date: (t.done_at || '').slice(0, 10), reasons, verified: !!(v && v.status === 'verified') });
  });
  db.prepare(`SELECT g.*, r.title rt FROM growth_items g JOIN client_requests r ON r.id = g.unblocked_request_id WHERE g.date BETWEEN ? AND ?`).all(from, to)
    .forEach((g) => out.push({ kind: 'growth', id: g.id, title: `Unblocked “${g.rt}”`, who: name(g.member_id), date: g.date, reasons: ['Brought in the credentials/docs the team was waiting on'], verified: false }));
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function journey(kind, id) {
  const ev = [];
  if (kind === 'request') {
    const r = db.prepare('SELECT * FROM client_requests WHERE id = ?').get(id); if (!r) throw new Error('Not found');
    db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY at').all(id).forEach((e) => ev.push({ at: e.at, icon: { new: '📨', rnd: '🔎', started: '🔨', stuck: '🧱', completed: '✅' }[e.status], text: { new: 'Request came in', rnd: 'R&D started', started: 'Building started', stuck: `Blocked — ${e.reason || ''}`, completed: 'Completed' }[e.status], who: e.member_id ? name(e.member_id) : null }));
    db.prepare('SELECT * FROM reviews WHERE request_id = ? ORDER BY id').all(id).forEach((rv) => ev.push({ at: rv.date + 'T12:00:00Z', icon: '🔍', text: rv.status === 'pending' ? `Review requested (attempt ${rv.attempt})` : `Review ${rv.passed ? 'passed' : 'asked for ' + rv.errors_count + ' fix(es)'} (attempt ${rv.attempt})`, who: name(rv.member_id) }));
    if (r.ai_analysis) ev.push({ at: r.completed_at || r.created_at, icon: '🤖', text: `Analysis: ${r.ai_analysis}` });
    const v = verOf('request', id); if (v) ev.push({ at: sqlTime(v.at), icon: v.status === 'verified' ? '🏅' : '📎', text: v.status === 'verified' ? `Outcome verified${v.note ? ' — ' + v.note : ''}` : `More evidence asked for${v.note ? ' — ' + v.note : ''}`, who: v.by });
    return { title: r.title, events: ev.sort((a, b) => String(a.at).localeCompare(String(b.at))) };
  }
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id); if (!t) throw new Error('Not found');
  db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY at').all(id).forEach((e) => ev.push({ at: sqlTime(e.at), icon: { created: '📝', status: '🔁', progress: '📈', evidence: '📎', verified: '🏅', evidence_requested: '❓' }[e.kind] || '•', text: e.text, who: e.by }));
  return { title: t.title, events: ev };
}

// Member side: my tasks, my evidence (done work), today's check-in
function myWork(memberId) {
  const m = memberById(memberId); if (!m) throw new Error('No member profile linked to this account');
  const tasks = listTasks({ member_id: memberId });
  const reqs = db.prepare(`SELECT r.* FROM client_requests r, json_each(r.assigned_member_ids) j WHERE j.value = ? ORDER BY r.created_at DESC LIMIT 50`).all(memberId);
  const evidence = [
    ...tasks.filter((t) => t.status === 'done').map((t) => ({ kind: 'task', id: t.id, title: t.title, date: (t.done_at || '').slice(0, 10), evidence: t.evidence_url || t.evidence_note, verification: t.verification })),
    ...reqs.filter((r) => r.status === 'completed').map((r) => ({ kind: 'request', id: r.id, title: r.title, date: (r.completed_at || '').slice(0, 10), evidence: null, verification: verOf('request', r.id) || null })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND date = ?').get(memberId, today()) || null;
  return { member: { id: m.id, name: m.name, role: m.role }, tasks, requests: reqs.map((r) => ({ id: r.id, title: r.title, status: r.status, stuck_reason: r.stuck_reason })), evidence, today: log };
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, verify, queue, interventions, blocked, deadlineRisks, contributions, journey, myWork };
