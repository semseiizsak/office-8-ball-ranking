/* Liga design system: Data and charts behaviour (prefix dv-). No globals. */
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const txt = (parent, x, y, s, attrs = {}) => { const t = el('text', { x, y, ...attrs }, parent); t.textContent = s; return t; };

  /* ---------- Draw-in on scroll ---------- */
  const cards = $$('[id^="dv-"] .dv-card');
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('dv-in'); io.unobserve(e.target); }
  }), { threshold: 0.35 }) : null;
  if (io && !reduce.matches) cards.forEach((c) => { c.classList.add('dv-armed'); io.observe(c); });
  const replay = (card) => {
    if (reduce.matches || !card || !card.classList.contains('dv-armed')) return;
    card.classList.remove('dv-in');
    void card.offsetWidth;
    requestAnimationFrame(() => card.classList.add('dv-in'));
  };

  /* ---------- Rating chart ---------- */
  const OPP = ['Dave', 'Mira', 'Sam', 'Kim', 'Ann', 'Joe'];
  const ELO = [1200, 1214, 1203, 1219, 1232, 1221, 1238, 1251, 1262, 1249, 1240, 1228, 1216, 1224, 1235, 1229, 1241, 1233, 1225, 1237];
  const T0 = new Date(2026, 8, 1).getTime();
  const SPAN = new Date(2026, 9, 19).getTime() - T0;
  const SEASON = ELO.map((v, i) => ({
    v, d: new Date(T0 + (SPAN * i) / (ELO.length - 1)),
    opp: i ? OPP[(i * 5) % OPP.length] : '', delta: i ? v - ELO[i - 1] : 0,
  }));

  function eloChart(box) {
    const player = box.dataset.player || 'green';
    const card = box.closest('.dv-card');
    let data = SEASON, idx = -1, geo = null;
    const tip = document.createElement('div');
    tip.className = 'dv-tip';

    function render() {
      const W = box.clientWidth, H = box.clientHeight;
      if (!W) return;
      const pad = { l: 4, r: 44, t: 26, b: 24 };
      const vals = data.map((p) => p.v).concat(1200);
      let lo = Math.min(...vals), hi = Math.max(...vals);
      const step = 25;
      lo = Math.floor((lo - 8) / step) * step; hi = Math.ceil((hi + 8) / step) * step;
      const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (data.length - 1);
      const y = (v) => pad.t + ((hi - v) * (H - pad.t - pad.b)) / (hi - lo);
      geo = { x, y };
      box.textContent = '';
      const svg = el('svg', { class: 'dv-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }, box);
      [hi, (hi + lo) / 2, lo].forEach((v) => {
        el('line', { class: 'dv-grid-ln', x1: 0, x2: W - pad.r + 8, y1: y(v), y2: y(v) }, svg);
        txt(svg, W, y(v) + 4, fmt(v), { 'text-anchor': 'end' });
      });
      el('line', { class: 'dv-base', x1: 0, x2: W - pad.r + 8, y1: y(1200), y2: y(1200) }, svg);
      txt(svg, 0, y(1200) + 15, 'Start 1 200', { class: 'dv-lbl-strong' });
      txt(svg, pad.l, H - 4, day(data[0].d));
      txt(svg, x(data.length - 1), H - 4, 'Today', { 'text-anchor': 'end' });
      const guide = el('line', { class: 'dv-guide', y1: pad.t - 8, y2: H - pad.b }, svg);
      el('path', {
        class: 'dv-line dv-draw', pathLength: 1, style: `stroke:var(--pct-${player})`,
        d: data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(''),
      }, svg);
      let pk = 0; data.forEach((p, i) => { if (p.v > data[pk].v) pk = i; });
      const last = data.length - 1;
      if (pk !== last) {
        const px = x(pk), anchor = px < 50 ? 'start' : px > W - pad.r - 40 ? 'end' : 'middle';
        el('circle', { class: 'dv-peak dv-pop', cx: px, cy: y(data[pk].v), r: 4.5 }, svg);
        txt(svg, px, y(data[pk].v) - 11, `Peak ${fmt(data[pk].v)}`, { class: 'dv-lbl-strong', 'text-anchor': anchor });
      }
      el('circle', { class: 'dv-cur dv-pop', cx: x(last), cy: y(data[last].v), r: 6, style: `fill:var(--pc-${player});stroke:var(--pct-${player})` }, svg);
      const hot = el('circle', { class: 'dv-hot', r: 5.5, style: `fill:var(--pc-${player})` }, svg);
      box.appendChild(tip);
      geo.guide = guide; geo.hot = hot; geo.W = W;
      if (idx >= 0) show(Math.min(idx, last));
    }

    function show(i) {
      idx = i;
      const p = data[i], { x, y, guide, hot, W } = geo;
      const cx = x(i), cy = y(p.v);
      guide.setAttribute('x1', cx); guide.setAttribute('x2', cx);
      hot.setAttribute('cx', cx); hot.setAttribute('cy', cy);
      const d = p.delta;
      tip.innerHTML = `<b>${fmt(p.v)}${i ? `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : '−'}${Math.abs(d)}</span>` : ''}</b><span>${day(p.d)}${i ? `, ${d >= 0 ? 'beat' : 'lost to'} ${p.opp}` : ', season start'}</span>`;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const left = Math.max(0, Math.min(W - tw, cx - tw / 2));
      const top = cy - th - 14 < 0 ? cy + 14 : cy - th - 14;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
      box.classList.add('dv-active');
    }
    const hide = () => { idx = -1; box.classList.remove('dv-active'); };
    const pick = (e) => {
      if (!geo) return;
      const r = box.getBoundingClientRect();
      const rel = (e.clientX - r.left - geo.x(0)) / (geo.x(data.length - 1) - geo.x(0));
      show(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
    };
    box.addEventListener('pointermove', pick);
    box.addEventListener('pointerdown', pick);
    box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target)) hide(); });
    box.addEventListener('keydown', (e) => {
      const last = data.length - 1;
      const k = { ArrowRight: 1, ArrowLeft: -1, Home: -999, End: 999 }[e.key];
      if (k !== undefined) { e.preventDefault(); show(Math.max(0, Math.min(last, (idx < 0 ? last : idx) + k))); }
      if (e.key === 'Escape') hide();
    });
    box.addEventListener('blur', hide);

    const seg = card && card.querySelector('[data-dv-range]');
    if (seg) seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-range]');
      if (!b) return;
      $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const cut = T0 + SPAN - 30 * 864e5;
      data = b.dataset.range === '30' ? SEASON.filter((p) => p.d.getTime() >= cut) : SEASON;
      hide(); render(); replay(card);
    });

    new ResizeObserver(render).observe(box);
    render();
  }
  $$('[data-dv-elo]').forEach(eloChart);

  /* ---------- Bar chart scrub ---------- */
  $$('[data-dv-bars]').forEach((wrap) => {
    const plot = wrap.querySelector('.dv-bars-plot');
    const cols = $$('.dv-col', plot);
    const readB = wrap.querySelector('.dv-bars-now b'), readS = wrap.querySelector('.dv-bars-now span');
    let cur = cols.findIndex((c) => c.classList.contains('sel'));
    const sel = (i) => {
      cur = i;
      cols.forEach((c, j) => c.classList.toggle('sel', j === i));
      const c = cols[i], n = c.dataset.n;
      readB.textContent = n;
      readS.textContent = c.classList.contains('now') ? 'This week so far' : `${n === '1' ? 'match' : 'matches'}, week of ${c.dataset.label.replace('Week of ', '')}`;
    };
    const pick = (e) => {
      const r = plot.getBoundingClientRect();
      sel(Math.max(0, Math.min(cols.length - 1, Math.floor(((e.clientX - r.left) / r.width) * cols.length))));
    };
    plot.addEventListener('pointerdown', pick);
    plot.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e); });
    plot.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') sel(cols.length - 1); });
    plot.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowLeft: -1, Home: -99, End: 99 }[e.key];
      if (k === undefined) return;
      e.preventDefault();
      sel(Math.max(0, Math.min(cols.length - 1, cur + k)));
    });
  });

  /* ---------- Season race ---------- */
  const RACE = [
    ['mira', 'Mira', 'orange', [3, 2, 2, 1, 1, 1, 1, 1]],
    ['dave', 'Dave', 'blue', [1, 1, 1, 2, 3, 2, 2, 2]],
    ['you', 'You', 'green', [5, 4, 3, 3, 2, 3, 3, 3]],
    ['sam', 'Sam', 'yellow', [2, 3, 4, 4, 4, 4, 5, 4]],
    ['kim', 'Kim', 'purple', [4, 5, 5, 5, 5, 5, 4, 5]],
  ];
  $$('[data-dv-race]').forEach((box) => {
    const card = box.closest('.dv-card');
    let focus = '';
    function render() {
      const W = box.clientWidth, H = box.clientHeight;
      if (!W) return;
      const pad = { l: 22, r: 52, t: 10, b: 24 }, n = RACE[0][3].length;
      const x = (i) => pad.l + 8 + (i * (W - pad.l - pad.r - 16)) / (n - 1);
      const y = (r) => pad.t + ((r - 1) * (H - pad.t - pad.b)) / 4;
      box.textContent = '';
      const svg = el('svg', { class: 'dv-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }, box);
      for (let r = 1; r <= 5; r++) {
        el('line', { class: 'dv-grid-ln', x1: pad.l, x2: W - pad.r + 6, y1: y(r), y2: y(r) }, svg);
        txt(svg, 0, y(r) + 4, String(r), { class: 'dv-lbl-strong' });
      }
      for (let i = 0; i < n; i++) txt(svg, x(i), H - 4, String(i + 1), { 'text-anchor': 'middle' });
      const order = RACE.slice().sort((a, b) => (a[0] === focus) - (b[0] === focus));
      order.forEach(([key, name, col, ranks]) => {
        const g = el('g', { class: focus ? (key === focus ? 'on' : 'off') : '' }, svg);
        el('path', { class: 'ln dv-draw', pathLength: 1, style: `stroke:var(--pct-${col})`, d: ranks.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r)}`).join('') }, g);
        const lx = x(n - 1), ly = y(ranks[n - 1]);
        el('circle', { class: 'pt dv-pop', cx: lx, cy: ly, r: 5, style: `fill:var(--pc-${col})` }, g);
        txt(g, lx + 12, ly + 4, name, { class: 'nm', style: `fill:var(--pct-${col})` });
      });
      box.classList.toggle('dv-focus', !!focus);
    }
    const keys = card && card.querySelector('[data-dv-race-keys]');
    if (keys) keys.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]');
      if (!b) return;
      $$('button', keys).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      focus = b.dataset.p;
      render();
    });
    new ResizeObserver(render).observe(box);
    render();
  });

  if (window.lucide) lucide.createIcons();
})();
