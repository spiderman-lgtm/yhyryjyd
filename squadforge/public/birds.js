/* Bird Town: every team member is an (original) cartoon bird sitting on the wire above the
   dashboard. Mood comes from today's data: happy (posted + output), busy (morning plan only),
   worried (a stuck request), sleepy (no update yet). Click a bird to see the details. */

const BIRD_COLORS = [
  ['#7b6fd6', '#a99ff0'], ['#2aa3b8', '#7fd3df'], ['#f08a3c', '#ffc08c'], ['#e0628f', '#f6a7c2'],
  ['#5fb84a', '#a5e08f'], ['#d9b032', '#f3dc86'], ['#4f86d9', '#9dc1f3'], ['#9a6bc4', '#cfb0ea'],
];

function birdSvg(i, mood) {
  const [c, belly] = BIRD_COLORS[i % BIRD_COLORS.length];
  const dark = 'rgba(30,24,48,.28)';
  const eyes = {
    sleepy: `<path d="M33 47 q7 5 14 0" class="lid-line"/><path d="M53 47 q7 5 14 0" class="lid-line"/>`,
    worried: `<g class="eye"><circle cx="40" cy="47" r="10" fill="#fff"/><circle cx="41" cy="50" r="4.5" fill="#1e1830"/></g>
              <g class="eye"><circle cx="60" cy="47" r="10" fill="#fff"/><circle cx="59" cy="50" r="4.5" fill="#1e1830"/></g>
              <path d="M30 35 l15 5 M70 35 l-15 5" stroke="#1e1830" stroke-width="3" stroke-linecap="round"/>`,
    default: `<g class="eye"><circle cx="40" cy="47" r="10.5" fill="#fff"/><circle cx="42" cy="47" r="5" fill="#1e1830"/><circle cx="43.5" cy="45" r="1.6" fill="#fff"/></g>
              <g class="eye"><circle cx="60" cy="47" r="10.5" fill="#fff"/><circle cx="62" cy="47" r="5" fill="#1e1830"/><circle cx="63.5" cy="45" r="1.6" fill="#fff"/></g>`,
  };
  const mouth = mood === 'happy' ? '<path d="M45 64 q5 4 10 0" stroke="#1e1830" stroke-width="2" fill="none" stroke-linecap="round"/>' : '';
  return `<svg viewBox="0 0 100 112" class="bird-svg" aria-hidden="true">
    <ellipse cx="50" cy="108" rx="22" ry="3" fill="rgba(0,0,0,.12)"/>
    <path d="M22 78 L4 92 L26 88 Z" fill="${c}" stroke="#1e1830" stroke-width="3" stroke-linejoin="round"/>
    <path d="M48 20 q-6 -12 2 -16 M54 21 q2 -12 10 -12" stroke="#1e1830" stroke-width="3" fill="none" stroke-linecap="round" class="tuft"/>
    <path d="M48 20 q-6 -12 2 -16 M54 21 q2 -12 10 -12" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="50" cy="62" rx="31" ry="36" fill="${c}" stroke="#1e1830" stroke-width="3.5"/>
    <ellipse cx="52" cy="76" rx="18" ry="19" fill="${belly}"/>
    <path d="M22 62 q-8 16 6 26 q10 -6 6 -24 Z" fill="${dark}" class="wing"/>
    ${eyes[mood] || eyes.default}
    <rect x="28" y="35" width="44" height="0" fill="${c}" class="lid"/>
    <path d="M44 56 L56 56 L50 66 Z" fill="#f5a623" stroke="#1e1830" stroke-width="2.5" stroke-linejoin="round"/>
    ${mouth}
    <path d="M42 96 v8 M38 104 h8 M58 96 v8 M54 104 h8" stroke="#f5a623" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`;
}

function birdMood(m, log, nowHour) {
  const out = m.actions + m.triggers + m.apps;
  if (m.requests_stuck) return { mood: 'worried', say: 'Stuck on a request!', cls: 'bad' };
  if (log.evening_text) return { mood: 'happy', say: m.role === 'growth' ? 'Day wrapped up!' : `${out} published today`, cls: 'good' };
  if (log.morning_text) return { mood: 'busy', say: 'Working on it…', cls: '' };
  if (nowHour >= 11.5) return { mood: 'sleepy', say: 'No update yet', cls: 'warn' };
  return { mood: 'busy', say: 'Good morning!', cls: '' };
}

function istHour() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':');
  return Number(p[0]) + Number(p[1]) / 60;
}

