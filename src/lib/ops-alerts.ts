import 'server-only';
import { read, write, type Tier } from './db';
import { alertTeam, closeTeam, teamAlertsOn, type M91Alert } from './m91';
import { appUrl } from './config';
import { derivedKey } from './viasocket';

// The moments the owner's team is woken for. Each is a named condition with its own customId: it rings once
// while it lasts, and closing it when it clears is what lets it ring again next time.

type Options = M91Alert['responseOptions'];
const answers = (take: string): Options => [
  { label: take, effect: 'SHARED' },
  { label: 'Seen', effect: 'PERSONAL' },
];

const isOpen = (id: string) => read((d) => (d.settings.ops?.open ?? []).includes(id));
const setOpen = (id: string, open: boolean) =>
  write((d) => {
    const ops = (d.settings.ops ??= {});
    const list = new Set(ops.open ?? []);
    if (open) list.add(id);
    else list.delete(id);
    ops.open = [...list];
  });

async function raise(customId: string, a: Omit<M91Alert, 'customId'>) {
  if (!teamAlertsOn() || isOpen(customId)) return;
  try {
    const sent = await alertTeam({ ...a, customId });
    setOpen(customId, true);
    if (sent && !sent.deduplicated && sent.delivered === 0) console.error(`[m91] "${customId}" reached nobody: nobody in the channel has accepted M91 yet`);
  } catch (e) {
    console.error(`[m91] could not raise "${customId}":`, e instanceof Error ? e.message : e);
  }
}

async function clear(customId: string) {
  if (!teamAlertsOn() || !isOpen(customId)) return;
  try {
    await closeTeam(customId);
    setOpen(customId, false);
  } catch (e) {
    console.error(`[m91] could not close "${customId}":`, e instanceof Error ? e.message : e);
  }
}

// 1. The 15-minute price check has stopped running, so shoppers' alerts have stopped.
const STOPPED_AFTER_MS = 45 * 60_000;
// A run recorded before this server started (or none yet, just after a release) is judged from the start.
const bootAt = Date.now();

export function noteRun(tier: Tier) {
  write((d) => {
    const ops = (d.settings.ops ??= {});
    (ops.last_run ??= {})[tier] = new Date().toISOString();
  });
  if (tier === 'urgent') void clear('price-checks-stopped');
}

export async function checkPriceChecksRunning() {
  const s = read((d) => d.settings);
  if (!s.flows_activated_at) return;
  const last = Math.max(Date.parse(s.ops?.last_run?.urgent ?? s.flows_activated_at), bootAt);
  if (Date.now() - last < STOPPED_AFTER_MS) return;
  const mins = Math.round((Date.now() - last) / 60_000);
  await raise('price-checks-stopped', {
    title: `DealRadar price checks stopped ${mins} minutes ago`,
    description: 'Shoppers are not getting price-drop alerts. Open DealRadar Admin → Automation and check the "Instant" price check in viaSocket.',
    severity: 'HIGH',
    responseOptions: answers("I'll handle it"),
  });
}

// 2. Alerts to shoppers keep failing on one channel (an expired Gmail, WhatsApp or Telegram connection, usually).
const NAMES: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', telegram: 'Telegram' };

export async function noteDeliveries(results: Record<string, { ok: boolean }[]>) {
  for (const [channel, list] of Object.entries(results)) {
    if (!list.length) continue;
    const anyOk = list.some((x) => x.ok);
    const streak = write((d) => {
      const ops = (d.settings.ops ??= {});
      const s = (ops.delivery_streak ??= {});
      s[channel] = anyOk ? 0 : (s[channel] ?? 0) + 1;
      return s[channel];
    });
    const id = `delivery-failing-${channel}`;
    if (anyOk) await clear(id);
    else if (streak >= 3)
      await raise(id, {
        title: `DealRadar ${NAMES[channel] ?? channel} alerts are failing`,
        description: `The last ${streak} tries to send ${NAMES[channel] ?? channel} messages to shoppers all failed. Open DealRadar Admin and reconnect ${NAMES[channel] ?? channel}.`,
        severity: 'HIGH',
        responseOptions: answers("I'll reconnect"),
      });
  }
}

// 3. A store has refused every price read (a robot check, usually) for 2 hours.
const BLOCKED_AFTER_MS = 2 * 3600_000;

