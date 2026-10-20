// Order lifecycle. Two stored fields — `status` (fulfilment) and `payment` — and one
// derived `stage()` that matches the state diagram:
// CONFIRMED → AWAITING_PAYMENT → PAID → FULFILLED, with UDHAAR / ESCALATED off the side.
import { get, save, nextOrderId, findOrder, upsertCustomer, normPhone, TEST_PHONE } from './store.js';
import { triggerFlow, isLive } from './viasocket.js';
import { sendText } from './whatsapp.js';
import { now, fmt, rupees } from './time.js';

export function matchCatalog(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const { catalog } = get();
  const scored = catalog.map((item) => {
    const names = [item.name, item.id, ...(item.aliases || [])].map((s) => s.toLowerCase());
    let score = 0;
    for (const n of names) {
      if (n === q) score = Math.max(score, 100);
      else if (q.includes(n)) score = Math.max(score, 50 + n.length);
      else if (n.includes(q)) score = Math.max(score, 40 + q.length);
    }
    return { item, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.item);
}

export function stage(o, at = now()) {
  if (o.status === 'CANCELLED') return 'CANCELLED';
  if (o.payment === 'PAID') return o.status === 'FULFILLED' ? 'FULFILLED' : 'PAID';
  if (o.reminders?.escalated_at) return 'ESCALATED';
  if (o.due_at && new Date(o.due_at) < at) return 'UDHAAR';
  if (o.payment_link?.url) return 'AWAITING_PAYMENT';
  return 'CONFIRMED';
}

export const publicOrder = (o) => ({ ...o, stage: stage(o) });

/** One line in the order's history, shown in the dashboard. */
export function addEvent(o, type, text) {
  o.events ||= [];
  o.events.push({ at: now().toISOString(), type, text });
  save();
}

export async function createOrder({ phone, name, items, fulfil_at, mode = 'pickup', address = '', notes = '' }) {
  if (!Array.isArray(items) || !items.length) throw new Error('items required');
  const lines = items.map((it) => {
    const match = (it.item_id && get().catalog.find((c) => c.id === it.item_id)) || matchCatalog(it.item || it.name)[0];
    if (!match) throw new Error(`"${it.item || it.item_id}" is not in the catalog`);
    const qty = Math.max(1, Math.round(Number(it.qty) || 1));
    return { item_id: match.id, name: match.name, qty, price: match.price, amount: match.price * qty };
  });
  const when = fulfil_at ? new Date(fulfil_at) : null;
  if (!when || Number.isNaN(when.getTime())) throw new Error('fulfil_at (pickup/delivery time) required');
  if (when < now()) throw new Error('fulfil_at is in the past');

  const customer = upsertCustomer(phone, name);
  const order = {
    id: nextOrderId(),
    phone: customer.phone,
    customer_name: customer.name || name || '',
    items: lines,
    total: lines.reduce((s, l) => s + l.amount, 0),
    fulfil_at: when.toISOString(),
    due_at: when.toISOString(),
    mode,
    address,
    notes,
    status: 'CONFIRMED',
    payment: 'PENDING',
    test: customer.phone === TEST_PHONE,
    reminders: { udhaar: [] },
    created_at: now().toISOString(),
  };
  get().orders.push(order);
  addEvent(order, 'created', `Order placed on WhatsApp — ${rupees(order.total)}`);

  const r = await triggerFlow('save_order', {
    order_id: order.id, phone: order.phone, customer_name: order.customer_name,
    items: order.items.map((l) => `${l.qty} × ${l.name}`).join(', '),
    total: order.total, fulfil_at: order.fulfil_at, mode, address, status: stage(order),
  });
  order.sheet_row = r.result?.row_id || null;
  save();
  return order;
}

/** How the customer should pay: a real link, the shop's UPI ID, or at pickup/delivery. */
export function paymentText(o) {
  if (o.payment === 'PAID') return '';
  if (o.payment_link?.url) return `Pay here: ${o.payment_link.url}`;
  const upi = get().shop.upi_id;
  if (upi) return `Please pay ${rupees(o.total)} to UPI ID ${upi} (note: Order #${o.id}). We'll confirm once it arrives.`;
  return `You can pay ${rupees(o.total)} at ${o.mode === 'delivery' ? 'delivery' : 'pickup'}.`;
}

/** Creates a payment link when a payment app is connected; otherwise leaves the order as is. */
export async function ensurePaymentLink(orderId) {
  const o = findOrder(orderId);
  if (!o) throw new Error('order not found');
  if (o.payment === 'PAID') return o;
  if (o.payment_link?.url) return o;
  if (!isLive('create_payment_link')) return o;
  const r = await triggerFlow('create_payment_link', {
    order_id: o.id, amount: o.total, amount_paise: o.total * 100, currency: 'INR',
    phone: o.phone, customer_name: o.customer_name,
    description: `Order #${o.id} — ${get().shop.name}`,
    callback_url: '/api/viasocket/payment-received',
  });
  if (!r.ok || !r.result?.url) throw new Error('could not create the payment link');
  o.payment_link = { id: r.result.id || '', url: r.result.url, sent_at: now().toISOString() };
  addEvent(o, 'link', 'Payment link sent');
  await triggerFlow('update_order', { order_id: o.id, status: stage(o), payment_link: o.payment_link.url });
  return o;
}

export async function markPaid(orderId, { amount, payment_id = '', source = 'viasocket' } = {}) {
  const o = findOrder(orderId);
  if (!o) throw new Error('order not found');
  if (o.payment === 'PAID') return { order: o, already: true };
  if (amount != null && Number(amount) + 0.5 < o.total) {
    o.partial_payments = [...(o.partial_payments || []), { amount: Number(amount), payment_id, at: now().toISOString() }];
    addEvent(o, 'partial', `Part payment of ${rupees(amount)} received`);
    return { order: o, partial: true };
  }
  o.payment = 'PAID';
  o.paid_at = now().toISOString();
  o.payment_ref = payment_id;
  o.payment_source = source;
  delete o.payment_claim;
  addEvent(o, 'paid', `Payment received — ${rupees(o.total)} (${{ owner_cash: 'marked by you', razorpay: 'Razorpay', viasocket: 'payment app', demo: 'demo' }[source] || source})`);
  await triggerFlow('update_order', { order_id: o.id, status: stage(o), paid_at: o.paid_at, payment_id });
  const when = o.status === 'FULFILLED' ? '' : `\n${o.mode === 'delivery' ? 'Delivery' : 'Pickup'}: ${fmt(o.fulfil_at)} 🎂`;
  await sendText(o.phone, `Payment received ✅ ${rupees(o.total)} — Order #${o.id}. Thank you!${when}`, { order_id: o.id, kind: 'paid' });
  return { order: o };
}

export async function markFulfilled(orderId, by = 'owner') {
  const o = findOrder(orderId);
  if (!o) throw new Error('order not found');
  if (o.status === 'CANCELLED') throw new Error('cancelled order');
  o.status = 'FULFILLED';
  o.fulfilled_at = now().toISOString();
  // Goods left without payment → the overdue clock starts now.
  if (o.payment !== 'PAID' && new Date(o.due_at) > now()) o.due_at = o.fulfilled_at;
  addEvent(o, 'handed_over', by === 'customer' ? 'Customer confirmed they received the order' : 'Marked as handed over by you');
  await triggerFlow('update_order', { order_id: o.id, status: stage(o) });
  return o;
}

export async function cancelOrder(orderId, reason = '') {
  const o = findOrder(orderId);
  if (!o) throw new Error('order not found');
  if (o.payment === 'PAID') throw new Error('a paid order cannot be cancelled — please talk to the owner');
  if (o.status === 'FULFILLED') throw new Error('the order has already been handed over');
  o.status = 'CANCELLED';
  o.cancel_reason = reason;
  addEvent(o, 'cancelled', `Cancelled${reason ? ` — ${reason}` : ''}`);
  await triggerFlow('update_order', { order_id: o.id, status: 'CANCELLED', reason });
  return o;
}

/** The customer says they paid. Never marks paid on its own: the owner confirms. */
export async function claimPaid(orderId, { method = '', note = '' } = {}) {
  const o = findOrder(orderId);
  if (!o) throw new Error('order not found');
  if (o.payment === 'PAID') return o;
  o.payment_claim = { at: now().toISOString(), method, note };
  addEvent(o, 'claim', `Customer says they paid${method ? ` by ${method}` : ''}${note ? ` — "${note}"` : ''}`);
  if (!o.test) {
    await sendText(get().shop.owner_phone, `💰 ${o.customer_name || o.phone} says they paid ${rupees(o.total)} for order #${o.id}${method ? ` (${method})` : ''}. Check and reply "${o.id} paid" to confirm.`, { kind: 'owner_alert', order_id: o.id });
  }
  return o;
}

export function ordersFor(phone) {
  phone = normPhone(phone);
  return get().orders.filter((o) => o.phone === phone).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function describeOrder(o) {
  const items = o.items.map((l) => `${l.qty} × ${l.name}`).join(', ');
  const st = {
    CONFIRMED: 'confirmed', AWAITING_PAYMENT: 'payment pending', PAID: 'paid ✅', FULFILLED: 'handed over ✅',
    UDHAAR: 'payment due', ESCALATED: 'payment due', CANCELLED: 'cancelled',
  }[stage(o)];
  return `#${o.id}: ${items} — ${rupees(o.total)} · ${o.mode === 'delivery' ? 'delivery' : 'pickup'} ${fmt(o.fulfil_at)} · ${st}`;
}

export function dueList(at = now(), { includeTest = false } = {}) {
  return get().orders
    .filter((o) => (includeTest || !o.test) && o.status !== 'CANCELLED' && o.payment !== 'PAID' && new Date(o.due_at) < at)
    .map((o) => ({ ...o, days: Math.floor((at - new Date(o.due_at)) / 86_400_000) }))
    .sort((a, b) => b.days - a.days);
}
