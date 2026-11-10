// ⚔️ Commander - posts the lead's instruction in the channel (with tags) and, when it is
// important, sends the tagged members an SMS alert through MSG91.
const { db } = require('../db');
const slack = require('../slack');
const llm = require('../llm');
const msg91 = require('../msg91');
const { logActivity, memberById, cfg } = require('../util');

async function broadcast({ message, member_ids = [], important = false, polish = false }) {
  if (!message || !message.trim()) throw new Error('Message is empty');
  let text = message.trim();
  if (polish && llm.enabled()) {
    try {
      const out = await llm.askJson({
        system: 'Rewrite a team lead\'s instruction for their Slack channel: clear, polite and short, in English (the input may be in Hinglish). Keep every fact, date and name. Do not add new information.',
        prompt: text,
        schema: { type: 'object', additionalProperties: false, properties: { message: { type: 'string' } }, required: ['message'] },
      });
      text = out.message;
    } catch (e) { logActivity('commander', 'Polish failed, sent the original: ' + e.message, 'warn'); }
  }
  const tagged = member_ids.map((id) => memberById(Number(id))).filter(Boolean);
  const tags = tagged.filter((m) => m.slack_user_id).map((m) => `<@${m.slack_user_id}>`).join(' ');
  const full = `${important ? '🚨 *IMPORTANT* ' : '📣 '}${tags ? tags + ' ' : ''}${text}`;

  let slackTs = null;
  if (slack.enabled()) {
    const r = await slack.post(cfg('SLACK_CHANNEL_ID'), full);
    slackTs = r.ts;
  }
  let smsStatus = null;
  if (important && tagged.length) {
    if (msg91.enabled()) {
      const r = await msg91.sendAlert(tagged.map((m) => ({ phone: m.phone, name: m.name, message: 'Check Slack' })));
      smsStatus = r.ok ? `sent ${r.sent}` : `failed: ${r.error || r.body}`;
    } else smsStatus = 'MSG91 not configured';
  }
  db.prepare('INSERT INTO broadcasts (message, tagged, important, slack_ts, sms_status) VALUES (?, ?, ?, ?, ?)')
    .run(text, JSON.stringify(tagged.map((m) => m.id)), important ? 1 : 0, slackTs, smsStatus);
  logActivity('commander', `${important ? '🚨 ' : ''}Message sent${tagged.length ? ' → ' + tagged.map((m) => m.name).join(', ') : ''}${smsStatus ? ' | SMS: ' + smsStatus : ''}${slack.enabled() ? '' : ' (Slack off — saved only)'}`);
  return { text: full, slack_ts: slackTs, sms: smsStatus };
}

module.exports = { broadcast };
