/* Forge Village — an original isometric base where the team's work is visible.
   - Each agent has a building; its level (height) grows with that agent's real workload.
   - Team members walk house → workshop → vault carrying crates (actions blue, triggers orange,
     apps green); how often they make the trip follows today's output.
   - Agents patrol between their building and the places they work with; new activity sends the
     right agent sprinting home with a speech bubble, and its building smokes.
   Canvas 2D, isometric 2:1 tiles, sorted by depth every frame. */

(function () {
const V = { tw: 64, th: 32, N: 18 };
let vil = null; // live state of the village while the tab is open

const BLD = [
  // key, name, grid x,y, footprint w,d, base colours, roof style
  { key: 'commander', name: 'Castle', x: 8, y: 8, w: 3, d: 3, c: ['#c9c2b2', '#a69d89', '#8a8170'], roof: 'battlement', flag: '#e8655a' },
  { key: 'scout', name: 'Watchtower', x: 3, y: 4, w: 1, d: 1, c: ['#c79a6b', '#a77c51', '#8a643f'], roof: 'pyramid', roofC: '#d65a4e', tall: 1.8 },
  { key: 'tracker', name: 'Command Tent', x: 6, y: 3, w: 2, d: 2, c: ['#e9c46a', '#d1ad55', '#b89443'], roof: 'tent' },
  { key: 'growth', name: 'Greenhouse', x: 12, y: 3, w: 2, d: 2, c: ['#b8e0d2', '#94c7b6', '#78ad9b'], roof: 'glass' },
  { key: 'inspector', name: 'Lab', x: 13, y: 7, w: 2, d: 2, c: ['#d6dbe8', '#b4bbcc', '#959db2'], roof: 'dome', roofC: '#7b8ec9' },
  { key: 'analyst', name: 'Observatory', x: 13, y: 12, w: 2, d: 2, c: ['#e7ddc8', '#cbbfa6', '#aea28a'], roof: 'dome', roofC: '#5f6fb5' },
  { key: 'herald', name: 'Bell Tower', x: 4, y: 12, w: 1, d: 1, c: ['#cbb79c', '#ac9a80', '#8f7f67'], roof: 'pyramid', roofC: '#3d7bd9', tall: 2 },
  { key: 'scribe', name: 'Library', x: 7, y: 13, w: 3, d: 2, c: ['#efe3c6', '#d6c8a6', '#bba98a'], roof: 'gable', roofC: '#8e5bd1' },
];
const SPOTS = {
  gate: { x: 9, y: 16.6 }, forge: { x: 4.5, y: 8.5 }, vault: { x: 11.2, y: 15 }, launch: { x: 13.6, y: 16.3 },
};
// The journey of one piece of work, station by station
const STORY = [
  { at: 'gate', icon: '📨', label: 'Message in', item: '✉️' },
  { at: 'scout', icon: '🔭', label: 'Scout reads', item: '✉️' },
  { at: 'tracker', icon: '🎯', label: 'Assigned', item: '📜' },
  { at: 'forge', icon: '🔨', label: 'Building', item: '📜' },
  { at: 'inspector', icon: '🔍', label: 'Review', item: '📦' },
  { at: 'commander', icon: '👑', label: 'Lead approves', item: '📦' },
  { at: 'launch', icon: '🚀', label: 'Published', item: '✅' },
];
const STOP_AT = { new: 2, rnd: 3, started: 3, stuck: 3, completed: 6 };
const MEMBER_COLORS = ['#7b6fd6', '#2aa3b8', '#f08a3c', '#e0628f', '#5fb84a', '#d9b032', '#4f86d9', '#9a6bc4'];
const CRATE = { actions: '#3987e5', triggers: '#eb6834', apps: '#1baf7a', verified: '#f5c542' };
// where each agent walks while it works
const PATROL = {
  scout: ['scout', 'gate', 'tracker'], tracker: ['tracker', 'commander'], growth: ['growth', 'gate'],
  inspector: ['inspector', 'forge'], analyst: ['analyst', 'vault'], herald: ['herald', 'commander'],
  scribe: ['scribe', 'analyst'], commander: ['commander', 'gate'],
};
const AGENT_LOOK = {
  scout: ['#c79a6b', '🔭'], tracker: ['#e9c46a', '🎯'], growth: ['#5fb84a', '🌱'], inspector: ['#7b8ec9', '🔍'],
  analyst: ['#5f6fb5', '📊'], herald: ['#3d7bd9', '📢'], scribe: ['#8e5bd1', '📜'], commander: ['#e8655a', '⚔️'],
};

function renderVillage() {
  const w = state.week_metrics.totals;
  $('#view').innerHTML = `
    <div class="vil-wrap">
      <div class="vil-hud">
        <div class="res-bar" title="Outcomes delivered this week"><span>✅</span><b data-r="delivered">${state.week_value.delivered}</b><small>outcomes</small></div>
        <div class="res-bar" title="Median time from request to live"><span>⏱️</span><b data-r="ttv">${state.week_value.time_to_value_h ?? '–'}</b><small>h to value</small></div>
        <div class="res-bar" title="Reviews passed first time"><span>✨</span><b data-r="fp">${state.week_value.first_pass_pct ?? '–'}</b><small>% first-pass</small></div>
        <span class="spacer"></span>
        <div class="vil-legend">1 crate = 1 delivered outcome · <i style="background:${CRATE.actions}"></i>request <i style="background:${CRATE.apps}"></i>task <i style="background:#f5c542"></i>verified</div>
      </div>
      <div class="vil-story" id="vilStory" aria-live="polite"><div class="vs-title" id="vsTitle">Watching the next piece of work…</div><div class="vs-steps">${STORY.map((st, i) => `<span class="vs-step" data-s="${i}"><i>${st.icon}</i>${st.label}</span>`).join('<b class="vs-arrow">›</b>')}</div></div>
      <canvas id="vilCanvas" aria-label="Forge Village: agents and the team at work"></canvas>
      <div class="vil-tip" id="vilTip"></div>
      <div class="vil-ticker" id="vilTicker">${state.activity[0] ? `${AGENT_EMOJI[state.activity[0].agent] || '•'} ${esc(state.activity[0].message)}` : 'Waiting for the first bit of work…'}</div>
    </div>
    <h2 style="margin-top:18px">Team outcomes — this week</h2>
    <div class="heroes">${state.week_metrics.members.map((m) => heroCard(m)).join('') || '<div class="empty">No members yet. Add them in Settings.</div>'}</div>`;
  startVillage();
  api('/api/requests').then((r) => { if (vil) { vil.jobs = r; vil.jobsAt = Date.now(); } }).catch(() => {});
}

// ---------- engine ----------
function startVillage() {
  const canvas = $('#vilCanvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (vil) cancelAnimationFrame(vil.raf);
  vil = { canvas, ctx, units: [], fx: [], bubbles: [], lastAct: state.activity[0] ? state.activity[0].id : 0, t0: performance.now(), hover: null };
  resizeVillage();
  buildWorld();
  canvas.onmousemove = (e) => villageHover(e);
  canvas.onmouseleave = () => { vil.hover = null; $('#vilTip').classList.remove('on'); };
  canvas.onclick = () => { if (vil.hover && vil.hover.key) agentModal(vil.hover.key); };
  const me = vil;
  const loop = (t) => {
    if (vil !== me) return;                                        // a newer village took over
    if (!document.body.contains(canvas)) { vil = null; return; }   // the tab was left
    stepVillage(t); drawVillage(t);
    me.raf = requestAnimationFrame(loop);
  };
  vil.raf = requestAnimationFrame(loop);
}
window.addEventListener('resize', () => { if (vil) resizeVillage(); });

function resizeVillage() {
  if (vil) vil.terrain = null;
  const c = vil.canvas, box = c.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = box.width, H = Math.max(420, Math.min(720, W * 0.62));
  c.style.height = H + 'px'; c.width = W * dpr; c.height = H * dpr;
  const mapW = V.N * V.tw, mapH = V.N * V.th + 120;
  vil.scale = Math.min(W / mapW, H / mapH) * 0.98;
  vil.ox = W / 2; vil.oy = (H - (V.N * V.th) * vil.scale) / 2 + 60 * vil.scale;
  vil.dpr = dpr; vil.W = W; vil.H = H;
}
function iso(x, y, z = 0) {
  return { x: vil.ox + (x - y) * V.tw / 2 * vil.scale, y: vil.oy + (x + y) * V.th / 2 * vil.scale - z * vil.scale };
}

// levels from real work
function levels() {
  const wk = state.week_metrics.totals, td = state.today_metrics.totals;
  const ms = state.week_metrics.members || [];
  const sum = (k) => ms.reduce((a, m) => a + (m[k] || 0), 0);
  const L = (v, step) => Math.max(1, Math.min(5, 1 + Math.floor((v || 0) / step)));
  // levels grow with value: outcomes, verified outcomes, blockers cleared, first-pass quality
  const v = state.week_value || {};
  return {
    commander: L(v.verified, 1), scout: L(sum('morning_updates') + sum('evening_updates'), 6),
    tracker: L(v.delivered, 1), growth: L(v.blockers_cleared, 1), inspector: L((v.first_pass_pct || 0) / 25, 1),
    analyst: L(v.delivered, 2), herald: L(sum('workdays'), 4), scribe: L(v.verified, 2),
  };
}

function buildWorld() {
  const ms = state.today_metrics.members || [];
  vil.units = [];
  // houses for the team along the west and south
  vil.houses = ms.map((m, i) => ({ m, x: 2 + (i % 4) * 2.2, y: 15 - Math.floor(i / 4) * 2.2, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }));
  vil.houses.forEach((h) => {
    const m = h.m, me = (state.week_value.people || []).find((p) => p.id === m.id) || { outcomes: [], working_on: [] };
    const out = me.outcomes.length + me.working_on.length;
    const mix = me.outcomes.length ? ['actions'] : [];
    vil.units.push({ kind: 'worker', m, color: h.color, home: { x: h.x + 0.5, y: h.y + 1.2 }, x: h.x + 0.5, y: h.y + 1.2,
      route: out ? ['forge', 'vault', 'home'] : [], step: 0, speed: 1.1 + Math.min(1.4, out / 6), mix: mix.length ? mix : ['actions'], carry: null, wait: Math.random() * 2, idle: !out });
  });
  // agents
  state.agents.forEach((a) => {
    const route = PATROL[a.key] || [a.key];
    const p = spot(route[0]);
    vil.units.push({ kind: 'agent', key: a.key, x: p.x, y: p.y + 0.6, route, step: 1, speed: 0.9, wait: Math.random() * 3 });
  });
  // crates in the vault from this week's work
  // the vault holds delivered outcomes (not volume): blue = client request, green = task, gold = verified
  vil.crates = (state.week_value.outcomes || []).slice(0, 40).map((o, i) => ({ k: o.verified ? 'verified' : o.kind === 'task' ? 'apps' : 'actions', i }));
}
function spot(name) {
  if (SPOTS[name]) return SPOTS[name];
  const b = BLD.find((x) => x.key === name);
  return b ? { x: b.x + b.w / 2, y: b.y + b.d + 0.5 } : SPOTS.gate;
}

function stepVillage(t) {
  const dt = Math.min(0.05, (t - (vil.last || t)) / 1000); vil.last = t;
  const working = new Set(state.agents.filter((a) => a.state === 'working').map((a) => a.key));
  vil.units.forEach((u) => {
    if (u.wait > 0) { u.wait -= dt; return; }
    let target;
    if (u.kind === 'worker') {
      if (u.idle) return;
      const r = u.route[u.step % u.route.length];
      target = r === 'home' ? u.home : spot(r);
    } else {
      if (u.sprint) target = spot(u.sprint);
      else target = spot(u.route[u.step % u.route.length]);
    }
    const dx = target.x - u.x, dy = target.y - u.y, dist = Math.hypot(dx, dy);
    const sp = (u.sprint ? 3.2 : u.speed * (u.kind === 'agent' && working.has(u.key) ? 2 : 1)) * dt;
    if (dist < 0.05) {
      if (u.kind === 'worker') {
        const r = u.route[u.step % u.route.length];
        if (r === 'forge') { u.carry = u.mix[Math.floor(Math.random() * u.mix.length)]; sparks(target, 6); u.wait = 1.2; }
        else if (r === 'vault') { u.carry = null; u.wait = 0.5; }
        else u.wait = 2 + Math.random() * 3;
        u.step++;
      } else {
        if (u.sprint) { u.sprint = null; u.wait = 2.5; smoke(spot(u.key)); }
        else { u.step++; u.wait = 1 + Math.random() * 3; }
      }
      return;
    }
    u.x += dx / dist * Math.min(sp, dist); u.y += dy / dist * Math.min(sp, dist);
    u.face = dx - dy < 0 ? -1 : 1; u.walk = (u.walk || 0) + dt * 10;
  });
  // agents that are "working" keep their building smoking
  if (Math.random() < 0.08) working.forEach((k) => smoke(spot(k), true));
  vil.fx = vil.fx.filter((p) => (p.life -= dt) > 0);
  vil.fx.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= (p.g || 0) * dt; });
  vil.bubbles = vil.bubbles.filter((b) => (b.life -= dt) > 0);
  stepStory(dt);
}
function sparks(p, n) { for (let i = 0; i < n; i++) vil.fx.push({ kind: 'spark', x: p.x, y: p.y - 0.4, z: 20, vx: (Math.random() - .5) * .8, vy: (Math.random() - .5) * .8, vz: 40 + Math.random() * 40, g: 120, life: .7 }); }
function smoke(p, soft) { for (let i = 0; i < (soft ? 1 : 5); i++) vil.fx.push({ kind: 'smoke', x: p.x - 0.3 + Math.random() * .3, y: p.y - 1.2, z: 60, vx: .05, vy: -.05, vz: 18 + Math.random() * 10, life: 2.2 }); }
function confetti(p) { for (let i = 0; i < 30; i++) vil.fx.push({ kind: 'conf', c: ['#f5c542', '#7cc242', '#e2483d', '#2aa3b8', '#e0628f'][i % 5], x: p.x, y: p.y - 1, z: 80, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2, vz: 60 + Math.random() * 60, g: 90, life: 1.6 }); }

// ---------- drawing ----------
function poly(ctx, pts, fill, stroke) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
function tile(ctx, x, y, fill, stroke) { poly(ctx, [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)], fill, stroke); }
function box(ctx, x, y, w, d, z0, h, [top, left, right]) {
  const A = (a, b, z) => iso(a, b, z);
  poly(ctx, [A(x, y + d, z0), A(x + w, y + d, z0), A(x + w, y + d, z0 + h), A(x, y + d, z0 + h)], left);   // south-west face
  poly(ctx, [A(x + w, y, z0), A(x + w, y + d, z0), A(x + w, y + d, z0 + h), A(x + w, y, z0 + h)], right);  // south-east face
  poly(ctx, [A(x, y, z0 + h), A(x + w, y, z0 + h), A(x + w, y + d, z0 + h), A(x, y + d, z0 + h)], top);
}

