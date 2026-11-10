// Agent registry - dashboard ke village mein har agent ek building hai.
const scout = require('./scout');
const analyst = require('./analyst');
const herald = require('./herald');
const scribe = require('./scribe');
const inspector = require('./inspector');
const { runAgent } = require('../util');

const AGENTS = {
  scout: { name: 'Scout', emoji: '🔭', building: 'Watchtower', job: 'Slack channel aur threads padhta hai', run: () => scout.sync() },
  tracker: { name: 'Tracker', emoji: '🎯', building: 'Command Tent', job: 'Client requests ka status, time aur difficulty', run: () => scout.sync() },
  growth: { name: 'Sprout', emoji: '🌱', building: 'Greenhouse', job: 'Growth posts: listing, blog, newsletter, credentials', run: () => scout.sync() },
  inspector: { name: 'Inspector', emoji: '🔍', building: 'Lab', job: 'Apps review karke galtiyan thread mein daalta hai', run: () => inspector.runPending() },
  analyst: { name: 'Analyst', emoji: '📊', building: 'Observatory', job: 'Plan vs done, actions/triggers count', run: () => analyst.run() },
  herald: { name: 'Herald', emoji: '📢', building: 'Bell Tower', job: '7 PM alert + subah ka reminder', run: () => herald.evening() },
  scribe: { name: 'Scribe', emoji: '📜', building: 'Library', job: 'Monday weekly report', run: () => scribe.run() },
  commander: { name: 'Commander', emoji: '⚔️', building: 'Castle', job: 'Aapke instructions channel + SMS pe', run: null },
};

function run(key) {
  const a = AGENTS[key];
  if (!a || !a.run) throw new Error('Unknown agent');
  // tracker/growth Scout ke sync ke andar chalte hain
  const runner = ['tracker', 'growth'].includes(key) ? 'scout' : key;
  return runAgent(runner, `${AGENTS[runner].name} kaam kar raha hai…`, a.run);
}

module.exports = { AGENTS, run };
