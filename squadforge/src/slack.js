// Minimal Slack Web API client (bot token).
// Scopes needed: channels:history, groups:history, channels:read, groups:read,
// chat:write, users:read, im:write
const { cfg } = require('./util');

const vs = require('./viasocket');

function token() { return cfg('SLACK_BOT_TOKEN'); }
// A Slack bot token, when set, is used directly (no viaSocket usage limits); otherwise the viaSocket connection.
function viaViaSocket() { return vs.slackReady() && !token(); }
function enabled() { return viaViaSocket() || (!!token() && !!cfg('SLACK_CHANNEL_ID')); }

async function call(method, params = {}, { post = false } = {}) {
  if (viaViaSocket()) {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
    return vs.slackCall(method, clean, post);
  }
  const t = token();
  if (!t) throw new Error('SLACK_BOT_TOKEN is not set');
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (post) {
      res = await fetch(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(params),
      });
    } else {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
      res = await fetch(`https://slack.com/api/${method}?${qs}`, { headers: { Authorization: `Bearer ${t}` } });
    }
    if (res.status === 429) {
      const wait = (parseInt(res.headers.get('retry-after') || '2', 10) + 1) * 1000;
      await new Promise((r) => setTimeout(r, Math.min(wait, 20000)));
      continue;
    }
    break;
  }
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error}`);
  return data;
}

async function history(channel, oldest) {
  const out = [];
  let cursor;
  do {
    const d = await call('conversations.history', { channel, oldest, limit: 200, cursor });
    out.push(...d.messages);
    cursor = d.response_metadata && d.response_metadata.next_cursor;
  } while (cursor);
  return out;
}

async function replies(channel, ts) {
  const out = [];
  let cursor;
  do {
    const d = await call('conversations.replies', { channel, ts, limit: 200, cursor });
    out.push(...d.messages);
    cursor = d.response_metadata && d.response_metadata.next_cursor;
  } while (cursor);
  return out.filter((m) => m.ts !== ts); // drop the parent
}

async function post(channel, text, thread_ts) {
  return call('chat.postMessage', { channel, text, thread_ts, unfurl_links: false }, { post: true });
}

// DM a user (bot opens IM channel)
async function dm(userId, text) {
  const d = await call('conversations.open', { users: userId }, { post: true });
  return post(d.channel.id, text);
}

async function channelMembers(channel) {
  const ids = [];
  let cursor;
  do {
    const d = await call('conversations.members', { channel, limit: 200, cursor });
    ids.push(...d.members);
    cursor = d.response_metadata && d.response_metadata.next_cursor;
  } while (cursor);
  return ids;
}
async function userInfo(user) { return (await call('users.info', { user })).user; }

function mentions(text = '') {
  return [...text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]);
}
function permalinkish(channel, ts) {
  const team = cfg('SLACK_WORKSPACE_URL');
  if (!team) return null;
  return `${team.replace(/\/$/, '')}/archives/${channel}/p${String(ts).replace('.', '')}`;
}

module.exports = { viaViaSocket, enabled, call, history, replies, post, dm, channelMembers, userInfo, mentions, permalinkish };
