import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../server/store.js';
import * as clock from '../server/time.js';
import { processInbound, createServer } from '../server/index.js';
import { parseItems, parseWhen } from '../server/rules.js';
import { stage } from '../server/orders.js';
import * as sch from '../server/scheduler.js';
import { heuristic } from '../server/analyzer.js';
import { parseWebhook } from '../server/whatsapp.js';
import { callbackSecret } from '../server/integrations.js';
import { creds } from '../server/whatsapp.js';

const CUST = '919811111111';
const OWNER = '919000000001';
const say = async (from, text) => {
  const n = store.get().messages.length;
  await processInbound({ from, text, name: 'Priya' });
  return store.get().messages.slice(n).filter((m) => m.direction === 'out').map((m) => m.text).join('\n');
};
// Pin the clock to a weekday 10:00 IST so tests don't depend on when they run.
const pin = () => { clock.resetTravel(); const target = clock.localDate(2026, 10, 14, 10, 0); clock.travel((target - Date.now()) / 3_600_000); };

beforeEach(() => { store.load(':memory:'); pin(); });

test('parses Hinglish items and times', () => {
  assert.deepEqual(parseItems('2 chocolate cake aur ek brownie'), [{ item_id: 'choc-cake-1kg', qty: 2 }, { item_id: 'brownie', qty: 1 }]);
  const w = parseWhen('kal shaam 6 baje');
  assert.equal(w.day, 1);
  assert.equal(clock.parts(w.date).h, 18);
  assert.equal(clock.parts(parseWhen('parso subah 11 baje').date).h, 11);
});

test('order → confirm → payment link → paid', async () => {
  assert.match(await say(CUST, '2 chocolate cake chahiye kal'), /what time/);
  assert.match(await say(CUST, 'shaam 6 baje'), /₹1,400[\s\S]*confirm/);
  const r = await say(CUST, 'haan');
  assert.match(r, /Order #341 is confirmed/);
  assert.match(r, /\/pay\/341/);
  const o = store.findOrder('341');
  assert.equal(stage(o), 'AWAITING_PAYMENT');
  assert.ok(store.get().flow_log.some((f) => f.flow === 'save_order'));
  assert.ok(store.get().flow_log.some((f) => f.flow === 'create_payment_link'));

  const server = createServer().listen(0);
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}/api/viasocket/payment-received`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dukaan-secret': callbackSecret() }, body: JSON.stringify({ order_id: '341', amount: 1400, payment_id: 'pay_1' }),
  });
  const forged = await fetch(`http://localhost:${port}/api/viasocket/payment-received`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: '341' }),
  });
  server.close();
  assert.equal(forged.status, 401);
  assert.equal(res.status, 200);
  assert.equal(stage(o), 'PAID');
  assert.match(store.get().messages.at(-1).text, /Payment received ✅/);
});

test('partial payment does not mark paid', async () => {
  await say(CUST, '1 red velvet kal 5 baje'); await say(CUST, 'haan');
  const { markPaid } = await import('../server/orders.js');
  const r = await markPaid('341', { amount: 100 });
  assert.equal(r.partial, true);
  assert.notEqual(store.findOrder('341').payment, 'PAID');
});

test('lead time is enforced', async () => {
  assert.match(await say(CUST, '1 red velvet aaj 2 baje'), /24 hours/);
});

test('pickup reminder fires once, 2h before', async () => {
  await say(CUST, '2 cupcakes aaj 5 baje'); await say(CUST, 'haan');
  await sch.tick();
  assert.equal(store.findOrder('341').reminders.fulfilment_sent_at, undefined);
  clock.travel(5.5); await sch.tick(); await sch.tick();
  const sent = store.get().messages.filter((m) => m.kind === 'pickup_reminder');
  assert.equal(sent.length, 1);
});