function drawVillage(t) {
  const { ctx, dpr } = vil;
  const dark = document.documentElement.dataset.theme === 'dark';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vil.W, vil.H);
  ctx.drawImage(terrain(dark), 0, 0, vil.W, vil.H);
  const items = [];
  // walls (perimeter, with a gate)
  for (let i = 1; i < V.N - 1; i++) {
    items.push({ d: 1 + i, draw: () => wallSeg(ctx, i, 1, dark) });
    items.push({ d: i + 1, draw: () => wallSeg(ctx, 1, i, dark) });
    if (i !== 9) items.push({ d: i + V.N - 1, draw: () => wallSeg(ctx, i, V.N - 2, dark) });
    items.push({ d: V.N - 1 + i, draw: () => wallSeg(ctx, V.N - 2, i, dark) });
  }
  // river shimmer
  for (let i = 0; i < 18; i++) { const k = (t / 1800 + i / 18) % 1, y = -6 + k * (V.N + 12); items.push({ d: -99, draw: () => { const q = iso(V.N + 2.5, y); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(q.x - 6 * vil.scale, q.y, 12 * vil.scale, 1.5); } }); }
  // launch pad (publish)
  items.push({ d: SPOTS.launch.x + SPOTS.launch.y, draw: () => launchPad(ctx, t, dark) });
  // forge (workshop) and vault
  items.push({ d: SPOTS.forge.x + SPOTS.forge.y, draw: () => forge(ctx, t, dark) });
  items.push({ d: 11 + 15.5, draw: () => vault(ctx, dark) });
  // houses
  (vil.houses || []).forEach((h) => items.push({ d: h.x + h.y + 2, draw: () => house(ctx, h, dark) }));
  // agent buildings
  const lv = levels();
  const working = new Set(state.agents.filter((a) => a.state === 'working').map((a) => a.key));
  const errored = new Set(state.agents.filter((a) => a.state === 'error').map((a) => a.key));
  BLD.forEach((b) => items.push({ d: b.x + b.y + b.w + b.d, draw: () => building(ctx, b, lv[b.key] || 1, working.has(b.key), errored.has(b.key), t, dark) }));
  // units
  vil.units.forEach((u) => items.push({ d: u.x + u.y, draw: () => unit(ctx, u, t, errored) }));
  if (vil.story) items.push({ d: vil.story.x + vil.story.y, draw: () => courier(ctx, vil.story, t) });
  // fx
  vil.fx.forEach((p) => items.push({ d: p.x + p.y + 0.5, draw: () => fx(ctx, p) }));
  items.sort((a, b) => a.d - b.d).forEach((i) => i.draw());
  // labels on top
  BLD.forEach((b) => label(ctx, b, lv[b.key] || 1, working.has(b.key)));
  vil.bubbles.forEach((bb) => bubble(ctx, bb));
}
// Pre-render ground, roads, river and the wild land outside the wall (redrawn on resize/theme).
function seeded(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function terrain(dark) {
  const key = `${vil.W}x${vil.H}:${dark}`;
  if (vil.terrain && vil.terrain.key === key) return vil.terrain.cv;
  const cv = document.createElement('canvas'); cv.width = vil.W * vil.dpr; cv.height = vil.H * vil.dpr;
  const c = cv.getContext('2d'); c.setTransform(vil.dpr, 0, 0, vil.dpr, 0, 0);
  const M = 22, river = (x, y) => Math.abs((x - y) - 13) < 1.4 && (x < 1 || y > V.N - 2 || x > V.N - 2 || y < 1) || (x >= V.N + 2 && x <= V.N + 3);
  const decos = [];
  for (let y = -M; y < V.N + M; y++) for (let x = -M; x < V.N + M; x++) {
    const inside = x >= 1 && y >= 1 && x < V.N - 1 && y < V.N - 1;
    const r = seeded(x * 977 + y * 131);
    let g;
    if (inside) g = (x + y) % 2 ? '#8cc56a' : '#84bf62';
    else if (river(x, y)) g = (x + y) % 2 ? '#5aa9d6' : '#4f9fcf';
    else g = r < 0.5 ? '#6cab55' : r < 0.8 ? '#66a44f' : '#72b25a';
    tile(c, x, y, dark ? shade(g, -0.48) : g);
    if (!inside && !river(x, y) && (x < 0 || y < 0 || x > V.N - 1 || y > V.N - 1)) {
      if (r > 0.82) decos.push({ x, y, k: 'pine' }); else if (r > 0.76) decos.push({ x, y, k: 'rock' }); else if (r > 0.72) decos.push({ x, y, k: 'bush' }); else if (r > 0.70) decos.push({ x, y, k: 'flower' });
    }
  }
  const road = dark ? '#6b5d48' : '#d8c08a';
  for (let i = 2; i < V.N - 2; i++) { tile(c, i, 11, road); tile(c, 9, i, road); }
  for (let i = 4; i < 15; i++) { tile(c, i, 6, road); tile(c, 11, i, road); }
  for (let y = 11; y < V.N + 6; y++) tile(c, 9, y, road);
  for (let x = 11; x < 16; x++) tile(c, x, 15, road);
  tile(c, 10.5, 14.5, dark ? '#4a4038' : '#b39a6b');
  decos.sort((a, b) => a.x + a.y - b.x - b.y).forEach((d) => {
    const p = iso(d.x + .5, d.y + .5), s = vil.scale;
    if (d.k === 'pine') { c.fillStyle = dk('#5a3d2c', dark); c.fillRect(p.x - 2 * s, p.y - 10 * s, 4 * s, 10 * s); [[26, 16], [19, 12], [12, 8]].forEach(([h, w], i) => { c.fillStyle = dk(i % 2 ? '#3f8a4a' : '#357a40', dark); c.beginPath(); c.moveTo(p.x, p.y - (h + 14) * s); c.lineTo(p.x - w * s, p.y - (h - 6) * s); c.lineTo(p.x + w * s, p.y - (h - 6) * s); c.fill(); }); }
    else if (d.k === 'rock') { c.fillStyle = dk('#9a9a96', dark); c.beginPath(); c.ellipse(p.x, p.y - 5 * s, 13 * s, 8 * s, 0, 0, 7); c.fill(); c.fillStyle = dk('#b8b8b2', dark); c.beginPath(); c.ellipse(p.x - 3 * s, p.y - 8 * s, 7 * s, 4 * s, 0, 0, 7); c.fill(); }
    else if (d.k === 'bush') { c.fillStyle = dk('#4f9a4e', dark); c.beginPath(); c.arc(p.x - 4 * s, p.y - 5 * s, 6 * s, 0, 7); c.arc(p.x + 4 * s, p.y - 5 * s, 6 * s, 0, 7); c.fill(); }
    else { ['#f6c2d4', '#fff2a8', '#ffffff'].forEach((fc, i) => { c.fillStyle = dk(fc, dark); c.fillRect(p.x + (i - 1) * 5 * s, p.y - 3 * s - i % 2 * 3 * s, 3 * s, 3 * s); }); }
  });
  vil.terrain = { key, cv };
  return cv;
}

function shade(col, k) {
  let r, g, b;
  if (String(col).startsWith('rgb')) [r, g, b] = col.match(/[\d.]+/g).map(Number);
  else { const n = parseInt(String(col).slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  r = Math.round(r * (1 + k)); g = Math.round(g * (1 + k)); b = Math.round(b * (1 + k));
  return `rgb(${Math.max(0, Math.min(255, r))},${Math.max(0, Math.min(255, g))},${Math.max(0, Math.min(255, b))})`;
}
const dk = (c, dark) => (dark ? shade(c, -0.35) : c);
function wallSeg(ctx, x, y, dark) { box(ctx, x + .15, y + .15, .7, .7, 0, 14, [dk('#9a94a8', dark), dk('#6f6a80', dark), dk('#5d586d', dark)]); }
function tree(ctx, x, y, dark) {
  const b = iso(x + .5, y + .5); const s = vil.scale;
  ctx.fillStyle = dk('#6b4a35', dark); ctx.fillRect(b.x - 2 * s, b.y - 14 * s, 4 * s, 14 * s);
  ctx.fillStyle = dk('#3f8a4a', dark); ctx.beginPath(); ctx.arc(b.x, b.y - 22 * s, 13 * s, 0, 7); ctx.fill();
  ctx.fillStyle = dk('#56a35f', dark); ctx.beginPath(); ctx.arc(b.x - 4 * s, b.y - 26 * s, 7 * s, 0, 7); ctx.fill();
}
function house(ctx, h, dark) {
  box(ctx, h.x, h.y, 1, 1, 0, 18, [dk('#efe3c6', dark), dk('#d6c8a6', dark), dk('#bba98a', dark)]);
  const p = iso(h.x + .5, h.y + .5, 18 + 16), a = iso(h.x, h.y + 1, 18), b2 = iso(h.x + 1, h.y + 1, 18), c = iso(h.x + 1, h.y, 18);
  poly(ctx, [a, b2, p], dk(h.color, dark)); poly(ctx, [b2, c, p], dk(shade(h.color, -0.2), dark));
  const tag = iso(h.x + .5, h.y + .5, 50); const s = vil.scale;
  ctx.font = `600 ${Math.max(9, 10 * s)}px JetBrains Mono, monospace`; ctx.textAlign = 'center';
  const name = h.m.name.replace(/\s*\(.*\)/, '');
  const w = ctx.measureText(name).width + 10;
  ctx.fillStyle = 'rgba(251,248,241,.92)'; ctx.fillRect(tag.x - w / 2, tag.y - 9, w, 14);
  ctx.fillStyle = '#2c3a33'; ctx.fillText(name, tag.x, tag.y + 2);
}
function forge(ctx, t, dark) {
  const { x, y } = SPOTS.forge;
  box(ctx, x - 1, y - 1.6, 1.6, 1.4, 0, 22, [dk('#8a7a6a', dark), dk('#6b5d50', dark), dk('#574b40', dark)]);
  const c = iso(x - .2, y - 1.3, 22); const s = vil.scale;
  ctx.fillStyle = `rgba(255,${140 + Math.sin(t / 120) * 40},40,.9)`; ctx.beginPath(); ctx.arc(c.x, c.y - 4 * s, 6 * s, 0, 7); ctx.fill();
  const tg = iso(x - .2, y - .9, 46); ctx.font = `600 ${Math.max(9, 10 * s)}px JetBrains Mono, monospace`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(251,248,241,.92)'; const w = ctx.measureText('Workshop').width + 10; ctx.fillRect(tg.x - w / 2, tg.y - 9, w, 14); ctx.fillStyle = '#2c3a33'; ctx.fillText('Workshop', tg.x, tg.y + 2);
}
function vault(ctx, dark) {
  const s = vil.scale;
  (vil.crates || []).forEach((cr) => {
    const col = cr.i % 5, row = Math.floor(cr.i / 5) % 4, lay = Math.floor(cr.i / 20);
    const x = 10.6 + col * 0.19, y = 14.6 + row * 0.19;
    box(ctx, x, y, .17, .17, lay * 9, 9, [dk(shade(CRATE[cr.k], .25), dark), dk(CRATE[cr.k], dark), dk(shade(CRATE[cr.k], -.25), dark)]);
  });
  const tg = iso(11, 15, 52); ctx.font = `600 ${Math.max(9, 10 * s)}px JetBrains Mono, monospace`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(251,248,241,.92)'; const txt = `Vault · ${vil.crates.length}`; const w = ctx.measureText(txt).width + 10; ctx.fillRect(tg.x - w / 2, tg.y - 9, w, 14); ctx.fillStyle = '#2c3a33'; ctx.fillText(txt, tg.x, tg.y + 2);
}
function building(ctx, b, lvl, working, err, t, dark) {
  const h = (18 + lvl * 9) * (b.tall || 1);
  const pulse = working ? Math.sin(t / 150) * 1.5 : 0;
  box(ctx, b.x, b.y, b.w, b.d, 0, h + pulse, b.c.map((c) => dk(c, dark)));
  // windows
  const s = vil.scale; ctx.fillStyle = dark ? '#ffd86b' : 'rgba(60,70,90,.55)';
  for (let i = 0; i < Math.min(lvl, 4); i++) { const p = iso(b.x + b.w, b.y + (i + .5) * b.d / 4, h * .55); ctx.fillRect(p.x - 2 * s, p.y - 4 * s, 4 * s, 6 * s); }
  const top = h + pulse, rc = dk(b.roofC || b.c[2], dark);
  const A = (x, y, z) => iso(x, y, z), cx = b.x + b.w / 2, cy = b.y + b.d / 2;
  if (b.roof === 'pyramid' || b.roof === 'tent') {
    const apex = A(cx, cy, top + (b.roof === 'tent' ? 26 : 20) * Math.max(b.w, 1));
    poly(ctx, [A(b.x, b.y + b.d, top), A(b.x + b.w, b.y + b.d, top), apex], rc);
    poly(ctx, [A(b.x + b.w, b.y + b.d, top), A(b.x + b.w, b.y, top), apex], rc);
    poly(ctx, [A(b.x + b.w, b.y + b.d, top), A(b.x + b.w, b.y, top), apex], 'rgba(0,0,0,.2)');
  } else if (b.roof === 'dome' || b.roof === 'glass') {
    const c = A(cx, cy, top); ctx.fillStyle = b.roof === 'glass' ? 'rgba(200,240,230,.75)' : rc;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, b.w * V.tw * .42 * s, b.w * V.tw * .42 * s, 0, Math.PI, 0); ctx.fill();
  } else if (b.roof === 'gable') {
    const r1 = A(b.x, cy, top + 22), r2 = A(b.x + b.w, cy, top + 22);
    poly(ctx, [A(b.x, b.y + b.d, top), A(b.x + b.w, b.y + b.d, top), r2, r1], rc);
    poly(ctx, [A(b.x + b.w, b.y + b.d, top), A(b.x + b.w, b.y, top), r2], rc);
    poly(ctx, [A(b.x + b.w, b.y + b.d, top), A(b.x + b.w, b.y, top), r2], 'rgba(0,0,0,.2)');
  } else if (b.roof === 'battlement') {
    for (let i = 0; i < 4; i++) { box(ctx, b.x + i * (b.w / 4), b.y + b.d - .3, .25, .3, top, 10, b.c.map((c) => dk(c, dark))); box(ctx, b.x + b.w - .3, b.y + i * (b.d / 4), .3, .25, top, 10, b.c.map((c) => dk(c, dark))); }
    box(ctx, cx - .6, cy - .6, 1.2, 1.2, top, 26, b.c.map((c) => dk(shade(c, .05), dark)));
    const pole = A(cx, cy, top + 26); ctx.strokeStyle = '#4d4d5c'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(pole.x, pole.y); ctx.lineTo(pole.x, pole.y - 26 * s); ctx.stroke();
    ctx.fillStyle = b.flag; ctx.beginPath(); ctx.moveTo(pole.x, pole.y - 26 * s); ctx.lineTo(pole.x + (16 + Math.sin(t / 200) * 3) * s, pole.y - 21 * s); ctx.lineTo(pole.x, pole.y - 16 * s); ctx.fill();
  }
  if (err) { const p = A(cx, cy, top + 40); ctx.fillStyle = '#e2483d'; ctx.beginPath(); ctx.arc(p.x, p.y, 9 * s, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 ${12 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', p.x, p.y + 4 * s); }
  b._screen = { p: iso(cx, cy, top / 2), r: Math.max(b.w, b.d) * V.tw * .45 * s, top: iso(cx, cy, top + 30) };
}
function label(ctx, b, lvl, working) {
  if (!b._screen) return;
  if (vil.scale < 0.55 && !working && vil.hover !== b) return; // small screens: only busy or hovered buildings
  const s = vil.scale, p = b._screen.top;
  ctx.font = `700 ${Math.max(9, 10.5 * s)}px JetBrains Mono, monospace`; ctx.textAlign = 'center';
  const txt = `${b.name}  Lv${lvl}`; const w = ctx.measureText(txt).width + 14;
  ctx.fillStyle = working ? 'rgba(232,101,90,.95)' : 'rgba(44,58,51,.82)';
  roundRect(ctx, p.x - w / 2, p.y - 11, w, 17, 8); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(txt, p.x, p.y + 2);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function unit(ctx, u, t, errored) {
  const s = vil.scale * 1.6, p = iso(u.x, u.y), bob = Math.abs(Math.sin(u.walk || 0)) * 2 * s;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 6 * s, 3 * s, 0, 0, 7); ctx.fill();
  if (u.kind === 'worker') {
    const sleepy = u.idle && !(u.m.morning_updates || u.m.evening_updates);
    ctx.fillStyle = u.color; roundRect(ctx, p.x - 4 * s, p.y - 16 * s - bob, 8 * s, 11 * s, 3 * s); ctx.fill();
    ctx.fillStyle = '#f1c7a1'; ctx.beginPath(); ctx.arc(p.x, p.y - 20 * s - bob, 4.5 * s, 0, 7); ctx.fill();
    ctx.fillStyle = shade(u.color, -0.3); ctx.fillRect(p.x - 5 * s, p.y - 25 * s - bob, 10 * s, 3 * s); // cap
    if (u.carry) { const c = CRATE[u.carry]; ctx.fillStyle = c; ctx.fillRect(p.x - 5 * s, p.y - 34 * s - bob, 10 * s, 8 * s); ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = 1; ctx.strokeRect(p.x - 5 * s, p.y - 34 * s - bob, 10 * s, 8 * s); }
    if (sleepy) { ctx.fillStyle = '#4f6b62'; ctx.font = `700 ${10 * s}px monospace`; ctx.fillText('z', p.x + 8 * s, p.y - 26 * s - (t / 300 % 6)); }
  } else {
    const [col, em] = AGENT_LOOK[u.key] || ['#888', '•'];
    ctx.fillStyle = col; roundRect(ctx, p.x - 5 * s, p.y - 17 * s - bob, 10 * s, 12 * s, 4 * s); ctx.fill();
    ctx.fillStyle = '#fbe3c8'; ctx.beginPath(); ctx.arc(p.x, p.y - 22 * s - bob, 5 * s, 0, 7); ctx.fill();
    ctx.font = `${12 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(em, p.x, p.y - 30 * s - bob);
    if (errored.has(u.key)) { ctx.fillStyle = '#e2483d'; ctx.font = `700 ${12 * s}px sans-serif`; ctx.fillText('!', p.x + 8 * s, p.y - 28 * s); }
  }
  u._screen = p;
}
function fx(ctx, p) {
  const s = vil.scale, q = iso(p.x, p.y, p.z);
  if (p.kind === 'spark') { ctx.fillStyle = `rgba(255,200,60,${p.life / .7})`; ctx.fillRect(q.x, q.y, 2.5 * s, 2.5 * s); }
  else if (p.kind === 'smoke') { ctx.fillStyle = `rgba(230,230,230,${p.life / 2.2 * .7})`; ctx.beginPath(); ctx.arc(q.x, q.y, (8 - p.life * 2) * s, 0, 7); ctx.fill(); }
  else { ctx.fillStyle = p.c; ctx.fillRect(q.x, q.y, 4 * s, 3 * s); }
}
function bubble(ctx, bb) {
  const u = vil.units.find((x) => x.kind === 'agent' && x.key === bb.key); if (!u || !u._screen) return;
  const s = vil.scale, p = u._screen;
  ctx.font = `600 ${Math.max(10, 11 * s)}px JetBrains Mono, monospace`; ctx.textAlign = 'center';
  const txt = bb.text.length > 42 ? bb.text.slice(0, 41) + '…' : bb.text;
  const w = ctx.measureText(txt).width + 16, y = p.y - 52 * s;
  ctx.globalAlpha = Math.min(1, bb.life);
  ctx.fillStyle = bb.good ? '#dcefe3' : bb.bad ? '#fbe1dc' : '#fbf8f1'; roundRect(ctx, p.x - w / 2, y - 14, w, 22, 9); ctx.fill();
  ctx.strokeStyle = 'rgba(44,58,51,.25)'; ctx.stroke();
  ctx.fillStyle = '#2c3a33'; ctx.fillText(txt, p.x, y + 2);
  ctx.globalAlpha = 1;
}

// hover → tooltip with the building's job, click → agent details
function villageHover(e) {
  const r = vil.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let hit = null;
  BLD.forEach((b) => { if (b._screen && Math.hypot(mx - b._screen.p.x, my - b._screen.p.y) < b._screen.r) hit = b; });
  vil.hover = hit; vil.canvas.style.cursor = hit ? 'pointer' : 'default';
  const tip = $('#vilTip');
  if (!hit) { tip.classList.remove('on'); return; }
  const a = state.agents.find((x) => x.key === hit.key) || {};
  tip.innerHTML = `<b>${esc(hit.name)}</b> · ${esc(a.name || '')}<br><span>${esc(a.job || '')}</span><br><small>${esc(a.state === 'working' ? (a.message || 'working…') : a.last_run_at ? 'last run ' + ago(a.last_run_at) : 'ready')}</small>`;
  tip.style.left = Math.min(r.width - 230, mx + 14) + 'px'; tip.style.top = (my + 14) + 'px'; tip.classList.add('on');
}

// called by app.js refresh() every 5 s while the Village is open
function villageUpdate() {
  if (!vil) return;
  if (!vil.jobsAt || Date.now() - vil.jobsAt > 30000) { vil.jobsAt = Date.now(); api('/api/requests').then((r) => { if (vil) vil.jobs = r; }).catch(() => {}); }
  const w = state.week_metrics.totals;
  const wv = state.week_value || {};
  [['delivered', wv.delivered], ['ttv', wv.time_to_value_h ?? '–'], ['fp', wv.first_pass_pct ?? '–']].forEach(([k, val]) => { const el = document.querySelector(`[data-r="${k}"]`); if (el && el.textContent !== String(val)) { el.textContent = val; el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); } });
  const fresh = state.activity.filter((a) => a.id > vil.lastAct).reverse();
  if (!fresh.length) return;
  vil.lastAct = state.activity[0].id;
  // output changed → rebuild workers/crates so the map matches the numbers
  buildWorld();
  fresh.slice(-5).forEach((a, i) => setTimeout(() => {
    if (!vil) return;
    const key = a.agent === 'growth' ? 'growth' : a.agent;
    const u = vil.units.find((x) => x.kind === 'agent' && x.key === key);
    if (u) u.sprint = key;
    const good = /complete|pass|published|unblock|report/i.test(a.message), bad = a.level === 'error' || /stuck|fail/i.test(a.message);
    vil.bubbles.push({ key, text: a.message, life: 5, good, bad });
    if (good) confetti(spot(key));
    $('#vilTicker').textContent = `${AGENT_EMOJI[a.agent] || '•'} ${a.message}`;
  }, i * 900));
}


// ---------- the story of one request, walked station by station ----------
function nextStory() {
  const jobs = (vil.jobs || []).filter((j) => STOP_AT[j.status] !== undefined);
  if (!jobs.length) return null;
  vil.storyIdx = ((vil.storyIdx ?? -1) + 1) % jobs.length;
  const j = jobs[vil.storyIdx];
  const who = j.assigned[0] ? j.assigned[0].name.replace(/\s*\(.*\)/, '') : 'the team';
  const p = spot('gate');
  return { job: j, who, x: p.x, y: p.y + 1.5, step: 0, stop: STOP_AT[j.status], wait: 0.6, done: false };
}
function stepStory(dt) {
  if (!vil.story || vil.story.done && (vil.story.hold -= dt) <= 0) { vil.story = nextStory(); paintStory(); return; }
  const st = vil.story;
  if (st.done) return;
  if (st.wait > 0) { st.wait -= dt; return; }
  const target = spot(STORY[st.step].at);
  const dx = target.x - st.x, dy = target.y - st.y, dist = Math.hypot(dx, dy), sp = 2.4 * dt;
  st.walk = (st.walk || 0) + dt * 10;
  if (dist > 0.05) { st.x += dx / dist * Math.min(sp, dist); st.y += dy / dist * Math.min(sp, dist); return; }
  // arrived at a station
  const here = STORY[st.step];
  if (here.at === 'forge') sparks(target, 10);
  if (here.at === 'inspector' || here.at === 'scout') smoke(target, true);
  if (st.step >= st.stop) {
    st.done = true; st.hold = st.job.status === 'completed' ? 4 : 3.5;
    if (st.job.status === 'completed') { confetti(target); vil.rocket = 1; }
    if (st.job.status === 'stuck') vil.bubbles.push({ key: 'inspector', text: '🧱 ' + (st.job.stuck_reason || 'Stuck'), life: 3.5, bad: true });
  } else { st.step++; st.wait = 0.9; }
  paintStory();
}
function paintStory() {
  const box = document.getElementById('vilStory'); if (!box) return;
  const st = vil.story;
  if (!st) { $('#vsTitle').textContent = 'No client requests yet — new work will walk through here.'; box.querySelectorAll('.vs-step').forEach((e) => (e.className = 'vs-step')); return; }
  const now = STORY[st.step];
  const words = {
    gate: `📨 New request: “${st.job.title}”`, scout: `🔭 Scout picked it up from Slack`, tracker: `🎯 Assigned to ${st.who}`,
    forge: st.job.status === 'stuck' ? `🧱 ${st.who} is stuck — ${st.job.stuck_reason || 'waiting'}` : st.job.status === 'rnd' ? `🔎 ${st.who} is checking if it can be built (R&D)` : `🔨 ${st.who} is building it`,
    inspector: '🔍 Inspector is reviewing the work', commander: '👑 On to the team lead for a final look', launch: `🚀 Published! ${st.job.hours ? st.job.hours.toFixed(1) + 'h total' : ''}`,
  };
  $('#vsTitle').textContent = words[now.at] || now.label;
  box.querySelectorAll('.vs-step').forEach((e) => {
    const i = +e.dataset.s;
    e.className = 'vs-step' + (i < st.step || (st.done && i === st.step && st.job.status === 'completed') ? ' done' : '') + (i === st.step ? ' now' : '') + (i === st.step && st.job.status === 'stuck' && st.done ? ' stuck' : '') + (i > st.stop ? ' later' : '');
  });
}
function courier(ctx, st, t) {
  const s = vil.scale * 1.7, p = iso(st.x, st.y), bob = st.done ? 0 : Math.abs(Math.sin(st.walk || 0)) * 2 * s;
  const step = STORY[st.step], hero = ['tracker', 'forge'].includes(step.at) || (step.at === 'inspector' && st.step > 3);
  const look = step.at === 'scout' || step.at === 'gate' ? AGENT_LOOK.scout : step.at === 'inspector' ? AGENT_LOOK.inspector : step.at === 'commander' || step.at === 'launch' ? AGENT_LOOK.commander : null;
  const col = look ? look[0] : '#f08a3c';
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 7 * s, 3.5 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col; roundRect(ctx, p.x - 5 * s, p.y - 17 * s - bob, 10 * s, 12 * s, 4 * s); ctx.fill();
  ctx.fillStyle = '#fbe3c8'; ctx.beginPath(); ctx.arc(p.x, p.y - 22 * s - bob, 5 * s, 0, 7); ctx.fill();
  if (step.at === 'commander' || step.at === 'launch') { ctx.fillStyle = '#f5c542'; ctx.fillRect(p.x - 4 * s, p.y - 29 * s - bob, 8 * s, 3 * s); }
  // the work item, carried above the head
  ctx.font = `${13 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(step.item, p.x, p.y - 32 * s - bob);
  // name tag
  const tag = hero ? st.who : step.label;
  ctx.font = `700 ${Math.max(10, 10 * vil.scale)}px JetBrains Mono, monospace`;
  const w = ctx.measureText(tag).width + 12;
  ctx.fillStyle = st.job.status === 'stuck' && st.done ? 'rgba(214,90,78,.95)' : 'rgba(232,101,90,.95)';
  roundRect(ctx, p.x - w / 2, p.y + 4, w, 15, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(tag, p.x, p.y + 15);
  if (st.job.status === 'stuck' && st.done) { ctx.fillStyle = '#e2483d'; ctx.beginPath(); ctx.arc(p.x + 10 * s, p.y - 34 * s, 6 * s, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 ${9 * s}px sans-serif`; ctx.fillText('!', p.x + 10 * s, p.y - 31 * s); }
}
function launchPad(ctx, t, dark) {
  const { x, y } = SPOTS.launch, s = vil.scale;
  box(ctx, x - .9, y - 1.4, 1.6, 1.4, 0, 6, [dk('#c9c2b2', dark), dk('#a69d89', dark), dk('#8a8170', dark)]);
  const c = iso(x - .1, y - .7, 6);
  const lift = vil.rocket ? (vil.rocket = Math.min(vil.rocket + 0.02, 6), (vil.rocket - 1) * 60 * s) : 0;
  if (vil.rocket >= 6) vil.rocket = 0;
  if (lift > 0) { for (let i = 0; i < 2; i++) vil.fx.push({ kind: 'smoke', x: x - .1, y: y - .4, z: 6, vx: (Math.random() - .5) * .3, vy: .1, vz: 8, life: 1.4 }); }
  ctx.fillStyle = dk('#e8e4dc', dark); roundRect(ctx, c.x - 6 * s, c.y - 34 * s - lift, 12 * s, 28 * s, 6 * s); ctx.fill();
  ctx.fillStyle = '#e8655a'; ctx.beginPath(); ctx.moveTo(c.x, c.y - 44 * s - lift); ctx.lineTo(c.x - 6 * s, c.y - 32 * s - lift); ctx.lineTo(c.x + 6 * s, c.y - 32 * s - lift); ctx.fill();
  ctx.fillStyle = '#3987e5'; ctx.beginPath(); ctx.arc(c.x, c.y - 24 * s - lift, 3 * s, 0, 7); ctx.fill();
  if (lift > 0) { ctx.fillStyle = `rgba(255,${150 + Math.random() * 80},40,.9)`; ctx.beginPath(); ctx.moveTo(c.x - 4 * s, c.y - 6 * s - lift); ctx.lineTo(c.x + 4 * s, c.y - 6 * s - lift); ctx.lineTo(c.x, c.y + (4 + Math.random() * 8) * s - lift); ctx.fill(); }
  const tg = iso(x - .1, y - .7, 60); ctx.font = `600 ${Math.max(9, 10 * s)}px JetBrains Mono, monospace`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(251,248,241,.92)'; const txt = 'Launch Pad'; const w = ctx.measureText(txt).width + 10; ctx.fillRect(tg.x - w / 2, tg.y - 9, w, 14); ctx.fillStyle = '#2c3a33'; ctx.fillText(txt, tg.x, tg.y + 2);
}

window.renderVillage = renderVillage;
window.villageUpdate = villageUpdate;
})();
