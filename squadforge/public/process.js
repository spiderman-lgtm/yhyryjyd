/* Process mode: Live Flow - kaam ka structure chalta hua dikhta hai.
   1) Agent flow map: Slack/viaSocket/aap → agents → outputs, chalti hui lines + packets
   2) Request journeys: har client request ka token stage-by-stage aage badhta hai
   3) Aaj ka din: kisne kab update daala, "abhi" line, 7 PM alert ka countdown */

const FLOW_W = 1200, FLOW_H = 560;
const FLOW_NODES = {
  slack:     { x: 90,   y: 150, kind: 'src', icon: '💬', title: 'Slack channel', sub: 'threads, requests, updates' },
  viasocket: { x: 90,   y: 310, kind: 'src', icon: '🔌', title: 'viaSocket', sub: 'publish counts' },
  lead:      { x: 90,   y: 460, kind: 'src', icon: '🧑‍✈️', title: 'Aap (Lead)', sub: 'instructions' },
  scout:     { x: 340,  y: 150, kind: 'agent', agent: 'scout' },
  tracker:   { x: 600,  y: 60,  kind: 'agent', agent: 'tracker' },
  growth:    { x: 600,  y: 160, kind: 'agent', agent: 'growth' },
  inspector: { x: 600,  y: 260, kind: 'agent', agent: 'inspector' },
  analyst:   { x: 600,  y: 360, kind: 'agent', agent: 'analyst' },
  commander: { x: 600,  y: 470, kind: 'agent', agent: 'commander' },
  herald:    { x: 860,  y: 210, kind: 'agent', agent: 'herald' },
  scribe:    { x: 860,  y: 380, kind: 'agent', agent: 'scribe' },
  threads:   { x: 1105, y: 90,  kind: 'out', icon: '🧵', title: 'Slack threads', sub: 'feedback, unblock' },
  alert:     { x: 1105, y: 210, kind: 'out', icon: '⏰', title: '7 PM alert', sub: 'aapko DM' },
  report:    { x: 1105, y: 330, kind: 'out', icon: '🗞️', title: 'Monday report', sub: 'team + personal' },
  dash:      { x: 1105, y: 440, kind: 'out', icon: '📊', title: 'Dashboard', sub: 'Data mode' },
  sms:       { x: 1105, y: 520, kind: 'out', icon: '📱', title: 'MSG91 SMS', sub: 'important alerts' },
};
// [from, to, owner agent whose activity lights this edge]
const FLOW_EDGES = [
  ['slack', 'scout', 'scout'], ['viasocket', 'analyst', 'analyst'], ['lead', 'commander', 'commander'],
  ['scout', 'tracker', 'scout'], ['scout', 'growth', 'scout'], ['scout', 'inspector', 'scout'], ['scout', 'analyst', 'scout'],
  ['tracker', 'herald', 'tracker'], ['growth', 'herald', 'growth'], ['analyst', 'herald', 'analyst'],
  ['tracker', 'scribe', 'tracker'], ['analyst', 'scribe', 'analyst'],
  ['inspector', 'threads', 'inspector'], ['growth', 'threads', 'growth'], ['commander', 'threads', 'commander'],
  ['herald', 'alert', 'herald'], ['scribe', 'report', 'scribe'], ['analyst', 'dash', 'analyst'], ['commander', 'sms', 'commander'],
];
// Activity feed ka agent → packet kis edge pe chalega
const PACKET_EDGE = {
  scout: ['slack', 'scout'], tracker: ['scout', 'tracker'], growth: ['scout', 'growth'], inspector: ['inspector', 'threads'],
  analyst: ['analyst', 'dash'], herald: ['herald', 'alert'], scribe: ['scribe', 'report'], commander: ['commander', 'threads'],
};
const NODE_W = { src: 150, agent: 170, out: 160 }, NODE_H = 58;

let flowLastActivity = 0;
let flowSlowTimer = null;

