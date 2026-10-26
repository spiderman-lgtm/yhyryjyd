import 'server-only';
import { read, write, type Tier } from './db';
import { alertTeam, closeTeam, teamAlertsOn, type M91Alert } from './m91';

// The moments the owner's team is woken for. Each is a named condition with its own customId: it rings once
// while it lasts, and closing it when it clears is what lets it ring again next time.

const handle = [
  { label: "I'll handle it", effect: 'SHARED' as const },
  { label: 'Seen', effect: 'PERSONAL' as const },
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

async function raise(customId: string, a: Omit<M91Alert, 'customId' | 'responseOptions'>) {
  if (!teamAlertsOn() || isOpen(customId)) return;
  try {
    const sent = await alertTeam({ ...a, customId, responseOptions: handle });
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
      });
  }
}

// The watchdog runs inside the server, so it notices a schedule that stopped calling in. It is started by the
// first page or scheduled run (in the app's own module graph, so it shares the one in-memory database).
let started = false;
export function startOpsWatchdog() {
  if (started) return;
  started = true;
  setInterval(() => void checkPriceChecksRunning().catch(() => null), 5 * 60_000).unref();
}
