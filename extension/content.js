/* global chrome, DEALRADAR_API */
(function () {
  if (window.__dealradar) return;
  window.__dealradar = true;

  const meta = (p) => document.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.content || null;

  // Product data the page itself publishes; used to recognise product pages on any store.
  function jsonLdProducts() {
    const out = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let json;
      try {
        json = JSON.parse(s.textContent);
      } catch {
        continue;
      }
      for (const n of Array.isArray(json) ? json : json['@graph'] || [json]) if ([].concat(n?.['@type'] || []).includes('Product')) out.push(n);
    }
    return out;
  }
  const looksLikeProduct = () => jsonLdProducts().length > 0 || meta('og:type') === 'product' || !!meta('product:price:amount');

  const KNOWN = {
    'www.amazon.in': { name: 'Amazon', product: () => /\/(dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}/i.test(location.pathname) },
    'www.flipkart.com': { name: 'Flipkart', product: () => /\/p\/itm/.test(location.pathname) },
    'www.myntra.com': { name: 'Myntra', product: () => /\/\d+\/buy\/?$/.test(location.pathname) },
    'www.ajio.com': { name: 'AJIO', product: () => /\/p\//.test(location.pathname) },
    'www.meesho.com': { name: 'Meesho', product: () => /\/p\//.test(location.pathname) },
    'www.croma.com': { name: 'Croma', product: () => /\/p\/\d+/.test(location.pathname) },
    'www.tatacliq.com': { name: 'Tata CLiQ', product: () => /\/p-mp/i.test(location.pathname) },
    'www.reliancedigital.in': { name: 'Reliance Digital', product: () => /\/product\//.test(location.pathname) },
    'www.nykaa.com': { name: 'Nykaa', product: () => /\/p\/\d+/.test(location.pathname) },
    'www.jiomart.com': { name: 'JioMart', product: () => /\/p\//.test(location.pathname) },
    'www.zeptonow.com': { name: 'Zepto' },
    'www.zepto.com': { name: 'Zepto' },
    'blinkit.com': { name: 'Blinkit' },
    'www.swiggy.com': { name: 'Instamart' },
    'www.bigbasket.com': { name: 'BigBasket' },
    'www.nykaafashion.com': { name: 'Nykaa Fashion' },
  };
  // Any other store works too when the toolbar icon is clicked on one of its product pages.
  const known = KNOWN[location.hostname];
  const siteName = () => {
    const n = meta('og:site_name') || location.hostname.replace(/^www\./, '').split('.')[0];
    return n.charAt(0).toUpperCase() + n.slice(1);
  };
  const store = { name: known ? known.name : siteName(), product: known?.product || looksLikeProduct };

  const num = (s) => {
    const n = Number(String(s ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
  // The first element of a selector that holds a number: some stores leave the first one empty.
  const firstNum = (sel) => {
    for (const el of document.querySelectorAll(sel)) {
      const n = num(el.textContent);
      if (n) return n;
    }
    return null;
  };
  const abs = (u) => (typeof u === 'string' && u ? new URL(u, location.href).href.replace(/^http:/, 'https:') : null);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  function fromJsonLd() {
    const out = {};
    for (const n of jsonLdProducts()) {
      out.title ||= n.name;
      out.images ||= [].concat(n.image || []).map((i) => abs(typeof i === 'string' ? i : i?.url)).filter(Boolean);
      const offer = [].concat(n.offers || [])[0];
      out.price ||= num(offer?.price ?? offer?.lowPrice);
      if (offer?.availability) out.in_stock = !/OutOfStock|SoldOut/i.test(offer.availability);
      if (n.aggregateRating) {
        out.rating ||= num(n.aggregateRating.ratingValue);
        out.reviews ||= num(n.aggregateRating.reviewCount ?? n.aggregateRating.ratingCount);
      }
    }
    return out;
  }

  function extract() {
    const d = fromJsonLd();
    if (store.name === 'Amazon') {
      // Amazon's own price data first; the visible price boxes can hold an add-on's price (a warranty) first.
      const box = (inner) => ['#corePriceDisplay_desktop_feature_div', '#corePrice_feature_div', '#apex_desktop', '#apex_offerDisplay_desktop'].map((b) => `${b} ${inner}`).join(',');
      d.title = text('#productTitle') || d.title;
      d.price =
        num(document.querySelector('#twister-plus-price-data-price')?.value) ||
        firstNum(box('.priceToPay .a-offscreen') + ',' + box('.priceToPay .aok-offscreen')) ||
        firstNum(box('.a-price-whole')) ||
        firstNum('#priceblock_ourprice, #priceblock_dealprice') ||
        d.price;
      d.mrp = firstNum('#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen') || firstNum(box('.a-price.a-text-price .a-offscreen'));
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
          const p = JSON.parse(script.textContent.slice(script.textContent.indexOf('{'))).pdpData || {};
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
      store: store.name,
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

  // The delivery pincode the store already shows (Amazon's "Deliver to … 560001", Flipkart's delivery box).
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
    .card { width:360px; max-height:82vh; display:flex; flex-direction:column; background:#fff; color:#0f172a; border-radius:18px; box-shadow:0 20px 50px rgba(15,23,42,.25); border:1px solid #e2e8f0; overflow:hidden; animation:in .3s cubic-bezier(.22,1,.36,1); }
    @keyframes in { from { opacity:0; transform:translateY(16px) scale(.97);} to { opacity:1; transform:none; } }
    .head { display:flex; align-items:center; gap:8px; padding:10px 12px; background:linear-gradient(135deg,#fff7ed,#fdf2f8); }
    .logo { display:flex; align-items:center; gap:7px; font-weight:900; font-size:15px; flex:1; }
    .logo b { display:grid; place-items:center; width:24px; height:24px; border-radius:7px; color:#fff; background:linear-gradient(135deg,#f97316,#ec4899); }
    .site { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; color:#475569; background:#fff; border-radius:999px; padding:3px 9px 3px 3px; border:1px solid #f1f5f9; }
    .x { border:0; background:transparent; font-size:20px; line-height:1; cursor:pointer; color:#64748b; padding:0 2px; }
    .loc { display:flex; align-items:center; gap:6px; padding:7px 12px; font-size:12px; color:#475569; border-bottom:1px solid #f1f5f9; }
    .loc b { color:#0f172a; } .loc .grow { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .loc input { flex:1; min-width:0; border:1px solid #cbd5e1; border-radius:8px; padding:5px 8px; font-size:12px; outline:none; }
    .loc input:focus { border-color:#ea580c; }
    .gps { display:grid; place-items:center; width:26px; height:26px; border-radius:8px; background:#fff7ed !important; color:#ea580c; }
    a.lk, button.lk { color:#ea580c; font-weight:700; font-size:12px; text-decoration:none; background:none; border:0; cursor:pointer; padding:0; }
    .body { overflow:auto; padding:12px; }
    .prod { display:flex; gap:10px; align-items:center; }
    .prod img { width:52px; height:52px; border-radius:10px; object-fit:contain; border:1px solid #f1f5f9; background:#fff; flex-shrink:0; }
    .t2 { font-size:12.5px; color:#334155; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .price { font-size:20px; font-weight:900; }
    .verdict { font-weight:900; color:#fff; border-radius:6px; padding:2px 7px; font-size:11px; margin-left:6px; vertical-align:middle; }
    .buy { background:#16a34a; } .okay { background:#f59e0b; } .skip { background:#dc2626; }
    .best { margin-top:10px; border-radius:12px; padding:9px 11px; font-size:13px; font-weight:800; }
    .best.save { background:#f0fdf4; color:#15803d; } .best.here { background:#f8fafc; color:#334155; }
    .lbl { margin:12px 0 6px; font-size:11px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:#94a3b8; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    .tile { position:relative; display:block; padding:9px; border-radius:12px; border:1px solid #e2e8f0; text-decoration:none; color:inherit; background:#fff; transition:box-shadow .15s, transform .15s; }
    a.tile:hover { box-shadow:0 6px 16px rgba(15,23,42,.08); transform:translateY(-1px); }
    .tile.low { border-color:#86efac; background:#f0fdf4; }
    .tile.off { background:#f8fafc; }
    .tile .top { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; }
    .tile .p { margin-top:5px; font-size:16px; font-weight:900; }
    .tile .s { font-size:11px; color:#64748b; margin-top:1px; }
    .tile.off .p { color:#94a3b8; font-size:14px; }
    .badge { position:absolute; top:-7px; right:8px; background:#16a34a; color:#fff; font-size:10px; font-weight:800; border-radius:999px; padding:1px 7px; }
    .chip { display:grid; place-items:center; width:20px; height:20px; border-radius:6px; color:#fff; font-weight:900; font-size:11px; flex-shrink:0; object-fit:contain; background:#fff; }
    .shim { display:block; height:16px; width:60%; margin-top:6px; border-radius:6px; background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9); background-size:200% 100%; animation:sh 1.2s infinite; }
    @keyframes sh { to { background-position:-200% 0; } }
    .alert { margin-top:12px; border:1px solid #fed7aa; background:#fff7ed; border-radius:12px; padding:10px; }
    .alert .row { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; }
    .btn { border:0; border-radius:10px; padding:8px 12px; font-weight:800; font-size:13px; cursor:pointer; text-decoration:none; text-align:center; }
    .primary { background:#ea580c; color:#fff; } .ghost { background:#f1f5f9; color:#0f172a; }
    .field { width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:7px 9px; font-size:13px; margin-top:6px; outline:none; background:#fff; }
    .field:focus { border-color:#ea580c; }
    .tick { display:flex; align-items:center; gap:6px; font-size:12px; margin-top:7px; }
    .muted { color:#64748b; font-size:12px; } .err { color:#b91c1c; font-size:12px; margin-top:6px; }
    svg.spark { display:block; width:100%; height:44px; margin-top:6px; }
    .grow { flex:1; min-width:0; }
    .setup { display:flex; align-items:center; gap:8px; margin-top:8px; padding:7px 9px; border-radius:10px; background:#f8fafc; font-size:12px; color:#475569; }
    .setup a { display:inline-block; margin-right:4px; vertical-align:middle; }
    .setup .chip { width:22px; height:22px; }
    .stop { border:0; background:#f1f5f9; color:#475569; border-radius:8px; padding:5px 9px; font-size:11px; font-weight:700; cursor:pointer; }
  </style><div id="app"></div>`;
  const app = root.getElementById('app');

  const COLORS = { Amazon: '#ff9900', Flipkart: '#2874f0', Myntra: '#ff3f6c', AJIO: '#2c4152', Meesho: '#9f2089', Croma: '#12daa8', 'Tata CLiQ': '#da1c5c', 'Reliance Digital': '#e42529', Nykaa: '#fc2779', 'Nykaa Fashion': '#fc2779', JioMart: '#0078ad', Zepto: '#5f259f', Blinkit: '#0c831f', Instamart: '#fc8019', BigBasket: '#84c225', Decathlon: '#0082c3' };
  // Each store's own logo, shipped with the extension; a coloured letter for stores without one.
  const LOGOS = {
    Amazon: 'amazon.in.png',
    Flipkart: 'flipkart.com.png',
    Myntra: 'myntra.com.jpg',
    AJIO: 'ajio.com.png',
    Meesho: 'meesho.com.png',
    Croma: 'croma.com.png',
    'Tata CLiQ': 'tatacliq.com.jpg',
    'Reliance Digital': 'reliancedigital.in.png',
    Nykaa: 'nykaa.com.png',
    JioMart: 'jiomart.com.png',
    Zepto: 'zeptonow.com.png',
    Blinkit: 'blinkit.com.png',
    Instamart: 'swiggy.com.png',
    BigBasket: 'bigbasket.com.png',
    Decathlon: 'decathlon.in.png',
    boAt: 'boat-lifestyle.com.jpg',
    Noise: 'gonoise.com.png',
    Boult: 'boultaudio.com.png',
    'Fire-Boltt': 'fireboltt.com.jpg',
    pTron: 'ptron.in.png',
    Zebronics: 'zebronics.com.png',
    Plum: 'plumgoodness.com.png',
    'SUGAR Cosmetics': 'in.sugarcosmetics.com.png',
    Mamaearth: 'mamaearth.in.png',
    mCaffeine: 'mcaffeine.com.png',
    'Bombay Shaving Company': 'bombayshavingcompany.com.png',
    Beardo: 'beardo.in.png',
    'Nykaa Fashion': 'nykaafashion.com.jpg',
    Miraggio: 'miraggiolife.com.png',
    Snapdeal: 'snapdeal.com.png',
    'Shoppers Stop': 'shoppersstop.com.png',
    Lifestyle: 'lifestylestores.com.png',
  };
  const chip = (name) =>
    LOGOS[name]
      ? `<img class="chip" src="${chrome.runtime.getURL('logos/' + LOGOS[name])}" alt="" />`
      : `<span class="chip" style="background:${COLORS[name] || '#64748b'}">${esc(String(name)[0] || '?')}</span>`;
  const QUICK = ['Zepto', 'Blinkit', 'Instamart', 'BigBasket', 'JioMart'];

  const state = { open: false, product: null, data: null, offers: null, error: '', quick: null, quickBusy: false, quickFor: '' };
  // The delivery location is DealRadar's, shared with the website; from tells which store it was read from.
  const loc = { pin: null, area: null, from: null, editing: false, busy: false, locating: false, err: '', draft: undefined };
  // Price alerts: the shopper's list, and where their last alert went (so the next one takes one tap).
  const al = { list: null, contact: null, form: false, busy: false, err: '', tg: null, draft: null };

  // ---------- compare tab ----------
  function tiles() {
    const p = state.product;
    const online = [{ store: store.name, price: p.price, url: null, here: true }].concat(
      (state.offers || [])
        .map((o, i) => ({ ...o, i }))
        .filter((o) => o.in_stock && o.store !== store.name && !QUICK.includes(o.store) && o.delivery?.ok !== false)
        .map((o) => ({ store: o.store, price: o.price, url: `${DEALRADAR_API}/api/buy/${state.data.id}?o=${o.i}`, variant: !o.same_variant, delivers: o.delivery?.ok ? o.delivery : null })),
    );
    const near = QUICK.filter((s) => s !== store.name).map((s) => {
      const x = state.quick?.[s];
      if (x && x.state === 'found') return { store: s, price: x.price, url: x.url, near: true };
      return { store: s, status: x ? x.state : loc.pin ? 'busy' : 'noloc', url: x?.url };
    });
    const priced = online.concat(near.filter((t) => t.price));
    const low = priced.reduce((a, b) => (b.price < a.price ? b : a), priced[0]);
    return { online, near, low, others: priced.length - 1 };
  }

  function tileHtml(t, low) {
    const isLow = t === low && low.price;
    const sub = t.here
      ? 'You are here'
      : t.near
        ? 'In stock near you'
        : t.delivers
          ? `Delivers to ${t.delivers.pin}${t.delivers.by ? ' by ' + t.delivers.by : ''}`
          : t.variant
            ? 'Similar variant'
            : 'In stock';
    const body = `<div class="top">${chip(t.store)}${esc(t.store)}</div>${isLow ? '<span class="badge">Lowest</span>' : ''}`;
    if (t.price)
      return t.url
        ? `<a class="tile ${isLow ? 'low' : ''}" href="${esc(t.url)}" target="_blank" rel="noopener">${body}<div class="p">${inr(t.price)}</div><div class="s">${sub}</div></a>`
        : `<div class="tile ${isLow ? 'low' : ''}">${body}<div class="p">${inr(t.price)}</div><div class="s">${sub}</div></div>`;
    const words = {
      busy: ['', 'Checking…'],
      noloc: ['—', 'Add your pincode'],
      none: ['—', 'Not available'],
      empty: ['—', 'Set location there ›'],
      location: ['—', 'Set location there ›'],
      error: ['—', 'Could not check'],
    }[t.status] || ['—', ''];
    const inner = `${body}${t.status === 'busy' ? '<span class="shim"></span>' : `<div class="p">${words[0]}</div>`}<div class="s">${words[1]}</div>`;
    return (t.status === 'empty' || t.status === 'location') && t.url
      ? `<a class="tile off" href="${esc(t.url)}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="tile off">${inner}</div>`;
  }

  function spark(history, current) {
    const pts = history.concat([{ p: current, t: Date.now() }]);
    if (pts.length < 3) return '';
    const W = 300, H = 40;
    const ps = pts.map((x) => x.p);
    const min = Math.min(...ps), max = Math.max(...ps);
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
    const x = (t) => ((t - t0) / Math.max(t1 - t0, 1)) * W;
    const y = (v) => (max === min ? H / 2 : 4 + (1 - (v - min) / (max - min)) * (H - 8));
    let d = `M${x(pts[0].t)},${y(pts[0].p)}`;
    for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t)} V${y(pts[i].p)}`;
    return `<div class="lbl">Price history · low ${inr(min)} · high ${inr(max)}</div><svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d} V${H} H0 Z" fill="#fed7aa" opacity=".5"/><path d="${d}" fill="none" stroke="#ea580c" stroke-width="2"/></svg>`;
  }

  const where = (c) => [c?.email && 'Email', c?.phone && 'WhatsApp', c?.telegram && 'Telegram'].filter(Boolean).join(' · ');

  function alertHtml() {
    const mine = (al.list || []).find((a) => a.status === 'active' && a.product_id === state.data.id);
    if (mine) {
      const to = where({ email: mine.email, phone: mine.phone, telegram: (mine.channels || []).includes('telegram') });
      return `<div class="alert"><div class="row"><span>🔔</span><span class="grow">Alert on${to ? ` · ${esc(to)}` : ''}</span><button class="stop" data-stop="${esc(mine.id)}">Stop</button></div>${al.tg ? `<a class="btn ghost" style="display:block;margin-top:8px" href="${esc(al.tg)}" target="_blank" rel="noopener">Open Telegram and press Start</a>` : ''}</div>`;
    }
    const c = al.draft || al.contact || {};
    const form = al.form
      ? `<input class="field" id="al-email" type="email" placeholder="Email" value="${esc(c.email || '')}" />
         <input class="field" id="al-phone" type="tel" placeholder="WhatsApp number (optional)" value="${esc(c.phone || '')}" />
         <label class="tick"><input type="checkbox" id="al-tg" ${c.telegram ? 'checked' : ''} /> Also on Telegram</label>
         <button class="btn primary" id="al-set" style="width:100%;margin-top:8px" ${al.busy ? 'disabled' : ''}>${al.busy ? 'Setting…' : 'Set alert'}</button>`
      : '';
    const known = !al.form && where(al.contact);
    return `<div class="alert"><div class="row"><span>🔔</span><span class="grow">Alert me when the price drops</span>${
      al.form ? '' : `<button class="btn primary" id="al-set" ${al.busy ? 'disabled' : ''}>${al.busy ? '…' : 'Set alert'}</button>`
    }</div>${form}${al.err ? `<div class="err">${esc(al.err)}</div>` : ''}${
      known ? `<div class="muted" style="margin-top:6px">To ${esc(known)} · <button class="lk" id="al-change">change</button></div>` : ''
    }</div>`;
  }

  // Only stores that have the product near the shopper; stores without it are left out.
  function nearHtml(near, low) {
    if (!loc.pin) return '';
    const found = near.filter((t) => t.price);
    const checking = near.filter((t) => t.status === 'busy');
    // Apps that showed no products have no delivery address yet; each keeps its own, set once in that app.
    const setup = near.filter((t) => t.status === 'empty' || t.status === 'location');
    if (!found.length && !checking.length && !setup.length) return '';
    return `<div class="lbl">Near you · ${esc(loc.pin)}</div>${found.length ? `<div class="grid">${found.map((t) => tileHtml(t, low)).join('')}</div>` : ''}${
      checking.length
        ? `<div class="muted" style="display:flex;align-items:center;gap:6px;margin-top:6px"><span class="shim" style="width:40px;height:10px;margin:0"></span>Checking ${checking.map((t) => esc(t.store)).join(', ')}…</div>`
        : ''
    }${
      setup.length
        ? `<div class="setup"><span>Add address in</span><span class="grow" style="white-space:nowrap">${setup
            .map((t) => `<a href="${esc(t.url)}" target="_blank" rel="noopener" title="Set your address in ${esc(t.store)}">${chip(t.store)}</a>`)
            .join('')}</span><button class="lk" id="near-again">Check again</button></div>`
        : ''
    }`;
  }

  function compareHtml() {
    const p = state.product;
    const d = state.data;
    const verdict = d.deal ? { buy: 'BUY', okay: 'OKAY', skip: 'SKIP' }[d.deal.action] : null;
    const { online, near, low, others } = tiles();
    const here = online[0];
    const best =
      state.offers === null
        ? '<div class="best here">Comparing prices…</div>'
        : low !== here && low.price < here.price
          ? `<div class="best save">Save ${inr(here.price - low.price)} on ${esc(low.store)} · ${inr(low.price)}</div>`
          : others
            ? '<div class="best here">✓ Best price is right here</div>'
            : '';
    return `<div class="prod">${p.image ? `<img src="${esc(p.image)}" alt="" />` : ''}<div class="grow"><div class="t2">${esc(p.title)}</div>
        <div><span class="price">${inr(p.price)}</span>${verdict ? `<span class="verdict ${d.deal.action}">${verdict}</span>` : ''}</div></div></div>
      ${best}
      <div class="lbl">Online</div>
      <div class="grid">${online.map((t) => tileHtml(t, low)).join('')}${
        state.offers === null ? '<div class="tile off"><div class="top">More stores</div><span class="shim"></span><div class="s">Checking…</div></div>' : ''
      }</div>
      ${nearHtml(near, low)}
      ${alertHtml()}
      ${spark(d.history || [], p.price)}`;
  }

  // ---------- frame ----------
  const GPS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
  function locHtml() {
    const gps = `<button class="lk gps" id="loc-gps" title="Use my current location">${loc.locating ? '…' : GPS}</button>`;
    if (loc.editing || !loc.pin)
      return `<div class="loc"><span>📍</span><input id="loc-pin" inputmode="numeric" maxlength="6" placeholder="Delivery pincode" value="${esc(loc.draft ?? loc.pin ?? '')}" />
        <button class="btn primary" id="loc-save" style="padding:5px 10px;font-size:12px">${loc.busy ? '…' : 'Save'}</button>${gps}</div>${loc.err ? `<div class="err" style="padding:0 12px 6px">${esc(loc.err)}</div>` : ''}`;
    const city = (loc.area || '').split(',')[0];
    return `<div class="loc"><span>📍</span><span class="grow">Deliver to <b>${esc(loc.pin)}</b>${city ? ' ' + esc(city) : ''}${loc.from ? ` · ${esc(loc.from)}` : ''}</span>${gps}<button class="lk" id="loc-change">Change</button></div>${
      loc.err ? `<div class="err" style="padding:0 12px 6px">${esc(loc.err)}</div>` : ''
    }`;
  }

  function render() {
    // The panel is redrawn as results arrive; keep what the shopper is typing.
    const e = root.getElementById('al-email');
    if (e) al.draft = { email: e.value, phone: root.getElementById('al-phone').value, telegram: root.getElementById('al-tg').checked };
    const pinBox = root.getElementById('loc-pin');
    if (pinBox) loc.draft = pinBox.value;
    const focused = root.activeElement && root.activeElement.id;

    if (!state.open) {
      const t = state.data && state.offers ? tiles() : null;
      const save = t && !t.low.here && t.low.price < state.product.price ? ` · save ${inr(state.product.price - t.low.price)}` : '';
      app.innerHTML = `<button class="pill" id="open">₹ Compare prices${save}</button>`;
      root.getElementById('open').onclick = () => openPanel();
      return;
    }
    app.innerHTML = `<div class="card">
      <div class="head"><div class="logo"><b>₹</b>DealRadar</div><span class="site">${chip(store.name)}${esc(store.name)}</span><button class="x" id="close" title="Minimise">–</button></div>
      ${locHtml()}
      <div class="body">${
        state.error ? `<div class="err">${esc(state.error)}</div>` : !state.data ? '<span class="shim"></span><span class="shim" style="width:80%"></span>' : compareHtml()
      }</div>
    </div>`;
    bind();
    const again = focused && root.getElementById(focused);
    if (again && again.focus) again.focus();
  }

  function bind() {
    const on = (id, fn) => {
      const el = root.getElementById(id);
      if (el) el.onclick = fn;
    };
    on('close', () => {
      state.open = false;
      render();
    });
    on('loc-change', () => {
      loc.editing = true;
      render();
    });
    on('loc-save', () => saveLocation());
    on('loc-gps', () => useCurrentLocation());
    const pinBox = root.getElementById('loc-pin');
    if (pinBox) pinBox.onkeydown = (e) => e.key === 'Enter' && saveLocation();
    on('al-set', () => setAlert());
    on('near-again', () => {
      state.quick = null;
      state.quickFor = '';
      checkNearby(true);
    });
    on('al-change', () => {
      al.form = true;
      render();
    });
    root.querySelectorAll('[data-stop]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        await send({ type: 'stopAlert', id: b.getAttribute('data-stop') });
        al.tg = null;
        await loadAlerts();
      };
    });
  }

  // ---------- actions ----------
  async function loadAlerts() {
    const r = await send({ type: 'alerts' });
    al.list = r.ok ? r.data.alerts || [] : [];
    if (r.ok && r.data.contact) al.contact = r.data.contact;
    render();
  }

  async function setAlert() {
    let c = al.contact;
    if (al.form) c = { email: root.getElementById('al-email').value.trim(), phone: root.getElementById('al-phone').value.trim(), telegram: root.getElementById('al-tg').checked };
    else if (!where(c)) {
      al.form = true;
      return render();
    }
    if (!c.email && !c.phone && !c.telegram) {
      al.err = 'Add an email or WhatsApp number, or tick Telegram.';
      return render();
    }
    al.busy = true;
    al.err = '';
    render();
    const r = await send({ type: 'setAlert', alert: { product_id: state.data.id, email: c.email || '', phone: c.phone || '', telegram: !!c.telegram, drop_percent: 0, window_days: 7 } });
    al.busy = false;
    if (!r.ok && !/already tracking/i.test(r.error)) {
      al.err = r.error;
      al.form = true;
      return render();
    }
    al.contact = c;
    al.draft = null;
    al.form = false;
    al.tg = r.ok ? r.data.telegram_link || null : null;
    await loadAlerts();
  }

  async function saveLocation(pinArg, from) {
    const pin = String(pinArg ?? root.getElementById('loc-pin')?.value ?? '').replace(/\D/g, '');
    if (pin.length !== 6) {
      loc.err = 'Enter a 6-digit pincode.';
      return render();
    }
    loc.busy = true;
    loc.err = '';
    render();
    const r = await send({ type: 'setLocation', pin });
    loc.busy = false;
    if (!r.ok) {
      loc.err = r.error;
      return render();
    }
    Object.assign(loc, { pin: r.data.pin, area: r.data.area, from: from || null, editing: false, draft: undefined });
    locationChanged();
  }

  // The device's location, read by the extension (not by this store's page), turned into a pincode.
  async function useCurrentLocation() {
    loc.locating = true;
    loc.err = '';
    render();
    const r = await send({ type: 'currentLocation' });
    loc.locating = false;
    if (!r.ok) {
      loc.err = r.error;
      return render();
    }
    Object.assign(loc, { pin: r.data.pin, area: r.data.area, from: 'your location', editing: false, draft: undefined });
    locationChanged();
  }

  // A new pincode: nearby stores and online delivery are checked again for it.
  async function locationChanged() {
    state.quick = null;
    state.quickFor = '';
    render();
    checkNearby();
    if (!state.data) return;
    const c = await send({ type: 'compare', id: state.data.id, title: state.product.title, price: state.product.price, store: store.name });
    if (c.ok) state.offers = c.data.offers;
    render();
  }

  // Nearby quick-commerce prices are read once per product and pincode, and only while the panel is open.
  async function checkNearby(fresh = false) {
    if (!state.open || !state.data || !loc.pin || state.quickBusy) return;
    const key = state.data.id + '@' + loc.pin;
    if (state.quickFor === key) return;
    state.quickFor = key;
    state.quickBusy = true;
    render();
    const r = await send({ type: 'quick', id: state.data.id, title: state.product.title, price: state.product.price, store: store.name, fresh });
    state.quickBusy = false;
    state.quick = r.ok ? r.data.status : Object.fromEntries(QUICK.map((s) => [s, { state: 'error' }]));
    if (r.ok && r.data.offers) state.offers = r.data.offers;
    render();
  }

  function openPanel() {
    state.open = true;
    render();
    checkNearby();
  }

  async function run() {
    if (!store.product()) {
      host.remove();
      return true;
    }
    const product = extract();
    if (!product.title || !product.price) return false; // page still loading; the next check retries
    Object.assign(state, { product, data: null, offers: null, error: '', quick: null, quickBusy: false, quickFor: '' });
    Object.assign(al, { form: false, busy: false, err: '', tg: null });
    loc.from = null;
    const { autoOpen = false } = await chrome.storage.local.get('autoOpen');
    state.open = state.open || autoOpen;
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
      // The delivery pincode this store shows is where the shopper is ordering to now.
      const here = pagePin();
      if (here && here !== loc.pin) await saveLocation(here, 'from ' + store.name);
      else {
        if (here) loc.from = 'from ' + store.name;
        render();
        checkNearby();
      }
    });
    const c = await send({ type: 'compare', id: r.data.id, title: product.title, price: product.price, store: store.name });
    state.offers = c.ok ? c.data.offers : [];
    render();
    return true;
  }

  // Clicking the DealRadar toolbar icon on a product page opens the panel here.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type !== 'openPanel') return false;
    if (!store.product()) {
      reply({ ok: false });
      return false;
    }
    if (host.isConnected) openPanel();
    else {
      state.open = true;
      done = ''; // not built yet: the next check builds it, open
    }
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
