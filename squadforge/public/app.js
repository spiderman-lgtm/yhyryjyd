/* SquadForge dashboard - vanilla JS */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { new: 'New', rnd: 'R&D', started: 'Started', stuck: 'Stuck', completed: 'Completed' };
const AGENT_EMOJI = { scout: '🔭', tracker: '🎯', growth: '🌱', inspector: '🔍', analyst: '📊', herald: '📢', scribe: '📜', commander: '⚔️' };
const GROWTH_LABEL = { support_request: 'Support request', app_listing: 'App listing', blog: 'Blog', newsletter: 'Newsletter', credentials: 'Credentials/Docs', other: 'Other' };

let state = null;
let members = [];
const VIEWER_TABS = ['flow', 'village'];
const MANAGER_TABS = ['manager', 'flow', 'village'];
const ALL_TABS = ['team', 'manager', 'requests', 'reviews', 'growth', 'reports', 'history', 'commander', 'flow', 'village', 'integrations', 'settings'];
let tab = ALL_TABS.includes(location.hash.replace('#', '')) ? location.hash.replace('#', '') : 'team'; // viewers are sent to 'flow' in markTab
let role = 'admin';
let myEmail = null;
let myName = null;
const PAGE_TITLES = { team: 'Dashboard', manager: 'Manager view', requests: 'Client requests', reviews: 'Reviews', growth: 'Growth', reports: 'Reports', history: 'History', commander: 'Commander', flow: 'Live Flow', village: 'Village', integrations: 'Integrations', settings: 'Settings' };
let pollTimer = null;
let lastActivityId = 0;

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = sessionToken(); if (tok) headers['X-SF-Session'] = tok;
  const ws = currentWs(); if (ws) headers['X-SF-Workspace'] = ws;
  const res = await fetch(path, { headers, credentials: 'same-origin', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && !path.startsWith('/api/login') && !path.startsWith('/api/signup') && !path.startsWith('/api/workspace-signup')) { saveToken(null); showLogin(); throw new Error('Please log in'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3500);
}
function modal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.dataset.close !== undefined) closeModal(); });
function ago(iso) {
  if (!iso) return '-';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const s = (Date.now() - d) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' d ago';
}
const fmt = (v, suf = '') => (v === null || v === undefined ? '–' : v + suf);
const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '–');
const initials = (n) => n.replace(/\(.*\)/, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// ---------- auth ----------
function showLogin() { $('#login').classList.remove('hidden'); document.body.classList.add('on-login'); if (window.buildLoginScene) buildLoginScene(); }
// session token kept in the browser too (some proxies drop cookies)
function sessionToken() { try { return localStorage.getItem('sf_token'); } catch { return null; } }
function saveToken(t) { try { t ? localStorage.setItem('sf_token', t) : localStorage.removeItem('sf_token'); } catch { /* private mode */ } }
function currentWs() { try { return localStorage.getItem('sf_ws'); } catch { return null; } }
function saveWs(id) { try { id ? localStorage.setItem('sf_ws', String(id)) : localStorage.removeItem('sf_ws'); } catch { /* private mode */ } }
// Login modes: sign in, create an account, or create a workspace (a new team).
let authMode = 'signin';
const AUTH = {
  signin: { btn: 'Sign in →', pw: 'Password', hint: 'New here? <a href="#" data-auth="signup">Create an account</a>' },
  signup: { btn: 'Create account →', pw: 'Choose a password (8+ characters)', hint: 'Already have an account? <a href="#" data-auth="signin">Sign in</a>' },
};
function setAuthMode(mode) {
  authMode = mode; const a = AUTH[mode];
  $('#wsName').classList.toggle('hidden', mode !== 'signup');
  $('#signupName').classList.toggle('hidden', mode === 'signin');
  $('#authBtn').textContent = a.btn;
  $('#password').setAttribute('autocomplete', mode === 'signin' ? 'current-password' : 'new-password');
  $('#password').placeholder = a.pw;
  $('#authHint').innerHTML = a.hint;
  $('#loginErr').textContent = '';
}
setAuthMode('signin');
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-auth]'); if (!a || !$('#login').contains(a)) return;
  e.preventDefault(); setAuthMode(a.dataset.auth === 'workspace' ? 'signup' : a.dataset.auth);
  $('#login').scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => (authMode === 'signup' ? $('#signupName') : $('#email')).focus(), 300);
});
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#authBtn'); btn.disabled = true; $('#loginErr').textContent = '';
  try {
    const body = { email: $('#email').value, password: $('#password').value };
    let r;
    if (authMode === 'signup') r = await api('/api/signup', { method: 'POST', body: { ...body, name: $('#signupName').value, workspace: $('#wsName').value } });
    else r = await api('/api/login', { method: 'POST', body });
    saveToken(r.token);
    saveWs(r.workspace || null);
    members = []; state = null; tab = 'team';
    $('#login').classList.add('hidden'); document.body.classList.remove('on-login');
    if (r.joined) toast('Welcome! You joined the workspace you were invited to.');
    else if (r.created) toast('Your workspace is ready — add your team in Settings.');
    boot();
  } catch (err) { $('#loginErr').textContent = err.message; }
  btn.disabled = false;
});
// ---------- front-page video tour ----------
document.addEventListener('click', (e) => {
  const w = e.target.closest('[data-watch]');
  const ch = e.target.closest('.lp-chapters [data-t]');
  if (!w && !ch) return;
  e.preventDefault();
  const v = $('#tourVideo'); if (!v) return;
  $('#lp-video').scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (ch) { const go = () => { v.currentTime = Number(ch.dataset.t); v.play().catch(() => {}); }; v.readyState ? go() : (v.addEventListener('loadedmetadata', go, { once: true }), v.load()); }
  else setTimeout(() => v.play().catch(() => {}), 600);
});

