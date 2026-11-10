// 🔭 Scout - Slack channel padhta hai (top-level + threads) aur har message ko sahi agent
// tak bhejta hai: standup updates, client requests (Tracker), growth posts, review asks (Inspector).
const { db, getSetting, setSetting } = require('../db');
const slack = require('../slack');
const llm = require('../llm');
const tracker = require('./tracker');
const growth = require('./growth');
const inspector = require('./inspector');
const { cfg, logActivity, memberBySlack, tsToDate } = require('../util');
const P = require('../parser');

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
  // heuristic counts (Analyst AI se baad mein refine karta hai)
  if (kind === 'morning') {
    db.prepare('UPDATE daily_logs SET planned_count = ? WHERE member_id = ? AND date = ?').run(P.countItems(text), member.id, date);
  } else {
    const c = P.parseCounts(text);
    db.prepare(`UPDATE daily_logs SET done_count = ?, actions_count = ?, triggers_count = ?, apps_count = ? WHERE member_id = ? AND date = ?`)
      .run(P.countItems(text), c.actions, c.triggers, c.apps, member.id, date);
  }
  logActivity('scout', `${member.name} ka ${kind === 'morning' ? 'subah ka plan' : 'shaam ka update'} mila`);
  return true;
}

async function statusFor(text) {
  const s = P.detectStatus(text);
  if (s || !llm.enabled() || (text || '').length < 15) return s;
  try {
    const out = await llm.askJson({
      system: 'Classify a developer\'s reply in a Slack thread about a client request to build an app integration. Messages are in Hinglish.',
      prompt: `Reply:\n${text}\n\nWhich status does it announce? rnd (checking if the app can be built / researching), started (began building), stuck (blocked - e.g. API docs missing, no credentials), completed (app done/published), none (just a comment).`,
      schema: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', enum: ['rnd', 'started', 'stuck', 'completed', 'none'] } }, required: ['status'] },
    });
    return out.status === 'none' ? null : out.status;
  } catch { return null; }
}

async function handleTopLevel(msg, channel, stats) {
  const member = memberBySlack(msg.user);
  const text = msg.text || '';
  if (isLead(msg.user, member) && P.isRequest(text)) {
    if (tracker.createFromMessage(msg, channel, leadId())) stats.requests++;
    return;
  }
  if (!member || member.role === 'lead') return; // standup parent posts by lead/bots: replies handle karenge
  const kind = P.standupKind(text);
  if (kind) { if (recordStandup(member, kind, msg)) stats.updates++; return; }
  if (member.role === 'growth') { if (await growth.handle(msg, member)) stats.growth++; return; }
  if (P.isReviewAsk(text)) { if (inspector.queueFromMessage(msg, member, msg.ts, null)) stats.reviews++; }
}

async function handleReply(reply, parent, channel, stats) {
  const member = memberBySlack(reply.user);
  const text = reply.text || '';
  const req = db.prepare('SELECT * FROM client_requests WHERE slack_ts = ?').get(parent.ts);
  if (req) {
    if (isLead(reply.user, member)) {
      const ids = tracker.assignedFromMentions(slack.mentions(text), leadId());
      if (ids.length) tracker.addAssignees(req, ids);
    } else if (member) {
      const reviewAsk = member.role === 'tech' && P.isReviewAsk(text);
      if (reviewAsk && inspector.queueFromMessage(reply, member, parent.ts, req.id)) stats.reviews++;
      if (member.role === 'growth') {
        if (await growth.handle(reply, member)) stats.growth++;
      } else {
        // "completed, review please" → status bhi aur review bhi. Sirf "review please" pe AI se status mat poochho.
        const status = reviewAsk ? P.detectStatus(text) : await statusFor(text);
        if (status && (await tracker.applyStatus(db.prepare('SELECT * FROM client_requests WHERE id = ?').get(req.id), status, reply, member))) stats.statusChanges++;
      }
    }
    db.prepare(`UPDATE client_requests SET last_reply_ts = ? WHERE id = ?
                AND (last_reply_ts IS NULL OR CAST(last_reply_ts AS REAL) < CAST(? AS REAL))`).run(reply.ts, req.id, reply.ts);
    return;
  }
  if (!member || member.role === 'lead') return;
  const parentKind = P.standupKind(parent.text || '');
  const ownKind = P.standupKind(text);
  if (parentKind || ownKind) { if (recordStandup(member, ownKind || parentKind, reply)) stats.updates++; return; }
  if (member.role === 'growth') { if (await growth.handle(reply, member)) stats.growth++; return; }
  if (member.role === 'tech' && P.isReviewAsk(text)) { if (inspector.queueFromMessage(reply, member, parent.ts, null)) stats.reviews++; }
}

async function sync() {
  if (!slack.enabled()) return { message: 'Slack configure nahi hai (SLACK_BOT_TOKEN, SLACK_CHANNEL_ID)' };
  const channel = cfg('SLACK_CHANNEL_ID');
  const now = Date.now() / 1000;
  const lastTs = parseFloat(getSetting('scout.last_ts', 0)) || 0;
  // 36 ghante ki history: subah ke standup thread ke naye replies bhi pakad sake
  const oldest = Math.min(lastTs ? lastTs - 3600 : now - 3 * 86400, now - 36 * 3600);
  const stats = { messages: 0, updates: 0, requests: 0, statusChanges: 0, growth: 0, reviews: 0 };

  const msgs = (await slack.history(channel, oldest.toFixed(6))).sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
  const threads = new Map();
  for (const msg of msgs) {
    if (!skip(msg) && parseFloat(msg.ts) > lastTs - 3600) { stats.messages++; await handleTopLevel(msg, channel, stats); }
    if (msg.reply_count && parseFloat(msg.latest_reply || msg.ts) > lastTs - 3600) threads.set(msg.ts, msg);
  }
  // purani open client requests ke threads bhi dekho
  const open = db.prepare(`SELECT slack_ts, text FROM client_requests WHERE status != 'completed' AND slack_ts IS NOT NULL
                           AND is_demo = 0 AND created_at > datetime('now', '-45 days')`).all();
  for (const r of open) if (!threads.has(r.slack_ts)) threads.set(r.slack_ts, { ts: r.slack_ts, text: r.text });

  for (const parent of threads.values()) {
    let replies;
    try { replies = await slack.replies(channel, parent.ts); } catch (e) { continue; }
    for (const reply of replies.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))) {
      if (skip(reply)) continue;
      stats.messages++;
      await handleReply(reply, parent, channel, stats);
    }
  }
  setSetting('scout.last_ts', now.toFixed(6));
  const reviewResult = stats.reviews ? await inspector.runPending() : null;
  const parts = [];
  if (stats.updates) parts.push(`${stats.updates} updates`);
  if (stats.requests) parts.push(`${stats.requests} nayi requests`);
  if (stats.statusChanges) parts.push(`${stats.statusChanges} status change`);
  if (stats.growth) parts.push(`${stats.growth} growth posts`);
  if (stats.reviews) parts.push(`${stats.reviews} review asks`);
  const message = parts.length ? 'Sync: ' + parts.join(', ') : 'Sync: kuch naya nahi';
  if (parts.length) logActivity('scout', message);
  return { message, stats, review: reviewResult };
}

module.exports = { sync, recordStandup, handleTopLevel, handleReply };