function edgePath(a, b) {
  const A = FLOW_NODES[a], B = FLOW_NODES[b];
  const x1 = A.x + NODE_W[A.kind] / 2, y1 = A.y, x2 = B.x - NODE_W[B.kind] / 2, y2 = B.y;
  const dx = Math.max(40, (x2 - x1) * 0.5);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

function flowNodeSvg(id, n) {
  const w = NODE_W[n.kind], x = n.x - w / 2, y = n.y - NODE_H / 2;
  let icon = n.icon, title = n.title, sub = n.sub, cls = n.kind;
  if (n.kind === 'agent') {
    const a = (state.agents || []).find((g) => g.key === n.agent) || {};
    icon = a.emoji; title = a.name; sub = statusLine(a); cls += ' ' + (a.state || 'idle');
  }
  return `<g class="fnode ${cls}" data-node="${id}" ${n.kind === 'agent' ? `data-agent="${n.agent}" tabindex="0" role="button"` : ''} transform="translate(${x},${y})">
    ${n.kind === 'agent' ? `<rect class="halo" x="-6" y="-6" width="${w + 12}" height="${NODE_H + 12}" rx="20"/>` : ''}
    <rect class="box" width="${w}" height="${NODE_H}" rx="15"/>
    <text class="ficon" x="26" y="${NODE_H / 2 + 8}" text-anchor="middle">${icon}</text>
    <text class="ftitle" x="48" y="25">${esc(title)}</text>
    <text class="fsub" x="48" y="43">${esc(trim(sub, n.kind === 'agent' ? 18 : 20))}</text>
  </g>`;
}
function statusLine(a) {
  if (a.state === 'working') return a.message || 'kaam chal raha hai…';
  if (a.state === 'error') return '⚠ ' + (a.message || 'error');
  return a.last_run_at ? 'ready · ' + ago(a.last_run_at) : 'ready';
}
const trim = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function renderFlow() {
  const tm = state.today_metrics.totals;
  const edges = FLOW_EDGES.map(([a, b, owner], i) => `
    <path id="fe${i}" class="fedge" data-owner="${owner}" d="${edgePath(a, b)}"/>
    <path class="fflow" data-owner="${owner}" d="${edgePath(a, b)}"/>
    <circle r="3" class="fdot"><animateMotion dur="${5 + (i % 4)}s" begin="${-(i * 0.7) % 5}s" repeatCount="indefinite"><mpath href="#fe${i}"/></animateMotion></circle>`).join('');
  const nodes = Object.entries(FLOW_NODES).map(([id, n]) => flowNodeSvg(id, n)).join('');
  const cols = [[90, 'INPUT'], [340, 'SORT'], [600, 'AGENTS'], [860, 'ALERTS'], [1110, 'OUTPUT']]
    .map(([x, l]) => `<text class="fcol" x="${x}" y="18" text-anchor="middle">${l}</text>`).join('');

  $('#view').innerHTML = `
    <div class="pmode-head">
      <div>
        <h2 style="margin:0">🌊 Live Flow</h2>
        <p class="muted" style="margin:2px 0 0">Kaam kaise chal raha hai, live. Numbers dekhne hain to upar <b>📊 Data</b> pe jao.</p>
      </div>
      <div class="counters">
        ${counter('⚡', tm.actions, 'actions aaj')}${counter('🎯', tm.triggers, 'triggers aaj')}
        ${counter('📜', Object.values(tm.open_by_status || {}).reduce((a, b) => a + b, 0), 'open requests')}
        ${counter('🧱', (tm.open_by_status || {}).stuck || 0, 'stuck')}
      </div>
    </div>
    <div class="card flow-card">
      <div class="flow-scroll"><svg class="flow" id="flowSvg" viewBox="0 0 ${FLOW_W} ${FLOW_H}" role="img" aria-label="Agent flow map">
        ${cols}<g id="fEdges">${edges}</g><g id="fNodes">${nodes}</g><g id="fPackets"></g>
      </svg></div>
      <div class="swipe-hint muted">← map ko side mein swipe karo →</div>
      <div class="flow-ticker" id="flowTicker">${tickerHtml(state.activity[0])}</div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="row"><h3 style="margin:0">📜 Request journeys</h3><span class="spacer"></span><span class="muted" style="font-size:12px">token = abhi kis stage pe hai</span></div><div id="journeys" class="journeys"><div class="empty">Load ho raha hai…</div></div></div>
      <div class="card"><div class="row"><h3 style="margin:0">🕘 Aaj ka din</h3><span class="spacer"></span><span class="muted" id="countdown" style="font-size:12px"></span></div><div id="dayline"></div></div>
    </div>`;

  document.querySelectorAll('#fNodes [data-agent]').forEach((el) => {
    el.addEventListener('click', () => agentModal(el.dataset.agent));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') agentModal(el.dataset.agent); });
  });
  flowLastActivity = state.activity[0] ? state.activity[0].id : 0;
  paintFlowState();
  countUp();
  loadSlow();
  clearInterval(flowSlowTimer);
  flowSlowTimer = setInterval(() => { if (tab === 'flow') loadSlow(); else clearInterval(flowSlowTimer); }, 30000);
}

const counter = (ic, v, l) => `<div class="counter"><span>${ic}</span><b data-count="${Number(v) || 0}">0</b><small>${l}</small></div>`;
function countUp() {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count), start = performance.now();
    const step = (t) => { const k = Math.min(1, (t - start) / 900); el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function tickerHtml(a) {
  if (!a) return '<span class="muted">Abhi koi activity nahi — Slack connect hote hi yahan kaam dikhega.</span>';
  return `<span class="tk-ic">${AGENT_EMOJI[a.agent] || '•'}</span><span>${esc(a.message)}</span><span class="muted">${ago(a.created_at)}</span>`;
}

// Recent activity (last 3 min) ya working state → edge "hot"
function paintFlowState() {
  const recent = new Set(state.activity.filter((a) => Date.now() - new Date(a.created_at.replace(' ', 'T') + 'Z') < 180000).map((a) => a.agent));
  const working = new Set(state.agents.filter((a) => a.state === 'working').map((a) => a.key));
  if (working.has('scout')) ['tracker', 'growth'].forEach((k) => working.add(k));
  document.querySelectorAll('#fEdges [data-owner]').forEach((p) => {
    p.classList.toggle('hot', working.has(p.dataset.owner) || recent.has(p.dataset.owner));
  });
}

function updateFlow() {
  if (!$('#flowSvg')) return;
  for (const [id, n] of Object.entries(FLOW_NODES)) {
    if (n.kind !== 'agent') continue;
    const a = state.agents.find((g) => g.key === n.agent) || {};
    const el = document.querySelector(`#fNodes [data-node="${id}"]`);
    if (!el) continue;
    el.setAttribute('class', `fnode agent ${a.state || 'idle'}`);
    el.querySelector('.fsub').textContent = trim(statusLine(a), 18);
  }
  paintFlowState();
  const fresh = state.activity.filter((a) => a.id > flowLastActivity).reverse();
  if (fresh.length) {
    flowLastActivity = state.activity[0].id;
    fresh.slice(-4).forEach((a, i) => setTimeout(() => launchPacket(a), i * 700));
    $('#flowTicker').innerHTML = tickerHtml(state.activity[0]);
  }
}

// Ek "packet" edge pe chalta hai, upar activity ka chhota label
function launchPacket(a) {
  const e = PACKET_EDGE[a.agent]; if (!e) return;
  const idx = FLOW_EDGES.findIndex(([x, y]) => x === e[0] && y === e[1]);
  const path = $('#fe' + idx); const layer = $('#fPackets');
  if (!path || !layer) return;
  const len = path.getTotalLength();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'packet' + (a.level === 'error' ? ' bad' : ''));
  const label = trim(a.message, 34);
  g.innerHTML = `<rect x="${-label.length * 3.2 - 10}" y="-30" width="${label.length * 6.4 + 20}" height="20" rx="10"/><text y="-16" text-anchor="middle">${esc(label)}</text><circle r="7"/>`;
  layer.appendChild(g);
  const t0 = performance.now(), dur = 2200;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), ease = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const pt = path.getPointAtLength(len * ease);
    g.setAttribute('transform', `translate(${pt.x},${pt.y})`);
    g.style.opacity = k > .85 ? (1 - k) / .15 : 1;
    if (k < 1) requestAnimationFrame(step); else { g.remove(); pulseNode(e[1]); }
  };
  requestAnimationFrame(step);
}
function pulseNode(id) {
  const el = document.querySelector(`#fNodes [data-node="${id}"]`);
  if (!el) return;
  el.classList.remove('ping'); void el.getBBox(); el.classList.add('ping');
  setTimeout(() => el.classList.remove('ping'), 900);
}

