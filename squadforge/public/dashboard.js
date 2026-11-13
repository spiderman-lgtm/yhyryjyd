/* Dashboard: KPI tiles (delta vs previous period + sparkline), daily output chart with hover,
   request pipeline, team leaderboard, today's check-ins. Series colours: --s1/--s2/--s3. */

const SERIES = [
  { key: 'actions', label: 'Actions', color: 'var(--s1)' },
  { key: 'triggers', label: 'Triggers', color: 'var(--s2)' },
  { key: 'apps', label: 'Apps', color: 'var(--s3)' },
];
let dashRange = 'week';

async function renderTeam(range = dashRange) {
  dashRange = range;
  const t = state.today;
  const ws = weekStartOf(t);
  const ranges = {
    week: { from: ws, to: t, label: 'This week', prevLabel: 'last week' },
    last: { from: addDays(ws, -7), to: addDays(ws, -1), label: 'Last week', prevLabel: 'the week before' },
    d14: { from: addDays(t, -13), to: t, label: '14 days', prevLabel: 'previous 14 days' },
    d30: { from: addDays(t, -29), to: t, label: '30 days', prevLabel: 'previous 30 days' },
  };
  const r = ranges[range];
  const span = Math.round((new Date(r.to) - new Date(r.from)) / 864e5) + 1;
  const prevTo = addDays(r.from, -1), prevFrom = addDays(r.from, -span);
  $('#view').classList.remove('drawn');
  $('#view').innerHTML = skeleton();
  const monthStart = t.slice(0, 8) + '01';
  const [cur, prev, spark, logs, month, reqs, ins, check] = await Promise.all([
    api(`/api/metrics?from=${r.from}&to=${r.to}`),
    api(`/api/metrics?from=${prevFrom}&to=${prevTo}`),
    api(`/api/metrics?from=${addDays(t, -13)}&to=${t}`),
    api(`/api/logs?date=${t}`),
    api(`/api/metrics?from=${monthStart}&to=${t}`),
    api('/api/requests'),
    api('/api/insights').catch(() => ({ queue: {}, interventions: [], blocked: [] })),
    api('/api/checklist').catch(() => null),
  ]);
  if (tab !== 'team') return;
  const T = cur.team.totals, P = prev.team.totals, S = spark.series;
  const VV = cur.value || { outcomes: [] }, PV = prev.value || {};
  const open = state.week_metrics.totals.open_by_status || {};

  $('#view').innerHTML = `
    ${queueBar(ins.queue)}
    ${checklistCard(check)}
    ${birdScene(state.today_metrics, logs.logs)}
    <div class="dash-main" style="grid-template-columns:1.25fr 1fr">${interventionsCard(ins.interventions)}${blockedCard(ins.blocked)}</div>
    <div class="qp-row3">
      <div class="card"><div class="card-h"><h3>Work calendar</h3><span class="muted">${new Date(t + 'T12:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span></div>${calendar(month.series, t)}</div>
      <div class="card"><div class="card-h"><h3>Request preview</h3></div>${requestPreview(reqs, open, T.requests_completed)}</div>
      <div class="card"><div class="card-h"><h3>Quick message</h3><span class="muted">to the team channel</span></div>
        <textarea id="qmText" class="qm" placeholder="What should the team know?"></textarea>
        <div class="qm-bar"><label class="check" title="Also send an M91 alert"><input type="checkbox" id="qmImp"/> Important</label><span class="spacer"></span><button class="btn ghost small" id="qmAi" title="Let AI improve the wording">✨ Improve</button><button class="btn" id="qmSend">Send ✦</button></div>
        <div class="muted" style="font-size:11px">Tag people and polish with AI in Commander.</div>
      </div>
    </div>
    <div class="dash-head">
      <div><h3 style="margin:0">Value delivered</h3><div class="muted" style="font-size:12px">${fmtRange(r.from, r.to)} · compared with ${r.prevLabel} · <i>we measure the value of work, not the number of tasks</i></div></div>
      <div class="seg" role="tablist" aria-label="Date range">${Object.entries(ranges).map(([k, v]) => `<button role="tab" aria-selected="${k === range}" class="${k === range ? 'on' : ''}" data-range="${k}">${v.label}</button>`).join('')}</div>
    </div>
    <div class="kpi-grid">
      ${tile('Outcomes delivered', VV.delivered, PV.delivered, null, true, `${VV.verified} verified 🏅`)}
      ${tile('Time to value', VV.time_to_value_h, PV.time_to_value_h, null, false, 'median · request → live', 'h')}
      ${tile('First-pass quality', VV.first_pass_pct, PV.first_pass_pct, null, true, VV.first_pass_n ? `${VV.first_pass_n} first reviews` : 'no reviews yet', '%')}
      ${tile('Blockers cleared', VV.blockers_cleared, PV.blockers_cleared, null, true, 'unblocked & moving again')}
      ${tile('Time lost to blockers', VV.stuck_share_pct, PV.stuck_share_pct, null, false, 'share of delivery time', '%')}
      ${tile('Waiting on us', VV.waiting_on_us, null, null, false, 'requests not started yet')}
    </div>
    <div class="dash-main">
      <div class="card chart-card">
        <div class="card-h"><div><h3 style="margin:0">Request → Live</h3><div class="muted" style="font-size:12px">Where the time went for each delivered request</div></div><span class="spacer"></span>
          <div class="legend"><span><i style="background:#c9c2b2"></i>Waiting to start</span><span><i style="background:var(--accent)"></i>Working</span><span><i style="background:var(--coral)"></i>Blocked</span></div></div>
        <div id="journeyChart">${journeyChart(VV.outcomes.filter((o) => o.journey))}</div>
      </div>
      <div class="card"><div class="card-h"><h3>To-do</h3><span class="muted">client requests</span></div>${todo(reqs)}</div>
    </div>
    <div class="dash-main">
      <div class="card"><div class="card-h"><h3 style="margin:0">Team outcomes</h3><span class="spacer"></span><span class="muted" style="font-size:12px">${fmtRange(r.from, r.to)} · A–Z, not a ranking</span></div>
        ${teamOutcomes(cur.people || [])}</div>
      <div class="card"><div class="card-h"><h3>Today's check-ins</h3></div>${checkins(logs.logs)}</div>
    </div>`;

  placeBirds();
  wireChecklist();
  wireQueue(ins.queue);
  const qs = $('#qmSend');
  if (qs) qs.onclick = async () => {
    const message = $('#qmText').value.trim();
    if (!message) { $('#qmText').focus(); return; }
    qs.disabled = true;
    try { await api('/api/broadcast', { method: 'POST', body: { message, important: $('#qmImp').checked } }); $('#qmText').value = ''; toast('Sent to the team ✦'); refresh(); }
    catch (e) { toast(e.message); }
    qs.disabled = false;
  };
  const qa = $('#qmAi');
  if (qa) qa.onclick = async () => {
    const msg = $('#qmText').value.trim(); if (!msg) { $('#qmText').focus(); return; }
    qa.disabled = true; qa.textContent = '✨ …';
    try { const r = await api('/api/broadcast/polish', { method: 'POST', body: { message: msg } }); typeIn($('#qmText'), r.text); toast('AI improved it — check, then Send'); }
    catch (e) { toast(e.message); }
    qa.disabled = false; qa.textContent = '✨ Improve';
  };
  document.querySelectorAll('[data-goto]').forEach((el) => (el.onclick = () => { tab = el.dataset.goto; location.hash = tab; render(); }));
  document.querySelectorAll('[data-range]').forEach((b) => (b.onclick = () => renderTeam(b.dataset.range)));
  wireBirds(state.today_metrics, logs.logs);
  animateDash();
}

