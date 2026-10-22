/* global importScripts, DEALRADAR_API, DRMatch, chrome */
importScripts('config.js', 'match.js');

// Sent with the browser's DealRadar cookies, so alerts set here belong to the same shopper as on the site.
async function api(path, body) {
  const res = await fetch(DEALRADAR_API + path, {
    credentials: 'include',
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'DealRadar is not reachable right now.');
  return data;
}

const decode = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
const price = (s) => Number(String(s || '').replace(/[^\d.]/g, '')) || 0;

// These run in the shopper's own browser, with their own cookies, where stores serve normal pages.
const SEARCH = {
  async Amazon(q) {
    const html = await (await fetch('https://www.amazon.in/s?k=' + encodeURIComponent(q), { credentials: 'include' })).text();
    const starts = [];
    const re = /<div[^>]*data-component-type="s-search-result"[^>]*>/g;
    let m;
    while ((m = re.exec(html))) starts.push(m.index);
    const out = [];
    for (let i = 0; i < starts.length && out.length < 15; i++) {
      const chunk = html.slice(starts[i], starts[i + 1] || starts[i] + 30000);
      const asin = (chunk.slice(0, 600).match(/data-asin="([A-Z0-9]{10})"/) || [])[1];
      if (!asin || /Sponsored/.test(chunk.slice(0, 4000))) continue;
      const title = (chunk.match(/<h2[^>]*aria-label="([^"]+)"/) || chunk.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/) || [])[1];
      const p = (chunk.match(/<span class="a-price"[^>]*>\s*<span class="a-offscreen">([^<]+)<\/span>/) || [])[1];
      if (title && p) out.push({ store: 'Amazon', title: decode(title), price: price(p), url: 'https://www.amazon.in/dp/' + asin });
    }
    return out;
  },
  async Myntra(q) {
    const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const html = await (await fetch('https://www.myntra.com/' + slug + '?rawQuery=' + encodeURIComponent(q), { credentials: 'include' })).text();
    const m = html.match(/window\.__myx\s*=\s*(\{[\s\S]*?\})<\/script>/);
    if (!m) return [];
    const products = (JSON.parse(m[1]).searchData || {}).results?.products || [];
    return products.slice(0, 15).map((p) => ({
      store: 'Myntra',
      title: [p.brand, p.productName].filter(Boolean).join(' '),
      price: price(p.price),
      url: 'https://www.myntra.com/' + p.landingPageUrl,
    }));
  },
};

// Quick-commerce stores price by delivery address, so they are read from a background tab that uses the
// location the shopper already set on that site. Product cards are found by their ₹ price and image.
const QUICK = [
  { store: 'Zepto', home: 'https://www.zeptonow.com/', url: (q) => 'https://www.zeptonow.com/search?query=' + encodeURIComponent(q) },
  { store: 'Blinkit', home: 'https://blinkit.com/', url: (q) => 'https://blinkit.com/s/?q=' + encodeURIComponent(q) },
  { store: 'Instamart', home: 'https://www.swiggy.com/instamart', url: (q) => 'https://www.swiggy.com/instamart/search?custom_back=true&query=' + encodeURIComponent(q) },
  { store: 'BigBasket', home: 'https://www.bigbasket.com/', url: (q) => 'https://www.bigbasket.com/ps/?q=' + encodeURIComponent(q) },
  { store: 'JioMart', home: 'https://www.jiomart.com/', url: (q) => 'https://www.jiomart.com/search/' + encodeURIComponent(q) },
];

function readCards() {
  const priceRe = /₹\s?([\d,]+(?:\.\d+)?)/;
  const out = [];
  const seen = new Set();
  const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => e.children.length === 0 && priceRe.test(e.textContent || ''));
  for (const el of leaves) {
    if ((getComputedStyle(el).textDecorationLine || '').includes('line-through')) continue;
    let card = el;
    for (let i = 0; i < 7 && card; i++) {
      card = card.parentElement;
      const text = card ? card.innerText || '' : '';
      if (card && card.querySelector('img') && text.length > 15 && text.length < 400) break;
    }
    if (!card || seen.has(card)) continue;
    seen.add(card);
    const lines = (card.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const qty = lines.find((l) => /^\d+(\.\d+)?\s?(g|kg|ml|l|ltr|pcs?|pack|units?)\b/i.test(l));
    const title = lines
      .filter((l) => !/₹|^add$|\bmins?\b|% ?off|^\d+(\.\d+)?\s?(g|kg|ml|l|ltr|pcs?|pack|units?)\b/i.test(l) && l.length > 3)
      .sort((a, b) => b.length - a.length)[0];
    const p = Number((el.textContent.match(priceRe) || [])[1]?.replace(/,/g, ''));
    const link = card.closest('a') || card.querySelector('a');
    if (title && p) out.push({ title: qty ? title + ' ' + qty : title, price: p, url: link ? link.href : location.href });
    if (out.length >= 24) break;
  }
  const needsLocation = /select (your )?location|enter (your )?(delivery )?(location|address|pincode)|detect my location/i.test(document.body.innerText.slice(0, 5000));
  return { cards: out, needsLocation };
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info, tab) => id === tabId && info.status === 'complete' && tab.url && tab.url !== 'about:blank' && done();
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, 20000);
  });
}

