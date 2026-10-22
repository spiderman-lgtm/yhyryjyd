import { NextResponse } from 'next/server';
import { newId, read, type Channel, type Tier } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { confirmationEmail, confirmationTelegram, createAlert, queueMail, queueTelegram, queueWhatsAppConfirmation } from '@/lib/alerts';
import { chatFor, linkFor, telegramBot } from '@/lib/telegram';
import { sendQueuedMailNow } from '@/lib/flows';
import { currentUid } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const uid = currentUid();
  const b = await req.json().catch(() => ({}));
  const product = getProduct(b.product_id);
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 });

  const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase().slice(0, 200) : null;
  // WhatsApp wants the number with country code and no '+'; a bare 10-digit Indian number gets 91.
  let phone = typeof b.phone === 'string' ? b.phone.replace(/\D/g, '') : '';
  if (phone.length === 10) phone = '91' + phone;
  const channels: Channel[] = [];
  if (email) channels.push('email');
  if (phone) channels.push('whatsapp');
  const wantTelegram = b.telegram === true && !!telegramBot();
  if (wantTelegram) channels.push('telegram');

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  if (phone && (phone.length < 11 || phone.length > 15)) return NextResponse.json({ error: 'Enter the WhatsApp number with country code.' }, { status: 400 });
  if (!channels.length) return NextResponse.json({ error: 'Add an email, a WhatsApp number or choose Telegram to be alerted.' }, { status: 400 });

  // Every alert is checked every 15 minutes; only the daily digest is kept as a separate choice.
  const tier: Tier = b.tier === 'digest' ? 'digest' : 'urgent';
  if (tier === 'digest' && !email) return NextResponse.json({ error: 'The daily digest is sent by email — add an email.' }, { status: 400 });
  const drop = [0, 5, 10, 20].includes(Number(b.drop_percent)) ? Number(b.drop_percent) : 0;
  const target = Number(b.target_price);
  const window_days = Number(b.window_days) === 15 ? 15 : 7;

  const duplicate = read((d) => Object.values(d.alerts).find((a) => a.uid === uid && a.product_id === product.id && a.status === 'active'));
  if (duplicate) return NextResponse.json({ error: 'You are already tracking this product. Manage it under My alerts.' }, { status: 409 });

  const alert = createAlert({
    id: newId('al'),
    uid,
    product_id: product.id,
    email,
    phone: phone || null,
    channels,
    tier,
    drop_percent: drop,
    target_price: Number.isFinite(target) && target > 0 && target < product.price ? target : null,
    window_days,
    baseline_price: product.price,
    telegram_chat: wantTelegram ? chatFor(uid) : null,
  });
  // Confirm straight away by email and on Telegram (when the shopper's chat is already linked);
  // the reply does not wait for the messages to be sent.
  if (email) {
    const { subject, html } = confirmationEmail(alert, product);
    queueMail(email, subject, html);
  }
  let telegram_link: string | null = null;
  if (wantTelegram && alert.telegram_chat) {
    const t = confirmationTelegram(alert, product);
    queueTelegram(alert.telegram_chat, t.text, t.url, t.image, t.label);
  } else if (wantTelegram) telegram_link = linkFor(uid);
  const whatsappConfirm = phone ? queueWhatsAppConfirmation(alert, product, read((d) => d.settings)) : false;
  if (email || alert.telegram_chat || whatsappConfirm) sendQueuedMailNow().catch((e) => console.error('confirmation:', e instanceof Error ? e.message : e));
  return NextResponse.json({ alert, confirmation: !!email, whatsapp_confirmation: whatsappConfirm, telegram_link, telegram_linked: !!alert.telegram_chat });
}

export async function GET() {
  const uid = currentUid();
  const alerts = read((d) => Object.values(d.alerts).filter((a) => a.uid === uid));
  return NextResponse.json({ alerts });
}
