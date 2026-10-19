// App Analyzer — viaSocket plugin-validator rubric, scoped to one shop (docs/APP_ANALYZER.md).
// With an API key: step 1 researches the app on the web, step 2 scores it as strict JSON.
// Without one (or on failure): a catalog + category heuristic. The verdict is always
// recomputed from the score here, and duplicates are checked against connected apps.
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { get } from './store.js';

export const DIMENSIONS = { fit: 20, demand: 20, technical: 15, viasocket: 15, better_than_manual: 10, risk: 10, evidence: 10 };
export const verdictOf = (s) => (s >= 70 ? 'GO' : s >= 45 ? 'CONDITIONAL' : 'NO-GO');
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const uc = (name, trigger, action, result, status = 'PLAUSIBLE') => ({ name, trigger, action, result, status });

// Pre-researched verdicts for apps Indian small shops ask for most.
const KNOWN = {
  shiprocket: { category: 'shipping', fitFor: ['boutique', 'kirana', 'bakery'], connector: 'NOT REQUIRED', confidence: 'MEDIUM',
    b: { fit: 16, demand: 16, technical: 13, viasocket: 11, better_than_manual: 9, risk: 7, evidence: 6 },
    opp: 'Delivery orders ka courier khud book ho aur tracking customer ko WhatsApp pe jaaye.',
    risk: 'Sirf delivery-heavy dukaan ke kaam ka — pickup-only dukaan ke liye bekaar.',
    uc: [uc('Auto courier booking', 'Order PAID + mode = delivery', 'Shiprocket order + AWB create', 'Owner courier site pe nahi jaata'),
      uc('Tracking on WhatsApp', 'Shipment shipped / out for delivery', 'Tracking link WhatsApp pe', '"Parcel kahan hai?" band'),
      uc('RTO alert', 'Shipment RTO / failed', 'Owner alert + address confirm', 'Return cost kam')],
    success: 'Pehle 20 delivery orders bina owner ke book hon.', kill: 'Mahine mein < 10 delivery orders.' },
  razorpay: { category: 'payments', connector: 'NOT REQUIRED', confidence: 'HIGH',
    b: { fit: 19, demand: 19, technical: 14, viasocket: 13, better_than_manual: 9, risk: 7, evidence: 8 },
    opp: 'Payment link + auto PAID — core flow.', risk: 'Gateway fees owner ko samjhaani padengi.',
    uc: [uc('Payment link', 'Order confirmed', 'Payment link → WhatsApp', '1-tap pay', 'PROVEN'),
      uc('Auto PAID', 'payment_link.paid webhook', 'Order = PAID + thank-you', 'Zero hisaab', 'PROVEN'),
      uc('Udhaar link', 'Udhaar Day 3', 'Link reminder ke saath', 'Fast vasooli')],
    success: '90% orders link se pay hon.', kill: '—' },
  cashfree: { category: 'payments', dupOf: 'Razorpay', connector: 'NOT REQUIRED', confidence: 'MEDIUM',
    b: { fit: 16, demand: 14, technical: 13, viasocket: 11, better_than_manual: 8, risk: 7, evidence: 6 },
    opp: 'Razorpay ki jagah payment link + auto PAID.', risk: 'Razorpay already ho to duplicate — do jagah hisaab.',
    uc: [uc('Payment link', 'Order confirmed', 'Cashfree link → WhatsApp', '1-tap pay'),
      uc('Auto PAID', 'Payment success webhook', 'Order = PAID', 'No checking'),
      uc('Udhaar link', 'Udhaar Day 3', 'Fresh link', 'Fast vasooli')],
    success: 'Razorpay replace ho.', kill: 'Dono gateway active.' },
  'google calendar': { category: 'calendar', fitFor: ['tuition', 'salon', 'boutique'], connector: 'NOT REQUIRED', confidence: 'MEDIUM',
    b: { fit: 15, demand: 15, technical: 14, viasocket: 13, better_than_manual: 8, risk: 8, evidence: 6 },
    opp: 'Appointment/class slots WhatsApp se calendar mein — double booking khatam.', risk: 'Order-based dukaan ke liye zaroorat kam.',
    uc: [uc('Slot booking', '"Kal 4 baje haircut"', 'Free slot check → event', 'No double booking'),
      uc('Class reminder', 'Event − 1h', 'WhatsApp reminder', 'Attendance up'),
      uc('Reschedule', '"Time badal do"', 'Event update', 'Owner free')],
    success: '2 hafte mein 30+ bookings.', kill: 'Owner calendar dekhta hi nahi.' },
  'zoho books': { category: 'accounting', connector: 'NOT REQUIRED', confidence: 'MEDIUM',
    b: { fit: 12, demand: 11, technical: 13, viasocket: 11, better_than_manual: 6, risk: 6, evidence: 5 },
    opp: 'Har PAID order pe GST invoice khud bane.', risk: 'Chhoti dukaan GST invoice maangti hi nahi — Sheet kaafi hai.',
    ask: 'Kya customers GST invoice maangte hain, ya CA ko monthly data chahiye?',
    uc: [uc('Auto invoice', 'Order PAID', 'Invoice → PDF WhatsApp', 'GST-ready'),
      uc('Payment record', 'Payment received', 'Invoice paid mark', 'Books match'),
      uc('CA export', 'Month end', 'Summary CA ko', 'Filing easy')],
    success: 'Owner confirm kare GST invoice chahiye.', kill: '< 5 invoice requests/month.' },
  tally: { category: 'accounting', connector: 'PARTNER-BUILD', confidence: 'LOW',
    b: { fit: 12, demand: 10, technical: 5, viasocket: 5, better_than_manual: 6, risk: 6, evidence: 4 },
    opp: 'Tally wali dukaan ki sales entries auto ho jaayein.', risk: 'Tally mostly local/desktop — cloud sync route UNKNOWN.',
    ask: 'Tally kis computer pe chalta hai aur CA usse data kaise leta hai?',
    uc: [uc('Sales voucher', 'Order PAID', 'Voucher via bridge', 'CA ka kaam kam'),
      uc('Month export', 'Month end', 'Import file', 'Manual entry khatam'),
      uc('Stock sync', 'Order fulfilled', 'Stock reduce', 'Inventory sahi')],
    success: 'Sync route verify + CA haan bole.', kill: 'Local-only setup.' },
  khatabook: { category: 'ledger', dupOf: 'built-in udhaar', connector: 'NO', confidence: 'MEDIUM',
    b: { fit: 8, demand: 6, technical: 3, viasocket: 3, better_than_manual: 2, risk: 5, evidence: 4 },
    opp: 'Koi nahi — udhaar tracking + reminders already built-in hain.', risk: 'Duplicate ledger; public API UNKNOWN.',
    uc: [uc('(Duplicate) Udhaar entry', 'Order unpaid', 'Khata entry', 'Already built-in'),
      uc('(Duplicate) Reminder', 'Due date', 'SMS', 'WhatsApp reminder already'),
      uc('One-time import', 'Setup', 'Purana udhaar import', 'Connector ki zaroorat nahi')],
    success: '—', kill: 'Built-in udhaar ladder cover karta hai.' },
  instagram: { category: 'social', fitFor: ['boutique', 'bakery', 'salon'], connector: 'NOT REQUIRED', confidence: 'LOW',
    b: { fit: 13, demand: 13, technical: 10, viasocket: 9, better_than_manual: 7, risk: 6, evidence: 5 },
    opp: 'Instagram DM orders bhi usi AI pipeline mein.', risk: 'DM API sirf Business account + Meta approval pe.',
    ask: 'Instagram DM pe hafte mein kitne order aate hain?',
    uc: [uc('DM → order', 'DM "ye available hai?"', 'Same AI order flow', 'Ek pipeline'),
      uc('Post → broadcast', 'Naya post', 'Opt-in customers ko update', 'Repeat orders'),
      uc('Comment → lead', '"Price?" comment', 'DM/WhatsApp link', 'Lead miss nahi')],
    success: '10+ DM orders/week.', kill: 'Business account nahi / < 5 DMs/week.' },
  shopify: { category: 'ecommerce', connector: 'NOT REQUIRED', confidence: 'MEDIUM',
    b: { fit: 10, demand: 11, technical: 14, viasocket: 13, better_than_manual: 6, risk: 7, evidence: 5 },
    opp: 'Website orders bhi WhatsApp confirm + reminder pipeline mein.', risk: 'Zyada tar WhatsApp dukaan ki website hi nahi hoti.',
    ask: 'Shopify website live hai? Mahine mein kitne order?',
    uc: [uc('Web order → WhatsApp', 'New Shopify order', 'Sheet + WhatsApp confirm', 'Ek jagah orders', 'PROVEN'),
      uc('Order status', '"Mera order?"', 'Shopify status reply', 'Support zero'),
      uc('Abandoned cart', 'Checkout abandoned', 'WhatsApp nudge (opt-in)', 'Recovered sales')],
    success: '20+ web orders/month.', kill: 'Website nahi.' },
  gmail: { category: 'email', connector: 'NOT REQUIRED', confidence: 'MEDIUM',
    b: { fit: 6, demand: 6, technical: 14, viasocket: 13, better_than_manual: 3, risk: 6, evidence: 5 },
    opp: 'CA/supplier ko monthly report email.', risk: 'Customers WhatsApp pe hain, email pe nahi.',
    uc: [uc('CA report', 'Month end', 'Email summary', 'Thoda time'), uc('Supplier order', 'Low stock', 'Email', 'Rare'), uc('Invoice email', 'PAID', 'Email', 'WhatsApp already')],
    success: 'Specific recipient (CA) chahiye.', kill: 'Koi recipient nahi.' },
  swiggy: { category: 'aggregator', connector: 'NO', confidence: 'LOW',
    b: { fit: 8, demand: 9, technical: 2, viasocket: 2, better_than_manual: 3, risk: 4, evidence: 3 },
    opp: 'Aggregator orders ek jagah — par small-shop partner API UNKNOWN/restricted.', risk: 'Open API nahi → connector possible nahi.',
    uc: [uc('Order mirror', 'Aggregator order', 'Sheet row', 'API nahi'), uc('Monthly merge', 'Month end', 'Report', 'Manual CSV'), uc('Rating alert', 'New rating', 'Owner alert', 'API nahi')],
    success: '—', kill: 'Public API nahi.' },
  'google business profile': { category: 'social', connector: 'NOT REQUIRED', confidence: 'LOW',
    b: { fit: 13, demand: 12, technical: 11, viasocket: 9, better_than_manual: 8, risk: 8, evidence: 5 },
    opp: 'Happy customer se review maangna — fulfilled ke baad khud.', risk: 'API access approval; viaSocket availability verify karo.',
    ask: 'Dukaan Google Maps pe listed hai?',
    uc: [uc('Review request', 'Order FULFILLED', 'WhatsApp review link', 'Rating up'), uc('Bad review alert', '≤ 3★ review', 'Owner alert', 'Jaldi response'), uc('Hours update', 'Holiday', 'Profile hours', 'Galat time pe koi nahi aata')],
    success: '30 din mein 15+ reviews.', kill: 'Listing nahi.' },
};
KNOWN.zomato = KNOWN.swiggy;
KNOWN.vyapar = { ...KNOWN.khatabook, dupOf: 'built-in udhaar + Sheet' };

