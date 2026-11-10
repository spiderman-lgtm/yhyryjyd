// Demo data - sirf dashboard dekhne ke liye. Sab rows is_demo = 1, "Clear demo" se hat jaati hain.
const { db } = require('./db');
const { today, addDays, weekday, logActivity } = require('./util');

function load() {
  if (db.prepare('SELECT COUNT(*) c FROM members WHERE is_demo = 1').get().c) return { message: 'Demo data pehle se hai' };
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
          if (rnd(10) > 1) log.run(id, d, 'Plan: support queue + listing', i === 0 ? null : 'Done: support + blog draft', 3, 2, 0, 0, 0, 'Support aur listing pe kaam', );
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
    req.run('Zoho Bigin plugin chahiye', 'Client request: Zoho Bigin', JSON.stringify([ids.aarav]), 'completed', iso(addDays(t, -6), 5), iso(addDays(t, -6), 6), iso(addDays(t, -6), 7), null, iso(addDays(t, -5), 9), 0, null, 2, 'Seedha API tha, ~1 din mein ho gaya.');
    req.run('Tally Forms trigger', 'Client request: Tally', JSON.stringify([ids.meera]), 'completed', iso(addDays(t, -4), 4), iso(addDays(t, -4), 5), iso(addDays(t, -3), 5), iso(addDays(t, -4), 10), iso(addDays(t, -2), 12), 1, null, 4, 'Webhook docs missing the, credentials ke baad 2 din laga.');
    req.run('Kommo CRM actions', 'Client request: Kommo', JSON.stringify([ids.kabir]), 'stuck', iso(addDays(t, -2), 6), iso(addDays(t, -2), 7), iso(addDays(t, -1), 5), iso(addDays(t, -1), 9), null, 1, 'API doc missing hai, sandbox account nahi mila', null, null);
    req.run('Brevo SMS action', 'Client request: Brevo', JSON.stringify([ids.meera]), 'started', iso(t, 4), iso(t, 4), iso(t, 6), null, null, 0, null, null, null);
    req.run('Pipedrive webhook', 'Client request: Pipedrive', JSON.stringify([ids.aarav]), 'rnd', iso(t, 7), iso(t, 8), null, null, null, 0, null, null, null);
    const rev = db.prepare(`INSERT INTO reviews (member_id, subject, submission, status, errors_count, findings, summary, passed, attempt, date, is_demo)
                            VALUES (?, ?, '', 'done', ?, ?, ?, ?, ?, ?, 1)`);
    const f = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ title: ['Help text missing', 'Field naming galat', 'Error handling nahi', 'Auth scope zyada'][i % 4], detail: 'Demo finding', severity: ['medium', 'low', 'high'][i % 3] })));
    rev.run(ids.aarav, 'Zoho Bigin', 2, f(2), 'Do chhoti cheezein', 0, 1, addDays(t, -5));
    rev.run(ids.aarav, 'Zoho Bigin', 0, f(0), 'Sab sahi', 1, 2, addDays(t, -5));
    rev.run(ids.meera, 'Tally Forms', 1, f(1), 'Ek fix', 0, 1, addDays(t, -2));
    rev.run(ids.kabir, 'Kommo CRM', 4, f(4), 'Kaafi fixes', 0, 1, addDays(t, -1));
    const g = db.prepare(`INSERT INTO growth_items (member_id, kind, text, date, is_demo) VALUES (?, ?, ?, ?, 1)`);
    [['support_request', 1], ['app_listing', 3], ['blog', 4], ['newsletter', 6], ['credentials', 2], ['support_request', 0]]
      .forEach(([k, d]) => g.run(ids.isha, k, `Demo ${k}`, addDays(t, -d)));
  });
  tx();
  logActivity('scout', 'Demo data load hua (sirf dekhne ke liye)');
  return { message: 'Demo data load ho gaya' };
}

function clear() {
  db.transaction(() => {
    for (const tname of ['daily_logs', 'publishes', 'client_requests', 'growth_items', 'reviews']) db.prepare(`DELETE FROM ${tname} WHERE is_demo = 1`).run();
    db.prepare('DELETE FROM members WHERE is_demo = 1').run();
  })();
  logActivity('scout', 'Demo data hata diya');
  return { message: 'Demo data hata diya' };
}

module.exports = { load, clear };
