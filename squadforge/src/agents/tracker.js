// 🎯 Tracker - client requests: status flow new → R&D → started → stuck → completed,
// time taken and difficulty analysis.
const { db } = require('../db');
const slack = require('../slack');
const llm = require('../llm');
const { logActivity, tsToIso, hoursBetween, memberById, cfg } = require('../util');
const { requestTitle } = require('../parser');

const LABEL = { new: 'New', rnd: 'R&D', started: 'Started', stuck: 'Stuck', completed: 'Completed' };

function createFromMessage(msg, channel, leadId) {
  const exists = db.prepare('SELECT id FROM client_requests WHERE slack_ts = ?').get(msg.ts);
  if (exists) return null;
  const assigned = assignedFromMentions(slack.mentions(msg.text), leadId);
  const at = tsToIso(msg.ts);
  const info = db.prepare(`INSERT INTO client_requests (slack_ts, channel, title, text, assigned_member_ids, status, created_at, last_reply_ts)
                           VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`)
    .run(msg.ts, channel, requestTitle(msg.text), msg.text, JSON.stringify(assigned), at, msg.ts);
  db.prepare('INSERT INTO request_events (request_id, status, slack_ts, at) VALUES (?, ?, ?, ?)').run(info.lastInsertRowid, 'new', msg.ts, at);
  logActivity('tracker', `Nayi client request: "${requestTitle(msg.text)}"`);
  return info.lastInsertRowid;
}

function assignedFromMentions(userIds, leadId) {
  const ids = [];
  for (const u of userIds) {
    if (u === leadId) continue;
    const m = db.prepare('SELECT id, role FROM members WHERE slack_user_id = ? AND active = 1').get(u);
    if (m && m.role !== 'lead') ids.push(m.id);
  }
  return ids;
}

function addAssignees(req, memberIds) {
  const cur = new Set(JSON.parse(req.assigned_member_ids || '[]'));
  let changed = false;
  for (const id of memberIds) if (!cur.has(id)) { cur.add(id); changed = true; }
  if (changed) {
    db.prepare('UPDATE client_requests SET assigned_member_ids = ? WHERE id = ?').run(JSON.stringify([...cur]), req.id);
    const names = memberIds.map((id) => (memberById(id) || {}).name).filter(Boolean).join(', ');
    logActivity('tracker', `"${req.title}" assign hui: ${names}`);
  }
  return changed;
}

async function applyStatus(req, status, msg, member) {
  if (db.prepare('SELECT 1 FROM request_events WHERE request_id = ? AND slack_ts = ?').get(req.id, msg.ts)) return false;
  if (status === req.status && status !== 'stuck') return false;
  const at = tsToIso(msg.ts);
  const reason = status === 'stuck' ? (msg.text || '').replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, '').trim().slice(0, 500) : null;
  const sets = ['status = @status'];
  if (status === 'rnd') sets.push('rnd_at = COALESCE(rnd_at, @at)');
  if (status === 'started') sets.push('started_at = COALESCE(started_at, @at)');
  if (status === 'stuck') sets.push('stuck_at = @at', 'stuck_count = stuck_count + 1', 'stuck_reason = @reason');
  else sets.push('stuck_reason = NULL');
  if (status === 'completed') sets.push('completed_at = @at');
  db.prepare(`UPDATE client_requests SET ${sets.join(', ')} WHERE id = @id`).run({ status, at, reason, id: req.id });
  db.prepare('INSERT INTO request_events (request_id, status, reason, member_id, slack_ts, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.id, status, reason, member ? member.id : null, msg.ts, at);
  if (member && member.role !== 'lead') addAssignees(req, [member.id]);
  logActivity('tracker', `"${req.title}" → ${LABEL[status]}${member ? ' (' + member.name + ')' : ''}${reason ? ': ' + reason.slice(0, 80) : ''}`);
  if (status === 'completed') await analyze(req.id);
  return true;
}

// AI (or heuristic) analysis once a request is completed: kitna time, kitna hard.
async function analyze(requestId) {
  const req = db.prepare('SELECT * FROM client_requests WHERE id = ?').get(requestId);
  if (!req) return;
  const events = db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY at').all(requestId);
  const start = req.started_at || req.rnd_at || req.created_at;
  const hours = hoursBetween(start, req.completed_at);
  let difficulty = 1 + (hours > 4) + (hours > 12) + (hours > 36) + (req.stuck_count > 0 ? 1 : 0);
  difficulty = Math.min(5, difficulty);
  let analysis = `Total ${hours !== null ? hours.toFixed(1) : '?'} ghante laga, ${req.stuck_count} baar stuck hua.`;

  if (llm.enabled()) {
    let thread = '';
    if (slack.enabled() && req.slack_ts) {
      try {
        const replies = await slack.replies(req.channel || cfg('SLACK_CHANNEL_ID'), req.slack_ts);
        thread = replies.map((r) => `[${tsToIso(r.ts)}] ${r.user}: ${r.text}`).join('\n').slice(0, 30000);
      } catch (e) { thread = ''; }
    }
    try {
      const out = await llm.askJson({
        system: 'You analyse how a software team handled a client request to build an app integration/plugin. Reply in short Hinglish (Hindi in Latin script mixed with English).',
        prompt: `Request: ${req.title}\n\nOriginal message:\n${req.text}\n\nStatus timeline:\n${events.map((e) => `${e.at} ${e.status}${e.reason ? ' - ' + e.reason : ''}`).join('\n')}\n\nWork time (first R&D/start to completion): ${hours !== null ? hours.toFixed(1) + ' hours' : 'unknown'}\nTimes stuck: ${req.stuck_count}\n\nThread:\n${thread || '(not available)'}\n\nRate difficulty 1 (very easy) to 5 (very hard) and explain in 2-3 lines how it went: time, blockers, was it actually hard.`,
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            difficulty: { type: 'integer', enum: [1, 2, 3, 4, 5] },
            was_hard: { type: 'boolean' },
            analysis: { type: 'string' },
          },
          required: ['difficulty', 'was_hard', 'analysis'],
        },
      });
      difficulty = out.difficulty;
      analysis = out.analysis;
    } catch (e) {
      logActivity('tracker', 'AI analysis fail, heuristic use kiya: ' + e.message, 'warn');
    }
  }
  db.prepare('UPDATE client_requests SET difficulty = ?, ai_analysis = ? WHERE id = ?').run(difficulty, analysis, requestId);
  logActivity('tracker', `"${req.title}" complete: difficulty ${difficulty}/5, ${hours !== null ? hours.toFixed(1) + 'h' : ''}`);
}

module.exports = { createFromMessage, applyStatus, addAssignees, assignedFromMentions, analyze, LABEL };
