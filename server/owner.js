// Owner talks to the same WhatsApp number. Messages from shop.owner_phone are
// commands, handled deterministically (no AI guesswork on the owner's money).
import { get, save, normPhone, findOrder } from './store.js';
import { sendText } from './whatsapp.js';
import { markPaid, markFulfilled, dueList, describeOrder, stage } from './orders.js';
import { monthStats, monthLine } from './scheduler.js';
import { analyze } from './analyzer.js';
import { connectApp } from './apps.js';
import { now, parts, rupees, fmt } from './time.js';

const HELP = `Owner commands 🧑‍💼
• hisaab — is mahine ka summary
• aaj — aaj ke orders
• due — udhaar list
• 341 paid — cash mila, paid mark
• 341 done — order de diya
• pause 98xxxx / resume 98xxxx — udhaar reminders
• Shiprocket jod do — naya app check + connect`;

export async function handleOwner(text) {
  const reply = await ownerReply(text.trim());
  return sendText(get().shop.owner_phone, reply, { kind: 'owner_reply' });
}

export async function ownerReply(t) {
  const low = t.toLowerCase();
  const d = get();
  d.sessions.__owner ||= {};
  const s = d.sessions.__owner;

  if (s.pendingConnect && /^(haan|ha|yes|ok|connect|jod do|kar do)\b/.test(low)) {
    const r = s.pendingConnect;
    delete s.pendingConnect; save();
    const c = await connectApp(r);
    if (!c.ok) return `❌ Connect fail: ${c.error}`;
    return c.pending_connect
      ? `✅ ${r.app} approve ho gaya. Apna ${r.app} account jodne ke liye dashboard kholiye aur Connect dabaiye:\n${c.auth_url}`
      : `✅ ${r.app} connect ho gaya. viaSocket flow on hai.${c.auth_url ? `\nLogin/authorize: ${c.auth_url}` : ''}`;
  }

  let m;
  if ((m = low.match(/^#?(\d{2,})\s+(paid|cash|mil gaya)/))) {
    const o = findOrder(m[1]);
    if (!o) return `Order #${m[1]} nahi mila.`;
    const r = await markPaid(o.id, { source: 'owner_cash' });
    return r.already ? `#${o.id} pehle se paid hai ✅` : `#${o.id} paid mark kar diya ✅ (${rupees(o.total)})`;
  }
  if ((m = low.match(/^#?(\d{2,})\s+(done|delivered|de diya|diya|pickup|fulfilled)/))) {
    try {
      const o = await markFulfilled(m[1]);
      return `#${o.id} de diya ✅${o.payment === 'PAID' ? '' : ` — ${rupees(o.total)} abhi due hai, reminders main bhej dunga.`}`;
    } catch (e) { return `#${m[1]}: ${e.message}`; }
  }
  if ((m = low.match(/^(pause|resume)\s+(\+?\d[\d\s]{5,})/))) {
    const tail = normPhone(m[2]);
    const c = d.customers.find((x) => x.phone.endsWith(tail));
    if (!c) return 'Customer nahi mila.';
    c.paused_reminders = m[1] === 'pause'; save();
    return `${c.name || c.phone}: reminders ${c.paused_reminders ? 'band ⏸' : 'chalu ▶️'}`;
  }
  if (/\b(hisaab|hisab|report|summary|kitna kamaya)\b/.test(low)) {
    const st = monthStats();
    return `📊 ${monthLine(st)}${st.best ? `\nSabse zyada bika: ${st.best[0]} (${st.best[1]}).` : ''}`;
  }
  if (/\b(due|udhaar|udhar|baaki)\b/.test(low)) {
    const due = dueList();
    if (!due.length) return 'Koi udhaar nahi 🎉';
    return `📒 Due (${due.length}):\n${due.slice(0, 10).map((o, i) => `${i + 1}. ${o.customer_name || o.phone} — ${rupees(o.total)} (${o.days} din) #${o.id}${o.reminders.escalated_at ? ' ⚠️' : ''}`).join('\n')}`;
  }
  if (/\b(aaj|today|orders?)\b/.test(low)) {
    const p = parts();
    const today = d.orders.filter((o) => {
      const q = parts(new Date(o.fulfil_at));
      return o.status !== 'CANCELLED' && q.y === p.y && q.m === p.m && q.d === p.d;
    }).sort((a, b) => a.fulfil_at.localeCompare(b.fulfil_at));
    if (!today.length) return 'Aaj ke liye koi order nahi.';
    return `🗓 Aaj (${today.length}):\n${today.map((o) => `${fmt(o.fulfil_at).split(', ').pop()} — #${o.id} ${o.items.map((l) => `${l.qty}× ${l.name}`).join(', ')} · ${stage(o) === 'PAID' || o.payment === 'PAID' ? 'paid' : 'unpaid'}`).join('\n')}`;
  }
  if ((m = t.match(/^(?:connect|add|jodo|jod)\s+(.+)$/i) || t.match(/^(.+?)\s+(?:bhi\s+)?(?:jod do|jodo|connect karo|add karo|chahiye)$/i))) {
    const app = m[1].replace(/\b(app|ko|bhi)\b/gi, '').trim();
    const r = await analyze({ app, goal: t });
    if (r.already_connected) return `${app} already connected hai ✅`;
    const ucs = (r.use_cases || []).slice(0, 3).map((u, i) => `${i + 1}. ${u.trigger} → ${u.action} → ${u.result}`).join('\n');
    const head = `🔍 ${r.app}: ${r.verdict} (${r.score}/100)\n${r.biggest_opportunity}\n${ucs}\nRisk: ${r.biggest_risk}`;
    if (r.verdict === 'GO') { s.pendingConnect = r; save(); return `${head}\n\nConnect karun? (haan)`; }
    if (r.verdict === 'CONDITIONAL') return `${head}\n\n🤔 Pehle bataiye: ${r.ask_owner || 'ye app roz kis kaam mein aayega?'}\n(Jawab ke saath dobara likhiye: "${r.app} jod do — <jawab>")`;
    return `${head}\n\n⛔ Abhi connect nahi karenge.`;
  }
  if ((m = low.match(/^#?(\d{2,})$/))) {
    const o = findOrder(m[1]);
    return o ? describeOrder(o) : `Order #${m[1]} nahi mila.`;
  }
  return HELP;
}

export { now };
