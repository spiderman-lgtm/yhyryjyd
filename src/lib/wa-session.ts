import 'server-only';
import crypto from 'crypto';
import { read, write, type Alert, type Product } from './db';
import { MSG91, derivedKey, runOperatorAction } from './viasocket';
import { appUrl } from './config';
import { block, limited, manageLink, markVerified } from './contacts';
import { PLATFORM_NAMES } from './scraper';
import { inr } from './format';

// WhatsApp lets a business send any text (line breaks, any format) for 24 hours after the person last messaged
// its number. A shopper verifies by sending a code to the owner's MSG91 WhatsApp number: that proves the number
// and opens the window, so DealRadar's messages go out in its full format from that number.

const WINDOW_MS = 24 * 3600_000;
export const inboundKey = () => derivedKey('wa-inbound');
export const inboundUrl = () => `${appUrl()}/api/whatsapp/inbound?k=${inboundKey()}`;

const businessNumber = () => read((d) => d.settings.msg91?.number ?? null);
export const waVerifyOn = () => !!(businessNumber() && read((d) => d.settings.msg91?.auth_id));

// A code the shopper sends from WhatsApp; it is tied to their account and lasts 15 minutes.
export function startWaVerify(uid: string, phone: string): { link: string } | { error: string } {
  const number = businessNumber();
  if (!number) return { error: 'WhatsApp verification is not set up yet.' };
  if (limited(`wa:${phone}`)) return { error: 'Too many tries. Try again in an hour.' };
  const code = String(crypto.randomInt(100000, 1_000_000));
  write((d) => {
    const c = (d.contacts ??= {});
    const codes = ((c as any).wa_codes ??= {}) as Record<string, { uid: string; phone: string; exp: number }>;
    for (const [k, v] of Object.entries(codes)) if (v.exp < Date.now()) delete codes[k];
    codes[code] = { uid, phone, exp: Date.now() + 15 * 60_000 };
  });
  return { link: `https://wa.me/${number}?text=${encodeURIComponent(`DealRadar code ${code}`)}` };
}

export const inWindow = (phone: string) => read((d) => Date.now() - ((d.contacts as any)?.wa_seen?.[phone] ?? 0) < WINDOW_MS);

// Sends any text from the owner's MSG91 number (only inside the 24-hour window).
export async function sendFree(phone: string, text: string) {
  const m = read((d) => d.settings.msg91);
  if (!m?.number) throw new Error('MSG91 is not set up.');
  return runOperatorAction(MSG91.service_id, m.auth_id, 'row56sr38e4u', { integrated_number: m.number, recipient_number: phone, content_type: 'text', header_type: 'none', caption: text });
}

// The messages in DealRadar's own format.
export function confirmText(a: Alert, p: Product) {
  const off = p.mrp && p.mrp > p.price ? ` (${Math.round(((p.mrp - p.price) / p.mrp) * 100)}% off MRP ${inr(p.mrp)})` : '';
  const until = new Date(a.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return [
    '🎯 Your DealRadar price alert is set',
    '',
    `🛍️ Product: ${short(p.title)}`,
    `💰 Current price: ${inr(p.price)}${off}`,
    `🏪 Store: ${PLATFORM_NAMES[p.platform]}`,
    `📉 Alert on: ${a.drop_percent > 0 ? `a drop of ${a.drop_percent}% or more` : 'any price drop'}`,
    `📅 Watching till: ${until}`,
    '',
    '🔔 We check the price every 15 minutes and will message you here when it drops.',
    `📈 Price history: ${appUrl()}/p/${p.id}`,
    '',
    'Team DealRadar',
    `Not you? Reply STOP, or manage: ${manageLink('phone', a.phone!)}`,
  ].join('\n');
}

export function dropText(a: Alert, p: Product, reference: number, extra: string, buy: string) {
  const pct = ((reference - p.price) / reference) * 100;
  return [
    '🔔 Price update for your DealRadar alert',
    '',
    `🛍️ Product: ${short(p.title)}`,
    `💰 Price now: ${inr(p.price)} (was ${inr(reference)})`,
    `📉 Lower by: ${inr(reference - p.price)}${pct >= 0.5 ? ` · ${pct.toFixed(0)}% off` : ''}`,
    `🏪 Store: ${PLATFORM_NAMES[p.platform]}`,
    ...(extra ? [`🏷️ ${extra}`] : []),
    '',
    `🔗 Product link: ${buy}`,
    '',
    'You get this message because you set a price alert on DealRadar.',
    `Not you? Reply STOP, or manage: ${manageLink('phone', a.phone!)}`,
  ].join('\n');
}

const short = (t: string, n = 90) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '').replace(/[\s,;:(–-]+$/, '') + '…');

// MSG91 posts every message sent to the owner's number here. The shape varies by account settings, so the sender
// and text are looked for in the usual places (some values arrive as JSON inside a string).
function pick(body: any): { from: string; text: string } | null {
  const flat: any[] = [body];
  for (const k of ['messages', 'content', 'data', 'payload']) {
    let v = body?.[k];
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {}
    }
    if (Array.isArray(v)) flat.push(...v);
    else if (v && typeof v === 'object') flat.push(v);
  }
  let from = '';
  let text = '';
  for (const o of flat) {
    from ||= String(o?.customerNumber ?? o?.from ?? o?.sender ?? o?.mobile ?? o?.wa_id ?? '');
    const t = o?.text?.body ?? o?.text ?? o?.body ?? o?.message ?? (typeof o?.content === 'string' ? o.content : '');
    if (!text && typeof t === 'string') text = t;
  }
  from = from.replace(/\D/g, '');
  return from ? { from, text: text.trim() } : null;
}

export async function handleInbound(body: any): Promise<string> {
  const m = pick(body);
  if (!m) return 'no sender';
  const { from, text } = m;
  write((d) => void (((d.contacts ??= {}) as any).wa_seen ??= {}, ((d.contacts as any).wa_seen[from] = Date.now())));

  if (/^\s*stop\b/i.test(text)) {
    block('phone', from, 'replied STOP');
    await sendFree(from, '🛑 You will get no more DealRadar alerts on this number. To turn them on again, verify it on DealRadar.').catch(() => null);
    return 'stopped';
  }
  const code = (text.match(/\b(\d{6})\b/) || [])[1];
  const hit = code ? read((d) => ((d.contacts as any)?.wa_codes ?? {})[code] as { uid: string; phone: string; exp: number } | undefined) : undefined;
  if (hit && hit.exp > Date.now()) {
    write((d) => void delete (d.contacts as any).wa_codes[code!]);
    // The number that sent the code is the one proved, whatever was typed on the site.
    markVerified(hit.uid, 'phone', from);
    await sendFree(from, ['✅ Your number is verified for DealRadar', '', 'Price alerts you set will come here. Reply STOP anytime to stop them.', '', 'Team DealRadar'].join('\n')).catch((e) =>
      console.error('[wa] reply failed:', e instanceof Error ? e.message : e),
    );
    return 'verified';
  }
  return 'seen';
}