const CAT = {
  payments: { b: { fit: 16, demand: 14, technical: 11, viasocket: 9, better_than_manual: 7, risk: 6, evidence: 3 }, opp: 'Payment collect + auto PAID.', risk: 'Doosra gateway already ho to duplicate.', dup: 'razorpay',
    uc: [uc('Payment link', 'Order confirmed', 'Link → WhatsApp', '1-tap pay'), uc('Auto PAID', 'Payment webhook', 'Order = PAID', 'Zero hisaab'), uc('Udhaar link', 'Udhaar reminder', 'Link attach', 'Fast vasooli')] },
  shipping: { b: { fit: 14, demand: 14, technical: 10, viasocket: 8, better_than_manual: 8, risk: 6, evidence: 3 }, opp: 'Delivery orders ka courier auto-book.', risk: 'Pickup-only dukaan ke liye bekaar.',
    uc: [uc('Auto booking', 'PAID + delivery', 'Courier order', 'Owner free'), uc('Tracking', 'Status change', 'WhatsApp tracking', 'No "kahan hai?"'), uc('Failed delivery', 'RTO', 'Owner alert', 'Cost bachat')] },
  accounting: { b: { fit: 11, demand: 10, technical: 10, viasocket: 8, better_than_manual: 6, risk: 6, evidence: 3 }, opp: 'Invoice/books auto.', risk: 'Chhoti dukaan ke liye Sheet kaafi ho sakti hai.', ask: 'GST invoice ya CA ko data chahiye?',
    uc: [uc('Auto invoice', 'Order PAID', 'Invoice create', 'GST-ready'), uc('Payment sync', 'Payment', 'Invoice paid', 'Books match'), uc('CA export', 'Month end', 'Summary', 'Filing easy')] },
  calendar: { b: { fit: 14, demand: 13, technical: 11, viasocket: 9, better_than_manual: 8, risk: 7, evidence: 3 }, opp: 'Appointments WhatsApp se calendar mein.', risk: 'Order-based dukaan ke liye kam kaam ka.',
    uc: [uc('Slot booking', '"Kal 4 baje"', 'Event create', 'No double booking'), uc('Reminder', 'Event − 1h', 'WhatsApp reminder', 'Show-up up'), uc('Reschedule', '"Time badlo"', 'Event update', 'Owner free')] },
  social: { b: { fit: 12, demand: 11, technical: 8, viasocket: 7, better_than_manual: 6, risk: 6, evidence: 3 }, opp: 'Doosre channel ke leads bhi same AI mein.', risk: 'API access/approval UNKNOWN.', ask: 'Is channel se hafte mein kitne order/leads aate hain?',
    uc: [uc('DM → order', 'New DM', 'AI order flow', 'Ek pipeline'), uc('Post → broadcast', 'New post', 'Opt-in update', 'Repeat sales'), uc('Lead capture', 'Inquiry', 'WhatsApp link', 'No lead miss')] },
  sheets: { b: { fit: 13, demand: 12, technical: 12, viasocket: 10, better_than_manual: 6, risk: 7, evidence: 3 }, opp: 'Order/catalog data ka alag store.', risk: 'Google Sheets already ho to duplicate.', dup: 'google sheets',
    uc: [uc('Order row', 'Order confirmed', 'Row add', 'Record'), uc('Catalog sync', 'Price change', 'Catalog update', 'Sahi price'), uc('Report', 'Month end', 'Aggregate', 'Hisaab')] },
  ecommerce: { b: { fit: 10, demand: 10, technical: 12, viasocket: 10, better_than_manual: 6, risk: 7, evidence: 3 }, opp: 'Website orders bhi WhatsApp pipeline mein.', risk: 'Website active hai ya nahi — UNKNOWN.', ask: 'Website pe mahine mein kitne order?',
    uc: [uc('Web → WhatsApp', 'New web order', 'Sheet + confirm', 'Ek jagah'), uc('Status', '"Mera order?"', 'Status reply', 'Support zero'), uc('Cart nudge', 'Abandoned', 'WhatsApp nudge', 'Recovered sales')] },
  email: { b: { fit: 6, demand: 6, technical: 12, viasocket: 10, better_than_manual: 3, risk: 6, evidence: 3 }, opp: 'CA/supplier ko report.', risk: 'Customer email pe nahi hai.',
    uc: [uc('CA report', 'Month end', 'Email summary', 'Thoda time'), uc('Supplier', 'Low stock', 'Email', 'Rare'), uc('Invoice', 'PAID', 'Email', 'WhatsApp already')] },
  ledger: { b: { fit: 8, demand: 6, technical: 4, viasocket: 3, better_than_manual: 2, risk: 5, evidence: 3 }, opp: 'Udhaar already built-in hai.', risk: 'Duplicate ledger.', dup: 'built-in',
    uc: [uc('(Dup) Khata entry', 'Unpaid', 'Entry', 'Already built-in'), uc('(Dup) Reminder', 'Due', 'SMS', 'WhatsApp already'), uc('Import', 'Setup', 'Old data import', 'One-time')] },
  aggregator: { b: { fit: 8, demand: 8, technical: 3, viasocket: 2, better_than_manual: 3, risk: 4, evidence: 3 }, opp: 'Aggregator orders ek jagah.', risk: 'Partner API usually restricted — UNKNOWN.',
    uc: [uc('Order mirror', 'Aggregator order', 'Sheet row', 'API nahi'), uc('Monthly merge', 'Month end', 'Report', 'Manual CSV'), uc('Rating alert', 'New rating', 'Owner alert', 'API nahi')] },
  other: { b: { fit: 8, demand: 7, technical: 7, viasocket: 6, better_than_manual: 4, risk: 6, evidence: 2 }, opp: 'Abhi clear nahi — owner ka goal chahiye.', risk: 'Real use case prove nahi hua.', ask: 'Ye app roz ke kis kaam mein aata hai — aur kya manual karna padta hai?',
    uc: [uc('Goal-based flow', "Owner ka trigger", 'App action', 'Owner ke jawab ke baad define')] },
};
const KW = [['payments', /pay|upi|gateway|razor|cashfree|phonepe|paytm|stripe|instamojo/i], ['shipping', /ship|courier|deliver|porter|dunzo|delhivery|logistic|parcel/i],
  ['ledger', /khata|udhaar|okcredit|vyapar/i], ['accounting', /books|tally|invoice|gst|account|billing/i], ['calendar', /calend|appoint|slot|schedule|calendly/i],
  ['social', /insta|facebook|meta|google business|review|youtube|telegram/i], ['sheets', /sheet|airtable|notion|excel|database/i],
  ['ecommerce', /shopify|woocommerce|website|store|wix/i], ['email', /mail|outlook/i], ['aggregator', /swiggy|zomato|blinkit|zepto|amazon|flipkart|meesho/i]];

