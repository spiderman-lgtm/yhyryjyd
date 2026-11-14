/* History (team activity) page + the "Test it for real" checklist card on the dashboard */

// ---------- checklist ----------
function checklistCard(c) {
  if (!c || c.hidden) return '';
  const open = (() => { try { return localStorage.getItem('sf_check_open') !== '0'; } catch { return true; } })();
  const pct = Math.round((c.done / c.total) * 100);
  const groups = [...new Set(c.steps.map((s) => s.group))];
  const next = c.steps.find((s) => !s.done);
  const allDone = c.done === c.total;
  return `<div class="card checklist ${open ? 'open' : ''}" id="checklist">
    <div class="ck-head">
      <div class="ck-title"><h3>${allDone ? '🎉 All set — SquadForge is running for real' : '🧪 Test it for real'}</h3>
        <span class="muted">${c.done} of ${c.total} done${next && !open ? ` · next: ${esc(next.label)}` : ''}</span></div>
      <div class="ck-bar" aria-label="${pct}% done"><i style="width:${pct}%"></i></div>
      <button class="btn ghost small" id="ckToggle">${open ? 'Collapse' : 'Show steps'}</button>
      <button class="btn ghost small" id="ckHide" title="Hide this card (bring it back from Settings)">Hide</button>
    </div>
    <div class="ck-body">${groups.map((g) => `<div class="ck-group"><div class="nav-label">${esc(g)}</div>
      ${c.steps.filter((s) => s.group === g).map((s) => `<div class="ck-step ${s.done ? 'done' : ''} ${next && next.key === s.key ? 'next' : ''}">
        <span class="ck-dot">${s.done ? '✓' : ''}</span>
        <div class="ck-text"><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></div>
        ${!s.done && s.tab ? `<button class="btn ghost small" data-goto="${s.tab}">Go →</button>` : ''}
      </div>`).join('')}</div>`).join('')}</div>
  </div>`;
}
function wireChecklist() {
  const t = $('#ckToggle'); if (!t) return;
  t.onclick = () => { const card = $('#checklist'); const open = !card.classList.contains('open'); card.classList.toggle('open', open); t.textContent = open ? 'Collapse' : 'Show steps'; try { localStorage.setItem('sf_check_open', open ? '1' : '0'); } catch { /* ignore */ } };
  $('#ckHide').onclick = async () => { await api('/api/checklist', { method: 'POST', body: { hidden: true } }); $('#checklist').remove(); toast('Checklist hidden — bring it back from Settings'); };
}

// ---------- history ----------
const HIST_KINDS = [['all', 'All'], ['requests', 'Requests'], ['reviews', 'Reviews'], ['growth', 'Growth'], ['alerts', 'Alerts & reports'], ['members', 'Team'], ['settings', 'Settings'], ['integrations', 'Integrations'], ['agents', 'Agents']];
let histKind = 'all', histDays = 7, histQuery = '';
async function renderHistory() {
  $('#view').innerHTML = `<div class="hist-top">
      <div class="seg hist-kinds" role="tablist" aria-label="Filter">${HIST_KINDS.map(([k, l]) => `<button role="tab" class="${k === histKind ? 'on' : ''}" aria-selected="${k === histKind}" data-hk="${k}">${l}</button>`).join('')}</div>
      <div class="hist-tools"><input id="histQ" type="search" placeholder="Search history…" value="${esc(histQuery)}" aria-label="Search history"/>
        <select id="histDays" aria-label="Period">${[[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(([d, l]) => `<option value="${d}" ${d === histDays ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <div id="histList" class="card hist-card"><div class="muted">Loading…</div></div>`;
  if (typeof subTabs === 'function') subTabs();
  document.querySelectorAll('[data-hk]').forEach((b) => (b.onclick = () => { histKind = b.dataset.hk; renderHistory(); }));
  $('#histDays').onchange = (e) => { histDays = Number(e.target.value); renderHistory(); };
  let rows = [];
  $('#histQ').oninput = (e) => { histQuery = e.target.value; draw(); };
  try { rows = await api(`/api/history?days=${histDays === 1 ? 1 : histDays}&kind=${histKind}`); } catch (e) { $('#histList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (tab !== 'history') return;
  if (histDays === 1) rows = rows.filter((r) => dayKey(r.at) === state.today);
  function draw() {
    const q = histQuery.trim().toLowerCase();
    const list = q ? rows.filter((r) => [r.text, r.detail, r.actor].join(' ').toLowerCase().includes(q)) : rows;
    if (!list.length) { $('#histList').innerHTML = `<div class="empty hist-empty"><div style="font-size:28px">🕊️</div><b>Nothing here yet</b><span class="muted">${q ? 'No match for your search.' : 'Changes appear here as your team posts in Slack and you use the app.'}</span></div>`; return; }
    const days = {};
    list.forEach((r) => (days[dayKey(r.at)] = days[dayKey(r.at)] || []).push(r));
    $('#histList').innerHTML = Object.entries(days).map(([d, items]) => `<div class="hist-day"><div class="hist-date">${dayLabel(d)}<span>${items.length}</span></div>
      ${items.map((r) => `<div class="hist-row ${r.tone || ''}" ${r.ref && r.ref.startsWith('request:') ? `data-req="${r.ref.slice(8)}" title="Open in Requests"` : ''}>
        <span class="hist-time">${r.dateOnly ? '' : timeOf(r.at)}</span>
        <span class="hist-ic">${r.icon}</span>
        <div class="hist-body"><div>${esc(r.text)}${r.demo ? ' <span class="pill">demo</span>' : ''}</div>${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</div>
        ${r.actor ? `<span class="hist-actor">${esc(r.actor)}</span>` : ''}
      </div>`).join('')}</div>`).join('');
    document.querySelectorAll('#histList [data-req]').forEach((el) => (el.onclick = () => { tab = 'requests'; location.hash = 'requests'; render(); }));
  }
  draw();
}
function dayKey(iso) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
function timeOf(iso) { return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }); }
function dayLabel(d) {
  if (d === state.today) return 'Today';
  if (d === addDays(state.today, -1)) return 'Yesterday';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
