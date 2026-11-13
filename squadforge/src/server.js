// SquadForge HTTP server (no framework). Embarko: reads PORT, binds 0.0.0.0.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, getSetting, setSetting, withWorkspace } = require('./db');
const workspaces = require('./workspaces');
const history = require('./history');
const checklist = require('./checklist');
const manager = require('./manager');
const U = require('./util');
const slack = require('./slack');
const llm = require('./llm');
const msg91 = require('./msg91');
const metrics = require('./metrics');
const agents = require('./agents');
const herald = require('./agents/herald');
const analyst = require('./agents/analyst');
const scribe = require('./agents/scribe');
const scout = require('./agents/scout');
const inspector = require('./agents/inspector');
const commander = require('./agents/commander');
const tracker = require('./agents/tracker');
const demo = require('./demo');
const { DEFAULTS } = require('./parser');
const vs = require('./viasocket');
const accounts = require('./accounts');
const m91 = require('./m91');
const work = require('./work');
const scribeAgent = require('./agents/scribe');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const BUILD = Date.now().toString(36);

// ---------- auth ----------
function sessionSecret() {
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update('sf:' + (process.env.ADMIN_PASSWORD || 'open')).digest('hex');
}
function sign(v) { return crypto.createHmac('sha256', sessionSecret()).update(v).digest('hex'); }
// Admin emails: only these can log in as admin (and manage Integrations). Comma separated env var.
function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');
function makeSession(role, email = '') {
  const exp = Date.now() + 30 * 864e5;
  const payload = `${role}.${b64(email)}.${exp}`;
  return `${payload}.${sign(payload)}`;
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
// { role: 'admin' | 'viewer', email } or null. 'admin' = full dashboard; 'viewer' = process views only.
function sessionOf(req) {
  if (!process.env.ADMIN_PASSWORD) return { role: 'admin', email: null, open: true }; // no password set: open
  // cookie, or the X-SF-Session header (kept in the browser) for proxies that drop cookies
  const s = req.headers['x-sf-session'] || cookies(req).sf_session;
  if (!s) return null;
  const parts = String(s).split('.');
  if (parts.length !== 4) return null;
  const [role, em, exp, sig] = parts;
  if (!['admin', 'viewer'].includes(role) || Number(exp) < Date.now()) return null;
  const good = sign(`${role}.${em}.${exp}`);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const email = unb64(em);
  return { role, email };
}
// Which workspace this request is for, and the person's rights there.
//   owner/admin of that workspace → 'admin' (full dashboard); viewer → live views only.
//   Workspace 1 (the original team) keeps the old rules: ADMIN_EMAILS are owners, the viewer
//   password gives live views, and an account that belongs to no workspace can watch it.
function contextOf(req) {
  const se = sessionOf(req);
  if (!se) return null;
  const asked = Number(req.headers['x-sf-workspace']) || 0;
  if (se.open) return { ws: asked || 1, role: 'admin', email: null, wsRole: 'owner' };
  if (!se.email) return { ws: 1, role: se.role === 'admin' && !adminEmails().length ? 'admin' : 'viewer', email: null, wsRole: se.role };
  const mine = workspaces.forEmail(se.email);
  let ws = asked && mine.find((w) => w.id === asked) ? asked : (mine[0] ? mine[0].id : 1);
  let wsRole = workspaces.roleIn(se.email, ws);
  if (!wsRole && ws === 1 && !mine.length) wsRole = 'viewer';
  if (!wsRole) return null;
  return { ws, role: ['owner', 'admin'].includes(wsRole) ? 'admin' : wsRole === 'manager' ? 'manager' : 'viewer', email: se.email, wsRole, workspaces: mine };
}
// The viewer can only see these (read-only)
const VIEWER_ROUTES = ['/api/state', '/api/requests', '/api/logs'];
function safeEqual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- helpers ----------
function send(res, code, body, headers = {}) {
  const isStr = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(isStr ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 2e6) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  if (file.endsWith('index.html')) {
    // cache-bust: every deploy gets new asset URLs, so browsers never run an old script or stylesheet
    const html = fs.readFileSync(file, 'utf8').replace(/(src|href)="\/([\w.-]+\.(?:js|css))"/g, `$1="/$2?v=${BUILD}"`);
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function memberName(id) { const m = U.memberById(id); return m ? m.name : '?'; }
function requestView(r) {
  const ids = JSON.parse(r.assigned_member_ids || '[]');
  return {
    ...r,
    assigned: ids.map((id) => ({ id, name: memberName(id) })),
    hours: U.hoursBetween(r.started_at || r.rnd_at || r.created_at, r.completed_at || new Date().toISOString()),
    link: r.slack_ts ? slack.permalinkish(r.channel || U.cfg('SLACK_CHANNEL_ID'), r.slack_ts) : null,
    events: db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY at').all(r.id).map((e) => ({ ...e, member: e.member_id ? memberName(e.member_id) : null })),
  };
}

const SETTING_KEYS = [
  'cfg.SLACK_CHANNEL_ID', 'cfg.LEAD_SLACK_USER_ID', 'cfg.ALERT_CHANNEL_ID', 'cfg.SLACK_WORKSPACE_URL',
  'cfg.REQUEST_KEYWORDS', 'cfg.MORNING_KEYWORDS', 'cfg.EVENING_KEYWORDS', 'cfg.REVIEW_KEYWORDS',
  'inspector.instructions', 'herald.channel_reminder', 'herald.sunday', 'growth.notify_thread',
];

// Background job runner for cron routes (Embarko: reply fast, keep working).
function background(key, label, fn) {
  setImmediate(() => U.runAgent(key, label, fn).catch((e) => console.error(e)));
}

// ---------- routes ----------
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const body = ['POST', 'PATCH', 'PUT'].includes(m) ? await readBody(req) : {};

  if (p === '/api/health') return send(res, 200, { ok: true });
  if (p === '/api/me') {
    const cx = contextOf(req);
    const acct = cx && cx.email ? accounts.find(cx.email) : null;
    const list = cx ? (cx.workspaces && cx.workspaces.length ? cx.workspaces : [{ ...workspaces.get(cx.ws), role: cx.wsRole }]) : [];
    return send(res, 200, {
      authed: !!cx, role: cx ? cx.role : null, email: cx ? cx.email : null, name: acct ? acct.name : null,
      workspace: cx ? { id: cx.ws, name: (workspaces.get(cx.ws) || {}).name, role: cx.wsRole } : null,
      workspaces: list.map((w) => ({ id: w.id, name: w.name, role: w.role })),
      password_set: !!process.env.ADMIN_PASSWORD, admin_emails_set: adminEmails().length > 0,
    });
  }
  const issue = (role, email, extra = {}) => {
    const token = makeSession(role, email || '');
    console.log(`[login] ok: ${role}${email ? ' (' + email.replace(/(.).*@/, '$1***@') + ')' : ''}`);
    return send(res, 200, { ok: true, role, token, ...extra }, { 'Set-Cookie': `sf_session=${token}; HttpOnly; Path=/; Max-Age=${30 * 86400}; SameSite=Lax; Secure` });
  };
  // Create account = a new account that owns its own workspace (team).
  // Someone already invited to a workspace can leave the workspace name empty and just join.
  if ((p === '/api/signup' || p === '/api/workspace-signup') && m === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim().slice(0, 60);
    const pw = String(body.password || '').trim();
    const wsName = String(body.workspace || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Please enter a valid email' });
    const invited = workspaces.forEmail(email);
    if (!wsName && !invited.length) return send(res, 400, { error: 'Give your workspace a name (for example, your team name)' });
    const acct = accounts.find(email);
    if (acct) {
      if (!wsName) return send(res, 409, { error: 'An account with this email already exists — sign in instead' });
      if (!accounts.verify(acct, pw)) return send(res, 401, { error: 'This email already has an account — use its password' });
    } else {
      if (pw.length < 8) return send(res, 400, { error: 'Password must be at least 8 characters' });
      accounts.create(email, name, pw, 'viewer');
    }
    const ws = wsName ? workspaces.create(wsName, email) : invited[0];
    console.log(wsName ? `[workspace] created #${ws.id}` : `[signup] joined invited workspace #${ws.id}`);
    return issue(adminEmails().includes(email) ? 'admin' : 'viewer', email, { created: true, workspace: ws.id, joined: !wsName });
  }
  if (p === '/api/login' && m === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    // phones and password managers often add a trailing space: compare trimmed values
    const pw = String(body.password || '').trim();
    const acct = email ? accounts.find(email) : null;
    if (acct) {
      if (!accounts.verify(acct, pw)) { console.log('[login] wrong password for an existing account'); return send(res, 401, { error: 'Wrong password' }); }
      const role = adminEmails().includes(email) ? 'admin' : 'viewer';
      return issue(role, email);
    }
    const adminPw = String(process.env.ADMIN_PASSWORD || '').trim();
    const viewerPw = String(process.env.VIEWER_PASSWORD || '').trim();
    if (adminPw && safeEqual(pw, adminPw)) {
      if (adminEmails().length && !adminEmails().includes(email)) {
        console.log(`[login] admin password ok but email not on the list (email ${email ? 'given' : 'empty'})`);
        return send(res, 403, { error: email ? 'This email is not on the admin list' : 'Please enter your admin email' });
      }
      return issue('admin', email);
    }
    if (viewerPw && safeEqual(pw, viewerPw)) return issue('viewer', '');
    // diagnostics without the secret: lengths only
    console.log(`[login] wrong password (typed ${pw.length} chars, admin password is ${adminPw.length} chars; email ${email ? (adminEmails().includes(email) ? 'on list' : 'no account') : 'empty'})`);
    return send(res, 401, { error: email && !adminEmails().includes(email) ? 'No account for this email — create one first' : 'Wrong password' });
  }
  if (p === '/api/logout' && m === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': 'sf_session=; Path=/; Max-Age=0' });

  const cx = contextOf(req);
  if (!cx) return send(res, sessionOf(req) ? 403 : 401, { error: sessionOf(req) ? 'You are not a member of this workspace' : 'Please log in' });
  return withWorkspace(cx.ws, () => {
    if (m !== 'GET') auditOnSuccess(req, res, p, m, body, cx);
    return routes(req, res, url, p, m, body, cx);
  });
}

// History: note what a person changed, once the change succeeded.
const SETTING_NAMES = { 'cfg.SLACK_CHANNEL_ID': 'Slack channel', 'cfg.LEAD_SLACK_USER_ID': 'lead Slack ID', 'cfg.ALERT_CHANNEL_ID': 'alert channel', 'cfg.SLACK_WORKSPACE_URL': 'Slack workspace URL', 'inspector.instructions': 'Inspector rules' };
function auditOnSuccess(req, res, p, m, body, cx) {
  const d = require('./db').workspaceDb(cx.ws);
  const actor = cx.email ? (accounts.find(cx.email) || {}).name || cx.email : 'Admin';
  const member = (id) => d.prepare('SELECT name FROM members WHERE id = ?').get(id) || {};
  const reqRow = (id) => d.prepare('SELECT title FROM client_requests WHERE id = ?').get(id) || {};
  let mm, ev = null;
  // read names before the handler runs (deletes remove them)
  if ((mm = p.match(/^\/api\/requests\/(\d+)$/))) {
    const t = reqRow(mm[1]).title;
    if (m === 'DELETE') ev = ['requests', `Deleted request “${t}”`];
    else {
      const what = [body.member_ids && 'assignees', body.difficulty && `difficulty ${body.difficulty}/5`, body.title && 'title', body.impact_note !== undefined && 'outcome note', body.evidence_url !== undefined && 'evidence link'].filter(Boolean);
      if (body.status && tracker.LABEL[body.status]) ev = ['requests', `Moved “${body.title || t}” to ${tracker.LABEL[body.status]} by hand${what.length ? ' and edited ' + what.join(', ') : ''}`, 'status:' + mm[1]];
      else if (what.length) ev = ['requests', `Edited “${body.title || t}”: ${what.join(', ')}`, 'request:' + mm[1]];
    }
  } else if ((mm = p.match(/^\/api\/members\/(\d+)$/))) {
    const n = member(mm[1]).name;
    ev = m === 'DELETE' ? ['members', `Removed member ${n}`] : ['members', `Updated member ${body.name || n}${body.active === false ? ' (set inactive)' : ''}`];
  } else if ((mm = p.match(/^\/api\/members\/(\d+)\/m91-invite$/))) ev = ['alerts', `Sent an M91 invite to ${member(mm[1]).name}`];
  else if ((mm = p.match(/^\/api\/agents\/(\w+)\/run$/))) ev = ['agents', `Ran ${(agents.AGENTS[mm[1]] || {}).name || mm[1]} manually`];
  else if ((mm = p.match(/^\/api\/integrations\/([a-z-]+)\/(disconnect|settings|test)$/))) {
    const app = (vs.APPS[mm[1]] || {}).name || mm[1];
    ev = ['integrations', { disconnect: `Disconnected ${app}`, settings: `Changed ${app} settings`, test: `Tested ${app}` }[mm[2]]];
  } else {
    const keys = Object.keys(body || {}).filter((k) => SETTING_KEYS.includes(k));
    ev = {
      '/api/requests': ['requests', `Added a client request “${body.title}”`],
      '/api/reviews/manual': ['reviews', `Asked Inspector to review “${body.subject || 'a submission'}”`],
      '/api/members': ['members', `Added member ${body.name} (${body.role || 'tech'})`],
      '/api/members/import-slack': ['members', 'Imported members from Slack'],
      '/api/settings': keys.length ? ['settings', `Changed settings: ${keys.map((k) => SETTING_NAMES[k] || k.replace(/^cfg\./, '').replace(/_/g, ' ').toLowerCase()).join(', ')}`] : null,
      '/api/agents/herald/morning': ['alerts', 'Sent the morning reminder'],
      '/api/workspace': m === 'PATCH' ? ['settings', `Renamed the workspace to “${body.name}”`] : null,
      '/api/workspace/people': m === 'POST' ? ['settings', `Gave ${body.email} ${['admin', 'manager'].includes(body.role) ? body.role : 'viewer'} access`] : m === 'DELETE' ? ['settings', `Removed ${body.email} from the workspace`] : null,
      '/api/integrations/connected': ['integrations', `Connected ${(vs.APPS[body.app] || {}).name || body.app}`],
      '/api/demo/load': ['settings', 'Loaded demo data'],
      '/api/demo/clear': ['settings', 'Cleared demo data'],
      '/api/checklist': null,
    }[p] || null;
  }
  if (!ev) return;
  res.on('finish', () => { if (res.statusCode < 300) history.record(d, ev[0], actor, ev[1], ev[2]); });
}

async function routes(req, res, url, p, m, body, cx) {
  const role = cx.role;
  // ---------- manager view (read-only for a boss; the lead can preview it) ----------
  if (p === '/api/manager' && m === 'GET') {
    if (!['admin', 'manager'].includes(role)) return send(res, 403, { error: 'Not available' });
    // who leads this workspace: its owner's name (workspace 1: the first ADMIN_EMAILS account)
    const ownerEmail = cx.ws === 1 && adminEmails()[0] ? adminEmails()[0] : (workspaces.members(cx.ws).find((x) => x.role === 'owner') || {}).email;
    const ownerAcct = ownerEmail ? accounts.find(ownerEmail) : null;
    const leadName = ownerAcct && ownerAcct.name ? ownerAcct.name.split(' ')[0] : ownerEmail ? ownerEmail.split('@')[0].split(/[._\d]/)[0].replace(/^./, (c) => c.toUpperCase()) : null;
    return send(res, 200, manager.summary(url.searchParams.get('week'), leadName));
  }
  if (role === 'manager' && !(m === 'GET' && ['/api/state', '/api/requests', '/api/logs', '/api/workspaces'].includes(p))) return send(res, 403, { error: 'Managers have a read-only view' });
  // ---------- history & test checklist ----------
  if (p === '/api/history' && m === 'GET') {
    if (role !== 'admin') return send(res, 403, { error: 'Admins only' });
    return send(res, 200, history.list({ days: Number(url.searchParams.get('days')) || 7, kind: url.searchParams.get('kind') || 'all' }));
  }
  if (p === '/api/checklist' && role !== 'admin') return send(res, 403, { error: 'Admins only' });
  if (p === '/api/checklist' && m === 'GET') return send(res, 200, checklist.build());
  if (p === '/api/checklist' && m === 'POST') { setSetting('checklist.hidden', !!body.hidden); return send(res, 200, checklist.build()); }
  // ---------- workspaces ----------
  if (p === '/api/workspaces' && m === 'GET') return send(res, 200, cx.email ? workspaces.forEmail(cx.email) : [workspaces.get(1)]);
  if (p === '/api/workspaces' && m === 'POST') {
    if (!cx.email) return send(res, 400, { error: 'Sign in with your email to create a workspace' });
    try { return send(res, 200, workspaces.create(body.name, cx.email)); } catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (p === '/api/workspace' && m === 'PATCH') {
    if (role !== 'admin') return send(res, 403, { error: 'Admins only' });
    if (!String(body.name || '').trim()) return send(res, 400, { error: 'Name cannot be empty' });
    return send(res, 200, workspaces.rename(cx.ws, body.name));
  }
  if (p === '/api/workspace/people') {
    if (role !== 'admin') return send(res, 403, { error: 'Admins only' });
    try {
      if (m === 'POST') workspaces.invite(cx.ws, body.email, body.role);
      if (m === 'DELETE') workspaces.remove(cx.ws, body.email);
      const list = workspaces.members(cx.ws);
      if (cx.ws === 1) for (const e of adminEmails()) if (!list.find((x) => x.email === e)) list.unshift({ email: e, role: 'owner', env: true });
      return send(res, 200, list);
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (role === 'viewer' && !(m === 'GET' && VIEWER_ROUTES.includes(p))) return send(res, 403, { error: 'Admins only' });

  if (p === '/api/state') {
    const t = U.today();
    const status = Object.fromEntries(db.prepare('SELECT * FROM agent_status').all().map((s) => [s.agent, s]));
    const agentList = Object.entries(agents.AGENTS).map(([key, a]) => {
      const s = status[key] || status[['tracker', 'growth'].includes(key) ? 'scout' : key] || {};
      return { key, name: a.name, emoji: a.emoji, building: a.building, job: a.job, runnable: !!a.run && role === 'admin', state: s.state || 'idle', message: s.message || null, last_run_at: s.last_run_at || null };
    });
    return send(res, 200, {
      today: t,
      agents: agentList,
      activity: db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 60').all(),
      today_metrics: metrics.teamMetrics(t, t),
      week_metrics: metrics.teamMetrics(U.weekStart(t), t),
      week_value: (() => { const v = metrics.valueMetrics(U.weekStart(t), t); return { ...v, people: metrics.memberOutcomes(U.weekStart(t), t, v) }; })(),
      integrations: { slack: slack.enabled(), ai: llm.enabled(), msg91: msg91.enabled() || vs.connected('m91'), lead: !!U.cfg('LEAD_SLACK_USER_ID'), review_instructions: !!getSetting('inspector.instructions', '') },
      has_demo: !!db.prepare('SELECT 1 FROM members WHERE is_demo = 1').get(),
      member_count: db.prepare('SELECT COUNT(*) c FROM members WHERE active = 1').get().c,
      password_set: !!process.env.ADMIN_PASSWORD,
      role,
    });
  }
  if (p === '/api/metrics') {
    const to = url.searchParams.get('to') || U.today();
    const from = url.searchParams.get('from') || U.addDays(to, -13);
    const value = metrics.valueMetrics(from, to);
    return send(res, 200, { team: metrics.teamMetrics(from, to), series: metrics.dailySeries(from, to), value, people: metrics.memberOutcomes(from, to, value) });
  }
  if (p === '/api/logs') {
    const date = url.searchParams.get('date') || U.today();
    const rows = db.prepare('SELECT l.*, m.name, m.role FROM daily_logs l JOIN members m ON m.id = l.member_id WHERE l.date = ? ORDER BY m.name').all(date);
    return send(res, 200, { date, logs: rows });
  }

  // client requests
  if (p === '/api/requests' && m === 'GET') {
    const st = url.searchParams.get('status');
    const rows = st ? db.prepare('SELECT * FROM client_requests WHERE status = ? ORDER BY created_at DESC LIMIT 300').all(st)
      : db.prepare('SELECT * FROM client_requests ORDER BY created_at DESC LIMIT 300').all();
    return send(res, 200, rows.map(requestView));
  }
  if (p === '/api/requests' && m === 'POST') {
    if (!body.title) return send(res, 400, { error: 'Title is required' });
    const at = new Date().toISOString();
    const info = db.prepare(`INSERT INTO client_requests (title, text, assigned_member_ids, status, created_at) VALUES (?, ?, ?, 'new', ?)`)
      .run(body.title, body.text || '', JSON.stringify((body.member_ids || []).map(Number)), at);
    db.prepare('INSERT INTO request_events (request_id, status, at) VALUES (?, ?, ?)').run(info.lastInsertRowid, 'new', at);
    U.logActivity('tracker', `New client request (manual): "${body.title}"`);
    return send(res, 200, requestView(db.prepare('SELECT * FROM client_requests WHERE id = ?').get(info.lastInsertRowid)));
  }
  let mm;
  if ((mm = p.match(/^\/api\/requests\/(\d+)$/)) && m === 'PATCH') {
    const r = db.prepare('SELECT * FROM client_requests WHERE id = ?').get(mm[1]);
    if (!r) return send(res, 404, { error: 'Not found' });
    if (body.status && tracker.LABEL[body.status]) {
      await tracker.applyStatus(r, body.status, { ts: String(Date.now() / 1000), text: body.reason || 'Updated from the dashboard' }, null);
    }
    if (body.member_ids) db.prepare('UPDATE client_requests SET assigned_member_ids = ? WHERE id = ?').run(JSON.stringify(body.member_ids.map(Number)), r.id);
    if (body.difficulty) db.prepare('UPDATE client_requests SET difficulty = ? WHERE id = ?').run(Math.min(5, Math.max(1, Number(body.difficulty))), r.id);
    if (body.title) db.prepare('UPDATE client_requests SET title = ? WHERE id = ?').run(String(body.title).slice(0, 200), r.id);
    if (body.impact_note !== undefined) db.prepare('UPDATE client_requests SET impact_note = ? WHERE id = ?').run(String(body.impact_note).slice(0, 1000) || null, r.id);
    if (body.evidence_url !== undefined) db.prepare('UPDATE client_requests SET evidence_url = ? WHERE id = ?').run(/^https?:\/\//.test(body.evidence_url) ? String(body.evidence_url).slice(0, 500) : null, r.id);
    return send(res, 200, requestView(db.prepare('SELECT * FROM client_requests WHERE id = ?').get(r.id)));
  }
  if ((mm = p.match(/^\/api\/requests\/(\d+)$/)) && m === 'DELETE') {
    db.prepare('DELETE FROM client_requests WHERE id = ?').run(mm[1]);
    return send(res, 200, { ok: true });
  }

  // reviews / growth / reports
  if (p === '/api/reviews' && m === 'GET') {
    const rows = db.prepare('SELECT * FROM reviews ORDER BY id DESC LIMIT 200').all()
      .map((r) => ({ ...r, member: r.member_id ? memberName(r.member_id) : null, findings: r.findings ? JSON.parse(r.findings) : [] }));
    return send(res, 200, rows);
  }
  if (p === '/api/reviews/manual' && m === 'POST') {
    if (!llm.enabled()) return send(res, 400, { error: 'ANTHROPIC_API_KEY is not set' });
    if (!getSetting('inspector.instructions', '')) return send(res, 400, { error: 'Add review instructions in Settings first' });
    if (!body.submission) return send(res, 400, { error: 'Paste the content to review' });
    const r = await U.runAgent('inspector', 'Running a manual review…', () => inspector.manual(body));
    if (r && r.error) return send(res, 500, r);
    return send(res, 200, r);
  }
  if (p === '/api/growth') {
    return send(res, 200, db.prepare(`SELECT g.*, m.name FROM growth_items g JOIN members m ON m.id = g.member_id ORDER BY g.date DESC, g.id DESC LIMIT 300`).all());
  }
  if (p === '/api/reports') {
    const kind = url.searchParams.get('kind');
    const rows = kind ? db.prepare('SELECT id, kind, period_start, period_end, content, created_at FROM reports WHERE kind = ? ORDER BY id DESC LIMIT 30').all(kind)
      : db.prepare('SELECT id, kind, period_start, period_end, content, created_at FROM reports ORDER BY id DESC LIMIT 60').all();
    return send(res, 200, rows);
  }
  if (p === '/api/reports/preview' && m === 'POST') {
    const out = herald.buildDaily(U.today());
    return send(res, 200, { text: out.text });
  }

  // members
  if (p === '/api/members' && m === 'GET') return send(res, 200, U.members({ includeInactive: true }));
  if (p === '/api/members' && m === 'POST') {
    if (!body.name) return send(res, 400, { error: 'Name is required' });
    try {
      const info = db.prepare('INSERT INTO members (name, slack_user_id, role, phone) VALUES (?, ?, ?, ?)')
        .run(body.name.trim(), body.slack_user_id ? body.slack_user_id.trim() : null, ['tech', 'growth', 'lead'].includes(body.role) ? body.role : 'tech', body.phone || null);
      return send(res, 200, U.memberById(info.lastInsertRowid));
    } catch (e) { return send(res, 400, { error: 'This Slack ID already exists' }); }
  }
  if ((mm = p.match(/^\/api\/members\/(\d+)$/)) && m === 'PATCH') {
    const cur = U.memberById(mm[1]);
    if (!cur) return send(res, 404, { error: 'Not found' });
    const n = { ...cur, ...body };
    db.prepare('UPDATE members SET name = ?, slack_user_id = ?, role = ?, phone = ?, active = ? WHERE id = ?')
      .run(n.name, n.slack_user_id || null, n.role, n.phone || null, n.active ? 1 : 0, cur.id);
    return send(res, 200, U.memberById(cur.id));
  }
  if ((mm = p.match(/^\/api\/members\/(\d+)$/)) && m === 'DELETE') {
    db.prepare('DELETE FROM members WHERE id = ?').run(mm[1]);
    return send(res, 200, { ok: true });
  }
  if ((mm = p.match(/^\/api\/members\/(\d+)\/m91-invite$/)) && m === 'POST') {
    const mem = U.memberById(mm[1]);
    if (!mem || !mem.phone) return send(res, 400, { error: 'Add a phone number for this member first' });
    if (!m91.ready()) return send(res, 400, { error: 'Connect M91 on the Integrations page first' });
    try { return send(res, 200, { ok: true, result: await m91.invite(mem.phone) }); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (p === '/api/members/import-slack' && m === 'POST') {
    if (!slack.enabled()) return send(res, 400, { error: 'Slack is not configured' });
    const ids = await slack.channelMembers(U.cfg('SLACK_CHANNEL_ID'));
    let added = 0;
    for (const id of ids) {
      if (U.memberBySlack(id)) continue;
      const u = await slack.userInfo(id);
      if (u.is_bot || u.deleted || id === 'USLACKBOT') continue;
      const role = id === U.cfg('LEAD_SLACK_USER_ID') ? 'lead' : 'tech';
      db.prepare('INSERT INTO members (name, slack_user_id, role, active) VALUES (?, ?, ?, ?)').run(u.real_name || u.name, id, role, 1);
      added++;
    }
    return send(res, 200, { added });
  }

  // publishes (manual)
  if (p === '/api/publishes' && m === 'POST') {
    const count = Math.min(50, Math.max(1, Number(body.count) || 1));
    if (!U.memberById(body.member_id) || !['action', 'trigger', 'app'].includes(body.kind)) return send(res, 400, { error: 'Member and kind are required' });
    const ins = db.prepare('INSERT INTO publishes (member_id, kind, plugin, name, date, source) VALUES (?, ?, ?, ?, ?, ?)');
    for (let i = 0; i < count; i++) ins.run(body.member_id, body.kind, body.plugin || null, body.name || null, body.date || U.today(), 'manual');
    U.logActivity('analyst', `${memberName(body.member_id)}: +${count} ${body.kind}${body.plugin ? ' (' + body.plugin + ')' : ''}`);
    return send(res, 200, { ok: true });
  }

  // settings
  if (p === '/api/settings' && m === 'GET') {
    const out = {};
    for (const k of SETTING_KEYS) out[k] = getSetting(k, null);
    out.defaults = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, v.join(', ')]));
    out.env_locked = ['SLACK_CHANNEL_ID', 'LEAD_SLACK_USER_ID', 'ALERT_CHANNEL_ID', 'SLACK_WORKSPACE_URL'].filter((k) => process.env[k]);
    return send(res, 200, out);
  }
  if (p === '/api/settings' && m === 'POST') {
    for (const [k, v] of Object.entries(body)) if (SETTING_KEYS.includes(k)) setSetting(k, v);
    return send(res, 200, { ok: true });
  }

  // agents
  if ((mm = p.match(/^\/api\/agents\/(\w+)\/run$/)) && m === 'POST') {
    if (!agents.AGENTS[mm[1]] || !agents.AGENTS[mm[1]].run) return send(res, 400, { error: 'This agent cannot be run manually' });
    const result = await agents.run(mm[1]);
    return send(res, 200, result || {});
  }
  if (p === '/api/agents/herald/morning' && m === 'POST') return send(res, 200, await U.runAgent('herald', 'Sending the morning reminder…', () => herald.morning()));
  if (p === '/api/broadcast' && m === 'POST') {
    const r = await U.runAgent('commander', 'Sending the message…', () => commander.broadcast(body));
    if (r && r.error) return send(res, 500, r);
    return send(res, 200, r);
  }
  // ---------- manager insights: action queue, where to intervene, blocked work, contributions ----------
  if (p === '/api/insights' && m === 'GET') {
    return send(res, 200, { queue: work.queue(), interventions: work.interventions(), blocked: work.blocked() });
  }
  if (p === '/api/contributions' && m === 'GET') {
    const to = url.searchParams.get('to') || U.today();
    const from = url.searchParams.get('from') || U.addDays(to, -13);
    return send(res, 200, work.contributions(from, to));
  }
  if (p === '/api/verify' && m === 'POST') {
    try { work.verify(body.kind, Number(body.id), body.status, body.note, cx.email); return send(res, 200, { ok: true }); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if ((mm = p.match(/^\/api\/requests\/(\d+)\/ack-analysis$/)) && m === 'POST') {
    db.prepare("UPDATE client_requests SET analysis_ack = datetime('now') WHERE id = ?").run(mm[1]);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/broadcast/polish' && m === 'POST') {
    try { return send(res, 200, await commander.polish(body.message, body.tone)); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (p === '/api/broadcasts') return send(res, 200, db.prepare('SELECT * FROM broadcasts ORDER BY id DESC LIMIT 50').all());


  // ---------- viaSocket integrations (admin only) ----------
  // Connections act as the lead: never open to anyone without a login.
  if (p.startsWith('/api/integrations')) {
    if (!process.env.ADMIN_PASSWORD || !adminEmails().length) {
      return send(res, 403, { error: 'To use Integrations, first set ADMIN_PASSWORD and ADMIN_EMAILS (Embarko → App setup), then log in with your email.' });
    }
    if (role !== 'admin' || !cx.email) return send(res, 403, { error: 'Integrations are only for workspace owners and admins' });
  }
  if (p === '/api/integrations' && m === 'GET') return send(res, 200, await vs.status());
  if (p === '/api/integrations/connect-info' && m === 'GET') {
    if (!vs.configured()) return send(res, 400, { error: 'viaSocket keys (VIASOCKET_ORG_ID, VIASOCKET_PROJECT_ID, VIASOCKET_EMBED_SECRET) are not set' });
    return send(res, 200, await vs.connectInfo());
  }
  if (p === '/api/integrations/connected' && m === 'POST') {
    if (!vs.APPS[body.app]) return send(res, 400, { error: 'Unknown app' });
    return send(res, 200, await vs.onConnected(body.app, body.authId, cx.email));
  }
  if ((mm = p.match(/^\/api\/integrations\/([a-z-]+)\/(disconnect|settings|test|options)$/))) {
    const app = mm[1], action = mm[2];
    if (!vs.APPS[app]) return send(res, 404, { error: 'Unknown app' });
    if (action === 'disconnect' && m === 'POST') return send(res, 200, await vs.disconnect(app));
    if (!vs.connected(app)) return send(res, 400, { error: `Connect ${vs.APPS[app].name} first` });
    if (action === 'settings' && m === 'POST') {
      const allowed = {
        m91: ['test_phone'],
        slack: ['channel_id', 'channel_name', 'me_id', 'me_name', 'use_for_slack'],
        gmail: ['manager_email', 'weekly_email'],
        'google-sheets': ['spreadsheet_id', 'spreadsheet_name', 'tab', 'weekly_rows'],
      }[app];
      const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
      if (patch.manager_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.manager_email)) return send(res, 400, { error: 'That email is not valid' });
      const saved = vs.saveSettings(app, patch);
      if (app === 'google-sheets' && patch.tab && patch.spreadsheet_id) {
        // header row once, so the weekly rows have column names
        try { await vs.sheetsAppend(patch.spreadsheet_id, patch.tab, [scribeAgent.SHEET_HEADER]); } catch (e) { return send(res, 200, { settings: saved, warning: e.message }); }
      }
      return send(res, 200, { settings: saved });
    }
    if (action === 'options' && m === 'GET') {
      const field = url.searchParams.get('field');
      const cursor = url.searchParams.get('paginate') || undefined;
      if (app === 'slack' && field === 'channel') return send(res, 200, await vs.slackChannels(cursor));
      if (app === 'slack' && field === 'me') return send(res, 200, await vs.slackUsers(cursor));
      if (app === 'google-sheets' && field === 'spreadsheet') return send(res, 200, await vs.sheetsList(url.searchParams.get('search')));
      if (app === 'google-sheets' && field === 'tab') return send(res, 200, await vs.sheetsTabs(url.searchParams.get('spreadsheet')));
      return send(res, 400, { error: 'Unknown field' });
    }
    if (action === 'test' && m === 'POST') {
      const st = vs.settings(app);
      let result;
      if (app === 'm91') {
        const phone = String(body.phone || st.test_phone || '').replace(/[^0-9]/g, '');
        if (phone.length < 10) return send(res, 400, { error: 'Enter your phone number with country code, e.g. 919876543210' });
        vs.saveSettings('m91', { test_phone: phone });
        try { result = await m91.sendAlert({ phone, title: 'SquadForge test alert', description: 'If you see this, M91 alerts from SquadForge work. Tap "Seen".', severity: 'Low', customId: 'sf-test-' + Date.now().toString(36) }); }
        catch (e) { return send(res, 400, { error: e.message }); }
        U.logActivity('scout', '🔔 M91 test alert sent');
        return send(res, 200, { ok: true, result });
      }
      if (app === 'slack') {
        if (!st.me_id) return send(res, 400, { error: 'Pick yourself in the "Who am I" list first' });
        const d = await vs.slackCall('conversations.open', { users: st.me_id }, true);
        result = await vs.slackCall('chat.postMessage', { channel: d.channel.id, text: '✅ SquadForge test: the Slack connection works.' }, true);
        result = { ok: result.ok, ts: result.ts, channel: result.channel };
      } else if (app === 'gmail') {
        const me = await vs.gmailMe();
        result = { to: me.email, ...(await vs.gmailSend(me.email, 'SquadForge test', 'The Gmail connection works. The Monday report will be sent from here.')) };
      } else {
        result = await vs.sheetsTest();
      }
      U.logActivity('scout', `🔌 ${vs.APPS[app].name} test pass ✅`);
      return send(res, 200, { ok: true, result });
    }
  }

  if (p === '/api/demo/load' && m === 'POST') return send(res, 200, demo.load());
  if (p === '/api/demo/clear' && m === 'POST') return send(res, 200, demo.clear());

  return send(res, 404, { error: 'Not found' });
}

// Embarko scheduler: GET with Authorization: Bearer CRON_SECRET
function cron(req, res, url) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !safeEqual(auth, secret)) return send(res, 401, { error: 'unauthorized' });
  const job = url.pathname.replace('/cron/', '');
  const jobs = {
    sync: () => background('scout', 'Syncing Slack…', () => scout.sync()),
    morning: () => background('herald', 'Checking morning plans…', () => herald.morning()),
    evening: () => background('herald', 'Building the 7 PM alert…', async () => {
      await U.runAgent('scout', 'Final sync…', () => scout.sync());
      await U.runAgent('analyst', 'Analysing today…', () => analyst.run());
      return herald.evening();
    }),
    weekly: () => background('scribe', 'Writing the weekly report…', () => scribe.run()),
  };
  if (!jobs[job]) return send(res, 404, { error: 'unknown job' });
  for (const w of workspaces.all()) withWorkspace(w.id, () => jobs[job]());
  return send(res, 202, { accepted: job });
}

// Publish counts from a viaSocket flow (or any tool): POST /webhooks/publish
async function publishWebhook(req, res, url) {
  return withWorkspace(Number(url.searchParams.get('ws')) || 1, () => publishWebhookIn(req, res));
}
async function publishWebhookIn(req, res) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || !safeEqual(req.headers['x-webhook-secret'], secret)) return send(res, 401, { error: 'unauthorized' });
  const b = await readBody(req);
  const items = Array.isArray(b) ? b : [b];
  let added = 0;
  for (const it of items) {
    const member = (it.slack_user_id && U.memberBySlack(it.slack_user_id))
      || (it.member && db.prepare('SELECT * FROM members WHERE lower(name) = lower(?)').get(String(it.member)));
    const kind = String(it.kind || '').toLowerCase();
    if (!member || !['action', 'trigger', 'app'].includes(kind)) continue;
    const count = Math.min(50, Math.max(1, Number(it.count) || 1));
    for (let i = 0; i < count; i++) {
      db.prepare('INSERT INTO publishes (member_id, kind, plugin, name, date, source) VALUES (?, ?, ?, ?, ?, ?)')
        .run(member.id, kind, it.plugin || null, it.name || null, it.date || U.today(), 'webhook');
      added++;
    }
    U.logActivity('analyst', `${member.name} published ${count} ${kind}${it.plugin ? ' — ' + it.plugin : ''}`);
  }
  return send(res, 200, { added });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/cron/') && req.method === 'GET') return cron(req, res, url);
    if (url.pathname === '/webhooks/publish' && req.method === 'POST') return await publishWebhook(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

try { demo.refreshOldDemo(); } catch (e) { console.error(e); }
server.listen(PORT, '0.0.0.0', () => console.log(`SquadForge running on http://0.0.0.0:${PORT} (node ${process.version})`));