export function heuristic({ app, category = 'auto', goal = '' }, shop = get().shop, connected = get().connected_apps.map((a) => a.name)) {
  const key = norm(app);
  const k = KNOWN[key];
  let cat = k ? k.category : category;
  if (!k && (!cat || cat === 'auto')) cat = (KW.find(([, r]) => r.test(`${app} ${goal}`)) || ['other'])[0];
  const base = k || CAT[cat] || CAT.other;
  const b = { ...base.b };
  const notes = [];
  if (base.fitFor) {
    if (base.fitFor.includes(shop.type)) b.fit = Math.min(20, b.fit + 2);
    else { b.fit = Math.max(0, b.fit - 6); b.demand = Math.max(0, b.demand - 5); notes.push(`${shop.type} ke liye fit kam hai.`); }
  }
  const conns = connected.map(norm);
  const dup = (k && k.dupOf) || base.dup;
  if (dup && (norm(dup).startsWith('built-in') || conns.includes(norm(dup)))) {
    b.demand = Math.max(0, b.demand - 8); b.better_than_manual = Math.max(0, b.better_than_manual - 4);
    notes.push(`Duplicate: ${dup} already ye kaam karta hai.`);
  }
  if (goal && goal.trim().length > 8 && /(jab|hote hi|aate hi|automatic|khud|har|when|after|order|payment|reminder|book|send|bhej)/i.test(goal)) {
    b.evidence = Math.min(10, b.evidence + 3); b.demand = Math.min(20, b.demand + 2);
    notes.push('Owner ne concrete trigger bataya.');
  }
  const score = Object.values(b).reduce((a, c) => a + c, 0);
  return {
    app: app.trim(), category: cat, source: k ? 'catalog' : 'heuristic',
    verdict: verdictOf(score), score, breakdown: b,
    connector: k ? k.connector : b.viasocket >= 9 ? 'NOT REQUIRED' : b.technical >= 8 ? 'PARTNER-BUILD' : 'NO',
    confidence: k ? k.confidence : 'LOW',
    biggest_opportunity: base.opp, biggest_risk: base.risk,
    use_cases: base.uc, ask_owner: base.ask || '',
    success: k?.success || 'Pehle 2 hafte mein 10+ runs bina owner ke.',
    kill: k?.kill || 'Koi concrete trigger nahi / 2 hafte mein < 5 runs.',
    unknowns: k ? [] : ['API / webhooks verify nahi hue', 'viaSocket listing verify nahi hui'],
    notes,
  };
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['app', 'category', 'breakdown', 'connector', 'confidence', 'biggest_opportunity', 'biggest_risk', 'use_cases', 'ask_owner', 'success', 'kill', 'unknowns'],
  properties: {
    app: { type: 'string' },
    category: { type: 'string' },
    breakdown: {
      type: 'object', additionalProperties: false, required: Object.keys(DIMENSIONS),
      properties: Object.fromEntries(Object.keys(DIMENSIONS).map((k) => [k, { type: 'integer' }])),
    },
    connector: { type: 'string', enum: ['NOT REQUIRED', 'BUILD', 'PARTNER-BUILD', 'NO'] },
    confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    biggest_opportunity: { type: 'string' },
    biggest_risk: { type: 'string' },
    use_cases: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'trigger', 'action', 'result', 'status'],
        properties: { name: { type: 'string' }, trigger: { type: 'string' }, action: { type: 'string' }, result: { type: 'string' }, status: { type: 'string', enum: ['PROVEN', 'PLAUSIBLE'] } },
      },
    },
    ask_owner: { type: 'string' },
    success: { type: 'string' },
    kill: { type: 'string' },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
};

