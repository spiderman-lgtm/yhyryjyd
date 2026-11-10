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
  gate: { x: 9, y: 16.6 }, forge: { x: 4.5, y: 8.5 }, vault: { x: 11.2, y: 15 },
};
const MEMBER_COLORS = ['#7b6fd6', '#2aa3b8', '#f08a3c', '#e0628f', '#5fb84a', '#d9b032', '#4f86d9', '#9a6bc4'];
const CRATE = { actions: '#3987e5', triggers: '#eb6834', apps: '#1baf7a' };
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
        <div class="res-bar" title="Actions this week"><span>⚡</span><b data-r="actions">${w.actions}</b><small>actions</small></div>
        <div class="res-bar" title="Triggers this week"><span>🎯</span><b data-r="triggers">${w.triggers}</b><small>triggers</small></div>
        <div class="res-bar" title="Apps this week"><span>🧩</span><b data-r="apps">${w.apps}</b><small>apps</small></div>
        <span class="spacer"></span>
        <div class="vil-legend"><i style="background:${CRATE.actions}"></i>action <i style="background:${CRATE.triggers}"></i>trigger <i style="background:${CRATE.apps}"></i>app</div>
      </div>
      <canvas id="vilCanvas" aria-label="Forge Village: agents and the team at work"></canvas>
      <div class="vil-tip" id="vilTip"></div>
      <div class="vil-ticker" id="vilTicker">${state.activity[0] ? `${AGENT_EMOJI[state.activity[0].agent] || '•'} ${esc(state.activity[0].message)}` : 'Waiting for the first bit of work…'}</div>
    </div>
    <h2 style="margin-top:18px">Heroes — this week</h2>
    <div class="heroes">${state.week_metrics.members.map((m) => heroCard(m)).join('') || '<div class="empty">No members yet. Add them in Settings.</div>'}</div>`;
  startVillage();
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
  return {
    commander: L(wk.requests_completed, 2), scout: L(sum('morning_updates') + sum('evening_updates'), 6),
    tracker: L(wk.client_requests, 2), growth: L(wk.growth_items, 3), inspector: L(wk.reviews, 2),
    analyst: L(wk.actions + wk.triggers, 8), herald: L(sum('workdays'), 4), scribe: L((wk.actions + wk.triggers + wk.apps) / 2, 8),
  };
}

function buildWorld() {
  const ms = state.today_metrics.members || [];
  vil.units = [];
  // houses for the team along the west and south
  vil.houses = ms.map((m, i) => ({ m, x: 2 + (i % 4) * 2.2, y: 15 - Math.floor(i / 4) * 2.2, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }));
  vil.houses.forEach((h) => {
    const m = h.m, out = m.actions + m.triggers + m.apps;
    const mix = [];
    for (let k = 0; k < m.actions; k++) mix.push('actions');
    for (let k = 0; k < m.triggers; k++) mix.push('triggers');
    for (let k = 0; k < m.apps; k++) mix.push('apps');
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
  const wk = state.week_metrics.totals;
  vil.crates = []; let n = 0;
  [['actions', wk.actions], ['triggers', wk.triggers], ['apps', wk.apps]].forEach(([k, v]) => { for (let i = 0; i < Math.min(v, 40); i++) vil.crates.push({ k, i: n++ }); });
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
  // ground
  for (let y = -2; y < V.N + 2; y++) for (let x = -2; x < V.N + 2; x++) {
    const inside = x >= 1 && y >= 1 && x < V.N - 1 && y < V.N - 1;
    const g = inside ? ((x + y) % 2 ? '#8cc56a' : '#82bd60') : ((x + y) % 2 ? '#6aa653' : '#639e4c');
    tile(ctx, x, y, dark ? shade(g, -0.45) : g);
  }
  // paths: ring road + spokes to the gate
  const road = dark ? '#6b5d48' : '#d8c08a';
  for (let i = 2; i < V.N - 2; i++) { tile(ctx, i, 11, road); tile(ctx, 9, i, road); }
  for (let i = 4; i < 15; i++) { tile(ctx, i, 6, road); tile(ctx, 11, i, road); }
  for (let y = 11; y < V.N; y++) tile(ctx, 9, y, road);
  // vault floor
  tile(ctx, 10.5, 14.5, dark ? '#4a4038' : '#b39a6b');

  const items = [];
  // walls (perimeter, with a gate)
  for (let i = 1; i < V.N - 1; i++) {
    items.push({ d: 1 + i, draw: () => wallSeg(ctx, i, 1, dark) });
    items.push({ d: i + 1, draw: () => wallSeg(ctx, 1, i, dark) });
    if (i !== 9) items.push({ d: i + V.N - 1, draw: () => wallSeg(ctx, i, V.N - 2, dark) });
    items.push({ d: V.N - 1 + i, draw: () => wallSeg(ctx, V.N - 2, i, dark) });
  }
  // trees outside the wall
  for (let i = 0; i < 26; i++) { const x = (i * 7) % (V.N + 2) - 1, y = i % 2 ? -1 : V.N; items.push({ d: x + y, draw: () => tree(ctx, x, y, dark) }); }
  for (let i = 0; i < 14; i++) { const y = (i * 5) % V.N, x = i % 2 ? -1 : V.N; items.push({ d: x + y, draw: () => tree(ctx, x, y, dark) }); }
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
  // fx
  vil.fx.forEach((p) => items.push({ d: p.x + p.y + 0.5, draw: () => fx(ctx, p) }));
  items.sort((a, b) => a.d - b.d).forEach((i) => i.draw());
  // labels on top
  BLD.forEach((b) => label(ctx, b, lv[b.key] || 1, working.has(b.key)));
  vil.bubbles.forEach((bb) => bubble(ctx, bb));
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
  const w = state.week_metrics.totals;
  ['actions', 'triggers', 'apps'].forEach((k) => { const el = document.querySelector(`[data-r="${k}"]`); if (el && el.textContent !== String(w[k])) { el.textContent = w[k]; el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); } });
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

window.renderVillage = renderVillage;
window.villageUpdate = villageUpdate;
})();
