// 🔍 Inspector - app review agent. A member writes "review" in a thread → Inspector reviews against the
// lead's instructions and posts the mistakes in that same thread.
const { db, getSetting } = require('../db');
const slack = require('../slack');
const llm = require('../llm');
const { logActivity, tsToDate, tsToIso, today, memberById, cfg } = require('../util');

function queueFromMessage(msg, member, threadTs, requestId) {
  if (db.prepare('SELECT 1 FROM reviews WHERE slack_ts = ?').get(msg.ts)) return null;
  const prev = db.prepare('SELECT COUNT(*) c FROM reviews WHERE member_id = ? AND thread_ts = ?').get(member.id, threadTs).c;
  const subject = requestId ? (db.prepare('SELECT title FROM client_requests WHERE id = ?').get(requestId) || {}).title : null;
  const info = db.prepare(`INSERT OR IGNORE INTO reviews (member_id, request_id, subject, submission, slack_ts, thread_ts, attempt, date)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(member.id, requestId || null, subject || (msg.text || '').slice(0, 80), msg.text, msg.ts, threadTs, prev + 1, tsToDate(msg.ts));
  if (info.changes) logActivity('inspector', `${member.name} asked for a review${subject ? ': ' + subject : ''} (attempt ${prev + 1})`);
  return info.lastInsertRowid;
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    passed: { type: 'boolean' },
    summary: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'detail', 'severity'],
      },
    },
  },
  required: ['passed', 'summary', 'errors'],
};

async function reviewOne(review) {
  const instructions = getSetting('inspector.instructions', '');
  const member = review.member_id ? memberById(review.member_id) : null;
  let thread = '';
  if (slack.enabled() && review.thread_ts) {
    try {
      const channel = cfg('SLACK_CHANNEL_ID');
      const parent = await slack.call('conversations.replies', { channel, ts: review.thread_ts, limit: 1 });
      const replies = await slack.replies(channel, review.thread_ts);
      thread = [...parent.messages.slice(0, 1), ...replies]
        .filter((r) => parseFloat(r.ts) <= parseFloat(review.slack_ts))
        .map((r) => `[${tsToIso(r.ts)}] ${r.user}: ${r.text}`).join('\n').slice(0, 60000);
    } catch { thread = ''; }
  }
  const out = await llm.askJson({
    effort: 'high',
    system: `You are "Inspector", the reviewer for a team that builds app integrations (plugins with actions and triggers) on viaSocket. Review strictly by the team lead's checklist below. Only report real problems you can see in the submission; do not invent issues. Messages may be in Hinglish. Write findings in short, clear English so the developer can fix them quickly.\n\nTEAM LEAD'S REVIEW INSTRUCTIONS:\n${instructions}`,
    prompt: `Developer: ${member ? member.name : 'unknown'}\nReview attempt: ${review.attempt}\n${review.subject ? 'Request: ' + review.subject + '\n' : ''}\nSubmission message:\n${review.submission}\n\nThread context (oldest first):\n${thread || '(not available)'}\n\nReview it. "passed" is true only if there are no high or medium issues.`,
    schema: SCHEMA,
  });
  const errors = out.errors || [];
  db.prepare(`UPDATE reviews SET status = 'done', errors_count = ?, findings = ?, summary = ?, passed = ? WHERE id = ?`)
    .run(errors.length, JSON.stringify(errors), out.summary, out.passed ? 1 : 0, review.id);

  if (slack.enabled() && review.thread_ts) {
    const tag = member && member.slack_user_id ? `<@${member.slack_user_id}> ` : '';
    const icon = { high: '🔴', medium: '🟠', low: '🟡' };
    const body = errors.length
      ? `${tag}🔍 *Inspector review* (attempt ${review.attempt}) — ${errors.length} thing(s) to fix:\n` +
        errors.map((e, i) => `${i + 1}. ${icon[e.severity] || '•'} *${e.title}* — ${e.detail}`).join('\n') +
        `\n\n${out.summary}\nFix these and write "review" again.`
      : `${tag}🔍 *Inspector review* (attempt ${review.attempt}) — ✅ All good! ${out.summary}`;
    try { await slack.post(cfg('SLACK_CHANNEL_ID'), body, review.thread_ts); }
    catch (e) { logActivity('inspector', 'Posting in the thread failed: ' + e.message, 'warn'); }
  }
  logActivity('inspector', `${member ? member.name : 'Review'}: ${errors.length ? errors.length + ' issue(s) found' : 'pass ✅'}${review.subject ? ' — ' + review.subject : ''}`);
  return errors.length;
}

async function runPending() {
  const pending = db.prepare(`SELECT * FROM reviews WHERE status = 'pending' AND is_demo = 0 ORDER BY id LIMIT 10`).all();
  if (!pending.length) return { message: 'No pending reviews' };
  if (!getSetting('inspector.instructions', '')) {
    return { message: `${pending.length} review(s) pending — add review instructions in Settings` };
  }
  if (!llm.enabled()) return { message: `${pending.length} review(s) pending — ANTHROPIC_API_KEY is needed` };
  let done = 0;
  for (const r of pending) {
    try { await reviewOne(r); done++; }
    catch (e) { logActivity('inspector', `Review #${r.id} failed: ${e.message}`, 'error'); }
  }
  return { message: `${done}/${pending.length} reviews done` };
}

// Manual review from the dashboard (pasted content)
async function manual({ member_id, subject, submission }) {
  const info = db.prepare(`INSERT INTO reviews (member_id, subject, submission, attempt, date) VALUES (?, ?, ?, 1, ?)`)
    .run(member_id || null, subject || 'Manual review', submission, today());
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid);
  await reviewOne(review);
  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { queueFromMessage, runPending, manual };
