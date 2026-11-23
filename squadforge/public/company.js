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

async function renderCompany() {
  if (coPerson) return renderCompanyPerson(coPerson);
  let d;
  try { d = await api('/api/company/everyone'); } catch (e) { $('#view').innerHTML = `<div class="card empty">🏢 ${esc(e.message)}</div>`; return; }
  if (tab !== 'company' || coPerson) return;
  coData = d;
  if (!d.people.length) {
    $('#view').innerHTML = `<div class="card empty co-empty"><h2>🏢 Everyone · who is doing what</h2>
      <p>${d.admin ? 'No team has members yet. Add team members in each team’s Settings (or import them from Slack), and add people who are not in a team (CEO, other departments) in Admin.' : 'Nobody is in the company view yet — a company admin sets it up in Admin.'}</p>
      ${d.admin ? '<button class="btn" data-goto-setup>Open Admin</button>' : ''}</div>`;
    const g = document.querySelector('[data-goto-setup]'); if (g) g.onclick = () => { tab = 'orgsetup'; location.hash = tab; render(); };
    return;
  }
  const meCard = d.me ? d.people.find((p) => p.key === d.me) : null;
  $('#view').innerHTML = `<div class="co-top"><div><h2 style="margin:0">Everyone · who is doing what</h2>
      <div class="muted small">Whole company · ${d.people.length} people · updates from Slack and from everyone's own “right now” line</div></div>
      ${d.admin ? '<button class="btn ghost small" data-goto-setup>⚙️ Admin</button>' : ''}</div>
    ${meCard ? `<form class="card co-mine" id="coStatus"><span class="co-who">${coAvatar(meCard)}</span><input id="coStatusText" maxlength="200" placeholder="What are you doing right now? (everyone sees this)" value=""><button class="btn">Post</button></form>` : ''}
    ${coMetrics(d.metrics)}
    <div class="co-filters"><input id="coSearch" type="search" placeholder="🔍  Search a person, title or department…" value="${esc(coFilter.q)}">
      ${(d.groups || []).some((x) => x.key[0] === 'd') ? `<div class="seg co-chips"><button data-dept="all" class="${coFilter.dept === 'all' ? 'on' : ''}">All ${d.people.length}</button>${(d.groups || []).filter((x) => x.key[0] === 'd').map((x) => `<button data-dept="${esc(x.key)}" class="${coFilter.dept === x.key ? 'on' : ''}">${esc(x.emoji + ' ' + x.name)} ${x.people}</button>`).join('')}</div>` : ''}</div>
    <div id="coList"></div>`;
  coList();
  const g = document.querySelector('[data-goto-setup]'); if (g) g.onclick = () => { tab = 'orgsetup'; location.hash = tab; render(); };
  $('#coSearch').oninput = (e) => { coFilter.q = e.target.value; coList(); };
  document.querySelectorAll('[data-dept]').forEach((b) => (b.onclick = () => { coFilter.dept = b.dataset.dept; document.querySelectorAll('[data-dept]').forEach((x) => x.classList.toggle('on', x === b)); coList(); }));
  const f = $('#coStatus');
  if (f) f.onsubmit = async (e) => { e.preventDefault(); const t = $('#coStatusText').value.trim(); if (!t) return; try { await api('/api/company/status', { method: 'POST', body: { text: t } }); toast('Posted — everyone can see it'); renderCompany(); } catch (err) { toast(err.message); } };
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
  $('#view').innerHTML = `<button class="btn ghost small" id="coBack">← Everyone</button>
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
