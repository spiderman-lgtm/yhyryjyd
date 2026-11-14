/* The lake: every team member is an (original) pixel bird resting on the banks above the
   dashboard. Mood comes from today's data: happy (posted + output), busy (morning plan only),
   worried (a stuck request), sleepy (no update yet). Click a bird to see the details. */

const BIRD_COLORS = [
  ['#7b6fd6', '#a99ff0'], ['#2aa3b8', '#7fd3df'], ['#f08a3c', '#ffc08c'], ['#e0628f', '#f6a7c2'],
  ['#5fb84a', '#a5e08f'], ['#d9b032', '#f3dc86'], ['#4f86d9', '#9dc1f3'], ['#9a6bc4', '#cfb0ea'],
];

// Pixel bird (14×14 grid). Moods: happy (wing up), busy, worried (brows), sleepy (eyes shut).
function birdSvg(i, mood) {
  const [c, belly] = BIRD_COLORS[i % BIRD_COLORS.length];
  const K = '#2d2a26', O = '#f2a93b', W = '#fffaf0';
  const r = (x, y, w, h, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`;
  const eye = mood === 'sleepy' ? r(8, 5, 2, 1, K) : r(8, 4, 2, 2, W) + r(9, 4, 1, 1, K);
  const brow = mood === 'worried' ? r(8, 3, 2, 1, K) : '';
  const wing = mood === 'happy' ? `<g class="pwing">${r(3, 4, 3, 3, K)}${r(3, 5, 2, 1, c)}</g>` : `<g class="pwing">${r(3, 7, 4, 3, 'rgba(0,0,0,.18)')}</g>`;
  return `<svg viewBox="0 0 14 14" class="bird-svg" shape-rendering="crispEdges" aria-hidden="true">
    ${r(6, 0, 1, 2, K)}${r(7, 1, 1, 1, K)}
    ${r(4, 2, 7, 1, K)}${r(3, 3, 9, 1, K)}${r(2, 4, 11, 6, K)}${r(3, 10, 9, 1, K)}
    ${r(4, 3, 7, 1, c)}${r(3, 4, 9, 6, c)}${r(6, 6, 5, 4, belly)}
    ${r(0, 7, 3, 2, K)}${r(1, 7, 2, 1, c)}
    ${wing}${eye}${brow}
    ${r(12, 6, 2, 1, O)}${r(12, 7, 1, 1, O)}
    ${r(5, 11, 1, 2, O)}${r(8, 11, 1, 2, O)}${r(4, 13, 3, 1, O)}${r(7, 13, 3, 1, O)}
  </svg>`;
}

// Mood and words come from the work itself (what shipped, what is in progress), never from counts.
function birdMood(m, log, nowHour) {
  const wv = (typeof state !== 'undefined' && state.week_value) || { outcomes: [], people: [] };
  const me = (wv.people || []).find((p) => p.id === m.id) || { working_on: [] };
  const short = (t) => (t.length > 22 ? t.slice(0, 21) + '…' : t);
  const blocked = me.working_on.find((w) => w.status === 'stuck');
  if (blocked) return { mood: 'worried', say: `Blocked: ${short(blocked.title)}`, cls: 'bad' };
  const shipped = (wv.outcomes || []).find((o) => o.who.includes(m.id) && o.date === state.today);
  if (shipped) return { mood: 'happy', say: `Shipped: ${short(shipped.title)}`, cls: 'good' };
  const busy = me.working_on[0];
  if (busy) return { mood: 'busy', say: `Working on ${short(busy.title)}`, cls: '' };
  if (log.evening_text) return { mood: 'happy', say: 'Day wrapped up', cls: 'good' };
  if (log.morning_text) return { mood: 'busy', say: 'Plan is in', cls: '' };
  if (nowHour >= 11.5) return { mood: 'sleepy', say: 'No update yet', cls: 'warn' };
  return { mood: 'busy', say: 'Good morning!', cls: '' };
}

function istHour() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':');
  return Number(p[0]) + Number(p[1]) / 60;
}

function greetWord(h) { return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function birdScene(today, logs) {
  const ms = today.members || [];
  const h = istHour();
  const t = today.totals;
  const who = (typeof myName === 'string' && myName) ? myName.split(' ')[0]
    : (typeof myEmail === 'string' && myEmail) ? myEmail.split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0] : 'lead';
  const name = who ? who[0].toUpperCase() + who.slice(1) : 'lead';
  const ph = skyPhase(h);
  const birds = ms.map((m, i) => {
    const log = logs.find((l) => l.member_id === m.id) || {};
    const b = birdMood(m, log, h);
    return `<button class="bird ${b.mood}" style="--i:${i}" data-bird="${m.id}" title="${esc(m.name)}: ${esc(b.say)}">
      <span class="say ${b.cls}">${esc(b.say)}</span>
      ${b.mood === 'sleepy' ? '<span class="zzz">z<b>z</b><i>z</i></span>' : ''}
      <span class="bw">${birdSvg(i, b.mood)}</span>
      <span class="tag">${esc(m.name.replace(/\s*\(.*\)/, ''))}</span>
    </button>`;
  }).join('');
  const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date());
  return `<section class="lake-banner sky-${ph}" aria-label="Your team at the lake">
    <div class="lb-scene">${window.lakeSvg ? lakeSvg({ viewBox: '0 -60 320 180' }) : ''}</div>
    <div class="lb-text">
      <h2>${greetWord(h)}, ${esc(name)}.</h2>
      <p>${ms.length ? 'A calm team ships steadily 🌿' : 'Add your team in Settings — they will gather by the lake.'}</p>
    </div>
    <div class="lb-clock"><span>${ph === 'night' ? '🌙' : ph === 'dusk' ? '🌇' : ph === 'dawn' ? '🌅' : '☀️'}</span><b>${clock}</b><small>${ph === 'day' ? 'Clear' : ph === 'night' ? 'Quiet night' : ph === 'dusk' ? 'Golden hour' : 'Fresh start'}</small></div>
    <div class="perch">${birds}</div>
    <div class="flyer" aria-hidden="true">${flyerSvg()}<span class="note"></span></div>
    <div class="fx" id="townFx"></div>
  </section>`;
}

// Sit each bird on the grassy banks of the lake (never on the water), whatever the banner size.
function placeBirds() {
  const box = document.querySelector('.lake-banner'); if (!box) return;
  const svg = box.querySelector('.lb-scene svg');
  const cw = box.clientWidth, ch = box.clientHeight;
  // wide banner: fit the whole scene height (pines continue past the sides); narrow: crop like a photo
  let scale, x0, bottomY;
  if (cw / ch > 320 / 118) {
    if (svg) { svg.setAttribute('viewBox', '0 2 320 118'); svg.setAttribute('preserveAspectRatio', 'xMidYMax meet'); }
    scale = ch / 118; bottomY = 120;
  } else {
    if (svg) { svg.setAttribute('viewBox', '0 -60 320 180'); svg.setAttribute('preserveAspectRatio', 'xMidYMax slice'); }
    scale = Math.max(cw / 320, ch / 180); bottomY = 120;
  }
  const visW = cw / scale; x0 = (320 - visW) / 2;
  const bankPx = (bottomY - 92) * scale;  // grass line, measured from the bottom edge
  const spots = [];
  const L = [], R = [];
  for (let x = 92; x >= Math.max(x0 + 8, -110); x -= 30) L.push(x);                 // left bank (the fishing bird sits at ~116)
  for (let x = 240; x <= Math.min(x0 + visW - 8, 430); x += 30) R.push(x);          // right bank
  for (let i = 0; i < Math.max(L.length, R.length); i++) { if (L[i] !== undefined) spots.push(L[i]); if (R[i] !== undefined) spots.push(R[i]); }
  const leftBank = [Math.max(x0 + 8, -110), 100], rightBank = [232, Math.min(x0 + visW - 8, 430)];
  [...box.querySelectorAll('.bird')].forEach((b, i) => {
    const sx = spots[i % Math.max(1, spots.length)];
    const bank = sx < 160 ? leftBank : rightBank;
    b.dataset.min = (bank[0] - x0) * scale; b.dataset.max = (bank[1] - x0) * scale;
    b.style.left = `${(sx - x0) * scale}px`;
    b.style.bottom = `${bankPx - 1}px`;
    b.style.setProperty('--px', `${Math.max(2, Math.round(scale * 0.9))}px`);
  });
}
window.addEventListener('resize', () => { if (document.querySelector('.lake-banner')) placeBirds(); });

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
  if (!document.querySelector('.lake-banner')) { townLastAct = null; return; }
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
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop', 'talk');
    burst(el, win ? 'confetti' : 'feathers');
    setTimeout(() => { say.textContent = old; say.className = oldCls; el.classList.remove('talk'); }, 5000);
  } else {
    flyNote(a.message);
    if (win) burst(document.querySelector('.lb-text h2'), 'confetti');
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
  if (document.hidden || !document.querySelector('.lake-banner') || flyerBusy) return;
  const f = document.querySelector('.flyer'); flyerBusy = true;
  f.querySelector('.note').textContent = '';
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  setTimeout(() => { f.classList.remove('go'); flyerBusy = false; }, 7000);
}, 26000);

// ---------- idle life: birds wander, peck, flap, hop, turn and take short flights ----------
const BEHAVIOURS = ['walk', 'walk', 'peck', 'peck', 'flap', 'hop', 'turn', 'fly'];
function liveBird() {
  if (document.hidden) return;
  const birds = [...document.querySelectorAll('.lake-banner .bird')].filter((b) => !b.classList.contains('busy-move'));
  if (!birds.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = birds[Math.floor(Math.random() * birds.length)];
  if (b.classList.contains('sleepy') && Math.random() < 0.7) return; // sleepy birds mostly keep napping
  const act = BEHAVIOURS[Math.floor(Math.random() * BEHAVIOURS.length)];
  const done = (ms) => setTimeout(() => b.classList.remove('busy-move', 'walking', 'peck', 'flap', 'fly'), ms);
  b.classList.add('busy-move');
  if (act === 'walk') {
    const min = +b.dataset.min || 0, max = +b.dataset.max || 0, cur = parseFloat(b.style.left) || 0;
    let to = cur + (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 40);
    to = Math.max(min, Math.min(max, to));
    b.classList.toggle('face-left', to < cur);
    b.classList.add('walking');
    b.style.left = `${to}px`;
    done(1300);
  } else if (act === 'turn') { b.classList.toggle('face-left'); done(300); }
  else if (act === 'hop') { b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop'); done(500); }
  else { b.classList.add(act); done(act === 'fly' ? 2300 : 1200); }
}
setInterval(liveBird, 1400);
