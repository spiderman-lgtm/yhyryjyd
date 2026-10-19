// Persistence for the server's JSON stores.
// DATABASE_URL set → one Postgres row per store (survives redeploys without a volume).
// Otherwise → JSON files in DATA_DIR.

const fs = require('fs');
const path = require('path');

function createStorage({ dataDir, databaseUrl }) {
  const pool = databaseUrl ? new (require('pg').Pool)({ connectionString: databaseUrl, max: 3 }) : null;
  const timers = {};
  const dirty = new Map();
  const chains = {};
  const pending = new Map();
  let ready = !pool;

  function file(name) { return path.join(dataDir, `${name}.json`); }

  function load(name, defaults) {
    try { return { ...defaults, ...JSON.parse(fs.readFileSync(file(name), 'utf8')) }; }
    catch { return { ...defaults }; }
  }

  function writeFile(name, obj) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file(name) + '.tmp', JSON.stringify(obj));
    fs.renameSync(file(name) + '.tmp', file(name));
  }

  function writeDb(name, obj) {
    // serialize per store so an older snapshot never lands after a newer one
    chains[name] = (chains[name] || Promise.resolve())
      .then(() => pool.query(
        `INSERT INTO hr_store (name, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [name, JSON.stringify(obj)]))
      .catch(e => console.error(`[storage] save ${name} failed:`, e.message));
    return chains[name];
  }

  function writeNow(name, obj) {
    dirty.delete(name);
    clearTimeout(timers[name]);
    if (pool) return writeDb(name, obj);
    try { writeFile(name, obj); } catch (e) { console.error(`[storage] save ${name} failed:`, e.message); }
  }

  function save(name, obj) {
    if (!ready) { pending.set(name, obj); return; }
    dirty.set(name, obj);
    clearTimeout(timers[name]);
    timers[name] = setTimeout(() => writeNow(name, obj), 200);
  }

  // Writes everything still waiting on its debounce timer; call before the process exits.
  async function flush() {
    await Promise.all([...dirty].map(([name, obj]) => writeNow(name, obj)));
    await Promise.all(Object.values(chains));
    if (pool) await pool.end().catch(() => {});
  }

  // Loads every store from Postgres into the given objects (mutated in place).
  async function hydrate(stores) {
    if (!pool) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS hr_store (
      name text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await pool.query('SELECT name, data FROM hr_store');
    const inDb = new Set();
    for (const r of rows) {
      if (stores[r.name]) { Object.assign(stores[r.name], r.data); inDb.add(r.name); }
    }
    // First boot on a fresh database: carry over whatever the local files had.
    await Promise.all(Object.entries(stores).filter(([n]) => !inDb.has(n)).map(([n, o]) => writeDb(n, o)));
    ready = true;
    for (const [name, obj] of pending) save(name, obj);
    pending.clear();
  }

  return { load, save, flush, hydrate, kind: pool ? 'postgres' : 'files' };
}

module.exports = { createStorage };
