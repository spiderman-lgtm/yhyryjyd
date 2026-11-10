/* Login scene: a quiet pixel-art lake. Pine trees on two banks, drifting clouds, a shimmering
   lake, and a Bird Town bird fishing from the dock. Drawn as crisp SVG rects, built once. */

(function () {
  const G = { out: '#3e5a52', dark: '#6f978a', mid: '#9dbcab', light: '#d3e2cc', trunk: '#8a5a52', trunkD: '#5e3b37' };
  let n = 0; // unique ids

  function rect(x, y, w, h, fill) { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`; }

  // Pixel pine: 4-5 sawtooth tiers that widen towards the base; lit on the left, shaded right.
  function pine(x, base, h, sway) {
    const trunkH = Math.round(h * 0.16), fh = h - trunkH + 4, top = base - h;
    const tiers = h > 55 ? 5 : 4, tierH = fh / tiers, maxHalf = Math.round(h * 0.3);
    let out = rect(x - 2, base - trunkH, 5, trunkH, G.trunk) + rect(x + 1, base - trunkH, 2, trunkH, G.trunkD) + rect(x - 3, base - trunkH, 1, trunkH, G.out) + rect(x + 3, base - trunkH, 1, trunkH, G.out);
    for (let r = 0; r < fh; r++) {
      const t = Math.min(tiers - 1, Math.floor(r / tierH));
      const k = (r - t * tierH) / tierH; // 0..1 inside the tier
      const startHalf = Math.max(1, Math.round(maxHalf * (t / tiers) * 0.55));
      const endHalf = Math.round(maxHalf * ((t + 1) / tiers));
      const half = Math.max(1, Math.round(startHalf + (endHalf - startHalf) * k));
      const y = top + r;
      out += rect(x - half - 1, y, half * 2 + 3, 1, G.out);
      out += rect(x - half, y, half * 2 + 1, 1, G.mid);
      out += rect(x - half, y, Math.max(1, Math.round(half * 0.55)), 1, G.light);
      out += rect(x + Math.round(half * 0.45), y, Math.max(1, Math.round(half * 0.55)), 1, G.dark);
      if (r % 4 === 1 && half > 4) out += rect(x - Math.round(half * 0.2), y, 2, 1, G.light);
      if (r % 5 === 3 && half > 5) out += rect(x + Math.round(half * 0.1), y, 2, 1, G.dark);
      if (k > 0.86) out += rect(x - half - 1, y + 1, half * 2 + 3, 1, G.out); // tier underside line
    }
    out += rect(x, top - 2, 1, 2, G.out);
    return `<g class="qp-tree" style="animation-delay:${sway}s;transform-origin:${x}px ${base}px">${out}</g>`;
  }

  function cloud(x, y, s) {
    const rows = [[3, 6], [1, 10], [0, 14], [0, 16], [1, 15]];
    let o = '';
    rows.forEach(([l, w], i) => { o += rect(x + l * s, y + i * s, w * s, s, '#f6f3e6'); });
    o += rect(x + 2 * s, y + 3 * s, 10 * s, s, '#e8e6d6');
    return o;
  }

  function grass(x, w, y) {
    let o = rect(x, y, w, 3, '#b07a6a') + rect(x, y + 3, w, 2, '#7b4f45') + rect(x - 1, y, 1, 5, G.out) + rect(x + w, y, 1, 5, G.out);
    for (let i = 0; i < w; i += 3) {
      const h = 2 + ((i * 7) % 5);
      o += rect(x + i, y - h, 1, h, (i % 2 ? G.dark : '#5f8a7a'));
    }
    return o;
  }

  function flower(x, y) { return rect(x, y, 1, 4, G.dark) + rect(x - 1, y - 2, 3, 2, '#e8735f') + rect(x, y - 3, 1, 1, '#e8735f') + rect(x, y - 2, 1, 1, '#f6c2a0'); }

  // Our fishing bird (original), pixel style
  function fishingBird(x, y) {
    const B = '#e8735f', Bd = '#b4503f', W = '#fbf3e4', K = '#2b2b2b', O = '#f2a93b';
    return `<g class="qp-bird">
      ${rect(x - 1, y - 9, 1, 1, K)}${rect(x, y - 10, 1, 1, K)}
      ${rect(x - 4, y - 8, 8, 1, K)}${rect(x - 5, y - 7, 10, 7, K)}
      ${rect(x - 4, y - 7, 8, 6, B)}${rect(x - 2, y - 4, 5, 4, W)}
      ${rect(x - 4, y - 5, 2, 3, Bd)}
      ${rect(x + 1, y - 6, 2, 2, W)}${rect(x + 2, y - 6, 1, 1, K)}
      ${rect(x + 4, y - 5, 2, 1, O)}
      ${rect(x - 2, y, 1, 2, O)}${rect(x + 1, y, 1, 2, O)}
      ${rect(x - 7, y - 4, 2, 1, Bd)}
    </g>`;
  }

  function build() {
    const el = document.getElementById('qpScene');
    if (!el || el.dataset.built) return;
    el.dataset.built = '1';
    const W = 320, H = 120, bank = 92;
    const leftTrees = [[24, 78, -.3], [48, 62, -1.1], [70, 56, -.6], [8, 52, -1.6], [92, 44, -2.1]];
    const rightTrees = [[244, 58, -.8], [264, 70, -.2], [288, 80, -1.3], [310, 60, -.5], [228, 46, -1.9]];
    const rod = { x: 120, y: bank - 8 };
    n++;
    const narrow = window.innerWidth < 720; // phones: show the left bank (trees + fishing bird)
    el.innerHTML = `<svg viewBox="${narrow ? '0 0 168 120' : `0 0 ${W} ${H}`}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">
      <g class="qp-clouds">${cloud(70, 34, 3)}${cloud(150, 46, 4)}${cloud(205, 30, 3)}${cloud(-30, 52, 3)}</g>
      <g class="qp-flock"><path d="M0 0h1v1h1v1h1V1h1V0h1v1H4v1H3v1H2V2H1V1H0z" fill="#3e5a52"/><path transform="translate(8 3)" d="M0 0h1v1h1v1h1V1h1V0h1v1H4v1H3v1H2V2H1V1H0z" fill="#3e5a52"/></g>
      ${leftTrees.sort((a, b) => a[1] - b[1]).map(([x, h, s]) => pine(x, bank, h, s)).join('')}
      ${rightTrees.sort((a, b) => a[1] - b[1]).map(([x, h, s]) => pine(x, bank, h, s)).join('')}
      ${grass(4, 128, bank)}${grass(222, 96, bank)}
      ${flower(70, bank - 4)}${flower(250, bank - 4)}${flower(233, bank - 3)}
      ${rect(104, bank - 4, 6, 4, '#7a8a8f')}${rect(104, bank - 5, 6, 1, '#2b2b2b')}${rect(105, bank - 3, 4, 1, '#9fb0b5')}
      ${fishingBird(rod.x - 4, bank - 1)}
      <g class="qp-rod">
        <path d="M${rod.x - 2} ${bank - 6} L${rod.x + 18} ${bank - 26}" stroke="#6b4a3a" stroke-width="1.2" shape-rendering="auto"/>
        <path d="M${rod.x + 18} ${bank - 26} L${rod.x + 18} ${bank + 7}" stroke="#2b2b2b" stroke-width=".4" shape-rendering="auto"/>
      </g>
      <rect x="0" y="${bank + 5}" width="${W}" height="${H - bank - 5}" fill="#9cbcb6"/>
      <rect x="0" y="${bank + 5}" width="${W}" height="1" fill="#7fa29c"/>
      <g class="qp-shimmer">${Array.from({ length: 34 }, (_, i) => rect((i * 47) % (W + 40) - 20, bank + 8 + ((i * 13) % 18), 3 + (i % 4) * 2, 1, i % 3 ? '#c8dcd6' : '#e3eeea')).join('')}</g>
      <g class="qp-bobber">${rect(rod.x + 17, bank + 6, 3, 2, '#e8735f')}${rect(rod.x + 17, bank + 8, 3, 1, '#fbf3e4')}</g>
      <g class="qp-ripple">${rect(rod.x + 13, bank + 10, 11, 1, '#e3eeea')}</g>
      <g class="qp-reflect" opacity=".35">${rect(rod.x - 8, bank + 8, 10, 6, '#e8735f')}</g>
      <g class="qp-fish">${rect(0, 0, 5, 2, '#f2a93b')}${rect(5, -1, 2, 4, '#f2a93b')}${rect(1, 0, 1, 1, '#2b2b2b')}</g>
    </svg>`;
  }

  window.buildLoginScene = build;
})();