function birdScene(today, logs) {
  const ms = today.members || [];
  const h = istHour();
  const birds = ms.map((m, i) => {
    const log = logs.find((l) => l.member_id === m.id) || {};
    const b = birdMood(m, log, h);
    return `<button class="bird ${b.mood}" style="--i:${i}" data-bird="${m.id}" title="${esc(m.name)}: ${esc(b.say)}">
      <span class="say ${b.cls}">${esc(b.say)}</span>
      ${b.mood === 'sleepy' ? '<span class="zzz">z<b>z</b><i>z</i></span>' : ''}
      ${birdSvg(i, b.mood)}
      <span class="tag">${esc(m.name.replace(/\s*\(.*\)/, ''))}</span>
    </button>`;
  }).join('');
  const t = today.totals;
  const ph = skyPhase(h);
  // sun/moon travel an arc across the sky with the real time of day (IST)
  const dayK = Math.min(1, Math.max(0, (h - 6) / 13)), nightK = ((h >= 19 ? h - 19 : h + 5) / 11);
  const k = ph === 'night' ? nightK : dayK;
  const orbX = 8 + k * 84, orbY = 70 - Math.sin(Math.PI * k) * 52;
  const stars = Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;top:${(i * 53) % 55}%;animation-delay:${(i % 7) * .4}s"></i>`).join('');
  const windows = Array.from({ length: 34 }, (_, i) => `<rect x="${20 + ((i * 71) % 1160)}" y="${48 + ((i * 29) % 56)}" width="6" height="8" rx="1"/>`).join('');
  return `<section class="town sky-${ph}" aria-label="Team on the wire">
    <div class="stars">${stars}</div>
    <div class="orb ${ph === 'night' ? 'moon' : 'sun'}" style="left:${orbX}%;top:${orbY}%"></div>
    <div class="cloud-c c1"></div><div class="cloud-c c2"></div><div class="cloud-c c3"></div>
    <svg class="skyline" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 120 V82 h40 V60 h50 v22 h60 V70 h80 V52 h40 v30 h70 V64 h55 v18 h60 V58 h50 v24 h80 V66 h45 v16 h70 V54 h60 v28 h55 V68 h70 v14 h60 V60 h50 v22 h60 V120 Z" class="sky-far"/>
      <path d="M0 120 V70 h60 V40 h50 v30 h40 V55 h70 V25 h45 v45 h30 V60 h80 V35 h55 v35 h40 V50 h60 v20 h50 V30 h40 v40 h70 V58 h45 V20 h60 v50 h40 V45 h70 v25 h55 V38 h50 v32 h40 V120 Z" class="sky-near"/>
      <g class="win">${windows}</g>
    </svg>
    <div class="flyer" aria-hidden="true">${flyerSvg()}<span class="note"></span></div>
    <div class="fx" id="townFx"></div>
    <div class="town-title"><span>Bird Town</span><small>${ms.length ? 'Your team, live from the wire' : 'Add team members in Settings to fill the wire'}</small></div>
    <svg class="wire" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6 Q500 34 1000 6" /></svg>
    <div class="perch">${birds || '<div class="empty-wire">No birds yet 🪹</div>'}</div>
    <div class="ledge">
      <span class="price" data-led="actions">⚡ <b>${t.actions}</b> actions</span><span class="price" data-led="triggers">🎯 <b>${t.triggers}</b> triggers</span>
      <span class="price" data-led="open">📜 <b>${Object.values(t.open_by_status || {}).reduce((a, b) => a + b, 0)}</b> open</span><span class="price" data-led="stuck">🧱 <b>${(t.open_by_status || {}).stuck || 0}</b> stuck</span>
    </div>
  </section>`;
}

function wireBirds(today, logs) {
  document.querySelectorAll('[data-bird]').forEach((el) => {
    el.onclick = () => {
      el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
      const m = (today.members || []).find((x) => String(x.id) === el.dataset.bird);
      if (!m) return;
      const log = logs.find((l) => l.member_id === m.id) || {};
      setTimeout(() => modal(`<div class="paper-head"><div class="bird-mini">${birdSvg((today.members || []).indexOf(m), birdMood(m, log, istHour()).mood)}</div>
        <div><h2 style="margin:0">${esc(m.name)}</h2><div class="muted">${m.role === 'growth' ? 'Growth' : 'Plugin builder'} · Level ${m.level} · ${m.xp} XP</div></div></div>
        <div class="kpis" style="margin-top:14px">${kpi(m.actions, 'Actions today')}${kpi(m.triggers, 'Triggers today')}${kpi(`${m.requests_completed}/${m.requests_assigned}`, 'Requests')}</div>
        <h3>Morning plan</h3><pre class="report">${esc(log.morning_text || 'Not posted yet')}</pre>
        <h3 style="margin-top:12px">Evening update</h3><pre class="report">${esc(log.evening_text || 'Not posted yet')}</pre>
        <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn" data-close>Close</button></div>`), 380);
    };
  });
}

// Medal for the top three on the leaderboard
function medal(rank) {
  const c = ['#f5c542', '#c7cbd6', '#d98c4a'][rank];
  const ribbon = ['#d9453b', '#7b6fd6', '#2aa3b8'][rank];
  return `<svg viewBox="0 0 32 40" class="medal" aria-label="Rank ${rank + 1}"><path d="M8 0 h6 l4 14 h-6z M24 0 h-6 l-4 14 h6z" fill="${ribbon}" stroke="#1e1830" stroke-width="1.5"/><circle cx="16" cy="25" r="11" fill="${c}" stroke="#1e1830" stroke-width="2.5"/><path d="M16 18 l2.2 4.6 5 .6 -3.7 3.4 1 5 -4.5 -2.5 -4.5 2.5 1 -5 -3.7 -3.4 5 -.6z" fill="#fff" opacity=".85"/></svg>`;
}

