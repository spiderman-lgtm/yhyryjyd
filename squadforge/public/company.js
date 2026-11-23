/* Company: "Everyone" (who is doing what, open to the whole company), one person's page,
   and Company setup (departments, which team sits where, titles and who reports to whom). */
let coFilter = { dept: 'all', q: '' };
let coPerson = null; // key of the person whose page is open
let coData = null;
const CO_COLORS = ['#e8655a', '#7a6ad8', '#3b7ca8', '#2f8a6b', '#c98a2b', '#8a5a9e', '#d0577f', '#4a8f9f', '#7d8b3a', '#b5653b'];
const coColor = (s) => CO_COLORS[[...String(s)].reduce((n, c) => n + c.charCodeAt(0), 0) % CO_COLORS.length];
const coAvatar = (p, big) => `<span class="co-av${big ? ' big' : ''}" style="background:${coColor(p.name || '?')}">${esc(initials(p.name || '?'))}</span>`;
const CO_PILL = { stuck: 'st', started: 'go', rnd: 'rd', new: 'nw', leave: 'lv' };
const coWhen = (iso) => (iso ? (String(iso).length <= 10 ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : ago(iso)) : '');

function coNow(n, note) {
  const pill = n.label ? `<span class="co-pill ${CO_PILL[n.kind] || ''}">${esc(n.label)}${n.kind === 'stuck' && n.reason ? ' · ' + esc(n.reason.slice(0, 60)) : ''}</span>` : n.kind === 'leave' ? '<span class="co-pill lv">🌴 Leave</span>' : '';
  return `<div class="co-now ${n.kind === 'stuck' ? 'stuck' : ''}"><i>Right now</i><div>${n.kind === 'none' ? `<span class="muted">${esc(n.text)}</span>` : esc(n.text)} ${pill}</div>
    ${note ? `<div class="co-note">💬 ${esc(note.text)} <span class="muted small">· ${ago(note.since)}</span></div>` : ''}</div>`;
}
function coCard(p) {
  const meta = [p.department ? `<b class="co-dept">${esc((p.department.emoji ? p.department.emoji + ' ' : '') + p.department.name)}</b>` : '', esc(p.title || ''), p.reports_to_name ? `reports to ${esc(p.reports_to_name)}` : ''].filter(Boolean).join(' · ');
  return `<button class="card co-card${p.leader ? ' leader' : ''}" data-person="${esc(p.key)}">
    <div class="co-who">${coAvatar(p)}<div><b>${esc(p.name)}</b><span>${meta}</span></div></div>
    ${coNow(p.now, p.note)}
    ${p.stats.length ? `<div class="co-stats">${p.stats.map((s) => `<span>${esc(s.label)}<b>${esc(s.value)}</b></span>`).join('')}</div>` : ''}
    ${p.feed.length ? `<div class="co-feed">${p.feed.map((f) => `<div>${f.icon} ${esc(f.text.slice(0, 90))}${f.when ? ` <span class="muted">· ${esc(coWhen(f.when))}</span>` : ''}</div>`).join('')}</div>` : ''}
  </button>`;
}

