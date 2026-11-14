// One-time email codes for creating an account and for signing in without a password.
// 6 digits, 10 minutes, 5 tries; at most 5 emails per address per hour. Only a hash is stored.
const crypto = require('crypto');
const { mainDb: db } = require('./db');
const mailer = require('./mailer');

db.exec(`CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT NOT NULL, purpose TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, payload TEXT,
  expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sends TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (email, purpose)
)`);
const TEN_MIN = 10 * 60 * 1000, HOUR = 3600 * 1000;
const hash = (code, salt) => crypto.createHash('sha256').update(salt + ':' + code).digest('hex');

// payload undefined = keep what the earlier code carried (e.g. the workspace name from sign-up)
async function issue(email, purpose, payload) {
  const row = db.prepare('SELECT sends, payload FROM email_codes WHERE email = ? AND purpose = ?').get(email, purpose);
  if (payload === undefined) payload = row && row.payload ? JSON.parse(row.payload) : {};
  const sends = (row ? JSON.parse(row.sends) : []).filter((t) => Date.now() - t < HOUR);
  if (sends.length >= 5) throw Object.assign(new Error('Too many codes sent — try again in an hour'), { status: 429 });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const salt = crypto.randomBytes(8).toString('hex');
  const subject = `${code} is your SquadForge code`;
  const text = `Your SquadForge ${purpose === 'signup' ? 'sign-up' : 'sign-in'} code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, ignore this email.\n\n— SquadForge`;
  await mailer.send(email, subject, text);
  db.prepare(`INSERT INTO email_codes (email, purpose, salt, hash, payload, expires_at, attempts, sends) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
              ON CONFLICT(email, purpose) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, payload = excluded.payload, expires_at = excluded.expires_at, attempts = 0, sends = excluded.sends`)
    .run(email, purpose, salt, hash(code, salt), JSON.stringify(payload), Date.now() + TEN_MIN, JSON.stringify([...sends, Date.now()]));
  return true;
}

// → payload on success; throws with a clear message otherwise
function check(email, purpose, code) {
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ? AND purpose = ?').get(email, purpose);
  if (!row) throw new Error('Ask for a new code');
  if (row.expires_at < Date.now()) throw new Error('This code has expired — ask for a new one');
  if (row.attempts >= 5) throw new Error('Too many wrong codes — ask for a new one');
  const good = hash(String(code || '').replace(/\D/g, ''), row.salt);
  if (good.length !== row.hash.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(row.hash))) {
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?').run(email, purpose);
    throw new Error('That code is not right');
  }
  db.prepare("UPDATE email_codes SET hash = '', expires_at = 0 WHERE email = ? AND purpose = ?").run(email, purpose); // one use
  return JSON.parse(row.payload || '{}');
}

module.exports = { issue, check };
