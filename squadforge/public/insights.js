/* Manager insights: the action queue (top bar), where to intervene, blocked work and
   contributions that matter. Calm copy: context, never a fault; not a ranking. */

const QUEUE = [
  { key: 'submissions', icon: '📥', label: 'Submissions to review' },
  { key: 'analyses', icon: '🧠', label: 'Analyses to review' },
  { key: 'decisions', icon: '🧭', label: 'Requests to decide' },
  { key: 'outcomes', icon: '🏅', label: 'Outcomes to verify' },
  { key: 'evidence', icon: '📎', label: 'Evidence to resolve' },
];
let openRequestAfterNav = null;

// The first thing the lead sees: what is waiting on them, big and actionable.
const Q_ORDER = ['decisions', 'submissions', 'evidence', 'outcomes', 'analyses']; // which to start with
const Q_ACTION = { submissions: 'Review', analyses: 'Read', decisions: 'Assign', outcomes: 'Verify', evidence: 'Check' };
const Q_HINT = { submissions: 'Your team asked you to look', analyses: 'How finished work went', decisions: 'New requests without an owner', outcomes: 'Done — add proof it worked', evidence: 'You asked for more proof' };
function queueBar(q) {
  const total = QUEUE.reduce((n, c) => n + (q[c.key] || []).length, 0);
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const who = (typeof myName === 'string' && myName) ? myName.split(' ')[0] : (typeof myEmail === 'string' && myEmail) ? myEmail.split('@')[0].split(/[._\d]/)[0] : '';
  const nameTxt = who ? ', ' + who[0].toUpperCase() + who.slice(1) : '';
  const start = Q_ORDER.find((k) => (q[k] || []).length);
  const oldest = Math.max(0, ...(q.decisions || []).map((d) => d.waited || 0));
  const mins = total * 3;
  const evening = h >= 16 && h < 19;
  const tiles = [...QUEUE].sort((a, b) => ((q[b.key] || []).length ? 1 : 0) - ((q[a.key] || []).length ? 1 : 0)).map((c, i) => {
    const items = q[c.key] || [], n = items.length, first = items[0];
    if (!n) return `<button class="qtile zero" data-q="${c.key}" style="--i:${i}"><span class="qt-ic">${c.icon}</span><span class="qt-l">${c.label}</span><b class="qt-n tnum">0</b></button>`;
    const meta = first ? [first.who, first.waited ? `waiting ${first.waited}h` : ''].filter(Boolean).join(' · ') : '';
    return `<button class="qtile ${c.key === start ? 'start' : ''}" data-q="${c.key}" style="--i:${i}">
      ${c.key === start ? '<span class="qt-start">Start here</span>' : ''}
      <div class="qt-top"><span class="qt-ic">${c.icon}</span><b class="qt-n tnum">${n}</b></div>
      <div class="qt-l">${c.label}</div><div class="qt-hint">${Q_HINT[c.key]}</div>
      ${first ? `<div class="qt-first"><b>${esc(first.title)}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</div>` : ''}
      <span class="qt-go">${Q_ACTION[c.key]}${n > 1 ? ` · ${n}` : ''} →</span>
    </button>`;
  });
  return `<section class="qhero ${total ? '' : 'clear'}" aria-label="Things that need you">
    <div class="qh-head">
      <div><div class="qh-greet">${greet}${esc(nameTxt)}</div>
        <h2>${total ? `${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} you` : 'All clear 🌿'}</h2>
        <div class="qh-sub">${total ? `About ${mins < 60 ? mins + ' minutes' : Math.round(mins / 60) + ' h'} of your time${oldest ? ` · oldest request waiting ${oldest}h` : ''} · tap a card to act` : 'Nothing is waiting on you right now — the team has what it needs.'}</div></div>
      ${evening ? `<div class="qh-alert">📢 Your 7 PM alert goes out at 7:00 PM <button class="btn small ghost" id="previewAlert">Preview</button></div>` : ''}
    </div>
    ${total ? `<div class="qh-tiles">${tiles.filter((t) => !t.includes('qtile zero')).join('')}</div><div class="qh-zero">${tiles.filter((t) => t.includes('qtile zero')).join('')}</div>` : ''}
  </section>`;
}

