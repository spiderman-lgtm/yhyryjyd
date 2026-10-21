import 'server-only';
import { cookies } from 'next/headers';
import { derivedKey, safeEqual } from './viasocket';

export const UID_COOKIE = 'dr_uid';
export const ADMIN_COOKIE = 'dr_admin';

// Shoppers are anonymous: middleware gives each browser a random id cookie.
export function currentUid(): string {
  const uid = cookies().get(UID_COOKIE)?.value;
  if (!uid || !/^[a-f0-9-]{36}$/.test(uid)) throw new Error('missing session');
  return uid;
}

export function adminSessionValue() {
  return derivedKey(`admin:${process.env.ADMIN_KEY || ''}`);
}

export function isAdmin(): boolean {
  if (!process.env.ADMIN_KEY) return false;
  const v = cookies().get(ADMIN_COOKIE)?.value;
  return !!v && safeEqual(v, adminSessionValue());
}
