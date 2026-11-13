// viaSocket: lead connects Slack / Gmail / Google Sheets once, SquadForge acts through that connection.
// Every call goes through the viasocket-apps package. script_id / auth_id are credentials: server only.
const { ViaSocket } = require('viasocket-apps');
const { db } = require('./db');
const { logActivity } = require('./util');

// One viaSocket end user per SquadForge workspace (only the admin login can connect).
// One viaSocket end user per workspace (workspace 1 keeps the original id so its connections stay).
const userId = () => { const ws = require('./db').currentWorkspace(); return ws === 1 ? 'squadforge-lead' : `squadforge-ws-${ws}`; };

// App catalog used by SquadForge. Action ids only scope the Connect popup's consent screen.
const APPS = {
  m91: {
    name: 'M91', icon: 'https://play-lh.googleusercontent.com/QODTxSSZQOvzmE05wWrqVrXTXom_k-wRerP9wNQC5MOOJT01IL7DKh1aqmSAfpoyAF--iBqJpqrgs4YwVRwb4w=w240-h480-rw',
    about: 'Important alerts by push, SMS and call until someone answers',
    actions: ['rowrdphmcwo6', 'rowm6gkj8ozo', 'rowqohw5b5ec'], // Send Direct Alert, Invite Direct Recipient, Get Direct Alert by ID
  },
  slack: {
    name: 'Slack', icon: 'https://stuff.thingsofbrand.com/slack.com/images/img668216333e_slack.jpg',
    about: 'Read the team channel, reply in threads, DM you',
    // Get Messages, Get Thread Replies, Send Message as Thread, Send Message, Send Direct Message,
    // List all Public Channels, Get all Channel Members
    actions: ['rowil89utzpt', 'row5hqsz299t', 'rowh44ornzyz', 'row1jrbor', 'rowovgwtt9u4', 'rowmo747gxss', 'row8ivj3pajb'],
  },
  gmail: {
    name: 'Gmail', icon: 'https://www.gstatic.com/images/branding/product/1x/gmail_2020q4_48dp.png',
    about: 'Email the Monday report to your manager',
    actions: ['rowogelpy0h6'], // Send Email
  },
  'google-sheets': {
    name: 'Google Sheets', icon: 'https://www.gstatic.com/images/branding/product/1x/sheets_2020q4_48dp.png',
    about: 'Every Monday, one row per member in a sheet',
    actions: ['rowfudy5tu2q'], // Add Multiple Rows
  },
};

require('./db').addSchema(`CREATE TABLE IF NOT EXISTS integrations (
  app TEXT PRIMARY KEY,
  auth_id TEXT NOT NULL,
  script_id TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT
)`);
require('./db').addSchema('ALTER TABLE integrations ADD COLUMN connected_by TEXT');

let client = null;
function configured() {
  return !!(process.env.VIASOCKET_ORG_ID && process.env.VIASOCKET_PROJECT_ID && process.env.VIASOCKET_EMBED_SECRET);
}
function vs() {
  if (!configured()) throw new Error('viaSocket keys are not set');
  if (!client) {
    client = new ViaSocket({
      orgId: process.env.VIASOCKET_ORG_ID,
      projectId: process.env.VIASOCKET_PROJECT_ID,
      secret: process.env.VIASOCKET_EMBED_SECRET,
    });
  }
  return client;
}
const user = () => vs().user(userId());

function row(app) {
  const r = db.prepare('SELECT * FROM integrations WHERE app = ?').get(app);
  if (!r) return null;
  return { ...r, settings: JSON.parse(r.settings || '{}') };
}
function connected(app) { const r = row(app); return !!(r && r.script_id); }
function settings(app) { const r = row(app); return r ? r.settings : {}; }
function saveSettings(app, patch) {
  const cur = settings(app);
  const next = { ...cur, ...patch };
  db.prepare('UPDATE integrations SET settings = ? WHERE app = ?').run(JSON.stringify(next), app);
  return next;
}

// For the browser: embed token (signed per user) + service ids for the Connect popup.
async function connectInfo() {
  const u = user();
  const serviceIds = {};
  for (const slug of Object.keys(APPS)) serviceIds[slug] = await u.serviceIdFor(slug);
  return { token: await u.token(), serviceIds, actions: Object.fromEntries(Object.entries(APPS).map(([k, a]) => [k, a.actions])) };
}

