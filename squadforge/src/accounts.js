// Sign-up accounts: email + scrypt password hash. Role is decided at login from ADMIN_EMAILS
// (admins), everyone else is a viewer of the live views.
const crypto = require('crypto');
const { db } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const hashOf = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

function find(email) { return db.prepare('SELECT * FROM accounts WHERE email = ?').get(String(email).toLowerCase()); }
function create(email, name, pw, role) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO accounts (email, name, salt, hash, role) VALUES (?, ?, ?, ?, ?)').run(email.toLowerCase(), name || null, salt, hashOf(pw, salt), role);
  return find(email);
}
function verify(acct, pw) {
  const a = Buffer.from(hashOf(pw, acct.salt), 'hex'), b = Buffer.from(acct.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function list() { return db.prepare('SELECT id, email, name, role, created_at FROM accounts ORDER BY created_at DESC').all(); }
function remove(id) { db.prepare('DELETE FROM accounts WHERE id = ?').run(id); }

module.exports = { find, create, verify, list, remove };
