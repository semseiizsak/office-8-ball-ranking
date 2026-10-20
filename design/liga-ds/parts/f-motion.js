/* Motion section: curve graph, duration scale, live token demos, choreography, reduced motion. */
(() => {
  const sec = document.getElementById('motion');
  if (!sec || !sec.querySelector('.fm-top')) return;
  const $ = (s, r = sec) => r.querySelector(s);
  const $$ = (s, r = sec) => [...r.querySelectorAll(s)];
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mq.matches;
  const nb = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // cubic-bezier(.65,0,.35,1)
  const X1 = .65, Y1 = 0, X2 = .35, Y2 = 1;
  const bz = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const ease = (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 30; i++) { t = (lo + hi) / 2; if (bz(t, X1, X2) < x) lo = t; else hi = t; }
    return bz(t, Y1, Y2);
  };
  const tween = (ms, fn, done) => {
    if (reduced()) { fn(1, 1); done && done(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const x = Math.min(1, (now - t0) / ms);
      fn(ease(x), x);
      if (x < 1) requestAnimationFrame(step); else done && done();
    };
    requestAnimationFrame(step);
  };
  const restart = (el, cls = 'go') => { el.classList.remove(cls); el.classList.add('reset'); void el.offsetWidth; el.classList.remove('reset'); el.classList.add(cls); };
  const timers = {};
  const later = (k, ms, fn) => { clearTimeout(timers[k]); timers[k] = setTimeout(fn, reduced() ? 0 : ms); };

  // Curve
  let curveMs = 1200;
  const dot = $('[data-fm-dot]'), gx = $('[data-fm-gx]'), gy = $('[data-fm-gy]'), out = $('[data-fm-out]');
  const tOut = $('[data-fm-t]'), pOut = $('[data-fm-p]');
  const lanes = $$('[data-fm-lane]');
  const drawCurve = (p, x) => {
    const cx = 40 + x * 280, cy = 300 - p * 280;
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    gx.setAttribute('x1', cx); gx.setAttribute('x2', cx); gx.setAttribute('y1', 300); gx.setAttribute('y2', cy);
    gy.setAttribute('x1', 40); gy.setAttribute('x2', cx); gy.setAttribute('y1', cy); gy.setAttribute('y2', cy);
    out.setAttribute('y', cy); out.setAttribute('height', 300 - cy);
    tOut.textContent = x.toFixed(2); pOut.textContent = p.toFixed(2);
    lanes.forEach((l) => {
      const w = l.parentElement.clientWidth - 8;
      l.style.setProperty('--w', w + 'px');
      l.style.setProperty('--p', l.dataset.fmLane === 'ease' ? p : x);
    });
  };
  let curveRun = 0;
  const playCurve = () => {
    const id = ++curveRun;
    drawCurve(0, 0);
    tween(curveMs, (p, x) => id === curveRun && drawCurve(p, x));
  };
  $('[data-fm-dur]').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', b.parentElement).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    curveMs = +b.dataset.ms; playCurve();
  });

  // Demos
  const pressBtn = $('.fm-press-btn');
  const chip = $('[data-fm-chip]'), toastEl = $('[data-fm-toast]');
  const counters = $$('[data-fm-n]');
  const ranks = [$('[data-fm-rank-a]'), $('[data-fm-rank-b]')], elo = $('[data-fm-elo]');

  const PLAY = {
    curve: playCurve,
    scale: () => restart($('[data-fm=scale]'), 'on'),
    press: () => {
      pressBtn.classList.add('down');
      later('press', 120 + 260, () => pressBtn.classList.remove('down'));
    },
    fast: () => {
      chip.setAttribute('aria-pressed', 'false'); toastEl.classList.add('off');
      later('fast1', 420, () => { chip.setAttribute('aria-pressed', 'true'); toastEl.classList.remove('off'); });
    },
    base: () => {
      const s = $('[data-fm=base] [data-fm-sheet]');
      s.classList.add('reset'); s.classList.remove('open'); void s.offsetWidth; s.classList.remove('reset');
      later('base', 200, () => s.classList.add('open'));
    },
    slow: () => {
      restart($('.fm-prog'), 'on');
      tween(400, (p) => counters.forEach((c) => (c.textContent = Math.round(+c.dataset.fmN * p))));
    },
    scene: () => {
      restart($('.fm-crown'));
      ranks[0].textContent = '1'; ranks[1].textContent = '2';
      later('scene', 600, () => { ranks[0].textContent = '2'; ranks[1].textContent = '1'; });
      tween(1200, (p) => (elo.textContent = nb(Math.round(1248 + 68 * p))));
    },
    chor: () => restart($('[data-fm=chor]'), 'on'),
    reduce: () => {
      $$('[data-fm=reduce] [data-fm-sheet]').forEach((s) => { s.classList.add('reset'); s.classList.remove('open'); void s.offsetWidth; s.classList.remove('reset'); });
      later('reduce', 300, () => $$('[data-fm=reduce] [data-fm-sheet]').forEach((s) => s.classList.add('open')));
    },
  };
  const playAll = () => Object.values(PLAY).forEach((f) => f());

  sec.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fmPlay) PLAY[b.dataset.fmPlay]();
    else if (b.matches('[data-fm-all]')) playAll();
  });
  pressBtn.addEventListener('pointerdown', () => pressBtn.classList.add('down'));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => pressBtn.addEventListener(ev, () => pressBtn.classList.remove('down')));

  const sys = $('[data-fm-sys]');
  const syncSys = () => (sys.hidden = !reduced());
  syncSys(); mq.addEventListener?.('change', syncSys);

  drawCurve(1, 1);
  addEventListener('resize', () => drawCurve(+pOut.textContent, +tOut.textContent));

  // Play each block once when it scrolls into view
  const seen = new WeakSet();
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    if (!en.isIntersecting || seen.has(en.target)) return;
    seen.add(en.target);
    const k = en.target.dataset.fm;
    if (k === 'press' || k === 'fast' || k === 'base' || k === 'slow' || k === 'scene') {
      ['press', 'fast', 'base', 'slow', 'scene'].forEach((n) => PLAY[n]());
      $$('.fm-tile').forEach((t) => seen.add(t));
    } else PLAY[k]();
  }), { threshold: .5 });
  $$('[data-fm]').forEach((el) => io.observe(el));
})();
