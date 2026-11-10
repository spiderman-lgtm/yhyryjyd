// MSG91 Flow API (SMS). India mein DLT-approved template chahiye.
// Template variables: ##name## aur ##message## (MSG91_NAME_VAR / MSG91_MESSAGE_VAR se badal sakte ho).
const { cfg } = require('./util');

function enabled() { return !!cfg('MSG91_AUTH_KEY') && !!cfg('MSG91_TEMPLATE_ID'); }

async function sendAlert(recipients) {
  // recipients: [{ phone, name, message }]
  if (!enabled()) return { ok: false, error: 'MSG91 configure nahi hai' };
  const nameVar = cfg('MSG91_NAME_VAR', 'name');
  const msgVar = cfg('MSG91_MESSAGE_VAR', 'message');
  const list = recipients
    .filter((r) => r.phone)
    .map((r) => ({
      mobiles: String(r.phone).replace(/[^0-9]/g, ''),
      [nameVar]: (r.name || '').slice(0, 30),
      [msgVar]: (r.message || '').slice(0, 30), // DLT variables usually max 30 chars
    }));
  if (!list.length) return { ok: false, error: 'Kisi ka phone number nahi hai' };
  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: cfg('MSG91_AUTH_KEY'), 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ template_id: cfg('MSG91_TEMPLATE_ID'), short_url: '0', recipients: list }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body: body.slice(0, 300), sent: list.length };
}

module.exports = { enabled, sendAlert };
