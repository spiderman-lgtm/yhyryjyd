// SQLite databases under DATA_DIR (Embarko keeps them across redeploys).
// Multi-workspace: the main file (squadforge.db) holds workspace 1's data plus the shared
// registry (accounts, workspaces, memberships); every other workspace gets its own file.
// `db` is a proxy: inside a request or job it talks to that workspace's database
// (AsyncLocalStorage), elsewhere to the main one.
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
// Node's built-in SQLite (no native module to build).
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const als = new AsyncLocalStorage();

// One wrapped connection: prepare/exec/transaction (nested transactions via savepoints).
function wrap(file) {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  let depth = 0;
  const cache = new Map();
  return {
    exec: (sql) => raw.exec(sql),
    prepare(sql) {
      let st = cache.get(sql);
      if (!st) {
        const s = raw.prepare(sql);
        if (typeof s.setAllowUnknownNamedParameters === 'function') s.setAllowUnknownNamedParameters(true);
        // undefined → null, and turn null-prototype rows into plain objects
        const fix = (args) => args.map((a) => (a === undefined ? null
          : a && typeof a === 'object' && !Buffer.isBuffer(a)
            ? Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v === undefined ? null : v])) : a));
        st = {
          run: (...a) => s.run(...fix(a)),
          get: (...a) => { const r = s.get(...fix(a)); return r ? { ...r } : undefined; },
          all: (...a) => s.all(...fix(a)).map((r) => ({ ...r })),
        };
        cache.set(sql, st);
      }
      return st;
    },
    transaction(fn) {
      return (...args) => {
        const sp = 'sp' + depth++;
        raw.exec(`SAVEPOINT ${sp}`);
        try { const r = fn(...args); raw.exec(`RELEASE ${sp}`); return r; }
        catch (e) { raw.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`); throw e; }
        finally { depth--; }
      };
    },
  };
}

// Committed, append-only migrations. Never drop tables we don't own
// (Embarko keeps its own _litestream_* bookkeeping tables in this file).
const MIGRATIONS = [
  `
  CREATE TABLE members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slack_user_id TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'tech',          -- tech | growth | lead
    phone TEXT,                                  -- for MSG91, with country code (91XXXXXXXXXX)
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
    actions_count INTEGER DEFAULT 0,             -- parsed from the evening update
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

// Extra schema registered by modules (tables/columns added after the first migration).
// Each entry runs on every workspace database, now and when one is opened later.
const extraSchema = [];
const open = new Map(); // workspace id → wrapped db

function migrateOne(d) {
  d.exec('CREATE TABLE IF NOT EXISTS sf_schema_version (version INTEGER NOT NULL)');
  const row = d.prepare('SELECT version FROM sf_schema_version').get();
  let v = row ? row.version : 0;
  if (!row) d.prepare('INSERT INTO sf_schema_version (version) VALUES (0)').run();
  while (v < MIGRATIONS.length) {
    d.transaction(() => { d.exec(MIGRATIONS[v]); d.prepare('UPDATE sf_schema_version SET version = ?').run(v + 1); })();
    v++;
  }
  for (const sql of extraSchema) { try { d.exec(sql); } catch { /* column already there */ } }
}

const mainDb = wrap(path.join(DATA_DIR, 'squadforge.db'));
migrateOne(mainDb);
open.set(1, mainDb);

function workspaceDb(id) {
  id = Number(id) || 1;
  if (open.has(id)) return open.get(id);
  const d = wrap(path.join(DATA_DIR, `workspace-${id}.db`));
  migrateOne(d);
  open.set(id, d);
  return d;
}
function addSchema(sql) {
  extraSchema.push(sql);
  for (const d of open.values()) { try { d.exec(sql); } catch { /* exists */ } }
}
function currentDb() { const s = als.getStore(); return (s && s.db) || mainDb; }
function currentWorkspace() { const s = als.getStore(); return (s && s.ws) || 1; }
// Run fn with `db` pointing at that workspace (requests and background jobs).
function withWorkspace(id, fn) { return als.run({ ws: Number(id) || 1, db: workspaceDb(id) }, fn); }

const db = {
  exec: (sql) => currentDb().exec(sql),
  prepare: (sql) => currentDb().prepare(sql),
  transaction: (fn) => (...a) => currentDb().transaction(fn)(...a),
};

function getSetting(key, fallback = null) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return r.value; }
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

module.exports = { db, mainDb, getSetting, setSetting, DATA_DIR, addSchema, withWorkspace, currentWorkspace, workspaceDb };
