// End-to-end checks over HTTP against a real server process (temporary data folder).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let proc;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-api-'));

async function call(p, { method = 'GET', body, token, ws } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-SF-Session'] = token;
  if (ws) headers['X-SF-Workspace'] = String(ws);
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.arrayBuffer(), headers: res.headers };
}
const login = async (email, password) => (await call('/api/login', { method: 'POST', body: { email, password } })).data.token;

before(async () => {
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: 'adminpass1', ADMIN_EMAILS: 'lead@viasocket.com', CRON_SECRET: 'cs', SESSION_SECRET: 'test-secret', ALLOWED_SIGNUP_DOMAINS: 'viasocket.com', M91_SEND_LINK: '', SLACK_BOT_TOKEN: '', ANTHROPIC_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/api/health')).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { if (proc) proc.kill(); });

test('admin can sign in; wrong passwords lock the email after 5 tries', async () => {
  assert.ok(await login('lead@viasocket.com', 'adminpass1'));
  for (let i = 0; i < 5; i++) assert.equal((await call('/api/login', { method: 'POST', body: { email: 'x@viasocket.com', password: 'nope' } })).status, 401);
  assert.equal((await call('/api/login', { method: 'POST', body: { email: 'x@viasocket.com', password: 'nope' } })).status, 429);
});

test('create account: allowed domain or invited only; each workspace keeps its own data', async () => {
  assert.equal((await call('/api/signup', { method: 'POST', body: { email: 'someone@gmail.com', name: 'S', password: 'password9', workspace: 'X' } })).status, 403);
  const r = await call('/api/signup', { method: 'POST', body: { email: 'neha@viasocket.com', name: 'Neha', password: 'password9', workspace: 'Growth team' } });
  assert.equal(r.status, 200);
  const neha = r.data.token, ws = r.data.workspace;
  const lead = await login('lead@viasocket.com', 'adminpass1');
  await call('/api/demo/load', { method: 'POST', token: lead });
  assert.ok((await call('/api/members', { token: lead })).data.length > 0, 'workspace 1 has the demo team');
  assert.equal((await call('/api/members', { token: neha, ws })).data.length, 0, 'the new workspace starts empty');
  // invited gmail can join without the domain
  await call('/api/workspace/people', { method: 'POST', token: neha, ws, body: { email: 'friend@gmail.com', role: 'viewer' } });
  assert.equal((await call('/api/signup', { method: 'POST', body: { email: 'friend@gmail.com', name: 'F', password: 'password9' } })).status, 200);
});

test('viewer sees Right now only; manager sees the Manager view and profiles, read-only', async () => {
  const lead = await login('lead@viasocket.com', 'adminpass1');
  await call('/api/workspace/people', { method: 'POST', token: lead, body: { email: 'v@viasocket.com', role: 'viewer' } });
  await call('/api/workspace/people', { method: 'POST', token: lead, body: { email: 'boss@viasocket.com', role: 'manager' } });
  const v = (await call('/api/signup', { method: 'POST', body: { email: 'v@viasocket.com', name: 'V', password: 'password9' } })).data.token;
  const b = (await call('/api/signup', { method: 'POST', body: { email: 'boss@viasocket.com', name: 'B', password: 'password9' } })).data.token;
  assert.equal((await call('/api/now', { token: v })).status, 200);
  assert.equal((await call('/api/members', { token: v })).status, 403);
  assert.equal((await call('/api/manager', { token: b })).status, 200);
  const now = (await call('/api/now', { token: b })).data;
  assert.ok(now.people.length > 0);
  assert.equal((await call(`/api/member/${now.people[0].id}/profile`, { token: b })).status, 200);
  assert.equal((await call('/api/broadcast', { method: 'POST', token: b, body: { message: 'hello' } })).status, 403);
});

test('leave days drop out of the tally and the target', async () => {
  const lead = await login('lead@viasocket.com', 'adminpass1');
  const now = (await call('/api/now', { token: lead })).data;
  const p = now.people.find((x) => x.role === 'tech');
  assert.equal((await call('/api/leave', { method: 'POST', token: lead, body: { member_id: p.id, on: true } })).status, 200);
  const after = (await call('/api/now', { token: lead })).data.people.find((x) => x.id === p.id);
  assert.equal(after.leave, true);
  assert.equal(after.met, false);
  const tally = (await call(`/api/standup/tally?date=${now.date}`, { token: lead })).data;
  assert.match(tally.short, new RegExp(`${p.name.replace(/[()]/g, '.')}.*on leave`));
});

test('backups: nightly job and owner download; viewers cannot download', async () => {
  assert.equal((await fetch(BASE + '/cron/backup', { headers: { Authorization: 'Bearer cs' } })).status, 200);
  const lead = await login('lead@viasocket.com', 'adminpass1');
  const list = (await call('/api/backups', { token: lead })).data;
  assert.ok(list.length >= 1);
  const dl = await call('/api/backup', { token: lead });
  assert.equal(dl.status, 200);
  assert.ok(Buffer.from(dl.data).subarray(0, 15).toString().startsWith('SQLite format'));
  const v = await login('v@viasocket.com', 'password9');
  assert.equal((await call('/api/backup', { token: v })).status, 403);
});

test('system health answers for admins', async () => {
  const lead = await login('lead@viasocket.com', 'adminpass1');
  const h = await call('/api/health/status', { token: lead });
  assert.equal(h.status, 200);
  assert.equal(h.data.slack.mode, 'off');
  assert.equal((await call('/api/health/status', { token: await login('v@viasocket.com', 'password9') })).status, 403);
});
