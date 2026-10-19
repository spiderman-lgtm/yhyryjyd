// viaSocket integrations with the network stubbed: what we send, and how we read what comes back.
// Response shapes are the live ones recorded on the test connection (Google Sheets).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.VIASOCKET_ORG_ID = '4160';
process.env.VIASOCKET_PROJECT_ID = 'projTest';
process.env.VIASOCKET_EMBED_SECRET = 'test-secret';
process.env.PUBLIC_URL = 'https://dukaan-test.embarko.app';

const store = await import('../server/store.js');
const integ = await import('../server/integrations.js');
const vs = await import('../server/vs.js');
const { processInbound, createServer } = await import('../server/index.js');
const { aiToolSecret } = await import('../server/brain.js');
const clock = await import('../server/time.js');

const realFetch = globalThis.fetch;
let calls;
function stub(routes) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith('http://localhost')) return realFetch(url, init);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body, headers: init.headers });
    for (const [re, fn] of routes) if (re.test(url)) return new Response(JSON.stringify(fn(body, url)), { status: 200 });
    return new Response(JSON.stringify({ success: false, message: `unstubbed ${url}` }), { status: 404 });
  };
}

beforeEach(() => {
  store.load(':memory:');
  store.useDemoData();
  clock.resetTravel();
  clock.travel((clock.localDate(2026, 10, 14, 10, 0) - Date.now()) / 3_600_000);
});
afterEach(() => { globalThis.fetch = realFetch; });

const connect = async () => {
  stub([
    [/embed\/authentications/, () => ({ success: true, data: [
      { id: 'authS_rowqm5xi2', service_id: 'rowqm5xi2', service_name: 'Google Sheets', iconUrl: 'i.png', isExpired: false },
      { id: 'authR_row2n5tu2hd9', service_id: 'row2n5tu2hd9', service_name: 'Razorpay', iconUrl: 'r.png', isExpired: false },
    ] })],
    [/integrations$/, () => ({ success: true, data: { flows: [] } })],
    [/embed\/enable\/rowqm5xi2\/authS_rowqm5xi2/, () => ({ success: true, data: { script_id: 'scriSHEETS' } })],
    [/embed\/enable\/row2n5tu2hd9\/authR_row2n5tu2hd9/, () => ({ success: true, data: { script_id: 'scriRZP' } })],
    [/subscribe-event\/rowmibzre7ee/, () => ({ success: true, data: { script_id: 'scriSUB' } })],
    [/func\/scriSHEETS/, () => ({ success: true, data: [] })], // empty tab: Get Rows From Range A1:Z1
  ]);
  await integ.connected({ serviceId: 'rowqm5xi2', authId: 'authS_rowqm5xi2' });
  await integ.chooseSheet({ spreadsheet_id: 'SS1', spreadsheet_label: 'Orders', sheet_id: '0', sheet_label: 'Sheet1' });
  await integ.connected({ serviceId: 'row2n5tu2hd9', authId: 'authR_row2n5tu2hd9' });
};

test('embed token is HS256 over the three claims', () => {
  const [h, p, sig] = vs.embedToken('shop-1').split('.');
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { org_id: '4160', project_id: 'projTest', unique_identifier: 'shop-1' });
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).alg, 'HS256');
  assert.ok(sig.length > 20);
});

test('connect: verifies auth_id, enables, subscribes paid event; dashboard never sees script_ids', async () => {
  await connect();
  const sub = calls.find((c) => /subscribe-event\/rowmibzre7ee/.test(c.url));
  assert.equal(sub.body.auth_id, 'authR_row2n5tu2hd9');
  assert.match(sub.body.code, /api\/viasocket\/razorpay-paid/);
  assert.ok(integ.sheetsReady() && integ.razorpayReady());
  const pub = JSON.stringify(integ.publicState());
  assert.ok(!/scri(SHEETS|RZP|SUB)/.test(pub), 'script ids leaked');
  assert.ok(!pub.includes(integ.callbackSecret()));
  await assert.rejects(integ.connected({ serviceId: 'rowqm5xi2', authId: 'someone-elses' }), /not found/);
});

