// Demo data, only for previewing the dashboard. Every row has is_demo = 1 and "Clear demo" removes them.
const { db } = require('./db');
const { today, addDays, weekday, logActivity } = require('./util');

function load() {
  if (db.prepare('SELECT COUNT(*) c FROM members WHERE is_demo = 1').get().c) return { message: 'Demo data is already loaded' };
  const tx = db.transaction(() => {
    const add = db.prepare('INSERT INTO members (name, slack_user_id, role, phone, is_demo) VALUES (?, ?, ?, ?, 1)');
    const ids = {
      aarav: add.run('Aarav (demo)', 'DEMO1', 'tech', null).lastInsertRowid,
      meera: add.run('Meera (demo)', 'DEMO2', 'tech', null).lastInsertRowid,
      kabir: add.run('Kabir (demo)', 'DEMO3', 'tech', null).lastInsertRowid,
      isha: add.run('Isha (demo)', 'DEMO4', 'growth', null).lastInsertRowid,
    };
    const t = today();
    const log = db.prepare(`INSERT INTO daily_logs (member_id, date, morning_text, evening_text, planned_count, done_count, actions_count, triggers_count, apps_count, summary, is_demo)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
    let seed = 7;
    const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
    for (let i = 13; i >= 0; i--) {
      const d = addDays(t, -i);
      if (weekday(d) === 0) continue;
      for (const [key, id] of Object.entries(ids)) {
        if (key === 'isha') {
          if (rnd(10) > 1) log.run(id, d, 'Plan: support queue + listing', i === 0 ? null : 'Done: support + blog draft', 3, 2, 0, 0, 0, 'Worked on support and listing', );
          continue;
        }
        const skipEvening = i === 0 && key === 'kabir';
        const planned = 3 + rnd(3);
        const done = Math.max(1, planned - rnd(3));
        log.run(id, d, `- ${planned} tasks plan`, skipEvening ? null : `- ${done} done`, planned, skipEvening ? 0 : done,
          skipEvening ? 0 : rnd(5), skipEvening ? 0 : rnd(3), rnd(6) === 0 ? 1 : 0, skipEvening ? null : `${done}/${planned} tasks complete`);
      }
    }
    const req = db.prepare(`INSERT INTO client_requests (slack_ts, title, text, assigned_member_ids, status, created_at, rnd_at, started_at, stuck_at, completed_at, stuck_count, stuck_reason, difficulty, ai_analysis, is_demo)
                            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
    const iso = (d, h) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
    req.run('Zoho Bigin plugin needed', 'Client request: Zoho Bigin', JSON.stringify([ids.aarav]), 'completed', iso(addDays(t, -6), 5), iso(addDays(t, -6), 6), iso(addDays(t, -6), 7), null, iso(addDays(t, -5), 9), 0, null, 2, 'Straightforward API, done in about a day.');
    req.run('Tally Forms trigger', 'Client request: Tally', JSON.stringify([ids.meera]), 'completed', iso(addDays(t, -4), 4), iso(addDays(t, -4), 5), iso(addDays(t, -3), 5), iso(addDays(t, -4), 10), iso(addDays(t, -2), 12), 1, null, 4, 'Webhook docs were missing; took 2 days after credentials arrived.');
    req.run('Kommo CRM actions', 'Client request: Kommo', JSON.stringify([ids.kabir]), 'stuck', iso(addDays(t, -2), 6), iso(addDays(t, -2), 7), iso(addDays(t, -1), 5), iso(addDays(t, -1), 9), null, 1, 'API docs missing, no sandbox account yet', null, null);
    req.run('Brevo SMS action', 'Client request: Brevo', JSON.stringify([ids.meera]), 'started', iso(t, 4), iso(t, 4), iso(t, 6), null, null, 0, null, null, null);
    req.run('Pipedrive webhook', 'Client request: Pipedrive', JSON.stringify([ids.aarav]), 'rnd', iso(t, 7), iso(t, 8), null, null, null, 0, null, null, null);
    const rev = db.prepare(`INSERT INTO reviews (member_id, subject, submission, status, errors_count, findings, summary, passed, attempt, date, is_demo)
                            VALUES (?, ?, '', 'done', ?, ?, ?, ?, ?, ?, 1)`);
    const f = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ title: ['Help text missing', 'Wrong field naming', 'No error handling', 'Auth scope too broad'][i % 4], detail: 'Demo finding', severity: ['medium', 'low', 'high'][i % 3] })));
    rev.run(ids.aarav, 'Zoho Bigin', 2, f(2), 'Two small things', 0, 1, addDays(t, -5));
    rev.run(ids.aarav, 'Zoho Bigin', 0, f(0), 'All good', 1, 2, addDays(t, -5));
    rev.run(ids.meera, 'Tally Forms', 1, f(1), 'One fix', 0, 1, addDays(t, -2));
    rev.run(ids.kabir, 'Kommo CRM', 4, f(4), 'Several fixes', 0, 1, addDays(t, -1));
    const g = db.prepare(`INSERT INTO growth_items (member_id, kind, text, date, is_demo) VALUES (?, ?, ?, ?, 1)`);
    [['support_request', 1], ['app_listing', 3], ['blog', 4], ['newsletter', 6], ['credentials', 2], ['support_request', 0]]
      .forEach(([k, d]) => g.run(ids.isha, k, `Demo ${k}`, addDays(t, -d)));
  });
  tx();
  logActivity('scout', 'Demo data loaded (preview only)');
  return { message: 'Demo data loaded' };
}

function clear() {
  db.transaction(() => {
    for (const tname of ['daily_logs', 'publishes', 'client_requests', 'growth_items', 'reviews']) db.prepare(`DELETE FROM ${tname} WHERE is_demo = 1`).run();
    db.prepare('DELETE FROM members WHERE is_demo = 1').run();
  })();
  logActivity('scout', 'Demo data removed');
  return { message: 'Demo data removed' };
}

module.exports = { load, clear };
