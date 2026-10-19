// All runtime config comes from env vars. Anything missing switches that part into
// demo mode, so the app runs end-to-end on embarko.ai before real keys are added.
const env = process.env;

const flow = (name) => env[`VIASOCKET_FLOW_${name.toUpperCase()}`] || '';

export const config = {
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dataFile: env.DATA_FILE || 'data/db.json',
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
  ai: config.claude.apiKey ? 'claude' : 'rules',
  viasocket: Object.fromEntries(
    Object.entries(config.viasocket.flows).map(([k, v]) => [k, v ? 'live' : 'demo']),
  ),
});