test('order → Sheets row (JSON rows) → Razorpay link → stage update in the same row', async () => {
  await connect();
  stub([
    [/func\/scriSHEETS/, (b) => b.action_version_id === 'rowdd8u5lg1k'
      ? { success: true, message: 'Rows added successfully.', data: { spreadsheetId: 'SS1', updates: { updatedRange: 'Sheet1!A5:L5', updatedRows: 1 } }, appendedRows: 1 }
      : { totalUpdatedCells: 3, responses: [{ updatedRange: 'Sheet1!J5:L5' }] }],
    [/func\/scriRZP/, () => ({ id: 'plink_1', short_url: 'https://rzp.io/rzp/abc', status: 'created' })],
  ]);
  await processInbound({ from: '919811111111', text: '2 cupcakes aaj 5 baje', name: 'Priya' });
  await processInbound({ from: '919811111111', text: 'haan', name: 'Priya' });
  const add = calls.find((c) => c.body?.action_version_id === 'rowdd8u5lg1k');
  assert.equal(add.body.inputData.use_json_rows, true);
  assert.equal(add.body.inputData.spreadSheet_Id, 'SS1');
  const row = JSON.parse(add.body.inputData.rows_json)[0];
  assert.deepEqual(Object.keys(row), integ.COLUMNS);
  assert.equal(row['Order ID'], '341');
  const o = store.findOrder('341');
  assert.equal(o.sheet_row, 5);
  const link = calls.find((c) => c.body?.action_version_id === 'rowx80i9iaui');
  assert.equal(link.body.inputData.amount, 60000);
  assert.equal(link.body.inputData.link_type, 'standard');
  assert.equal(link.body.inputData.notes.order_id, '341');
  assert.equal(o.payment_link.url, 'https://rzp.io/rzp/abc');
  const upd = calls.filter((c) => c.body?.action_version_id === 'row2eh6do90m').at(-1);
  assert.equal(upd.body.inputData.updates.range, 'J5:L5');
  assert.deepEqual(JSON.parse(upd.body.inputData.updates.values), [['AWAITING_PAYMENT', '', 'https://rzp.io/rzp/abc']]);
  assert.match(store.get().messages.at(-1).text, /rzp\.io\/rzp\/abc/);
});

test('Razorpay paid event from the viaSocket handler marks the order PAID', async () => {
  await connect();
  stub([[/func\/scri/, (b) => (b.action_version_id === 'rowx80i9iaui' ? { id: 'plink_1', short_url: 'https://rzp.io/x' } : { success: true, data: { updates: { updatedRange: 'Sheet1!A2:L2' } } })]]);
  await processInbound({ from: '919811111111', text: '2 cupcakes aaj 5 baje' });
  await processInbound({ from: '919811111111', text: 'haan' });
  const server = createServer().listen(0);
  const url = `http://localhost:${server.address().port}/api/viasocket/razorpay-paid`;
  const event = { payload: { payment_link: { entity: { id: 'plink_1', amount_paid: 60000, notes: { order_id: '341', shop: integ.shopUid() } } }, payment: { entity: { id: 'pay_9' } } } };
  const bad = await realFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) });
  const ok = await realFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dukaan-secret': integ.callbackSecret() }, body: JSON.stringify({ event }) });
  const other = await realFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dukaan-secret': integ.callbackSecret() }, body: JSON.stringify({ event: { notes: { order_id: '341', shop: 'another-shop' } } }) });
  server.close();
  assert.equal(bad.status, 401);
  assert.equal((await ok.json()).order_id, '341');
  assert.equal(store.findOrder('341').payment, 'PAID');
  assert.equal((await other.json()).ignored, 'no order of this shop in event');
});

test('AI tool endpoint: secret required, customer fixed by URL, items parsed', async () => {
  const server = createServer().listen(0);
  const base = `http://localhost:${server.address().port}/api/ai-tools/919811111111`;
  const nope = await realFetch(`${base}/get_order_status`, { method: 'POST', body: '{}' });
  const when = clock.addDaysLocal(1, 18).toISOString();
  const made = await realFetch(`${base}/create_order`, {
    method: 'POST', headers: { Authorization: `Bearer ${aiToolSecret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: 'choc-cake-1kg:2, brownie:3', fulfil_at: when, mode: 'pickup' }),
  }).then((r) => r.json());
  server.close();
  assert.equal(nope.status, 401);
  assert.equal(made.total, 2 * 700 + 3 * 80);
  assert.equal(store.findOrder(made.order_id).phone, '919811111111');
});

test('Embarko: tick needs CRON_SECRET; dashboard locked without ADMIN_TOKEN', async () => {
  process.env.CRON_SECRET = 'cron-123';
  const { config } = await import('../server/config.js');
  config.onEmbarko = true;
  const server = createServer().listen(0);
  const base = `http://localhost:${server.address().port}`;
  const noAuth = await realFetch(`${base}/tasks/tick`);
  const okTick = await realFetch(`${base}/tasks/tick`, { headers: { Authorization: 'Bearer cron-123' } });
  const locked = await realFetch(`${base}/api/orders`);
  server.close();
  config.onEmbarko = false;
  assert.equal(noAuth.status, 401);
  assert.equal(okTick.status, 200);
  assert.match(await okTick.text(), /tick ok/);
  assert.equal(locked.status, 503);
});
