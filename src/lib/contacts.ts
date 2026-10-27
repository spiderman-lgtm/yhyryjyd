import 'server-only';
import crypto from 'crypto';
import { read, write } from './db';
import { appUrl } from './config';
import { WHATSAPP_NOTIFY, derivedKey, runOperatorAction, safeEqual } from './viasocket';

// Proof that an email or phone belongs to the account using it, before DealRadar sends it anything; a block list
// for addresses that said "stop" or "this wasn't me"; magic links to manage alerts without signing in; limits.

export type Kind = 'email' | 'phone';
export const normEmail = (e: string) => e.trim().toLowerCase();
// Digits with the country code, no "+": a bare 10-digit number is Indian.
export function normPhone(p: string) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? '91' + d : d;
}
export const validPhone = (p: string) => p.length >= 11 && p.length <= 15;
const key = (kind: Kind, value: string) => `${kind}:${value}`;

export function isVerified(uid: string, kind: Kind, value: string): boolean {
  return read((d) => (kind === 'email' ? d.users[uid]?.verified?.emails : d.users[uid]?.verified?.phones)?.includes(value) ?? false);
}

export function verifiedList(uid: string): { emails: string[]; phones: string[] } {
  const v = read((d) => d.users[uid]?.verified);
  return { emails: v?.emails ?? [], phones: v?.phones ?? [] };
}

// One account owns a verified address: proving it here takes it from any other account, whose alerts stop using
// it. Proving it also lifts a block, since the owner asked for it.
export function markVerified(uid: string, kind: Kind, value: string) {
  write((d) => {
    const c = (d.contacts ??= {});
    const owner = (c.owner ??= {});
    const prev = owner[key(kind, value)];
    if (prev && prev !== uid && d.users[prev]) {
      const v = d.users[prev].verified ?? {};
      if (kind === 'email') v.emails = (v.emails ?? []).filter((x) => x !== value);
      else v.phones = (v.phones ?? []).filter((x) => x !== value);
      for (const a of Object.values(d.alerts)) {
        if (a.uid !== prev || a.status !== 'active') continue;
        const drop = (ch: 'email' | 'whatsapp' | 'm91') => {
          a.channels = a.channels.filter((x) => x !== ch);
          a.stopped = [...new Set([...(a.stopped ?? []), ch])];
        };
        if (kind === 'email' && a.email === value) drop('email');
        if (kind === 'phone' && a.phone === value) drop('whatsapp');
        if (kind === 'phone' && (a.m91_phone || a.phone) === value && a.channels.includes('m91')) drop('m91');
        if (!a.channels.length) a.status = 'cancelled';
      }
    }
    owner[key(kind, value)] = uid;
    if (c.blocked) delete c.blocked[key(kind, value)];
    const u = d.users[uid];
    if (u) {
      const v = (u.verified ??= {});
      if (kind === 'email') v.emails = [...new Set([...(v.emails ?? []), value])];
      else v.phones = [...new Set([...(v.phones ?? []), value])];
    }
  });
}

// --- Block list ---

export function isBlocked(kind: Kind, value: string) {
  return read((d) => !!d.contacts?.blocked?.[key(kind, value)]);
}

// "Stop everything" / "This wasn't me": no more alerts to this address from any account until its owner proves it.
export function block(kind: Kind, value: string, reason: string) {
  write((d) => {
    const c = (d.contacts ??= {});
    (c.blocked ??= {})[key(kind, value)] = { at: new Date().toISOString(), reason };
    for (const a of Object.values(d.alerts)) {
      if (a.status !== 'active') continue;
      const hit = (ch: 'email' | 'whatsapp' | 'm91') => {
        a.channels = a.channels.filter((x) => x !== ch);
        a.stopped = [...new Set([...(a.stopped ?? []), ch])];
      };
      if (kind === 'email' && a.email === value) hit('email');
      if (kind === 'phone' && a.phone === value) hit('whatsapp');
      if (kind === 'phone' && (a.m91_phone || a.phone) === value) hit('m91');
      if (!a.channels.length) a.status = 'cancelled';
    }
    // Whoever had proved it no longer owns it.
    if (c.owner) delete c.owner[key(kind, value)];
    for (const u of Object.values(d.users)) {
      if (kind === 'email' && u.verified?.emails?.includes(value)) u.verified.emails = u.verified.emails.filter((x) => x !== value);
      if (kind === 'phone' && u.verified?.phones?.includes(value)) u.verified.phones = u.verified.phones.filter((x) => x !== value);
    }
  });
}

