// Workspace registry (in the main database): one workspace per team, people join by email.
// Roles: owner / admin (full dashboard), manager (read-only manager view) and viewer (live views only).
const { mainDb: db } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS memberships (
  ws_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ws_id, email)
)`);
// Workspace 1 holds the data from before workspaces existed.
if (!db.prepare('SELECT 1 FROM workspaces WHERE id = 1').get()) {
  db.prepare("INSERT INTO workspaces (id, name) VALUES (1, ?)").run(process.env.FIRST_WORKSPACE_NAME || 'Plugins team');
}

const norm = (e) => String(e || '').trim().toLowerCase();
const envAdmins = () => String(process.env.ADMIN_EMAILS || '').split(',').map(norm).filter(Boolean);

function get(id) { return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(Number(id)); }
// Workspaces this email can open, with its role in each (env admins own workspace 1).
function forEmail(email) {
  const e = norm(email);
  const rows = e ? db.prepare(`SELECT w.id, w.name, m.role FROM memberships m JOIN workspaces w ON w.id = m.ws_id WHERE m.email = ? ORDER BY w.id`).all(e) : [];
  if (e && envAdmins().includes(e) && !rows.find((r) => r.id === 1)) rows.unshift({ ...get(1), role: 'owner' });
  return rows;
}
function roleIn(email, wsId) {
  const e = norm(email), id = Number(wsId) || 1;
  if (id === 1 && envAdmins().includes(e)) return 'owner';
  const r = e ? db.prepare('SELECT role FROM memberships WHERE ws_id = ? AND email = ?').get(id, e) : null;
  return r ? r.role : null;
}
function create(name, ownerEmail) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n) throw new Error('Give the workspace a name');
  const info = db.prepare('INSERT INTO workspaces (name, created_by) VALUES (?, ?)').run(n, norm(ownerEmail));
  db.prepare("INSERT INTO memberships (ws_id, email, role) VALUES (?, ?, 'owner')").run(info.lastInsertRowid, norm(ownerEmail));
  return get(info.lastInsertRowid);
}
function rename(id, name) { db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(String(name).trim().slice(0, 60), id); return get(id); }
function members(id) { return db.prepare('SELECT email, role, created_at FROM memberships WHERE ws_id = ? ORDER BY role, email').all(Number(id)); }
function invite(id, email, role) {
  const e = norm(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Enter a valid email');
  const r = ['admin', 'manager', 'viewer'].includes(role) ? role : 'viewer';
  db.prepare(`INSERT INTO memberships (ws_id, email, role) VALUES (?, ?, ?) ON CONFLICT(ws_id, email) DO UPDATE SET role = excluded.role`).run(Number(id), e, r);
  return members(id);
}
function remove(id, email) {
  const e = norm(email);
  const owners = db.prepare("SELECT COUNT(*) c FROM memberships WHERE ws_id = ? AND role = 'owner'").get(Number(id)).c;
  const isOwner = db.prepare("SELECT 1 FROM memberships WHERE ws_id = ? AND email = ? AND role = 'owner'").get(Number(id), e);
  if (isOwner && owners <= 1) throw new Error('A workspace needs at least one owner');
  db.prepare('DELETE FROM memberships WHERE ws_id = ? AND email = ?').run(Number(id), e);
  return members(id);
}
function all() { return db.prepare('SELECT * FROM workspaces ORDER BY id').all(); }

module.exports = { get, forEmail, roleIn, create, rename, members, invite, remove, all };
