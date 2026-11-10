// SQLite database. File lives under DATA_DIR (Embarko keeps it across redeploys).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'squadforge.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Committed, append-only migrations. Never drop tables we don't own
// (Embarko keeps its own _litestream_* bookkeeping tables in this file).
const MIGRATIONS = [
  `
  CREATE TABLE members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slack_user_id TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'tech',          -- tech | growth | lead
    phone TEXT,                                  -- MSG91 ke liye, country code ke saath (91XXXXXXXXXX)
    active INTEGER NOT NULL DEFAULT 1,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    date TEXT NOT NULL,                          -- YYYY-MM-DD (IST)
    morning_text TEXT, morning_ts TEXT,
    evening_text TEXT, evening_ts TEXT,
    planned_count INTEGER DEFAULT 0,
    done_count INTEGER DEFAULT 0,
    actions_count INTEGER DEFAULT 0,             -- shaam ke update se parse kiya hua
    triggers_count INTEGER DEFAULT 0,
    apps_count INTEGER DEFAULT 0,
    summary TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    UNIQUE(member_id, date)
  );

  CREATE TABLE publishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,                          -- action | trigger | app
    plugin TEXT, name TEXT,
    date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',       -- manual | webhook
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE client_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_ts TEXT UNIQUE,
    channel TEXT,
    title TEXT NOT NULL,
    text TEXT,
    assigned_member_ids TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'new',          -- new | rnd | started | stuck | completed
    stuck_reason TEXT,
    created_at TEXT NOT NULL,
    rnd_at TEXT, started_at TEXT, stuck_at TEXT, completed_at TEXT,
    stuck_count INTEGER NOT NULL DEFAULT 0,
    difficulty INTEGER,                          -- 1..5
    ai_analysis TEXT,
    last_reply_ts TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE request_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES client_requests(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    reason TEXT,
    member_id INTEGER,
    slack_ts TEXT,
    at TEXT NOT NULL
  );

  CREATE TABLE growth_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,                          -- support_request | app_listing | blog | newsletter | credentials | other
    app_name TEXT,
    text TEXT,
    slack_ts TEXT UNIQUE,
    unblocked_request_id INTEGER,
    date TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    request_id INTEGER,
    subject TEXT,
    submission TEXT,
    slack_ts TEXT UNIQUE,
    thread_ts TEXT,
    status TEXT NOT NULL DEFAULT 'pending',      -- pending | done | skipped
    errors_count INTEGER NOT NULL DEFAULT 0,
    findings TEXT,                               -- JSON
    summary TEXT,
    passed INTEGER,
    attempt INTEGER NOT NULL DEFAULT 1,
    date TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    tagged TEXT NOT NULL DEFAULT '[]',
    important INTEGER NOT NULL DEFAULT 0,
    slack_ts TEXT,
    sms_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE agent_status (
    agent TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'idle',          -- idle | working | error
    message TEXT,
    last_run_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,                          -- weekly | personal | daily
    period_start TEXT, period_end TEXT,
    content TEXT NOT NULL,
    data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_logs_date ON daily_logs(date);
  CREATE INDEX idx_pub_date ON publishes(date);
  CREATE INDEX idx_req_status ON client_requests(status);
  CREATE INDEX idx_activity_id ON activity(id);
  `,
];

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS sf_schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM sf_schema_version').get();
  let v = row ? row.version : 0;
  if (!row) db.prepare('INSERT INTO sf_schema_version (version) VALUES (0)').run();
  while (v < MIGRATIONS.length) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.prepare('UPDATE sf_schema_version SET version = ?').run(v + 1);
    })();
    v++;
  }
}
migrate();

function getSetting(key, fallback = null) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return r.value; }
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

module.exports = { db, getSetting, setSetting, DATA_DIR };