function skyPhase(h) { return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 16.5 ? 'day' : h >= 16.5 && h < 19.5 ? 'dusk' : 'night'; }

function flyerSvg() {
  return `<svg viewBox="0 0 60 40" class="flyer-svg"><path class="fw1" d="M28 18 Q14 0 4 8 Q16 12 26 22Z" fill="#9a8fe0" stroke="#1e1830" stroke-width="2"/>
    <ellipse cx="32" cy="24" rx="14" ry="10" fill="#7b6fd6" stroke="#1e1830" stroke-width="2.5"/><circle cx="40" cy="21" r="3.5" fill="#fff"/><circle cx="41" cy="21" r="1.6" fill="#1e1830"/>
    <path d="M45 24 l7 2 -7 3z" fill="#f5a623" stroke="#1e1830" stroke-width="1.5"/><path class="fw2" d="M30 20 Q24 2 12 4 Q22 12 30 24Z" fill="#b4a9f2" stroke="#1e1830" stroke-width="2"/></svg>`;
}

// ---------- reactions: something happened → something moves ----------
let townLastAct = null;
let flyerBusy = false;
function birdReact(st) {
  if (!document.querySelector('.town')) { townLastAct = null; return; }
  const top = st.activity[0] ? st.activity[0].id : 0;
  if (townLastAct === null) { townLastAct = top; return; }
  const fresh = st.activity.filter((a) => a.id > townLastAct).reverse().slice(-5);
  townLastAct = top;
  fresh.forEach((a, i) => setTimeout(() => reactTo(a, st), i * 900));
  // ledge counters bump when a number changes
  const t = st.today_metrics.totals;
  const vals = { actions: t.actions, triggers: t.triggers, open: Object.values(t.open_by_status || {}).reduce((x, y) => x + y, 0), stuck: (t.open_by_status || {}).stuck || 0 };
  Object.entries(vals).forEach(([k, v]) => {
    const el = document.querySelector(`[data-led="${k}"]`); if (!el) return;
    const b = el.querySelector('b');
    if (b && b.textContent !== String(v)) { b.textContent = v; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
}
function reactTo(a, st) {
  const ms = st.today_metrics.members || [];
  const who = ms.find((m) => a.message.toLowerCase().includes(m.name.toLowerCase()) || a.message.toLowerCase().includes(m.name.replace(/\s*\(.*\)/, '').toLowerCase() + ' '));
  const win = /complete|pass ✅|passed|unblock|published|Weekly report/i.test(a.message);
  const bad = a.level === 'error' || /stuck|fail|missing/i.test(a.message);
  if (who) {
    const el = document.querySelector(`[data-bird="${who.id}"]`);
    if (!el) return flyNote(a.message);
    const say = el.querySelector('.say');
    const old = say.textContent, oldCls = say.className;
    say.textContent = a.message.replace(who.name, '').replace(/^[\s:—-]+/, '').slice(0, 38) || old;
    say.className = 'say ' + (bad ? 'bad' : win ? 'good' : '');
    say.style.animation = 'none'; void say.offsetWidth; say.style.animation = '';
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
    burst(el, win ? 'confetti' : 'feathers');
    setTimeout(() => { say.textContent = old; say.className = oldCls; }, 5000);
  } else {
    flyNote(a.message);
    if (win) burst(document.querySelector('.town-title'), 'confetti');
  }
}
function flyNote(text) {
  const f = document.querySelector('.flyer'); if (!f || flyerBusy) return;
  flyerBusy = true;
  f.querySelector('.note').textContent = text.slice(0, 46);
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  setTimeout(() => { f.classList.remove('go'); flyerBusy = false; }, 7000);
}
function burst(anchor, kind) {
  const fx = document.getElementById('townFx'); if (!fx || !anchor) return;
  const town = fx.parentElement.getBoundingClientRect(), r = anchor.getBoundingClientRect();
  const x = r.left - town.left + r.width / 2, y = r.top - town.top + r.height / 2;
  const colors = kind === 'confetti' ? ['#f5c542', '#7cc242', '#e2483d', '#2aa3b8', '#e0628f', '#fff'] : ['#fff', '#e4dcf0', '#b4a9f2'];
  for (let i = 0; i < (kind === 'confetti' ? 26 : 10); i++) {
    const p = document.createElement('i');
    p.className = kind === 'confetti' ? 'conf' : 'feather';
    const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 90;
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 30}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * .12}s`;
    fx.appendChild(p);
    setTimeout(() => p.remove(), 1800);
  }
}
// ambient: the messenger bird crosses the sky now and then even when nothing happens
setInterval(() => {
  if (document.hidden || !document.querySelector('.town') || flyerBusy) return;
  const f = document.querySelector('.flyer'); flyerBusy = true;
  f.querySelector('.note').textContent = '';
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  setTimeout(() => { f.classList.remove('go'); flyerBusy = false; }, 7000);
}, 26000);
