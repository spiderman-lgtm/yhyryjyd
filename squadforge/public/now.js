/* "Right now": who is on what today — plan, update, built vs target, open requests and blockers.
   Also the dashboard's "Today's standup" card. Read-only, refreshes with the rest of the app. */
const NOW_PILL = { rnd: 'rnd', started: 'started', stuck: 'stuck', new: 'new' };
function nowSince(iso) { return iso ? ago(iso) : ''; }
function nowPerson(p, T) {
  const pct = Math.min(100, Math.round((p.built / T) * 100));
  const day = p.role === 'growth'
    ? `<span class="now-built">🌱 ${p.growth} growth item${p.growth === 1 ? '' : 's'} today</span>`
    : `<div class="now-bar" title="${p.built} of ${T}"><i style="width:${pct}%" class="${p.met ? 'met' : ''}"></i></div><span class="now-built">${p.built}/${T} built${p.built ? ` · ${p.actions} actions, ${p.triggers} triggers` : ''}${p.met ? ' ✅' : ''}</span>`;
  return `<div class="card now-card ${p.working.some((w) => w.status === 'stuck') ? 'has-stuck' : ''}">
    <div class="now-head"><span class="avatar-xs">${esc(initials(p.name))}</span><b>${esc(p.name)}</b><span class="muted small">${esc(p.role)}</span><span class="spacer"></span>
      <span class="now-flags"><span class="${p.plan ? 'ok' : ''}" title="Morning plan">${p.plan ? '✓' : '·'} plan</span><span class="${p.update ? 'ok' : ''}" title="Evening update">${p.update ? '✓' : '·'} update</span></span></div>
    <div class="now-day">${day}</div>
    ${p.plan ? `<div class="now-plan"><span class="muted small">Today</span> ${esc(p.plan.replace(/\s+/g, ' ').slice(0, 140))}</div>` : `<div class="now-plan muted small">No plan posted yet</div>`}
    <div class="now-work">${p.working.length ? p.working.map((w) => `<div class="now-req"><span class="pill ${NOW_PILL[w.status] || ''}">${esc(w.label)}</span><span class="now-title">${esc(w.title)}</span><span class="muted small">${nowSince(w.since)}</span>${w.reason ? `<div class="now-why">🧱 ${esc(w.reason.slice(0, 120))}</div>` : ''}</div>`).join('') : '<div class="muted small">No open requests</div>'}</div>
  </div>`;
}
async function renderNow(quiet) {
  let d;
  try { d = await api('/api/now'); } catch (e) { if (!quiet) $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (tab !== 'now') return;
  const o = d.open;
  $('#view').innerHTML = `<div class="now-top">
      <div><h2 style="margin:0">Right now</h2><div class="muted small">Who is on what today · target ${d.target} actions + triggers a day · updates every few seconds</div></div>
      <div class="now-sum"><span><b>${o.started}</b> building</span><span><b>${o.rnd}</b> in R&amp;D</span><span class="${o.stuck ? 'warn' : ''}"><b>${o.stuck}</b> stuck</span><span><b>${o.new}</b> not started${d.unassigned ? ` (${d.unassigned} without an owner)` : ''}</span></div>
    </div>
    ${d.people.length ? `<div class="now-grid">${d.people.map((p) => nowPerson(p, d.target)).join('')}</div>` : '<div class="card empty">No team members yet — add them in Settings.</div>'}`;
}
// Dashboard card: today's standup at a glance
function todayCard(d) {
  if (!d || !d.people) return '';
  const T = d.target, tech = d.people.filter((p) => p.role !== 'growth');
  const posted = d.people.filter((p) => p.plan || p.update).length;
  return `<div class="card today-card"><div class="card-h"><h3>☀️ Today's standup</h3><span class="muted">${posted}/${d.people.length} posted · ${tech.filter((p) => p.met).length}/${tech.length} at target</span></div>
    ${d.people.length ? d.people.map((p) => `<div class="today-row">
      <b>${esc(p.name)}</b>
      <span class="today-flags"><span class="${p.plan ? 'ok' : ''}">${p.plan ? '✓' : '·'} plan</span><span class="${p.update ? 'ok' : ''}">${p.update ? '✓' : '·'} update</span></span>
      ${p.role === 'growth' ? `<span class="today-built">🌱 ${p.growth}</span>` : `<span class="today-built ${p.met ? 'met' : ''}">${p.built}/${T}${p.met ? ' ✅' : ''}</span>`}
      <span class="today-on muted small">${p.working.length ? esc(p.working.map((w) => (w.status === 'stuck' ? '🧱 ' : '') + w.title).join(' · ').slice(0, 70)) : ''}</span>
    </div>`).join('') : '<div class="empty">No team members yet</div>'}
    <button class="btn ghost small" data-goto="now" style="margin-top:8px">Open “Right now” →</button></div>`;
}
