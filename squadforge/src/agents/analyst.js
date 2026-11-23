// 📊 Analyst - compares each member's morning plan with their evening update,
// counts actions/triggers/apps built, and writes a one-line summary.
const { db } = require('../db');
const llm = require('../llm');
const { logActivity, members, today } = require('../util');

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    planned_items: { type: 'integer' },
    completed_items: { type: 'integer' },
    actions: { type: 'integer' },
    triggers: { type: 'integer' },
    apps: { type: 'integer' },
    summary: { type: 'string' },
  },
  required: ['planned_items', 'completed_items', 'actions', 'triggers', 'apps', 'summary'],
};

async function run(date = today()) {
  const ms = members().filter((m) => m.role !== 'lead');
  let analysed = 0;
  for (const m of ms) {
    const log = db.prepare('SELECT * FROM daily_logs WHERE member_id = ? AND date = ?').get(m.id, date);
    if (!log || (!log.morning_text && !log.evening_text)) continue;
    if (!llm.enabled()) continue; // Scout has already stored the heuristic counts
    try {
      const out = await llm.askJson({
        system: `You analyse a daily standup for "${m.name}", a ${m.role === 'growth' ? 'growth/marketing' : 'developer building app integrations (plugins with actions and triggers)'} on a small team. Messages may be in Hinglish. Count only what is clearly stated. Summary: one short line in clear English.`,
        prompt: `Morning plan:\n${log.morning_text || '(not posted)'}\n\nEvening update:\n${log.evening_text || '(not posted)'}\n\nCount planned tasks, how many of them were completed, and how many actions, triggers and apps/plugins were built or published today.`,
        schema: SCHEMA,
      });
      db.prepare(`UPDATE daily_logs SET planned_count = ?, done_count = ?, actions_count = ?, triggers_count = ?, apps_count = ?, summary = ? WHERE id = ?`)
        .run(out.planned_items, out.completed_items, out.actions, out.triggers, out.apps, out.summary, log.id);
      analysed++;
      logActivity('analyst', `${m.name}: ${out.completed_items}/${out.planned_items} tasks, ${out.actions} actions, ${out.triggers} triggers`);
    } catch (e) {
      logActivity('analyst', `Analysis for ${m.name} failed: ${e.message}`, 'warn');
    }
  }
  return { message: llm.enabled() ? `Analysed ${analysed} member(s)` : 'No AI key — using keyword counts' };
}

module.exports = { run };
