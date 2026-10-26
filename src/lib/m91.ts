import 'server-only';

// M91 rings a person's phone at full volume, through silent mode, until somebody answers.
// Two credentials, both kept in the environment like the project's other secrets:
// - M91_SEND_LINK: the "DealRadar Ops" channel's send link — the owner's team, woken when something breaks.
// - M91_API_KEY:   alerts a shopper directly by their own phone number, once they accept DealRadar's invite.
// The send link carries its token in the URL, so neither the link nor a request path is ever logged.

const API = 'https://m91-api.msg91.com/api/v1';

export const M91_APP = {
  ios: 'https://apps.apple.com/app/id6759090472',
  android: 'https://play.google.com/store/apps/details?id=com.msg91.m91',
};

type Option = { label: string; effect: 'SHARED' | 'PERSONAL' };
export interface M91Alert {
  title: string;
  description?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  customId?: string;
  responseOptions: Option[];
  isAutoClose?: boolean;
  attachments?: string[];
}
export interface M91Sent {
  _id: string;
  delivered: number;
  deduplicated?: boolean;
  reopened?: boolean;
  unregistered?: string[];
}

export class M91Error extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// A link pasted as "…?title=…" would raise an alert on every check: only the part before "?" is kept.
const sendLink = () => (process.env.M91_SEND_LINK || '').trim().split('?')[0].replace(/\/$/, '') || null;
const apiKey = () => (process.env.M91_API_KEY || '').trim() || null;

export const teamAlertsOn = () => !!sendLink();
export const shopperAlertsOn = () => !!apiKey();

// Every answer is { success, data } or { success: false, error: { code, message } }.
async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new M91Error(res.status, String(body?.error?.code || res.status), String(body?.error?.message || `M91 answered ${res.status}`));
  }
  return body.data as T;
}

const post = <T>(url: string, body: unknown, headers?: Record<string, string>) => call<T>(url, { method: 'POST', body: JSON.stringify(body), headers });
const auth = () => ({ Authorization: `Bearer ${apiKey()}` });

// --- The owner's team (send link) ---

// Raises nothing: the channel's name, to show the link is live.
export async function teamChannel(): Promise<{ name: string }> {
  const link = sendLink();
  if (!link) throw new Error('M91 is not set up.');
  const d = await call<{ channel: { name: string } }>(link);
  return { name: d.channel.name };
}

export async function alertTeam(a: M91Alert): Promise<M91Sent | null> {
  const link = sendLink();
  if (!link) return null;
  return post<M91Sent>(link, a);
}

// Closing re-arms the condition. 404 (nothing matches) and 403 (already closed) both mean nothing was open.
export async function closeTeam(customId: string): Promise<void> {
  const link = sendLink();
  if (!link) return;
  try {
    await post(`${link}/close`, { customId });
  } catch (e) {
    if (e instanceof M91Error && (e.status === 404 || e.status === 403)) return;
    throw e;
  }
}

// --- Shoppers, by their own phone number (API key) ---

// Invites the shopper; until they accept in the M91 app nothing can reach them. Asking again is harmless
// and tells whether they have accepted yet.
export async function inviteShopper(phone: string): Promise<{ state: 'pending' | 'accepted' | 'declined'; reachable: boolean }> {
  return post(`${API}/recipients`, { phone, label: 'DealRadar price alerts' }, auth());
}

export async function alertShopper(phone: string, a: M91Alert): Promise<M91Sent> {
  return post<M91Sent>(`${API}/alerts`, { ...a, phone }, auth());
}

export async function apiKeyOwner(): Promise<{ phone: string }> {
  const d = await call<{ owner: { phone: string } }>(`${API}/me`, { headers: auth() });
  return d.owner;
}
