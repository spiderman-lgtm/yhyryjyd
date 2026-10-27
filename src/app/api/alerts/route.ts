import { NextResponse } from 'next/server';
import { newId, read, type Channel, type Tier } from '@/lib/db';
import { getProduct } from '@/lib/products';
import { confirmEmailRequest, confirmationEmail, confirmationTelegram, createAlert, queueMail, queueTelegram, queueWhatsAppConfirmation } from '@/lib/alerts';
import { emailConfirmLink, isBlocked, isVerified, limited, verifiedList } from '@/lib/contacts';
import { chatFor, codeAndLink, telegramBot } from '@/lib/telegram';
import { sendQueuedMailNow } from '@/lib/flows';
import { currentUid, currentUser } from '@/lib/auth';
import { PLATFORM_NAMES } from '@/lib/scraper';
import { appUrl } from '@/lib/config';
import { inviteShopper, shopperAlertsOn } from '@/lib/m91';
import { confirmText, inWindow, sendFree } from '@/lib/wa-session';

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
  // A shopper who already linked Telegram gets every alert there; ticking the box links it for the first time.
  const linkedChat = telegramBot() ? chatFor(uid) : null;
  const wantTelegram = (b.telegram === true || !!linkedChat) && !!telegramBot();
  if (wantTelegram) channels.push('telegram');
  // "Ring my phone": M91 alerts the shopper's own number once they accept DealRadar's invite in the M91 app.
  // Its own number: the "most urgent" ring need not go to the WhatsApp number.
  let m91Phone = typeof b.m91_phone === 'string' ? b.m91_phone.replace(/\D/g, '') : '';
  if (m91Phone.length === 10) m91Phone = '91' + m91Phone;
  const wantM91 = b.m91 === true && shopperAlertsOn();
  if (wantM91 && !m91Phone) m91Phone = phone;
  if (wantM91 && !m91Phone) return NextResponse.json({ error: 'Enter the mobile number to ring for the most urgent alert.' }, { status: 400 });
  if (wantM91 && (m91Phone.length < 11 || m91Phone.length > 15)) return NextResponse.json({ error: 'Enter the mobile number with country code.' }, { status: 400 });
  if (wantM91) channels.push('m91');

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  if (phone && (phone.length < 11 || phone.length > 15)) return NextResponse.json({ error: 'Enter the WhatsApp number with country code.' }, { status: 400 });
  // Alerts only go to addresses this account proved it owns. A phone needs its WhatsApp code first; an email new
  // to the account waits (pending) until the link in its confirmation email is clicked.
  if (phone && !isVerified(uid, 'phone', phone)) return NextResponse.json({ error: 'Verify this WhatsApp number first: tap “Send code” next to it on DealRadar.', verify: 'phone' }, { status: 400 });
  if (wantM91 && !isVerified(uid, 'phone', m91Phone)) return NextResponse.json({ error: 'Verify the number to ring first: tap “Send code” next to it on DealRadar.', verify: 'm91' }, { status: 400 });
  let emailPending = false;
  if (email && !isVerified(uid, 'email', email)) {
    // An address that said "stop" or "this wasn't me" can only be added back by its owner.
    if (isBlocked('email', email) && currentUser()?.email !== email) return NextResponse.json({ error: 'This email has turned off DealRadar alerts. Its owner can turn them back on by signing in with it.' }, { status: 400 });
    if (limited(`confirm:${email}`)) return NextResponse.json({ error: 'We just sent a confirmation link to this email — open it, or try again in an hour.' }, { status: 429 });
    channels.splice(channels.indexOf('email'), 1);
    emailPending = true;
  }
  if (!channels.length && !emailPending) return NextResponse.json({ error: 'Add an email, a WhatsApp number or choose Telegram to be alerted.' }, { status: 400 });

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
    telegram_chat: wantTelegram ? linkedChat : null,
    m91_phone: wantM91 ? m91Phone : null,
    ...(emailPending ? { pending: ['email' as Channel] } : {}),
  });
  // Confirm straight away by email and on Telegram (when the shopper's chat is already linked);
  // the reply does not wait for the messages to be sent.
  if (email) {
    const { subject, html } = emailPending ? confirmEmailRequest(alert, product, emailConfirmLink(uid, email)) : confirmationEmail(alert, product);
    queueMail(email, subject, html);
  }
  let telegram: { code: string; link: string } | null = null;
  if (wantTelegram && alert.telegram_chat) {
    const t = confirmationTelegram(alert, product);
    queueTelegram(alert.telegram_chat, t.text, t.url, t.image, t.label, t.stop);
  } else if (wantTelegram) telegram = codeAndLink(uid);
  // Inside WhatsApp's 24-hour window (the shopper messaged DealRadar's number), the confirmation goes out at once in
  // DealRadar's own format; otherwise through the template or viaSocket's WhatsApp.
  let whatsappConfirm = false;
  if (phone && inWindow(phone)) {
    whatsappConfirm = true;
    sendFree(phone, confirmText(alert, product)).catch((e) => console.error('[wa] confirmation failed:', e instanceof Error ? e.message : e));
  } else if (phone) whatsappConfirm = queueWhatsAppConfirmation(alert, product, read((d) => d.settings));
  // The invite is what lets M91 reach this number; asking again for a number already invited is harmless.
  let m91: { state: string; reachable: boolean } | null = null;
  if (wantM91) m91 = await inviteShopper(m91Phone).catch((e) => (console.error('[m91] invite failed:', e instanceof Error ? e.message : e), null));
  if (email || alert.telegram_chat || whatsappConfirm) sendQueuedMailNow().catch((e) => console.error('confirmation:', e instanceof Error ? e.message : e));
  return NextResponse.json({ alert, confirmation: !!email && !emailPending, email_pending: emailPending, whatsapp_confirmation: whatsappConfirm, m91: m91 ? { reachable: m91.reachable, state: m91.state } : wantM91 ? { reachable: false, state: 'error' } : null, telegram_link: telegram?.link ?? null, telegram_code: telegram?.code ?? null, telegram_linked: !!alert.telegram_chat });
}

// The shopper's alerts with the product each one watches, and the contact they used last, so the
// browser extension can list them and set the next alert in one tap.
export async function GET() {
  const uid = currentUid();
  const { alerts, products } = read((d) => {
    const alerts = Object.values(d.alerts)
      .filter((a) => a.uid === uid)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { alerts, products: Object.fromEntries(alerts.map((a) => [a.product_id, d.products[a.product_id]])) };
  });
  const items = alerts.map((a) => {
    const p = products[a.product_id];
    return { ...a, product: p ? { title: p.title, image: p.image, price: p.price, store: PLATFORM_NAMES[p.platform], page: `${appUrl()}/p/${p.id}` } : null };
  });
  const last = alerts[0];
  const contact = { email: last?.email ?? currentUser()?.email ?? null, phone: last?.phone ?? null, telegram: !!last?.channels.includes('telegram'), m91_phone: last?.m91_phone ?? null };
  // Whether the "most urgent" ring is on, so the extension can offer it.
  return NextResponse.json({ alerts: items, contact, m91: shopperAlertsOn(), verified: verifiedList(uid) });
}
