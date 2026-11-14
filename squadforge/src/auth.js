// Sessions, roles per workspace, login protection and who may create an account.
const crypto = require('crypto');
const workspaces = require('./workspaces');

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
  if (!wsRole) return null;
  return { ws, role: ['owner', 'admin'].includes(wsRole) ? 'admin' : wsRole === 'manager' ? 'manager' : 'viewer', email: se.email, wsRole, workspaces: mine };
}
// ---------- login protection ----------
// 5 wrong tries for one email (or 20 from one address) in 15 minutes → locked for 15 minutes.
const failures = new Map(); // key → [timestamps]
const WINDOW = 15 * 60 * 1000;
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function recent(key) { const now = Date.now(); const arr = (failures.get(key) || []).filter((t) => now - t < WINDOW); failures.set(key, arr); return arr; }
function lockedFor(req, email) {
  const a = recent('e:' + email), b = recent('ip:' + clientIp(req));
  const hit = a.length >= 5 ? a : b.length >= 20 ? b : null;
  return hit ? Math.max(1, Math.ceil((hit[0] + WINDOW - Date.now()) / 60000)) : 0;
}
function failed(req, email) { recent('e:' + email).push(Date.now()); recent('ip:' + clientIp(req)).push(Date.now()); }
function succeeded(email) { failures.delete('e:' + email); }
// Who may create an account: invited people, admin emails, or emails at the allowed domains
// (ALLOWED_SIGNUP_DOMAINS, comma separated; default "*" = anyone, who then proves the email with a code).
function mayCreateAccount(email, invited) {
  if (invited || adminEmails().includes(email)) return true;
  const list = String(process.env.ALLOWED_SIGNUP_DOMAINS || '*').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  return list.includes('*') || list.includes(email.split('@')[1]);
}

// The viewer can only see these (read-only)
const VIEWER_ROUTES = ['/api/state', '/api/requests', '/api/logs', '/api/now'];

module.exports = { VIEWER_ROUTES, sessionSecret, sign, adminEmails, makeSession, cookies, sessionOf, contextOf, clientIp, lockedFor, failed, succeeded, mayCreateAccount };