export async function noteStoreReads(byStore: Record<string, { ok: number; failed: number }>) {
  for (const [store, r] of Object.entries(byStore)) {
    const id = `store-blocked-${store.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (r.ok > 0) {
      write((d) => void delete d.settings.ops?.store_failing_since?.[store]);
      await clear(id);
      continue;
    }
    if (!r.failed) continue;
    const since = write((d) => {
      const f = ((d.settings.ops ??= {}).store_failing_since ??= {});
      return (f[store] ??= new Date().toISOString());
    });
    if (Date.now() - Date.parse(since) >= BLOCKED_AFTER_MS)
      await raise(id, {
        title: `${store} is blocking DealRadar's price checks`,
        description: `Every ${store} price read since ${new Date(since).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST has failed, so ${store} prices and alerts are stale.`,
        severity: 'MEDIUM',
        responseOptions: answers("I'll look"),
      });
  }
}

// Moments the owner acts on in Admin. Each rings once; answering closes it, and so does handling it in Admin.
// They go straight to M91: a customId that is still open is not rung again.
async function ask(a: M91Alert) {
  if (!teamAlertsOn()) return;
  try {
    const sent = await alertTeam(a);
    if (sent && !sent.deduplicated && sent.delivered === 0) console.error(`[m91] "${a.customId}" reached nobody`);
  } catch (e) {
    console.error(`[m91] could not raise "${a.customId}":`, e instanceof Error ? e.message : e);
  }
}

// 4. A shopper asked about a product.
export function askEnquiry(e: { id: string; name: string; email: string; phone: string | null; budget: number | null; message: string }, product: string) {
  return ask({
    title: `New enquiry from ${e.name} about ${product.slice(0, 80)}`,
    description: [e.message || '(no message)', `Reply to: ${e.email}${e.phone ? ` · ${e.phone}` : ''}`, e.budget ? `Budget: ₹${e.budget.toLocaleString('en-IN')}` : ''].filter(Boolean).join('\n'),
    severity: 'LOW',
    customId: `enquiry-${e.id}`,
    responseOptions: answers("I'll reply"),
    isAutoClose: true,
  });
}

// 5. A shopper suggested a coupon: Approve or Reject on the phone publishes or drops it (see /api/m91/callback).
export const m91CallbackKey = () => derivedKey('m91-callback');

export function askCoupon(s: { id: string; store: string; title: string; code: string | null; discount_text: string; url: string }) {
  return ask({
    title: `Coupon suggested for ${s.store}: ${s.code || s.title}`.slice(0, 200),
    description: `${s.title}${s.discount_text ? ` — ${s.discount_text}` : ''}\nOffer: ${s.url}\nApprove publishes it on DealRadar's Coupons page.`,
    severity: 'LOW',
    customId: `coupon-${s.id}`,
    responseOptions: [
      { label: 'Approve', effect: 'SHARED' },
      { label: 'Reject', effect: 'SHARED' },
    ],
    isAutoClose: true,
    callbackUrl: `${appUrl()}/api/m91/callback?k=${m91CallbackKey()}`,
  });
}

// 6. The stores' own offer pages added offers that wait for approval.
export function askOffers(added: number, waiting: number) {
  return ask({
    title: `${added} new store offer${added === 1 ? '' : 's'} waiting for approval`,
    description: `${waiting} in all are waiting in DealRadar Admin → Coupons.`,
    severity: 'LOW',
    customId: 'offers-waiting',
    responseOptions: [
      { label: 'Review now', effect: 'SHARED' },
      { label: 'Later', effect: 'PERSONAL' },
    ],
    isAutoClose: true,
  });
}

// Handled in Admin: its alert has nothing left to ask.
export async function closeAsked(customId: string) {
  if (!teamAlertsOn()) return;
  await closeTeam(customId).catch((e) => console.error(`[m91] could not close "${customId}":`, e instanceof Error ? e.message : e));
}

// The watchdog runs inside the server, so it notices a schedule that stopped calling in. It is started by the
// first page or scheduled run (in the app's own module graph, so it shares the one in-memory database).
let started = false;
export function startOpsWatchdog() {
  if (started) return;
  started = true;
  setInterval(() => void checkPriceChecksRunning().catch(() => null), 5 * 60_000).unref();
}
