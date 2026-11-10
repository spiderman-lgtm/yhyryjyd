// End-to-end: Slack API mocked, real DB + agents.
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-flow-'));
process.env.SLACK_BOT_TOKEN = 'xoxb-test';
process.env.SLACK_CHANNEL_ID = 'C1';
process.env.LEAD_SLACK_USER_ID = 'ULEAD';
delete process.env.ANTHROPIC_API_KEY;

const now = Date.now() / 1000;
const ts = (minAgo) => (now - minAgo * 60).toFixed(6);
const T = { std: ts(300), req: ts(200), g: ts(30) };
const history = [
  { ts: T.std, user: 'UBOT', bot_id: 'B1', text: 'Good morning team! Aaj ka plan daalo', reply_count: 2, latest_reply: ts(250) },
  { ts: T.req, user: 'ULEAD', text: 'Client request: Kommo CRM plugin chahiye <@UA>', reply_count: 4, latest_reply: ts(40) },
  { ts: T.g, user: 'UG', text: 'Kommo ke credentials aa gaye, ab app bana do' },
];
const replies = {
  [T.std]: [{ ts: ts(260), user: 'UA', text: 'Plan:\n- Kommo r&d\n- Zoho fix' }, { ts: ts(250), user: 'UB', text: '- Shopify triggers' }],
  [T.req]: [
    { ts: ts(190), user: 'UA', text: 'r&d kar raha hu' },
    { ts: ts(150), user: 'UA', text: 'started' },
    { ts: ts(100), user: 'UA', text: 'stuck - API doc missing hai' },
    { ts: ts(40), user: 'UA', text: 'review please, actions ready' },
  ],
};
const posted = [];
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = u.pathname.split('/').pop();
  let body = { ok: true };
  if (method === 'conversations.history') body = { ok: true, messages: history };
  if (method === 'conversations.replies') { const t = u.searchParams.get('ts'); body = { ok: true, messages: [{ ts: t }, ...(replies[t] || [])] }; }
  if (method === 'chat.postMessage') { posted.push(JSON.parse(opts.body)); body = { ok: true, ts: '1.1' }; }
  if (method === 'conversations.open') body = { ok: true, channel: { id: 'D1' } };
  return { status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body), ok: true };
};

const { db, setSetting } = require('../src/db');
const scout = require('../src/agents/scout');
const herald = require('../src/agents/herald');
const scribe = require('../src/agents/scribe');
const { teamMetrics } = require('../src/metrics');
const U = require('../src/util');

test('full sync flow', async () => {
  const add = db.prepare('INSERT INTO members (name, slack_user_id, role) VALUES (?, ?, ?)');
  add.run('Aarav', 'UA', 'tech'); add.run('Bela', 'UB', 'tech'); add.run('Gita', 'UG', 'growth');
  const r = await scout.sync();
  assert.ok(!r.error, r.error);

  const req = db.prepare('SELECT * FROM client_requests').get();
  assert.equal(req.title, 'Kommo CRM plugin chahiye');
  assert.equal(req.status, 'stuck');
  assert.match(req.stuck_reason, /API doc missing/);
  assert.ok(req.rnd_at && req.started_at);
  assert.deepEqual(JSON.parse(req.assigned_member_ids), [1]);

  const logs = db.prepare('SELECT * FROM daily_logs ORDER BY member_id').all();
  assert.equal(logs.length, 2);
  assert.equal(logs[0].planned_count, 2);

  const g = db.prepare('SELECT * FROM growth_items').get();
  assert.equal(g.kind, 'credentials');
  assert.equal(g.unblocked_request_id, req.id);
  assert.ok(posted.some((p) => p.thread_ts === T.req && /Unblocked/.test(p.text)), 'unblock posted in thread');

  const rv = db.prepare('SELECT * FROM reviews').get();
  assert.equal(rv.status, 'pending');
  assert.equal(rv.request_id, req.id);

  // idempotent second sync
  await scout.sync();
  assert.equal(db.prepare('SELECT COUNT(*) c FROM request_events').get().c, 4);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM growth_items').get().c, 1);

  // completion
  replies[T.req].push({ ts: ts(5), user: 'UA', text: 'completed ✅ published' });
  history[1].latest_reply = ts(5);
  setSetting('scout.last_ts', ts(20));
  await scout.sync();
  const done = db.prepare('SELECT * FROM client_requests').get();
  assert.equal(done.status, 'completed');
  assert.ok(done.difficulty >= 1);

  const m = teamMetrics(U.today(), U.today());
  const aarav = m.members.find((x) => x.name === 'Aarav');
  assert.equal(aarav.requests_completed, 1);

  const h = await herald.evening();
  assert.match(h.text || h.message, /Aarav|Sunday/);
  const w = await scribe.run();
  assert.match(w.message, /Weekly report/);
});
