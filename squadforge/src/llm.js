// Claude API wrapper. Every agent goes through askJson(): structured JSON output,
// refusal handling, and server-side fallback on a policy decline.
const Anthropic = require('@anthropic-ai/sdk');
const { cfg } = require('./util');

let client = null;
function enabled() { return !!cfg('ANTHROPIC_API_KEY'); }
function getClient() {
  if (!client) {
    const AnthropicCtor = Anthropic.default || Anthropic;
    client = new AnthropicCtor({ apiKey: cfg('ANTHROPIC_API_KEY') });
  }
  return client;
}

/**
 * Ask Claude for JSON matching `schema`.
 * effort: 'low' for quick classification, 'high' for reviews/reports.
 */
// When the account has no credits (or the key is wrong), stop calling for a while instead of failing
// every message; the answer explains what to do in plain words.
let pausedUntil = 0, pauseReason = '';
function friendly(err) {
  const msg = String((err && (err.error && err.error.error && err.error.error.message)) || (err && err.message) || err);
  if (/credit balance is too low|billing|purchase credits/i.test(msg)) return { text: 'AI credits are finished — add credits in the Anthropic console (Plans & Billing), then try again.', pause: 30 * 60 * 1000 };
  if (/invalid x-api-key|authentication_error|invalid api key/i.test(msg)) return { text: 'The AI key is not valid — check ANTHROPIC_API_KEY in Embarko.', pause: 30 * 60 * 1000 };
  if (/rate limit|overloaded|529|429/i.test(msg)) return { text: 'The AI is busy right now — try again in a minute.', pause: 60 * 1000 };
  return { text: 'The AI could not answer: ' + msg.slice(0, 160), pause: 0 };
}
function status() { return pausedUntil > Date.now() ? { paused: true, reason: pauseReason, until: new Date(pausedUntil).toISOString() } : { paused: false }; }

async function askJson({ system, prompt, schema, effort = 'low', maxTokens = 16000, force = false }) {
  if (!enabled()) throw new Error('ANTHROPIC_API_KEY is not set');
  if (pausedUntil > Date.now() && !force) throw new Error(pauseReason); // force: the health Test button retries now
  let res;
  try { res = await callModel({ system, prompt, schema, effort, maxTokens }); }
  catch (err) {
    const f = friendly(err);
    if (f.pause) { pausedUntil = Date.now() + f.pause; pauseReason = f.text; }
    throw new Error(f.text);
  }
  pausedUntil = 0;
  if (res.stop_reason === 'refusal') throw new Error('Claude declined the request');
  if (res.stop_reason === 'max_tokens') throw new Error('Claude reply was cut off (max_tokens)');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

function callModel({ system, prompt, schema, effort, maxTokens }) {
  return getClient().beta.messages.create({
    model: cfg('CLAUDE_MODEL', 'claude-opus-5-5'),
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  });
}

module.exports = { enabled, askJson, status };