// ---------- journeys + day timeline (har 30s) ----------
const STAGES = ['new', 'rnd', 'started', 'stuck', 'completed'];
async function loadSlow() {
  try {
    const [reqs, logs] = await Promise.all([api('/api/requests'), api(`/api/logs?date=${state.today}`)]);
    renderJourneys(reqs);
    renderDayline(logs.logs);
  } catch (e) { console.warn(e); }
}

function renderJourneys(reqs) {
  const box = $('#journeys'); if (!box) return;
  const cutoff = Date.now() - 3 * 864e5;
  const list = reqs.filter((r) => r.status !== 'completed' || (r.completed_at && new Date(r.completed_at) > cutoff))
    .sort((a, b) => STAGES.indexOf(a.status) - STAGES.indexOf(b.status)).slice(0, 10);
  if (!list.length) { box.innerHTML = '<div class="empty">Koi open client request nahi 🎉</div>'; return; }
  const prev = Object.fromEntries([...box.querySelectorAll('.journey')].map((j) => [j.dataset.id, j.dataset.stage]));
  box.innerHTML = list.map((r) => {
    const st = STAGES.indexOf(r.status), pct = (st / (STAGES.length - 1)) * 100;
    const who = r.assigned.map((a) => a.name).join(', ') || 'unassigned';
    return `<div class="journey ${r.status}" data-id="${r.id}" data-stage="${st}" title="${esc(r.title)}">
      <div class="jhead"><b>${esc(trim(r.title, 42))}</b><span class="muted">${esc(trim(who, 22))} · ⏱ ${r.hours !== null ? r.hours.toFixed(1) + 'h' : '–'}</span></div>
      <div class="jtrack">
        <div class="jfill" style="width:${prev[r.id] !== undefined ? (prev[r.id] / 4) * 100 : 0}%" data-to="${pct}"></div>
        ${STAGES.map((s, i) => `<div class="jstop ${i <= st ? 'done' : ''} ${s}" style="left:${(i / 4) * 100}%"><i></i><span>${STATUS[s]}</span></div>`).join('')}
        <div class="jtoken" style="left:${prev[r.id] !== undefined ? (prev[r.id] / 4) * 100 : 0}%" data-to="${pct}">${esc(initials(r.assigned[0] ? r.assigned[0].name : '?'))}</div>
      </div>
      ${r.status === 'stuck' && r.stuck_reason ? `<div class="jreason">🧱 ${esc(trim(r.stuck_reason, 90))}</div>` : ''}
    </div>`;
  }).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    box.querySelectorAll('[data-to]').forEach((el) => {
      if (el.classList.contains('jfill')) el.style.width = el.dataset.to + '%';
      else el.style.left = el.dataset.to + '%';
    });
  }));
  box.querySelectorAll('.journey').forEach((el) => (el.onclick = () => {
    if (role !== 'admin') return;
    tab = 'requests'; mode = 'data'; location.hash = 'requests'; render();
  }));
}

