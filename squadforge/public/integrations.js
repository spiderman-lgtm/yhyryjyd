/* 🔌 Integrations: an admin connects Slack / Gmail / Google Sheets through viaSocket, then picks
   the channel, "this is me", the manager's email and the spreadsheet, once. SquadForge does the rest. */

let vsInfo = null; // { token, serviceIds, actions } - embed token is the only viaSocket value the browser holds
let vsListening = false;

async function renderIntegrations() {
  $('#view').innerHTML = `<h2>🔌 Integrations</h2><div class="empty">Loading…</div>`;
  let st;
  try { st = await api('/api/integrations'); } catch (e) { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (st.configured && !vsInfo) { try { vsInfo = await api('/api/integrations/connect-info'); } catch (e) { toast(e.message); } }
  listenForConnect();
  $('#view').innerHTML = `
    <div class="row" style="margin-bottom:6px"><h2 style="margin:0">🔌 Integrations</h2><span class="spacer"></span><span class="muted" style="font-size:12px">via viaSocket: 2,300+ apps</span></div>
    <p class="muted" style="margin-top:0">Click <b>Connect</b> once and choose your account. viaSocket handles sign-in and tokens; SquadForge only does the jobs you switch on.</p>
    ${st.configured ? '' : '<div class="banner red">viaSocket keys are not set on the server (VIASOCKET_ORG_ID, VIASOCKET_PROJECT_ID, VIASOCKET_EMBED_SECRET).</div>'}
    <div class="grid integ-grid">${st.apps.map(appCard).join('')}</div>
    <div class="card" style="margin-top:16px"><h3>➕ More apps</h3><p class="muted" style="margin:0">Jira, ClickUp, Trello, Notion, HubSpot… tell us what you need. Creating a task there when a client request arrives, or updating it when the request completes, plugs in the same way.</p></div>`;
  st.apps.forEach(wireCard);
}

function appCard(a) {
  const state = a.expired ? '<span class="pill stuck">expired</span>' : a.connected ? '<span class="pill completed">connected</span>' : '<span class="pill">not connected</span>';
  const s = a.settings || {};
  let body = '';
  if (a.connected && !a.expired) {
    if (a.slug === 'slack') {
      body = `
        <label>Team channel (updates are read from here)</label>
        <div class="picker" data-pick="channel" data-app="slack"><select id="pk_channel"><option value="${esc(s.channel_id || '')}">${esc(s.channel_name || '— choose —')}</option></select><button class="btn ghost small" data-load="channel">Load list</button></div>
        <label>This is me (receives the 7 PM alert and report DMs)</label>
        <div class="picker" data-pick="me" data-app="slack"><select id="pk_me"><option value="${esc(s.me_id || '')}">${esc(s.me_name || '— choose —')}</option></select><button class="btn ghost small" data-load="me">Load list</button></div>
        <label class="check"><input type="checkbox" id="sl_use" ${s.use_for_slack !== false ? 'checked' : ''}/> Run SquadForge's Slack through this connection (no bot token needed)</label>
        <div class="row" style="margin-top:8px"><button class="btn" data-save="slack">Save</button><button class="btn ghost" data-test="slack">🧪 Send me a test DM</button></div>`;
    } else if (a.slug === 'gmail') {
      body = `
        <label>Manager's email (the Monday report goes here)</label>
        <input id="gm_to" type="email" value="${esc(s.manager_email || '')}" placeholder="manager@company.com"/>
        <label class="check"><input type="checkbox" id="gm_on" ${s.weekly_email !== false ? 'checked' : ''}/> Email the weekly report every Monday</label>
        <div class="row" style="margin-top:8px"><button class="btn" data-save="gmail">Save</button><button class="btn ghost" data-test="gmail">🧪 Send me a test email</button></div>`;
    } else {
      body = `
        <label>Spreadsheet</label>
        <div class="picker"><input id="gs_search" placeholder="search by name…" style="flex:1"/><button class="btn ghost small" data-load="spreadsheet">Search</button></div>
        <select id="pk_sheet" style="margin-top:6px"><option value="${esc(s.spreadsheet_id || '')}">${esc(s.spreadsheet_name || '— choose —')}</option></select>
        <label>Sheet (tab)</label>
        <div class="picker"><select id="pk_tab"><option value="${esc(s.tab || '')}">${esc(s.tab || '— choose a spreadsheet first —')}</option></select><button class="btn ghost small" data-load="tab">Load list</button></div>
        <label class="check"><input type="checkbox" id="gs_on" ${s.weekly_rows !== false ? 'checked' : ''}/> Add one row per member every Monday</label>
        <div class="row" style="margin-top:8px"><button class="btn" data-save="google-sheets">Save</button><button class="btn ghost" data-test="google-sheets">🧪 Create a "viaSocket test" sheet</button></div>`;
    }
  }
  return `<div class="card integ" data-app="${a.slug}">
    <div class="row"><img src="${esc(a.icon)}" alt="" class="app-ic" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'app-ic app-ic-fb',textContent:'${esc(a.name[0])}'}))"/><div><b>${esc(a.name)}</b><div class="muted" style="font-size:12px">${esc(a.about)}</div></div><span class="spacer"></span>${state}</div>
    ${a.last_error ? `<div class="banner red" style="margin-top:10px">⚠️ ${esc(a.last_error)}</div>` : ''}
    ${body}
    <div class="row" style="margin-top:12px">
      ${!a.connected || a.expired ? `<button class="btn gold" data-connect="${a.slug}" ${a.expired ? `data-reauth="${esc(a.auth_id_for_reconnect || '')}"` : ''}><img src="${esc(a.icon)}" alt="" class="btn-ic" onerror="this.remove()"/> ${a.expired ? 'Reconnect' : 'Connect'} ${esc(a.name)}</button>` : `<span class="muted" style="font-size:12px">Connected ${ago(a.connected_at)}${a.connected_by ? ' · ' + esc(a.connected_by) : ''}</span><span class="spacer"></span><button class="btn ghost small" data-disconnect="${a.slug}">Disconnect</button>`}
    </div>
    <div class="integ-out" data-out="${a.slug}"></div>
  </div>`;
}

function wireCard(a) {
  const card = document.querySelector(`.integ[data-app="${a.slug}"]`);
  if (!card) return;
  const out = card.querySelector('[data-out]');
  const c = card.querySelector('[data-connect]');
  if (c) c.onclick = () => openConnect(a.slug, c.dataset.reauth || undefined);
  const d = card.querySelector('[data-disconnect]');
  if (d) d.onclick = async () => {
    if (!confirm(`Disconnect ${a.name}?`)) return;
    await api(`/api/integrations/${a.slug}/disconnect`, { method: 'POST' }); toast('Disconnected'); renderIntegrations();
  };
  card.querySelectorAll('[data-load]').forEach((b) => (b.onclick = async () => {
    const field = b.dataset.load;
    b.disabled = true; b.textContent = '…';
    try {
      let q = `field=${field}`;
      if (field === 'spreadsheet') q += `&search=${encodeURIComponent($('#gs_search').value)}`;
      if (field === 'tab') { const sid = $('#pk_sheet').value; if (!sid) throw new Error('Choose a spreadsheet first'); q += `&spreadsheet=${encodeURIComponent(sid)}`; }
      let r = await api(`/api/integrations/${a.slug}/options?${q}`);
      let opts = r.options || [];
      while (r.paginate && opts.length < 1000 && (field === 'channel' || field === 'me')) { r = await api(`/api/integrations/${a.slug}/options?${q}&paginate=${encodeURIComponent(r.paginate)}`); opts = opts.concat(r.options || []); }
      const sel = { channel: '#pk_channel', me: '#pk_me', spreadsheet: '#pk_sheet', tab: '#pk_tab' }[field];
      const cur = $(sel).value;
      $(sel).innerHTML = `<option value="">— choose (${opts.length}) —</option>` + opts.sort((x, y) => x.label.localeCompare(y.label)).map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      if (r.message) out.innerHTML = `<p class="muted">${esc(r.message)}</p>`;
    } catch (e) { out.innerHTML = `<div class="banner red">${esc(e.message)}</div>`; }
    b.disabled = false; b.textContent = field === 'spreadsheet' ? 'Search' : 'Load list';
  }));
  const save = card.querySelector('[data-save]');
  if (save) save.onclick = async () => {
    const label = (sel) => { const o = $(sel).selectedOptions[0]; return o ? o.textContent.replace(/^[#🔒 ]+/, '') : ''; };
    let body;
    if (a.slug === 'slack') body = { channel_id: $('#pk_channel').value, channel_name: label('#pk_channel'), me_id: $('#pk_me').value, me_name: label('#pk_me'), use_for_slack: $('#sl_use').checked };
    else if (a.slug === 'gmail') body = { manager_email: $('#gm_to').value.trim(), weekly_email: $('#gm_on').checked };
    else body = { spreadsheet_id: $('#pk_sheet').value, spreadsheet_name: label('#pk_sheet'), tab: $('#pk_tab').value, weekly_rows: $('#gs_on').checked };
    try {
      const r = await api(`/api/integrations/${a.slug}/settings`, { method: 'POST', body });
      toast(r.warning ? 'Saved, but: ' + r.warning : 'Saved ✅'); refresh(); renderIntegrations();
    } catch (e) { toast(e.message); }
  };
  const test = card.querySelector('[data-test]');
  if (test) test.onclick = async () => {
    test.disabled = true; const t = test.textContent; test.textContent = 'Testing…';
    try {
      const r = await api(`/api/integrations/${a.slug}/test`, { method: 'POST' });
      const x = r.result || {};
      out.innerHTML = `<div class="banner" style="margin-top:10px">✅ Test passed. ${a.slug === 'gmail' ? 'Email sent to: ' + esc(x.to || '') : a.slug === 'slack' ? 'Check your DMs in Slack.' : `Sheet created: <a href="${esc(x.url || '#')}" target="_blank" rel="noopener">viaSocket test ↗</a>`}</div>`;
    } catch (e) { out.innerHTML = `<div class="banner red" style="margin-top:10px">❌ ${esc(e.message)}</div>`; }
    test.disabled = false; test.textContent = t;
  };
}

// The popup opens straight from the click (token was fetched on page load).
function openConnect(slug, authId) {
  if (!vsInfo) return toast('viaSocket is not ready yet. Refresh the page.');
  if (typeof window.openViasocketConnection !== 'function') return toast('The viaSocket connect script did not load. Refresh the page.');
  const opts = { filteredActions: vsInfo.actions[slug], skipActionSelection: true };
  if (authId) opts.authId = authId;
  window.openViasocketConnection(vsInfo.token, vsInfo.serviceIds[slug], opts);
}

function listenForConnect() {
  if (vsListening) return;
  vsListening = true;
  window.addEventListener('message', async (event) => {
    const d = event.data;
    if (!d || typeof d !== 'object' || !vsInfo) return;
    const slug = Object.keys(vsInfo.serviceIds).find((k) => vsInfo.serviceIds[k] === d.serviceId);
    if (d.type === 'viasocket_connection_success') {
      const app = slug || pendingGuess();
      if (!app) return;
      try {
        await api('/api/integrations/connected', { method: 'POST', body: { app, authId: d.data && d.data.id } });
        toast('Connected ✅ Now fill in the choices below.'); renderIntegrations(); refresh();
      } catch (e) { toast(e.message); }
    } else if (d.type === 'viasocket_connection_error') {
      toast('Could not connect: ' + ((d.error && d.error.message) || 'error'));
    }
  });
}
function pendingGuess() {
  // success messages normally carry serviceId; if not, use the only unconnected card's app
  const cards = [...document.querySelectorAll('.integ [data-connect]')];
  return cards.length === 1 ? cards[0].dataset.connect : null;
}