// After the popup posts back an auth_id: enable the app once and keep its script_id.
async function onConnected(app, authId, by = null) {
  if (!APPS[app]) throw new Error('Unknown app');
  if (!authId || typeof authId !== 'string') throw new Error('authId missing');
  const u = user();
  const scriptId = (await u.findEnabled(app)) || (await u.enable(app, authId)).scriptId;
  db.prepare(`INSERT INTO integrations (app, auth_id, script_id, connected_by) VALUES (?, ?, ?, ?)
              ON CONFLICT(app) DO UPDATE SET auth_id = excluded.auth_id, script_id = excluded.script_id, connected_by = excluded.connected_by, connected_at = datetime('now'), last_error = NULL`)
    .run(app, authId, scriptId, by);
  logActivity('scout', `🔌 ${APPS[app].name} connected${by ? ' (' + by + ')' : ''}`);
  return status();
}

async function disconnect(app) {
  const r = row(app);
  if (!r) return status();
  const u = user();
  try {
    // pause every flow on this connection first, then revoke
    const flows = await u.listFlows();
    for (const f of flows || []) {
      const id = f.id || f.scriptId || f.script_id;
      if (id && id === r.script_id) await u.setFlowStatus(id, 2);
    }
    await u.revokeConnection(r.auth_id);
  } catch (e) { logActivity('scout', `${APPS[app].name} disconnect: ${e.message}`, 'warn'); }
  db.prepare('DELETE FROM integrations WHERE app = ?').run(app);
  logActivity('scout', `🔌 ${APPS[app].name} disconnected`);
  return status();
}

async function status() {
  let conns = [];
  if (configured()) {
    try { conns = await user().listConnections(); } catch { conns = []; }
  }
  return {
    configured: configured(),
    apps: Object.entries(APPS).map(([slug, a]) => {
      const r = row(slug);
      const c = r && conns.find((x) => x && (x.id === r.auth_id || x.authId === r.auth_id));
      return {
        slug, name: a.name, icon: a.icon, about: a.about,
        connected: !!(r && r.script_id), expired: !!(c && c.isExpired),
        auth_id_for_reconnect: c && c.isExpired ? r.auth_id : undefined, // only for in-place reconnect popup
        settings: r ? r.settings : {}, last_error: r ? r.last_error : null, connected_at: r ? r.connected_at : null, connected_by: r ? r.connected_by : null,
      };
    }),
  };
}

// Run JavaScript with the user's connection (axios carries that app's credentials).
// Run one of the app's own actions through the user's enabled flow (script_id stays server-side).
async function runActionFor(app, key, version, inputData) {
  const r = row(app);
  if (!r || !r.script_id) throw new Error(`${APPS[app].name} is not connected`);
  try {
    const out = await vs().runAction(r.script_id, key, inputData, { version });
    if (r.last_error) db.prepare('UPDATE integrations SET last_error = NULL WHERE app = ?').run(app);
    return out;
  } catch (e) {
    const msg = String((e.body && (e.body.errorMsg || e.body.message)) || e.message).slice(0, 300);
    db.prepare('UPDATE integrations SET last_error = ? WHERE app = ?').run(msg, app);
    throw new Error(`${APPS[app].name}: ${msg}`);
  }
}
// The public catalog's form schema for one action (cached), read live — never typed from memory.
const schemaCache = new Map();
async function actionSchema(serviceId, actionId) {
  const k = serviceId + ':' + actionId, hit = schemaCache.get(k);
  if (hit && Date.now() - hit.at < 3600e3) return hit.schema;
  const app = await vs().catalog.versions(serviceId);
  const a = app && (app.actions || []).find((x) => x.action_id === actionId);
  if (!a) throw new Error('Action not found in the viaSocket catalog');
  schemaCache.set(k, { at: Date.now(), schema: a.input_schema || {} });
  return a.input_schema || {};
}

async function run(app, code, inputData = {}) {
  const r = row(app);
  if (!r || !r.script_id) throw new Error(`${APPS[app].name} is not connected`);
  try {
    const out = await vs().runCode(r.script_id, code, inputData);
    if (r.last_error) db.prepare('UPDATE integrations SET last_error = NULL WHERE app = ?').run(app);
    return out;
  } catch (e) {
    const msg = String((e.body && (e.body.errorMsg || e.body.message)) || e.message).slice(0, 300);
    db.prepare('UPDATE integrations SET last_error = ? WHERE app = ?').run(msg, app);
    throw new Error(`${APPS[app].name}: ${msg}`);
  }
}

