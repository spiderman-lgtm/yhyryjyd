// Sign-up accounts: email + scrypt password hash. Role is decided at login from ADMIN_EMAILS
// (admins), everyone else is a viewer of the live views.
const crypto = require('crypto');
const { mainDb: db } = require('./db'); // accounts are shared across workspaces

db.exec(`CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// Accounts made before email codes existed count as verified.
try { db.exec('ALTER TABLE accounts ADD COLUMN verified INTEGER NOT NULL DEFAULT 1'); } catch { /* already there */ }

const hashOf = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

function find(email) { return db.prepare('SELECT * FROM accounts WHERE email = ?').get(String(email).toLowerCase()); }
function create(email, name, pw, role, verified = 1) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO accounts (email, name, salt, hash, role, verified) VALUES (?, ?, ?, ?, ?, ?)').run(email.toLowerCase(), name || null, salt, hashOf(pw, salt), role, verified ? 1 : 0);
  return find(email);
}
// An unverified sign-up tried again: take the new name and password.
function resetUnverified(email, name, pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE accounts SET name = ?, salt = ?, hash = ? WHERE email = ? AND verified = 0').run(name || null, salt, hashOf(pw, salt), String(email).toLowerCase());
}
function markVerified(email) { db.prepare('UPDATE accounts SET verified = 1 WHERE email = ?').run(String(email).toLowerCase()); }
function verify(acct, pw) {
  const a = Buffer.from(hashOf(pw, acct.salt), 'hex'), b = Buffer.from(acct.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function list() { return db.prepare('SELECT id, email, name, role, created_at FROM accounts ORDER BY created_at DESC').all(); }
function remove(id) { db.prepare('DELETE FROM accounts WHERE id = ?').run(id); }

module.exports = { find, create, verify, list, remove, resetUnverified, markVerified };
