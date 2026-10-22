import 'server-only';
import crypto from 'crypto';
import { read, write } from './db';
import { appUrl } from './config';
import { automationKey, sendQueuedMailNow } from './flows';
import { queueTelegram } from './alerts';
import { endSubscription, subscribeTelegramMessages } from './viasocket';

// The operator's bot username once Telegram is connected and listening, else null.
export function telegramBot(): string | null {
  return read((d) => (d.settings.telegram?.subscription && d.settings.telegram.bot ? d.settings.telegram.bot : null));
}

export const chatFor = (uid: string) => read((d) => d.telegram.chats[uid]?.chat ?? null);

// A one-time link that opens the bot with a code tying the shopper's Telegram chat to their alerts.
export function linkFor(uid: string): string | null {
  const bot = telegramBot();
  if (!bot) return null;
  const code = crypto.randomBytes(12).toString('base64url');
  write((d) => {
    const old = Date.now() - 2 * 86400_000;
    for (const [k, v] of Object.entries(d.telegram.codes)) if (Date.parse(v.at) < old) delete d.telegram.codes[k];
    d.telegram.codes[code] = { uid, at: new Date().toISOString() };
  });
  return `https://t.me/${bot}?start=${code}`;
}

export function normalizeBot(v: unknown): string | null {
  const s = String(v ?? '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{3,31}bot$/i.test(s) ? s : null;
}

// Listens for messages to the bot through viaSocket; replaces an older listener.
export async function listenToBot(): Promise<void> {
  const t = read((d) => d.settings.telegram);
  if (!t) return;
  const handler = `
const ev = context.req.body;
await axios.post(${JSON.stringify(appUrl() + '/api/telegram/inbound')}, { event: ev }, { headers: { "x-automation-key": ${JSON.stringify(automationKey())} }, timeout: 15000 });
return { forwarded: true };`;
  try {
    const sub = await subscribeTelegramMessages(t.auth_id, handler);
    if (t.subscription && t.subscription !== sub) await endSubscription(t.subscription).catch(() => null);
    write((d) => {
      if (d.settings.telegram) Object.assign(d.settings.telegram, { subscription: sub, error: null });
    });
  } catch (e) {
    write((d) => {
      if (d.settings.telegram) d.settings.telegram.error = `Could not listen to the bot: ${e instanceof Error ? e.message : String(e)}`;
    });
  }
}

export async function stopListening() {
  const sub = read((d) => d.settings.telegram?.subscription);
  if (sub) await endSubscription(sub).catch(() => null);
}

// A message to the bot: "/start <code>" links the chat, "/stop" unlinks it.
export async function handleBotMessage(ev: any): Promise<string> {
  const chat = String(ev?.chatID ?? ev?.message_details?.chat?.id ?? ev?.chat?.id ?? '').trim();
  const text = String(ev?.message ?? ev?.message_details?.text ?? ev?.text ?? '').trim();
  const name = ev?.message_details?.from?.first_name ?? ev?.message_details?.chat?.first_name ?? null;
  if (!/^-?\d{3,20}$/.test(chat)) return 'ignored: no chat';

  const start = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{8,64}))?/);
  if (start) {
    const linked = start[1]
      ? write((d) => {
          const c = d.telegram.codes[start[1]];
          if (!c) return null;
          delete d.telegram.codes[start[1]];
          d.telegram.chats[c.uid] = { chat, name: name ? String(name).slice(0, 60) : null, at: new Date().toISOString() };
          const titles: string[] = [];
          for (const a of Object.values(d.alerts)) {
            if (a.uid !== c.uid || a.status !== 'active' || !a.channels.includes('telegram')) continue;
            a.telegram_chat = chat;
            const p = d.products[a.product_id];
            if (p) titles.push(p.title.slice(0, 70));
          }
          return titles;
        })
      : null;
    if (linked) {
      queueTelegram(
        chat,
        `✅ Telegram alerts are on${name ? `, ${name}` : ''}!\n\n` +
          (linked.length ? `Watching:\n${linked.map((t) => `• ${t}`).join('\n')}\n\n` : '') +
          'DealRadar checks every 15 minutes and messages you here the moment a price drops. Send /stop to turn Telegram alerts off.',
        `${appUrl()}/alerts`,
        null,
        '🔔 My alerts',
      );
    } else {
      queueTelegram(chat, '👋 Welcome to DealRadar! To get price-drop alerts here, open a product on DealRadar, choose “Telegram” in Price Drop Alert and tap “Open Telegram”.', appUrl(), null, 'Open DealRadar');
    }
    await sendQueuedMailNow().catch(() => null);
    return linked ? 'linked' : 'welcome';
  }

  if (/^\/stop\b/.test(text)) {
    write((d) => {
      for (const [uid, v] of Object.entries(d.telegram.chats)) if (v.chat === chat) delete d.telegram.chats[uid];
      for (const a of Object.values(d.alerts)) {
        if (a.telegram_chat !== chat) continue;
        a.telegram_chat = null;
        a.channels = a.channels.filter((c) => c !== 'telegram');
        if (!a.channels.length) a.status = 'cancelled';
      }
    });
    queueTelegram(chat, '🛑 Telegram alerts are off. You can turn them on again from any product page on DealRadar.', appUrl(), null, 'Open DealRadar');
    await sendQueuedMailNow().catch(() => null);
    return 'stopped';
  }
  return 'ignored';
}
