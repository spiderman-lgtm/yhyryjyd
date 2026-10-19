// Time-driven work: pickup/delivery reminders, the overdue-payment ladder and the monthly
// one-liner. Each send is recorded on the order so a tick is safe to run any number
// of times.
import { config } from './config.js';
import { get, save } from './store.js';
import { triggerFlow } from './viasocket.js';
import { sendTemplate, sendText } from './whatsapp.js';
import { ensurePaymentLink, paymentText, dueList, describeOrder } from './orders.js';
import { now, fmt, rupees, inQuietHours, isLastDayOfMonth, monthKey, parts } from './time.js';

const firstName = (o) => (o.customer_name || '').split(' ')[0] || 'there';

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
    if (o.test || o.status !== 'CONFIRMED' || o.reminders.fulfilment_sent_at) continue;
    const t = new Date(o.fulfil_at);
    if (t - at > lead || t < at) continue;
    const pay = o.payment === 'PAID' ? '' : `\n${paymentText(o)}`;
    const text = `Hi ${firstName(o)} 👋 Your order #${o.id} (${o.items.map((l) => `${l.qty} × ${l.name}`).join(', ')}) is being prepared for ${fmt(o.fulfil_at)}.\n📍 ${o.mode === 'delivery' ? o.address : `${shop.name}, ${shop.address}`}${pay}\nReply here if you need to change the time.`;
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
      const text = `📒 Overdue payment: ${order.customer_name || order.phone} (${order.phone}) — ${rupees(order.total)}, due for ${o.days} days (order #${order.id}). ${sent.size} reminders already sent.\nReply "${order.id} paid" if you got cash, or "pause ${order.phone}" to stop reminders.`;
      const flow = await triggerFlow('escalate_to_owner', { order_id: order.id, phone: order.phone, amount: order.total, days: o.days, text });
      if (flow.mode === 'demo' || !flow.ok) await sendText(get().shop.owner_phone, text, { kind: 'escalation', order_id: order.id });
      r.escalated_at = at.toISOString();
    } else {
      const w = await ensurePaymentLink(order.id);
      const text = step === d1
        ? `Hi ${firstName(order)} 🙏 ${rupees(order.total)} is still due for order #${order.id}. ${paymentText(w)}`
        : `Hi ${firstName(order)}, a gentle reminder — ${rupees(order.total)} for order #${order.id} has been pending for ${o.days} days. It would really help if you could pay today 🙂 ${paymentText(w)}`;
      await remind(order, step === d1 ? 'reminder_polite' : 'reminder_firm', text, [firstName(order), order.id, order.total, w.payment_link?.url || paymentText(w)]);
      r.udhaar.push({ day: step, sent_at: at.toISOString() });
    }
    lastByPhone[order.phone] = at.toISOString();
    save();
    await triggerFlow('update_order', { order_id: order.id, status: r.escalated_at ? 'ESCALATED' : 'UDHAAR' });
  }
}

export function monthStats(at = now()) {
  const key = monthKey(at);
  const inMonth = (iso) => iso && monthKey(new Date(iso)) === key;
  const orders = get().orders.filter((o) => !o.test && o.status !== 'CANCELLED' && inMonth(o.created_at));
  const collected = get().orders.filter((o) => !o.test && o.payment === 'PAID' && inMonth(o.paid_at)).reduce((s, o) => s + o.total, 0);
  const due = dueList(at);
  const top = {};
  for (const o of orders) for (const l of o.items) top[l.name] = (top[l.name] || 0) + l.qty;
  const best = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
  return { month: key, orders: orders.length, collected, due_count: new Set(due.map((o) => o.phone)).size, due_amount: due.reduce((s, o) => s + o.total, 0), due, best };
}

export function monthLine(s) {
  return `This month: ${s.orders} order${s.orders === 1 ? '' : 's'}, ${rupees(s.collected)} collected, ${s.due_count} ${s.due_count === 1 ? 'person' : 'people'} still owe${s.due_count === 1 ? 's' : ''}${s.due_count ? ` (${rupees(s.due_amount)})` : ''}.`;
}

export async function monthlyReport(at = now(), force = false) {
  const p = parts(at);
  if (!force && !(isLastDayOfMonth(at) && p.h >= 21)) return null;
  const key = monthKey(at);
  if (!force && get().reports.some((r) => r.month === key)) return null;
  const s = monthStats(at);
  const text = `📊 ${monthLine(s)}${s.best ? `\nBest seller: ${s.best[0]} (${s.best[1]}).` : ''}${s.due.length ? `\nDue: ${s.due.slice(0, 5).map((o) => `${o.customer_name || o.phone} ${rupees(o.total)}`).join(', ')}` : ''}`;
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
