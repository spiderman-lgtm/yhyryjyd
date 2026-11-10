/* SquadForge dashboard - vanilla JS */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { new: 'New', rnd: 'R&D', started: 'Started', stuck: 'Stuck', completed: 'Completed' };
const AGENT_EMOJI = { scout: '🔭', tracker: '🎯', growth: '🌱', inspector: '🔍', analyst: '📊', herald: '📢', scribe: '📜', commander: '⚔️' };
const GROWTH_LABEL = { support_request: 'Support request', app_listing: 'App listing', blog: 'Blog', newsletter: 'Newsletter', credentials: 'Credentials/Docs', other: 'Other' };

let state = null;
let members = [];
const VIEWER_TABS = ['flow', 'village'];
const ALL_TABS = ['flow', 'team', 'village', 'requests', 'reviews', 'growth', 'reports', 'commander', 'integrations', 'settings'];
let tab = ALL_TABS.includes(location.hash.replace('#', '')) ? location.hash.replace('#', '') : 'flow';
let role = 'admin';
let pollTimer = null;
let lastActivityId = 0;

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && !path.startsWith('/api/login')) { showLogin(); throw new Error('Login karo'); }
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
  if (s < 60) return 'abhi';
  if (s < 3600) return Math.floor(s / 60) + ' min pehle';
  if (s < 86400) return Math.floor(s / 3600) + ' ghante pehle';
  return Math.floor(s / 86400) + ' din pehle';
}
const fmt = (v, suf = '') => (v === null || v === undefined ? '–' : v + suf);
const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '–');
const initials = (n) => n.replace(/\(.*\)/, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// ---------- auth ----------
function showLogin() { $('#login').classList.remove('hidden'); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/login', { method: 'POST', body: { email: $('#email').value, password: $('#password').value } }); $('#login').classList.add('hidden'); boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); location.reload(); });

// ---------- tabs ----------
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  tab = b.dataset.tab; location.hash = tab; render();
});
function markTab() {
  if (role === 'viewer' && !VIEWER_TABS.includes(tab)) tab = 'flow';
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.classList.toggle('hidden', role === 'viewer' && b.dataset.admin !== undefined);
  });
}