function wireQueue(q) {
  document.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => openQueue(b.dataset.q, q)));
  const pa = $('#previewAlert');
  if (pa) pa.onclick = async () => { pa.disabled = true; try { const r = await api('/api/reports/preview', { method: 'POST' }); modal(`<div class="card-h"><h2 style="margin:0">📢 Today's 7 PM alert (preview)</h2></div><pre class="report">${esc(r.text)}</pre><div class="row"><span class="spacer"></span><button class="btn ghost" data-close>Close</button></div>`); } catch (e) { toast(e.message); } pa.disabled = false; };
}

function openQueue(key, q) {
  const c = QUEUE.find((x) => x.key === key), items = q[key] || [];
  const row = (it) => {
    const meta = [it.who, it.waited ? `waiting ${it.waited}h` : '', it.difficulty ? `difficulty ${it.difficulty}/5` : ''].filter(Boolean).join(' · ');
    let actions = '', extra = '';
    if (key === 'submissions') actions = `<button class="btn ghost small" data-go="reviews">Open reviews</button>`;
    if (key === 'analyses') { extra = `<div class="qi-text">🤖 ${esc(it.text || '')}</div>`; actions = `<button class="btn small" data-ack="${it.id}">Got it ✓</button>`; }
    if (key === 'decisions') actions = `<button class="btn small" data-assign="${it.id}">Assign</button>`;
    if (key === 'outcomes') { extra = it.evidence ? `<div class="qi-text">📎 ${esc(it.evidence)}</div>` : ''; actions = `<button class="btn small" data-ver="${it.kind}:${it.id}:verified">Verify ✓</button><button class="btn ghost small" data-ver="${it.kind}:${it.id}:needs_evidence">Need evidence</button>`; }
    if (key === 'evidence') { extra = `<div class="qi-text">❓ ${esc(it.note || 'More evidence was requested')}${it.answered ? `<br>📎 New: ${esc(it.evidence || '')}` : ''}</div>`; actions = `<button class="btn small" data-ver="${it.kind}:${it.id}:verified">Verify ✓</button>`; }
    return `<div class="qi-row" data-row="${it.kind}:${it.id}"><div class="qi-main"><div class="qi-t">${esc(it.title)}</div>${meta ? `<div class="muted" style="font-size:11.5px">${esc(meta)}</div>` : ''}${extra}</div><div class="qi-act">${actions}</div></div>`;
  };
  modal(`<div class="card-h"><h2 style="margin:0">${c.icon} ${c.label}</h2><span class="muted">${items.length}</span></div>
    <p class="muted" style="margin-top:4px">${{ submissions: 'Work your team asked you to look at.', analyses: 'How finished requests went — a quick read keeps the team context fresh.', decisions: 'New client requests that still need an owner.', outcomes: 'Finished work. Verifying adds proof to the “it’s done”, never a penalty.', evidence: 'You asked for more evidence on these.' }[key]}</p>
    <div class="qi-list">${items.map(row).join('') || '<div class="empty">Nothing here 🌿</div>'}</div>
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn ghost" data-close>Close</button></div>`);
  const done = (el, txt) => { const r = el.closest('.qi-row'); r.classList.add('done'); r.querySelector('.qi-act').innerHTML = `<span class="pill completed">${txt}</span>`; };
  document.querySelectorAll('#modalCard [data-go]').forEach((b) => (b.onclick = () => { closeModal(); tab = b.dataset.go; location.hash = tab; render(); }));
  document.querySelectorAll('#modalCard [data-ack]').forEach((b) => (b.onclick = async () => { await api(`/api/requests/${b.dataset.ack}/ack-analysis`, { method: 'POST' }); done(b, 'Read ✓'); }));
  document.querySelectorAll('#modalCard [data-assign]').forEach((b) => (b.onclick = () => { openRequestAfterNav = Number(b.dataset.assign); closeModal(); tab = 'requests'; location.hash = tab; render(); }));
  document.querySelectorAll('#modalCard [data-ver]').forEach((b) => (b.onclick = async () => {
    const [kind, id, status] = b.dataset.ver.split(':');
    let note = '';
    if (status === 'needs_evidence') { note = prompt('What evidence would help? (shown to the member)', 'A link to the published plugin or a screenshot') || ''; if (!note) return; }
    try { await api('/api/verify', { method: 'POST', body: { kind, id: Number(id), status, note } }); done(b, status === 'verified' ? 'Verified 🏅' : 'Asked for evidence'); }
    catch (e) { toast(e.message); }
  }));
}

