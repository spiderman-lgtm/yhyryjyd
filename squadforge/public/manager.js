/* Manager view: a read-only page a boss can open to understand the week in one read.
   The lead sees the same page (with a note) so they know exactly what their manager sees. */
let mgrWeek = null;
async function renderManager() {
  $('#view').innerHTML = `<div class="card"><div class="muted">Loading the week…</div></div>`;
  let d, now = null;
  try { [d, now] = await Promise.all([api(`/api/manager${mgrWeek ? '?week=' + mgrWeek : ''}`), api('/api/now').catch(() => null)]); } catch (e) { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (tab !== 'manager') return;
  const K = d.kpis, L = d.lead_work;
  const isThisWeek = d.from === weekStartOf(state.today);
  const fmtD = (x) => new Date(x + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const delta = (cur, prev, upGood = true, unit = '') => {
    if (cur == null || prev == null || cur === prev) return '<span class="mg-d same">same as last week</span>';
    const up = cur > prev, good = up === upGood;
    return `<span class="mg-d ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(Math.round((cur - prev) * 10) / 10)}${unit} vs last week</span>`;
  };
  const hrs = (h) => (h == null ? '–' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd');
  const maxT = Math.max(1, ...d.trend.map((t) => t.delivered));
  const wsName = (typeof myWorkspace === 'object' && myWorkspace) ? myWorkspace.name : 'the team';

  $('#view').innerHTML = `
    ${role === 'admin' ? `<div class="banner mg-note">👔 <b>This is what your manager sees.</b> Invite them in Settings → Workspace with the <b>Manager</b> role — they get this page only, read-only. <a href="#" id="mgPrint">Save as PDF</a></div>` : ''}
    <section class="mg-hero card">
      <div class="mg-top">
        <div><div class="mg-kicker">${esc(wsName)} · led by ${esc(d.lead)}</div>
          <h2>Week of ${fmtD(d.from)} – ${fmtD(d.to)}${isThisWeek ? ' <span class="pill">so far</span>' : ''}</h2></div>
        <div class="mg-nav"><button class="btn ghost small" id="mgPrev">‹ Previous week</button>${isThisWeek ? '' : '<button class="btn ghost small" id="mgNext">Next week ›</button>'}${role === 'manager' ? '<button class="btn ghost small" id="mgPrint">Save as PDF</button>' : ''}</div>
      </div>
      <div class="mg-story">${d.story.map((x) => `<p>${esc(x)}</p>`).join('')}</div>
    </section>

    ${now && now.people.length && isThisWeek ? `<section class="card mg-now"><div class="card-h"><h3>👥 Team right now</h3><span class="muted small">today · tap a name for their week</span></div>
      ${now.people.map((p) => { const w = p.working.find((x) => x.status === 'stuck') || p.working.find((x) => x.status === 'started') || p.working[0];
        return `<div class="mg-now-row ${w && w.status === 'stuck' ? 'stuck' : ''}">
          <a href="#" data-prof="${p.id}" class="mg-now-name">${esc(p.name)}</a>
          <span class="mg-now-on">${p.leave ? '🌴 On leave' : w ? `<span class="pill ${w.status}">${esc(w.label)}</span> ${esc(w.title)}${w.reason ? ` <span class="mg-now-why">— ${esc(w.reason.slice(0, 70))}</span>` : ''}` : '<span class="muted">No open request</span>'}</span>
          <span class="mg-now-today">${p.leave ? '' : p.role === 'growth' ? `🌱 ${p.growth} today` : `<b class="${p.met ? 'pf-met' : ''}">${p.built}/${now.target}</b> today`}</span>
          <span class="today-flags">${p.leave ? '' : `<span class="${p.plan ? 'ok' : ''}">${p.plan ? '✓' : '·'} plan</span><span class="${p.update ? 'ok' : ''}">${p.update ? '✓' : '·'} update</span>`}</span>
        </div>`; }).join('')}</section>` : ''}
    <div class="mg-kpis">
      <div class="card mg-k"><span>Work shipped</span><b class="tnum">${K.delivered}</b>${delta(K.delivered, K.prev_delivered)}</div>
      <div class="card mg-k"><span>Verified with proof</span><b class="tnum">${K.verified}</b><span class="mg-d same">${K.delivered ? Math.round(K.verified / K.delivered * 100) + '% of shipped' : '—'}</span></div>
      <div class="card mg-k"><span>Ask → live</span><b class="tnum">${hrs(K.ttv)}</b>${delta(K.ttv, K.prev_ttv, false, 'h')}</div>
      <div class="card mg-k"><span>Blockers cleared</span><b class="tnum">${K.blockers_cleared}</b>${delta(K.blockers_cleared, K.prev_blockers)}</div>
      <div class="card mg-k ${K.blocked_now ? 'warn' : ''}"><span>Blocked right now</span><b class="tnum">${K.blocked_now}</b><span class="mg-d same">${K.blocked_now ? 'reasons below' : 'nothing stuck'}</span></div>
    </div>

    <div class="mg-grid">
      <div class="card"><div class="card-h"><h3>What ${esc(d.lead)} did this week</h3></div>
        <div class="mg-lead">
          ${[['📨', L.brought, 'client requests brought in'], ['🧭', L.assigned, 'given an owner'], ['🏅', L.verified, 'outcomes verified'], ['🔍', L.reviews, 'submissions quality-checked'], ['⚔️', L.messages, 'instructions sent to the team'], ['📢', L.alerts, 'daily updates sent']].map(([i, n, l]) => `<div class="${n ? '' : 'zero'}"><span>${i}</span><b class="tnum">${n}</b><small>${l}</small></div>`).join('')}
        </div>
        <div class="nav-label" style="margin-top:14px">Timeline</div>
        <div class="mg-tl">${L.timeline.length ? L.timeline.map((t) => `<div><span class="mg-tl-d">${new Date(t.at).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}</span><span>${t.icon}</span><span>${esc(t.text)}</span></div>`).join('') : '<p class="muted">No actions recorded this week yet.</p>'}</div>
      </div>
      <div class="card"><div class="card-h"><h3>Shipped</h3><span class="muted">${d.shipped.length}</span></div>
        ${d.shipped.length ? d.shipped.map((o) => `<div class="mg-ship"><div class="mg-ship-t"><b>${esc(o.title)}</b>${o.verified ? '<span class="lp-tag ok">✓ Verified</span>' : ''}${o.wasBlocked ? '<span class="lp-tag warn">was blocked</span>' : ''}</div>
          <small>${esc(o.who || 'Team')} · ${fmtD(o.date)}${o.days != null ? ` · ${o.days} days from ask to live` : ''}</small>${o.impact ? `<p>💡 ${esc(o.impact)}</p>` : ''}${o.evidence ? `<a href="${esc(o.evidence)}" target="_blank" rel="noopener">Proof ↗</a>` : ''}</div>`).join('') : '<p class="muted">Nothing shipped in this week yet.</p>'}
      </div>
    </div>

    <div class="mg-grid">
      <div class="card"><div class="card-h"><h3>Blocked — and why</h3></div>
        ${d.blocked.length ? d.blocked.map((b) => `<div class="mg-blk"><b>${esc(b.what)}</b><small>${esc(b.who)} · ${b.hours < 48 ? b.hours + 'h' : Math.round(b.hours / 24) + ' days'} · waiting on ${esc(b.waitingOn)}${b.helper ? ` · ${esc(b.helper)} is chasing it` : ''}</small><p>${esc(b.context)}</p></div>`).join('') : '<p class="muted">Nothing is blocked. 🌿</p>'}
        <p class="muted small">Blocked is context, never a fault.</p>
      </div>
      <div class="card"><div class="card-h"><h3>In progress</h3><span class="muted">${d.moving.length}${d.waiting ? ` · ${d.waiting} waiting to start` : ''}</span></div>
        ${d.moving.length ? d.moving.map((r) => `<div class="mg-mv"><b>${esc(r.title)}</b><span class="lp-tag mid">${r.status}</span><small>${esc(r.who)}</small></div>`).join('') : '<p class="muted">Nothing in progress right now.</p>'}
        <div class="nav-label" style="margin-top:16px">Last 4 weeks · work shipped</div>
        <div class="mg-trend">${d.trend.map((t) => `<div><b class="tnum">${t.delivered}</b><i style="height:${Math.max(4, t.delivered / maxT * 70)}px"></i><small>${fmtD(t.week)}</small></div>`).join('')}</div>
      </div>
    </div>

    ${d.weekly ? `<details class="card mg-weekly"><summary><b>📜 Latest weekly report</b> <span class="muted">${esc(d.weekly.period_start || '')} → ${esc(d.weekly.period_end || '')}</span></summary><pre class="report">${esc(d.weekly.content)}</pre></details>` : ''}
    <p class="muted small" style="text-align:center;margin:18px 0">We measure the value of work, not the number of tasks. Not a ranking.</p>`;

  $('#mgPrev').onclick = () => { mgrWeek = addDays(d.from, -7); renderManager(); };
  if ($('#mgNext')) $('#mgNext').onclick = () => { mgrWeek = addDays(d.from, 7); renderManager(); };
  document.querySelectorAll('#mgPrint').forEach((b) => (b.onclick = (e) => { e.preventDefault(); window.print(); }));
}
