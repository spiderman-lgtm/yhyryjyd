// Sends account emails (sign-up / sign-in codes). Uses Resend when RESEND_API_KEY is set, otherwise the
// Gmail connected in workspace 1 (through viaSocket). Returns which way it went.
const { withWorkspace } = require('./db');

function ready() {
  if (process.env.MAIL_DEV_FILE) return 'file'; // tests only: emails are appended to a local file
  if (process.env.RESEND_API_KEY) return 'resend';
  try { return withWorkspace(1, () => require('./viasocket').connected('gmail')) ? 'gmail' : null; } catch { return null; }
}

async function send(to, subject, text) {
  const way = ready();
  if (way === 'file') { require('fs').appendFileSync(process.env.MAIL_DEV_FILE, JSON.stringify({ to, subject, text }) + '\n'); return way; }
  if (way === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM || 'SquadForge <onboarding@resend.dev>', to: [to], subject, text }),
    });
    if (!res.ok) throw new Error('Email could not be sent (' + res.status + ')');
    return way;
  }
  if (way === 'gmail') { await withWorkspace(1, () => require('./viasocket').gmailSend(to, subject, text)); return way; }
  throw new Error('Email is not set up yet');
}

module.exports = { ready, send };
