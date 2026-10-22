import 'server-only';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { newId, read, write, type User } from './db';
import { derivedKey, safeEqual } from './viasocket';
import { appUrl } from './config';

export const SESSION_COOKIE = 'dr_session';
export const ANON_COOKIE = 'dr_uid';
const SESSION_DAYS = 30;

// ---------- passwords ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64url'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- sessions (stateless, HMAC-signed) ----------

function sign(payload: string) {
  return crypto.createHmac('sha256', derivedKey('session')).update(payload).digest('base64url');
}

export function setSession(res: NextResponse, userId: string, secure: boolean) {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${userId}.${exp}`;
  res.cookies.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_DAYS * 86400 });
}

export function clearSession(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE);
}

export function currentUser(): User | null {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, sig] = raw.split('.');
  if (!id || !exp || !sig || !safeEqual(sig, sign(`${id}.${exp}`)) || Number(exp) < Date.now()) return null;
  const user = read((d) => d.users[id] ?? null);
  // Anyone listed in ADMIN_EMAILS is an owner too, including accounts made before they were listed.
  return user && user.role !== 'owner' && ownerEmails().includes(user.email) ? { ...user, role: 'owner' } : user;
}

export function isOwner(): boolean {
  return currentUser()?.role === 'owner';
}

// The id alerts, cart and enquiries are stored under: the account when signed in, else the browser.
export function viewerUid(): string {
  return currentUser()?.id ?? cookies().get(ANON_COOKIE)?.value ?? '';
}

export function currentUid(): string {
  const uid = viewerUid();
  if (!uid) throw new Error('missing session');
  return uid;
}

// ---------- accounts ----------

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200;

function ownerEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean);
}

// The first account becomes the owner, unless ADMIN_EMAILS names who the owners are.
function roleFor(email: string, d: { users: Record<string, User> }): User['role'] {
  const listed = ownerEmails();
  if (listed.length) return listed.includes(email) ? 'owner' : 'user';
  return Object.keys(d.users).length === 0 ? 'owner' : 'user';
}

export function findUserByEmail(email: string): User | null {
  return read((d) => Object.values(d.users).find((u) => u.email === email) ?? null);
}

export function createUser(input: { email: string; name: string; password_hash: string | null; google_sub: string | null }): User {
  return write((d) => {
    const user: User = { id: newId('u'), ...input, role: roleFor(input.email, d), created_at: new Date().toISOString() };
    d.users[user.id] = user;
    return user;
  });
}

export function linkGoogle(userId: string, sub: string) {
  write((d) => {
    if (d.users[userId]) d.users[userId].google_sub = sub;
  });
}

export function findUserByGoogle(sub: string): User | null {
  return read((d) => Object.values(d.users).find((u) => u.google_sub === sub) ?? null);
}

// What a visitor did before signing in moves to their account.
export function mergeAnonymous(anonUid: string | undefined, userId: string) {
  if (!anonUid || anonUid === userId) return;
  write((d) => {
    for (const a of Object.values(d.alerts)) if (a.uid === anonUid) a.uid = userId;
    for (const e of d.enquiries) if (e.uid === anonUid) e.uid = userId;
    const owned = new Set(Object.values(d.cart).filter((c) => c.uid === userId).map((c) => c.product_id));
    for (const c of Object.values(d.cart)) {
      if (c.uid !== anonUid) continue;
      if (owned.has(c.product_id)) delete d.cart[c.id];
      else c.uid = userId;
    }
  });
}

// ---------- password reset ----------
// A signed link valid for an hour. It also signs part of the current password hash, so it stops
// working once the password has been changed — each link resets the password at most once.

const RESET_MS = 60 * 60_000;
const resetSig = (u: User, exp: number) =>
  crypto.createHmac('sha256', derivedKey('reset')).update(`${u.id}.${exp}.${(u.password_hash ?? 'none').slice(-16)}`).digest('base64url');

export function resetToken(u: User): string {
  const exp = Date.now() + RESET_MS;
  return `${u.id}.${exp}.${resetSig(u, exp)}`;
}

export function userForResetToken(token: string): User | null {
  const [id, expRaw, sig] = String(token).split('.');
  const exp = Number(expRaw);
  if (!id || !sig || !Number.isFinite(exp) || exp < Date.now()) return null;
  const user = read((d) => d.users[id] ?? null);
  return user && safeEqual(sig, resetSig(user, exp)) ? user : null;
}

export function setPassword(userId: string, password: string) {
  write((d) => {
    if (d.users[userId]) d.users[userId].password_hash = hashPassword(password);
  });
}

// ---------- brute-force protection ----------

const attempts = new Map<string, { n: number; until: number }>();

export function tooManyAttempts(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.n >= 8 && a.until > Date.now();
}

export function recordFailure(key: string) {
  const a = attempts.get(key);
  const fresh = !a || a.until < Date.now();
  attempts.set(key, { n: fresh ? 1 : a!.n + 1, until: Date.now() + 15 * 60_000 });
}

export function clearFailures(key: string) {
  attempts.delete(key);
}

// ---------- redirects ----------

export function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

// ---------- Google ----------

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const googleRedirectUri = () => `${appUrl()}/api/auth/google/callback`;
