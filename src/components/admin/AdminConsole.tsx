'use client';

import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeliveryLog, Enquiry, Settings, WhatsAppVarSource } from '@/lib/db';

type AppKey = 'gmail' | 'whatsapp' | 'telegram';
interface AppInfo {
  service_id: string;
  name: string;
  icon: string;
  send_email?: { action_id: string };
  send_template?: { action_id: string };
  send_message?: { action_id: string };
}
interface FlowRow {
  tier: string;
  label: string;
  every: string;
  id: string | null;
  status: string | null;
  counts: { successCount: number; failedCount: number } | null;
}
type Option = { label: string; value: string };

declare global {
  interface Window {
    openViasocketConnection?: (token: string, serviceId: string, opts: Record<string, unknown>) => void;
    viaSocket?: { mount: (o: Record<string, unknown>) => { on: (ev: string, cb: (f: any) => void) => void; unmount?: () => void } };
  }
}

const VAR_SOURCES: { v: WhatsAppVarSource; t: string }[] = [
  { v: 'product_title', t: 'Product name' },
  { v: 'price', t: 'New price' },
  { v: 'old_price', t: 'Old price' },
  { v: 'drop_percent', t: 'Drop %' },
  { v: 'coupon', t: 'Best coupon' },
  { v: 'buy_link', t: 'Buy link' },
];

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function useOptions(app: AppKey, fieldKey: string, existingFields: Record<string, unknown>, enabled: boolean) {
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const deps = JSON.stringify(existingFields);
  useEffect(() => {
    if (!enabled) return setOptions([]);
    setLoading(true);
    setError('');
    post('/api/admin/options', { app, fieldKey, existingFields: JSON.parse(deps) })
      .then((d) => setOptions(d.options || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [app, fieldKey, deps, enabled]);
  return { options, error, loading };
}

function Picker(props: { id: string; label: string; hint: string; app: AppKey; fieldKey: string; existing: Record<string, unknown>; enabled: boolean; value: string | null; onChange: (v: string | null) => void; optional?: boolean }) {
  const { options, error, loading } = useOptions(props.app, props.fieldKey, props.existing, props.enabled);
  return (
    <div>
      <label className="label" htmlFor={props.id}>{props.label}</label>
      <select id={props.id} className="input" disabled={!props.enabled || loading} value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || null)}>
        <option value="">{loading ? 'Loading…' : props.optional ? '— default —' : '— choose —'}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className="mt-1 text-xs text-ink-mute">{error ? <span className="text-red-600">{error}</span> : props.hint}</p>
    </div>
  );
}

export default function AdminConsole(props: {
  apps: Record<AppKey, AppInfo>;
  settings: Settings;
  expired: Record<AppKey, boolean>;
  connError: string;
  flows: FlowRow[];
  stats: { products: number; activeAlerts: number; byTier: number[]; clicks7d: number; cartItems: number };
  enquiries: (Enquiry & { product: string })[];
  deliveries: DeliveryLog[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { apps, settings } = props;
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const pendingApp = useRef<AppKey | null>(null);

  const [from, setFrom] = useState<string | null>(settings.gmail?.from ?? null);
  const wa0 = settings.whatsapp;
  const [wbaId, setWbaId] = useState<string | null>(wa0?.wba_id ?? null);
  const [phoneId, setPhoneId] = useState<string | null>(wa0?.phone_id ?? null);
  const [templateId, setTemplateId] = useState<string | null>(wa0?.message_template_id ?? null);
  const [varMap, setVarMap] = useState<Record<string, WhatsAppVarSource>>(wa0?.variable_map ?? {});
  const [confirmTemplateId, setConfirmTemplateId] = useState<string | null>(wa0?.confirm_template_id ?? null);
  const [confirmVarMap, setConfirmVarMap] = useState<Record<string, WhatsAppVarSource>>(wa0?.confirm_variable_map ?? {});
  const [bot, setBot] = useState(settings.telegram?.bot ?? '');

  const embedBox = useRef<HTMLDivElement>(null);
  const [embedOpen, setEmbedOpen] = useState<null | { flowId?: string }>(null);
  const [embedReady, setEmbedReady] = useState(false);

  useEffect(() => {
    fetch('/api/admin/token').then((r) => r.json()).then((d) => setToken(d.token ?? null));
  }, []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const type = event.data?.type;
      if (type === 'viasocket_connection_success' && pendingApp.current) {
        const app = pendingApp.current;
        pendingApp.current = null;
        try {
          const r = await post('/api/admin/connected', { app, authId: event.data.data.id });
          setMsg(r?.schedules?.ok === false ? `${apps[app].name} connected, but the price-alert schedule could not be updated: ${r.schedules.error}` : `${apps[app].name} connected.`);
          router.refresh();
        } catch (e) {
          setMsg(e instanceof Error ? e.message : String(e));
        }
      } else if (type === 'viasocket_connection_error') {
        setMsg(event.data.error?.message || 'Connection failed.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [apps, router]);

  // Called straight from the click, before any await, so the popup is not blocked.
  function connect(app: AppKey) {
    if (!token || !window.openViasocketConnection) return setMsg('Still loading — try again in a second.');
    const info = apps[app];
    const actionId = app === 'gmail' ? info.send_email!.action_id : app === 'telegram' ? info.send_message!.action_id : info.send_template!.action_id;
    const current = settings[app]?.auth_id;
    pendingApp.current = app;
    window.openViasocketConnection(token, info.service_id, {
      filteredActions: [actionId],
      skipActionSelection: true,
      ...(current && props.expired[app] ? { authId: current } : {}),
    });
  }

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>, done: string) => {
      setBusy(label);
      setMsg('');
      try {
        const r = (await fn()) as { schedules?: { ok: boolean; error?: string } | null } | undefined;
        setMsg(r?.schedules?.ok === false ? `${done} But the price-alert schedule could not be updated: ${r.schedules.error}` : done);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy('');
      }
    },
    [router],
  );

  useEffect(() => {
    if (!embedOpen || !embedReady || !token || !embedBox.current || !window.viaSocket) return;
    embedBox.current.innerHTML = '';
    const embed = window.viaSocket.mount({
      embedToken: token,
      parent: '#vs-embed',
      config: {},
      ...(embedOpen.flowId ? { open: { flowId: embedOpen.flowId } } : {}),
    });
    embed.on('flow', (f) => {
      if (f?.id && f?.status) post('/api/admin/flow-event', { id: f.id, status: f.status }).then(() => router.refresh()).catch(() => {});
    });
    return () => embed.unmount?.();
  }, [embedOpen, embedReady, token, router]);

  const waReady = !!(wbaId && phoneId && templateId);

  return (
    <div className="space-y-6">
      <Script id="viasocket-connect-script" src="https://flow.viasocket.com/connect.js" strategy="afterInteractive" />
      <Script src="https://embed.viasocket.com/prod-embedcomponent.js" strategy="afterInteractive" onReady={() => setEmbedReady(true)} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">DealRadar admin</h1>
        <button className="text-sm underline" onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => router.push('/'))}>Sign out</button>
      </div>

      {msg && <div className="rounded-xl bg-brand-light px-4 py-3 text-sm font-medium text-brand-dark">{msg}</div>}
      {props.connError && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">viaSocket: {props.connError}</div>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Products', props.stats.products],
          ['Active alerts', props.stats.activeAlerts],
          ['Instant / Regular / Digest', props.stats.byTier.join(' / ')],
          ['Buy clicks (7d)', props.stats.clicks7d],
          ['Cart items', props.stats.cartItems],
        ].map(([k, v]) => (
          <div key={k as string} className="card p-4">
            <div className="text-xs text-ink-mute">{k}</div>
            <div className="text-xl font-bold">{v}</div>
          </div>
        ))}
      </section>

      <section id="automation" className="card scroll-mt-20 space-y-4 p-5">
        <div>
          <h2 className="font-bold">1 · Gmail — sends price-drop emails</h2>
          <p className="text-sm text-ink-soft">Alerts go out from your own Gmail account. Shoppers never connect anything.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={settings.gmail && !props.expired.gmail ? 'btn-ghost' : 'btn-dark'} onClick={() => connect('gmail')}>
            <img src={apps.gmail.icon} alt="" width={20} height={20} />
            {settings.gmail ? (props.expired.gmail ? 'Reconnect Gmail (expired)' : 'Gmail connected · switch account') : 'Connect Gmail'}
          </button>
          {settings.gmail && <button className="text-sm text-red-600 underline" onClick={() => run('dg', () => post('/api/admin/settings', { disconnect: 'gmail' }), 'Gmail removed from DealRadar.')}>Remove</button>}
        </div>
        {settings.gmail && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${settings.mail_flow && !settings.mail_flow_error ? 'bg-deal-light text-deal' : 'bg-amber-50 text-amber-800'}`}>
            <span>
              {settings.mail_flow && !settings.mail_flow_error
                ? 'Instant emails: on ✓ — shoppers get their alert confirmation as soon as they tap Track price.'
                : `Instant emails: off — ${settings.mail_flow_error || 'not set up yet.'} Confirmations still go out with the next 15-minute check.`}
            </span>
            <button className="btn-ghost px-3 py-1.5" disabled={busy === 'test'} onClick={() => run('test', () => post('/api/admin/test-email', {}), 'Test email sent — check your inbox (and Spam) in a minute.')}>
              {busy === 'test' ? 'Sending…' : 'Send me a test email'}
            </button>
          </div>
        )}
        {settings.gmail && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Picker id="gm-from" label="Send from" hint="Which of your Gmail addresses or aliases the alerts come from." app="gmail" fieldKey="from" existing={{}} enabled value={from} onChange={setFrom} optional />
            <div className="flex items-end">
              <button className="btn-ghost" disabled={busy === 'gm'} onClick={() => run('gm', () => post('/api/admin/settings', { gmail: { from } }), 'Saved — price alerts use this from the next check.')}>Save</button>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-bold">2 · WhatsApp Business — sends price-drop WhatsApp messages</h2>
          <p className="text-sm text-ink-soft">
            Meta only lets a business start a WhatsApp chat with an approved template. Create a “price drop” template in WhatsApp Manager first, then pick it here and map its variables.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={settings.whatsapp && !props.expired.whatsapp ? 'btn-ghost' : 'btn-dark'} onClick={() => connect('whatsapp')}>
            <img src={apps.whatsapp.icon} alt="" width={20} height={20} />
            {settings.whatsapp ? (props.expired.whatsapp ? 'Reconnect WhatsApp (expired)' : 'WhatsApp connected · switch account') : 'Connect WhatsApp Business'}
          </button>
          {settings.whatsapp && <button className="text-sm text-red-600 underline" onClick={() => run('dw', () => post('/api/admin/settings', { disconnect: 'whatsapp' }), 'WhatsApp removed from DealRadar.')}>Remove</button>}
        </div>
        {settings.whatsapp && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Picker id="wa-wba" label="WhatsApp Business Account" hint="Your WABA for this business." app="whatsapp" fieldKey="wba_id" existing={{}} enabled value={wbaId}
                onChange={(v) => { setWbaId(v); setPhoneId(null); setTemplateId(null); setVarMap({}); }} />
              <Picker id="wa-phone" label="Send from number" hint="The business number shoppers will see." app="whatsapp" fieldKey="phone_id" existing={{ wba_id: wbaId }} enabled={!!wbaId} value={phoneId} onChange={setPhoneId} />
              <Picker id="wa-tpl" label="Message template" hint="An approved template for price-drop alerts." app="whatsapp" fieldKey="message_template_id" existing={{ wba_id: wbaId }} enabled={!!wbaId} value={templateId}
                onChange={(v) => { setTemplateId(v); setVarMap({}); }} />
            </div>
            {wbaId && templateId && <TemplateVars wbaId={wbaId} templateId={templateId} varMap={varMap} setVarMap={setVarMap} />}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 text-sm font-semibold">Confirmation message (optional)</div>
              <p className="mb-2 text-xs text-ink-soft">A second approved template, e.g. “✅ You are tracking {'{{1}}'} at {'{{2}}'} — we will message you when the price drops.” Sent the moment a shopper sets an alert with their number.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Picker id="wa-ctpl" label="Confirmation template" hint="Leave empty to skip WhatsApp confirmations." app="whatsapp" fieldKey="message_template_id" existing={{ wba_id: wbaId }} enabled={!!wbaId} value={confirmTemplateId}
                  onChange={(v) => { setConfirmTemplateId(v); setConfirmVarMap({}); }} optional />
              </div>
              {wbaId && confirmTemplateId && <div className="mt-3"><TemplateVars wbaId={wbaId} templateId={confirmTemplateId} varMap={confirmVarMap} setVarMap={setConfirmVarMap} /></div>}
            </div>
            <button className="btn-ghost" disabled={!waReady || busy === 'wa'}
              onClick={() => run('wa', () => post('/api/admin/settings', { whatsapp: { wba_id: wbaId, phone_id: phoneId, message_template_id: templateId, variable_map: varMap, confirm_template_id: confirmTemplateId, confirm_variable_map: confirmVarMap } }), 'Saved — price alerts use this from the next check.')}>
              Save WhatsApp setup
            </button>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-bold">3 · Telegram — sends alerts from your DealRadar bot</h2>
          <p className="text-sm text-ink-soft">
            Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">@BotFather</a> (name it “DealRadar”, set the ₹ logo as its picture with /setuserpic), then connect it here with its token.
            Shoppers tap “Open Telegram → Start” once, and get confirmations and price drops with the product photo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={settings.telegram && !props.expired.telegram ? 'btn-ghost' : 'btn-dark'} onClick={() => connect('telegram')}>
            <img src={apps.telegram.icon} alt="" width={20} height={20} className="rounded" />
            {settings.telegram ? (props.expired.telegram ? 'Reconnect Telegram (expired)' : 'Telegram bot connected · switch bot') : 'Connect Telegram bot'}
          </button>
          {settings.telegram && <button className="text-sm text-red-600 underline" onClick={() => run('dt', () => post('/api/admin/settings', { disconnect: 'telegram' }), 'Telegram removed from DealRadar.')}>Remove</button>}
        </div>
        {settings.telegram && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="label">Bot username</span>
                <input value={bot} onChange={(e) => setBot(e.target.value)} placeholder="DealRadarAlertsBot" className="input w-64" />
              </label>
              <button className="btn-ghost" disabled={busy === 'tg'} onClick={() => run('tg', () => post('/api/admin/settings', { telegram: { bot } }), 'Saved — shoppers can now choose Telegram for their alerts.')}>Save</button>
            </div>
            <div className={`rounded-xl px-4 py-3 text-sm ${settings.telegram.subscription && settings.telegram.bot && !settings.telegram.error ? 'bg-deal-light text-deal' : 'bg-amber-50 text-amber-800'}`}>
              {settings.telegram.error
                ? settings.telegram.error
                : !settings.telegram.bot
                  ? 'Add the bot username so shoppers can open your bot.'
                  : settings.telegram.subscription
                    ? `Telegram alerts: on ✓ — shoppers link their chat at t.me/${settings.telegram.bot}.`
                    : 'Not listening to the bot yet — connect it again.'}
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">4 · More automations</h2>
            <p className="text-sm text-ink-soft">Build your own flows across 2,300+ apps (Slack alert on new enquiries, Sheets export…).</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setEmbedOpen({})}>Browse apps</button>
            {embedOpen && <button className="btn-ghost" onClick={() => setEmbedOpen(null)}>Close</button>}
          </div>
        </div>
        {embedOpen && <div id="vs-embed" ref={embedBox} style={{ height: 680 }} className="overflow-hidden rounded-xl border border-slate-200" />}
      </section>

      {props.children}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-bold">Recent deliveries</h2>
          {props.deliveries.length === 0 && <p className="text-sm text-ink-mute">Nothing sent yet.</p>}
          <ul className="space-y-2 text-sm">
            {props.deliveries.map((d, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                <span>{new Date(d.at).toLocaleString('en-IN')} · {d.tier}</span>
                <span>
                  email {d.email.filter((x) => x.ok).length}/{d.email.length} · WhatsApp {d.whatsapp.filter((x) => x.ok).length}/{d.whatsapp.length}
                  {[...d.email, ...d.whatsapp].find((x) => x.error) && <span className="block text-xs text-red-600">{[...d.email, ...d.whatsapp].find((x) => x.error)!.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-bold">Enquiries</h2>
          {props.enquiries.length === 0 && <p className="text-sm text-ink-mute">No enquiries yet.</p>}
          <ul className="space-y-3 text-sm">
            {props.enquiries.map((e) => (
              <li key={e.id} className="border-b border-slate-100 pb-2">
                <div className="font-medium">{e.name} · <a className="underline" href={`mailto:${e.email}`}>{e.email}</a>{e.phone && ` · ${e.phone}`}</div>
                <div className="line-clamp-1 text-xs text-ink-mute">{e.product}{e.budget ? ` · budget ₹${e.budget}` : ''}</div>
                {e.message && <div className="text-ink-soft">{e.message}</div>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function TemplateVars({ wbaId, templateId, varMap, setVarMap }: { wbaId: string; templateId: string; varMap: Record<string, WhatsAppVarSource>; setVarMap: (m: Record<string, WhatsAppVarSource>) => void }) {
  const { options, error, loading } = useOptions('whatsapp', 'variables', { wba_id: wbaId, message_template_id: templateId }, true);
  if (loading) return <p className="text-sm text-ink-mute">Loading template variables…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!options.length) return <p className="text-sm text-ink-mute">This template has no variables.</p>;
  return (
    <div>
      <div className="label">Fill each template variable with</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <div key={o.value}>
            <label className="text-sm" htmlFor={`v-${o.value}`}>{o.label}</label>
            <select id={`v-${o.value}`} className="input" value={varMap[o.value] ?? ''} onChange={(e) => setVarMap({ ...varMap, [o.value]: e.target.value as WhatsAppVarSource })}>
              <option value="">— choose —</option>
              {VAR_SOURCES.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
