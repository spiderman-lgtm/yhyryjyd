// viaSocket Apps API + AI API client (server-side only).
// The embed secret, every script_id and the AI tool secret stay on this side; the browser only
// ever receives an embed token, to open the Connect popup or mount the prebuilt UI.
import crypto from 'node:crypto';

const API = 'https://flow-api.viasocket.com/';
const RUN = 'https://flow.sokt.io/func/';

const env = () => ({
  org: process.env.VIASOCKET_ORG_ID || '',
  project: process.env.VIASOCKET_PROJECT_ID || '',
  secret: process.env.VIASOCKET_EMBED_SECRET || '',
});

export const configured = () => { const e = env(); return Boolean(e.org && e.project && e.secret); };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** HS256 embed token: org_id, project_id, unique_identifier. No exp, by design. */
export function embedToken(uniqueIdentifier) {
  const { org, project, secret } = env();
  if (!secret) throw new Error('VIASOCKET_EMBED_SECRET missing');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ org_id: org, project_id: project, unique_identifier: String(uniqueIdentifier) });
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

async function call(path, uid, body, method = 'POST') {
  const headers = { authorization: embedToken(uid) };
  const init = { method, headers };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    init.body = body === undefined ? '{}' : JSON.stringify(body);
  }
  const res = await fetch(`${API}${path.replace(/^\//, '')}`, init);
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error(`viaSocket ${path}: ${res.status} ${text.slice(0, 120)}`); }
  if (!res.ok || payload.success === false) throw new Error(payload.message || `viaSocket ${path} failed with ${res.status}`);
  return payload.data;
}

// ---------- catalog ----------
export async function searchApps(query) {
  const res = await fetch(`${RUN}scri12BSufQM?key=${encodeURIComponent(query)}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.data || [];
  return list.map((a) => ({ service_id: a.service_id, name: a.name, iconurl: a.iconurl, description: a.description }));
}

// ---------- connections ----------
export const listConnections = (uid) => call('/embed/authentications', uid, undefined, 'GET');

export async function listUserFlows(uid) {
  const res = await fetch(`${API}projects/${env().project}/integrations`, { headers: { authorization: embedToken(uid) } });
  const payload = await res.json();
  return payload.data?.flows || [];
}

/** Enable once per (user, app); reuse an active flow if one exists. Returns the script_id. */
export async function enableApp(uid, serviceId, authId) {
  const flows = await listUserFlows(uid);
  const existing = flows.find((f) => f.service_id === serviceId && f.status === 'active');
  if (existing?.id) return existing.id;
  const data = await call(`/embed/enable/${serviceId}/${authId}`, uid);
  return data.script_id;
}

export async function listOptions(uid, versionId, fieldKey, existingFields = {}, authId, searchText) {
  const data = await call(`/embed/list-options/${versionId}`, uid, {
    fieldKey,
    auth_id: authId,
    existingFields: searchText ? { ...existingFields, _searchText: searchText } : existingFields,
  });
  if (data && !Array.isArray(data) && data.response && Number(data.response.status) >= 400) {
    throw new Error(data.response.data?.message || 'list-options failed');
  }
  return Array.isArray(data) ? data : data?.data || [];
}

/** No token: the script_id is the credential. */
export async function runAction(scriptId, actionVersionId, inputData) {
  const res = await fetch(`${RUN}${scriptId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_version_id: actionVersionId, inputData }),
  });
  const payload = await res.json();
  const isEnvelope = payload && typeof payload === 'object' && typeof payload.success === 'boolean' && 'data' in payload;
  if (isEnvelope ? !payload.success : payload?.success === false) throw new Error(payload.message || payload.error?.message || 'Action failed');
  return isEnvelope ? payload.data : payload;
}

export async function subscribeEvent(uid, triggerVersionId, authId, inputData, code, meta = {}) {
  const data = await call(`/embed/subscribe-event/${triggerVersionId}`, uid, { auth_id: authId, inputData, code, meta });
  return data.script_id;
}

export const updateSubscription = (uid, scriptId, changes) => call(`/embed/update-subscribed-event/${scriptId}`, uid, changes, 'PUT');
export const setFlowStatus = (uid, scriptId, status) => call(`/embed/updatestatus/${scriptId}?status=${status}`, uid, undefined, 'PUT');

// ---------- AI ----------
export async function aiMessage(uid, body) {
  return call('/embed/ai/message', uid, body);
}
