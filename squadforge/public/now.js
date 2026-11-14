/* "Right now": who is on what today — plan, update, built vs target, open requests and blockers.
   Also the dashboard's "Today's standup" card. Read-only, refreshes with the rest of the app. */
const profLink = (p) => (role === 'admin' || role === 'manager' ? `<a href="#" data-prof="${p.id}" title="Open ${esc(p.name)}'s week">${esc(p.name)}</a>` : esc(p.name));
const NOW_PILL = { rnd: 'rnd', started: 'started', stuck: 'stuck', new: 'new' };
function nowSince(iso) { return iso ? ago(iso) : ''; }
function nowPerson(p, T) {
  const pct = Math.min(100, Math.round((p.built / T) * 100));
  const leaveBtn = role === 'admin' ? `<button class="btn ghost small now-leave" data-leave="${p.id}" data-on="${p.leave ? 0 : 1}">${p.leave ? 'Back today' : '🌴 On leave'}</button>` : '';
  if (p.leave) return `<div class="card now-card on-leave"><div class="now-head"><span class="avatar-xs">${esc(initials(p.name))}</span><b>${profLink(p)}</b><span class="muted small">${esc(p.role)}</span><span class="spacer"></span>${leaveBtn}</div><div class="now-plan">🌴 On leave today — no target, no reminders.</div></div>`;
  const day = p.role === 'growth'
    ? `<span class="now-built">🌱 ${p.growth} growth item${p.growth === 1 ? '' : 's'} today</span>`
    : `<div class="now-bar" title="${p.built} of ${T}"><i style="width:${pct}%" class="${p.met ? 'met' : ''}"></i></div><span class="now-built">${p.built}/${T} built${p.built ? ` · ${p.actions} actions, ${p.triggers} triggers` : ''}${p.met ? ' ✅' : ''}</span>`;
  return `<div class="card now-card ${p.working.some((w) => w.status === 'stuck') ? 'has-stuck' : ''}">
    <div class="now-head"><span class="avatar-xs">${esc(initials(p.name))}</span><b>${profLink(p)}</b><span class="muted small">${esc(p.role)}</span><span class="spacer"></span>
      <span class="now-flags"><span class="${p.plan ? 'ok' : ''}" title="Morning plan">${p.plan ? '✓' : '·'} plan</span><span class="${p.update ? 'ok' : ''}" title="Evening update">${p.update ? '✓' : '·'} update</span></span></div>
    <div class="now-day">${day}</div>
    ${p.plan ? `<div class="now-plan"><span class="muted small">Today</span> ${esc(p.plan.replace(/\s+/g, ' ').slice(0, 140))}</div>` : `<div class="now-plan muted small">No plan posted yet</div>`}
    ${leaveBtn ? `<div class="now-actions">${leaveBtn}</div>` : ''}
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
  if (typeof subTabs === 'function') subTabs();
  document.querySelectorAll('[data-leave]').forEach((b) => (b.onclick = async () => { b.disabled = true; try { await api('/api/leave', { method: 'POST', body: { member_id: Number(b.dataset.leave), on: b.dataset.on === '1' } }); renderNow(true); } catch (e) { toast(e.message); b.disabled = false; } }));
}
// Dashboard card: today's standup at a glance
function todayCard(d) {
  if (!d || !d.people) return '';
  const T = d.target, tech = d.people.filter((p) => p.role !== 'growth' && !p.leave);
  const posted = d.people.filter((p) => !p.leave && (p.plan || p.update)).length, away = d.people.filter((p) => p.leave).length;
  return `<div class="card today-card"><div class="card-h"><h3>☀️ Today's standup</h3><span class="muted">${posted}/${d.people.length - away} posted · ${tech.filter((p) => p.met).length}/${tech.length} at target${away ? ` · 🌴 ${away}` : ''}</span></div>
    ${d.people.length ? d.people.map((p) => p.leave ? `<div class="today-row"><b>${profLink(p)}</b><span class="today-flags"><span>🌴 on leave</span></span><span></span><span></span></div>` : `<div class="today-row">
      <b>${profLink(p)}</b>
      <span class="today-flags"><span class="${p.plan ? 'ok' : ''}">${p.plan ? '✓' : '·'} plan</span><span class="${p.update ? 'ok' : ''}">${p.update ? '✓' : '·'} update</span></span>
      ${p.role === 'growth' ? `<span class="today-built">🌱 ${p.growth}</span>` : `<span class="today-built ${p.met ? 'met' : ''}">${p.built}/${T}${p.met ? ' ✅' : ''}</span>`}
      <span class="today-on muted small">${p.working.length ? esc(p.working.map((w) => (w.status === 'stuck' ? '🧱 ' : '') + w.title).join(' · ').slice(0, 70)) : ''}</span>
    </div>`).join('') : '<div class="empty">No team members yet</div>'}
    <button class="btn ghost small" data-goto="now" style="margin-top:8px">Open “Right now” →</button></div>`;
}

// ---------- one person's week (opens from Right now, the dashboard and Manager view) ----------
async function openProfile(id, week) {
  let d;
  try { d = await api(`/api/member/${id}/profile${week ? '?week=' + week : ''}`); } catch (e) { return toast(e.message); }
  const T = d.target, t = d.totals, M = d.member;
  const fmtD = (x) => new Date(x + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dayRow = (x) => x.leave ? `<tr class="pf-leave"><td>${fmtD(x.date || '')}</td><td colspan="3">🌴 On leave</td></tr>`
    : `<tr><td>${fmtD(x.date || '')}</td><td>${M.role === 'growth' ? `🌱 ${x.growth}` : `<b class="${x.met ? 'pf-met' : ''}">${x.built}/${T}</b> <span class="muted small">${x.actions}a · ${x.triggers}t</span>`}</td>
      <td class="small">${x.plan ? esc(x.plan.replace(/\s+/g, ' ').slice(0, 90)) : '<span class="muted">no plan</span>'}</td><td class="small">${x.update ? esc(x.update.replace(/\s+/g, ' ').slice(0, 110)) : '<span class="muted">no update</span>'}</td></tr>`;
  modal(`<div class="pf">
    <div class="card-h"><div><h2 style="margin:0">${esc(M.name)}</h2><span class="muted small">${esc(M.role)} · week of ${fmtD(d.from)} – ${fmtD(d.to)}</span></div><span class="spacer"></span>
      <button class="btn ghost small" data-pfweek="-7">‹ Prev week</button>${d.to < state.today ? '<button class="btn ghost small" data-pfweek="7">Next ›</button>' : ''}</div>
    <div class="pf-kpis">
      ${M.role === 'growth' ? `<div><b>${t.growth}</b><span>growth items</span></div>` : `<div><b>${t.built}</b><span>built (${t.actions} actions, ${t.triggers} triggers)</span></div><div><b>${t.met}/${t.workdays}</b><span>days at target</span></div>`}
      <div><b>${t.updates}/${t.workdays}</b><span>days with an update</span></div>
      <div><b>${t.shipped}</b><span>requests completed</span></div>
      <div><b>${t.reviews ? `${t.passed}/${t.reviews}` : '–'}</b><span>reviews passed${t.mistakes ? ` · ${t.mistakes} mistakes` : ''}</span></div>
      ${t.leave ? `<div><b>${t.leave}</b><span>day(s) on leave</span></div>` : ''}
    </div>
    <h3>Day by day</h3>
    <div class="pf-table"><table><thead><tr><th>Day</th><th>${M.role === 'growth' ? 'Growth' : 'Built'}</th><th>Plan</th><th>Update</th></tr></thead><tbody>${d.days.map((x, i) => dayRow({ ...x, date: x.date || dayDate(d.from, i, d.days) })).join('')}</tbody></table></div>
    <h3>Requests</h3>
    ${d.requests.length ? d.requests.map((r) => `<div class="now-req"><span class="pill ${r.status}">${esc(r.label)}</span><span class="now-title">${esc(r.title)}</span>${r.reason && r.status === 'stuck' ? `<div class="now-why">🧱 ${esc(r.reason.slice(0, 140))}</div>` : ''}${r.impact ? `<div class="muted small" style="flex-basis:100%">💡 ${esc(r.impact)}</div>` : ''}</div>`).join('') : '<p class="muted">No requests this week.</p>'}
    <h3>Reviews</h3>
    ${d.reviews.length ? d.reviews.map((r) => `<div class="pf-rev"><span class="pill ${r.passed ? 'completed' : 'stuck'}">${r.passed ? 'passed' : r.mistakes + ' to fix'}</span><b>${esc(r.subject || 'Submission')}</b><span class="muted small">attempt ${r.attempt}</span>${r.findings.length ? `<div class="muted small">${r.findings.map(esc).join(' · ')}</div>` : ''}</div>`).join('') : '<p class="muted">No reviews this week.</p>'}
    <div class="row" style="margin-top:12px"><span class="muted small">Context, not a ranking.</span><span class="spacer"></span><button class="btn ghost" data-close>Close</button></div>
  </div>`);
  document.querySelectorAll('[data-pfweek]').forEach((b) => (b.onclick = () => openProfile(id, addDays(d.from, Number(b.dataset.pfweek)))));
}
function dayDate(from, i, days) { let d = from, n = -1; while (true) { if (new Date(d + 'T12:00:00Z').getUTCDay() !== 0) n++; if (n === i) return d; d = addDays(d, 1); } }
document.addEventListener('click', (e) => { const el = e.target.closest('[data-prof]'); if (el) { e.preventDefault(); openProfile(Number(el.dataset.prof)); } });


// ---------- Leaderboard: ranked by actions + triggers; ties go to the lower review error rate ----------
let lbRange = (() => { try { return localStorage.getItem('sf_lb_range') || 'week'; } catch { return 'week'; } })();
async function renderLeaderboard() {
  let d; try { d = await api('/api/leaderboard?range=' + lbRange); } catch (e) { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; subTabs(); return; }
  if (tab !== 'leaderboard') return;
  const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r);
  const er = (x) => (x === null ? '—' : x + '%');
  const erCls = (x) => (x === null ? '' : x <= 20 ? 'good' : x <= 50 ? 'mid' : 'bad');
  const top = d.tech.slice(0, 3);
  const fmtD = (x) => new Date(x + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  $('#view').innerHTML = `<div class="now-top"><div><h2 style="margin:0">🏆 Leaderboard</h2><div class="muted small">${fmtD(d.from)}${d.from !== d.to ? ' – ' + fmtD(d.to) : ''} · ranked by actions + triggers built · equal work → lower error rate first</div></div>
      <div class="seg" role="tablist">${[['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([k, l]) => `<button class="${k === lbRange ? 'on' : ''}" data-lb="${k}">${l}</button>`).join('')}</div></div>
    ${top.length ? `<div class="lb-podium">${top.map((r) => `<div class="lb-pod r${r.rank}"><div class="lb-medal">${medal(r.rank)}</div><b>${profLink(r)}</b><div class="lb-big tnum">${r.built}</div><small>actions + triggers</small><span class="lb-er ${erCls(r.error_rate)}">error rate ${er(r.error_rate)}</span></div>`).join('')}</div>` : ''}
    <div class="card"><div class="pf-table"><table class="lb-table"><thead><tr><th>#</th><th>Builder</th><th>Built</th><th>Actions</th><th>Triggers</th><th>Requests done</th><th>Reviews passed</th><th>Error rate</th><th>Days at target</th></tr></thead><tbody>
      ${d.tech.map((r) => `<tr class="${r.rank <= 3 ? 'lb-top' : ''}"><td class="lb-rank">${medal(r.rank)}</td><td><b>${profLink(r)}</b>${r.leave ? ` <span class="muted small">🌴 ${r.leave}d leave</span>` : ''}</td><td class="tnum"><b>${r.built}</b></td><td class="tnum">${r.actions}</td><td class="tnum">${r.triggers}</td><td class="tnum">${r.completed}</td><td class="tnum">${r.reviews ? `${r.passed}/${r.reviews}` : '—'}</td><td><span class="lb-er ${erCls(r.error_rate)}">${er(r.error_rate)}</span></td><td class="tnum">${r.days_met}/${r.workdays}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">No builders yet.</td></tr>'}
    </tbody></table></div>
    <p class="muted small" style="margin:10px 0 0">Error rate = reviews that needed fixes ÷ all reviews. Team: ${d.team.built} built · ${d.team.completed} requests done · ${d.team.passed}/${d.team.reviews} reviews passed.</p></div>
    ${d.growth.length ? `<div class="card" style="margin-top:14px"><h3>🌱 Growth</h3>${d.growth.map((g) => `<div class="today-row"><b>${profLink(g)}</b><span class="today-built">${g.growth} item${g.growth === 1 ? '' : 's'}</span><span class="muted small">${g.updates}/${g.workdays} days with an update</span><span></span></div>`).join('')}</div>` : ''}`;
  subTabs();
  document.querySelectorAll('[data-lb]').forEach((b) => (b.onclick = () => { lbRange = b.dataset.lb; try { localStorage.setItem('sf_lb_range', lbRange); } catch { /* ignore */ } renderLeaderboard(); }));
}

// ---------- Analysis: one day of the channel's threads ----------
let anDate = null;
async function renderAnalysis() {
  const date = anDate || state.today;
  let d; try { d = await api('/api/digest?date=' + date); } catch (e) { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; subTabs(); return; }
  if (tab !== 'analysis') return;
  const fmtD = (x) => new Date(x + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const pill = { 'Not started': 'new', 'R&D': 'rnd', Building: 'started', Stuck: 'stuck', Completed: 'completed' };
  $('#view').innerHTML = `<div class="now-top"><div><h2 style="margin:0">🧭 Analysis</h2><div class="muted small">${fmtD(date)} · read from the channel's threads${d.generated_at ? ' · AI summary ' + ago(d.generated_at) : ''}</div></div>
      <div class="row"><button class="btn ghost small" id="anPrev">‹ Day before</button>${date < state.today ? '<button class="btn ghost small" id="anNext">Next day ›</button>' : ''}${role === 'admin' ? '<button class="btn small" id="anRun">✨ Analyse now</button>' : ''}</div></div>
    <div class="grid g2">
      <div class="card"><h3>📝 Summary</h3>${d.summary.length ? `<ul class="an-list">${d.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="muted">${role === 'admin' ? 'Tap “Analyse now” for an AI summary — it also runs by itself before the 7 PM alert.' : 'The summary is written before the 7 PM alert.'}</p>`}
        ${d.attention.length ? `<h3 style="margin-top:14px">⚠️ Needs attention</h3><ul class="an-list warn">${d.attention.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>
      <div class="card"><h3>🔥 Urgent work</h3>${d.urgent.length ? d.urgent.map((u) => `<div class="now-req"><span class="pill ${pill[u.status] || ''}">${esc(u.status)}</span><span class="now-title">${esc(u.title)}</span><span class="muted small">${esc(u.owners.join(', ') || 'no owner yet')}</span>${u.started ? '' : `<div class="now-why">Not started yet${u.waiting_h ? ` · waiting ${u.waiting_h}h` : ''}</div>`}${u.reason ? `<div class="now-why">🧱 ${esc(u.reason.slice(0, 120))}</div>` : ''}</div>`).join('') : '<p class="muted">Nothing marked urgent. (The lead writes “urgent”, “asap” or “priority” in a request or its thread.)</p>'}</div>
    </div>
    <div class="card" style="margin-top:14px"><h3>📋 Who was given what · how it moved</h3>
      ${d.assignments.length ? d.assignments.map((a) => `<div class="an-req"><div class="an-req-h">${a.urgent ? '🔥 ' : ''}<b>${esc(a.title)}</b><span class="pill ${pill[a.status] || ''}">${esc(a.status)}</span><span class="muted small">${esc(a.owners.join(', ') || 'no owner yet')}</span></div>
        ${a.moves.length ? `<div class="an-moves">${a.moves.map((m) => `<span>${esc(m.status)}${m.who ? ' · ' + esc(m.who) : ''}${m.reason ? ' — ' + esc(m.reason.slice(0, 80)) : ''}</span>`).join('<i>→</i>')}</div>` : ''}</div>`).join('') : '<p class="muted">No request moved on this day.</p>'}</div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>🔍 Reviews</h3>${d.reviews.length ? d.reviews.map((r) => `<div class="pf-rev"><span class="pill ${r.status !== 'done' ? 'new' : r.passed ? 'completed' : 'stuck'}">${r.status !== 'done' ? 'waiting' : r.passed ? 'passed' : r.mistakes + ' to fix'}</span><b>${esc(r.subject || 'Submission')}</b><span class="muted small">${esc(r.who || '')} · attempt ${r.attempt}</span>${r.findings.length ? `<div class="muted small">${r.findings.map(esc).join(' · ')}</div>` : ''}</div>`).join('') : '<p class="muted">No reviews on this day.</p>'}</div>
      <div class="card"><h3>💬 What everyone said</h3>${d.people.map((p) => `<div class="an-person"><b>${esc(p.name)}</b>${p.leave ? '<span class="muted small">🌴 on leave</span>' : `<span class="muted small">${p.built ? p.built + ' built' : ''}</span>`}
        ${p.leave ? '' : `<div class="small">${p.plan ? '<span class="muted">Plan:</span> ' + esc(p.plan) : '<span class="muted">No plan posted</span>'}</div><div class="small">${p.update ? '<span class="muted">Update:</span> ' + esc(p.update) : '<span class="muted">No update posted</span>'}</div>`}</div>`).join('') || '<p class="muted">No team members yet.</p>'}</div>
    </div>`;
  subTabs();
  $('#anPrev').onclick = () => { anDate = addDays(date, -1); renderAnalysis(); };
  if ($('#anNext')) $('#anNext').onclick = () => { anDate = addDays(date, 1); renderAnalysis(); };
  if ($('#anRun')) $('#anRun').onclick = async () => { const b = $('#anRun'); b.disabled = true; b.textContent = '✨ Reading the threads…'; try { await api('/api/digest', { method: 'POST', body: { date } }); renderAnalysis(); } catch (e) { toast(e.message); b.disabled = false; b.textContent = '✨ Analyse now'; } };
}