const RUBRIC = `You are the App Analyzer for "Dukaan ka AI Manager" — a WhatsApp Business AI for small Indian shops. External actions run on viaSocket embed.
Your job is NOT to find reasons to connect. Protect the owner from clutter: decide whether the app solves a REAL, recurring problem for THIS shop that its current stack does not already solve.
Rules: every use case is Trigger → Action → Result, specific to this shop (max 3). Mark anything unverified as UNKNOWN and list it in unknowns. Never invent API capabilities. Do not score up for popularity, size or "has an API". If an already-connected app or a built-in feature covers the need, score demand and better_than_manual low (duplicate). If there is no public API or it is not on viaSocket, connector is PARTNER-BUILD or NO.
Score caps: fit 20, demand 20, technical (API/webhooks) 15, viasocket (available via viaSocket) 15, better_than_manual 10, risk (low data/trust risk = high score) 10, evidence 10.
Built-in features (never duplicates worth connecting): WhatsApp order taking, payment links via Razorpay, auto-paid detection, pickup reminders, udhaar reminder ladder, monthly report.
Write text fields in short Hinglish. ask_owner: one question if the case is borderline, else empty.`;

export async function analyze({ app, category = 'auto', goal = '' }) {
  if (!app || !String(app).trim()) throw new Error('app required');
  const { shop, connected_apps } = get();
  const connected = connected_apps.map((a) => a.name);
  if (connected.map(norm).includes(norm(app))) return { app, already_connected: true };
  const fallback = heuristic({ app, category, goal }, shop, connected);
  if (!config.claude.apiKey) return fallback;

  const context = `Shop: ${shop.name} (${shop.type}). Orders/month: ~${Math.max(get().orders.length, 50)}.
Connected apps: ${connected.join(', ')}.
App to analyse: ${app}${category && category !== 'auto' ? ` (category: ${category})` : ''}.
Owner's goal: ${goal || '(not given)'}`;
  try {
    const client = new Anthropic({ apiKey: config.claude.apiKey });
    let research = '';
    if (process.env.ANALYZER_WEB_SEARCH !== '0') {
      const r = await client.messages.create({
        model: config.claude.model,
        max_tokens: 8000,
        system: 'Research briefly and factually. Report only what sources show; say UNKNOWN otherwise.',
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
        messages: [{ role: 'user', content: `${context}\n\nFind: what the app does, whether it has a public API/webhooks usable by a small shop, whether it is available on viaSocket (viasocket.com/integrations), and pricing for small Indian businesses. Bullet points with source URLs.` }],
      });
      research = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    }
    const res = await client.messages.create({
      model: config.claude.model,
      max_tokens: 4000,
      system: RUBRIC,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `${context}\n\nResearch notes:\n${research || '(none — mark unverified facts UNKNOWN)'}` }],
    });
    if (res.stop_reason === 'refusal') return fallback;
    const out = JSON.parse(res.content.find((b) => b.type === 'text')?.text || '{}');
    const breakdown = Object.fromEntries(Object.entries(DIMENSIONS).map(([k, max]) => [k, Math.max(0, Math.min(max, Math.round(out.breakdown?.[k] ?? 0)))]));
    const score = Object.values(breakdown).reduce((a, c) => a + c, 0);
    return { ...out, app: out.app || app, breakdown, score, verdict: verdictOf(score), use_cases: (out.use_cases || []).slice(0, 3), source: 'claude', research, notes: [] };
  } catch (e) {
    console.error('[analyzer] Claude failed, using heuristic:', e.message);
    return { ...fallback, notes: [...fallback.notes, 'Live research fail hua — heuristic score.'] };
  }
}