// --- Magic links: manage the alerts sent to one address, without signing in ---

const sig = (kind: Kind, value: string) => crypto.createHmac('sha256', derivedKey('manage')).update(key(kind, value)).digest('base64url').slice(0, 24);
export const manageLink = (kind: Kind, value: string) => `${appUrl()}/manage?k=${kind}&v=${encodeURIComponent(value)}&t=${sig(kind, value)}`;
export const manageOk = (kind: string, value: string, t: string) => (kind === 'email' || kind === 'phone') && !!value && safeEqual(t || '', sig(kind, value));

// Email confirmation: proves the inbox belongs to the account that set the alert. Valid for 3 days.
export function emailConfirmLink(uid: string, email: string) {
  const exp = Date.now() + 3 * 86400_000;
  const payload = `${uid}|${email}|${exp}`;
  const s = crypto.createHmac('sha256', derivedKey('email-confirm')).update(payload).digest('base64url');
  return `${appUrl()}/api/verify/email?p=${encodeURIComponent(Buffer.from(payload).toString('base64url'))}&s=${s}`;
}
export function readEmailConfirm(p: string, s: string): { uid: string; email: string } | null {
  let payload = '';
  try {
    payload = Buffer.from(p, 'base64url').toString();
  } catch {
    return null;
  }
  const want = crypto.createHmac('sha256', derivedKey('email-confirm')).update(payload).digest('base64url');
  const [uid, email, exp] = payload.split('|');
  if (!uid || !email || !safeEqual(s || '', want) || Number(exp) < Date.now()) return null;
  return { uid, email };
}

// --- WhatsApp codes ---

const RATE_WINDOW_MS = 3600_000;
const RATE_MAX = 3;
const attempts = new Map<string, number[]>();
// At most 3 codes an hour for one number, and 3 an hour from one address on the internet; also used for
// confirmation emails to one address.
export function limited(id: string) {
  const now = Date.now();
  const list = (attempts.get(id) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) return true;
  list.push(now);
  attempts.set(id, list);
  return false;
}

const hashCode = (phone: string, code: string) => crypto.createHmac('sha256', derivedKey('otp')).update(`${phone}:${code}`).digest('base64url');

export async function sendPhoneCode(uid: string, phone: string, ip: string): Promise<{ ok: true } | { error: string }> {
  if (limited(`p:${phone}`) || limited(`ip:${ip}`)) return { error: 'Too many codes asked for. Try again in an hour.' };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  write((d) => {
    ((d.contacts ??= {}).codes ??= {})[phone] = { hash: hashCode(phone, code), uid, exp: Date.now() + 10 * 60_000, tries: 0 };
  });
  await runOperatorAction(WHATSAPP_NOTIFY.service_id, 'NoAuth', WHATSAPP_NOTIFY.send_notification.action_version_id, {
    to: phone,
    title: 'DealRadar verification code',
    summary: `Your DealRadar code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this message — nothing will be sent to you.`,
  });
  return { ok: true };
}

export function checkPhoneCode(uid: string, phone: string, code: string): { ok: true } | { error: string } {
  const res = write((d) => {
    const c = d.contacts?.codes?.[phone];
    if (!c || c.uid !== uid || c.exp < Date.now()) return 'expired';
    if (c.tries >= 5) return 'tries';
    c.tries++;
    if (!safeEqual(c.hash, hashCode(phone, String(code).trim()))) return 'wrong';
    delete d.contacts!.codes![phone];
    return 'ok';
  });
  if (res === 'ok') {
    markVerified(uid, 'phone', phone);
    return { ok: true };
  }
  return { error: res === 'wrong' ? 'That code is not right.' : res === 'tries' ? 'Too many wrong codes. Ask for a new one.' : 'The code has expired. Ask for a new one.' };
}

// --- Daily cap: at most 10 alert messages a day to one address ---

const DAILY_CAP = 10;
export function underDailyCap(addr: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  return write((d) => {
    const s = ((d.contacts ??= {}).sent ??= {});
    const row = s[addr];
    if (!row || row.day !== day) s[addr] = { day, n: 0 };
    if (s[addr].n >= DAILY_CAP) return false;
    s[addr].n++;
    return true;
  });
}
