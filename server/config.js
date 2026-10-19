// All runtime config comes from env vars. Anything missing switches that part into
// demo mode, so the app runs end-to-end on embarko.ai before real keys are added.
import fs from 'node:fs';
import path from 'node:path';

// Local development reads .env (never uploaded, never committed); hosts set real env vars.
// Skipped under `node --test` so tests never reach real services.
if (!process.env.NODE_TEST_CONTEXT) try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env */ }

const env = process.env;

const flow = (name) => env[`VIASOCKET_FLOW_${name.toUpperCase()}`] || '';

export const config = {
  port: Number(env.PORT || 3000),
  // Embarko sets APP_NAME and serves the app at https://<APP_NAME>.embarko.app
  onEmbarko: Boolean(env.APP_NAME),
  publicUrl: (env.PUBLIC_URL || (env.APP_NAME ? `https://${env.APP_NAME}.embarko.app` : `http://localhost:${env.PORT || 3000}`)).replace(/\/$/, ''),
  // DATA_DIR survives redeploys on Embarko; everything else on disk is wiped.
  dataFile: env.DATA_FILE || path.join(env.DATA_DIR || 'data', 'db.json'),
  adminToken: env.ADMIN_TOKEN || '',
  timezone: env.SHOP_TIMEZONE || 'Asia/Kolkata',

  whatsapp: {
    token: env.WHATSAPP_TOKEN || '',
    phoneId: env.WHATSAPP_PHONE_ID || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || 'dukaan-verify',
    apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
  },

  claude: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.CLAUDE_MODEL || 'claude-opus-5-5',
  },

  viasocket: {
    // Shared secret viaSocket sends back as `x-dukaan-secret` on callbacks.
    callbackSecret: env.VIASOCKET_CALLBACK_SECRET || '',
    flows: {
      save_order: flow('save_order'),
      update_order: flow('update_order'),
      create_payment_link: flow('create_payment_link'),
      send_reminder: flow('send_reminder'),
      escalate_to_owner: flow('escalate_to_owner'),
      monthly_report: flow('monthly_report'),
      connect_new_app: flow('connect_new_app'),
    },
  },

  scheduler: {
    intervalMs: Number(env.SCHEDULER_INTERVAL_MS || 60_000),
    reminderLeadHours: Number(env.REMINDER_LEAD_HOURS || 2),
    udhaarDays: [1, 3, 7], // polite, firm + link, escalate
    quietHourStart: 21, // no customer nudges from 9 PM…
    quietHourEnd: 9, // …to 9 AM
  },
};

export const modes = () => ({
  whatsapp: config.whatsapp.token && config.whatsapp.phoneId ? 'live' : 'demo',
  viasocket: Object.fromEntries(
    Object.entries(config.viasocket.flows).map(([k, v]) => [k, v ? 'live' : 'demo']),
  ),
});
