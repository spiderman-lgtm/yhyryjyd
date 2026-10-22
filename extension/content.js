/* global chrome, DEALRADAR_API */
(function () {
  if (window.__dealradar) return;
  window.__dealradar = true;

  const STORES = {
    'www.amazon.in': { name: 'Amazon', product: () => /\/(dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}/i.test(location.pathname) },
    'www.flipkart.com': { name: 'Flipkart', product: () => /\/p\/itm/.test(location.pathname) },
    'www.myntra.com': { name: 'Myntra', product: () => /\/\d+\/buy\/?$/.test(location.pathname) },
    'www.ajio.com': { name: 'AJIO', product: () => /\/p\//.test(location.pathname) },
    'www.meesho.com': { name: 'Meesho', product: () => /\/p\//.test(location.pathname) },
    'www.croma.com': { name: 'Croma', product: () => /\/p\/\d+/.test(location.pathname) },
    'www.tatacliq.com': { name: 'Tata CLiQ', product: () => /\/p-mp/i.test(location.pathname) },
    'www.reliancedigital.in': { name: 'Reliance Digital', product: () => /\/product\//.test(location.pathname) },
    'www.vijaysales.com': { name: 'Vijay Sales', product: () => /\/p\//.test(location.pathname) },
    'www.nykaa.com': { name: 'Nykaa', product: () => /\/p\/\d+/.test(location.pathname) },
    'www.jiomart.com': { name: 'JioMart', product: () => /\/p\//.test(location.pathname) },
  };
  const store = STORES[location.hostname];
  if (!store) return;

  const num = (s) => {
    const n = Number(String(s || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
  const meta = (p) => document.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.content || null;
  const abs = (u) => (typeof u === 'string' && u ? new URL(u, location.href).href.replace(/^http:/, 'https:') : null);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  function fromJsonLd() {
    const out = {};
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let json;
      try {
        json = JSON.parse(s.textContent);
      } catch {
        continue;
      }
      const nodes = Array.isArray(json) ? json : json['@graph'] || [json];
      for (const n of nodes) {
        const types = [].concat(n?.['@type'] || []);
        if (!types.includes('Product')) continue;
        out.title ||= n.name;
        const imgs = [].concat(n.image || []).map((i) => abs(typeof i === 'string' ? i : i?.url)).filter(Boolean);
        out.images ||= imgs;
        const offer = [].concat(n.offers || [])[0];
        out.price ||= num(offer?.price ?? offer?.lowPrice);
        if (offer?.availability) out.in_stock = !/OutOfStock|SoldOut/i.test(offer.availability);
        if (n.aggregateRating) {
          out.rating ||= num(n.aggregateRating.ratingValue);
          out.reviews ||= num(n.aggregateRating.reviewCount ?? n.aggregateRating.ratingCount);
        }
      }
    }
    return out;
  }

  function extract() {
    const d = fromJsonLd();
    if (store.name === 'Amazon') {
      d.title = text('#productTitle') || d.title;
      d.price =
        num(text('#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen')) ||
        num(text('#corePriceDisplay_desktop_feature_div .a-price .a-offscreen')) ||
        num(text('#corePrice_feature_div .a-offscreen')) ||
        num(text('#apex_desktop .a-price .a-offscreen')) ||
        d.price;
      d.mrp = num(text('#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen')) || num(text('.a-price.a-text-price .a-offscreen'));
      const img = document.querySelector('#landingImage');
      if (img) d.images = [abs(img.getAttribute('data-old-hires') || img.src)].filter(Boolean);
      d.rating ||= num((document.querySelector('#acrPopover')?.getAttribute('title') || '').split(' ')[0]);
      d.reviews ||= num(text('#acrCustomerReviewText'));
      d.in_stock = !/currently unavailable/i.test(text('#availability'));
    }
    if (store.name === 'Myntra') {
      const script = Array.from(document.scripts).find((s) => s.textContent.includes('window.__myx'));
      if (script) {
        try {
          const myx = JSON.parse(script.textContent.slice(script.textContent.indexOf('{')));
          const p = myx.pdpData || {};
          d.title = [p.brand?.name, p.name].filter(Boolean).join(' ') || d.title;
          d.price = num(p.price?.discounted) || d.price;
          d.mrp = num(p.price?.mrp);
          d.images = (p.media?.albums?.[0]?.images || []).map((i) => abs(i.imageURL)).filter(Boolean);
          d.rating = num(p.ratings?.averageRating);
          d.reviews = num(p.ratings?.totalCount);
        } catch {}
      }
      d.title ||= [text('.pdp-title'), text('.pdp-name')].filter(Boolean).join(' ');
      d.price ||= num(text('.pdp-price strong'));
    }
    d.title ||= meta('og:title') || text('h1') || document.title;
    d.price ||= num(meta('product:price:amount'));
    if (!d.price) {
      // Last resort: the first prominent rupee amount on the page.
      const el = Array.from(document.querySelectorAll('h1 ~ * *, main *')).find((e) => e.children.length === 0 && /^₹\s?[\d,]+(\.\d+)?$/.test(e.textContent.trim()));
      d.price = el ? num(el.textContent) : null;
    }
    d.images = (d.images && d.images.length ? d.images : [abs(meta('og:image'))]).filter(Boolean).slice(0, 8);
    return {
      url: location.href.split('#')[0],
      title: String(d.title || '').replace(/\s+/g, ' ').trim(),
      price: d.price,
      mrp: d.mrp && d.price && d.mrp > d.price ? d.mrp : null,
      image: d.images[0] || null,
      images: d.images,
      rating: d.rating && d.rating <= 5 ? d.rating : null,
      reviews: d.reviews || null,
      in_stock: d.in_stock !== false,
    };
  }

  // The delivery pincode this store already shows (Amazon's "Deliver to … 560001", Flipkart's delivery box),
  // so the shopper does not have to type it again.
  function pagePin() {
    const pin = (t) => (String(t || '').match(/\b[1-9]\d{5}\b/) || [])[0] || null;
    for (const sel of ['#glow-ingress-line2', '#contextualIngressPtLabel_deliveryShortLine', '[id*="pincode" i]', '[class*="pincode" i]']) {
      for (const el of document.querySelectorAll(sel)) {
        const p = pin(el.textContent) || pin(el.value);
        if (p) return p;
      }
    }
    const m = document.body.innerText.slice(0, 30000).match(/deliver(?:y|ing)?\s*(?:to|at|by)?\b[^\d\n₹]{0,40}?\b([1-9]\d{5})\b/i);
    return m ? m[1] : null;
  }

  const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: 'No reply' })));

  // ---------- panel ----------
  const host = document.createElement('div');
  host.id = 'dealradar-root';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Inter, Segoe UI, Arial, sans-serif; }
    .pill { display:flex; align-items:center; gap:8px; background:linear-gradient(135deg,#f97316,#ec4899); color:#fff; border:0; border-radius:999px; padding:10px 14px; font-weight:800; font-size:14px; cursor:pointer; box-shadow:0 10px 30px rgba(234,88,12,.35); }
    .card { width:340px; max-height:78vh; overflow:auto; background:#fff; color:#0f172a; border-radius:18px; box-shadow:0 20px 50px rgba(15,23,42,.25); border:1px solid #e2e8f0; animation:in .35s cubic-bezier(.22,1,.36,1); }
    @keyframes in { from { opacity:0; transform:translateY(16px) scale(.97);} to { opacity:1; transform:none; } }
    .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:linear-gradient(135deg,#fff7ed,#fdf2f8); border-bottom:1px solid #fde2cf; }
    .logo { display:flex; align-items:center; gap:8px; font-weight:900; font-size:15px; }
    .logo b { display:grid; place-items:center; width:26px; height:26px; border-radius:8px; color:#fff; background:linear-gradient(135deg,#f97316,#ec4899); }
    .x { border:0; background:transparent; font-size:20px; cursor:pointer; color:#64748b; }
    .sec { padding:12px 14px; border-bottom:1px solid #f1f5f9; }
    .price { font-size:26px; font-weight:900; }
    .muted { color:#64748b; font-size:12px; }
    .row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .verdict { font-weight:900; color:#fff; border-radius:8px; padding:4px 10px; font-size:14px; }
    .buy { background:#16a34a; } .okay { background:#f59e0b; } .skip { background:#dc2626; }
    .flag { margin-top:6px; background:#fef2f2; color:#b91c1c; border-radius:8px; padding:6px 8px; font-size:12px; font-weight:600; }
    .offer { display:flex; align-items:center; gap:8px; padding:7px 8px; border-radius:10px; text-decoration:none; color:inherit; border:1px solid #e2e8f0; margin-top:6px; }
    .offer:hover { box-shadow:0 4px 12px rgba(0,0,0,.08); }
    .offer.low { border-color:#86efac; background:#f0fdf4; }
    .chip { display:grid; place-items:center; width:24px; height:24px; border-radius:7px; color:#fff; font-weight:900; font-size:12px; flex-shrink:0; }
    .grow { flex:1; min-width:0; }
    .s { font-weight:700; font-size:13px; } .p { font-weight:800; font-size:14px; }
    .btn { display:block; width:100%; text-align:center; border:0; border-radius:10px; padding:10px; font-weight:800; font-size:13px; cursor:pointer; text-decoration:none; margin-top:8px; }
    .primary { background:#ea580c; color:#fff; } .ghost { background:#f1f5f9; color:#0f172a; }
    .skel { height:14px; border-radius:6px; background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9); background-size:200% 100%; animation:sh 1.2s infinite; margin-top:8px; }
    @keyframes sh { to { background-position:-200% 0; } }
    svg { display:block; width:100%; height:64px; }
    .note { font-size:11px; color:#64748b; margin-top:6px; }
    .err { color:#b91c1c; font-size:13px; }
    .note a, .row a { color:#ea580c; font-weight:700; text-decoration:none; }
    .ah { display:flex; align-items:center; justify-content:space-between; margin:-12px -14px 10px; padding:10px 14px; background:#fff7ed; color:#c2410c; font-weight:900; font-size:15px; text-decoration:none; }
    .ah span { font-size:18px; color:#64748b; }
    .ask { border:1px solid #e2e8f0; border-radius:14px; padding:12px; animation:in .3s cubic-bezier(.22,1,.36,1); }
    .ask h4 { margin:0; font-size:15px; font-weight:900; }
    .pr { display:flex; gap:10px; margin-top:10px; }
    .pr img, .pr .ph { width:72px; height:72px; flex-shrink:0; border:1px solid #e2e8f0; border-radius:10px; object-fit:contain; background:#fff; }
    .t2 { font-size:12.5px; color:#334155; line-height:1.35; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-top:4px; }
    .field { width:100%; border:1px solid #cbd5e1; border-radius:10px; padding:8px 10px; font-size:13px; margin-top:6px; outline:none; }
    .field:focus { border-color:#ea580c; }
    .tick { display:flex; align-items:center; gap:6px; font-size:12.5px; margin-top:8px; }
    .ok { margin-top:8px; background:#f0fdf4; color:#15803d; border-radius:10px; padding:8px 10px; font-size:12.5px; font-weight:700; }
    .al { display:flex; align-items:center; gap:8px; padding:7px 0; border-top:1px solid #f1f5f9; }
    .al img { width:38px; height:38px; border-radius:8px; object-fit:contain; border:1px solid #e2e8f0; background:#fff; flex-shrink:0; }
    .al a { color:inherit; text-decoration:none; }
    .stop { border:0; background:#f1f5f9; color:#475569; border-radius:8px; padding:5px 8px; font-size:11px; font-weight:700; cursor:pointer; }
    .empty { text-align:center; padding:14px 6px 4px; }
    .empty svg { width:44px; height:44px; margin:0 auto 6px; }
  </style><div id="app"></div>`;
  const app = root.getElementById('app');

  const COLORS = { Amazon: '#ff9900', Flipkart: '#2874f0', Myntra: '#ff3f6c', AJIO: '#2c4152', Meesho: '#9f2089', Croma: '#12daa8', 'Tata CLiQ': '#da1c5c', 'Reliance Digital': '#e42529', 'Vijay Sales': '#ed1c24', Nykaa: '#fc2779', JioMart: '#0078ad', Zepto: '#5f259f', Blinkit: '#0c831f', Instamart: '#fc8019', BigBasket: '#84c225' };
  const state = { open: true, product: null, data: null, offers: null, error: '', quick: null, quickBusy: false };
  // Price alerts, set from the panel without leaving the store. contact is where the last alert went.
  const al = { list: null, contact: null, mode: 'ask', msg: '', err: '', tg: null };
  // The DealRadar delivery location, shared with the website; nearby stores are checked there.
  const loc = { pin: null, area: null, editing: false, busy: false, err: '' };

  function spark(history, current) {
    const pts = history.concat([{ p: current, t: Date.now() }]);
    if (pts.length < 3) return '<div class="muted">Price history starts today — DealRadar records it from now on.</div>';
    const W = 300, H = 60;
    const ps = pts.map((x) => x.p);
    const min = Math.min(...ps), max = Math.max(...ps);
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
    const x = (t) => ((t - t0) / Math.max(t1 - t0, 1)) * W;
    const y = (v) => (max === min ? H / 2 : 6 + (1 - (v - min) / (max - min)) * (H - 12));
    let d = `M${x(pts[0].t)},${y(pts[0].p)}`;
    for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t)} V${y(pts[i].p)}`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d} V${H} H0 Z" fill="#fed7aa" opacity=".5"/><path d="${d}" fill="none" stroke="#ea580c" stroke-width="2"/></svg>
      <div class="row muted"><span>Low ${inr(min)}</span><span>High ${inr(max)}</span></div>`;
  }

  function offersHtml() {
    const p = state.product;
    if (state.offers === null) return '<div class="skel"></div><div class="skel" style="width:70%"></div><div class="note">Searching Amazon, Flipkart, Croma, Reliance, Myntra…</div>';
    const rows = [{ store: store.name, price: p.price, href: p.url, here: true }]
      .concat(
        state.offers
          .map((o, i) => ({ ...o, i }))
          .filter((o) => o.in_stock && o.store !== store.name)
          .map((o) => ({ store: o.store, price: o.price, href: `${DEALRADAR_API}/api/buy/${state.data.id}?o=${o.i}`, variant: !o.same_variant })),
      )
      .sort((a, b) => a.price - b.price);
    const low = rows[0];
    return (
      rows
        .slice(0, 5)
        .map(
          (r) => `<a class="offer ${r === low && rows.length > 1 ? 'low' : ''}" href="${esc(r.href)}" target="_blank" rel="noopener">
        <span class="chip" style="background:${COLORS[r.store] || '#64748b'}">${esc(r.store[0])}</span>
        <span class="grow"><span class="s">${esc(r.store)}</span><div class="muted">${r === low && rows.length > 1 ? 'Lowest price' : r.here ? 'This page' : inr(r.price - low.price) + ' more'}${r.variant ? ' · other variant' : ''}</div></span>
        <span class="p" style="color:${r === low && rows.length > 1 ? '#16a34a' : '#0f172a'}">${inr(r.price)}</span></a>`,
        )
        .join('') + (rows.length > 5 ? `<div class="note">Showing the 5 lowest of ${rows.length} stores.</div>` : '')
    );
  }

  function locationHtml() {
    if (loc.editing || !loc.pin)
      return `<div class="row" style="margin-top:8px;gap:6px"><span>📍</span>
        <input class="field" id="loc-pin" inputmode="numeric" maxlength="6" placeholder="Your delivery pincode" value="${esc(loc.draft ?? loc.pin ?? '')}" style="margin:0;flex:1" />
        <button class="stop" id="loc-save" style="padding:8px 10px">${loc.busy ? '…' : 'Save'}</button></div>
        ${loc.err ? `<div class="err" style="font-size:12px;margin-top:4px">${esc(loc.err)}</div>` : '<div class="note">Set once: used here and on dealradar.embarko.app.</div>'}`;
    return `<div class="row note" style="margin-top:8px"><span>📍 Delivering to <b>${esc(loc.pin)}</b>${loc.area ? ' · ' + esc(loc.area.split(',')[0]) : ''}${
      loc.from ? ` <span class="muted">(from ${esc(loc.from)})</span>` : ''
    }</span><a href="#" id="loc-change">Change</a></div>${
      loc.suggest ? `<div class="note">${esc(store.name)} delivers to ${esc(loc.suggest)} · <a href="#" id="loc-use">Use ${esc(loc.suggest)}</a></div>` : ''
    }`;
  }

  async function saveLocation() {
    const pin = root.getElementById('loc-pin').value.replace(/\D/g, '');
    if (pin.length !== 6) {
      loc.err = 'Enter a 6-digit pincode.';
      return render();
    }
    loc.busy = true;
    loc.err = '';
    render();
    const r = await send({ type: 'setLocation', pin });
    loc.busy = false;
    if (!r.ok) loc.err = r.error;
    else Object.assign(loc, { pin: r.data.pin, area: r.data.area, editing: false, from: null, suggest: null, draft: undefined });
    state.quick = null;
    render();
  }

  function quickHtml() {
    if (state.quickBusy)
      return '<div class="note">Checking Zepto, Blinkit, Instamart, BigBasket and JioMart at your delivery location… their pages open for a few seconds in the background.</div>';
    if (!state.quick) return '';
    const why = {
      none: (x) => `not sold near you${x.seen ? ` (${x.seen} items checked)` : ''}`,
      empty: () => 'showed no products — open it once and set your location',
      location: () => 'set your delivery location there first',
      error: () => 'could not open it right now',
    };
    return Object.entries(state.quick)
      .map(([s, v]) => {
        const x = typeof v === 'string' ? { state: v } : v;
        const chip = `<span class="chip" style="background:${COLORS[s] || '#64748b'}">${esc(s[0])}</span>`;
        if (x.state === 'found')
          return `<a class="offer" href="${esc(x.url)}" target="_blank" rel="noopener">${chip}<span class="grow"><span class="s">${esc(s)}</span><div class="muted">Near you</div></span><span class="p" style="color:#16a34a">${inr(x.price)}</span></a>`;
        const fix = x.state !== 'none' && x.url ? `<a class="stop" style="text-decoration:none" href="${esc(x.url)}" target="_blank" rel="noopener">Open ${esc(s)}</a>` : '';
        return `<div class="offer" style="opacity:${x.state === 'none' ? 0.7 : 1}">${chip}<span class="grow"><span class="s">${esc(s)}</span><div class="muted">${(why[x.state] || (() => x.state))(x)}</div></span>${fix}</div>`;
      })
      .join('');
  }

  const BELL = '<svg viewBox="0 0 24 24" fill="#ea580c"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>';
  const where = (c) => [c.email && 'Email', c.phone && 'WhatsApp', c.telegram && 'Telegram'].filter(Boolean).join(' · ');

  function alertsHtml() {
    const p = state.product;
    const d = state.data;
    const active = (al.list || []).filter((a) => a.status === 'active');
    const mine = active.find((a) => a.product_id === d.id);
    const c = (al.mode === 'form' && al.draft) || al.contact || {};
    let card = '';
    if (al.mode === 'done' || mine) {
      card = `<div class="ok">✓ ${al.msg ? esc(al.msg) : 'You are tracking this price. We will message you when it drops.'}</div>${
        al.tg ? `<a class="btn ghost" href="${esc(al.tg)}" target="_blank" rel="noopener">Open Telegram and press Start to get alerts there</a>` : ''
      }`;
    } else if (al.mode !== 'dismissed') {
      const form =
        al.mode === 'form'
          ? `<input class="field" id="al-email" type="email" placeholder="Email" value="${esc(c.email || '')}" />
             <input class="field" id="al-phone" type="tel" placeholder="WhatsApp number (optional)" value="${esc(c.phone || '')}" />
             <label class="tick"><input type="checkbox" id="al-tg" ${c.telegram ? 'checked' : ''} /> Also on Telegram</label>`
          : '';
      const known = al.mode !== 'form' && where(c);
      card = `<div class="ask">
        <div class="row"><h4>Do you want to set price alert?</h4><button class="x" id="al-x" title="Not now">×</button></div>
        <div class="pr">${p.image ? `<img src="${esc(p.image)}" alt="" />` : '<span class="ph"></span>'}
          <div class="grow"><span class="chip" style="background:${COLORS[store.name] || '#64748b'};width:20px;height:20px;font-size:11px">${esc(store.name[0])}</span>
            <div class="t2">${esc(p.title)}</div><div class="p" style="margin-top:4px">${inr(p.price)}</div></div></div>
        ${form}
        ${al.err ? `<div class="err" style="margin-top:6px">${esc(al.err)}</div>` : ''}
        <button class="btn primary" id="al-set" ${al.mode === 'busy' ? 'disabled' : ''}>${al.mode === 'busy' ? 'Setting alert…' : 'Set price alert'}</button>
        ${known ? `<div class="note">Alerts go to ${esc(known)} · <a href="#" id="al-change">change</a></div>` : ''}
      </div>`;
    }
    const list = active.length
      ? active
          .slice(0, 4)
          .map(
            (a) => `<div class="al">${a.product?.image ? `<img src="${esc(a.product.image)}" alt="" />` : ''}
            <a class="grow" href="${esc(a.product?.page || DEALRADAR_API + '/alerts')}" target="_blank" rel="noopener"><div class="t2" style="margin:0;-webkit-line-clamp:1">${esc(a.product?.title || 'Product')}</div>
            <div class="muted">${a.product ? inr(a.product.price) + ' · ' : ''}${esc(a.product?.store || '')} · till ${new Date(a.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div></a>
            <button class="stop" data-stop="${esc(a.id)}">Stop</button></div>`,
          )
          .join('') + (active.length > 4 ? `<div class="note">+${active.length - 4} more under Price Alerts</div>` : '')
      : al.list
        ? `<div class="empty">${BELL}<div class="s">No Price Alerts Yet</div><div class="muted">Set an alert and we will message you as soon as the price drops.</div></div>`
        : '<div class="skel"></div>';
    return `<a class="ah" href="${DEALRADAR_API}/alerts" target="_blank" rel="noopener">Price Alerts <span>→</span></a>${card}<div style="margin-top:10px">${list}</div>`;
  }

  async function loadAlerts() {
    const r = await send({ type: 'alerts' });
    al.list = r.ok ? r.data.alerts || [] : [];
    al.contact = r.ok ? r.data.contact : al.contact;
    render();
  }

  async function setAlert() {
    let c = al.contact || {};
    if (al.mode === 'form') {
      c = { email: root.getElementById('al-email').value.trim(), phone: root.getElementById('al-phone').value.trim(), telegram: root.getElementById('al-tg').checked };
    } else if (!where(c)) {
      al.mode = 'form';
      render();
      return;
    }
    if (!c.email && !c.phone && !c.telegram) {
      al.err = 'Add an email or WhatsApp number, or tick Telegram.';
      render();
      return;
    }
    al.mode = 'busy';
    al.err = '';
    render();
    const r = await send({ type: 'setAlert', alert: { product_id: state.data.id, email: c.email || '', phone: c.phone || '', telegram: !!c.telegram, drop_percent: 0, window_days: 7 } });
    if (!r.ok) {
      al.mode = /already tracking/i.test(r.error) ? 'done' : 'form';
      al.err = /already tracking/i.test(r.error) ? '' : r.error;
      al.msg = /already tracking/i.test(r.error) ? 'You are already tracking this price.' : '';
      render();
      return;
    }
    al.contact = c;
    al.draft = null;
    al.mode = 'done';
    al.msg = `Price alert set! We will message you on ${where(c)} when the price drops.`;
    al.tg = r.data.telegram_link || null;
    await loadAlerts();
  }

  function bindAlerts() {
    const on = (id, fn) => {
      const el = root.getElementById(id);
      if (el) el.onclick = fn;
    };
    on('al-set', () => setAlert());
    on('al-x', () => {
      al.mode = 'dismissed';
      render();
    });
    on('al-change', (e) => {
      e.preventDefault();
      al.mode = 'form';
      render();
    });
    root.querySelectorAll('[data-stop]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        const r = await send({ type: 'stopAlert', id: b.getAttribute('data-stop') });
        if (r.ok && r.data.alert && r.data.alert.product_id === state.data.id) {
          al.mode = 'ask';
          al.msg = '';
          al.tg = null;
        }
        await loadAlerts();
      };
    });
  }

  function render() {
    // The panel is redrawn as results arrive; keep what the shopper is typing into the alert form.
    const typing = root.getElementById('al-email');
    if (typing) al.draft = { email: typing.value, phone: root.getElementById('al-phone').value, telegram: root.getElementById('al-tg').checked };
    const pinTyping = root.getElementById('loc-pin');
    if (pinTyping) loc.draft = pinTyping.value;
    const focused = root.activeElement && root.activeElement.id;
    if (!state.open) {
      const score = state.data?.deal?.score;
      app.innerHTML = `<button class="pill" id="open">₹ DealRadar${score != null ? ' · ' + score : ''}</button>`;
      root.getElementById('open').onclick = () => {
        state.open = true;
        render();
      };
      return;
    }
    const p = state.product;
    const d = state.data;
    const verdict = d?.deal ? { buy: ['BUY', 'buy'], okay: ['OKAY', 'okay'], skip: ['SKIP', 'skip'] }[d.deal.action] : null;
    app.innerHTML = `<div class="card">
      <div class="head"><div class="logo"><b>₹</b>DealRadar</div><button class="x" id="close" title="Minimise">–</button></div>
      ${
        state.error
          ? `<div class="sec err">${esc(state.error)}</div>`
          : !d
            ? `<div class="sec"><div class="skel"></div><div class="skel" style="width:60%"></div></div>`
            : `<div class="sec">
          <div class="row"><div><div class="price">${inr(p.price)}</div><div class="muted">on ${esc(store.name)}${d.watchers ? ` · ${d.watchers} watching` : ''}</div></div>
          ${verdict ? `<div style="text-align:right"><span class="verdict ${verdict[1]}">${verdict[0]}</span><div class="muted">Deal Score ${d.deal.score}</div></div>` : '<div class="muted" style="text-align:right">Deal Score<br/>needs a few days</div>'}</div>
          ${(d.deal?.flags || []).map((f) => `<div class="flag">⚠ ${esc(f)}</div>`).join('')}
        </div>
        <div class="sec">${alertsHtml()}</div>
        <div class="sec"><div class="s">Price history</div>${spark(d.history || [], p.price)}</div>
        <div class="sec"><div class="s">Compare prices</div>${offersHtml()}
          ${locationHtml()}
          <button class="btn ghost" id="quick" ${state.quickBusy || !loc.pin ? 'disabled' : ''}>📍 Check nearby: Zepto · Blinkit · Instamart · BigBasket · JioMart</button>${quickHtml()}
        </div>
        <div class="sec" style="border:0">
          <a class="btn ghost" href="${esc(d.page)}" target="_blank" rel="noopener">Full price history & coupons</a>
        </div>`
      }
    </div>`;
    root.getElementById('close').onclick = () => {
      state.open = false;
      render();
    };
    if (d && !state.error) {
      bindAlerts();
      const save = root.getElementById('loc-save');
      if (save) save.onclick = () => saveLocation();
      const pinInput = root.getElementById('loc-pin');
      if (pinInput) pinInput.onkeydown = (e) => e.key === 'Enter' && saveLocation();
      const use = root.getElementById('loc-use');
      if (use)
        use.onclick = async (e) => {
          e.preventDefault();
          const r = await send({ type: 'setLocation', pin: loc.suggest });
          if (r.ok) Object.assign(loc, { pin: r.data.pin, area: r.data.area, from: store.name, suggest: null });
          state.quick = null;
          render();
        };
      const change = root.getElementById('loc-change');
      if (change)
        change.onclick = (e) => {
          e.preventDefault();
          loc.editing = true;
          render();
        };
    }
    const again = focused && root.getElementById(focused);
    if (again && again.focus) again.focus();
    const q = root.getElementById('quick');
    if (q)
      q.onclick = async () => {
        state.quickBusy = true;
        render();
        const r = await send({ type: 'quick', id: d.id, title: p.title, price: p.price });
        state.quickBusy = false;
        if (r.ok) {
          state.quick = r.data.status;
          if (r.data.offers) state.offers = r.data.offers;
        } else state.quick = { Zepto: 'error', Blinkit: 'error', Instamart: 'error', BigBasket: 'error', JioMart: 'error' };
        render();
      };
  }

  async function run() {
    if (!store.product()) {
      host.remove();
      return true;
    }
    const product = extract();
    if (!product.title || !product.price) return false; // page still loading; the next check retries
    state.product = product;
    state.data = null;
    state.offers = null;
    state.error = '';
    state.quick = null;
    al.mode = 'ask';
    al.msg = '';
    al.err = '';
    al.tg = null;
    loc.suggest = null;
    loc.from = null;
    const { autoOpen = true } = await chrome.storage.local.get('autoOpen');
    state.open = autoOpen || forceOpen;
    if (!host.isConnected) document.documentElement.appendChild(host);
    render();
    const r = await send({ type: 'lookup', page: product });
    if (!r.ok) {
      state.error = r.error;
      render();
      return true;
    }
    state.data = r.data;
    render();
    loadAlerts();
    send({ type: 'getLocation' }).then(async (l) => {
      if (l.ok) Object.assign(loc, { pin: l.data.pin, area: l.data.area });
      const here = pagePin();
      if (here && !loc.pin) {
        // No DealRadar location yet: use the one this store already has.
        const r = await send({ type: 'setLocation', pin: here });
        if (r.ok) Object.assign(loc, { pin: r.data.pin, area: r.data.area, from: store.name });
      } else if (here && here !== loc.pin) loc.suggest = here;
      render();
    });
    const c = await send({ type: 'compare', id: r.data.id, title: product.title, price: product.price, store: store.name });
    state.offers = c.ok ? c.data.offers : [];
    render();
    return true;
  }

  // Clicking the DealRadar toolbar icon on a product page opens the panel here, even if it was minimised.
  let forceOpen = false;
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type !== 'openPanel') return false;
    if (!store.product()) {
      reply({ ok: false });
      return false;
    }
    forceOpen = true;
    state.open = true;
    if (host.isConnected) render();
    else done = ''; // not shown yet: the next check builds it, open
    reply({ ok: true });
    return false;
  });

  // Flipkart and Myntra change pages without reloading, so the URL is watched.
  let done = '';
  let busy = false;
  let tries = 0;
  let current = '';
  setInterval(async () => {
    const here = location.href.split('#')[0];
    if (busy || here === done) return;
    if (here !== current) {
      current = here;
      tries = 0;
    }
    busy = true;
    try {
      if (await run()) {
        done = here;
        tries = 0;
      } else if (++tries > 20) done = here; // never found a price on this page
    } finally {
      busy = false;
    }
  }, 1500);
})();
