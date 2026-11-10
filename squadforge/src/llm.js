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
async function askJson({ system, prompt, schema, effort = 'low', maxTokens = 16000 }) {
  if (!enabled()) throw new Error('ANTHROPIC_API_KEY set nahi hai');
  const res = await getClient().beta.messages.create({
    model: cfg('CLAUDE_MODEL', 'claude-opus-5-5'),
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude ne request decline kar di');
  if (res.stop_reason === 'max_tokens') throw new Error('Claude ka jawab adhoora reh gaya (max_tokens)');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

module.exports = { enabled, askJson };