function renderDayline(logs) {
  const box = $('#dayline'); if (!box) return;
  const START = 8, END = 21;
  const hourOf = (ts) => {
    const d = new Date(parseFloat(ts) * 1000);
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).split(':');
    return Number(p[0]) + Number(p[1]) / 60;
  };
  const nowH = hourOf(Date.now() / 1000);
  const x = (h) => `${Math.min(100, Math.max(0, ((h - START) / (END - START)) * 100))}%`;
  const people = (state.today_metrics.members || []).map((m) => ({ m, log: logs.find((l) => l.member_id === m.id) || {} }));
  const ticks = [];
  for (let h = START; h <= END; h += 2) ticks.push(`<span style="left:${x(h)}">${h > 12 ? h - 12 + 'p' : h + (h === 12 ? 'p' : 'a')}</span>`);
  const lane = ({ m, log }) => {
    const marks = [];
    const first = (s) => (s ? s.split(',')[0] : null);
    if (first(log.morning_ts)) marks.push(`<i class="mk am" style="left:${x(hourOf(first(log.morning_ts)))}" title="Subah ka plan"></i>`);
    else if (log.morning_text) marks.push(`<i class="mk am" style="left:${x(10)}" title="Subah ka plan"></i>`);
    else if (nowH > 11.5) marks.push(`<i class="mk miss" style="left:${x(11.5)}" title="Subah ka plan nahi aaya">?</i>`);
    if (first(log.evening_ts)) marks.push(`<i class="mk pm" style="left:${x(hourOf(first(log.evening_ts)))}" title="Shaam ka update"></i>`);
    else if (log.evening_text) marks.push(`<i class="mk pm" style="left:${x(Math.min(18.5, nowH))}" title="Shaam ka update"></i>`);
    else if (nowH > 19) marks.push(`<i class="mk miss" style="left:${x(19)}" title="Shaam ka update nahi aaya">?</i>`);
    return `<div class="lane"><span class="lname">${esc(trim(m.name, 14))}</span><div class="ltrack">${marks.join('')}</div></div>`;
  };
  box.innerHTML = `<div class="day">
      <div class="dticks">${ticks.join('')}</div>
      <div class="dlanes">
        ${people.map(lane).join('') || '<div class="empty">Koi member nahi</div>'}
        <div class="doverlay"><div class="dnow" style="left:${x(nowH)}"><span>abhi</span></div><div class="d7" style="left:${x(19)}"><span>📢 7PM</span></div></div>
      </div>
    </div>
    <div class="legend" style="margin-top:8px"><span><i style="background:var(--blue)"></i>subah ka plan</span><span><i style="background:var(--green)"></i>shaam ka update</span><span><i style="background:var(--red)"></i>missing</span></div>`;
  const left = 19 - nowH;
  $('#countdown').textContent = left > 0 ? `📢 7 PM alert ${Math.floor(left)}h ${Math.round((left % 1) * 60)}m mein` : '📢 Aaj ka alert ja chuka';
}
