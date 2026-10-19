// Time-driven work: pickup/delivery reminders, the udhaar ladder and the monthly
// one-liner. Each send is recorded on the order so a tick is safe to run any number
// of times.
import { config } from './config.js';
import { get, save } from './store.js';
import { triggerFlow } from './viasocket.js';
import { sendTemplate, sendText } from './whatsapp.js';
import { ensurePaymentLink, dueList, describeOrder } from './orders.js';
import { now, fmt, rupees, inQuietHours, isLastDayOfMonth, monthKey, parts } from './time.js';

const firstName = (o) => (o.customer_name || '').split(' ')[0] || 'ji';

async function remind(o, kind, text, templateParams) {
  const flow = await triggerFlow('send_reminder', { kind, order_id: o.id, phone: o.phone, customer_name: o.customer_name, text, amount: o.total, link: o.payment_link?.url || '' });
  // A live viaSocket flow delivers the template itself; demo mode sends from here.
  if (flow.mode === 'demo' || !flow.ok) await sendTemplate(o.phone, `dukaan_${kind}`, templateParams, text, { order_id: o.id, kind });
  else get().messages.push({ id: `m${Date.now()}`, phone: o.phone, direction: 'out', text, at: now().toISOString(), via: 'viasocket', kind, order_id: o.id });
}

export async function fulfilmentReminders(at = now()) {
  const lead = config.scheduler.reminderLeadHours * 3_600_000;
  const shop = get().shop;
  for (const o of get().orders) {
    if (o.status !== 'CONFIRMED' || o.reminders.fulfilment_sent_at) continue;
    const t = new Date(o.fulfil_at);
    if (t - at > lead || t < at) continue;
    const pay = o.payment === 'PAID' ? '' : o.payment_link?.url ? `\nPayment pending: ${o.payment_link.url}` : '';
    const text = `Hi ${firstName(o)} 👋 Aapka order #${o.id} (${o.items.map((l) => `${l.qty} × ${l.name}`).join(', ')}) ${fmt(o.fulfil_at)} ke liye ready ho raha hai.\n📍 ${o.mode === 'delivery' ? o.address : `${shop.name}, ${shop.address}`}${pay}\nTime change karna ho to bata dijiye.`;
    await remind(o, 'pickup_reminder', text, [firstName(o), o.id, fmt(o.fulfil_at)]);
    o.reminders.fulfilment_sent_at = at.toISOString();
    save();
  }
}

export async function udhaarLadder(at = now()) {
  if (inQuietHours(at)) return;
  const [d1, d2, d3] = config.scheduler.udhaarDays;
  const customers = get().customers;
  // Max one nudge per customer per ~day, across all their orders.
  const lastByPhone = {};
  for (const o of get().orders) {
    for (const u of o.reminders?.udhaar || []) {
      if (!lastByPhone[o.phone] || u.sent_at > lastByPhone[o.phone]) lastByPhone[o.phone] = u.sent_at;
    }
  }
  const recently = (phone) => lastByPhone[phone] && at - new Date(lastByPhone[phone]) < 20 * 3_600_000;

  for (const o of dueList(at)) {
    const order = get().orders.find((x) => x.id === o.id);
    const r = order.reminders;
    if (r.escalated_at || recently(order.phone)) continue;
    if (customers.find((c) => c.phone === order.phone)?.paused_reminders) continue;
    const sent = new Set(r.udhaar.map((u) => u.day));
    // Next rung of the ladder that is due and not yet sent; never skip straight to escalation.
    const step = [d1, d2, d3].find((d) => !sent.has(d) && o.days >= d);
    if (step == null) continue;

    if (step === d3) {
      const text = `📒 Udhaar alert: ${order.customer_name || order.phone} (${order.phone}) — ${rupees(order.total)}, ${o.days} din se due (order #${order.id}). ${sent.size} reminder ja chuke.\nReply "${order.id} paid" agar cash mila, ya "pause ${order.phone}" reminders rokne ke liye.`;
      const flow = await triggerFlow('escalate_to_owner', { order_id: order.id, phone: order.phone, amount: order.total, days: o.days, text });
      if (flow.mode === 'demo' || !flow.ok) await sendText(get().shop.owner_phone, text, { kind: 'escalation', order_id: order.id });
      r.escalated_at = at.toISOString();
    } else {
      const w = await ensurePaymentLink(order.id);
      const text = step === d1
        ? `Namaste ${firstName(order)} ji 🙏 Order #${order.id} ka ${rupees(order.total)} baaki hai. Jab convenient ho, is link se kar dijiye: ${w.payment_link.url}`
        : `${firstName(order)} ji, ek chhota sa reminder — order #${order.id} ka ${rupees(order.total)} ${o.days} din se pending hai. Aaj ho sake to bahut madad hogi 🙂 ${w.payment_link.url}`;
      await remind(order, step === d1 ? 'udhaar_polite' : 'udhaar_firm', text, [firstName(order), order.id, order.total, w.payment_link.url]);
      r.udhaar.push({ day: step, sent_at: at.toISOString() });
    }
    lastByPhone[order.phone] = at.toISOString();
    save();
  }
}

export function monthStats(at = now()) {
  const key = monthKey(at);
  const inMonth = (iso) => iso && monthKey(new Date(iso)) === key;
  const orders = get().orders.filter((o) => o.status !== 'CANCELLED' && inMonth(o.created_at));
  const collected = get().orders.filter((o) => o.payment === 'PAID' && inMonth(o.paid_at)).reduce((s, o) => s + o.total, 0);
  const due = dueList(at);
  const top = {};
  for (const o of orders) for (const l of o.items) top[l.name] = (top[l.name] || 0) + l.qty;
  const best = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
  return { month: key, orders: orders.length, collected, due_count: new Set(due.map((o) => o.phone)).size, due_amount: due.reduce((s, o) => s + o.total, 0), due, best };
}

export function monthLine(s) {
  return `Is mahine ${s.orders} order, ${rupees(s.collected)} collect hua, ${s.due_count} log abhi bhi due hain${s.due_count ? ` (${rupees(s.due_amount)})` : ''}.`;
}

export async function monthlyReport(at = now(), force = false) {
  const p = parts(at);
  if (!force && !(isLastDayOfMonth(at) && p.h >= 21)) return null;
  const key = monthKey(at);
  if (!force && get().reports.some((r) => r.month === key)) return null;
  const s = monthStats(at);
  const text = `📊 ${monthLine(s)}${s.best ? `\nSabse zyada bika: ${s.best[0]} (${s.best[1]}).` : ''}${s.due.length ? `\nDue: ${s.due.slice(0, 5).map((o) => `${o.customer_name || o.phone} ${rupees(o.total)}`).join(', ')}` : ''}`;
  const flow = await triggerFlow('monthly_report', { month: key, text, ...s, due: s.due.map((o) => ({ order_id: o.id, phone: o.phone, amount: o.total, days: o.days })) });
  if (flow.mode === 'demo' || !flow.ok) await sendText(get().shop.owner_phone, text, { kind: 'monthly_report' });
  get().reports.push({ month: key, text, at: at.toISOString() });
  save();
  return text;
}

export async function tick(at = now()) {
  await fulfilmentReminders(at);
  await udhaarLadder(at);
  await monthlyReport(at);
}

let handle = null;
export function start() {
  stop();
  handle = setInterval(() => tick().catch((e) => console.error('[scheduler]', e)), config.scheduler.intervalMs);
  handle.unref?.();
}
export function stop() { if (handle) clearInterval(handle); handle = null; }

export { describeOrder };