// ---------- Slack (Slack Web API through the connection) ----------
const SLACK_CODE = `
const { method, params, post } = context.inputData;
const url = 'https://slack.com/api/' + method;
const r = post ? await axios.post(url, params, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
               : await axios.get(url, { params });
return r.data;`;
async function slackCall(method, params = {}, post = false) {
  const data = await run('slack', SLACK_CODE, { method, params, post });
  const body = data && data.data && data.ok === undefined ? data.data : data; // tolerate a wrapped reply
  if (!body || body.ok === false) throw new Error(`Slack ${method}: ${(body && body.error) || 'no reply'}`);
  return body;
}
function slackReady() {
  const s = settings('slack');
  return connected('slack') && !!s.channel_id && s.use_for_slack !== false;
}

// Pickers (once, after Connect)
async function slackChannels(cursor) {
  const d = await slackCall('conversations.list', { types: 'public_channel,private_channel', exclude_archived: true, limit: 200, cursor });
  return {
    options: (d.channels || []).map((c) => ({ value: c.id, label: (c.is_private ? '🔒 ' : '#') + c.name })),
    paginate: (d.response_metadata && d.response_metadata.next_cursor) || null,
  };
}
async function slackUsers(cursor) {
  const d = await slackCall('users.list', { limit: 200, cursor });
  return {
    options: (d.members || []).filter((m) => !m.is_bot && !m.deleted && m.id !== 'USLACKBOT')
      .map((m) => ({ value: m.id, label: m.real_name || m.name })),
    paginate: (d.response_metadata && d.response_metadata.next_cursor) || null,
  };
}

// ---------- Gmail ----------
const GMAIL_SEND_CODE = `
const { to, subject, text } = context.inputData;
const enc = (s) => '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
const mime = ['To: ' + to, 'Subject: ' + enc(subject), 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(text, 'utf8').toString('base64')].join('\\r\\n');
const raw = Buffer.from(mime).toString('base64').replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
const r = await axios.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw });
return { id: r.data.id, threadId: r.data.threadId };`;
async function gmailSend(to, subject, text) { return run('gmail', GMAIL_SEND_CODE, { to, subject, text }); }
async function gmailMe() {
  return run('gmail', `const r = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/profile'); return { email: r.data.emailAddress };`);
}

// ---------- Google Sheets ----------
async function sheetsList(search) {
  return run('google-sheets', `
const q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false" + (context.inputData.search ? " and name contains '" + String(context.inputData.search).replace(/'/g, "\\\\'") + "'" : '');
const r = await axios.get('https://www.googleapis.com/drive/v3/files', { params: { q, pageSize: 50, fields: 'files(id,name)', orderBy: 'modifiedTime desc' } });
return { options: r.data.files.map((f) => ({ value: f.id, label: f.name })) };`, { search: search || '' });
}
async function sheetsTabs(spreadsheetId) {
  return run('google-sheets', `
const r = await axios.get('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(context.inputData.id), { params: { fields: 'sheets.properties.title' } });
return { options: r.data.sheets.map((s) => ({ value: s.properties.title, label: s.properties.title })) };`, { id: spreadsheetId });
}
async function sheetsAppend(spreadsheetId, tab, rows) {
  return run('google-sheets', `
const { id, tab, rows } = context.inputData;
const range = "'" + tab.replace(/'/g, "''") + "'!A1";
const r = await axios.post('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(id) + '/values/' + encodeURIComponent(range) + ':append', { values: rows }, { params: { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' } });
return { updatedRange: r.data.updates && r.data.updates.updatedRange, updatedRows: r.data.updates && r.data.updates.updatedRows };`, { id: spreadsheetId, tab, rows });
}

// Test target made for the test: a new spreadsheet named "viaSocket test".
async function sheetsTest() {
  return run('google-sheets', `
const c = await axios.post('https://sheets.googleapis.com/v4/spreadsheets', { properties: { title: 'viaSocket test' } });
const id = c.data.spreadsheetId;
const tab = c.data.sheets[0].properties.title;
const r = await axios.post('https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values/' + encodeURIComponent("'" + tab + "'!A1") + ':append', { values: [['SquadForge test', new Date().toISOString()]] }, { params: { valueInputOption: 'USER_ENTERED' } });
return { spreadsheetId: id, url: c.data.spreadsheetUrl, updatedRange: r.data.updates && r.data.updates.updatedRange };`);
}

module.exports = { runActionFor, actionSchema, sheetsTest,
  userId, APPS, configured, connected, settings, saveSettings, connectInfo, onConnected, disconnect, status,
  slackCall, slackReady, slackChannels, slackUsers, gmailSend, gmailMe, sheetsList, sheetsTabs, sheetsAppend,
};
