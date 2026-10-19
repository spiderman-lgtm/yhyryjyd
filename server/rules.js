// Rule-based Hinglish brain. Used when ANTHROPIC_API_KEY is not set (demo) and as a
// fallback if the Claude call fails, so customers never get silence.
import { get, save, normPhone } from './store.js';
import { matchCatalog, createOrder, ensurePaymentLink, ordersFor, describeOrder, cancelOrder, stage } from './orders.js';
import { now, addDaysLocal, parts, localDate, fmt, rupees } from './time.js';

const NUM = { ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5, chhe: 6, che: 6, six: 6, saat: 7, aath: 8, nau: 9, das: 10, dus: 10 };
const YES = /^(ha+n?|haa+n|yes|yep|ok(ay)?|confirm(ed)?|done|theek|thik|sahi|pakka|chalega|ji|ha ji|haan ji|kar do|kardo)\b/i;
const NO = /^(nahi|nahin|no|mat|cancel|rehne do|ruk)/i;

export function parseItems(text) {
  const t = ` ${text.toLowerCase()} `;
  const { catalog } = get();
  const found = [];
  const used = new Set();
  // Longest aliases first so "chocolate cake" beats "cake".
  const aliases = catalog.flatMap((c) => [c.name.toLowerCase(), ...(c.aliases || [])].map((a) => ({ a: a.toLowerCase(), c })))
    .sort((x, y) => y.a.length - x.a.length);
  let rest = t;
  for (const { a, c } of aliases) {
    const re = new RegExp(`(?:(\\d+|${Object.keys(NUM).join('|')})\\s*(?:x|×|pcs?|piece|box|kg wale|kilo)?\\s*)?${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const m = rest.match(re);
    if (m && !used.has(c.id)) {
      used.add(c.id);
      const q = m[1] ? (NUM[m[1]] || Number(m[1])) : 1;
      found.push({ item_id: c.id, qty: q });
      rest = rest.replace(m[0], ' ');
    }
  }
  return found;
}

export function parseWhen(text, from = now()) {
  const t = text.toLowerCase();
  let day = null;
  if (/\bparso\b|day after/.test(t)) day = 2;
  else if (/\bkal\b|tomorrow|\bkl\b/.test(t)) day = 1;
  else if (/\baaj\b|today|abhi/.test(t)) day = 0;

  let hour = null; let min = 0;
  const m = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(baje|bje|pm|am|o'?clock)/) || t.match(/(?:at|@)\s*(\d{1,2})(?:[:.](\d{2}))?/);
  if (m) {
    hour = Number(m[1]); min = Number(m[2] || 0);
    const pm = /pm|shaam|sham|raat|evening|night/.test(t) || (m[3] !== 'am' && !/subah|morning/.test(t) && hour >= 1 && hour <= 8);
    if (pm && hour < 12) hour += 12;
    if (/subah|morning|am/.test(t) && hour === 12) hour = 0;
  } else if (/shaam|sham|evening/.test(t)) hour = 18;
  else if (/dopahar|dopeher|afternoon/.test(t)) hour = 14;
  else if (/subah|morning/.test(t)) hour = 11;

  if (day == null && hour == null) return null;
  const explicitDay = day != null;
  if (day == null) {
    const p = parts(from);
    day = hour != null && (hour < p.h || (hour === p.h && min <= p.min)) ? 1 : 0;
  }
  return { day, hour, min, explicitDay, date: hour != null ? addDaysLocal(day, hour, min, from) : null };
}

const menu = () => get().catalog.map((c) => `• ${c.name} — ${rupees(c.price)}`).join('\n');

function session(phone) {
  const d = get();
  d.sessions[phone] ||= {};
  const s = d.sessions[phone];
  if (s.updated && now() - new Date(s.updated) > 6 * 3_600_000) { for (const k of Object.keys(s)) delete s[k]; }
  s.updated = now().toISOString();
  return s;
}

function summary(p) {
  const lines = p.items.map((it) => {
    const c = get().catalog.find((x) => x.id === it.item_id);
    return `${it.qty} × ${c.name} = ${rupees(c.price * it.qty)}`;
  });
  const total = p.items.reduce((s, it) => s + get().catalog.find((x) => x.id === it.item_id).price * it.qty, 0);
  return `${lines.join('\n')}\n💰 Total ${rupees(total)}\n🗓 ${p.mode === 'delivery' ? 'Delivery' : 'Pickup'}: ${fmt(p.fulfil_at)}`;
}

export async function rulesReply(phone, text, name = '') {
  phone = normPhone(phone);
  const s = session(phone);
  const t = text.trim();
  const low = t.toLowerCase();
  const shop = get().shop;

  // Confirmation of a pending order
  if (s.pending && YES.test(low)) {
    const p = s.pending;
    delete s.pending; save();
    try {
      const o = await createOrder({ phone, name, items: p.items, fulfil_at: p.fulfil_at, mode: p.mode, address: p.address });
      const withLink = await ensurePaymentLink(o.id);
      return `Order #${o.id} confirm ho gaya! ✅\n${describeOrder(o)}\n\nPayment link 👇\n${withLink.payment_link.url}\nUPI / card — sab chalega.`;
    } catch (e) {
      return `Maaf kijiye, order save nahi ho paaya (${e.message}). Owner ko bata diya hai 🙏`;
    }
  }
  if (s.pending && NO.test(low)) { delete s.pending; save(); return 'Theek hai, order cancel kar diya. Kuch aur chahiye to bataiye 🙂'; }

  if (/\b(menu|rate|price|kitne ka|kya kya|list)\b/.test(low) && !parseItems(t).length) {
    return `${shop.name} menu 🍰\n${menu()}\n\nOrder ke liye likhiye, jaise: "2 chocolate cake kal 6 baje"`;
  }
  if (/\b(status|mera order|kab tak|kahan|ready)\b/.test(low)) {
    const o = ordersFor(phone).find((x) => x.status !== 'CANCELLED');
    return o ? describeOrder(o) : 'Aapka koi order abhi nahi mila. Order karna ho to item aur time bataiye 🙂';
  }
  if (/\b(cancel|nahi chahiye)\b/.test(low)) {
    const o = ordersFor(phone).find((x) => !['CANCELLED', 'FULFILLED'].includes(x.status) && x.payment !== 'PAID');
    if (!o) return 'Cancel karne layak koi unpaid order nahi mila. Paid order ke liye owner aapse baat karenge 🙏';
    await cancelOrder(o.id, 'customer request');
    return `Order #${o.id} cancel kar diya ✅`;
  }
  if (/(pay|payment|paise).*(kar diya|kiya|done|ho gaya)|paid/.test(low)) {
    const o = ordersFor(phone).find((x) => x.status !== 'CANCELLED' && x.payment !== 'PAID');
    if (!o) return 'Aapke saare orders paid hain ✅ Thank you!';
    const w = await ensurePaymentLink(o.id);
    return `Order #${o.id} ka payment abhi tak nahi dikha. Thodi der mein auto-update ho jaata hai — agar nahi hua ho to is link se kar dijiye:\n${w.payment_link.url}`;
  }

  if (s.awaitingAddress && s.draft) {
    delete s.awaitingAddress;
    s.draft.address = t;
    s.pending = s.draft; delete s.draft; save();
    return `${summary(s.pending)}\n📍 ${t}\n\nConfirm karein? (haan / nahi)`;
  }

  // Build up a pending order across messages.
  const items = parseItems(t);
  const when = parseWhen(t);
  const p = s.draft || { items: [], mode: 'pickup' };
  if (items.length) p.items = items;
  if (when?.date && !when.explicitDay && p.day != null) p.fulfil_at = addDaysLocal(p.day, when.hour, when.min).toISOString();
  else if (when?.date) p.fulfil_at = when.date.toISOString();
  else if (when && p.fulfil_at) {
    const prev = new Date(p.fulfil_at);
    if (when.hour == null) p.fulfil_at = addDaysLocal(when.day, parts(prev).h, parts(prev).min).toISOString();
  } else if (when && when.hour == null) p.day = when.day;
  if (/deliver|ghar|bhej|home/.test(low)) p.mode = 'delivery';
  if (/pickup|le jaunga|le jaungi|aa ke|aakar/.test(low)) p.mode = 'pickup';

  if (!items.length && !when && !s.draft) {
    if (/^(hi|hello|hey|namaste|namaskar|hii+|helo)\b/.test(low)) {
      return `Namaste${name ? ` ${name}` : ''}! 🙏 ${shop.name} mein swagat hai.\n${menu()}\n\nKya chahiye aur kab? Jaise: "2 chocolate cake kal 6 baje"`;
    }
    return 'Maaf kijiye, samajh nahi paaya 🙏 Order ke liye item aur time likhiye (jaise "1 red velvet parso 5 baje"), ya "menu" likhiye.';
  }
  s.draft = p; save();

  if (!p.items.length) return `Kya order karna hai? 🙂\n${menu()}`;
  if (!p.fulfil_at) {
    const lead = Math.max(...p.items.map((it) => get().catalog.find((c) => c.id === it.item_id)?.lead_time_hours || 0));
    return `${p.items.map((it) => `${it.qty} × ${get().catalog.find((c) => c.id === it.item_id).name}`).join(', ')} 👍\nKis din aur kitne baje chahiye? (${shop.open_hours}${lead ? `, ${lead} ghante pehle order` : ''})`;
  }
  const lead = Math.max(...p.items.map((it) => get().catalog.find((c) => c.id === it.item_id)?.lead_time_hours || 0));
  if (new Date(p.fulfil_at) - now() < lead * 3_600_000) {
    delete p.fulfil_at; save();
    return `Ye item banne mein ${lead} ghante lagte hain 🙏 Thoda baad ka time bataiye?`;
  }
  if (p.mode === 'delivery' && !p.address) {
    s.awaitingAddress = true; save();
    return 'Delivery ka poora address bhej dijiye 📍';
  }
  s.pending = p; delete s.draft; save();
  return `${summary(p)}\n\nConfirm karein? (haan / nahi)`;
}

export { stage };
