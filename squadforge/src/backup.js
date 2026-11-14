// Backups: a consistent copy of every workspace database (VACUUM INTO), every night, 7 days kept.
// Owners can also download their workspace's database from Settings.
const fs = require('fs');
const path = require('path');
const { mainDb, workspaceDb, DATA_DIR } = require('./db');

const DIR = path.join(DATA_DIR, 'backups');
const quote = (p) => "'" + p.replace(/'/g, "''") + "'";
const dbFile = (id) => (Number(id) === 1 ? 'squadforge.db' : `workspace-${id}.db`);

function snapshot(id, target) {
  const d = Number(id) === 1 ? mainDb : workspaceDb(id);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  d.exec('VACUUM INTO ' + quote(target));
  return target;
}

function nightly(date) {
  const ws = require('./workspaces').all();
  const dir = path.join(DIR, date);
  fs.mkdirSync(dir, { recursive: true });
  for (const w of ws) snapshot(w.id, path.join(dir, dbFile(w.id)));
  // keep the newest 7 days
  const days = fs.readdirSync(DIR).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  for (const old of days.slice(0, Math.max(0, days.length - 7))) fs.rmSync(path.join(DIR, old), { recursive: true, force: true });
  return { date, workspaces: ws.length, kept: Math.min(7, days.length) };
}

function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse()
    .map((d) => ({ date: d, files: fs.readdirSync(path.join(DIR, d)).length }));
}

// A fresh copy of one workspace for download; caller streams and deletes it.
function exportWorkspace(id) {
  fs.mkdirSync(DIR, { recursive: true });
  return snapshot(id, path.join(DIR, `download-${id}-${Date.now()}.db`));
}

module.exports = { nightly, list, exportWorkspace, dbFile };
