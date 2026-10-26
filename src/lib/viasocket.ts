import 'server-only';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ViaSocket } from 'viasocket-apps';

const API = 'https://flow-api.viasocket.com/';
const RUN = 'https://flow.sokt.io/func/';

// The DealRadar operator owns the Gmail + WhatsApp connections and the scheduled flows.
// Shoppers never connect an app, so there is exactly one viaSocket end user.
export const OPERATOR_UID = 'dealradar-operator';

export const GMAIL = {
  service_id: 'rowo0bqrhj5g',
  name: 'Gmail',
  icon: 'https://stuff.thingsofbrand.com/gmail.com/images/imge_idrA5FDGTH_1763454052978.svg',
  send_email: { action_id: 'rowogelpy0h6', action_version_id: 'rowwj0sfmhub' },
};

export const WHATSAPP = {
  service_id: 'row3icnwu2su',
  name: 'WhatsApp Business Cloud (Meta)',
  icon: 'https://stuff.thingsofbrand.com/viasocket.com/images/imge_whatsapp.svg',
  send_template: { action_id: 'rowsd70emhii', action_version_id: 'rowj80xxlox1' },
};

// viaSocket's own WhatsApp: sends a headline and a line of text to any number, with no connection and no
// WhatsApp Business account of ours. Each message costs viaSocket credits.
export const WHATSAPP_NOTIFY = {
  service_id: 'rowfgty2478l',
  name: 'WhatsApp',
  send_notification: { action_id: 'rowmpdudwfpw', action_version_id: 'rowi4rw7mtij' },
};

// The operator's own Telegram bot: sends alerts, and hears "/start" from shoppers to link their chat.
export const TELEGRAM = {
  service_id: 'rows0luvn',
  name: 'Telegram',
  icon: 'https://stuff.thingsofbrand.com/telegram.org/images/img6c1c10f144_telegram.jpg',
  send_message: { action_id: 'rowg5vf64', version: 'V33' },
  // version_id is also the title viaSocket gives each subscription flow, which is how old listeners are found.
  new_message: { trigger_id: 'row75zh5gf76', version: 'V13', version_id: 'row7z8fsm3ca' },
};

export const APPS = { gmail: GMAIL, whatsapp: WHATSAPP, telegram: TELEGRAM } as const;
export type AppKey = keyof typeof APPS;

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let client: ViaSocket | null = null;
const viasocket = () =>
  (client ??= new ViaSocket({ orgId: env('VIASOCKET_ORG_ID'), projectId: env('VIASOCKET_PROJECT_ID'), secret: env('VIASOCKET_EMBED_SECRET') }));

// Runs `handler` on viaSocket for every message the operator's bot receives. Returns the subscription's script_id.
export async function subscribeTelegramMessages(authId: string, handler: string): Promise<string> {
  const vs = viasocket();
  const triggerVersionId = await vs.catalog.versionIdFor(TELEGRAM.service_id, TELEGRAM.new_message.trigger_id, TELEGRAM.new_message.version);
  const sub = await vs.user(OPERATOR_UID).subscribe(triggerVersionId, { authId, inputData: {}, code: handler });
  return sub.scriptId;
}

export async function endSubscription(scriptId: string) {
  await viasocket().user(OPERATOR_UID).setFlowStatus(scriptId, 0);
}

export function embedToken(uniqueIdentifier: string = OPERATOR_UID) {
  return jwt.sign(
    {
      org_id: env('VIASOCKET_ORG_ID'),
      project_id: env('VIASOCKET_PROJECT_ID'),
      unique_identifier: uniqueIdentifier,
    },
    env('VIASOCKET_EMBED_SECRET'),
    { algorithm: 'HS256' },
  );
}