test('udhaar ladder: polite → firm → escalate, one per day, never at night', async () => {
  await say(CUST, '1 brownie aaj 12 baje'); await say(CUST, 'haan');
  await say(OWNER, '341 done');
  const kinds = () => store.get().messages.filter((m) => /reminder_|escalation/.test(m.kind || '')).map((m) => m.kind);
  clock.travel(26); await sch.tick(); // +1 day, noon
  assert.deepEqual(kinds(), ['reminder_polite']);
  await sch.tick();
  assert.deepEqual(kinds(), ['reminder_polite']);
  clock.travel(48); await sch.tick(); // day 3
  assert.deepEqual(kinds(), ['reminder_polite', 'reminder_firm']);
  clock.travel(96 + 10); // day 7, 10 PM → quiet hours
  await sch.tick();
  assert.equal(kinds().length, 2);
  clock.travel(12); await sch.tick(); // next morning
  assert.deepEqual(kinds(), ['reminder_polite', 'reminder_firm', 'escalation']);
  assert.equal(stage(store.findOrder('341')), 'ESCALATED');
  assert.equal(store.get().messages.filter((m) => m.kind === 'escalation')[0].phone, OWNER);
});

test('paused customer gets no udhaar reminders', async () => {
  await say(CUST, '1 brownie aaj 12 baje'); await say(CUST, 'haan');
  await say(OWNER, '341 done');
  assert.match(await say(OWNER, 'pause 9811111111'), /paused/);
  clock.travel(26); await sch.tick();
  assert.equal(store.get().messages.filter((m) => /reminder_/.test(m.kind || '')).length, 0);
});

test('owner commands in English and Hinglish: today, paid, report, due', async () => {
  await say(CUST, '2 cupcakes aaj 5 baje'); await say(CUST, 'haan');
  assert.match(await say(OWNER, 'today'), /#341/);
  assert.match(await say(OWNER, 'aaj'), /#341/);
  assert.match(await say(OWNER, '341 paid'), /marked paid/);
  assert.match(await say(OWNER, 'report'), /1 order, ₹600 collected, 0 people/);
  assert.match(await say(OWNER, 'due'), /Nobody owes/);
  assert.match(await say(OWNER, 'kuch bhi'), /Owner commands/);
});

test('monthly report goes once on the last day after 9 PM', async () => {
  await say(CUST, '2 cupcakes aaj 5 baje'); await say(CUST, 'haan');
  const end = clock.localDate(2026, 10, 31, 21, 30);
  clock.travel((end - clock.now()) / 3_600_000);
  await sch.tick(); await sch.tick();
  const reports = store.get().messages.filter((m) => m.kind === 'monthly_report');
  assert.equal(reports.length, 1);
  assert.match(reports[0].text, /This month: 1 order, ₹0 collected, 1 person still owes/);
});

test('app analyzer: GO, duplicate NO-GO, fit penalty', () => {
  assert.equal(heuristic({ app: 'Shiprocket' }, { type: 'boutique' }, []).verdict, 'GO');
  assert.equal(heuristic({ app: 'Khatabook' }, { type: 'bakery' }, []).verdict, 'NO-GO');
  const cash = heuristic({ app: 'Cashfree' }, { type: 'bakery' }, ['Razorpay']);
  assert.ok(cash.notes.some((n) => /Duplicate/.test(n)));
  assert.ok(heuristic({ app: 'Google Calendar' }, { type: 'bakery' }, []).score < heuristic({ app: 'Google Calendar' }, { type: 'salon' }, []).score);
  assert.equal(heuristic({ app: 'Porter', goal: 'delivery order PAID hote hi porter book ho' }, { type: 'bakery' }, []).category, 'shipping');
});

test('owner connects a GO app over WhatsApp, refuses NO-GO', async () => {
  assert.match(await say(OWNER, 'connect Shiprocket'), /GO \(\d+\/100\)[\s\S]*Connect it/);
  assert.match(await say(OWNER, 'yes'), /connected/);
  assert.ok(store.get().connected_apps.some((a) => a.name === 'Shiprocket'));
  assert.match(await say(OWNER, 'khatabook jod do'), /NO-GO[\s\S]*Not connecting/);
});

test('whatsapp webhook parsing and verification', async () => {
  const msgs = parseWebhook({ entry: [{ changes: [{ value: { contacts: [{ wa_id: '91999', profile: { name: 'Amit' } }], messages: [{ from: '91999', id: 'x', type: 'text', text: { body: 'hi' } }] } }] }] });
  assert.deepEqual(msgs, [{ from: '91999', name: 'Amit', text: 'hi', id: 'x' }]);
  const server = createServer().listen(0);
  const port = server.address().port;
  const ok = await fetch(`http://localhost:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${creds().verifyToken}&hub.challenge=42`);
  const bad = await fetch(`http://localhost:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`);
  server.close();
  assert.equal(await ok.text(), '42');
  assert.equal(bad.status, 403);
});
