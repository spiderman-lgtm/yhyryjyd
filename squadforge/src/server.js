// SquadForge HTTP server (no framework). Embarko: reads PORT, binds 0.0.0.0.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, getSetting, setSetting } = require('./db');
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

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');

// ---------- auth ----------
function sessionSecret() {
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update('sf:' + (process.env.ADMIN_PASSWORD || 'open')).digest('hex');
}
function sign(v) { return crypto.createHmac('sha256', sessionSecret()).update(v).digest('hex'); }
function makeSession() {
  const exp = Date.now() + 30 * 864e5;
  return `${exp}.${sign(String(exp))}`;
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function authed(req) {
  if (!process.env.ADMIN_PASSWORD) return true; // password set nahi - open (dashboard pe warning dikhti hai)
  const s = cookies(req).sf_session;
  if (!s) return false;
  const [exp, sig] = s.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
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
  if (p === '/api/me') return send(res, 200, { authed: authed(req), password_set: !!process.env.ADMIN_PASSWORD });
  if (p === '/api/login' && m === 'POST') {
    if (!process.env.ADMIN_PASSWORD || safeEqual(body.password, process.env.ADMIN_PASSWORD)) {
      return send(res, 200, { ok: true }, { 'Set-Cookie': `sf_session=${makeSession()}; HttpOnly; Path=/; Max-Age=${30 * 86400}; SameSite=Lax; Secure` });
    }
    return send(res, 401, { error: 'Galat password' });
  }
  if (p === '/api/logout' && m === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': 'sf_session=; Path=/; Max-Age=0' });

  if (!authed(req)) return send(res, 401, { error: 'Login karo' });

  if (p === '/api/state') {
    const t = U.today();
    const status = Object.fromEntries(db.prepare('SELECT * FROM agent_status').all().map((s) => [s.agent, s]));
    const agentList = Object.entries(agents.AGENTS).map(([key, a]) => {
      const s = status[key] || status[['tracker', 'growth'].includes(key) ? 'scout' : key] || {};
      return { key, name: a.name, emoji: a.emoji, building: a.building, job: a.job, runnable: !!a.run, state: s.state || 'idle', message: s.message || null, last_run_at: s.last_run_at || null };
    });
    return send(res, 200, {
      today: t,
      agents: agentList,
      activity: db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 60').all(),
      today_metrics: metrics.teamMetrics(t, t),
      week_metrics: metrics.teamMetrics(U.weekStart(t), t),
      integrations: { slack: slack.enabled(), ai: llm.enabled(), msg91: msg91.enabled(), lead: !!U.cfg('LEAD_SLACK_USER_ID'), review_instructions: !!getSetting('inspector.instructions', '') },
      has_demo: !!db.prepare('SELECT 1 FROM members WHERE is_demo = 1').get(),
      member_count: db.prepare('SELECT COUNT(*) c FROM members WHERE active = 1').get().c,
      password_set: !!process.env.ADMIN_PASSWORD,
    });
  }
  if (p === '/api/metrics') {
    const to = url.searchParams.get('to') || U.today();
    const from = url.searchParams.get('from') || U.addDays(to, -13);
    return send(res, 200, { team: metrics.teamMetrics(from, to), series: metrics.dailySeries(from, to) });
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
    if (!body.title) return send(res, 400, { error: 'Title chahiye' });
    const at = new Date().toISOString();
    const info = db.prepare(`INSERT INTO client_requests (title, text, assigned_member_ids, status, created_at) VALUES (?, ?, ?, 'new', ?)`)
      .run(body.title, body.text || '', JSON.stringify((body.member_ids || []).map(Number)), at);
    db.prepare('INSERT INTO request_events (request_id, status, at) VALUES (?, ?, ?)').run(info.lastInsertRowid, 'new', at);
    U.logActivity('tracker', `Nayi client request (manual): "${body.title}"`);
    return send(res, 200, requestView(db.prepare('SELECT * FROM client_requests WHERE id = ?').get(info.lastInsertRowid)));
  }
  let mm;
  if ((mm = p.match(/^\/api\/requests\/(\d+)$/)) && m === 'PATCH') {
    const r = db.prepare('SELECT * FROM client_requests WHERE id = ?').get(mm[1]);
    if (!r) return send(res, 404, { error: 'Not found' });
    if (body.status && tracker.LABEL[body.status]) {
      await tracker.applyStatus(r, body.status, { ts: String(Date.now() / 1000), text: body.reason || 'Dashboard se update' }, null);
    }
    if (body.member_ids) db.prepare('UPDATE client_requests SET assigned_member_ids = ? WHERE id = ?').run(JSON.stringify(body.member_ids.map(Number)), r.id);
    if (body.difficulty) db.prepare('UPDATE client_requests SET difficulty = ? WHERE id = ?').run(Math.min(5, Math.max(1, Number(body.difficulty))), r.id);
    if (body.title) db.prepare('UPDATE client_requests SET title = ? WHERE id = ?').run(String(body.title).slice(0, 200), r.id);
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
    if (!llm.enabled()) return send(res, 400, { error: 'ANTHROPIC_API_KEY set nahi hai' });
    if (!getSetting('inspector.instructions', '')) return send(res, 400, { error: 'Pehle Settings mein review instructions daalo' });
    if (!body.submission) return send(res, 400, { error: 'Review ke liye content paste karo' });
    const r = await U.runAgent('inspector', 'Manual review kar raha hai…', () => inspector.manual(body));
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
    if (!body.name) return send(res, 400, { error: 'Naam chahiye' });
    try {
      const info = db.prepare('INSERT INTO members (name, slack_user_id, role, phone) VALUES (?, ?, ?, ?)')
        .run(body.name.trim(), body.slack_user_id ? body.slack_user_id.trim() : null, ['tech', 'growth', 'lead'].includes(body.role) ? body.role : 'tech', body.phone || null);
      return send(res, 200, U.memberById(info.lastInsertRowid));
    } catch (e) { return send(res, 400, { error: 'Ye Slack ID pehle se hai' }); }
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
  if (p === '/api/members/import-slack' && m === 'POST') {
    if (!slack.enabled()) return send(res, 400, { error: 'Slack configure nahi hai' });
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
    if (!U.memberById(body.member_id) || !['action', 'trigger', 'app'].includes(body.kind)) return send(res, 400, { error: 'Member aur kind chahiye' });
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
    if (!agents.AGENTS[mm[1]] || !agents.AGENTS[mm[1]].run) return send(res, 400, { error: 'Ye agent manually nahi chalta' });
    const result = await agents.run(mm[1]);
    return send(res, 200, result || {});
  }
  if (p === '/api/agents/herald/morning' && m === 'POST') return send(res, 200, await U.runAgent('herald', 'Subah ka reminder…', () => herald.morning()));
  if (p === '/api/broadcast' && m === 'POST') {
    const r = await U.runAgent('commander', 'Message bhej raha hai…', () => commander.broadcast(body));
    if (r && r.error) return send(res, 500, r);
    return send(res, 200, r);
  }
  if (p === '/api/broadcasts') return send(res, 200, db.prepare('SELECT * FROM broadcasts ORDER BY id DESC LIMIT 50').all());

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
    sync: () => background('scout', 'Slack sync kar raha hai…', () => scout.sync()),
    morning: () => background('herald', 'Subah ka plan check…', () => herald.morning()),
    evening: () => background('herald', '7 PM alert bana raha hai…', async () => {
      await U.runAgent('scout', 'Final sync…', () => scout.sync());
      await U.runAgent('analyst', 'Aaj ka analysis…', () => analyst.run());
      return herald.evening();
    }),
    weekly: () => background('scribe', 'Weekly report likh raha hai…', () => scribe.run()),
  };
  if (!jobs[job]) return send(res, 404, { error: 'unknown job' });
  jobs[job]();
  return send(res, 202, { accepted: job });
}

// viaSocket flow (ya koi bhi tool) se publish count: POST /webhooks/publish
async function publishWebhook(req, res) {
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
    U.logActivity('analyst', `${member.name} ne publish kiya: ${count} ${kind}${it.plugin ? ' — ' + it.plugin : ''}`);
  }
  return send(res, 200, { added });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/cron/') && req.method === 'GET') return cron(req, res, url);
    if (url.pathname === '/webhooks/publish' && req.method === 'POST') return await publishWebhook(req, res);
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`SquadForge chal raha hai: http://0.0.0.0:${PORT}`));
