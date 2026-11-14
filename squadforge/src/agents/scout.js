// 🔭 Scout - reads the Slack channel (top-level + threads) and hands each message to the right
// agent: standup updates, client requests (Tracker), growth posts, review asks (Inspector).
const { db, getSetting, setSetting } = require('../db');
const slack = require('../slack');
const llm = require('../llm');
const tracker = require('./tracker');
const growth = require('./growth');
const inspector = require('./inspector');
const { cfg, logActivity, memberBySlack, tsToDate, today: U_today } = require('../util');
const P = require('../parser');
const standup = require('./standup');
const istHour = (ts) => Number(new Intl.DateTimeFormat('en-US', { timeZone: process.env.TEAM_TIMEZONE || 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date(parseFloat(ts) * 1000)));

function leadId() { return cfg('LEAD_SLACK_USER_ID'); }
function isLead(userId, member) { return (userId && userId === leadId()) || (member && member.role === 'lead'); }
function skip(msg) {
  return !msg || msg.bot_id || msg.subtype === 'bot_message' || msg.subtype === 'channel_join'
    || msg.subtype === 'channel_leave' || msg.subtype === 'message_deleted' || !msg.user;
}

function recordStandup(member, kind, msg) {
  const date = tsToDate(msg.ts);
  const row = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND date = ?').get(member.id, date);
  const tsCol = kind + '_ts', textCol = kind + '_text';
  const seen = row && row[tsCol] ? row[tsCol].split(',') : [];
  if (seen.includes(msg.ts)) return false;
  const text = [row && row[textCol], msg.text].filter(Boolean).join('\n');
  const tsList = [...seen, msg.ts].join(',');
  if (!row) {
    db.prepare(`INSERT INTO daily_logs (member_id, date, ${textCol}, ${tsCol}) VALUES (?, ?, ?, ?)`).run(member.id, date, text, tsList);
  } else {
    db.prepare(`UPDATE daily_logs SET ${textCol} = ?, ${tsCol} = ? WHERE id = ?`).run(text, tsList, row.id);
  }
  // heuristic counts (Analyst refines them later with AI)
  if (kind === 'morning') {
    db.prepare('UPDATE daily_logs SET planned_count = ? WHERE member_id = ? AND date = ?').run(P.countItems(text), member.id, date);
  } else {
    const c = P.parseCounts(text);
    db.prepare(`UPDATE daily_logs SET done_count = ?, actions_count = ?, triggers_count = ?, apps_count = ? WHERE member_id = ? AND date = ?`)
      .run(P.countItems(text), c.actions, c.triggers, c.apps, member.id, date);
  }
  logActivity('scout', `Got ${member.name}'s ${kind === 'morning' ? 'morning plan' : 'evening update'}`);
  return true;
}

async function statusFor(text) {
  const s = P.detectStatus(text);
  if (s || !llm.enabled() || (text || '').length < 15) return s;
  try {
    const out = await llm.askJson({
      system: 'Classify a developer\'s reply in a Slack thread about a client request to build an app integration. Messages may be in Hinglish.',
      prompt: `Reply:\n${text}\n\nWhich status does it announce? rnd (checking if the app can be built / researching), started (began building), stuck (blocked - e.g. API docs missing, no credentials), completed (app done/published), none (just a comment).`,
      schema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', enum: ['rnd', 'started', 'stuck', 'completed', 'none'] } }, required: ['status'] },
    });
    return out.status === 'none' ? null : out.status;
  } catch { return null; }
}

// Test teammates: Slack has no accounts for them, so the lead writes "[Aarav] started …" and the
// message is read as Aarav's. Only these names; members are created on first use (Settings removes them).
const SIM = { aarav: ['Aarav (test)', 'tech'], meera: ['Meera (test)', 'tech'], kabir: ['Kabir (test)', 'tech'], isha: ['Isha (test)', 'growth'] };
function simMember(key) {
  const k = String(key || '').toLowerCase();
  if (!SIM[k]) return null;
  const id = 'SIM_' + k.toUpperCase();
  let m = memberBySlack(id);
  if (!m) {
    db.prepare('INSERT INTO members (name, slack_user_id, role, active) VALUES (?, ?, ?, 1)').run(SIM[k][0], id, SIM[k][1]);
    m = memberBySlack(id);
    logActivity('scout', `🧪 Test teammate ${m.name} joined`);
  }
  return m;
}
function asSim(msg) {
  if (!msg || !msg.user || msg.user !== leadId()) return msg;
  const mm = String(msg.text || '').match(/^\s*\[(aarav|meera|kabir|isha)\]\s*/i);
  if (!mm) return msg;
  const m = simMember(mm[1]);
  return m ? { ...msg, user: m.slack_user_id, text: msg.text.slice(mm[0].length) } : msg;
}
// plain-text "@Aarav" from the lead assigns a test teammate
function simMentions(text) {
  return [...String(text || '').matchAll(/@(aarav|meera|kabir|isha)\b/gi)].map((x) => simMember(x[1])).filter(Boolean).map((m) => m.id);
}

// Bots and Slack workflows often put the text in attachments or blocks
function botText(msg) {
  const parts = [msg.text || ''];
  for (const a of msg.attachments || []) parts.push(a.pretext, a.title, a.text, ...(a.fields || []).map((f) => `${f.title}: ${f.value}`));
  for (const b of msg.blocks || []) {
    if (b.text && b.text.text) parts.push(b.text.text);
    for (const f of b.fields || []) parts.push(f.text);
    for (const e of b.elements || []) for (const x of e.elements || []) if (x.text) parts.push(x.text);
  }
  return parts.filter(Boolean).join('\n');
}

async function handleTopLevel(msg, channel, stats) {
  const member = memberBySlack(msg.user);
  const text = msg.text || '';
  // the lead posts client requests; a plug request in the website-form format counts whoever pasted it
  if ((isLead(msg.user, member) && P.isRequest(text)) || P.isPlugRequest(text)) {
    if (tracker.createFromMessage(msg, channel, leadId())) stats.requests++;
    return;
  }
  if (!member || member.role === 'lead') return; // standup parent posts by lead/bots: their replies are handled instead
  if (P.isLeave(text) && text.length < 200) { standup.setLeave(member.id, tsToDate(msg.ts), true, 'slack', text.slice(0, 200)); logActivity('scout', `🌴 ${member.name} is on leave today`); stats.updates++; return; }
  const kind = P.standupKind(text);
  if (kind) { if (recordStandup(member, kind, msg)) stats.updates++; return; }
  if (member.role === 'growth') { if (await growth.handle(msg, member)) stats.growth++; return; }
  if (P.isReviewAsk(text) || (member.role === 'tech' && P.isAppSubmission(text))) { if (inspector.queueFromMessage(msg, member, msg.ts, null)) stats.reviews++; }
}

async function handleReply(reply, parent, channel, stats) {
  const member = memberBySlack(reply.user);
  const text = reply.text || '';
  const req = db.prepare('SELECT * FROM client_requests WHERE slack_ts = ?').get(parent.ts);
  if (req) {
    if (isLead(reply.user, member)) {
      const mentioned = slack.mentions(text);
      const ids = [...tracker.assignedFromMentions(mentioned, leadId()), ...simMentions(text)];
      if (ids.length) tracker.addAssignees(req, ids);
      else if (!mentioned.length) {
        const status = P.detectStatus(text);
        if (status && (await tracker.applyStatus(db.prepare('SELECT * FROM client_requests WHERE id = ?').get(req.id), status, reply, member || null))) stats.statusChanges++;
      }
    } else if (member) {
      const reviewAsk = member.role === 'tech' && (P.isReviewAsk(text) || P.isAppSubmission(text));
      if (reviewAsk && inspector.queueFromMessage(reply, member, parent.ts, req.id)) stats.reviews++;
      if (member.role === 'growth') {
        if (await growth.handle(reply, member)) stats.growth++;
      } else {
        // "completed, review please" → both a status and a review. Do not ask the AI for a status on a bare "review please".
        const status = reviewAsk ? P.detectStatus(text) : await statusFor(text);
        if (status && (await tracker.applyStatus(db.prepare('SELECT * FROM client_requests WHERE id = ?').get(req.id), status, reply, member))) stats.statusChanges++;
      }
    }
    db.prepare(`UPDATE client_requests SET last_reply_ts = ? WHERE id = ?
                AND (last_reply_ts IS NULL OR CAST(last_reply_ts AS REAL) < CAST(? AS REAL))`).run(reply.ts, req.id, reply.ts);
    return;
  }
  if (!member || member.role === 'lead') return;
  // the day's Good morning thread: plan in the morning, what got built later (app + actions/triggers)
  if (standup.isStandupThread(parent.ts)) {
    if (P.isLeave(text) && !P.isAppSubmission(text)) { standup.setLeave(member.id, tsToDate(reply.ts), true, 'slack', text.slice(0, 200)); logActivity('scout', `🌴 ${member.name} is on leave today`); stats.updates++; return; }
    const app = P.isAppSubmission(text);
    const kind = P.standupKind(text) || (/\b(plan|planning|aaj karunga|will do|today i will)\b/i.test(text) && !app ? 'morning' : null) || (app || P.detectStatus(text) === 'completed' || /\b\d+\s*(actions?|triggers?)\b/i.test(text) || istHour(reply.ts) >= 15 ? 'evening' : 'morning');
    if (recordStandup(member, kind, reply)) stats.updates++;
    if (app && member.role === 'tech' && inspector.queueFromMessage(reply, member, parent.ts, null)) stats.reviews++;
    return;
  }
  const parentKind = P.standupKind(parent.text || '');
  const ownKind = P.standupKind(text);
  if (parentKind || ownKind) {
    if (recordStandup(member, ownKind || parentKind, reply)) stats.updates++;
    if (member.role === 'tech' && P.isAppSubmission(text) && inspector.queueFromMessage(reply, member, parent.ts, null)) stats.reviews++;
    return;
  }
  if (member.role === 'growth') { if (await growth.handle(reply, member)) stats.growth++; return; }
  if (member.role === 'tech' && (P.isReviewAsk(text) || P.isAppSubmission(text))) { if (inspector.queueFromMessage(reply, member, parent.ts, null)) stats.reviews++; }
}

// viaSocket runs count against a plan limit: sync less often through it, and back off when the limit is hit.
const LIMIT_RE = /usage limit|limit has been exhausted|upgrade your plan|quota/i;
async function sync({ manual = false } = {}) {
  if (!slack.enabled()) return { message: 'Slack is not configured (connect it on Integrations, or set SLACK_BOT_TOKEN + SLACK_CHANNEL_ID)' };
  const viaVs = slack.viaViaSocket();
  const nowMs = Date.now();
  if (viaVs && !manual) {
    const backoff = Number(getSetting('scout.backoff_until', 0)) || 0;
    if (backoff > nowMs) return { message: 'Paused: the viaSocket usage limit was reached — add a Slack bot token or upgrade the viaSocket plan' };
    const last = Number(getSetting('scout.last_run_ms', 0)) || 0;
    if (nowMs - last < 29 * 60 * 1000) return { message: 'Skipped: syncing every 30 minutes through viaSocket' };
  }
  setSetting('scout.last_run_ms', nowMs);
  try { return await syncNow(viaVs, manual); }
  catch (e) {
    if (viaVs && LIMIT_RE.test(e.message || '')) {
      setSetting('scout.backoff_until', nowMs + 6 * 3600 * 1000);
      logActivity('scout', 'viaSocket usage limit reached — Slack sync paused for 6 hours. Add a Slack bot token (Settings) or upgrade the viaSocket plan.', 'error');
      return { error: 'viaSocket usage limit reached — sync paused for 6 hours' };
    }
    throw e;
  }
}

async function syncNow(viaVs, manual) {
  const channel = cfg('SLACK_CHANNEL_ID');
  const now = Date.now() / 1000;
  const lastTs = parseFloat(getSetting('scout.last_ts', 0)) || 0;
  // 36 hours of history, so new replies to this morning's standup thread are caught too
  const oldest = Math.min(lastTs ? lastTs - 3600 : now - 3 * 86400, now - 36 * 3600);
  const stats = { messages: 0, updates: 0, requests: 0, statusChanges: 0, growth: 0, reviews: 0 };

  const msgs = (await slack.history(channel, oldest.toFixed(6))).sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
  const threads = new Map();
  for (const msg of msgs) {
    const fresh = parseFloat(msg.ts) > lastTs - 3600;
    if (fresh && skip(msg) && msg.subtype !== 'message_deleted' && P.isPlugRequest(botText(msg))) {
      stats.messages++;
      if (tracker.createFromMessage({ ...msg, text: botText(msg) }, channel, leadId())) stats.requests++;
    } else if (!skip(msg) && fresh) { stats.messages++; await handleTopLevel(asSim(msg), channel, stats); }
    if (msg.reply_count && parseFloat(msg.latest_reply || msg.ts) > lastTs - 3600) threads.set(msg.ts, msg);
  }
  // the last two Good morning threads (replies keep coming all day)
  for (const d of [U_today(), standup.prevWorkday(U_today())]) { const ts = standup.threadOf(d); if (ts && !threads.has(ts)) threads.set(ts, { ts, text: 'good morning' }); }
  // also check the threads of older open client requests
  const deepAt = Number(getSetting('scout.deep_at', 0)) || 0;
  if (!viaVs || manual || Date.now() - deepAt > 2 * 3600 * 1000) {
    const open = db.prepare(`SELECT slack_ts, text FROM client_requests WHERE status != 'completed' AND slack_ts IS NOT NULL
                             AND is_demo = 0 AND created_at > datetime('now', '-45 days')`).all();
    for (const r of open) if (!threads.has(r.slack_ts)) threads.set(r.slack_ts, { ts: r.slack_ts, text: r.text });
    setSetting('scout.deep_at', Date.now());
  }

  for (const parent of threads.values()) {
    let replies;
    try { replies = await slack.replies(channel, parent.ts); } catch (e) { continue; }
    for (const reply of replies.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))) {
      if (skip(reply)) continue;
      stats.messages++;
      await handleReply(asSim(reply), asSim(parent), channel, stats);
    }
  }
  setSetting('scout.last_ts', now.toFixed(6));
  const reviewResult = stats.reviews ? await inspector.runPending() : null;
  const parts = [];
  if (stats.updates) parts.push(`${stats.updates} updates`);
  if (stats.requests) parts.push(`${stats.requests} new requests`);
  if (stats.statusChanges) parts.push(`${stats.statusChanges} status change`);
  if (stats.growth) parts.push(`${stats.growth} growth posts`);
  if (stats.reviews) parts.push(`${stats.reviews} review asks`);
  const message = parts.length ? 'Sync: ' + parts.join(', ') : 'Sync: nothing new';
  if (parts.length) logActivity('scout', message);
  return { message, stats, review: reviewResult };
}

module.exports = { sync, recordStandup, handleTopLevel, handleReply };