const SEV = { high: 'Now', medium: 'Soon', low: 'When you can' };
const KIND_ICON = { long_blocker: '🧱', stalled: '⏸️', decide: '🧭', pending_review: '🔍', risky_deadline: '⏰', check_in: '👋' };
function interventionsCard(list) {
  return `<div class="card"><div class="card-h"><h3>Where to intervene</h3><span class="muted">${list.length ? 'suggested next steps' : ''}</span></div>
    ${list.length ? `<ul class="iv">${list.slice(0, 6).map((x, i) => `<li class="iv-${x.severity}" style="--i:${i}">
      <span class="iv-ic">${KIND_ICON[x.kind] || '•'}</span>
      <div class="iv-main"><div class="iv-t">${esc(x.title)}</div><div class="muted iv-c">${esc(x.context)}</div><div class="iv-s">→ ${esc(x.suggestion)}</div></div>
      <div class="iv-side"><span class="sev ${x.severity}">${SEV[x.severity]}</span><button class="btn ghost small" data-goto="${x.link.tab}">Open</button></div></li>`).join('')}</ul>${list.length > 6 ? `<div class="muted" style="font-size:11.5px;margin-top:6px">+${list.length - 6} more</div>` : ''}`
      : '<div class="empty">Nothing needs a nudge right now. The team is moving 🌿</div>'}
  </div>`;
}

function blockedCard(list, compact) {
  return `<div class="card ${compact ? 'blk-strip' : ''}"><div class="card-h"><h3>Blocked work</h3><span class="muted">context, never a fault</span></div>
    ${list.length ? `<ul class="blk">${list.slice(0, compact ? 4 : 6).map((b) => `<li>
      <span class="av sm">${esc(initials(b.who.split(',')[0] || '?'))}</span>
      <div class="blk-main"><div><b>${esc(b.who)}</b> <span class="muted">is waiting on</span> ${esc(b.waitingOn)}</div>
        <div class="blk-what">“${esc(b.what)}” · <span class="muted">${b.hours >= 48 ? Math.round(b.hours / 24) + ' days' : b.hours + 'h'}</span></div>
        <div class="blk-ctx">🧱 ${esc(b.context)}</div>
        ${b.helper ? `<div class="blk-help">🤝 ${esc(b.helper)} could help with this</div>` : ''}</div></li>`).join('')}</ul>`
      : '<div class="empty">Nobody is blocked right now ✨</div>'}
  </div>`;
}

function contributionsSection(list) {
  return `<div class="card" style="margin-top:16px"><div class="card-h"><h3>Contributions that matter</h3><span class="muted">last 14 days · not a ranking</span></div>
    ${list.length ? `<ul class="contrib">${list.map((c) => `<li><span class="c-ic">${c.kind === 'growth' ? '🌱' : c.kind === 'task' ? '✅' : '📜'}</span>
      <div class="c-main"><div class="c-t">${esc(c.title)} ${c.verified ? '<span class="pill completed">🏅 verified</span>' : ''}</div>
        <div class="muted" style="font-size:11.5px">${esc(c.who)} · ${esc(c.date)}</div>
        <div class="c-why">${c.reasons.map((r) => `<span>${esc(r)}</span>`).join('')}</div></div></li>`).join('')}</ul>`
      : '<div class="empty">Finished work will show up here with why it mattered.</div>'}
  </div>`;
}