function skeleton() {
  return `<div class="kpi-grid">${'<div class="card sk" style="height:118px"></div>'.repeat(6)}</div>
    <div class="dash-main"><div class="card sk" style="height:300px"></div><div class="card sk" style="height:300px"></div></div>`;
}
function fmtRange(a, b) {
  const f = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return a === b ? f(a) : `${f(a)} – ${f(b)}`;
}
const compact = (n) => (n === null || n === undefined ? '–' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n));

// upGood: true (up is good), false (up is bad), null (neutral)
function tile(label, val, prevVal, series, upGood, foot, unit = '') {
  let delta = '';
  if (val !== null && val !== undefined && prevVal !== null && prevVal !== undefined) {
    const diff = +(val - prevVal).toFixed(2);
    const pct = prevVal ? Math.round((diff / prevVal) * 100) : null;
    const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const good = upGood === null || dir === 'flat' ? 'neutral' : (dir === 'up') === upGood ? 'good' : 'bad';
    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
    const word = good === 'good' ? (pct !== null && pct >= 50 ? 'GREAT!' : 'GOOD!') : good === 'bad' ? 'BAD' : '';
    delta = `<span class="delta ${good}">${arrow} ${pct !== null ? Math.abs(pct) + '%' : (diff > 0 ? '+' : '') + diff}</span>${word ? `<span class="sticker ${good}">${word}</span>` : ''}`;
  }
  const isNum = typeof val === 'number' && Number.isInteger(val);
  return `<div class="card kpi-tile">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-row"><div class="kpi-value tnum"><span ${isNum ? `data-count="${val}"` : ''}>${isNum ? '0' : esc(compact(val))}</span>${unit && val !== null && val !== undefined ? `<small class="kpi-unit">${unit}</small>` : ''}</div>${delta}</div>
    <div class="kpi-foot">${series ? sparkline(series) : `<span class="muted">${esc(foot || '')}</span>`}${series && foot ? `<span class="muted">${esc(foot)}</span>` : ''}</div>
  </div>`;
}
function sparkline(vals) {
  const W = 120, H = 28, max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => [(i / Math.max(1, vals.length - 1)) * W, H - 3 - (v / max) * (H - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d} L${W},${H} L0,${H} Z" class="spark-area"/><path d="${d}" class="spark-line" pathLength="1"/><circle cx="${last[0]}" cy="${last[1]}" r="2.5" class="spark-dot"/></svg>`;
}

// y-axis: 4 intervals of a 'nice' integer step (1, 2, 5 × 10^k) so every tick is a whole number
function niceMax(v) {
  const raw = Math.max(1, v) / 4, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw && Number.isInteger(s)) || Math.ceil(raw);
  return step * 4;
}
function stackChart(series) {
  const W = 760, H = 260, L = 34, R = 8, Tp = 10, B = 26;
  const totals = series.map((d) => SERIES.reduce((s, k) => s + (d[k.key] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const n = series.length, slot = (W - L - R) / n, bw = Math.min(28, slot * 0.62);
  const y = (v) => Tp + (H - Tp - B) * (1 - v / max);
  const grid = [0, .25, .5, .75, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" class="${f === 0 ? 'axis' : 'gridline'}"/><text x="${L - 8}" y="${y(max * f) + 4}" text-anchor="end" class="tick">${Math.round(max * f)}</text>`).join('');
  const bars = series.map((d, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    let base = 0;
    const segs = SERIES.map((s, si) => {
      const v = d[s.key] || 0; if (!v) return '';
      const y1 = y(base + v), y0 = y(base); base += v;
      const top = SERIES.slice(si + 1).every((x2) => !(d[x2.key] || 0));
      const h = Math.max(0, y0 - y1 - (base - v > 0 ? 2 : 0)); // 2px gap between segments
      return `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" rx="${top ? 4 : 0}" fill="${s.color}" class="bar-seg"/>${top ? `<rect x="${x}" y="${y1 + 4}" width="${bw}" height="${Math.max(0, h - 4)}" fill="${s.color}" class="bar-seg"/>` : ''}`;
    }).join('');
    const show = n <= 16 || i % Math.ceil(n / 12) === 0;
    const label = show ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="tick">${new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: n > 10 ? 'short' : undefined, weekday: n <= 7 ? 'short' : undefined, timeZone: 'UTC' })}</text>` : '';
    return `<g class="bar" style="--d:${i * 35}ms">${segs}</g>${label}<rect x="${L + i * slot}" y="${Tp}" width="${slot}" height="${H - Tp - B}" fill="transparent" class="hit" data-i="${i}"/>`;
  }).join('');
  const empty = totals.every((v) => !v) ? `<text x="${(W + L) / 2}" y="${H / 2}" text-anchor="middle" class="tick">Nothing published in this period yet</text>` : '';
  return `<svg class="stack" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily output: actions, triggers and apps">${grid}<g class="bars">${bars}</g>${empty}<line class="hover-line" x1="0" x2="0" y1="${Tp}" y2="${H - B}"/></svg><div class="tip" role="status"></div>`;
}
function wireChart(series) {
  const wrap = $('#dayChart'); if (!wrap) return;
  const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.tip'), line = wrap.querySelector('.hover-line');
  wrap.querySelectorAll('.hit').forEach((h) => {
    const i = +h.dataset.i, d = series[i];
    const show = () => {
      const bb = h.getBBox(), cx = bb.x + bb.width / 2;
      line.setAttribute('x1', cx); line.setAttribute('x2', cx); line.style.opacity = 1;
      const total = SERIES.reduce((s, k) => s + (d[k.key] || 0), 0);
      tip.innerHTML = `<div class="tip-h">${new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</div>${SERIES.map((s) => `<div class="tip-r"><i style="background:${s.color}"></i>${s.label}<b class="tnum">${d[s.key] || 0}</b></div>`).join('')}<div class="tip-r tot">Total<b class="tnum">${total}</b></div>`;
      const rect = svg.getBoundingClientRect(), scale = rect.width / svg.viewBox.baseVal.width;
      const px = cx * scale;
      tip.style.left = Math.min(rect.width - 150, Math.max(0, px + 12)) + 'px';
      tip.classList.add('on');
      wrap.querySelectorAll('.bar').forEach((g, j) => g.classList.toggle('dim', j !== i));
    };
    h.addEventListener('mouseenter', show);
    h.addEventListener('focus', show);
  });
  wrap.addEventListener('mouseleave', () => { tip.classList.remove('on'); line.style.opacity = 0; wrap.querySelectorAll('.bar').forEach((g) => g.classList.remove('dim')); });
}

function pipeline(open, done) {
  const stages = [['new', 'New'], ['rnd', 'R&D'], ['started', 'Started'], ['stuck', 'Stuck']];
  const total = stages.reduce((s, [k]) => s + (open[k] || 0), 0);
  const colors = { new: '#86b6ef', rnd: '#5598e7', started: '#2a78d6', stuck: 'var(--critical)' };
  const bar = total ? stages.filter(([k]) => open[k]).map(([k, l]) => `<div class="pipe-seg" style="flex:${open[k]};background:${colors[k]}" title="${l}: ${open[k]}"></div>`).join('') : '<div class="pipe-seg empty" style="flex:1"></div>';
  return `<div class="pipe-total"><span class="tnum" data-count="${total}">0</span><span class="muted">open</span><span class="spacer"></span><span class="pill completed">✓ ${done} done this period</span></div>
    <div class="pipe-bar">${bar}</div>
    <div class="pipe-list">${stages.map(([k, l]) => `<div class="pipe-row"><i style="background:${colors[k]}"></i><span>${l}</span><span class="spacer"></span><b class="tnum">${open[k] || 0}</b>${k === 'stuck' && open[k] ? '<span class="pill stuck">needs attention</span>' : ''}</div>`).join('')}</div>
    <button class="btn ghost small" style="margin-top:12px;width:100%;justify-content:center" onclick="tab='requests';location.hash='requests';render()">Open requests board →</button>`;
}

function leaderboard(ms) {
  if (!ms.length) return '<div class="empty">No team members yet. Add them in Settings.</div>';
  const rows = [...ms].sort((a, b) => b.xp - a.xp);
  const maxOut = Math.max(1, ...rows.map((m) => m.actions + m.triggers + m.apps));
  return `<table class="lb"><thead><tr><th>#</th><th>Member</th><th>Output</th><th class="r">Plan → done</th><th class="r">Requests</th><th class="r">Errors / review</th><th class="r">Check-ins</th></tr></thead><tbody>
    ${rows.map((m, i) => {
      const out = m.actions + m.triggers + m.apps;
      const segs = SERIES.map((s) => (m[s.key] ? `<span style="flex:${m[s.key]};background:${s.color}" title="${s.label}: ${m[s.key]}"></span>` : '')).join('');
      const err = m.error_rate === null ? '–' : `<span class="pill ${m.error_rate >= 3 ? 'stuck' : m.error_rate >= 1.5 ? 'started' : 'completed'}">${m.error_rate}</span>`;
      const growth = Object.values(m.growth).reduce((a, b) => a + b, 0);
      return `<tr><td class="muted tnum">${i < 3 ? medal(i) : i + 1}</td>
        <td><div class="who"><span class="av ${m.role}">${esc(initials(m.name))}</span><div><div class="who-n">${esc(m.name)}</div><div class="muted" style="font-size:12px">${m.role === 'growth' ? 'Growth' : 'Plugin builder'} · Lv ${m.level}</div></div></div></td>
        <td style="min-width:140px">${m.role === 'growth' ? `<span class="tnum">${growth}</span> <span class="muted">posts · ${m.unblocked} unblocked</span>` : `<div class="out"><div class="out-bar" style="width:${(out / maxOut) * 100}%">${segs}</div><span class="tnum">${out}</span></div>`}</td>
        <td class="r">${m.plan_done_pct === null ? '–' : `<div class="meter"><i style="--w:${Math.min(100, m.plan_done_pct)}%"></i></div><span class="tnum">${m.plan_done_pct}%</span>`}</td>
        <td class="r tnum">${m.requests_completed}/${m.requests_assigned}${m.requests_stuck ? ' <span class="pill stuck">' + m.requests_stuck + ' stuck</span>' : ''}</td>
        <td class="r">${err}</td>
        <td class="r tnum">${m.morning_updates + m.evening_updates}<span class="muted">/${m.workdays * 2}</span></td></tr>`;
    }).join('')}</tbody></table>`;
}

function checkins(logs) {
  const people = (state.today_metrics.members || []);
  if (!people.length) return '<div class="empty">No team members yet</div>';
  return `<div class="checkins">${people.map((m) => {
    const l = logs.find((x) => x.member_id === m.id) || {};
    const st = (ok) => `<span class="ci ${ok ? 'ok' : 'miss'}">${ok ? '✓' : '·'}</span>`;
    return `<div class="ci-row"><span class="av sm ${m.role}">${esc(initials(m.name))}</span><div class="ci-main"><div class="who-n">${esc(m.name)}</div><div class="muted ci-text">${esc((l.summary || l.evening_text || l.morning_text || 'No update yet').split('\n')[0].slice(0, 70))}</div></div>
      <div class="ci-flags" title="Morning / evening">${st(!!l.morning_text)}${st(!!l.evening_text)}</div></div>`;
  }).join('')}</div>`;
}

function animateDash() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('#view [data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (reduce || !target) { el.textContent = compact(target); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = compact(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => document.querySelector('#view')?.classList.add('drawn'));
}

// Month calendar: each day shaded by how much the team published (actions + triggers + apps).
function calendar(series, today) {
  const byDate = Object.fromEntries(series.map((d) => [d.date, d.actions + d.triggers + d.apps]));
  const max = Math.max(1, ...Object.values(byDate));
  const first = new Date(today.slice(0, 8) + '01T12:00:00Z');
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<i class="cd empty"></i>');
  for (let d = 1; d <= days; d++) {
    const ds = today.slice(0, 8) + String(d).padStart(2, '0');
    const v = byDate[ds];
    const lvl = v === undefined ? 'future' : v === 0 ? 'l0' : 'l' + Math.min(4, Math.ceil((v / max) * 4));
    cells.push(`<i class="cd ${lvl} ${ds === today ? 'today' : ''}" style="--d:${d * 12}ms" title="${ds}: ${v ?? '–'} published">${d}</i>`);
  }
  const total = Object.values(byDate).reduce((a, b) => a + b, 0);
  return `<div class="cal"><div class="cal-w">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<b>${x}</b>`).join('')}</div><div class="cal-g">${cells.join('')}</div>
    <div class="cal-f"><span class="muted">${total} published this month</span><span class="cal-legend">less <i class="cd l0"></i><i class="cd l1"></i><i class="cd l2"></i><i class="cd l3"></i><i class="cd l4"></i> more</span></div></div>`;
}

function requestPreview(reqs, open, done) {
  const active = reqs.find((r) => r.status === 'stuck') || reqs.find((r) => r.status === 'started') || reqs.find((r) => r.status === 'rnd') || reqs.find((r) => r.status === 'new');
  const order = ['new', 'rnd', 'started', 'completed'];
  if (!active) return `<div class="empty">No open client requests 🌿</div>${pipeline(open, done)}`;
  const pct = active.status === 'stuck' ? 66 : Math.round((order.indexOf(active.status) / 3) * 100);
  return `<div class="rp">
      <div class="rp-art">${birdSvg(2, active.status === 'stuck' ? 'worried' : 'happy')}</div>
      <div class="rp-main"><span class="pill ${active.status}">${STATUS[active.status]}</span>
        <div class="rp-t">${esc(active.title)}</div>
        <div class="muted" style="font-size:12px">${esc(active.assigned.map((a) => a.name).join(', ') || 'unassigned')} · ${active.hours !== null ? active.hours.toFixed(1) + 'h' : '–'}</div>
        <div class="rp-bar"><i style="--w:${pct}%" class="${active.status}"></i></div>
        ${active.stuck_reason ? `<div class="rp-reason">🧱 ${esc(active.stuck_reason.slice(0, 80))}</div>` : ''}
      </div></div>
    <div class="rp-counts">${['new', 'rnd', 'started', 'stuck'].map((k) => `<span><b class="tnum">${open[k] || 0}</b>${STATUS[k]}</span>`).join('')}</div>
    <button class="btn ghost small" data-goto="requests" style="width:100%;justify-content:center;margin-top:10px">Open requests board</button>`;
}

function todo(reqs) {
  const list = [...reqs.filter((r) => r.status !== 'completed'), ...reqs.filter((r) => r.status === 'completed').slice(0, 2)].slice(0, 7);
  if (!list.length) return '<div class="empty">Nothing to do — enjoy the quiet 🌿</div>';
  return `<ul class="todo">${list.map((r) => `<li class="${r.status === 'completed' ? 'done' : ''}" data-goto="requests" title="${esc(r.title)}"><span class="box">${r.status === 'completed' ? '✓' : ''}</span><span class="tt">${esc(r.title)}</span><span class="pill ${r.status}">${STATUS[r.status]}</span></li>`).join('')}</ul>
    <button class="btn ghost small" data-goto="requests" style="margin-top:8px">+ Add request</button>`;
}

// Horizontal bar per delivered request: waiting (grey) → working (sage) → blocked (coral).
function journeyChart(list) {
  if (!list.length) return '<div class="empty">Delivered requests will show where their time went.</div>';
  const rows = list.slice(0, 10), max = Math.max(1, ...rows.map((o) => o.journey.total));
  const fmtH = (h) => (h >= 24 ? (h / 24).toFixed(1) + 'd' : h.toFixed(1) + 'h');
  return `<div class="jc">${rows.map((o, i) => {
    const j = o.journey, w = (v) => (v / max) * 100;
    const who = (o.who || []).map((id) => { const m = (state.today_metrics.members || []).find((x) => x.id === id); return m ? m.name.replace(/\s*\(.*\)/, '') : ''; }).filter(Boolean).join(', ');
    return `<div class="jc-row" style="--i:${i}" title="${esc(o.title)}: waiting ${fmtH(j.waiting)}, working ${fmtH(j.working)}, blocked ${fmtH(j.stuck)}">
      <div class="jc-label"><b>${esc(o.title)}</b><span class="muted">${esc(who)}${o.verified ? ' · 🏅' : ''}</span></div>
      <div class="jc-bar"><i class="w" style="--w:${w(j.waiting)}%"></i><i class="k" style="--w:${w(j.working)}%"></i><i class="s" style="--w:${w(j.stuck)}%"></i></div>
      <div class="jc-total tnum">${fmtH(j.total)}</div></div>`;
  }).join('')}</div>`;
}

// What each person delivered and how — names A–Z, no scores, no medals.
function teamOutcomes(people) {
  if (!people.length) return '<div class="empty">Add your team in Settings.</div>';
  return `<div class="to-grid">${people.map((p) => `<div class="to-card">
    <div class="who"><span class="av ${p.role}">${esc(initials(p.name))}</span><div><div class="who-n">${esc(p.name)}</div><div class="muted" style="font-size:11.5px">${p.role === 'growth' ? 'Growth' : 'Plugin builder'}</div></div></div>
    <div class="to-sec"><span class="to-k">Delivered</span>${p.outcomes.length ? p.outcomes.slice(0, 4).map((o) => `<div class="to-o">${o.verified ? '🏅' : '✅'} ${esc(o.title)}${o.impact ? `<div class="to-impact">${esc(o.impact)}</div>` : ''}</div>`).join('') + (p.outcomes.length > 4 ? `<div class="muted" style="font-size:11px">+${p.outcomes.length - 4} more</div>` : '') : '<div class="muted to-o">Nothing shipped in this period</div>'}</div>
    ${p.working_on.length ? `<div class="to-sec"><span class="to-k">Working on</span>${p.working_on.slice(0, 2).map((w) => `<div class="to-o">${w.status === 'stuck' ? '🧱' : '🔨'} ${esc(w.title)}</div>`).join('')}</div>` : ''}
    <div class="to-tags">
      ${p.hardest ? `<span>Hardest: ${esc(p.hardest.title)} (${p.hardest.difficulty}/5)</span>` : ''}
      ${p.through_blockers ? `<span>Got through ${p.through_blockers} blocker${p.through_blockers > 1 ? 's' : ''}</span>` : ''}
      ${p.first_pass ? `<span>First-pass reviews ${p.first_pass}</span>` : ''}
      ${p.unblocked.length ? `<span>Unblocked: ${esc(p.unblocked.join(', '))}</span>` : ''}
    </div></div>`).join('')}</div>`;
}