// ---------- workspace switcher ----------
let myWorkspaces = [];
let myWorkspace = null;
function renderWsSwitch() {
  const sel = $('#wsSwitch');
  if (!myEmail || !myWorkspace) { sel.classList.add('hidden'); return; }
  sel.classList.remove('hidden');
  sel.innerHTML = myWorkspaces.map((w) => `<option value="${w.id}" ${w.id === myWorkspace.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('') + '<option value="new">＋ New workspace…</option>';
}
$('#wsSwitch').addEventListener('change', async (e) => {
  const v = e.target.value;
  if (v === 'new') {
    e.target.value = String(myWorkspace.id);
    const name = prompt('Name of the new workspace (for example, your team name):');
    if (!name || !name.trim()) return;
    try { const w = await api('/api/workspaces', { method: 'POST', body: { name } }); saveWs(w.id); toast(`Workspace "${w.name}" created`); }
    catch (err) { return toast(err.message); }
  } else saveWs(v);
  members = []; state = null; $('#view').innerHTML = '';
  boot();
});
$('#logoutBtn').addEventListener('click', async () => { saveToken(null); saveWs(null); await api('/api/logout', { method: 'POST' }); location.reload(); });

// ---------- tabs ----------
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  tab = b.dataset.tab; location.hash = tab; render();
});
function markTab() {
  if (role === 'viewer' && !VIEWER_TABS.includes(tab)) tab = 'flow';
  if (role === 'manager' && !MANAGER_TABS.includes(tab)) tab = 'manager';
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.classList.toggle('hidden', (role === 'viewer' && (b.dataset.admin !== undefined || b.dataset.mgr !== undefined)) || (role === 'manager' && !MANAGER_TABS.includes(b.dataset.tab)));
  });
  document.querySelectorAll('#tabs .nav-label').forEach((l) => l.classList.toggle('hidden', (role === 'viewer' && l.textContent !== 'Live') || (role === 'manager' && l.textContent === 'Workspace')));
  $('#pageTitle').textContent = PAGE_TITLES[tab] || 'SquadForge';
  document.title = `${PAGE_TITLES[tab] || 'Dashboard'} · SquadForge`;
  const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
}

// ---------- header ----------
function renderHeader() {
  const i = state.integrations;
  $('#integrations').innerHTML = `<div class="nav-label" style="padding:0 0 6px">Connections</div>` + [['Slack', i.slack], ['AI', i.ai], ['M91', i.msg91]]
    .map(([n, on]) => `<span class="dot ${on ? 'on' : ''}"><i></i>${n}</span>`).join('');
  $('#pageSub').textContent = new Date(state.today + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  $('#userChip').innerHTML = myEmail ? `<span class="avatar-xs">${esc(myEmail[0].toUpperCase())}</span>${esc(myEmail)}` : role === 'viewer' ? 'Viewer' : '';
  $('#logoutBtn').classList.toggle('hidden', !state.password_set);
  const banners = [];
  if (role === 'viewer' || role === 'manager') { $('#banner').innerHTML = ''; return; }
  if (!state.password_set) banners.push(`<div class="banner red">🔓 <b>ADMIN_PASSWORD</b> is not set, so the dashboard is open to everyone. Set the env var on Embarko.</div>`);
  if (!state.member_count) banners.push(`<div class="banner">👋 Get started: add team members in <b>Settings</b> (or import them from Slack). Just exploring? <a href="#" id="demoLink">Load demo data</a>.</div>`);
  else if (state.has_demo) banners.push(`<div class="banner">🧪 You are looking at demo data. Use "Clear demo" in Settings to see real data.</div>`);
  $('#banner').innerHTML = banners.join('');
  const dl = $('#demoLink'); if (dl) dl.onclick = async (e) => { e.preventDefault(); await api('/api/demo/load', { method: 'POST' }); toast('Demo data loaded'); refresh(); };
}

// ---------- buildings (original SVG art) ----------
function smoke(x, y) { return `<g class="smoke"><circle cx="${x}" cy="${y}" r="5" fill="#ddd"/><circle cx="${x + 4}" cy="${y - 8}" r="4" fill="#eee"/></g>`; }
const BUILDINGS = {
  scout: () => `<rect x="44" y="30" width="32" height="70" fill="#a8743f" stroke="#5b3a1a" stroke-width="3"/><rect x="36" y="22" width="48" height="12" fill="#c98c4c" stroke="#5b3a1a" stroke-width="3"/><polygon points="34,22 60,2 86,22" fill="#d9483b" stroke="#6e1d16" stroke-width="3"/><rect x="54" y="78" width="12" height="22" fill="#3b2410"/><line x1="44" y1="50" x2="76" y2="70" stroke="#5b3a1a" stroke-width="3"/><line x1="76" y1="50" x2="44" y2="70" stroke="#5b3a1a" stroke-width="3"/>`,
  tracker: () => `<polygon points="14,100 60,28 106,100" fill="#e9c46a" stroke="#8a6a17" stroke-width="3"/><polygon points="60,28 48,100 72,100" fill="#f4dc95" stroke="#8a6a17" stroke-width="3"/><polygon points="52,100 60,72 68,100" fill="#3b2a0a"/><line x1="60" y1="28" x2="60" y2="8" stroke="#5b3a1a" stroke-width="3"/><polygon points="60,8 80,13 60,18" fill="#d9483b"/>`,
  growth: () => `<path d="M18 100 V60 Q60 14 102 60 V100 Z" fill="#a6e3d0" fill-opacity=".85" stroke="#2f7a64" stroke-width="3"/><line x1="60" y1="24" x2="60" y2="100" stroke="#2f7a64" stroke-width="2"/><line x1="18" y1="72" x2="102" y2="72" stroke="#2f7a64" stroke-width="2"/><circle cx="38" cy="88" r="8" fill="#4caf50"/><circle cx="82" cy="86" r="10" fill="#43a047"/><rect x="52" y="80" width="16" height="20" fill="#2f7a64"/>`,
  inspector: () => `<rect x="20" y="46" width="80" height="54" fill="#d6dbe8" stroke="#4a5370" stroke-width="3"/><path d="M28 46 Q60 6 92 46 Z" fill="#7b8ec9" stroke="#3d4a7a" stroke-width="3"/><rect x="32" y="58" width="16" height="14" fill="#7fd3ff" stroke="#4a5370" stroke-width="2"/><rect x="72" y="58" width="16" height="14" fill="#7fd3ff" stroke="#4a5370" stroke-width="2"/><rect x="52" y="76" width="16" height="24" fill="#4a5370"/><rect x="84" y="20" width="8" height="18" fill="#4a5370"/>${smoke(88, 14)}`,
  analyst: () => `<rect x="26" y="54" width="68" height="46" fill="#e7ddc8" stroke="#6b5a3a" stroke-width="3"/><path d="M26 54 A34 34 0 0 1 94 54 Z" fill="#5f6fb5" stroke="#2f3a73" stroke-width="3"/><rect x="58" y="26" width="30" height="9" transform="rotate(-28 58 30)" fill="#2f3a73"/><rect x="52" y="76" width="16" height="24" fill="#6b5a3a"/><circle cx="40" cy="70" r="5" fill="#ffd75a"/>`,
  herald: () => `<rect x="42" y="34" width="36" height="66" fill="#c9b79c" stroke="#5e5040" stroke-width="3"/><polygon points="36,34 60,6 84,34" fill="#3d7bd9" stroke="#1d3f73" stroke-width="3"/><rect x="48" y="40" width="24" height="20" fill="#2a2116"/><path d="M52 58 Q60 40 68 58 Z" fill="#f4b740" stroke="#8a5a00" stroke-width="2"/><rect x="53" y="80" width="14" height="20" fill="#5e5040"/>`,
  scribe: () => `<rect x="14" y="50" width="92" height="50" fill="#efe3c6" stroke="#6b5a3a" stroke-width="3"/><polygon points="8,50 60,22 112,50" fill="#8e5bd1" stroke="#4a2c78" stroke-width="3"/><rect x="24" y="58" width="8" height="42" fill="#d8c7a0"/><rect x="42" y="58" width="8" height="42" fill="#d8c7a0"/><rect x="70" y="58" width="8" height="42" fill="#d8c7a0"/><rect x="88" y="58" width="8" height="42" fill="#d8c7a0"/><rect x="54" y="74" width="12" height="26" fill="#6b5a3a"/>`,
  commander: () => `<rect x="18" y="44" width="84" height="56" fill="#b9b9c4" stroke="#4d4d5c" stroke-width="3"/><path d="M18 44 v-10 h10 v8 h10 v-8 h10 v8 h10 v-8 h10 v8 h10 v-8 h10 v8 h10 v-8 h4 v10 z" fill="#a1a1ae" stroke="#4d4d5c" stroke-width="3"/><rect x="48" y="14" width="24" height="30" fill="#c8c8d3" stroke="#4d4d5c" stroke-width="3"/><line x1="60" y1="14" x2="60" y2="0" stroke="#4d4d5c" stroke-width="2"/><polygon points="60,0 76,4 60,8" fill="#f4b740"/><path d="M50 100 V80 Q60 68 70 80 V100 Z" fill="#4d3218"/>`,
};

// renderVillage() lives in village.js (isometric canvas)
function feedHtml(items) {
  if (!items.length) return `<div class="empty">No activity yet. Put the agents to work!</div>`;
  return items.map((a) => `<div class="feed-item ${a.level}"><span class="em">${AGENT_EMOJI[a.agent] || '•'}</span><div>${esc(a.message)}<time>${ago(a.created_at)}</time></div></div>`).join('');
}

// Person card: what they delivered and are working on — no XP, levels or counts.
function heroCard(m) {
  const today = state.today_metrics.members.find((x) => x.id === m.id) || {};
  const me = ((state.week_value || {}).people || []).find((p) => p.id === m.id) || { outcomes: [], working_on: [], unblocked: [] };
  return `<div class="hero ${m.role}">
    <div class="top"><div class="avatar">${esc(initials(m.name))}</div><div><div class="name">${esc(m.name)}</div><div class="muted" style="font-size:12px">${m.role === 'growth' ? 'Growth' : 'Plugin builder'}</div></div></div>
    <div class="hero-sec"><span class="to-k">Delivered</span>${me.outcomes.length ? me.outcomes.slice(0, 3).map((o) => `<div class="to-o">${o.verified ? '🏅' : '✅'} ${esc(o.title)}</div>`).join('') : '<div class="muted to-o">Nothing shipped yet this week</div>'}</div>
    ${me.working_on.length ? `<div class="hero-sec"><span class="to-k">Working on</span>${me.working_on.slice(0, 2).map((w) => `<div class="to-o">${w.status === 'stuck' ? '🧱' : '🔨'} ${esc(w.title)}</div>`).join('')}</div>` : ''}
    ${me.unblocked.length ? `<div class="hero-sec"><span class="to-k">Unblocked</span><div class="to-o">🔓 ${esc(me.unblocked.join(', '))}</div></div>` : ''}
    <div class="today-flags">
      <span class="pill ${today.morning_updates ? 'completed' : ''}">${today.morning_updates ? '✓' : '·'} morning</span>
      <span class="pill ${today.evening_updates ? 'completed' : ''}">${today.evening_updates ? '✓' : '·'} evening</span>
    </div>
  </div>`;
}

function agentModal(key) {
  const a = state.agents.find((x) => x.key === key);
  const extra = {
    herald: `<button class="btn ghost" id="morningBtn">🌅 Send morning reminder now</button>`,
    commander: `<button class="btn" onclick="closeModal();tab='commander';location.hash='commander';render()">Open Commander</button>`,
    inspector: state.integrations.review_instructions ? '' : `<p class="banner">Review instructions are not set yet — add them in Settings.</p>`,
  }[key] || '';
  modal(`<h2>${a.emoji} ${esc(a.name)} <span class="muted" style="font-size:14px">· ${esc(a.building)}</span></h2>
    <p>${esc(a.job)}</p>
    <p class="muted">Status: <b>${esc(a.state)}</b> — ${esc(a.message || '')}<br>Last run: ${ago(a.last_run_at)}</p>
    <div class="row">${a.runnable ? `<button class="btn" id="runAgent">▶ Run now</button>` : ''}${extra}<span class="spacer"></span><button class="btn ghost" data-close>Close</button></div>`);
  const rb = $('#runAgent');
  if (rb) rb.onclick = async () => { rb.disabled = true; rb.textContent = 'Running…'; try { const r = await api(`/api/agents/${key}/run`, { method: 'POST' }); toast(r.message || r.error || 'Done'); } catch (e) { toast(e.message); } closeModal(); refresh(); };
  const mb = $('#morningBtn');
  if (mb) mb.onclick = async () => { const r = await api('/api/agents/herald/morning', { method: 'POST' }); toast(r.message || 'Sent'); closeModal(); refresh(); };
}

// ---------- dates (dashboard itself lives in dashboard.js) ----------
function weekStartOf(d) { const wd = new Date(d + 'T12:00:00Z').getUTCDay(); return addDays(d, wd === 0 ? -6 : 1 - wd); }
function addDays(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const kpi = (v, l) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;

// ---------- requests ----------
async function renderRequests() {
  const [reqs, ins] = await Promise.all([api('/api/requests'), api('/api/insights').catch(() => ({ blocked: [] }))]);
  const cols = ['new', 'rnd', 'started', 'stuck', 'completed'];
  $('#view').innerHTML = `
    <div class="row" style="margin-bottom:12px"><h2 style="margin:0">Client Requests</h2><span class="spacer"></span><button class="btn" id="addReq">+ Add request</button></div>
    <p class="muted" style="margin-top:0">You post a request in Slack (e.g. <code>Client request: Zoho Bigin plugin</code>) and tag a member in the thread. The member replies in the thread with <code>r&d</code> / <code>started</code> / <code>stuck - API doc missing</code> / <code>completed</code>, and Tracker updates the status automatically.</p>
    <div class="kanban">${cols.map((c) => {
      const list = reqs.filter((r) => r.status === c);
      return `<div class="col"><h3><span>${STATUS[c]}</span><span class="pill ${c}">${list.length}</span></h3>${list.map(reqCard).join('') || '<div class="empty" style="padding:12px">—</div>'}</div>`;
    }).join('')}</div>`;
  document.querySelectorAll('.req').forEach((el) => (el.onclick = () => reqModal(reqs.find((r) => r.id == el.dataset.id))));
  $('#addReq').onclick = addReqModal;
  if (ins.blocked && ins.blocked.length) { const strip = document.createElement('div'); strip.innerHTML = blockedCard(ins.blocked, true); $('.kanban').before(strip.firstElementChild); }
  if (typeof openRequestAfterNav === 'number' && openRequestAfterNav) { const r = reqs.find((x) => x.id === openRequestAfterNav); openRequestAfterNav = null; if (r) reqModal(r); }
}
function reqCard(r) {
  return `<div class="req" data-id="${r.id}"><div class="t">${esc(r.title)}</div>
    <div class="meta"><span>👤 ${esc(r.assigned.map((a) => a.name).join(', ') || 'unassigned')}</span><span>⏱ ${r.hours !== null ? r.hours.toFixed(1) + 'h' : '–'}</span>${r.difficulty ? `<span class="stars">${stars(r.difficulty)}</span>` : ''}</div>
    ${r.stuck_reason ? `<div class="reason">🧱 ${esc(r.stuck_reason.slice(0, 90))}</div>` : ''}</div>`;
}
function reqModal(r) {
  modal(`<h2>${esc(r.title)}</h2>
    <div class="row"><span class="pill ${r.status}">${STATUS[r.status]}</span><span class="muted">👤 ${esc(r.assigned.map((a) => a.name).join(', ') || 'unassigned')}</span>${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">Slack thread ↗</a>` : ''}</div>
    ${r.text ? `<pre class="report" style="max-height:140px">${esc(r.text)}</pre>` : ''}
    <p><b>Time:</b> ${r.hours !== null ? r.hours.toFixed(1) + ' hours' : '–'} · <b>Stuck:</b> ${r.stuck_count} times · <b>Difficulty:</b> <span class="stars">${stars(r.difficulty)}</span></p>
    ${r.ai_analysis ? `<p class="banner">🤖 ${esc(r.ai_analysis)}</p>` : ''}
    <div class="outcome-box">
      <h3 style="margin:0 0 4px">Outcome</h3>
      <div class="muted" style="font-size:11.5px;margin-bottom:6px">What changed, and for whom? This is what we measure — not how many tasks it took.</div>
      <textarea id="rImpact" placeholder="e.g. Acme can now create Kommo leads automatically from their website form">${esc(r.impact_note || '')}</textarea>
      <input id="rEvidence" placeholder="Evidence link — published plugin, screenshot or client message (https://…)" value="${esc(r.evidence_url || '')}" style="margin-top:6px"/>
    </div>
    <h3>Timeline</h3><div class="timeline">${r.events.map((e) => `<div><span class="pill ${e.status}">${STATUS[e.status]}</span> <span class="muted">${new Date(e.at).toLocaleString('en-IN')}</span>${e.member ? ' · ' + esc(e.member) : ''}${e.reason ? `<br>🧱 ${esc(e.reason)}` : ''}</div>`).join('')}</div>
    <h3>Manual update</h3>
    <div class="grid g2"><div><label>Status</label><select id="rStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>Reason (if stuck)</label><input id="rReason" placeholder="API doc missing…" /></div></div>
    <label>Assigned</label>${memberChecks(r.assigned.map((a) => a.id), 'rm')}
    <div class="row" style="margin-top:12px"><button class="btn" id="rSave">Save</button><button class="btn red small" id="rDel">Delete</button><span class="spacer"></span><button class="btn ghost" data-close>Close</button></div>`);
  $('#rSave').onclick = async () => {
    const body = { member_ids: checked('rm'), impact_note: $('#rImpact').value.trim(), evidence_url: $('#rEvidence').value.trim() };
    if ($('#rStatus').value === 'completed' && !body.impact_note && !confirm('Mark it completed without saying what changed? You can add it later.')) return;
    if ($('#rStatus').value !== r.status || $('#rStatus').value === 'stuck') { body.status = $('#rStatus').value; body.reason = $('#rReason').value; }
    await api(`/api/requests/${r.id}`, { method: 'PATCH', body }); closeModal(); toast('Updated'); renderRequests();
  };
  $('#rDel').onclick = async () => { if (!confirm('Delete this request?')) return; await api(`/api/requests/${r.id}`, { method: 'DELETE' }); closeModal(); renderRequests(); };
}
function memberChecks(sel = [], name = 'm', filter = (m) => m.role !== 'lead') {
  const list = members.filter((m) => m.active && filter(m));
  if (!list.length) return '<p class="muted">Add members in Settings first</p>';
  return `<div class="row">${list.map((m) => `<label class="check"><input type="checkbox" name="${name}" value="${m.id}" ${sel.includes(m.id) ? 'checked' : ''}/> ${esc(m.name)}</label>`).join('')}</div>`;
}
const checked = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => Number(i.value));
function addReqModal() {
  modal(`<h2>+ Client request</h2><label>Title</label><input id="nTitle" placeholder="Need a Zoho Bigin plugin"/><label>Details</label><textarea id="nText"></textarea><label>Assign</label>${memberChecks([], 'nm')}
    <div class="row" style="margin-top:12px"><button class="btn" id="nSave">Add</button><span class="spacer"></span><button class="btn ghost" data-close>Cancel</button></div>`);
  $('#nSave').onclick = async () => { await api('/api/requests', { method: 'POST', body: { title: $('#nTitle').value, text: $('#nText').value, member_ids: checked('nm') } }); closeModal(); renderRequests(); };
}

// ---------- reviews ----------
async function renderReviews() {
  const [reviews, data] = await Promise.all([api('/api/reviews'), api(`/api/metrics?from=${addDays(state.today, -29)}&to=${state.today}`)]);
  const tech = data.team.members.filter((m) => m.role === 'tech');
  $('#view').innerHTML = `
    <h2>Reviews & error rate</h2>
    ${state.integrations.review_instructions ? '' : `<div class="banner" style="margin-bottom:12px">Inspector's review instructions are not set yet. Write your checklist in <b>Settings → Inspector instructions</b>.</div>`}
    <div class="kpis">${tech.map((m) => kpi(`${fmt(m.error_rate)}`, `${m.name} — error rate (30 days) · first pass ${fmt(m.first_pass_pct, '%')}`)).join('')}</div>
    <div class="grid g2">
      <div class="card"><h3>Review history</h3><div class="table-wrap">${reviews.length ? `<table><tr><th>Date</th><th>Member</th><th>What</th><th>Attempt</th><th>Errors</th><th>Result</th></tr>${reviews.map((r) => `<tr data-rv="${r.id}" style="cursor:pointer"><td>${r.date}</td><td>${esc(r.member || '–')}</td><td>${esc((r.subject || '').slice(0, 50))}</td><td>${r.attempt}</td><td>${r.status === 'done' ? r.errors_count : '–'}</td><td>${r.status === 'pending' ? '<span class="pill new">pending</span>' : r.passed ? '<span class="pill completed">pass</span>' : '<span class="pill stuck">fix</span>'}</td></tr>`).join('')}</table>` : '<div class="empty">No reviews yet</div>'}</div></div>
      <div class="card"><h3>Manual review</h3><p class="muted">Work done outside Slack: paste the plugin JSON, code or details here.</p>
        <label>Member</label><select id="mvMember"><option value="">—</option>${members.filter((m) => m.role === 'tech').map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
        <label>What to review</label><input id="mvSubject" placeholder="Zoho Bigin - Create Deal action"/>
        <label>Content</label><textarea id="mvText" style="min-height:160px"></textarea>
        <button class="btn" id="mvGo" style="margin-top:10px">🔍 Review</button><div id="mvOut"></div></div>
    </div>`;
  document.querySelectorAll('[data-rv]').forEach((el) => (el.onclick = () => {
    const r = reviews.find((x) => x.id == el.dataset.rv);
    modal(`<h2>${esc(r.subject || 'Review')}</h2><p class="muted">${esc(r.member || '')} · attempt ${r.attempt} · ${r.date}</p>${r.summary ? `<p>${esc(r.summary)}</p>` : ''}${(r.findings || []).map((f, i) => `<p>${i + 1}. <b>${esc(f.title)}</b> <span class="pill ${f.severity === 'high' ? 'stuck' : f.severity === 'medium' ? 'started' : 'new'}">${f.severity}</span><br>${esc(f.detail)}</p>`).join('')}${r.submission ? `<h3>Submission</h3><pre class="report">${esc(r.submission)}</pre>` : ''}<button class="btn ghost" data-close>Close</button>`);
  }));
  $('#mvGo').onclick = async () => {
    $('#mvGo').disabled = true; $('#mvGo').textContent = 'Inspector is reviewing…';
    try {
      const r = await api('/api/reviews/manual', { method: 'POST', body: { member_id: $('#mvMember').value || null, subject: $('#mvSubject').value, submission: $('#mvText').value } });
      const f = JSON.parse(r.findings || '[]');
      $('#mvOut').innerHTML = `<div class="banner" style="margin-top:12px">${r.passed ? '✅ Pass' : `❌ ${f.length} issues`} — ${esc(r.summary)}<br>${f.map((x, i) => `${i + 1}. <b>${esc(x.title)}</b>: ${esc(x.detail)}`).join('<br>')}</div>`;
    } catch (e) { toast(e.message); }
    $('#mvGo').disabled = false; $('#mvGo').textContent = '🔍 Review';
  };
}

// ---------- growth ----------
async function renderGrowth() {
  const [items, contrib] = await Promise.all([api('/api/growth'), api('/api/contributions').catch(() => [])]);
  const counts = {};
  const weekStart = weekStartOf(state.today);
  items.filter((i) => i.date >= weekStart).forEach((i) => (counts[i.kind] = (counts[i.kind] || 0) + 1));
  $('#view').innerHTML = `<h2>Growth</h2>
    <p class="muted" style="margin-top:0">Everything the growth member posts in the channel (support requests, app listings, blogs, newsletters, credentials) is counted here. When credentials or docs arrive for a stuck app, Sprout tags the developer in that request's thread.</p>
    <div class="kpis">${Object.keys(GROWTH_LABEL).filter((k) => k !== 'other').map((k) => kpi(counts[k] || 0, GROWTH_LABEL[k] + ' (this week)')).join('')}${kpi(items.filter((i) => i.unblocked_request_id && i.date >= weekStart).length, 'Requests unblocked')}</div>
    <div class="card"><div class="table-wrap">${items.length ? `<table><tr><th>Date</th><th>Member</th><th>Type</th><th>Message</th><th>Unblocked</th></tr>${items.map((i) => `<tr><td>${i.date}</td><td>${esc(i.name)}</td><td><span class="pill">${GROWTH_LABEL[i.kind] || i.kind}</span></td><td>${esc((i.text || '').slice(0, 140))}</td><td>${i.unblocked_request_id ? '🔓 ' + esc(i.app_name || '') : ''}</td></tr>`).join('')}</table>` : '<div class="empty">Nothing yet</div>'}</div></div>
    ${contributionsSection(contrib)}`;
}

// ---------- reports ----------
async function renderReports() {
  const reports = await api('/api/reports');
  $('#view').innerHTML = `<div class="row" style="margin-bottom:12px"><h2 style="margin:0">Reports</h2><span class="spacer"></span>
      <button class="btn ghost" id="pvDaily">👀 Today's 7 PM preview</button><button class="btn" id="genWeekly">📜 Generate weekly report now</button></div>
    <p class="muted" style="margin-top:0">The 7 PM daily alert and the Monday weekly report (team + your personal one) are generated automatically and sent to you as a Slack DM.</p>
    <div class="grid g2">${reports.length ? reports.map((r) => `<div class="card"><div class="row"><span class="pill ${r.kind === 'weekly' ? 'started' : r.kind === 'personal' ? 'rnd' : 'new'}">${r.kind}</span><span class="muted">${r.period_start}${r.period_end !== r.period_start ? ' → ' + r.period_end : ''}</span><span class="spacer"></span><button class="btn ghost small" data-copy="${r.id}">Copy</button></div><pre class="report">${esc(r.content)}</pre></div>`).join('') : '<div class="card empty">No reports yet</div>'}</div>`;
  document.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(reports.find((r) => r.id == b.dataset.copy).content); toast('Copied'); }));
  $('#genWeekly').onclick = async () => { $('#genWeekly').disabled = true; const r = await api('/api/agents/scribe/run', { method: 'POST' }); toast(r.message || r.error); renderReports(); };
  $('#pvDaily').onclick = async () => { const r = await api('/api/reports/preview', { method: 'POST' }); modal(`<h2>7 PM preview</h2><pre class="report">${esc(r.text)}</pre><button class="btn ghost" data-close>Close</button>`); };
}

// ---------- commander ----------
async function renderCommander() {
  const hist = await api('/api/broadcasts');
  $('#view').innerHTML = `<h2>Commander</h2>
    <div class="grid g2">
      <div class="card cmd">
        <div class="card-h"><h3>1 · Write your message</h3><span class="muted">Hinglish is fine</span></div>
        <textarea id="cMsg" style="min-height:120px" placeholder="sab log aaj Shopify plugin ke triggers pe focus karo, shaam tak review me daalna"></textarea>
        <div class="row" style="margin-top:8px">
          <div class="seg" id="cTone" role="tablist" aria-label="Tone"><button class="on" data-tone="friendly">Friendly</button><button data-tone="firm">Firm</button><button data-tone="short">Short</button></div>
          <span class="spacer"></span>
          <button class="btn ghost" id="cPolish">✨ Improve with AI</button>
        </div>
        <div id="cDraft" class="ai-draft hidden">
          <div class="card-h" style="margin:14px 0 6px"><h3>2 · AI draft</h3><span class="muted" id="cNote"></span></div>
          <textarea id="cOut" style="min-height:130px"></textarea>
          <div class="row" style="margin-top:6px"><button class="btn ghost small" id="cUndo">↺ Use my original</button><button class="btn ghost small" id="cAgain">✨ Try again</button></div>
        </div>
        <div class="card-h" style="margin:16px 0 6px"><h3 id="cStep">2 · Send</h3></div>
        <label>Who to tag</label>${memberChecks([], 'cm')}
        <label class="check"><input type="checkbox" id="cImp"/> 🚨 Important — send an M91 alert too (tagged people, or the whole team if nobody is tagged)</label>
        <button class="btn" id="cSend" style="margin-top:8px">📣 Send to channel</button>
        ${state.integrations.slack ? '' : '<p class="muted">Slack is not connected — the message will only be saved here.</p>'}
        ${state.integrations.msg91 ? '' : '<p class="muted">M91 is not set up — no alert will go out.</p>'}
      </div>
      <div class="card"><h3>History</h3>${hist.length ? hist.map((b) => `<div class="feed-item"><span class="em">${b.important ? '🚨' : '📣'}</span><div>${esc(b.message)}<time>${ago(b.created_at)}${b.sms_status ? ' · M91: ' + esc(b.sms_status) : ''}</time></div></div>`).join('') : '<div class="empty">Nothing sent yet</div>'}</div>
    </div>`;
  let tone = 'friendly';
  document.querySelectorAll('#cTone button').forEach((b) => (b.onclick = () => { tone = b.dataset.tone; document.querySelectorAll('#cTone button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const improve = async () => {
    const btn = $('#cPolish'), msg = $('#cMsg').value.trim();
    if (!msg) { $('#cMsg').focus(); return toast('Write a message first'); }
    btn.disabled = true; btn.textContent = '✨ Thinking…'; $('#cDraft').classList.add('thinking');
    try {
      const r = await api('/api/broadcast/polish', { method: 'POST', body: { message: msg, tone } });
      $('#cDraft').classList.remove('hidden'); $('#cOut').value = r.text; $('#cNote').textContent = r.note || '';
      $('#cStep').textContent = '3 · Send'; typeIn($('#cOut'), r.text);
    } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = '✨ Improve with AI'; $('#cDraft').classList.remove('thinking');
  };
  $('#cPolish').onclick = improve; $('#cAgain').onclick = improve;
  $('#cUndo').onclick = () => { $('#cDraft').classList.add('hidden'); $('#cOut').value = ''; $('#cStep').textContent = '2 · Send'; };
  $('#cSend').onclick = async () => {
    const message = ($('#cDraft').classList.contains('hidden') ? $('#cMsg').value : $('#cOut').value).trim();
    if (!message) return toast('Write a message first');
    const b = $('#cSend'); b.disabled = true;
    try {
      await api('/api/broadcast', { method: 'POST', body: { message, member_ids: checked('cm'), important: $('#cImp').checked, polish: false } });
      toast('Sent ✅'); renderCommander();
    } catch (e) { toast(e.message); b.disabled = false; }
  };
}
// Daily standup: 11 AM Good morning thread, yesterday's tally, the target, M91 nudges.
function standupCard(s) {
  const h2 = $('#view h2'); if (!h2) return;
  const on = (k) => s[k] === null || s[k] === undefined ? true : !!s[k];
  h2.insertAdjacentHTML('afterend', `<div class="card su-card"><h3>☀️ Daily standup</h3>
    <p class="muted">Every day at <b>11:00 AM</b> (Mon–Sat) SquadForge posts a friendly Good morning in the channel. Everyone replies in its thread with their plan, then what they built. Next morning the first reply is yesterday's tally (you also get the full version as a DM). Monday's report adds the week.</p>
    <div class="su-row">
      <label>Daily target <input id="suTarget" type="number" min="1" max="100" value="${esc(s['standup.target'] ?? 10)}" style="width:80px"/> actions + triggers per person</label>
      <label class="check"><input type="checkbox" id="suM91am" ${on('standup.m91_morning') ? 'checked' : ''}/> M91 alert at 11 AM: “post your plan”</label>
      <label class="check"><input type="checkbox" id="suM91pm" ${on('standup.m91_missing') ? 'checked' : ''}/> M91 alert at 7 PM to anyone without an update</label>
    </div>
    <div class="row"><button class="btn small" id="suSave">Save</button><button class="btn ghost small" id="suPreview">Preview yesterday's tally</button><button class="btn ghost small" id="suPost">Post Good morning now</button></div>
  </div>`);
  $('#suSave').onclick = async () => { await api('/api/settings', { method: 'POST', body: { 'standup.target': Number($('#suTarget').value) || 10, 'standup.m91_morning': $('#suM91am').checked, 'standup.m91_missing': $('#suM91pm').checked } }); toast('Standup settings saved'); };
  $('#suPreview').onclick = async () => { try { const r = await api('/api/standup/tally'); modal(`<div class="card-h"><h2 style="margin:0">📋 Tally for ${esc(r.date)}</h2></div><p class="muted">This goes in the Good morning thread (short) and to you as a DM (full).</p><pre class="report">${esc(r.short)}</pre><details><summary>Full version (your DM)</summary><pre class="report">${esc(r.full)}</pre></details><div class="row"><span class="spacer"></span><button class="btn ghost" data-close>Close</button></div>`); } catch (e) { toast(e.message); } };
  $('#suPost').onclick = async () => { if (!confirm('Post the Good morning message in the team channel now?')) return; const b = $('#suPost'); b.disabled = true; try { const r = await api('/api/standup/morning', { method: 'POST' }); toast(r.message || r.error || 'Done'); } catch (e) { toast(e.message); } b.disabled = false; };
}

// Workspace (team) settings: name and who can open it.
async function workspaceCard() {
  if (!myWorkspace || !myEmail) return;
  const h2 = $('#view h2'); if (!h2) return;
  h2.insertAdjacentHTML('afterend', `<div class="card ws-card" id="wsCard"><h3>🗂 Workspace</h3>
    <div class="ws-row"><input id="wsRename" value="${esc(myWorkspace.name)}" aria-label="Workspace name"/><button class="btn small" id="wsSave">Rename</button></div>
    <p class="muted">Each workspace is one team with its own members, Slack channel, M91 alerts, reports and settings. People below can open it: <b>owners/admins</b> see everything, <b>managers</b> see the read-only Manager view (your boss), <b>viewers</b> see the live views.</p>
    <div id="wsPeople" class="ws-people"></div>
    <div class="ws-row"><input id="wsInvEmail" type="email" placeholder="teammate@company.com" aria-label="Email to invite"/><select id="wsInvRole"><option value="viewer">Viewer — live views</option><option value="manager">Manager — read-only manager view</option><option value="admin">Admin — everything</option></select><button class="btn small" id="wsInvite">Add person</button></div>
    <p class="muted small">They sign in (or create an account) with this email and the workspace appears in their switcher.</p></div>`);
  const draw = (list) => {
    $('#wsPeople').innerHTML = list.map((p) => `<div class="ws-person"><span class="avatar-xs">${esc(p.email[0].toUpperCase())}</span><span class="ws-email">${esc(p.email)}</span><span class="pill">${esc(p.role)}</span>${p.env ? '<span class="muted small">from ADMIN_EMAILS</span>' : `<button class="btn ghost small" data-rm="${esc(p.email)}">Remove</button>`}</div>`).join('') || '<p class="muted">Only you so far.</p>';
    $('#wsPeople').querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
      if (!confirm(`Remove ${b.dataset.rm} from this workspace?`)) return;
      try { draw(await api('/api/workspace/people', { method: 'DELETE', body: { email: b.dataset.rm } })); } catch (e) { toast(e.message); }
    }));
  };
  try { draw(await api('/api/workspace/people')); } catch (e) { $('#wsPeople').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  $('#wsSave').onclick = async () => {
    try { const w = await api('/api/workspace', { method: 'PATCH', body: { name: $('#wsRename').value } }); myWorkspace.name = w.name; const mine = myWorkspaces.find((x) => x.id === w.id); if (mine) mine.name = w.name; renderWsSwitch(); toast('Workspace renamed'); } catch (e) { toast(e.message); }
  };
  $('#wsInvite').onclick = async () => {
    try { draw(await api('/api/workspace/people', { method: 'POST', body: { email: $('#wsInvEmail').value, role: $('#wsInvRole').value } })); $('#wsInvEmail').value = ''; toast('Added — they can sign in now'); } catch (e) { toast(e.message); }
  };
}

// little typewriter so the AI draft visibly "writes itself"
function typeIn(el, text) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.value = text; return; }
  let i = 0; el.value = '';
  const step = () => { i = Math.min(text.length, i + Math.max(2, Math.round(text.length / 60))); el.value = text.slice(0, i); if (i < text.length) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- settings ----------
async function renderSettings() {
  const s = await api('/api/settings');
  members = await api('/api/members');
  const i = state.integrations;
  const v = (k) => esc(s[k] ?? '');
  const locked = (k) => (s.env_locked.includes(k) ? 'disabled title="Set by an env var"' : '');
  $('#view').innerHTML = `<h2>Settings</h2>
  <div class="grid g2">
    <div class="card"><h3>🔌 Connections</h3>
      <ul class="setup-list">
        <li>${i.slack ? '✅' : '⬜'} Slack — env <code>SLACK_BOT_TOKEN</code> + channel ID</li>
        <li>${i.lead ? '✅' : '⬜'} Lead's Slack user ID (for DM reports)</li>
        <li>${i.ai ? '✅' : '⬜'} AI — env <code>ANTHROPIC_API_KEY</code></li>
        <li>${i.msg91 ? '✅' : '⬜'} M91 alerts — env <code>MSG91_AUTH_KEY</code> + <code>MSG91_TEMPLATE_ID</code></li>
        <li>${i.review_instructions ? '✅' : '⬜'} Inspector review instructions</li>
      </ul>
      <p class="muted">Put secret keys only in Embarko env vars, not here.</p>
      <label>Slack channel ID</label><input id="s_ch" value="${v('cfg.SLACK_CHANNEL_ID')}" placeholder="C0123ABCD" ${locked('SLACK_CHANNEL_ID')}/>
      <label>Lead (your) Slack user ID</label><input id="s_lead" value="${v('cfg.LEAD_SLACK_USER_ID')}" placeholder="U0123ABCD" ${locked('LEAD_SLACK_USER_ID')}/>
      <label>Slack workspace URL (for thread links)</label><input id="s_ws" value="${v('cfg.SLACK_WORKSPACE_URL')}" placeholder="https://yourteam.slack.com" ${locked('SLACK_WORKSPACE_URL')}/>
      <label class="check"><input type="checkbox" id="s_rem" ${s['herald.channel_reminder'] ? 'checked' : ''}/> Also remind people with missing updates in the channel (with a tag)</label>
      <label class="check"><input type="checkbox" id="s_sun" ${s['herald.sunday'] ? 'checked' : ''}/> Send the 7 PM alert on Sundays too</label>
      <label class="check"><input type="checkbox" id="s_gro" ${s['growth.notify_thread'] !== false ? 'checked' : ''}/> Tag the developer in the stuck request's thread when credentials arrive</label>
      <button class="btn" id="saveConn" style="margin-top:8px">Save</button>
    </div>
    <div class="card"><h3>👥 Team members</h3>
      <div class="table-wrap"><table><tr><th>Name</th><th>Role</th><th>Slack ID</th><th>Phone</th><th></th></tr>
      ${members.map((m) => `<tr><td>${esc(m.name)}${m.is_demo ? ' <span class="pill">demo</span>' : ''}</td><td>${m.role}</td><td><code>${esc(m.slack_user_id || '–')}</code></td><td>${esc(m.phone || '–')}</td><td class="row" style="flex-wrap:nowrap"><button class="btn ghost small" data-edit="${m.id}">Edit</button>${m.phone ? `<button class="btn ghost small" data-m91="${m.id}" title="Invite to the M91 app so they can get alerts">🔔 Invite to M91</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No members</td></tr>'}
      </table></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="addMem">+ Member</button><button class="btn ghost" id="impMem" ${i.slack ? '' : 'disabled'}>Import from Slack channel</button></div>
      <p class="muted">Role: <b>tech</b> = plugin builders, <b>growth</b> = growth member, <b>lead</b> = you. Phone in 91XXXXXXXXXX format (for M91 alerts).</p>
      <h3 style="margin-top:16px">➕ Publish count (manual)</h3>
      <p class="muted">Can also come automatically from a viaSocket flow: <code>POST /webhooks/publish</code> (see README).</p>
      <div class="grid g3"><select id="pMem">${members.filter((m) => m.role === 'tech').map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
        <select id="pKind"><option value="action">Action</option><option value="trigger">Trigger</option><option value="app">App</option></select>
        <input id="pCount" type="number" value="1" min="1"/></div>
      <input id="pPlugin" placeholder="Plugin name (optional)" style="margin-top:8px"/>
      <button class="btn ghost" id="addPub" style="margin-top:8px">Add</button>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h3>🔍 Inspector review instructions</h3>
    <p class="muted">Inspector reviews by exactly these rules: naming, help text, auth, error handling, field types, whatever you want. Write each point on its own line.</p>
    <textarea id="s_ins" style="min-height:220px" placeholder="1. Every action name starts with a verb (Create Deal, Update Contact)\n2. Every field has help text…">${v('inspector.instructions')}</textarea>
    <button class="btn" id="saveIns" style="margin-top:8px">Save instructions</button>
  </div>
  <div class="card" style="margin-top:16px"><h3>🔑 Keywords (for recognising Slack messages)</h3>
    <p class="muted">Separate with commas. Leave empty to use the defaults. With an AI key, messages the keywords miss are classified by AI.</p>
    <div class="grid g2">
      ${[['REQUEST_KEYWORDS', 'Client request (in your post)'], ['MORNING_KEYWORDS', 'Morning thread'], ['EVENING_KEYWORDS', 'Evening thread'], ['REVIEW_KEYWORDS', 'Review request']].map(([k, l]) => `<div><label>${l}</label><input id="kw_${k}" value="${v('cfg.' + k)}" placeholder="${esc(s.defaults[k])}"/></div>`).join('')}
    </div>
    <p class="muted">Thread status words: <code>r&d</code>, <code>started</code>, <code>stuck - reason</code>, <code>completed</code> (or <code>status: stuck - API doc missing</code>).</p>
    <button class="btn" id="saveKw">Save keywords</button>
  </div>
  <div class="card" style="margin-top:16px"><h3>🧪 Demo data</h3><div class="row"><button class="btn ghost" id="demoLoad">Load demo</button><button class="btn red" id="demoClear">Clear demo</button></div></div>`;

  $('#saveConn').onclick = async () => {
    const body = { 'herald.channel_reminder': $('#s_rem').checked, 'herald.sunday': $('#s_sun').checked, 'growth.notify_thread': $('#s_gro').checked };
    if (!$('#s_ch').disabled) body['cfg.SLACK_CHANNEL_ID'] = $('#s_ch').value.trim();
    if (!$('#s_lead').disabled) body['cfg.LEAD_SLACK_USER_ID'] = $('#s_lead').value.trim();
    if (!$('#s_ws').disabled) body['cfg.SLACK_WORKSPACE_URL'] = $('#s_ws').value.trim();
    await api('/api/settings', { method: 'POST', body }); toast('Saved'); refresh();
  };
  $('#saveIns').onclick = async () => { await api('/api/settings', { method: 'POST', body: { 'inspector.instructions': $('#s_ins').value } }); toast('Instructions saved'); refresh(); };
  $('#saveKw').onclick = async () => {
    const body = {}; ['REQUEST_KEYWORDS', 'MORNING_KEYWORDS', 'EVENING_KEYWORDS', 'REVIEW_KEYWORDS'].forEach((k) => (body['cfg.' + k] = $('#kw_' + k).value.trim()));
    await api('/api/settings', { method: 'POST', body }); toast('Keywords saved');
  };
  $('#addMem').onclick = () => memberModal();
  workspaceCard();
  standupCard(s);
  if (members.some((x) => /^SIM_/.test(x.slack_user_id || ''))) {
    $('#view h2').insertAdjacentHTML('afterend', `<div class="banner">🧪 <b>Test teammates are on</b> (Aarav, Meera, Kabir, Isha). In Slack, start a message with <code>[Aarav]</code> and it counts as Aarav's; write <code>@Aarav</code> in a request thread to assign. <a href="#" id="simOff">Remove test teammates</a></div>`);
    $('#simOff').onclick = async (e) => { e.preventDefault(); if (!confirm('Remove the 4 test teammates and their updates?')) return; await api('/api/sim', { method: 'DELETE' }); toast('Test teammates removed'); renderSettings(); };
  }
  api('/api/checklist').then((c) => {
    if (!c.hidden || !$('#view h2')) return;
    $('#view h2').insertAdjacentHTML('afterend', `<div class="banner">🧪 The “Test it for real” checklist is hidden (${c.done} of ${c.total} done). <a href="#" id="ckShow">Show it on the Dashboard</a></div>`);
    $('#ckShow').onclick = async (e) => { e.preventDefault(); await api('/api/checklist', { method: 'POST', body: { hidden: false } }); tab = 'team'; location.hash = 'team'; render(); };
  }).catch(() => {});
  $('#impMem').onclick = async () => { const r = await api('/api/members/import-slack', { method: 'POST' }); toast(`${r.added} members imported — please check their roles`); renderSettings(); };
  document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => memberModal(members.find((m) => m.id == b.dataset.edit))));
  document.querySelectorAll('[data-m91]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api(`/api/members/${b.dataset.m91}/m91-invite`, { method: 'POST' }); toast('M91 invite sent — they accept it in the M91 app'); }
    catch (e) { toast(e.message); }
    b.disabled = false;
  }));
  $('#addPub').onclick = async () => { await api('/api/publishes', { method: 'POST', body: { member_id: Number($('#pMem').value), kind: $('#pKind').value, count: $('#pCount').value, plugin: $('#pPlugin').value } }); toast('Added'); refresh(); };
  $('#demoLoad').onclick = async () => { const r = await api('/api/demo/load', { method: 'POST' }); toast(r.message); refresh(); };
  $('#demoClear').onclick = async () => { const r = await api('/api/demo/clear', { method: 'POST' }); toast(r.message); refresh(); };
}
function memberModal(m = {}) {
  modal(`<h2>${m.id ? 'Edit' : 'Add'} member</h2>
    <label>Name</label><input id="mName" value="${esc(m.name || '')}"/>
    <label>Role</label><select id="mRole">${['tech', 'growth', 'lead'].map((r) => `<option ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    <label>Slack user ID</label><input id="mSlack" value="${esc(m.slack_user_id || '')}" placeholder="U0123ABCD (profile → Copy member ID)"/>
    <label>Phone (M91 alerts)</label><input id="mPhone" value="${esc(m.phone || '')}" placeholder="919876543210"/>
    ${m.id ? `<label class="check"><input type="checkbox" id="mActive" ${m.active ? 'checked' : ''}/> Active</label>` : ''}
    <div class="row" style="margin-top:12px"><button class="btn" id="mSave">Save</button>${m.id ? '<button class="btn red small" id="mDel">Delete</button>' : ''}<span class="spacer"></span><button class="btn ghost" data-close>Cancel</button></div>`);
  $('#mSave').onclick = async () => {
    const body = { name: $('#mName').value, role: $('#mRole').value, slack_user_id: $('#mSlack').value.trim(), phone: $('#mPhone').value.trim() };
    try {
      if (m.id) await api(`/api/members/${m.id}`, { method: 'PATCH', body: { ...body, active: $('#mActive').checked } });
      else await api('/api/members', { method: 'POST', body });
      closeModal(); renderSettings(); refresh();
    } catch (e) { toast(e.message); }
  };
  if (m.id) $('#mDel').onclick = async () => { if (!confirm('Delete this member? Their data will be removed too.')) return; await api(`/api/members/${m.id}`, { method: 'DELETE' }); closeModal(); renderSettings(); refresh(); };
}

// ---------- main loop ----------
async function refresh() {
  try {
    state = await api('/api/state');
    renderHeader();
    if (tab === 'flow' && typeof updateFlow === 'function') updateFlow();
    if (tab === 'team' && typeof birdReact === 'function') birdReact(state);
    if (tab === 'village' && typeof villageUpdate === 'function') villageUpdate();
  } catch (e) { console.warn(e); }
}
async function render() {
  markTab();
  if (!state) return;
  try {
    if (role === 'admin' && (!members.length || tab === 'settings')) members = await api('/api/members');
    ({ flow: renderFlow, integrations: renderIntegrations, village: renderVillage, team: renderTeam, manager: renderManager, requests: renderRequests, reviews: renderReviews, growth: renderGrowth, reports: renderReports, history: renderHistory, commander: renderCommander, settings: renderSettings }[tab] || renderVillage)();
    if (tab === 'village') lastActivityId = state.activity[0] ? state.activity[0].id : 0;
  } catch (e) { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
async function boot() {
  const me = await api('/api/me');
  if (!me.authed) return showLogin();
  role = me.role || 'admin';
  myEmail = me.email || null;
  myName = me.name || null;
  myWorkspaces = me.workspaces || [];
  myWorkspace = me.workspace || null;
  if (myWorkspace) saveWs(myWorkspace.id);
  renderWsSwitch();
  state = await api('/api/state');
  if (role === 'admin') members = await api('/api/members');
  renderHeader();
  render();
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 5000);
}
boot();
window.addEventListener('hashchange', () => {
  const t = location.hash.replace('#', '');
  if (t && t !== tab && ALL_TABS.includes(t)) { tab = t; render(); }
});
// ---------- light / dark mode ----------
(function () {
  const btn = document.getElementById('themeToggle'); if (!btn) return;
  const current = () => document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = () => btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  label();
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sf_theme', next); } catch { /* ignore */ }
    label();
    document.documentElement.classList.add('theme-anim'); setTimeout(() => document.documentElement.classList.remove('theme-anim'), 500);
  });
})();