// ---------- header ----------
function renderHeader() {
  const w = state.week_metrics.totals;
  const open = Object.values(w.open_by_status || {}).reduce((a, b) => a + b, 0);
  $('#resources').innerHTML = [
    ['⚡', w.actions, 'actions'], ['🎯', w.triggers, 'triggers'], ['🧩', w.apps, 'apps'],
    ['📜', open, 'open requests'], ['🛡️', fmt(w.error_rate), 'error rate'],
  ].map(([ic, v, l]) => `<div class="res" title="Is hafte"><span class="ic">${ic}</span>${esc(v)} <small>${l}</small></div>`).join('');
  const i = state.integrations;
  $('#integrations').innerHTML = [['Slack', i.slack], ['AI', i.ai], ['MSG91', i.msg91]]
    .map(([n, on]) => `<span class="dot ${on ? 'on' : ''}">${on ? '●' : '○'} ${n}</span>`).join('');
  $('#logoutBtn').classList.toggle('hidden', !state.password_set);
  const banners = [];
  if (role === 'viewer') { $('#banner').innerHTML = ''; return; }
  if (!state.password_set) banners.push(`<div class="banner red">🔓 <b>ADMIN_PASSWORD</b> set nahi hai, isliye dashboard abhi sabke liye khula hai. Embarko pe env var set karo.</div>`);
  if (!state.member_count) banners.push(`<div class="banner">👋 Shuru karo: <b>Settings</b> mein team members add karo (ya Slack se import karo). Sirf dekhna hai to <a href="#" id="demoLink">demo data load karo</a>.</div>`);
  else if (state.has_demo) banners.push(`<div class="banner">🧪 Demo data dikh raha hai. Asli data ke liye Settings se "Clear demo" karo.</div>`);
  $('#banner').innerHTML = banners.join('');
  const dl = $('#demoLink'); if (dl) dl.onclick = async (e) => { e.preventDefault(); await api('/api/demo/load', { method: 'POST' }); toast('Demo data load ho gaya'); refresh(); };
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

function renderVillage() {
  const agents = state.agents;
  const blds = agents.map((a) => `
    <div class="bld ${a.state}" data-agent="${a.key}" title="${esc(a.job)}">
      <div class="bubble">${esc(a.state === 'working' ? (a.message || 'kaam chal raha hai…') : a.state === 'error' ? '⚠️ ' + (a.message || 'error') : (a.message || 'Ready'))}</div>
      <svg viewBox="0 0 120 104" aria-hidden="true">${BUILDINGS[a.key]()}</svg>
      <div class="agent">${a.emoji}</div>
      <div class="label">${esc(a.name)}</div>
    </div>`).join('');
  const heroes = state.week_metrics.members.map((m) => heroCard(m)).join('') || `<div class="empty">Abhi koi member nahi. Settings mein add karo.</div>`;
  $('#view').innerHTML = `
    <div class="village-layout">
      <div>
        <div class="scene">
          <div class="sun"></div><div class="cloud"></div><div class="cloud c2"></div><div class="path"></div>
          <div class="buildings">${blds}</div>
        </div>
        <h2 style="margin-top:18px">🛡️ Heroes — is hafte</h2>
        <div class="heroes">${heroes}</div>
      </div>
      <div class="card feed">
        <h3>⚔️ Battle Log</h3>
        <div class="feed-list" id="feed">${feedHtml(state.activity)}</div>
      </div>
    </div>`;
  document.querySelectorAll('.bld').forEach((el) => el.addEventListener('click', () => agentModal(el.dataset.agent)));
}

function feedHtml(items) {
  if (!items.length) return `<div class="empty">Abhi tak koi activity nahi. Agents ko kaam pe lagao!</div>`;
  return items.map((a) => `<div class="feed-item ${a.level}"><span class="em">${AGENT_EMOJI[a.agent] || '•'}</span><div>${esc(a.message)}<time>${ago(a.created_at)}</time></div></div>`).join('');
}

function heroCard(m) {
  const today = state.today_metrics.members.find((x) => x.id === m.id) || {};
  const nextXp = Math.pow(m.level, 2) * 20, prevXp = Math.pow(m.level - 1, 2) * 20;
  const pct = Math.min(100, Math.round(((m.xp - prevXp) / Math.max(1, nextXp - prevXp)) * 100));
  const stats = m.role === 'growth'
    ? [[Object.values(m.growth).reduce((a, b) => a + b, 0), 'posts'], [m.growth.support_request || 0, 'support'], [m.unblocked, 'unblocks']]
    : [[m.actions, 'actions'], [m.triggers, 'triggers'], [fmt(m.error_rate), 'err rate']];
  return `<div class="hero ${m.role}">
    <div class="lvl">LV ${m.level}</div>
    <div class="top"><div class="avatar">${esc(initials(m.name))}</div><div><div class="name">${esc(m.name)}</div><div class="muted" style="font-size:12px">${m.role === 'growth' ? 'Growth' : 'Plugin builder'} · ${m.xp} XP</div></div></div>
    <div class="xpbar"><i style="width:${pct}%"></i></div>
    <div class="stats">${stats.map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
    <div class="today-flags">
      <span class="pill ${today.morning_updates ? 'completed' : 'stuck'}">${today.morning_updates ? '✓' : '✗'} subah</span>
      <span class="pill ${today.evening_updates ? 'completed' : 'stuck'}">${today.evening_updates ? '✓' : '✗'} shaam</span>
      ${m.role !== 'growth' ? `<span class="pill">📜 ${m.requests_completed}/${m.requests_assigned} req</span>` : ''}
    </div>
  </div>`;
}

function agentModal(key) {
  const a = state.agents.find((x) => x.key === key);
  const extra = {
    herald: `<button class="btn ghost" id="morningBtn">🌅 Subah ka reminder abhi bhejo</button>`,
    commander: `<button class="btn" onclick="closeModal();tab='commander';location.hash='commander';render()">Commander kholo</button>`,
    inspector: state.integrations.review_instructions ? '' : `<p class="banner">Review instructions abhi set nahi hain — Settings mein daalo.</p>`,
  }[key] || '';
  modal(`<h2>${a.emoji} ${esc(a.name)} <span class="muted" style="font-size:14px">· ${esc(a.building)}</span></h2>
    <p>${esc(a.job)}</p>
    <p class="muted">Status: <b>${esc(a.state)}</b> — ${esc(a.message || '')}<br>Last run: ${ago(a.last_run_at)}</p>
    <div class="row">${a.runnable ? `<button class="btn" id="runAgent">▶ Abhi chalao</button>` : ''}${extra}<span class="spacer"></span><button class="btn ghost" data-close>Band karo</button></div>`);
  const rb = $('#runAgent');
  if (rb) rb.onclick = async () => { rb.disabled = true; rb.textContent = 'Chal raha hai…'; try { const r = await api(`/api/agents/${key}/run`, { method: 'POST' }); toast(r.message || r.error || 'Ho gaya'); } catch (e) { toast(e.message); } closeModal(); refresh(); };
  const mb = $('#morningBtn');
  if (mb) mb.onclick = async () => { const r = await api('/api/agents/herald/morning', { method: 'POST' }); toast(r.message || 'Bheja'); closeModal(); refresh(); };
}

// ---------- team ----------
async function renderTeam(range = 'week') {
  const t = state.today;
  const ws = weekStartOf(t);
  const ranges = { week: [ws, t, 'Is hafte'], last: [addDays(ws, -7), addDays(ws, -1), 'Pichhla hafta'], d14: [addDays(t, -13), t, '14 din'], d30: [addDays(t, -29), t, '30 din'] };
  const [from, to] = ranges[range];
  const [data, logs] = await Promise.all([api(`/api/metrics?from=${from}&to=${to}`), api(`/api/logs?date=${t}`)]);
  const T = data.team.totals;
  $('#view').innerHTML = `
    <div class="row" style="margin-bottom:12px"><h2 style="margin:0">👥 Team metrics</h2><span class="spacer"></span>
      ${Object.entries(ranges).map(([k, v]) => `<button class="btn ${k === range ? '' : 'ghost'} small" data-range="${k}">${v[2]}</button>`).join('')}</div>
    <div class="kpis">
      ${kpi(T.actions, 'Actions')}${kpi(T.triggers, 'Triggers')}${kpi(T.apps, 'Apps')}${kpi(T.client_requests, 'Client requests aayi')}${kpi(T.requests_completed, 'Requests complete')}${kpi(fmt(T.error_rate), 'Error rate / review')}${kpi(T.missed_updates, 'Missed updates')}
    </div>
    <div class="grid g2">
      <div class="card"><div class="row"><h3 style="margin:0">Roz ka kaam</h3><span class="spacer"></span><div class="legend"><span><i style="background:var(--gold)"></i>Actions</span><span><i style="background:var(--blue)"></i>Triggers</span><span><i style="background:var(--green)"></i>Apps</span></div></div>${barChart(data.series)}</div>
      <div class="card"><h3>Aaj ke updates (${t})</h3>${logsTable(logs.logs)}</div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Member-wise (${from} → ${to})</h3><div class="table-wrap">${memberTable(data.team.members)}</div></div>`;
  document.querySelectorAll('[data-range]').forEach((b) => (b.onclick = () => renderTeam(b.dataset.range)));
}
const kpi = (v, l) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
function weekStartOf(d) { const wd = new Date(d + 'T12:00:00Z').getUTCDay(); return addDays(d, wd === 0 ? -6 : 1 - wd); }
function addDays(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

function barChart(series) {
  const W = 600, H = 200, pad = 26;
  const max = Math.max(1, ...series.map((s) => s.actions + s.triggers + s.apps));
  const bw = (W - pad) / series.length;
  const bars = series.map((s, i) => {
    let y = H - 18;
    const seg = [['actions', 'var(--gold)'], ['triggers', 'var(--blue)'], ['apps', 'var(--green)']].map(([k, c]) => {
      const h = (s[k] / max) * (H - 40); y -= h;
      return h > 0 ? `<rect x="${pad + i * bw + 3}" y="${y}" width="${Math.max(2, bw - 6)}" height="${h}" rx="3" fill="${c}"><title>${s.date}: ${s[k]} ${k}</title></rect>` : '';
    }).join('');
    const lbl = series.length <= 16 || i % 2 === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${H - 4}" fill="var(--muted)" font-size="10" text-anchor="middle">${s.date.slice(8)}</text>` : '';
    return seg + lbl;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><text x="0" y="12" fill="var(--muted)" font-size="10">${max}</text><line x1="${pad}" y1="${H - 18}" x2="${W}" y2="${H - 18}" stroke="var(--line)"/>${bars}</svg>`;
}
function logsTable(logs) {
  if (!logs.length) return `<div class="empty">Aaj abhi tak koi update nahi aaya</div>`;
  return `<div class="table-wrap"><table><tr><th>Member</th><th>Subah</th><th>Shaam</th><th>Plan→Done</th></tr>${logs.map((l) => `<tr><td><b>${esc(l.name)}</b></td><td>${l.morning_text ? `<span title="${esc(l.morning_text)}">✅ ${esc(l.morning_text.slice(0, 60))}</span>` : '❌'}</td><td>${l.evening_text ? `<span title="${esc(l.evening_text)}">✅ ${esc((l.summary || l.evening_text).slice(0, 60))}</span>` : '❌'}</td><td>${l.done_count || 0}/${l.planned_count || 0}</td></tr>`).join('')}</table></div>`;
}
function memberTable(ms) {
  if (!ms.length) return `<div class="empty">Koi member nahi</div>`;
  return `<table><tr><th>Member</th><th>Actions</th><th>Triggers</th><th>Apps</th><th>Plan→Done</th><th>Requests</th><th>Avg time</th><th>Difficulty</th><th>Reviews</th><th>Error rate</th><th>First pass</th><th>Updates</th><th>Growth</th></tr>
    ${ms.map((m) => `<tr><td><b>${esc(m.name)}</b><br><span class="muted">${m.role}</span></td><td>${m.actions}</td><td>${m.triggers}</td><td>${m.apps}</td><td>${fmt(m.plan_done_pct, '%')}</td><td>${m.requests_completed}/${m.requests_assigned}${m.requests_stuck ? ` <span class="pill stuck">${m.requests_stuck} stuck</span>` : ''}</td><td>${fmt(m.avg_request_hours, 'h')}</td><td>${fmt(m.avg_difficulty)}</td><td>${m.reviews}</td><td>${fmt(m.error_rate)}</td><td>${fmt(m.first_pass_pct, '%')}</td><td>${m.morning_updates + m.evening_updates}/${m.workdays * 2}</td><td>${Object.entries(m.growth).map(([k, v]) => `${v} ${GROWTH_LABEL[k] || k}`).join(', ') || '–'}</td></tr>`).join('')}</table>`;
}

// ---------- requests ----------
async function renderRequests() {
  const reqs = await api('/api/requests');
  const cols = ['new', 'rnd', 'started', 'stuck', 'completed'];
  $('#view').innerHTML = `
    <div class="row" style="margin-bottom:12px"><h2 style="margin:0">📜 Client Requests</h2><span class="spacer"></span><button class="btn" id="addReq">+ Request add karo</button></div>
    <p class="muted" style="margin-top:0">Slack mein aap request post karte ho (jaise <code>Client request: Zoho Bigin plugin</code>) aur thread mein member ko tag karte ho. Member thread mein likhta hai <code>r&d</code> / <code>started</code> / <code>stuck - API doc missing</code> / <code>completed</code>, aur Tracker status apne aap update kar deta hai.</p>
    <div class="kanban">${cols.map((c) => {
      const list = reqs.filter((r) => r.status === c);
      return `<div class="col"><h3><span>${STATUS[c]}</span><span class="pill ${c}">${list.length}</span></h3>${list.map(reqCard).join('') || '<div class="empty" style="padding:12px">—</div>'}</div>`;
    }).join('')}</div>`;
  document.querySelectorAll('.req').forEach((el) => (el.onclick = () => reqModal(reqs.find((r) => r.id == el.dataset.id))));
  $('#addReq').onclick = addReqModal;
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
    <p><b>Time:</b> ${r.hours !== null ? r.hours.toFixed(1) + ' ghante' : '–'} · <b>Stuck:</b> ${r.stuck_count} baar · <b>Difficulty:</b> <span class="stars">${stars(r.difficulty)}</span></p>
    ${r.ai_analysis ? `<p class="banner">🤖 ${esc(r.ai_analysis)}</p>` : ''}
    <h3>Timeline</h3><div class="timeline">${r.events.map((e) => `<div><span class="pill ${e.status}">${STATUS[e.status]}</span> <span class="muted">${new Date(e.at).toLocaleString('en-IN')}</span>${e.member ? ' · ' + esc(e.member) : ''}${e.reason ? `<br>🧱 ${esc(e.reason)}` : ''}</div>`).join('')}</div>
    <h3>Manual update</h3>
    <div class="grid g2"><div><label>Status</label><select id="rStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>Reason (stuck ho to)</label><input id="rReason" placeholder="API doc missing…" /></div></div>
    <label>Assigned</label>${memberChecks(r.assigned.map((a) => a.id), 'rm')}
    <div class="row" style="margin-top:12px"><button class="btn" id="rSave">Save</button><button class="btn red small" id="rDel">Delete</button><span class="spacer"></span><button class="btn ghost" data-close>Band karo</button></div>`);
  $('#rSave').onclick = async () => {
    const body = { member_ids: checked('rm') };
    if ($('#rStatus').value !== r.status || $('#rStatus').value === 'stuck') { body.status = $('#rStatus').value; body.reason = $('#rReason').value; }
    await api(`/api/requests/${r.id}`, { method: 'PATCH', body }); closeModal(); toast('Update ho gaya'); renderRequests();
  };
  $('#rDel').onclick = async () => { if (!confirm('Delete karna hai?')) return; await api(`/api/requests/${r.id}`, { method: 'DELETE' }); closeModal(); renderRequests(); };
}
function memberChecks(sel = [], name = 'm', filter = (m) => m.role !== 'lead') {
  const list = members.filter((m) => m.active && filter(m));
  if (!list.length) return '<p class="muted">Pehle Settings mein members add karo</p>';
  return `<div class="row">${list.map((m) => `<label class="check"><input type="checkbox" name="${name}" value="${m.id}" ${sel.includes(m.id) ? 'checked' : ''}/> ${esc(m.name)}</label>`).join('')}</div>`;
}
const checked = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => Number(i.value));
function addReqModal() {
  modal(`<h2>+ Client request</h2><label>Title</label><input id="nTitle" placeholder="Zoho Bigin plugin chahiye"/><label>Details</label><textarea id="nText"></textarea><label>Assign</label>${memberChecks([], 'nm')}
    <div class="row" style="margin-top:12px"><button class="btn" id="nSave">Add</button><span class="spacer"></span><button class="btn ghost" data-close>Cancel</button></div>`);
  $('#nSave').onclick = async () => { await api('/api/requests', { method: 'POST', body: { title: $('#nTitle').value, text: $('#nText').value, member_ids: checked('nm') } }); closeModal(); renderRequests(); };
}

// ---------- reviews ----------
async function renderReviews() {
  const [reviews, data] = await Promise.all([api('/api/reviews'), api(`/api/metrics?from=${addDays(state.today, -29)}&to=${state.today}`)]);
  const tech = data.team.members.filter((m) => m.role === 'tech');
  $('#view').innerHTML = `
    <h2>🔍 Reviews & error rate</h2>
    ${state.integrations.review_instructions ? '' : `<div class="banner" style="margin-bottom:12px">Inspector ke review instructions abhi set nahi hain. <b>Settings → Inspector instructions</b> mein apna checklist likho.</div>`}
    <div class="kpis">${tech.map((m) => kpi(`${fmt(m.error_rate)}`, `${m.name} — error rate (30 din) · first pass ${fmt(m.first_pass_pct, '%')}`)).join('')}</div>
    <div class="grid g2">
      <div class="card"><h3>Review history</h3><div class="table-wrap">${reviews.length ? `<table><tr><th>Date</th><th>Member</th><th>Kya</th><th>Attempt</th><th>Errors</th><th>Result</th></tr>${reviews.map((r) => `<tr data-rv="${r.id}" style="cursor:pointer"><td>${r.date}</td><td>${esc(r.member || '–')}</td><td>${esc((r.subject || '').slice(0, 50))}</td><td>${r.attempt}</td><td>${r.status === 'done' ? r.errors_count : '–'}</td><td>${r.status === 'pending' ? '<span class="pill new">pending</span>' : r.passed ? '<span class="pill completed">pass</span>' : '<span class="pill stuck">fix</span>'}</td></tr>`).join('')}</table>` : '<div class="empty">Abhi koi review nahi</div>'}</div></div>
      <div class="card"><h3>Manual review</h3><p class="muted">Slack ke bahar ka kaam: plugin ka JSON, code ya details yahan paste karo.</p>
        <label>Member</label><select id="mvMember"><option value="">—</option>${members.filter((m) => m.role === 'tech').map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
        <label>Kya review karna hai</label><input id="mvSubject" placeholder="Zoho Bigin - Create Deal action"/>
        <label>Content</label><textarea id="mvText" style="min-height:160px"></textarea>
        <button class="btn" id="mvGo" style="margin-top:10px">🔍 Review karo</button><div id="mvOut"></div></div>
    </div>`;
  document.querySelectorAll('[data-rv]').forEach((el) => (el.onclick = () => {
    const r = reviews.find((x) => x.id == el.dataset.rv);
    modal(`<h2>${esc(r.subject || 'Review')}</h2><p class="muted">${esc(r.member || '')} · attempt ${r.attempt} · ${r.date}</p>${r.summary ? `<p>${esc(r.summary)}</p>` : ''}${(r.findings || []).map((f, i) => `<p>${i + 1}. <b>${esc(f.title)}</b> <span class="pill ${f.severity === 'high' ? 'stuck' : f.severity === 'medium' ? 'started' : 'new'}">${f.severity}</span><br>${esc(f.detail)}</p>`).join('')}${r.submission ? `<h3>Submission</h3><pre class="report">${esc(r.submission)}</pre>` : ''}<button class="btn ghost" data-close>Band karo</button>`);
  }));
  $('#mvGo').onclick = async () => {
    $('#mvGo').disabled = true; $('#mvGo').textContent = 'Inspector dekh raha hai…';
    try {
      const r = await api('/api/reviews/manual', { method: 'POST', body: { member_id: $('#mvMember').value || null, subject: $('#mvSubject').value, submission: $('#mvText').value } });
      const f = JSON.parse(r.findings || '[]');
      $('#mvOut').innerHTML = `<div class="banner" style="margin-top:12px">${r.passed ? '✅ Pass' : `❌ ${f.length} issues`} — ${esc(r.summary)}<br>${f.map((x, i) => `${i + 1}. <b>${esc(x.title)}</b>: ${esc(x.detail)}`).join('<br>')}</div>`;
    } catch (e) { toast(e.message); }
    $('#mvGo').disabled = false; $('#mvGo').textContent = '🔍 Review karo';
  };
}

// ---------- growth ----------
async function renderGrowth() {
  const items = await api('/api/growth');
  const counts = {};
  const weekStart = weekStartOf(state.today);
  items.filter((i) => i.date >= weekStart).forEach((i) => (counts[i.kind] = (counts[i.kind] || 0) + 1));
  $('#view').innerHTML = `<h2>🌱 Growth</h2>
    <p class="muted" style="margin-top:0">Growth member channel mein jo bhi daalta hai (support request, app listing, blog, newsletter, credentials) woh yahan count hota hai. Kisi stuck app ke credentials ya docs aate hi Sprout us request ke thread mein developer ko tag kar deta hai.</p>
    <div class="kpis">${Object.keys(GROWTH_LABEL).filter((k) => k !== 'other').map((k) => kpi(counts[k] || 0, GROWTH_LABEL[k] + ' (is hafte)')).join('')}${kpi(items.filter((i) => i.unblocked_request_id && i.date >= weekStart).length, 'Requests unblock kiye')}</div>
    <div class="card"><div class="table-wrap">${items.length ? `<table><tr><th>Date</th><th>Member</th><th>Type</th><th>Message</th><th>Unblocked</th></tr>${items.map((i) => `<tr><td>${i.date}</td><td>${esc(i.name)}</td><td><span class="pill">${GROWTH_LABEL[i.kind] || i.kind}</span></td><td>${esc((i.text || '').slice(0, 140))}</td><td>${i.unblocked_request_id ? '🔓 ' + esc(i.app_name || '') : ''}</td></tr>`).join('')}</table>` : '<div class="empty">Abhi kuch nahi</div>'}</div></div>`;
}

// ---------- reports ----------
async function renderReports() {
  const reports = await api('/api/reports');
  $('#view').innerHTML = `<div class="row" style="margin-bottom:12px"><h2 style="margin:0">📊 Reports</h2><span class="spacer"></span>
      <button class="btn ghost" id="pvDaily">👀 Aaj ka 7 PM preview</button><button class="btn" id="genWeekly">📜 Weekly report abhi banao</button></div>
    <p class="muted" style="margin-top:0">7 PM ka daily alert aur Monday ki weekly report (team + aapki personal) apne aap banti hai aur aapko Slack DM pe aati hai.</p>
    <div class="grid g2">${reports.length ? reports.map((r) => `<div class="card"><div class="row"><span class="pill ${r.kind === 'weekly' ? 'started' : r.kind === 'personal' ? 'rnd' : 'new'}">${r.kind}</span><span class="muted">${r.period_start}${r.period_end !== r.period_start ? ' → ' + r.period_end : ''}</span><span class="spacer"></span><button class="btn ghost small" data-copy="${r.id}">Copy</button></div><pre class="report">${esc(r.content)}</pre></div>`).join('') : '<div class="card empty">Abhi koi report nahi bani</div>'}</div>`;
  document.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(reports.find((r) => r.id == b.dataset.copy).content); toast('Copy ho gaya'); }));
  $('#genWeekly').onclick = async () => { $('#genWeekly').disabled = true; const r = await api('/api/agents/scribe/run', { method: 'POST' }); toast(r.message || r.error); renderReports(); };
  $('#pvDaily').onclick = async () => { const r = await api('/api/reports/preview', { method: 'POST' }); modal(`<h2>7 PM preview</h2><pre class="report">${esc(r.text)}</pre><button class="btn ghost" data-close>Band karo</button>`); };
}