let coView = 'structure'; // 'structure' (CEO → departments → projects) or 'people' (everyone's cards)
async function renderCompany() {
  if (coPerson) return renderCompanyPerson(coPerson);
  let d, o;
  try { [d, o] = await Promise.all([api('/api/company/everyone'), api('/api/company/org')]); } catch (e) { $('#view').innerHTML = `<div class="card empty">🏢 ${esc(e.message)}</div>`; return; }
  if (tab !== 'company' || coPerson) return;
  coData = d;
  const meCard = d.me ? d.people.find((p) => p.key === d.me) : null;
  $('#view').innerHTML = `<div class="co-top"><div><h2 style="margin:0">${esc(o.company)} · who is doing what</h2>
      <div class="muted small">From the CEO to every team · ${d.people.length} people · live from Slack and everyone's own “right now” line</div></div></div>
    ${meCard ? `<form class="card co-mine" id="coStatus"><span class="co-who">${coAvatar(meCard)}</span><input id="coStatusText" maxlength="200" placeholder="What are you doing right now? (everyone sees this)" value=""><button class="btn">Post</button></form>` : ''}
    ${coMetrics(d.metrics)}
    <div class="co-viewbar"><div class="seg" role="tablist"><button data-view="structure" class="${coView === 'structure' ? 'on' : ''}">🏢 Structure</button><button data-view="people" class="${coView === 'people' ? 'on' : ''}">👥 People ${d.people.length}</button></div>
      ${coView === 'structure' && o.admin ? `<button class="btn ${orgEdit ? '' : 'ghost'} small" id="orgEdit">${orgEdit ? '✓ Done' : '✏️ Edit structure'}</button>` : ''}</div>
    <div id="coBody"></div>`;
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { coView = b.dataset.view; renderCompany(); }));
  const ed = $('#orgEdit'); if (ed) ed.onclick = () => { orgEdit = !orgEdit; renderCompany(); };
  const f = $('#coStatus');
  if (f) f.onsubmit = async (e) => { e.preventDefault(); const t = $('#coStatusText').value.trim(); if (!t) return; try { await api('/api/company/status', { method: 'POST', body: { text: t } }); toast('Posted — everyone can see it'); renderCompany(); } catch (err) { toast(err.message); } };
  if (coView === 'structure') return orgInto($('#coBody'), o);
  if (!d.people.length) { $('#coBody').innerHTML = `<div class="card empty">${d.admin ? 'No team has members yet. Add team members in each team’s Settings, or import them from Slack.' : 'Nobody is in the company view yet.'}</div>`; return; }
  $('#coBody').innerHTML = `<div class="co-filters"><input id="coSearch" type="search" placeholder="🔍  Search a person, title or department…" value="${esc(coFilter.q)}">
      ${(d.groups || []).some((x) => x.key[0] === 'd') ? `<div class="seg co-chips"><button data-dept="all" class="${coFilter.dept === 'all' ? 'on' : ''}">All ${d.people.length}</button>${(d.groups || []).filter((x) => x.key[0] === 'd').map((x) => `<button data-dept="${esc(x.key)}" class="${coFilter.dept === x.key ? 'on' : ''}">${esc(x.emoji + ' ' + x.name)} ${x.people}</button>`).join('')}</div>` : ''}</div>
    <div id="coList"></div>`;
  coList();
  $('#coSearch').oninput = (e) => { coFilter.q = e.target.value; coList(); };
  document.querySelectorAll('[data-dept]').forEach((b) => (b.onclick = () => { coFilter.dept = b.dataset.dept; document.querySelectorAll('[data-dept]').forEach((x) => x.classList.toggle('on', x === b)); coList(); }));
}
function coMetrics(m) {
  if (!m) return '';
  const t = m.total;
  const tile = (icon, label, value, sub, cls = '') => `<div class="co-kpi ${cls}"><span>${icon} ${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<div class="co-kpis">
      ${tile('👥', 'People', t.people, 'in the company')}
      ${tile('🛠️', 'Building now', t.building, 'started or in R&D')}
      ${tile('🧱', 'Stuck', t.stuck, t.stuck ? 'needs help' : 'nobody blocked', t.stuck ? 'bad' : 'good')}
      ${tile('🌴', 'On leave', t.leave, 'today')}
      ${tile('💤', 'No update', t.no_update, 'no plan or work today', t.no_update ? 'warn' : '')}
      ${tile('📦', 'Built this week', t.built, 'actions + triggers')}
      ${tile('✅', 'Requests done', t.shipped, 'this week')}
      ${tile('🔍', 'Reviews passed', t.pass_rate === null ? '–' : t.pass_rate + '%', t.reviews ? `${t.passed} of ${t.reviews}` : 'no reviews yet')}
    </div>`;
}
function coList() {
  const d = coData; if (!d) return;
  const q = coFilter.q.trim().toLowerCase();
  const list = d.people.filter((p) => (coFilter.dept === 'all' || (p.group && p.group.key === coFilter.dept))
    && (!q || [p.name, p.title, p.department && p.department.name, p.now.text].join(' ').toLowerCase().includes(q)));
  const leaders = list.filter((p) => p.leader), rest = list.filter((p) => !p.leader);
  $('#coList').innerHTML = list.length ? `${leaders.length ? `<div class="co-grid lead">${leaders.map(coCard).join('')}</div>` : ''}<div class="co-grid">${rest.map(coCard).join('')}</div>` : '<div class="card empty">Nobody matches that search.</div>';
}

