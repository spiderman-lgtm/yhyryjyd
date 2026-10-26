import 'server-only';
import { read, type Alert, type Msg91Message, type Product, type Settings } from './db';
import { PLATFORM_NAMES } from './scraper';
import { inr } from './format';

// The two WhatsApp templates DealRadar creates in the operator's MSG91 account, in the same format as the
// Telegram messages. WhatsApp only lets a business start a chat with a template Meta approved; each {{n}} is
// one line of text (a variable may not hold a line break, and may not start or end the message).
export const MSG91_TEMPLATES = {
  confirm: {
    name: 'dealradar_tracking_started',
    body: [
      '🎯 Price tracking started!',
      '',
      '🛍️ {{1}}',
      '',
      '💰 Current price: {{2}}',
      '🏪 Store: {{3}}',
      '📉 Alert on: {{4}}',
      '📅 Watching till: {{5}}',
      '',
      '🔔 We check every 15 minutes and message you here the moment the price drops.',
      '',
      '📈 Price history: {{6}}',
      '',
      '— Team DealRadar 💸',
    ].join('\n'),
    examples: ['boAt Airdopes 141 Gen 2 Wireless Earbuds', '₹799 (80% off MRP ₹3,990)', 'Amazon', 'any price drop', '2 Nov 2026', 'https://dealradar.embarko.app/p/p_c482768bcc34'],
  },
  drop: {
    name: 'dealradar_price_drop',
    body: [
      '🔥 PRICE DROP ALERT!',
      '',
      '🛍️ {{1}}',
      '',
      '💰 Now: {{2}} (was {{3}})',
      '📉 You save: {{4}}',
      '🏪 Store: {{5}}',
      '🏷️ {{6}}',
      '',
      '🛒 Buy now: {{7}}',
      '',
      '⚡ Grab it before the price goes up!',
    ].join('\n'),
    examples: ['boAt Airdopes 141 Gen 2 Wireless Earbuds', '₹699', '₹799', '₹100 · 13% off', 'Amazon', 'Coupon: SAVE10 — 10% off', 'https://dealradar.embarko.app/api/buy/p_c482768bcc34'],
  },
} as const;

export type Msg91TemplateKey = keyof typeof MSG91_TEMPLATES;

// WhatsApp rejects a variable with a line break, a tab or more than four spaces in a row.
const one = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 300) || '—';
const shortTitle = (t: string, n = 120) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '').replace(/[\s,;:(–-]+$/, '') + '…');

// Ready once the number is picked and both templates are approved with their send fields known.
export function msg91Ready(s: Settings = read((d) => d.settings)): boolean {
  const m = s.msg91;
  const ok = (t?: { status: string; fields?: string[] }) => t?.status === 'APPROVED' && !!t.fields?.length;
  return !!(m?.number && ok(m.templates?.confirm) && ok(m.templates?.drop));
}

export function msg91Confirmation(alert: Alert, p: Product, page: string): Msg91Message {
  const off = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const until = new Date(alert.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    to: alert.phone!,
    template: 'confirm',
    vars: [
      shortTitle(p.title),
      `${inr(p.price)}${off ? ` (${off}% off MRP ${inr(p.mrp!)})` : ''}`,
      PLATFORM_NAMES[p.platform],
      alert.drop_percent > 0 ? `a drop of ${alert.drop_percent}% or more` : 'any price drop',
      until,
      page,
    ].map(one),
  };
}

export function msg91Drop(alert: Alert, p: Product, reference: number, extra: string, buy: string): Msg91Message {
  const pct = ((reference - p.price) / reference) * 100;
  return {
    to: alert.phone!,
    template: 'drop',
    vars: [
      shortTitle(p.title),
      inr(p.price),
      inr(reference),
      `${inr(reference - p.price)}${pct >= 0.5 ? ` · ${pct.toFixed(0)}% off` : ''}`,
      PLATFORM_NAMES[p.platform],
      extra,
      buy,
    ].map(one),
  };
}