// Keys derived from the embed secret, so the app needs no extra secrets to configure.
export function derivedKey(purpose: string) {
  return crypto.createHmac('sha256', env('VIASOCKET_EMBED_SECRET')).update(`dealradar:${purpose}`).digest('base64url');
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function call<T = any>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(`${API}${path.replace(/^\//, '')}`, {
    method,
    headers: { 'Content-Type': 'application/json', authorization: embedToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success === false) {
    throw new Error(payload.message || `viaSocket ${path} failed with ${res.status}`);
  }
  return payload.data as T;
}

export interface Connection {
  id: string;
  service_id?: string;
  isExpired?: boolean;
  [k: string]: unknown;
}

// Every flow the operator has in this project (id, title, status).
export async function listFlows(): Promise<{ id: string; title: string; status: string }[]> {
  const res = await fetch(`${API}projects/${env('VIASOCKET_PROJECT_ID')}/integrations`, { headers: { authorization: embedToken() }, cache: 'no-store' });
  const payload: any = await res.json().catch(() => null);
  return payload?.data?.flows ?? [];
}

export async function listConnections(): Promise<Connection[]> {
  return (await call<Connection[]>('/embed/authentications', undefined, 'GET')) || [];
}

export async function listOptions(actionVersionId: string, fieldKey: string, existingFields: Record<string, unknown>, authId: string) {
  const data: any = await call(`/embed/list-options/${actionVersionId}`, { fieldKey, auth_id: authId, existingFields });
  if (data && !Array.isArray(data) && data.response && Number(data.response.status) >= 400) {
    throw new Error(data.response.data?.message || 'list-options failed');
  }
  const options = (Array.isArray(data) ? data : data?.data) || [];
  return options as { label: string; value: string }[];
}

// ---------- AI in the product ----------

export async function askAI<T>(opts: { thread_id: string; prompt: string; message: string; schemaName: string; schema: object }): Promise<T> {
  const data = await call<{ content: T }>('/embed/ai/message', {
    message: opts.message,
    thread_id: opts.thread_id,
    prompt: opts.prompt,
    response_type: 'json_schema',
    json_schema: { name: opts.schemaName, schema: opts.schema, strict: true },
  });
  const content: any = data.content;
  return (typeof content === 'string' ? JSON.parse(content) : content) as T;
}

// The AI's browser answers only on the websocket path. With no screen listening, the backend
// sends with delivery "rtlayer" and reads the answer from the thread's history once it lands.
export async function askAIWithBrowser<T>(opts: { thread_id: string; prompt: string; message: string; schemaName: string; schema: object; timeoutMs: number }): Promise<T | null> {
  const ack = await call<{ message_id: string }>('/embed/ai/message', {
    message: opts.message,
    thread_id: opts.thread_id,
    prompt: opts.prompt,
    response_type: 'json_schema',
    json_schema: { name: opts.schemaName, schema: opts.schema, strict: true },
    delivery: 'rtlayer',
  });
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const h = await call<{ messages: { role: string; message_id: string; content: unknown }[] }>(
      `/embed/ai/threads/${encodeURIComponent(opts.thread_id)}/history?page=1`,
      undefined,
      'GET',
    );
    const answer = h?.messages?.find((m) => m.role === 'assistant' && m.message_id === ack.message_id);
    if (answer) return (typeof answer.content === 'string' ? JSON.parse(answer.content) : answer.content) as T;
  }
  return null;
}

// ---------- Automations ----------

async function proxyAuthToken(): Promise<string> {
  const res = await fetch(`${API}users/register`, { headers: { authorization: embedToken() }, cache: 'no-store' });
  const payload = await res.json();
  if (!payload?.data?.token) throw new Error(payload?.message || 'users/register failed');
  return payload.data.token;
}

async function flowCall(scriptPath: string, body: Record<string, unknown>) {
  const res = await fetch(`${RUN}${scriptPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const payload: any = await res.json().catch(() => ({}));
  // Refusals still answer HTTP 200, with the reason nested in the body.
  if (payload?.status === 400 || payload?.data?.success === false || payload?.success === false) {
    throw new Error(payload?.data?.message || payload?.message || `viaSocket ${scriptPath} refused`);
  }
  return payload;
}

export interface FlowStep {
  stepname: string;
  code: string;
  service_action_functions: { name: string; auth_id: string; action_id: string }[];
}

export async function upsertCronFlow(opts: {
  scriptId?: string;
  title: string;
  description: string;
  cronStatement: string;
  steps: FlowStep[];
}): Promise<string> {
  return upsertFlow({ ...opts, trigger: { triggerType: 'cron', cronStatement: opts.cronStatement } });
}

// A flow DealRadar starts itself by calling its webhook URL (see runFlow).
export async function upsertWebhookFlow(opts: { scriptId?: string; title: string; description: string; steps: FlowStep[] }): Promise<string> {
  return upsertFlow({ ...opts, trigger: { triggerType: 'webhook' } });
}

export async function runFlow(scriptId: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${RUN}${scriptId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`flow ${scriptId} answered ${res.status}`);
}

async function upsertFlow(opts: {
  scriptId?: string;
  title: string;
  description: string;
  trigger: Record<string, unknown>;
  steps: FlowStep[];
}): Promise<string> {
  const token = await proxyAuthToken();
  const projectId = env('VIASOCKET_PROJECT_ID');
  let scriptId = opts.scriptId;
  if (!scriptId) {
    const created = await flowCall('scrisgf5H0hN', { title: opts.title, description: opts.description, projectId, proxy_auth_token: token });
    scriptId = created?.data?.script_id;
    if (!scriptId) throw new Error('viaSocket did not return a script_id for the new flow');
  }
  await flowCall('scrij2DSRMlP', { scriptId, projectId, ...opts.trigger, proxy_auth_token: token });
  const saved = await flowCall('scrigkyMNOEC', { scriptId, steps: opts.steps, proxy_auth_token: token });
  if (!saved?.steps && !saved?.data?.steps) throw new Error('viaSocket did not save the flow steps');
  return scriptId;
}

export async function readFlow(scriptId: string) {
  const token = await proxyAuthToken();
  return flowCall('scriiZYPU6I3', { scriptId, env: 'prod', proxy_auth_token: token });
}

export async function flowRunCounts(scriptId: string): Promise<{ successCount: number; failedCount: number } | null> {
  const token = await proxyAuthToken();
  const url = `${API}logs/orgId/${env('VIASOCKET_ORG_ID')}?projectId=${env('VIASOCKET_PROJECT_ID')}&scriptId=${scriptId}&page=1&limit=1&getCount=true`;
  const res = await fetch(url, { headers: { proxy_auth_token: token }, cache: 'no-store' });
  const payload: any = await res.json().catch(() => null);
  return payload?.data ?? null;
}

export async function setFlowStatus(scriptId: string, status: 0 | 1 | 2) {
  return call(`/embed/updatestatus/${scriptId}?status=${status}`, undefined, 'PUT');
}