async function renderCompanyPerson(key) {
  let d;
  try { d = await api('/api/company/person?key=' + encodeURIComponent(key)); } catch (e) { coPerson = null; toast(e.message); return renderCompany(); }
  if (tab !== 'company' || coPerson !== key) return;
  const p = d.person;
  const meta = [p.department ? (p.department.emoji ? p.department.emoji + ' ' : '') + p.department.name : '', p.title].filter(Boolean).map(esc).join(' · ');
  const peer = d.peers;
  const pmax = peer ? Math.max(peer.mine || 0, ...peer.names.map((x) => x.value || 0), 1) : 1;
  $('#view').innerHTML = `<button class="btn ghost small" id="coBack">← Company</button>
    <div class="card co-hero"><div class="co-who">${coAvatar(p, true)}<div><h2>${esc(p.name)}</h2><span>${meta}</span></div></div>
      ${coNow(p.now, p.note)}
      ${p.stats.length ? `<div class="co-stats big">${p.stats.map((s) => `<span>${esc(s.label)}<b>${esc(s.value)}</b></span>`).join('')}</div>` : ''}</div>
    <div class="co-cols">
      <div class="card"><h3>Works with</h3>
        <div class="co-rel"><span class="muted small">Reports to</span>${d.reports_to ? `<a href="#" data-person="${esc(d.reports_to.key)}">${esc(d.reports_to.name)}</a>${d.reports_to.title ? ` <span class="muted small">${esc(d.reports_to.title)}</span>` : ''}` : '<span class="muted">—</span>'}</div>
        <div class="co-rel"><span class="muted small">Their team</span>${d.team.length ? d.team.map((x) => `<a href="#" data-person="${esc(x.key)}" class="co-chip">${esc(x.name)}</a>`).join('') : '<span class="muted">Nobody reports to them</span>'}</div>
        ${peer ? `<h3 style="margin-top:16px">Peer group · ${esc(peer.title || 'same role')} (${peer.count + 1} people)</h3>
          <div class="muted small">This week, ${esc(peer.unit)}. Peer average: <b>${peer.average}</b> · ${esc(p.name.split(' ')[0])}: <b>${peer.mine}</b></div>
          <div class="co-peers">${[{ key: p.key, name: p.name, value: peer.mine, me: true }, ...peer.names].sort((a, b) => b.value - a.value).map((x) => `<div class="${x.me ? 'me' : ''}"><span>${esc(x.name)}</span><i><u style="width:${Math.round(((x.value || 0) / pmax) * 100)}%"></u></i><b>${x.value || 0}</b></div>`).join('')}</div>` : ''}
      </div>
      <div class="card"><h3>Recent work</h3>${p.feed.length ? `<div class="co-feed big">${p.feed.map((f) => `<div>${f.icon} ${esc(f.text)}${f.when ? ` <span class="muted">· ${esc(coWhen(f.when))}</span>` : ''}</div>`).join('')}</div>` : '<div class="muted">Nothing recorded this week yet.</div>'}</div>
    </div>
    ${d.days.length ? `<div class="card"><h3>This week, day by day</h3><table class="co-days"><thead><tr><th>Day</th><th>${p.role === 'growth' ? 'Growth items' : `Built (target ${d.target})`}</th><th>Plan</th><th>Update</th></tr></thead><tbody>
      ${d.days.map((x) => `<tr><td>${esc(coWhen(x.date))}</td><td>${x.leave ? '🌴 leave' : p.role === 'growth' ? x.growth : `${x.built}${x.met ? ' ✅' : ''}`}</td><td>${esc((x.plan || '').replace(/\s+/g, ' ').slice(0, 120)) || '<span class="muted">—</span>'}</td><td>${esc((x.update || '').replace(/\s+/g, ' ').slice(0, 120)) || '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  $('#coBack').onclick = () => { coPerson = null; renderCompany(); };
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-person]'); if (!el || tab !== 'company') return;
  e.preventDefault(); coPerson = el.dataset.person; window.scrollTo(0, 0); renderCompanyPerson(coPerson);
});

// The sidebar's Everyone button always goes back to the list
document.addEventListener('click', (e) => { if (e.target.closest('#tabs button[data-tab="company"]')) coPerson = null; }, true);

// ---------- Company setup (company admins) ----------
async function renderCompanySetup() {
  let d;
  try { d = await api('/api/company/setup'); } catch (e) { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (tab !== 'orgsetup') return;
  const deptOpts = (sel) => `<option value="">— none —</option>${d.departments.map((x) => `<option value="${x.id}" ${String(sel) === String(x.id) ? 'selected' : ''}>${esc((x.emoji ? x.emoji + ' ' : '') + x.name)}</option>`).join('')}`;
  const repOpts = (self, sel) => `<option value="">— nobody —</option>${d.people.filter((x) => x.key !== self).map((x) => `<option value="${esc(x.key)}" ${sel === x.key ? 'selected' : ''}>${esc(x.name)}${x.title ? ' · ' + esc(x.title) : ''}</option>`).join('')}`;
  $('#view').innerHTML = `<div class="co-setup"><h2>Admin</h2><p class="muted">As a company admin you see every team on the <a href="#company" data-goto-company>Everyone</a> page. Departments group teams; teams you put in a department, and people added below, can also open Everyone and see the whole company.</p>
    <div class="card"><h3>1 · Departments</h3>
      <div class="co-setup-list">${d.departments.map((x) => `<form class="co-row" data-dept-form="${x.id}"><input name="emoji" value="${esc(x.emoji || '')}" placeholder="🏢" class="co-emoji"><input name="name" value="${esc(x.name)}" required><button class="btn small">Save</button><button type="button" class="btn ghost small" data-dept-del="${x.id}">Delete</button></form>`).join('') || '<div class="muted small">No departments yet.</div>'}</div>
      <form class="co-row" id="coDeptNew"><input name="emoji" placeholder="🏢" class="co-emoji"><input name="name" placeholder="New department, e.g. Leadership, Plugins, Support" required><button class="btn small">Add department</button></form></div>
    <div class="card"><h3>2 · Teams → department</h3><p class="muted small">Each team workspace brings its members, with their Slack work, into the company view.</p>
      <div class="co-setup-list">${d.teams.map((t) => `<div class="co-row"><b class="co-tname">${esc(t.name)}</b><select data-team="${t.id}">${deptOpts(t.department_id)}</select></div>`).join('')}</div></div>
    <div class="card"><h3>3 · People, titles and who reports to whom</h3><p class="muted small">Team members come from their team. Add people who are not in a team (CEO, other departments) by hand. A person whose email is set can post their own “right now” line.</p>
      <div class="co-table-wrap"><table class="co-people"><thead><tr><th>Name</th><th>Department / team</th><th>Title</th><th>Email (for their own updates)</th><th>Reports to</th><th></th></tr></thead><tbody>
      ${d.people.map((x) => `<tr data-pkey="${esc(x.key)}">
        <td>${x.kind === 'manual' ? `<input name="name" value="${esc(x.name)}">` : `<b>${esc(x.name)}</b>`}</td>
        <td>${x.kind === 'manual' ? `<select name="department_id">${deptOpts(x.department && x.department.id)}</select>` : `${esc(x.department ? x.department.name : '')} <span class="muted small">· ${esc(x.team)}</span>`}</td>
        <td><input name="title" value="${esc(x.title || '')}" placeholder="Title"></td>
        <td><input name="email" type="email" value="${esc(x.email || '')}" placeholder="name@company.com"></td>
        <td><select name="reports_to">${repOpts(x.key, x.reports_to)}</select></td>
        <td class="co-act"><button class="btn small" data-psave>Save</button>${x.kind === 'manual' ? '<button class="btn ghost small" data-pdel>Remove</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nobody yet — put a team in a department, or add a person below.</td></tr>'}
      </tbody></table></div>
      <h3 style="margin-top:18px">Add a person</h3>
      <form class="co-row wrap" id="coPersonNew"><input name="name" placeholder="Name" required><input name="title" placeholder="Title, e.g. CEO"><input name="email" type="email" placeholder="Email (optional)"><select name="department_id">${deptOpts('')}</select><select name="reports_to">${repOpts('', '')}</select><button class="btn small">Add person</button></form></div></div>`;
  const reload = () => renderCompanySetup();
  const call = async (path, method, body, msg) => { try { await api(path, { method, body }); toast(msg); reload(); } catch (e) { toast(e.message); } };
  const g = document.querySelector('[data-goto-company]'); if (g) g.onclick = (e) => { e.preventDefault(); tab = 'company'; location.hash = tab; render(); };
  document.querySelectorAll('[data-dept-form]').forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); call('/api/company/departments', 'POST', { id: Number(f.dataset.deptForm), name: f.elements.name.value, emoji: f.elements.emoji.value }, 'Department saved'); }));
  document.querySelectorAll('[data-dept-del]').forEach((b) => (b.onclick = () => { if (confirm('Delete this department? Its teams and people stay, without a department.')) call('/api/company/departments', 'DELETE', { id: Number(b.dataset.deptDel) }, 'Department deleted'); }));
  $('#coDeptNew').onsubmit = (e) => { e.preventDefault(); const f = e.target; call('/api/company/departments', 'POST', { name: f.elements.name.value, emoji: f.elements.emoji.value }, 'Department added'); };
  document.querySelectorAll('[data-team]').forEach((s) => (s.onchange = () => call('/api/company/teams', 'POST', { ws_id: Number(s.dataset.team), department_id: s.value ? Number(s.value) : null }, 'Team moved')));
  document.querySelectorAll('[data-psave]').forEach((b) => (b.onclick = () => {
    const tr = b.closest('tr'), v = (n) => { const el = tr.querySelector(`[name="${n}"]`); return el ? el.value : undefined; };
    call('/api/company/people', 'POST', { key: tr.dataset.pkey, name: v('name'), title: v('title'), email: v('email'), department_id: v('department_id') || null, reports_to: v('reports_to') || null }, 'Saved');
  }));
  document.querySelectorAll('[data-pdel]').forEach((b) => (b.onclick = () => { if (confirm('Remove this person from the company view?')) call('/api/company/people', 'DELETE', { key: b.closest('tr').dataset.pkey }, 'Removed'); }));
  $('#coPersonNew').onsubmit = (e) => { e.preventDefault(); const f = e.target; call('/api/company/people', 'POST', { name: f.elements.name.value, title: f.elements.title.value, email: f.elements.email.value, department_id: f.elements.department_id.value || null, reports_to: f.elements.reports_to.value || null }, 'Person added'); };
}

