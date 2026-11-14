// ⚔️ Commander - posts the lead's instruction in the channel (with tags) and, when it is
// important, sends the tagged members an SMS alert through MSG91.
const { db } = require('../db');
const slack = require('../slack');
const llm = require('../llm');
const msg91 = require('../msg91');
const m91 = require('../m91');
require('../db').addSchema('ALTER TABLE broadcasts ADD COLUMN m91_alert TEXT');
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
  const tags = tagged.map((m) => require('../util').tag(m)).join(' ');
  const full = `${important ? '🚨 *IMPORTANT* ' : '📣 '}${tags ? tags + ' ' : ''}${text}`;

  let slackTs = null;
  if (slack.enabled()) {
    const r = await slack.post(cfg('SLACK_CHANNEL_ID'), full);
    slackTs = r.ts;
  }
  let smsStatus = null;
  // Important with nobody tagged = for the whole team: alert everyone except the lead
  const alertTo = important ? (tagged.length ? tagged : require('../util').members().filter((m) => m.role !== 'lead')) : [];
  let m91Alert = null;
  if (important && m91.hasLink()) {
    // the M91 channel: everyone confirms individually; answers come back to /webhooks/m91
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const who = tagged.length ? `For ${tagged.map((m) => m.name.split(' ')[0]).join(', ')}: ` : '';
    const title = (who + (lines[0] || 'Important message')).replace(/[*_`]/g, '').slice(0, 200);
    const cid = 'cmd-' + Date.now().toString(36);
    try {
      const a = await m91.channelAlert({ title, description: text, severity: 'HIGH', customId: cid,
        responseOptions: [{ label: 'Got it 👍', effect: 'PERSONAL' }, { label: 'I have a question', effect: 'PERSONAL', required: ['note'] }],
        callbackUrl: require('../m91-hooks').callbackUrl() });
      m91Alert = (a && (a._id || a.id || (a.alert && (a.alert._id || a.alert.id)))) || cid;
      smsStatus = `M91 channel alert sent${a && a.delivered !== undefined ? ` to ${a.delivered}` : ''}`;
    } catch (e) { smsStatus = 'M91 failed: ' + e.message.slice(0, 120); }
  } else if (important && alertTo.length) {
    if (m91.ready()) {
      // M91: push → SMS → call until someone answers. One direct alert per tagged member.
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const title = (lines[0] || 'Important message').replace(/[*_`]/g, '').slice(0, 120);
      const stamp = Date.now().toString(36);
      let ok = 0; const fails = [];
      for (const m of alertTo) {
        if (!m.phone) { fails.push(`${m.name}: no phone`); continue; }
        try { await m91.sendAlert({ phone: m.phone, title, description: text, severity: 'High', customId: `sf-${stamp}-${m.id}` }); ok++; }
        catch (e) { fails.push(`${m.name}: ${e.message.slice(0, 80)}`); }
      }
      smsStatus = `M91 ${ok}/${alertTo.length}` + (fails.length ? ` (${fails.join('; ')})` : '');
    } else if (msg91.enabled()) {
      const r = await msg91.sendAlert(alertTo.map((m) => ({ phone: m.phone, name: m.name, message: 'Check Slack' })));
      smsStatus = r.ok ? `sent ${r.sent}` : `failed: ${r.error || r.body}`;
    } else smsStatus = 'M91 not connected';
  }
  db.prepare('INSERT INTO broadcasts (message, tagged, important, slack_ts, sms_status, m91_alert) VALUES (?, ?, ?, ?, ?, ?)')
    .run(text, JSON.stringify(tagged.map((m) => m.id)), important ? 1 : 0, slackTs, smsStatus, m91Alert);
  logActivity('commander', `${important ? '🚨 ' : ''}Message sent${tagged.length ? ' → ' + tagged.map((m) => m.name).join(', ') : ''}${smsStatus ? ' | ' + smsStatus : ''}${slack.enabled() ? '' : ' (Slack off — saved only)'}`);
  return { text: full, slack_ts: slackTs, sms: smsStatus };
}

// Draft help: rewrite the lead's message so it reads well. Returns a draft; nothing is sent.
async function polish(message, tone = 'friendly') {
  if (!message || !message.trim()) throw new Error('Write a message first');
  if (!llm.enabled()) throw new Error('AI is not set up yet (ANTHROPIC_API_KEY is missing)');
  const out = await llm.askJson({
    system: `You help a team lead write a message for their team's Slack channel. Rewrite the draft so it is clear, well structured and ${tone === 'firm' ? 'direct and firm, still respectful' : tone === 'short' ? 'as short as possible' : 'warm and friendly'}. Write in English (the draft may be in Hinglish). Keep every fact, name, date, number and link exactly. Do not invent anything. Use Slack formatting (*bold*, bullet lines starting with "• ") only when it helps. Also give a one-line note of what you changed.`,
    prompt: message.trim(),
    schema: { type: 'object', additionalProperties: false, properties: { message: { type: 'string' }, note: { type: 'string' } }, required: ['message', 'note'] },
  });
  logActivity('commander', '✨ AI polished a draft');
  return { text: out.message, note: out.note };
}

module.exports = { broadcast, polish };