// ---------- commander ----------
async function renderCommander() {
  const hist = await api('/api/broadcasts');
  $('#view').innerHTML = `<h2>⚔️ Commander</h2>
    <div class="grid g2">
      <div class="card">
        <label>Message / instruction</label><textarea id="cMsg" style="min-height:130px" placeholder="Aaj sab log Shopify plugin ke triggers pe focus karo…"></textarea>
        <label>Kisko tag karna hai</label>${memberChecks([], 'cm')}
        <label class="check"><input type="checkbox" id="cImp"/> 🚨 Important — tagged logon ko MSG91 SMS bhi jayega</label>
        <label class="check"><input type="checkbox" id="cPol"/> ✨ AI se message saaf karwao</label>
        <button class="btn gold" id="cSend" style="margin-top:6px">📣 Channel mein bhejo</button>
        ${state.integrations.slack ? '' : '<p class="muted">Slack configure nahi hai — message sirf save hoga.</p>'}
        ${state.integrations.msg91 ? '' : '<p class="muted">MSG91 configure nahi hai — SMS nahi jayega.</p>'}
      </div>
      <div class="card"><h3>History</h3>${hist.length ? hist.map((b) => `<div class="feed-item"><span class="em">${b.important ? '🚨' : '📣'}</span><div>${esc(b.message)}<time>${ago(b.created_at)}${b.sms_status ? ' · SMS: ' + esc(b.sms_status) : ''}</time></div></div>`).join('') : '<div class="empty">Abhi kuch nahi bheja</div>'}</div>
    </div>`;
  $('#cSend').onclick = async () => {
    const b = $('#cSend'); b.disabled = true;
    try {
      await api('/api/broadcast', { method: 'POST', body: { message: $('#cMsg').value, member_ids: checked('cm'), important: $('#cImp').checked, polish: $('#cPol').checked } });
      toast('Bhej diya ✅'); renderCommander();
    } catch (e) { toast(e.message); b.disabled = false; }
  };
}

