/* 🔌 Integrations: lead connects Slack / Gmail / Google Sheets through viaSocket, then picks
   channel, "main kaun hoon", manager email, spreadsheet - once. SquadForge does the rest. */

let vsInfo = null; // { token, serviceIds, actions } - embed token is the only viaSocket value the browser holds
let vsListening = false;

async function renderIntegrations() {
  $('#view').innerHTML = `<h2>🔌 Integrations</h2><div class="empty">Load ho raha hai…</div>`;
  let st;
  try { st = await api('/api/integrations'); } catch (e) { $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (st.configured && !vsInfo) { try { vsInfo = await api('/api/integrations/connect-info'); } catch (e) { toast(e.message); } }
  listenForConnect();
  $('#view').innerHTML = `
    <div class="row" style="margin-bottom:6px"><h2 style="margin:0">🔌 Integrations</h2><span class="spacer"></span><span class="muted" style="font-size:12px">viaSocket se — 2,300+ apps</span></div>
    <p class="muted" style="margin-top:0">Ek baar <b>Connect</b> dabao aur apna account chuno. Login aur tokens viaSocket sambhalta hai; SquadForge sirf aapke chune hue kaam karta hai.</p>
    ${st.configured ? '' : '<div class="banner red">viaSocket keys server pe set nahi hain (VIASOCKET_ORG_ID, VIASOCKET_PROJECT_ID, VIASOCKET_EMBED_SECRET).</div>'}
    <div class="grid integ-grid">${st.apps.map(appCard).join('')}</div>
    <div class="card" style="margin-top:16px"><h3>➕ Aur apps</h3><p class="muted" style="margin:0">Jira, ClickUp, Trello, Notion, HubSpot… jo bhi chahiye bataiye. Client request aate hi wahan task banana, ya complete hone pe update karna, isi tarah juda jayega.</p></div>`;
  st.apps.forEach(wireCard);
}

function appCard(a) {
  const state = a.expired ? '<span class="pill stuck">expired</span>' : a.connected ? '<span class="pill completed">connected</span>' : '<span class="pill">not connected</span>';
  const s = a.settings || {};
  let body = '';
  if (a.connected && !a.expired) {
    if (a.slug === 'slack') {
      body = `
        <label>Team channel (yahan se updates padhe jayenge)</label>
        <div class="picker" data-pick="channel" data-app="slack"><select id="pk_channel"><option value="${esc(s.channel_id || '')}">${esc(s.channel_name || '— chuno —')}</option></select><button class="btn ghost small" data-load="channel">List lao</button></div>
        <label>Main kaun hoon (7 PM alert aur reports ka DM)</label>
        <div class="picker" data-pick="me" data-app="slack"><select id="pk_me"><option value="${esc(s.me_id || '')}">${esc(s.me_name || '— chuno —')}</option></select><button class="btn ghost small" data-load="me">List lao</button></div>
        <label class="check"><input type="checkbox" id="sl_use" ${s.use_for_slack !== false ? 'checked' : ''}/> SquadForge Slack isi connection se chalaye (bot token ki zaroorat nahi)</label>
        <div class="row" style="margin-top:8px"><button class="btn" data-save="slack">Save</button><button class="btn ghost" data-test="slack">🧪 Mujhe test DM bhejo</button></div>`;
    } else if (a.slug === 'gmail') {
      body = `
        <label>Manager ka email (Monday report yahan jayegi)</label>
        <input id="gm_to" type="email" value="${esc(s.manager_email || '')}" placeholder="manager@company.com"/>
        <label class="check"><input type="checkbox" id="gm_on" ${s.weekly_email !== false ? 'checked' : ''}/> Har Monday weekly report email karo</label>
        <div class="row" style="margin-top:8px"><button class="btn" data-save="gmail">Save</button><button class="btn ghost" data-test="gmail">🧪 Mujhe test email bhejo</button></div>`;
    } else {
      body = `
        <label>Spreadsheet</label>
        <div class="picker"><input id="gs_search" placeholder="naam se dhundho…" style="flex:1"/><button class="btn ghost small" data-load="spreadsheet">Dhundho</button></div>
        <select id="pk_sheet" style="margin-top:6px"><option value="${esc(s.spreadsheet_id || '')}">${esc(s.spreadsheet_name || '— chuno —')}</option></select>
        <label>Sheet (tab)</label>
        <div class="picker"><select id="pk_tab"><option value="${esc(s.tab || '')}">${esc(s.tab || '— pehle spreadsheet chuno —')}</option></select><button class="btn ghost small" data-load="tab">List lao</button></div>
        <label class="check"><input type="checkbox" id="gs_on" ${s.weekly_rows !== false ? 'checked' : ''}/> Har Monday har member ki ek row add karo</label>
        <div class="row" style="margin-top:8px"><button class="btn" data-save="google-sheets">Save</button><button class="btn ghost" data-test="google-sheets">🧪 "viaSocket test" sheet banao</button></div>`;
    }
  }
  return `<div class="card integ" data-app="${a.slug}">
    <div class="row"><img src="${esc(a.icon)}" alt="" class="app-ic" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'app-ic app-ic-fb',textContent:'${esc(a.name[0])}'}))"/><div><b>${esc(a.name)}</b><div class="muted" style="font-size:12px">${esc(a.about)}</div></div><span class="spacer"></span>${state}</div>
    ${a.last_error ? `<div class="banner red" style="margin-top:10px">⚠️ ${esc(a.last_error)}</div>` : ''}
    ${body}
    <div class="row" style="margin-top:12px">
      ${!a.connected || a.expired ? `<button class="btn gold" data-connect="${a.slug}" ${a.expired ? `data-reauth="${esc(a.auth_id_for_reconnect || '')}"` : ''}><img src="${esc(a.icon)}" alt="" class="btn-ic" onerror="this.remove()"/> ${a.expired ? 'Reconnect' : 'Connect'} ${esc(a.name)}</button>` : `<span class="muted" style="font-size:12px">Connected ${ago(a.connected_at)}</span><span class="spacer"></span><button class="btn ghost small" data-disconnect="${a.slug}">Disconnect</button>`}
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
    if (!confirm(`${a.name} disconnect karna hai?`)) return;
    await api(`/api/integrations/${a.slug}/disconnect`, { method: 'POST' }); toast('Disconnect ho gaya'); renderIntegrations();
  };
  card.querySelectorAll('[data-load]').forEach((b) => (b.onclick = async () => {
    const field = b.dataset.load;
    b.disabled = true; b.textContent = '…';
    try {
      let q = `field=${field}`;
      if (field === 'spreadsheet') q += `&search=${encodeURIComponent($('#gs_search').value)}`;
      if (field === 'tab') { const sid = $('#pk_sheet').value; if (!sid) throw new Error('Pehle spreadsheet chuno'); q += `&spreadsheet=${encodeURIComponent(sid)}`; }
      let r = await api(`/api/integrations/${a.slug}/options?${q}`);
      let opts = r.options || [];
      while (r.paginate && opts.length < 1000 && (field === 'channel' || field === 'me')) { r = await api(`/api/integrations/${a.slug}/options?${q}&paginate=${encodeURIComponent(r.paginate)}`); opts = opts.concat(r.options || []); }
      const sel = { channel: '#pk_channel', me: '#pk_me', spreadsheet: '#pk_sheet', tab: '#pk_tab' }[field];
      const cur = $(sel).value;
      $(sel).innerHTML = `<option value="">— chuno (${opts.length}) —</option>` + opts.sort((x, y) => x.label.localeCompare(y.label)).map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      if (r.message) out.innerHTML = `<p class="muted">${esc(r.message)}</p>`;
    } catch (e) { out.innerHTML = `<div class="banner red">${esc(e.message)}</div>`; }
    b.disabled = false; b.textContent = field === 'spreadsheet' ? 'Dhundho' : 'List lao';
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
      toast(r.warning ? 'Save hua, lekin: ' + r.warning : 'Save ho gaya ✅'); refresh(); renderIntegrations();
    } catch (e) { toast(e.message); }
  };
  const test = card.querySelector('[data-test]');
  if (test) test.onclick = async () => {
    test.disabled = true; const t = test.textContent; test.textContent = 'Test chal raha hai…';
    try {
      const r = await api(`/api/integrations/${a.slug}/test`, { method: 'POST' });
      const x = r.result || {};
      out.innerHTML = `<div class="banner" style="margin-top:10px">✅ Test pass. ${a.slug === 'gmail' ? 'Email gaya: ' + esc(x.to || '') : a.slug === 'slack' ? 'Slack mein apna DM dekho.' : `Sheet bani: <a href="${esc(x.url || '#')}" target="_blank" rel="noopener">viaSocket test ↗</a>`}</div>`;
    } catch (e) { out.innerHTML = `<div class="banner red" style="margin-top:10px">❌ ${esc(e.message)}</div>`; }
    test.disabled = false; test.textContent = t;
  };
}

// The popup opens straight from the click (token was fetched on page load).
function openConnect(slug, authId) {
  if (!vsInfo) return toast('viaSocket abhi taiyaar nahi — page refresh karo');
  if (typeof window.openViasocketConnection !== 'function') return toast('viaSocket connect script load nahi hui — page refresh karo');
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
        toast('Connect ho gaya ✅ — ab neeche choices bharo'); renderIntegrations(); refresh();
      } catch (e) { toast(e.message); }
    } else if (d.type === 'viasocket_connection_error') {
      toast('Connect nahi hua: ' + ((d.error && d.error.message) || 'error'));
    }
  });
}
function pendingGuess() {
  // success messages normally carry serviceId; if not, use the only unconnected card's app
  const cards = [...document.querySelectorAll('.integ [data-connect]')];
  return cards.length === 1 ? cards[0].dataset.connect : null;
}
