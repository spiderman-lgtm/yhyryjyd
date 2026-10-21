// Same-product matching, kept in step with src/lib/storesearch.ts on the server.
var DRMatch = (function () {
  var STOP = new Set(['with', 'for', 'and', 'the', 'of', 'in', 'by', 'from', 'new', 'latest', 'free', 'pack', 'combo', 'online', 'buy', 'gb', 'ram', 'rom']);
  var COLORS = new Set(
    'black white blue green red yellow pink purple grey gray silver gold orange brown beige navy maroon teal olive cream violet titanium graphite midnight starlight natural desert ultramarine'.split(' '),
  );
  var ACCESSORY = /\b(case|cover|protector|tempered|glass|guard|skin|charger|cable|adapter|stand|holder|strap|pouch|refurbished|renewed)\b/i;

  function tokens(s) {
    return String(s)
      .toLowerCase()
      .replace(/(\d+)\s*(gb|tb|mah|w|inch|cm|ml|kg|g|l|ltr)\b/g, '$1$2')
      .split(/[^a-z0-9]+/)
      .filter(function (w) {
        return w && !STOP.has(w);
      });
  }

  function query(title) {
    return String(title)
      .replace(/\(.*?\)/g, function (m) {
        return m.replace(/[(),|]/g, ' ');
      })
      .replace(/[|,].*$/, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 9)
      .join(' ');
  }

  // { ok, same, score } for a candidate listing against the product the shopper is viewing.
  function match(source, cand) {
    var src = tokens(source.title);
    var set = new Set(tokens(cand.title));
    var none = { ok: false, same: false, score: 0 };
    if (!src.length) return none;
    if (ACCESSORY.test(cand.title) && !ACCESSORY.test(source.title)) return none;
    if (cand.price < source.price * 0.4 || cand.price > source.price * 2.5) return none;
    var specs = src.filter(function (t) {
      return /\d/.test(t);
    });
    if (
      specs.some(function (t) {
        return !set.has(t);
      })
    )
      return none;
    var shared = src.filter(function (t) {
      return set.has(t);
    }).length;
    var score = shared / src.length;
    var srcColors = src.filter(function (t) {
      return COLORS.has(t);
    });
    var candColors = Array.from(set).filter(function (t) {
      return COLORS.has(t);
    });
    var other =
      srcColors.length > 0 &&
      candColors.length > 0 &&
      !srcColors.some(function (c) {
        return set.has(c);
      });
    return { ok: score >= 0.55, same: score >= 0.7 && !other, score: score - (other ? 0.2 : 0) };
  }

  function best(source, list) {
    var scored = list
      .filter(function (c) {
        return c && c.price > 0 && c.title;
      })
      .map(function (c) {
        return { c: c, m: match(source, c) };
      })
      .filter(function (x) {
        return x.m.ok;
      })
      .sort(function (a, b) {
        return b.m.score - a.m.score || a.c.price - b.c.price;
      });
    return scored[0] ? Object.assign({}, scored[0].c, { same_variant: scored[0].m.same }) : null;
  }

  return { tokens: tokens, query: query, match: match, best: best };
})();
if (typeof self !== 'undefined') self.DRMatch = DRMatch;
