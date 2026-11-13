// 🔭 Scout - reads the Slack channel (top-level + threads) and hands each message to the right
// agent: standup updates, client requests (Tracker), growth posts, review asks (Inspector).
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
      const mentioned = slack.mentions(text);
      const ids = [...tracker.assignedFromMentions(mentioned, leadId()), ...simMentions(text)];
      if (ids.length) tracker.addAssignees(req, ids);
      else if (!mentioned.length) {
        const status = P.detectStatus(text);
        if (status && (await tracker.applyStatus(db.prepare('SELECT * FROM client_requests WHERE id = ?').get(req.id), status, reply, member || null))) stats.statusChanges++;
      }
    } else if (member) {
      const reviewAsk = member.role === 'tech' && P.isReviewAsk(text);
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
  const parentKind = P.standupKind(parent.text || '');
  const ownKind = P.standupKind(text);
  if (parentKind || ownKind) { if (recordStandup(member, ownKind || parentKind, reply)) stats.updates++; return; }
  if (member.role === 'growth') { if (await growth.handle(reply, member)) stats.growth++; return; }
  if (member.role === 'tech' && P.isReviewAsk(text)) { if (inspector.queueFromMessage(reply, member, parent.ts, null)) stats.reviews++; }
}

async function sync() {
  if (!slack.enabled()) return { message: 'Slack is not configured (connect it on Integrations, or set SLACK_BOT_TOKEN + SLACK_CHANNEL_ID)' };
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
  // also check the threads of older open client requests
  const open = db.prepare(`SELECT slack_ts, text FROM client_requests WHERE status != 'completed' AND slack_ts IS NOT NULL
                           AND is_demo = 0 AND created_at > datetime('now', '-45 days')`).all();
  for (const r of open) if (!threads.has(r.slack_ts)) threads.set(r.slack_ts, { ts: r.slack_ts, text: r.text });

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