// ---------- settings ----------
async function renderSettings() {
  const s = await api('/api/settings');
  members = await api('/api/members');
  const i = state.integrations;
  const v = (k) => esc(s[k] ?? '');
  const locked = (k) => (s.env_locked.includes(k) ? 'disabled title="Env var se set hai"' : '');
  $('#view').innerHTML = `<h2>⚙️ Settings</h2>
  <div class="grid g2">
    <div class="card"><h3>🔌 Connections</h3>
      <ul class="setup-list">
        <li>${i.slack ? '✅' : '⬜'} Slack — env <code>SLACK_BOT_TOKEN</code> + channel ID</li>
        <li>${i.lead ? '✅' : '⬜'} Lead ka Slack user ID (DM reports ke liye)</li>
        <li>${i.ai ? '✅' : '⬜'} AI — env <code>ANTHROPIC_API_KEY</code></li>
        <li>${i.msg91 ? '✅' : '⬜'} MSG91 — env <code>MSG91_AUTH_KEY</code> + <code>MSG91_TEMPLATE_ID</code></li>
        <li>${i.review_instructions ? '✅' : '⬜'} Inspector review instructions</li>
      </ul>
      <p class="muted">Secret keys sirf Embarko ke env vars mein daalo, yahan nahi.</p>
      <label>Slack channel ID</label><input id="s_ch" value="${v('cfg.SLACK_CHANNEL_ID')}" placeholder="C0123ABCD" ${locked('SLACK_CHANNEL_ID')}/>
      <label>Lead (aapka) Slack user ID</label><input id="s_lead" value="${v('cfg.LEAD_SLACK_USER_ID')}" placeholder="U0123ABCD" ${locked('LEAD_SLACK_USER_ID')}/>
      <label>Slack workspace URL (thread links ke liye)</label><input id="s_ws" value="${v('cfg.SLACK_WORKSPACE_URL')}" placeholder="https://yourteam.slack.com" ${locked('SLACK_WORKSPACE_URL')}/>
      <label class="check"><input type="checkbox" id="s_rem" ${s['herald.channel_reminder'] ? 'checked' : ''}/> Missing update walon ko channel mein bhi reminder (tag ke saath)</label>
      <label class="check"><input type="checkbox" id="s_sun" ${s['herald.sunday'] ? 'checked' : ''}/> Sunday ko bhi 7 PM alert</label>
      <label class="check"><input type="checkbox" id="s_gro" ${s['growth.notify_thread'] !== false ? 'checked' : ''}/> Credentials aane pe stuck request ke thread mein developer ko tag karo</label>
      <button class="btn" id="saveConn" style="margin-top:8px">Save</button>
    </div>
    <div class="card"><h3>👥 Team members</h3>
      <div class="table-wrap"><table><tr><th>Naam</th><th>Role</th><th>Slack ID</th><th>Phone</th><th></th></tr>
      ${members.map((m) => `<tr><td>${esc(m.name)}${m.is_demo ? ' <span class="pill">demo</span>' : ''}</td><td>${m.role}</td><td><code>${esc(m.slack_user_id || '–')}</code></td><td>${esc(m.phone || '–')}</td><td><button class="btn ghost small" data-edit="${m.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Koi member nahi</td></tr>'}
      </table></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="addMem">+ Member</button><button class="btn ghost" id="impMem" ${i.slack ? '' : 'disabled'}>Slack channel se import</button></div>
      <p class="muted">Role: <b>tech</b> = plugin banane wale, <b>growth</b> = growth member, <b>lead</b> = aap. Phone 91XXXXXXXXXX format mein (MSG91 ke liye).</p>
      <h3 style="margin-top:16px">➕ Publish count (manual)</h3>
      <p class="muted">viaSocket flow se automatic bhi aa sakta hai: <code>POST /webhooks/publish</code> (README dekho).</p>
      <div class="grid g3"><select id="pMem">${members.filter((m) => m.role === 'tech').map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
        <select id="pKind"><option value="action">Action</option><option value="trigger">Trigger</option><option value="app">App</option></select>
        <input id="pCount" type="number" value="1" min="1"/></div>
      <input id="pPlugin" placeholder="Plugin naam (optional)" style="margin-top:8px"/>
      <button class="btn ghost" id="addPub" style="margin-top:8px">Add</button>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h3>🔍 Inspector review instructions</h3>
    <p class="muted">Inspector exactly inhi rules pe review karega: naming, help text, auth, error handling, field types, jo bhi aap chahte ho. Har point alag line pe likho.</p>
    <textarea id="s_ins" style="min-height:220px" placeholder="1. Har action ka naam verb se shuru ho (Create Deal, Update Contact)\n2. Har field ka help text ho…">${v('inspector.instructions')}</textarea>
    <button class="btn" id="saveIns" style="margin-top:8px">Save instructions</button>
  </div>
  <div class="card" style="margin-top:16px"><h3>🔑 Keywords (Slack messages pehchaanne ke liye)</h3>
    <p class="muted">Comma se alag karo. Khaali chhodoge to default use hoga. AI key ho to jo message keyword se samajh nahi aata, use AI classify karta hai.</p>
    <div class="grid g2">
      ${[['REQUEST_KEYWORDS', 'Client request (aapke post mein)'], ['MORNING_KEYWORDS', 'Subah ka thread'], ['EVENING_KEYWORDS', 'Shaam ka thread'], ['REVIEW_KEYWORDS', 'Review maangna']].map(([k, l]) => `<div><label>${l}</label><input id="kw_${k}" value="${v('cfg.' + k)}" placeholder="${esc(s.defaults[k])}"/></div>`).join('')}
    </div>
    <p class="muted">Thread status ke words: <code>r&d</code>, <code>started</code>, <code>stuck - reason</code>, <code>completed</code> (ya <code>status: stuck - API doc missing</code>).</p>
    <button class="btn" id="saveKw">Save keywords</button>
  </div>
  <div class="card" style="margin-top:16px"><h3>🧪 Demo data</h3><div class="row"><button class="btn ghost" id="demoLoad">Load demo</button><button class="btn red" id="demoClear">Clear demo</button></div></div>`;

  $('#saveConn').onclick = async () => {
    const body = { 'herald.channel_reminder': $('#s_rem').checked, 'herald.sunday': $('#s_sun').checked, 'growth.notify_thread': $('#s_gro').checked };
    if (!$('#s_ch').disabled) body['cfg.SLACK_CHANNEL_ID'] = $('#s_ch').value.trim();
    if (!$('#s_lead').disabled) body['cfg.LEAD_SLACK_USER_ID'] = $('#s_lead').value.trim();
    if (!$('#s_ws').disabled) body['cfg.SLACK_WORKSPACE_URL'] = $('#s_ws').value.trim();
    await api('/api/settings', { method: 'POST', body }); toast('Save ho gaya'); refresh();
  };
  $('#saveIns').onclick = async () => { await api('/api/settings', { method: 'POST', body: { 'inspector.instructions': $('#s_ins').value } }); toast('Instructions save ho gaye'); refresh(); };
  $('#saveKw').onclick = async () => {
    const body = {}; ['REQUEST_KEYWORDS', 'MORNING_KEYWORDS', 'EVENING_KEYWORDS', 'REVIEW_KEYWORDS'].forEach((k) => (body['cfg.' + k] = $('#kw_' + k).value.trim()));
    await api('/api/settings', { method: 'POST', body }); toast('Keywords save ho gaye');
  };
  $('#addMem').onclick = () => memberModal();
  $('#impMem').onclick = async () => { const r = await api('/api/members/import-slack', { method: 'POST' }); toast(`${r.added} members import hue — roles check kar lo`); renderSettings(); };
  document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => memberModal(members.find((m) => m.id == b.dataset.edit))));
  $('#addPub').onclick = async () => { await api('/api/publishes', { method: 'POST', body: { member_id: Number($('#pMem').value), kind: $('#pKind').value, count: $('#pCount').value, plugin: $('#pPlugin').value } }); toast('Add ho gaya'); refresh(); };
  $('#demoLoad').onclick = async () => { const r = await api('/api/demo/load', { method: 'POST' }); toast(r.message); refresh(); };
  $('#demoClear').onclick = async () => { const r = await api('/api/demo/clear', { method: 'POST' }); toast(r.message); refresh(); };
}
function memberModal(m = {}) {
  modal(`<h2>${m.id ? 'Edit' : 'Add'} member</h2>
    <label>Naam</label><input id="mName" value="${esc(m.name || '')}"/>
    <label>Role</label><select id="mRole">${['tech', 'growth', 'lead'].map((r) => `<option ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    <label>Slack user ID</label><input id="mSlack" value="${esc(m.slack_user_id || '')}" placeholder="U0123ABCD (profile → Copy member ID)"/>
    <label>Phone (MSG91)</label><input id="mPhone" value="${esc(m.phone || '')}" placeholder="919876543210"/>
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
  if (m.id) $('#mDel').onclick = async () => { if (!confirm('Member delete karna hai? Unka data bhi hat jayega.')) return; await api(`/api/members/${m.id}`, { method: 'DELETE' }); closeModal(); renderSettings(); refresh(); };
}

// ---------- main loop ----------
async function refresh() {
  try {
    state = await api('/api/state');
    renderHeader();
    if (tab === 'flow' && typeof updateFlow === 'function') updateFlow();
    if (tab === 'village') {
      const feed = $('#feed');
      if (feed && $('.scene')) {
        // halka update: buildings + feed, bina poora re-render kiye
        state.agents.forEach((a) => {
          const el = document.querySelector(`.bld[data-agent="${a.key}"]`);
          if (!el) return;
          el.className = `bld ${a.state}`;
          el.querySelector('.bubble').textContent = a.state === 'working' ? (a.message || 'kaam chal raha hai…') : a.state === 'error' ? '⚠️ ' + (a.message || 'error') : (a.message || 'Ready');
        });
        const topId = state.activity[0] ? state.activity[0].id : 0;
        if (topId !== lastActivityId) { feed.innerHTML = feedHtml(state.activity); lastActivityId = topId; }
      } else render();
    }
  } catch (e) { console.warn(e); }
}
async function render() {
  markTab();
  if (!state) return;
  try {
    if (role === 'admin' && (!members.length || tab === 'settings')) members = await api('/api/members');
    ({ flow: renderFlow, integrations: renderIntegrations, village: renderVillage, team: renderTeam, requests: renderRequests, reviews: renderReviews, growth: renderGrowth, reports: renderReports, commander: renderCommander, settings: renderSettings }[tab] || renderVillage)();
    if (tab === 'village') lastActivityId = state.activity[0] ? state.activity[0].id : 0;
  } catch (e) { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
async function boot() {
  const me = await api('/api/me');
  if (!me.authed) return showLogin();
  role = me.role || 'admin';
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
