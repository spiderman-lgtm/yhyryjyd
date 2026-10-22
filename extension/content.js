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
  </style><div id="app"></div>`;
  const app = root.getElementById('app');

  const COLORS = { Amazon: '#ff9900', Flipkart: '#2874f0', Myntra: '#ff3f6c', AJIO: '#2c4152', Meesho: '#9f2089', Croma: '#12daa8', 'Tata CLiQ': '#da1c5c', 'Reliance Digital': '#e42529', 'Vijay Sales': '#ed1c24', Nykaa: '#fc2779', JioMart: '#0078ad', Zepto: '#5f259f', Blinkit: '#0c831f', Instamart: '#fc8019', BigBasket: '#84c225' };
  const state = { open: true, product: null, data: null, offers: null, error: '', quick: null, quickBusy: false };

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

  function quickHtml() {
    if (state.quickBusy) return '<div class="note">Checking Zepto, Blinkit, Instamart, BigBasket and JioMart at your delivery location… (their pages open briefly in the background)</div>';
    if (!state.quick) return '';
    const label = { none: 'not available near you', location: 'set your delivery location there first', error: 'could not check right now' };
    return (
      '<div class="note">' +
      Object.entries(state.quick)
        .map(([s, v]) => {
          const x = typeof v === 'string' ? { state: v } : v;
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLORS[s] || '#64748b'};margin-right:6px"></span>`;
          if (x.state === 'found') return `<div>${dot}<b>${esc(s)}</b>: <a href="${esc(x.url)}" target="_blank" rel="noopener" style="color:#16a34a;font-weight:700">${inr(x.price)} ›</a></div>`;
          const fix = x.state === 'location' && x.url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener">open ${esc(s)}</a>` : '';
          return `<div>${dot}${esc(s)}: ${label[x.state] || x.state}${fix}</div>`;
        })
        .join('') +
      '</div>'
    );
  }

  function render() {
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
        <div class="sec"><div class="s">Price history</div>${spark(d.history || [], p.price)}</div>
        <div class="sec"><div class="s">Compare prices</div>${offersHtml()}
          <button class="btn ghost" id="quick" ${state.quickBusy ? 'disabled' : ''}>📍 Check nearby: Zepto · Blinkit · Instamart · BigBasket · JioMart</button>${quickHtml()}
        </div>
        <div class="sec" style="border:0">
          <a class="btn primary" href="${esc(d.alert)}" target="_blank" rel="noopener">🔔 Alert me when the price drops</a>
          <a class="btn ghost" href="${esc(d.page)}" target="_blank" rel="noopener">Full price history & coupons</a>
        </div>`
      }
    </div>`;
    root.getElementById('close').onclick = () => {
      state.open = false;
      render();
    };
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
    const { autoOpen = true } = await chrome.storage.local.get('autoOpen');
    state.open = autoOpen;
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
    const c = await send({ type: 'compare', id: r.data.id, title: product.title, price: product.price, store: store.name });
    state.offers = c.ok ? c.data.offers : [];
    render();
    return true;
  }

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