async function readQuickStore(s, q) {
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  try {
    const loaded = waitForLoad(tab.id);
    await chrome.tabs.update(tab.id, { url: s.url(q) });
    await loaded;
    // These sites render results after the page loads, so read until cards (or a location prompt) appear.
    let last = { cards: [], needsLocation: false };
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 1200));
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readCards }).catch(() => [null]);
      last = res?.result || last;
      if (last.cards.length >= 3 || last.needsLocation) break;
    }
    return last;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function contribute(productId, offers) {
  if (!offers.length) return null;
  return api('/api/ext/offers', { product_id: productId, offers });
}

async function compare({ id, title, price: p, store }) {
  const source = { title, price: p };
  const q = DRMatch.query(title);
  const stores = Object.keys(SEARCH).filter((s) => s !== store);
  const [server, ...found] = await Promise.all([
    api('/api/product/' + id + '/compare').catch(() => ({ offers: [] })),
    ...stores.map((s) =>
      SEARCH[s](q)
        .then((list) => DRMatch.best(source, list))
        .catch(() => null),
    ),
  ]);
  const mine = found.filter(Boolean).map((o) => ({ store: o.store, price: o.price, url: o.url, in_stock: true, same_variant: o.same_variant }));
  const merged = await contribute(id, mine).catch(() => null);
  return { offers: merged?.offers || server.offers || [] };
}

async function quick({ id, title, price: p }) {
  const source = { title, price: p };
  const q = DRMatch.query(title);
  const status = {};
  const results = await Promise.all(
    QUICK.map(async (s) => {
      try {
        const { cards, needsLocation } = await readQuickStore(s, q);
        const hit = DRMatch.best(source, cards);
        // seen says whether the page showed products at all: none seen usually means no location set yet.
        status[s.store] = hit
          ? { state: 'found', price: hit.price, url: hit.url }
          : { state: needsLocation ? 'location' : cards.length ? 'none' : 'empty', url: s.home, seen: cards.length };
        return hit ? { store: s.store, price: hit.price, url: hit.url, in_stock: true, same_variant: hit.same_variant } : null;
      } catch (e) {
        status[s.store] = { state: 'error', url: s.home };
        return null;
      }
    }),
  );
  const merged = await contribute(id, results.filter(Boolean)).catch(() => null);
  return { status, offers: merged?.offers };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run =
    msg.type === 'lookup'
      ? api('/api/ext/lookup', msg.page)
      : msg.type === 'compare'
        ? compare(msg)
        : msg.type === 'quick'
          ? quick(msg)
          : msg.type === 'alerts'
            ? api('/api/alerts')
            : msg.type === 'setAlert'
              ? api('/api/alerts', msg.alert)
              : msg.type === 'stopAlert'
                ? api('/api/alerts/' + encodeURIComponent(msg.id), { op: 'cancel' })
                : null;
  if (!run) return false;
  run.then((data) => reply({ ok: true, data })).catch((e) => reply({ ok: false, error: String(e.message || e) }));
  return true; // keeps the channel open for the async reply
});
