// "Test it for real" checklist: ticks itself from what is actually set up / has happened.
const { db, getSetting } = require('./db');
const U = require('./util');

function build() {
  const vs = require('./viasocket'), llm = require('./llm'), msg91 = require('./msg91'), slack = require('./slack');
  const one = (sql) => !!db.prepare(sql).get();
  const slackOn = slack.enabled();
  const steps = [
    { group: 'Set up', key: 'slack', label: 'Connect Slack', hint: 'Integrations → Slack → Connect', tab: 'integrations', done: slackOn },
    { group: 'Set up', key: 'channel', label: 'Choose the team channel', hint: 'Integrations → Slack → channel (start with a test channel)', tab: 'integrations', done: !!U.cfg('SLACK_CHANNEL_ID') },
    { group: 'Set up', key: 'lead', label: 'Pick yourself as the lead', hint: 'Integrations → Slack → “Who am I”', tab: 'integrations', done: !!U.cfg('LEAD_SLACK_USER_ID') },
    { group: 'Set up', key: 'demo', label: 'Clear the demo data', hint: 'Settings → Clear demo', tab: 'settings', done: !one('SELECT 1 FROM members WHERE is_demo = 1') },
    { group: 'Set up', key: 'members', label: 'Add your team members', hint: 'Settings → Import from Slack, then check roles', tab: 'settings', done: one('SELECT 1 FROM members WHERE is_demo = 0 AND active = 1 AND role != \'lead\'') },
    { group: 'Set up', key: 'm91', label: 'Connect M91 and send a test alert', hint: 'Integrations → M91 → Connect → Test', tab: 'integrations', done: (vs.connected('m91') || msg91.enabled() || require('./m91').hasLink()) && one("SELECT 1 FROM activity WHERE message LIKE '%M91 test alert%'") },
    { group: 'Set up', key: 'ai', label: 'Add the AI key', hint: 'Embarko → App setup → ANTHROPIC_API_KEY', tab: null, done: llm.enabled() },
    { group: 'Set up', key: 'rules', label: 'Write the Inspector review rules', hint: 'Reviews → instructions', tab: 'reviews', done: !!getSetting('inspector.instructions', '') },
    { group: 'Try a real day', key: 'standup', label: 'A morning or evening update is read from Slack', hint: 'Someone posts “Good morning — plan: …” in the channel', tab: 'team', done: one('SELECT 1 FROM daily_logs WHERE is_demo = 0 AND (morning_ts IS NOT NULL OR evening_ts IS NOT NULL)') },
    { group: 'Try a real day', key: 'request', label: 'A client request is picked up', hint: 'Post “Client request: … @teammate” in the channel', tab: 'requests', done: one('SELECT 1 FROM client_requests WHERE is_demo = 0 AND slack_ts IS NOT NULL') },
    { group: 'Try a real day', key: 'status', label: 'Its status moves (r&d / started / stuck / completed)', hint: 'The teammate replies in the request thread', tab: 'requests', done: one("SELECT 1 FROM request_events e JOIN client_requests r ON r.id = e.request_id WHERE r.is_demo = 0 AND e.status != 'new' AND e.slack_ts IS NOT NULL AND r.slack_ts IS NOT NULL") },
    { group: 'Try a real day', key: 'review', label: 'Inspector reviews a submission', hint: 'Reply “ready for review” in a thread', tab: 'reviews', done: one("SELECT 1 FROM reviews WHERE is_demo = 0 AND status = 'done'") },
    { group: 'Try a real day', key: 'alert', label: 'The 7 PM alert goes out', hint: 'Wait for 7 PM, or Village → Herald → Run now', tab: 'village', done: one("SELECT 1 FROM reports WHERE kind = 'daily'") },
    { group: 'Try a real day', key: 'commander', label: 'Send a Commander message', hint: 'Commander → write → Improve with AI → Send', tab: 'commander', done: one('SELECT 1 FROM broadcasts') },
  ];
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length, hidden: !!getSetting('checklist.hidden', false) };
}

module.exports = { build };
