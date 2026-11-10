// Pure text helpers (no DB) - keyword based so the app works even without an AI key.
// All keyword lists can be changed from Settings (comma separated).
const { list } = require('./util');

const DEFAULTS = {
  REQUEST_KEYWORDS: ['client request', 'new request', 'request:', 'req:', 'client req', 'app request', 'request aayi', 'request aai'],
  MORNING_KEYWORDS: ['good morning', 'morning update', 'morning', 'subah', "today's plan", 'todays plan', 'aaj ka plan', 'plan for today', 'standup'],
  EVENING_KEYWORDS: ['evening update', 'evening', 'eod', 'end of day', 'shaam', 'sham', 'aaj kya kiya', 'done today', 'day summary'],
  REVIEW_KEYWORDS: ['ready for review', 'review please', 'please review', 'for review', 'review kr', 'review kar', 'check karo', 'check kr do', 'review'],
};

const STATUS_WORDS = {
  completed: ['completed', 'complete', 'done', 'ho gaya', 'ho gya', 'hogaya', 'published', 'live', 'finished', 'ban gaya', 'ban gya'],
  stuck: ['stuck', 'blocked', 'blocker', 'missing', 'nahi mil', 'nhi mil', 'not found', 'not available', 'no api', 'api doc', 'doc nahi', 'docs nahi', 'credentials chahiye', 'need credentials', 'access nahi', 'not possible', 'possible nahi'],
  started: ['started', 'start kar', 'start kr', 'starting', 'shuru', 'working on', 'in progress', 'building', 'bana raha', 'bana rahi', 'start'],
  rnd: ['r&d', 'r & d', 'rnd', 'research', 'checking', 'check kar raha', 'check kar rahi', 'dekh raha', 'dekh rahi', 'dekhta', 'looking into', 'feasib'],
};

const GROWTH_WORDS = {
  credentials: ['credential', 'creds', 'api key', 'access mil', 'sandbox', 'account mil', 'login mil', 'test account', 'access aa', 'docs aa', 'doc aa', 'docs mil', 'doc mil'],
  app_listing: ['listing', 'listed', 'marketplace', 'app directory'],
  blog: ['blog'],
  newsletter: ['newsletter'],
  support_request: ['support', 'customer', 'user ne', 'ticket', 'request', 'client ne', 'chahiye'],
};

const kw = (key) => list(key, DEFAULTS[key]);
const norm = (t = '') => t.toLowerCase().replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, ' ').replace(/\s+/g, ' ');
const hasAny = (text, words) => { const t = norm(text); return words.some((w) => t.includes(w)); };

function isRequest(text) { return hasAny(text, kw('REQUEST_KEYWORDS')); }
function isReviewAsk(text) { return hasAny(text, kw('REVIEW_KEYWORDS')); }
function standupKind(text) {
  const t = norm(text);
  // check evening first: "evening" posts often also say "morning plan done"
  if (kw('EVENING_KEYWORDS').some((w) => t.includes(w))) return 'evening';
  if (kw('MORNING_KEYWORDS').some((w) => t.includes(w))) return 'morning';
  return null;
}

// Status from a thread reply. Supports explicit "status: stuck - reason".
function detectStatus(text) {
  const t = norm(text);
  const explicit = t.match(/status\s*[:=-]\s*(r\s*&\s*d|rnd|started|start|stuck|blocked|completed|complete|done)/);
  if (explicit) {
    const s = explicit[1].replace(/\s/g, '');
    if (s === 'r&d' || s === 'rnd') return 'rnd';
    if (s.startsWith('start')) return 'started';
    if (s === 'stuck' || s === 'blocked') return 'stuck';
    return 'completed';
  }
  // "not done"/"nahi hua" should not count as completed
  const negated = /(not|nahi|nhi)\s+(done|complete|completed|hua|ho)/.test(t) || /(done|complete)\s+(nahi|nhi)/.test(t);
  for (const status of ['stuck', 'completed', 'started', 'rnd']) {
    if (status === 'completed' && negated) continue;
    if (STATUS_WORDS[status].some((w) => wordMatch(t, w))) return status;
  }
  return null;
}
function wordMatch(t, w) {
  if (w.includes(' ') || /[^a-z]/.test(w)) return t.includes(w);
  return new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t);
}

function growthKind(text) {
  const t = norm(text);
  for (const k of ['credentials', 'app_listing', 'blog', 'newsletter', 'support_request']) {
    if (GROWTH_WORDS[k].some((w) => t.includes(w))) return k;
  }
  return null;
}

// "3 actions, 2 triggers, 1 app" -> counts
function parseCounts(text = '') {
  const out = { actions: 0, triggers: 0, apps: 0 };
  const re = /(\d+)\s*(actions?|triggers?|apps?|plugins?)\b|\b(actions?|triggers?|apps?|plugins?)\s*[:=-]?\s*(\d+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = parseInt(m[1] || m[4], 10);
    const w = (m[2] || m[3]).toLowerCase();
    if (w.startsWith('action')) out.actions += n;
    else if (w.startsWith('trigger')) out.triggers += n;
    else out.apps += n;
  }
  return out;
}

// Count task-like lines (bullets / numbered / non-empty lines after the first)
function countItems(text = '') {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^([-*•▪◦]|\d+[.)]|:\w+:)/.test(l));
  if (bullets.length) return bullets.length;
  return Math.max(lines.length > 1 ? lines.length - 1 : lines.length, text.trim() ? 1 : 0);
}

function requestTitle(text = '') {
  let t = text.replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, '').replace(/<(https?:[^|>]+)\|?([^>]*)>/g, (_, u, l) => l || u);
  for (const w of kw('REQUEST_KEYWORDS')) t = t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '');
  t = t.replace(/^[\s:\-–—*_]+/, '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || 'Client request';
  return t.slice(0, 120);
}

// Rough match: does growth text mention this request's app?
function mentionsApp(text, title) {
  const t = norm(text);
  const words = norm(title).split(/[^a-z0-9.]+/).filter((w) => w.length >= 3 && !['app', 'the', 'for', 'request', 'client', 'integration', 'plugin', 'new', 'banana', 'chahiye'].includes(w));
  return words.length > 0 && wordMatch(t, words[0]);
}

module.exports = { isRequest, isReviewAsk, standupKind, detectStatus, growthKind, parseCounts, countItems, requestTitle, mentionsApp, DEFAULTS };
