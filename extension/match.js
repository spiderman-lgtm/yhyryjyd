// Same-product matching, kept in step with src/lib/storesearch.ts on the server.
var DRMatch = (function () {
  var STOP = new Set(['with', 'for', 'and', 'the', 'of', 'in', 'by', 'from', 'new', 'latest', 'free', 'pack', 'combo', 'online', 'buy', 'gb', 'ram', 'rom',
    'women', 'womens', 'men', 'mens', 'ladies', 'girls', 'boys', 'unisex', 'office', 'use', 'stylish', 'trendy', 'solid', 'casual',
    'fast', 'charging', 'input', 'output', 'compatible', 'premium', 'strong', 'upto', 'up', 'to', 'support', 'supports', 'usb', 'type', 'c']);
  var COLORS = new Set(
    'black white blue green red yellow pink purple grey gray silver gold orange brown beige navy maroon teal olive cream violet titanium graphite midnight starlight natural desert ultramarine'.split(' '),
  );
  var ACCESSORY = /\b(case|cover|protector|tempered|glass|guard|charger|cable|adapter|stand|holder|strap|pouch|refurbished|renewed)\b/i;
  var MODEL = ['plus', 'pro', 'max', 'mini', 'ultra', 'lite', 'fe', 'neo', 'prime', 'air'];
  var SIZE = /^\d+(\.\d+)?(ml|g|kg|l|ltr|inch|cm)$/;

  function tokens(s) {
    return String(s)
      .toLowerCase()
      .replace(/(\d+(?:\.\d+)?)\s*(?:"|”|''|-?inches\b|-inch\b)/g, '$1inch ')
      .replace(/(\d+(?:\.\d+)?)\s*(gb|tb|mah|w|inch|cm|ml|kg|g|l|ltr)\b/g, '$1$2')
      .split(/[^a-z0-9.]+/)
      .map(function (w) {
        return w.replace(/^\.+|\.+$/g, '');
      })
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
    var none = { ok: false, same: false, score: 0 };
    var src = Array.from(new Set(tokens(query(source.title))));
    var candList = tokens(cand.title);
    var set = new Set(candList);
    var isSize = function (t) {
      return SIZE.test(t);
    };
    var core = src.filter(function (t) {
      return !isSize(t);
    });
    if (core.length < 2) return none;
    var what = function (t) {
      return String(t).replace(/\bwith\b.*$/i, '');
    };
    if (ACCESSORY.test(what(cand.title)) && !ACCESSORY.test(what(source.title))) return none;
    if (cand.price < source.price * 0.4 || cand.price > source.price * 2.5) return none;
    if (!set.has(src[0])) return none;
    var missing = core.filter(function (t) {
      return /\d/.test(t) && !set.has(t);
    });
    if (
      missing.length &&
      candList.some(function (t) {
        return /\d/.test(t) && !isSize(t) && src.indexOf(t) < 0;
      })
    )
      return none;
    var full = new Set(tokens(source.title));
    var hasModelNo = core.some(function (t) {
      return /\d/.test(t);
    });
    if (
      hasModelNo &&
      MODEL.some(function (m) {
        return set.has(m) !== full.has(m);
      })
    )
      return none;
    var shared = core.filter(function (t) {
      return set.has(t);
    }).length;
    var candCore = new Set(candList.filter(function (t) {
      return !isSize(t);
    }));
    var contain = shared / Math.min(core.length, candCore.size);
    var cover = shared / core.length;
    if (shared < 2 || cover < 0.4) return none;
    var score = contain * 0.7 + cover * 0.3;
    var srcColors = src.filter(function (t) {
      return COLORS.has(t);
    });
    var candColors = Array.from(set).filter(function (t) {
      return COLORS.has(t);
    });
    var otherColour =
      srcColors.length > 0 &&
      candColors.length > 0 &&
      !srcColors.some(function (c) {
        return set.has(c);
      });
    var srcSize = src.find(isSize) || Array.from(full).find(isSize);
    var candSizes = candList.filter(isSize);
    var otherSize = !!srcSize && candSizes.length > 0 && candSizes.indexOf(srcSize) < 0;
    var off = otherColour || otherSize;
    var miss = missing.length > 0;
    var same = score >= 0.7 && !off && !miss;
    // A listing that is not an exact match and costs far more or less is a different product, not a variant.
    if (!same && (cand.price < source.price * 0.6 || cand.price > source.price * 2)) return none;
    return { ok: score >= (miss ? 0.7 : 0.6), same: same, score: score - (off ? 0.2 : 0) - (miss ? 0.1 : 0) };
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
