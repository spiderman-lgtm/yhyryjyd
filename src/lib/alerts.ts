import 'server-only';
import { historyFor, newId, read, write, type Alert, type OutboxMail, type Product, type Settings, type Tier } from './db';
import { refreshProduct } from './products';
import { compareStores } from './compare';
import { catalogStale, refreshCatalog } from './catalog';
import { checkStoreOffers } from './offerfeed';
import { cachedCoupon } from './coupons';
import { PLATFORM_NAMES } from './scraper';
import { appUrl, linkSig } from './config';
import { inr } from './format';

export const TIER_INFO: Record<Tier, { label: string; every: string; cron: string; minAgeMs: number }> = {
  urgent: { label: 'Instant', every: 'every 15 minutes', cron: 'Every 15 minutes', minAgeMs: 14 * 60_000 },
  normal: { label: 'Regular', every: 'every 2 hours', cron: 'Every 2 hours', minAgeMs: 110 * 60_000 },
  digest: { label: 'Daily digest', every: 'once a day at 9 AM', cron: 'Every day at 9am', minAgeMs: 20 * 3600_000 },
};

const MAX_NOTIFICATIONS_PER_RUN = 25;
const CHECK_BUDGET_MS = 30_000;

export interface Notification {
  id: string;
  kind: 'drop' | 'digest' | 'expiry' | 'confirm';
  email: string | null;
  phone: string | null;
  subject: string;
  html: string;
  whatsapp_vars: Record<string, string> | null;
  // Set for a template other than the price-drop one (the confirmation).
  whatsapp_template?: string | null;
  telegram: { chat: string; text: string; url: string | null; image?: string | null; label?: string } | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function links(alert: Alert, product: Product) {
  const base = appUrl();
  const sig = linkSig(alert.id);
  return {
    buy: `${base}/api/buy/${product.id}?a=${alert.id}`,
    page: `${base}/p/${product.id}`,
    stop: `${base}/api/alerts/action?op=cancel&id=${alert.id}&sig=${sig}`,
    extend: `${base}/api/alerts/action?op=extend&id=${alert.id}&sig=${sig}`,
  };
}

function shell(body: string, footer: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f172a">
<div style="font-size:20px;font-weight:bold;color:#ea580c;margin-bottom:12px">DealRadar</div>${body}
<p style="font-size:12px;color:#64748b;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px">${footer}</p></div>`;
}

function productBlock(p: Product) {
  return `<table cellpadding="0" cellspacing="0" style="margin:12px 0"><tr>
${p.image ? `<td style="padding-right:12px"><img src="${esc(p.image)}" width="90" style="border-radius:8px"/></td>` : ''}
<td style="vertical-align:top"><div style="font-weight:bold">${esc(p.title)}</div>
<div style="color:#64748b;font-size:13px">${PLATFORM_NAMES[p.platform]}</div></td></tr></table>`;
}

function window_low(productId: string, days: number) {
  const pts = historyFor(productId, days).map((h) => h.price);
  return pts.length ? Math.min(...pts) : null;
}

function dropNotification(alert: Alert, p: Product, reference: number, reason: string, settings: Settings): Notification {
  const l = links(alert, p);
  const coupon = cachedCoupon(p);
  const dropPct = Math.max(0, ((reference - p.price) / reference) * 100);
  const low = window_low(p.id, alert.window_days);
  const isLow = low !== null && p.price <= low;
  const couponHtml = coupon
    ? `<div style="border:2px dashed #ea580c;border-radius:8px;padding:10px;margin:12px 0;background:#fff7ed">
${coupon.code ? `Use code <b style="font-size:16px">${esc(coupon.code)}</b> — ` : ''}${esc(coupon.discount_text || coupon.title)}
${coupon.conditions ? `<div style="font-size:12px;color:#64748b">${esc(coupon.conditions)}</div>` : ''}</div>`
    : '';
  const html = shell(
    `<p style="font-size:18px;font-weight:bold;color:#16a34a">Price dropped${dropPct >= 0.5 ? ` ${dropPct.toFixed(0)}%` : ''} — you can buy it now!</p>
<p style="font-size:14px;color:#334155">The product you are tracking just got cheaper.</p>
${productBlock(p)}
<div style="font-size:26px;font-weight:bold;color:#16a34a">${inr(p.price)}
<span style="font-size:15px;color:#94a3b8;text-decoration:line-through;font-weight:normal">${inr(reference)}</span></div>
<div style="font-size:13px;color:#334155;margin-top:4px">${esc(reason)}${isLow ? ` · Lowest price in the last ${alert.window_days} days` : ''}</div>
${couponHtml}
<a href="${l.buy}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">Buy now at ${inr(p.price)}</a>
<p style="font-size:13px"><a href="${l.page}">See price history${coupon ? '' : ' and coupons'}</a></p>`,
    `You asked DealRadar to watch this price until ${new Date(alert.expires_at).toDateString()}. <a href="${l.stop}">Stop these alerts</a>.`,
  );

  let whatsapp_vars: Record<string, string> | null = null;
  const wa = settings.whatsapp;
  if (alert.channels.includes('whatsapp') && alert.phone && wa?.message_template_id) {
    const values: Record<string, string> = {
      product_title: p.title.slice(0, 120),
      price: inr(p.price),
      old_price: inr(reference),
      drop_percent: `${dropPct.toFixed(0)}%`,
      coupon: coupon ? (coupon.code ? `${coupon.code} (${coupon.discount_text})` : coupon.discount_text) : 'No coupon right now',
      buy_link: l.buy,
    };
    whatsapp_vars = Object.fromEntries(Object.entries(wa.variable_map).map(([key, src]) => [key, values[src] ?? '']));
  }

  const telegram =
    alert.channels.includes('telegram') && alert.telegram_chat
      ? {
          chat: alert.telegram_chat,
          text: [
            '🔥 PRICE DROP ALERT!',
            '',
            `🛍️ ${p.title.slice(0, 120)}`,
            '',
            `💰 Now: ${inr(p.price)}   (was ${inr(reference)})`,
            `📉 You save: ${inr(reference - p.price)}${dropPct >= 0.5 ? ` · ${dropPct.toFixed(0)}% off` : ''}`,
            `🏪 Store: ${PLATFORM_NAMES[p.platform]}`,
            ...(isLow ? [`⭐ Lowest price in ${alert.window_days} days`] : []),
            ...(coupon ? ['', `🏷️ Coupon: ${coupon.code ? `${coupon.code} — ` : ''}${coupon.discount_text || coupon.title}`] : []),
            '',
            '⚡ Grab it before the price goes up!',
          ].join('\n'),
          url: l.buy,
          image: p.image,
          label: `🛒 Buy now at ${inr(p.price)}`,
        }
      : null;

  return {
    id: alert.id,
    kind: 'drop',
    email: alert.channels.includes('email') ? alert.email : null,
    phone: whatsapp_vars ? alert.phone : null,
    subject: `Price dropped! ${p.title.slice(0, 55)} is now ${inr(p.price)} — buy now`,
    html,
    whatsapp_vars,
    telegram,
  };
}

// "You are now tracking…" — sent once, right after a shopper sets an alert with an email.
export function confirmationEmail(alert: Alert, p: Product): { subject: string; html: string } {
  const l = links(alert, p);
  const until = new Date(alert.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const drops = alert.drop_percent > 0 ? `when it drops by <b>${alert.drop_percent}% or more</b>` : 'as soon as the price drops';
  const rule = alert.target_price ? `${drops}, or reaches <b>${inr(alert.target_price)}</b>` : drops;
  const low = window_low(p.id, 90);
  const off = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const row = (k: string, v: string) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;white-space:nowrap">${k}</td><td style="padding:6px 0;font-size:14px">${v}</td></tr>`;
  const html = shell(
    `<p style="font-size:16px"><b>You are now tracking this price ✓</b></p>
<p style="font-size:14px;color:#334155">DealRadar will email you ${rule}.${alert.phone && alert.channels.includes('whatsapp') ? ' We will also message you on WhatsApp.' : ''}</p>
${productBlock(p)}
<div style="font-size:24px;font-weight:bold">${inr(p.price)}${p.mrp && p.mrp > p.price ? ` <span style="font-size:15px;color:#94a3b8;text-decoration:line-through;font-weight:normal">${inr(p.mrp)}</span> <span style="font-size:14px;color:#16a34a">${off}% off</span>` : ''}</div>
<table cellpadding="0" cellspacing="0" style="margin:12px 0">
${row('Store', esc(PLATFORM_NAMES[p.platform]))}
${row('Price when you started', inr(alert.baseline_price))}
${alert.target_price ? row('Your target price', inr(alert.target_price)) : ''}
${low && low < p.price ? row('Lowest we have seen', inr(low)) : ''}
${row('Watching until', until)}
${row('Availability', p.in_stock ? 'In stock' : 'Out of stock right now')}
</table>
<a href="${l.page}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">See price history & compare</a>
<a href="${l.buy}" style="display:inline-block;margin-left:8px;border:1px solid #cbd5e1;color:#0f172a;padding:11px 18px;border-radius:8px;text-decoration:none">Open on ${esc(PLATFORM_NAMES[p.platform])}</a>`,
    `You (or someone using this address) asked DealRadar to watch this product. <a href="${l.stop}">Stop this alert</a>.`,
  );
  return { subject: `Tracking started: ${p.title.slice(0, 60)} at ${inr(p.price)}`, html };
}

// The Telegram version of the confirmation.
export function confirmationTelegram(alert: Alert, p: Product): { text: string; url: string; image: string | null; label: string } {
  const rule = alert.drop_percent > 0 ? `drops by ${alert.drop_percent}% or more` : 'any price drop';
  const until = new Date(alert.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const off = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  return {
    text: [
      '🎯 Price tracking started!',
      '',
      `🛍️ ${p.title.slice(0, 120)}`,
      '',
      `💰 Current price: ${inr(p.price)}${off ? `  (${off}% off MRP ${inr(p.mrp!)})` : ''}`,
      `🏪 Store: ${PLATFORM_NAMES[p.platform]}`,
      `📉 Alert on: ${rule}`,
      `📅 Watching till: ${until}`,
      '',
      '🔔 We check every 15 minutes and message you here the moment the price drops.',
      '',
      '— Team DealRadar 💸',
    ].join('\n'),
    url: links(alert, p).page,
    image: p.image,
    label: '📈 See price history',
  };
}

// The WhatsApp confirmation, when the owner picked a confirmation template in Admin.
export function queueWhatsAppConfirmation(alert: Alert, p: Product, settings: Settings): boolean {
  const wa = settings.whatsapp;
  if (!alert.phone || !wa?.confirm_template_id) return false;
  const l = links(alert, p);
  const coupon = cachedCoupon(p);
  const values: Record<string, string> = {
    product_title: p.title.slice(0, 120),
    price: inr(p.price),
    old_price: inr(p.price),
    drop_percent: '0%',
    coupon: coupon ? (coupon.code ? `${coupon.code} (${coupon.discount_text})` : coupon.discount_text) : 'No coupon right now',
    buy_link: l.page,
  };
  const vars = Object.fromEntries(Object.entries(wa.confirm_variable_map ?? {}).map(([key, src]) => [key, values[src] ?? '']));
  const m: OutboxMail = { id: newId('m'), email: null, whatsapp: { phone: alert.phone, template_id: wa.confirm_template_id, vars }, subject: '', html: '', created_at: new Date().toISOString(), claimed_at: null, sent_at: null, tries: 0 };
  write((d) => {
    d.outbox.push(m);
  });
  return true;
}

export function queueTelegram(chat: string, text: string, url: string | null, image: string | null = null, label?: string): OutboxMail {
  const m: OutboxMail = { id: newId('m'), email: null, telegram: { chat, text, url, image, label }, subject: '', html: '', created_at: new Date().toISOString(), claimed_at: null, sent_at: null, tries: 0 };
  write((d) => {
    d.outbox.push(m);
  });
  return m;
}

export function queueMail(email: string, subject: string, html: string): OutboxMail {
  const m: OutboxMail = { id: newId('m'), email, subject, html, created_at: new Date().toISOString(), claimed_at: null, sent_at: null, tries: 0 };
  write((d) => {
    d.outbox.push(m);
  });
  return m;
}

// Hands out queued emails for sending. A claimed email is not handed out again for 10 minutes,
// so the instant flow and a scheduled run never both send it.
export function claimOutbox(minAgeMs = 0): Notification[] {
  return write((d) => {
    const now = Date.now();
    const due = d.outbox.filter(
      (m) => !m.sent_at && m.tries < 5 && now - Date.parse(m.created_at) >= minAgeMs && now - Date.parse(m.created_at) < 2 * 86400_000 && (!m.claimed_at || now - Date.parse(m.claimed_at) > 10 * 60_000),
    );
    for (const m of due.slice(0, MAX_NOTIFICATIONS_PER_RUN)) {
      m.claimed_at = new Date(now).toISOString();
      m.tries++;
    }
    return due
      .slice(0, MAX_NOTIFICATIONS_PER_RUN)
      .map((m) => ({
        id: m.id,
        kind: 'confirm' as const,
        email: m.email,
        phone: m.whatsapp?.phone ?? null,
        subject: m.subject,
        html: m.html,
        whatsapp_vars: m.whatsapp?.vars ?? null,
        whatsapp_template: m.whatsapp?.template_id ?? null,
        telegram: m.telegram ?? null,
      }));
  });
}

function evaluate(alert: Alert, p: Product): { reference: number; reason: string } | null {
  if (!p.in_stock || p.last_error) return null;
  const reference = alert.last_notified_price ?? alert.baseline_price;
  if (p.price >= reference) return null;
  if (alert.target_price && p.price <= alert.target_price) return { reference, reason: `At or below your target of ${inr(alert.target_price)}` };
  const drop = ((reference - p.price) / reference) * 100;
  if (alert.drop_percent === 0) return { reference, reason: `Down ${inr(reference - p.price)}` };
  if (drop >= alert.drop_percent) return { reference, reason: `Down ${drop.toFixed(1)}% — you asked for ${alert.drop_percent}% or more` };
  return null;
}

function expiryNotification(alert: Alert, p: Product): Notification {
  const l = links(alert, p);
  const low = window_low(p.id, alert.window_days);
  return {
    id: alert.id,
    kind: 'expiry',
    email: alert.email,
    phone: null,
    subject: `Tracking ended: ${p.title.slice(0, 60)}`,
    html: shell(
      `<p>Your ${alert.window_days}-day price watch has ended.</p>${productBlock(p)}
<p>Price now <b>${inr(p.price)}</b>${low ? ` · lowest we saw: <b>${inr(low)}</b>` : ''}.</p>
<a href="${l.extend}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Keep watching for ${alert.window_days} more days</a>
<p style="font-size:13px"><a href="${l.buy}">Or buy it now</a></p>`,
      'This is the last email about this product unless you extend.',
    ),
    whatsapp_vars: null,
    telegram:
      alert.channels.includes('telegram') && alert.telegram_chat
        ? {
            chat: alert.telegram_chat,
            text: [
              '⏰ Price watch ended',
              '',
              `🛍️ ${p.title.slice(0, 120)}`,
              '',
              `💰 Price now: ${inr(p.price)}`,
              ...(low ? [`📉 Lowest we saw: ${inr(low)}`] : []),
              `🏪 Store: ${PLATFORM_NAMES[p.platform]}`,
              '',
              `🔔 Want us to keep watching for ${alert.window_days} more days? Tap below.`,
            ].join('\n'),
            url: l.extend,
            image: p.image,
            label: '🔔 Keep watching' }
        : null,
  };
}

function digestNotification(email: string, items: { alert: Alert; product: Product }[]): Notification {
  const rows = items
    .map(({ alert, product: p }) => {
      const l = links(alert, p);
      const diff = p.price - alert.baseline_price;
      const low7 = window_low(p.id, 7);
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0"><a href="${l.page}" style="color:#0f172a;font-weight:bold">${esc(p.title.slice(0, 70))}</a>
<div style="font-size:12px;color:#64748b">${PLATFORM_NAMES[p.platform]}${low7 ? ` · 7-day low ${inr(low7)}` : ''}</div></td>
<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap"><b>${inr(p.price)}</b><br/>
<span style="font-size:12px;color:${diff < 0 ? '#16a34a' : diff > 0 ? '#dc2626' : '#64748b'}">${diff === 0 ? 'no change' : `${diff < 0 ? '▼' : '▲'} ${inr(Math.abs(diff))}`}</span></td>
<td style="padding:8px 0 8px 8px;border-bottom:1px solid #e2e8f0"><a href="${l.buy}" style="color:#ea580c">Buy</a></td></tr>`;
    })
    .join('');
  return {
    id: items.map((i) => i.alert.id).join(','),
    kind: 'digest',
    email,
    phone: null,
    subject: `Your DealRadar watchlist today (${items.length} product${items.length > 1 ? 's' : ''})`,
    html: shell(`<p>Today's prices for what you are watching (compared with when you started):</p><table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`, 'Daily digest from DealRadar.'),
    whatsapp_vars: null,
    telegram: null,
  };
}

export async function runTier(tier: Tier) {
  const started = Date.now();
  const nowIso = () => new Date().toISOString();
  const settings = read((d) => d.settings);
  const notifications: Notification[] = [];

  // 1. Expire finished watches (handled by every tier so the notice is timely).
  const expired = read((d) => Object.values(d.alerts).filter((a) => a.status === 'active' && Date.parse(a.expires_at) <= Date.now()));
  for (const a of expired.slice(0, MAX_NOTIFICATIONS_PER_RUN)) {
    const p = read((d) => d.products[a.product_id]);
    write((d) => {
      d.alerts[a.id].status = 'expired';
    });
    if (p && a.email) notifications.push(expiryNotification(a, p));
  }

  // Alerts made on the 2-hour setting moved to the 15-minute check, which now covers every price alert.
  if (tier === 'urgent') {
    write((d) => {
      for (const a of Object.values(d.alerts)) if (a.status === 'active' && a.tier === 'normal') a.tier = 'urgent';
    });
  }

  // 2. Refresh prices for this tier's products, stalest first, within the time budget.
  const alerts = read((d) => Object.values(d.alerts).filter((a) => a.status === 'active' && a.tier === tier));
  const productIds = [...new Set(alerts.map((a) => a.product_id))]
    .map((id) => read((d) => d.products[id]))
    .filter((p): p is Product => !!p)
    .sort((a, b) => Date.parse(a.last_checked_at) - Date.parse(b.last_checked_at));
  let checked = 0;
  for (const p of productIds) {
    if (Date.now() - started > CHECK_BUDGET_MS) break;
    if (Date.now() - Date.parse(p.last_checked_at) < TIER_INFO[tier].minAgeMs) continue;
    await refreshProduct(p);
    checked++;
  }

  // Products people looked at in the last 2 weeks are re-checked every 6 hours too, so their
  // price graph keeps filling in. Page reads only: no AI credits are spent on these.
  if (tier === 'normal') {
    const alerted = new Set(productIds.map((p) => p.id));
    const viewed = read((d) =>
      Object.values(d.products).filter(
        (p) =>
          !alerted.has(p.id) &&
          p.last_viewed_at &&
          Date.now() - Date.parse(p.last_viewed_at) < 14 * 86400_000 &&
          Date.now() - Date.parse(p.last_checked_at) > 6 * 3600_000,
      ),
    ).sort((a, b) => Date.parse(a.last_checked_at) - Date.parse(b.last_checked_at));
    for (const p of viewed) {
      if (Date.now() - started > CHECK_BUDGET_MS) break;
      await refreshProduct(p, { allowAi: false });
      checked++;
    }

    // Other stores' prices for the same products, so each store's line in the graph keeps moving.
    // compareStores only searches again once its cached result is stale (6 hours).
    const compared = [...productIds, ...viewed].filter((p) => {
      const c = read((d) => d.compare[p.id]);
      return !c || Date.now() - Date.parse(c.fetched_at) > 6 * 3600_000;
    });
    for (const p of compared.slice(0, 8)) {
      if (Date.now() - started > CHECK_BUDGET_MS) break;
      await compareStores(read((d) => d.products[p.id]) ?? p, null, { allowAi: false }).catch(() => null);
    }
  }

  // The Trending page's deal rows are re-searched in the background when they are a few hours old.
  if (tier === 'normal' && catalogStale()) void refreshCatalog();
  // New offers from the stores' own pages are queued in Admin for approval (at most every 6 hours).
  if (tier === 'normal') void checkStoreOffers().catch(() => null);

  // 3. Decide who hears about it.
  if (tier === 'digest') {
    const byEmail = new Map<string, { alert: Alert; product: Product }[]>();
    for (const a of alerts) {
      const p = read((d) => d.products[a.product_id]);
      if (!p || !a.email || !a.channels.includes('email')) continue;
      byEmail.set(a.email, [...(byEmail.get(a.email) || []), { alert: a, product: p }]);
    }
    for (const [email, items] of byEmail) {
      if (notifications.length >= MAX_NOTIFICATIONS_PER_RUN) break;
      notifications.push(digestNotification(email, items));
      write((d) => {
        for (const { alert, product } of items) {
          d.alerts[alert.id].last_notified_at = nowIso();
          if (product.price < (alert.last_notified_price ?? alert.baseline_price)) d.alerts[alert.id].last_notified_price = product.price;
        }
      });
    }
  } else {
    for (const a of alerts) {
      if (notifications.length >= MAX_NOTIFICATIONS_PER_RUN) break;
      const p = read((d) => d.products[a.product_id]);
      if (!p) continue;
      const hit = evaluate(a, p);
      if (!hit) continue;
      notifications.push(dropNotification(a, p, hit.reference, hit.reason, settings));
      write((d) => {
        d.alerts[a.id].last_notified_price = p.price;
        d.alerts[a.id].last_notified_at = nowIso();
      });
    }
  }

  // Emails the instant flow did not get to (older than 2 minutes) go out with this run.
  notifications.push(...claimOutbox(2 * 60_000));

  return { tier, checked, products: productIds.length, notifications, at: nowIso() };
}

export function createAlert(input: Omit<Alert, 'id' | 'created_at' | 'expires_at' | 'status' | 'last_notified_at' | 'last_notified_price'> & { id: string }): Alert {
  const now = Date.now();
  const alert: Alert = {
    ...input,
    last_notified_at: null,
    last_notified_price: null,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + input.window_days * 86400_000).toISOString(),
    status: 'active',
  };
  write((d) => {
    d.alerts[alert.id] = alert;
  });
  return alert;
}

export function extendAlert(id: string) {
  return write((d) => {
    const a = d.alerts[id];
    if (!a || a.status === 'cancelled') return null;
    const p = d.products[a.product_id];
    a.status = 'active';
    a.expires_at = new Date(Date.now() + a.window_days * 86400_000).toISOString();
    if (p) a.baseline_price = p.price;
    a.last_notified_price = null;
    return a;
  });
}

export function cancelAlert(id: string) {
  return write((d) => {
    const a = d.alerts[id];
    if (a) a.status = 'cancelled';
    return a ?? null;
  });
}
