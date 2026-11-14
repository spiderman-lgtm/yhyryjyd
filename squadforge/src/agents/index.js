// Agent registry - each agent is a building in the dashboard's village.
const scout = require('./scout');
const analyst = require('./analyst');
const herald = require('./herald');
const scribe = require('./scribe');
const inspector = require('./inspector');
const { runAgent } = require('../util');

const AGENTS = {
  scout: { name: 'Scout', emoji: '🔭', building: 'Watchtower', job: 'Reads the Slack channel and threads', run: () => scout.sync({ manual: true }) },
  tracker: { name: 'Tracker', emoji: '🎯', building: 'Command Tent', job: 'Client request status, time and difficulty', run: () => scout.sync({ manual: true }) },
  growth: { name: 'Sprout', emoji: '🌱', building: 'Greenhouse', job: 'Growth posts: listing, blog, newsletter, credentials', run: () => scout.sync({ manual: true }) },
  inspector: { name: 'Inspector', emoji: '🔍', building: 'Lab', job: 'Reviews apps and posts mistakes in the thread', run: () => inspector.runPending() },
  analyst: { name: 'Analyst', emoji: '📊', building: 'Observatory', job: 'Plan vs done, actions/triggers count', run: () => analyst.run() },
  herald: { name: 'Herald', emoji: '📢', building: 'Bell Tower', job: '7 PM alert + morning reminder', run: () => herald.evening() },
  scribe: { name: 'Scribe', emoji: '📜', building: 'Library', job: 'Monday weekly report', run: () => scribe.run() },
  commander: { name: 'Commander', emoji: '⚔️', building: 'Castle', job: 'Your instructions to the channel + SMS', run: null },
};

function run(key) {
  const a = AGENTS[key];
  if (!a || !a.run) throw new Error('Unknown agent');
  // tracker/growth run inside Scout's sync
  const runner = ['tracker', 'growth'].includes(key) ? 'scout' : key;
  return runAgent(runner, `${AGENTS[runner].name} is working…`, a.run);
}

module.exports = { AGENTS, run };
