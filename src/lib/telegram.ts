import 'server-only';
import crypto from 'crypto';
import { read, write } from './db';
import { appUrl } from './config';
import { automationKey, sendQueuedMailNow } from './flows';
import { queueTelegram } from './alerts';
import { TELEGRAM, endSubscription, listFlows, subscribeTelegramMessages } from './viasocket';

// The operator's bot username once Telegram is connected and listening, else null.
export function telegramBot(): string | null {
  return read((d) => (d.settings.telegram?.subscription && d.settings.telegram.bot ? d.settings.telegram.bot : null));
}

export const chatFor = (uid: string) => read((d) => d.telegram.chats[uid]?.chat ?? null);

// A one-time code (also typeable) and the link that opens the bot with it, tying the shopper's chat to their alerts.
export function linkFor(uid: string): string | null {
  return codeAndLink(uid)?.link ?? null;
}

export function codeAndLink(uid: string): { code: string; link: string } | null {
  const bot = telegramBot();
  if (!bot) return null;
  const code = crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').toUpperCase();
  write((d) => {
    const old = Date.now() - 2 * 86400_000;
    for (const [k, v] of Object.entries(d.telegram.codes)) if (Date.parse(v.at) < old) delete d.telegram.codes[k];
    d.telegram.codes[code] = { uid, at: new Date().toISOString() };
  });
  return { code, link: `https://t.me/${bot}?start=${code}` };
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
    // Old listeners (an earlier connection, or one made by hand) would deliver every message twice.
    const old = (await listFlows().catch(() => [])).filter((f) => f.status === 'active' && f.title === TELEGRAM.new_message.version_id);
    for (const f of old) await endSubscription(f.id).catch(() => null);
    if (t.subscription) await endSubscription(t.subscription).catch(() => null);
    const sub = await subscribeTelegramMessages(t.auth_id, handler);
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

  // "/start CODE" from the link, or the code typed on its own.
  const start = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?$/) ?? (/^[A-Za-z0-9]{8}$/.test(text) ? [text, text] : null);
  const code = start?.[1]?.toUpperCase() ?? null;
  if (start || !read((d) => Object.values(d.telegram.chats).some((v) => v.chat === chat))) {
    const linked = code
      ? write((d) => {
          const c = d.telegram.codes[code] ?? d.telegram.codes[start![1]];
          if (!c) return null;
          delete d.telegram.codes[code];
          delete d.telegram.codes[start![1]];
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
        [
          `🎉 Welcome to DealRadar${name ? `, ${name}` : ''}!`,
          '',
          '✅ Telegram alerts are ON',
          ...(linked.length ? ['', '📦 Watching:', ...linked.map((t) => `• ${t}`)] : []),
          '',
          '⏱️ We check prices every 15 minutes and message you here the moment a price drops.',
          '🛑 Send /stop anytime to turn Telegram alerts off.',
        ].join('\n'),
        `${appUrl()}/alerts`,
        null,
        '🔔 My alerts',
      );
    } else {
      queueTelegram(
        chat,
        code
          ? ['⚠️ That code has expired or was already used.', '', '🔁 Open the product on DealRadar again, choose ✈️ Telegram in Price Drop Alert and tap “Open Telegram”.'].join('\n')
          : [
              `👋 Hi${name ? ` ${name}` : ''}! Welcome to DealRadar 💸`,
              '',
              'Get price-drop alerts right here:',
              '1️⃣ Open any product on DealRadar',
              '2️⃣ In “Price Drop Alert”, tick ✈️ Telegram',
              '3️⃣ Tap “Track price”, then “Open Telegram”',
              '',
              '🔑 Or send the 8-character code shown after “Track price”.',
            ].join('\n'),
        appUrl(),
        null,
        'Open DealRadar',
      );
    }
    void sendQueuedMailNow().catch(() => null);
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
    queueTelegram(chat, ['🛑 Telegram alerts are OFF', '', '🔔 Turn them on again anytime from a product page on DealRadar.'].join('\n'), appUrl(), null, 'Open DealRadar');
    void sendQueuedMailNow().catch(() => null);
    return 'stopped';
  }
  return 'ignored';
}