// ---------- Org chart: CEO → departments → projects → people ----------
let orgEdit = false;
function coGoPerson(key) { coPerson = key; tab = 'company'; location.hash = 'company'; window.scrollTo(0, 0); render(); }
const orgStats = (s) => `<div class="org-stats"><span title="People">👥 ${s.people}</span><span title="Building now">🛠️ ${s.building}</span><span title="Stuck" class="${s.stuck ? 'bad' : ''}">🧱 ${s.stuck}</span><span title="Actions + triggers built this week">📦 ${s.built}</span></div>`;
const orgFace = (p) => `<button class="org-face" data-oper="${esc(p.key)}" title="${esc(p.name)}${p.title ? ' · ' + esc(p.title) : ''} — ${esc(p.now.text)}">${coAvatar(p)}</button>`;
function renderOrg() { coView = 'structure'; tab = 'company'; location.hash = 'company'; return renderCompany(); }
function orgInto(el, d) {
  const A = d.admin;
  const ceo = d.ceo
    ? `<button class="card org-ceo" data-oper="${esc(d.ceo.key)}">${coAvatar(d.ceo, true)}<div><b>${esc(d.ceo.name)}</b><span>${esc(d.ceo.title)} · ${esc(d.company)}</span><div class="org-now">${esc(d.ceo.now.text)}</div></div></button>`
    : `<div class="card org-ceo empty-ceo"><span class="co-av big" style="background:#1f3b33">CEO</span><div><b>${esc(d.company)} CEO</b><span>Not added yet</span>${A ? '<button class="btn small" id="orgAddCeo">Add the CEO</button>' : ''}</div></div>`;
  const teamOpts = (sel) => `<option value="">— no team linked —</option>${d.teams.map((x) => `<option value="${x.id}" ${String(sel) === String(x.id) ? 'selected' : ''}>👥 ${esc(x.name)}</option>`).join('')}`;
  const headOpts = (sel) => `<option value="">— no head —</option>${d.people.map((x) => `<option value="${esc(x.key)}" ${sel === x.key ? 'selected' : ''}>${esc(x.name)}${x.title ? ' · ' + esc(x.title) : ''}</option>`).join('')}`;
  const dept = (x) => `<div class="card org-dept">
      <div class="org-dh"><b>${esc(x.emoji)} ${esc(x.name)}</b>${orgStats(x.stats)}</div>
      <div class="org-head"><span class="muted small">Head</span>${x.head ? `<a href="#" data-oper="${esc(x.head.key)}">${esc(x.head.name)}</a>` : '<span class="muted small">—</span>'}${A ? `<select class="org-sel" data-head="${x.id}">${headOpts(x.head && x.head.key)}</select>` : ''}</div>
      ${x.projects.map((pr) => `<div class="org-proj ${pr.team ? 'linked' : ''}">
        <div class="org-ph"><b>${esc(pr.name)}</b>${pr.team ? `<span class="org-team">👥 ${esc(pr.team.name)}</span>` : ''}${A ? `<button class="org-x" data-pdel-proj="${pr.id}" title="Remove project">×</button>` : ''}</div>
        ${pr.team ? `${orgStats(pr.stats)}<div class="org-faces">${pr.people.map(orgFace).join('') || '<span class="muted small">No members in this team yet</span>'}</div>` : `<div class="muted small">No team linked yet</div>`}
        ${A ? `<select class="org-sel" data-link="${pr.id}">${teamOpts(pr.team && pr.team.id)}</select>` : ''}
      </div>`).join('')}
      ${x.people.length ? `<div class="org-proj"><div class="org-ph"><b>People</b></div><div class="org-faces">${x.people.map(orgFace).join('')}</div></div>` : ''}
      ${!x.projects.length && !x.people.length ? '<div class="muted small org-emptyd">No projects or people yet</div>' : ''}
      ${A ? `<div class="org-admin"><button class="btn ghost small" data-addproj="${x.id}">+ Project</button><button class="btn ghost small" data-addperson="${x.id}" data-headkey="${esc(x.head ? x.head.key : '')}">+ Person</button></div>` : ''}
    </div>`;
  el.innerHTML = `<div class="org-tree ${orgEdit ? 'editing' : ''}"><div class="org-top">${ceo}</div><div class="org-line"></div>
      <div class="org-depts">${d.departments.map(dept).join('')}</div></div>`;
  document.querySelectorAll('[data-oper]').forEach((el) => (el.onclick = (e) => { e.preventDefault(); coGoPerson(el.dataset.oper); }));
  const call = async (path, method, body, msg) => { try { await api(path, { method, body }); toast(msg); renderCompany(); } catch (e) { toast(e.message); } };
  document.querySelectorAll('[data-link]').forEach((s) => (s.onchange = () => call('/api/company/projects', 'POST', { id: Number(s.dataset.link), ws_id: s.value ? Number(s.value) : null }, s.value ? 'Team linked' : 'Team unlinked')));
  document.querySelectorAll('[data-head]').forEach((s) => (s.onchange = () => call('/api/company/departments/head', 'POST', { id: Number(s.dataset.head), key: s.value || null }, 'Head saved')));
  document.querySelectorAll('[data-pdel-proj]').forEach((b) => (b.onclick = () => { if (confirm('Remove this project from the org chart?')) call('/api/company/projects', 'DELETE', { id: Number(b.dataset.pdelProj) }, 'Project removed'); }));
  document.querySelectorAll('[data-addproj]').forEach((b) => (b.onclick = () => { const n = prompt('Project name:'); if (n && n.trim()) call('/api/company/projects', 'POST', { department_id: Number(b.dataset.addproj), name: n }, 'Project added'); }));
  const personModal = (deptId, headKey, ceoMode) => {
    modal(`<h3>${ceoMode ? `Add the ${esc(d.company)} CEO` : 'Add a person'}</h3><form id="orgPf" class="org-form">
      <input name="name" placeholder="Name" required><input name="title" placeholder="Title" value="${ceoMode ? 'CEO' : ''}"><input name="email" type="email" placeholder="Email (they can then sign in and post what they are doing)">
      <div class="row"><button class="btn">Add</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`);
    $('#orgPf').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target.elements;
      try { await api('/api/company/people', { method: 'POST', body: { name: f.name.value, title: f.title.value, email: f.email.value, department_id: deptId || null, reports_to: headKey || (d.ceo && !ceoMode ? d.ceo.key : null) } }); closeModal(); toast('Added'); renderCompany(); } catch (err) { toast(err.message); }
    };
  };
  document.querySelectorAll('[data-addperson]').forEach((b) => (b.onclick = () => personModal(Number(b.dataset.addperson), b.dataset.headkey)));
  const ac = $('#orgAddCeo'); if (ac) ac.onclick = () => personModal(null, null, true);
}
