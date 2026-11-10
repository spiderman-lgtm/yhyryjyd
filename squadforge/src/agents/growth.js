// 🌱 Growth - growth member ke posts: support requests, app listing, blog, newsletter,
// credentials. Credentials/docs aate hi stuck request ko unblock karke thread mein batata hai.
const { db, getSetting } = require('../db');
const slack = require('../slack');
const llm = require('../llm');
const { logActivity, tsToDate, cfg } = require('../util');
const { growthKind, mentionsApp } = require('../parser');

const KIND_LABEL = {
  support_request: 'Support request', app_listing: 'App listing', blog: 'Blog',
  newsletter: 'Newsletter', credentials: 'Credentials/Docs', other: 'Other',
};

async function classify(text) {
  const k = growthKind(text);
  if (k || !llm.enabled() || (text || '').length < 20) return k;
  try {
    const out = await llm.askJson({
      system: 'Classify a Slack message from the growth member of an app-integration team.',
      prompt: `Message:\n${text}\n\nCategories: support_request (a user/support/customer need related to an app), app_listing, blog, newsletter, credentials (credentials/API docs/access for an app received), other.`,
      schema: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: Object.keys(KIND_LABEL) } }, required: ['kind'] },
    });
    return out.kind === 'other' ? null : out.kind;
  } catch { return null; }
}

async function handle(msg, member) {
  if (db.prepare('SELECT 1 FROM growth_items WHERE slack_ts = ?').get(msg.ts)) return null;
  const kind = await classify(msg.text);
  if (!kind) return null;
  const info = db.prepare('INSERT OR IGNORE INTO growth_items (member_id, kind, text, slack_ts, date) VALUES (?, ?, ?, ?, ?)')
    .run(member.id, kind, msg.text, msg.ts, tsToDate(msg.ts));
  if (!info.changes) return null;
  logActivity('growth', `${member.name}: ${KIND_LABEL[kind]} - ${(msg.text || '').replace(/\s+/g, ' ').slice(0, 80)}`);
  if (kind === 'credentials') await tryUnblock(info.lastInsertRowid, msg, member);
  return kind;
}

async function tryUnblock(itemId, msg, member) {
  const open = db.prepare(`SELECT * FROM client_requests WHERE status IN ('stuck','rnd','new') ORDER BY stuck_at DESC, created_at DESC LIMIT 40`).all();
  if (!open.length) return;
  let match = open.find((r) => mentionsApp(msg.text, r.title));
  if (!match && llm.enabled()) {
    try {
      const out = await llm.askJson({
        system: 'Match a message saying credentials/docs for an app arrived to one of the open client requests.',
        prompt: `Message:\n${msg.text}\n\nOpen requests:\n${open.map((r) => `${r.id}: ${r.title}${r.stuck_reason ? ' (stuck: ' + r.stuck_reason + ')' : ''}`).join('\n')}\n\nReturn the matching request id, or 0 if none clearly matches.`,
        schema: { type: 'object', additionalProperties: false, properties: { request_id: { type: 'integer' } }, required: ['request_id'] },
      });
      match = open.find((r) => r.id === out.request_id);
    } catch { /* ignore */ }
  }
  if (!match) return;
  db.prepare('UPDATE growth_items SET app_name = ?, unblocked_request_id = ? WHERE id = ?').run(match.title, match.id, itemId);
  logActivity('growth', `🔓 "${match.title}" ke credentials/docs aa gaye (${member.name})`);
  if (slack.enabled() && match.slack_ts && getSetting('growth.notify_thread', true)) {
    const ids = JSON.parse(match.assigned_member_ids || '[]');
    const tags = ids.map((id) => db.prepare('SELECT slack_user_id FROM members WHERE id = ?').get(id))
      .filter((m) => m && m.slack_user_id).map((m) => `<@${m.slack_user_id}>`).join(' ');
    try {
      await slack.post(match.channel || cfg('SLACK_CHANNEL_ID'),
        `🔓 *Unblocked:* <@${member.slack_user_id}> ne is app ke credentials/docs share kar diye hain. ${tags} ab is app pe kaam shuru kar sakte ho.`, match.slack_ts);
    } catch (e) { logActivity('growth', 'Thread mein post fail: ' + e.message, 'warn'); }
  }
}

module.exports = { handle, KIND_LABEL };
