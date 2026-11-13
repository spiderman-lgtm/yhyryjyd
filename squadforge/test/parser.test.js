const { test } = require('node:test');
const assert = require('node:assert');
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'sf-'));
const P = require('../src/parser');

test('status detection', () => {
  assert.equal(P.detectStatus('r&d kar raha hu, dekhta hu ban sakta hai ki nahi'), 'rnd');
  assert.equal(P.detectStatus('started'), 'started');
  assert.equal(P.detectStatus('stuck hu, API doc missing hai'), 'stuck');
  assert.equal(P.detectStatus('app completed and published ✅'), 'completed');
  assert.equal(P.detectStatus('ho gaya'), 'completed');
  assert.equal(P.detectStatus('abhi done nahi hua, working on it'), 'started');
  assert.equal(P.detectStatus('status: stuck - credentials nahi mile'), 'stuck');
  assert.equal(P.detectStatus('thanks'), null);
});

test('counts and items', () => {
  assert.deepEqual(P.parseCounts('Aaj 3 actions aur 2 triggers publish kiye, 1 app'), { actions: 3, triggers: 2, apps: 1 });
  assert.deepEqual(P.parseCounts('actions: 4'), { actions: 4, triggers: 0, apps: 0 });
  assert.equal(P.countItems('Plan:\n- a\n- b\n- c'), 3);
});

test('request + standup + growth', () => {
  assert.ok(P.isRequest('Client request: Zoho Bigin plugin chahiye <@U1>'));
  assert.equal(P.requestTitle('Client request: Zoho Bigin plugin chahiye <@U1>'), 'Zoho Bigin plugin chahiye');
  assert.equal(P.standupKind('Good morning team! Aaj ka plan daalo'), 'morning');
  assert.equal(P.standupKind('EOD update thread'), 'evening');
  assert.equal(P.growthKind('Kommo ke credentials aa gaye, ab app bana do'), 'credentials');
  assert.equal(P.growthKind('Naya blog publish hua'), 'blog');
  assert.ok(P.mentionsApp('Kommo ke credentials aa gaye', 'Kommo CRM actions'));
});

test('website plug-request form is a client request with the app as title', () => {
  const P = require('../src/parser');
  const t = 'Request for plug :\n\nuser Email: demo@example.com\nuser Name: Demo User\nuse Case: Need integration for this App.\nplug Name: Archbee\nsource: website\nenvironment: prod\nuser Need: New App\n\nApp name -  Archbee';
  assert.equal(P.isRequest(t), true);
  assert.equal(P.requestTitle(t), 'Archbee — New App');
  assert.equal(P.plugRequest(t).source, 'website');
});

test('an app posted with its actions/triggers list is a submission and is counted', () => {
  const P = require('../src/parser');
  const t = 'Archbee done ✅\nactions: create doc, update doc, delete doc\ntriggers: new doc, doc updated';
  assert.equal(P.isAppSubmission(t), true);
  assert.deepEqual([P.parseCounts(t).actions, P.parseCounts(t).triggers], [3, 2]);
  assert.equal(P.isAppSubmission('Archbee — 6 actions, 4 triggers done'), false);
  assert.equal(P.parseCounts('Archbee — 6 actions, 4 triggers done').actions, 6);
});
