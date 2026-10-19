/* Liga design system: motion demos (Animation group). Prefix mo-. */
(() => {
  const group = document.getElementById('mo-micro');
  if (!group) return;
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  const EASE = () => css('--ease') || 'cubic-bezier(.65,0,.35,1)';
  const FALLBACK = { press: 120, fast: 180, base: 280, slow: 400, scene: 1200 };
  const D = (n) => parseFloat(css('--d-' + n)) || FALLBACK[n];
  const COUNT = () => parseFloat(css('--mo-count')) || 800;
  const STAG = () => parseFloat(css('--mo-stagger')) || 40;
  const RISE = () => (parseFloat(css('--mo-rise')) || 8) + 'px';

  // Reduced motion: real preference or the preview switch
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let sim = false;
  const R = () => sim || mq.matches;

  // Same curve as --ease, for JS driven number counts
  const ease = (() => {
    const [x1, y1, x2, y2] = [0.65, 0, 0.35, 1];
    const b = (a1, a2, u) => 3 * a1 * u * (1 - u) ** 2 + 3 * a2 * u * u * (1 - u) + u ** 3;
    return (t) => {
      let lo = 0, hi = 1, u = t;
      for (let i = 0; i < 24; i++) { u = (lo + hi) / 2; if (b(x1, x2, u) < t) lo = u; else hi = u; }
      return b(y1, y2, u);
    };
  })();
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const k = (box, n) => $(`[data-k="${n}"]`, box);
  const ks = (box, n) => $$(`[data-k="${n}"]`, box);

  // ---------- Run context ----------
  function stop(box) {
    (box._moA || []).forEach((a) => a.cancel());
    (box._moT || []).forEach(clearTimeout);
    box._moA = []; box._moT = [];
    box._moGen = (box._moGen || 0) + 1;
    $$('.mo-confetti', box).forEach((c) => { c.innerHTML = ''; });
  }
  function ctx(box) {
    const r = R();
    const gen = box._moGen;
    const T = (ms) => (r ? 0 : ms);
    const c = {
      box, r, T,
      // keep:true runs the real timing even in reduced mode (fade only demos)
      A(el, frames, d, delay = 0, o = {}) {
        if (!el) return null;
        const { keep, ...rest } = o;
        const a = el.animate(frames, { duration: keep ? d : T(d), delay: keep ? delay : T(delay), easing: EASE(), fill: 'both', ...rest });
        box._moA.push(a);
        return a;
      },
      rise(el, delay = 0, d = D('base')) {
        return c.A(el, [{ opacity: 0, transform: `translateY(${RISE()})` }, { opacity: 1, transform: 'none' }], d, delay);
      },
      fadeIn(el, delay = 0, d = D('base')) { return c.A(el, [{ opacity: 0 }, { opacity: 1 }], d, delay); },
      wait(ms, fn) { box._moT.push(setTimeout(fn, T(ms))); },
      count(el, from, to, d, delay = 0, f = fmt) {
        if (!el) return;
        if (r || !d) { el.textContent = f(to); return; }
        el.textContent = f(from);
        const go = () => {
          const t0 = performance.now();
          const tick = (now) => {
            if (box._moGen !== gen) return;
            const p = Math.min(1, (now - t0) / d);
            el.textContent = f(from + (to - from) * ease(p));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        };
        if (delay) box._moT.push(setTimeout(go, delay)); else go();
      },
    };
    return c;
  }

  // ---------- Helpers ----------
  function select(slide, idx, animate) {
    const btns = $$('button', slide);
    const btn = btns[idx];
    if (!btn) return;
    const attr = btn.hasAttribute('aria-selected') ? 'aria-selected' : 'aria-pressed';
    btns.forEach((b) => b.setAttribute(attr, String(b === btn)));
    const ind = $('.mo-ind', slide);
    if (!animate) ind.style.transition = 'none';
    ind.style.width = btn.offsetWidth + 'px';
    ind.style.height = btn.offsetHeight + 'px';
    ind.style.transform = `translate(${btn.offsetLeft}px,${btn.offsetTop}px)`;
    if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  const selIdx = (slide) => $$('button', slide).findIndex((b) => b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-pressed') === 'true');

  function setRanks(list, phase) {
    const rows = $$(':scope > .row', list);
    rows.sort((a, b) => +a.dataset[phase] - +b.dataset[phase]).forEach((row) => {
      list.append(row);
      $('.rank', row).textContent = row.dataset[phase];
      $('.elo', row).textContent = row.dataset[phase === 'r0' ? 'e0' : 'e1'];
    });
  }
  function rankSwap(c, list, d) {
    const rows = $$(':scope > .row', list);
    const first = new Map(rows.map((n) => [n, n.getBoundingClientRect().top]));
    setRanks(list, 'r1');
    const mover = $('[data-up]', list);
    const elo = $('.elo', mover);
    c.count(elo, parseInt(mover.dataset.e0.replace(/\D/g, ''), 10), parseInt(mover.dataset.e1.replace(/\D/g, ''), 10), d);
    if (c.r) return;
    rows.forEach((n) => {
      const dy = first.get(n) - n.getBoundingClientRect().top;
      if (dy) c.A(n, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], d, 0, { fill: 'none' });
    });
  }

  function draw(c, path, d, delay) {
    if (!path) return;
    const L = 100;
    path.setAttribute('pathLength', L);
    path.style.strokeDasharray = L;
    c.A(path, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], d, delay);
  }
  function fill(c, bar, d, delay) {
    if (!bar) return;
    const w = bar.style.width;
    c.A(bar, [{ width: '0%' }, { width: w }], d, delay);
  }

  const PC = ['yellow', 'blue', 'red', 'purple', 'orange', 'green', 'maroon'];
  function confetti(c, layer, n, start, spread, minD, maxD) {
    if (c.r || !layer) return;
    const h = layer.clientHeight + 24;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = (4 + Math.random() * 92) + '%';
      p.style.background = `var(--pc-${PC[i % PC.length]})`;
      const s = 5 + Math.round(Math.random() * 4);
      p.style.width = p.style.height = s + 'px';
      layer.append(p);
      const rot = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 180);
      c.A(p, [{ transform: 'translateY(0) rotate(0deg)' }, { transform: `translateY(${h}px) rotate(${rot}deg)` }],
        minD + Math.random() * (maxD - minD), start + Math.random() * spread);
    }
  }

  // ---------- Demos ----------
  const DEFS = {
    press: {
      play(c) {
        const b = $('.btn', c.box.querySelector('[data-mo-stage]'));
        c.A(b, [{ transform: 'scale(1)' }, { transform: 'scale(.97)' }, { transform: 'scale(1)' }], D('press') * 2, 200);
      },
    },
    toggle: {
      play(c) {
        const t = $('[data-mo-toggle]', c.box);
        c.box.classList.add('mo-rm');
        t.setAttribute('aria-checked', 'false');
        void t.offsetWidth;
        c.box.classList.toggle('mo-rm', c.r);
        c.wait(300, () => t.setAttribute('aria-checked', 'true'));
      },
    },
    seg: {
      play(c) {
        const s = $('[data-mo-slide]', c.box);
        select(s, 0, false);
        c.wait(250, () => select(s, 1, !c.r));
        c.wait(750, () => select(s, 2, !c.r));
      },
    },
    tabs: {
      play(c) {
        const s = $('[data-mo-slide]', c.box);
        select(s, 0, false);
        c.wait(250, () => select(s, 1, !c.r));
        c.wait(750, () => select(s, 2, !c.r));
      },
    },
    stagger: {
      play(c) { $$('.row', c.box).forEach((row, i) => c.rise(row, 100 + i * STAG())); },
    },
    count: {
      play(c) { c.count($('[data-mo-num]', c.box), 1230, 1248, COUNT(), 150); },
    },
    delta: {
      noFade: true,
      play(c) {
        const pop = $('[data-mo-pop]', c.box);
        const y = c.r ? (v) => ({}) : (v) => ({ transform: `translateY(${v})` });
        c.A(pop, [
          { opacity: 0, ...y(RISE()), easing: EASE() },
          { opacity: 1, ...y('0px'), offset: 0.2 },
          { opacity: 1, ...y('0px'), offset: 0.75, easing: EASE() },
          { opacity: 0, ...y('-' + RISE()) },
        ], D('scene'), 150, { keep: true, easing: 'linear' });
      },
    },
    rank: {
      reset(c) { setRanks($('[data-mo-ranks]', c.box), 'r0'); },
      play(c) { c.wait(300, () => rankSwap(c, $('[data-mo-ranks]', c.box), D('slow'))); },
    },
    sheet: {
      play(c) {
        c.fadeIn($('[data-mo-scrim]', c.box), 150);
        c.A($('[data-mo-sheet]', c.box), [{ transform: 'translateY(100%)' }, { transform: 'none' }], D('base'), 150);
      },
    },
    toast: {
      noFade: true,
      play(c) {
        const total = 2200, f = D('fast') / total;
        const y = c.r ? () => ({}) : (v) => ({ transform: `translateY(${v})` });
        c.A($('[data-mo-toast]', c.box), [
          { opacity: 0, ...y(RISE()), easing: EASE() },
          { opacity: 1, ...y('0px'), offset: f },
          { opacity: 1, ...y('0px'), offset: 1 - f, easing: EASE() },
          { opacity: 0, ...y('0px') },
        ], total, 150, { keep: true, easing: 'linear' });
      },
    },
    skel: {
      noFade: true, // already a crossfade, kept in reduced motion
      play(c) {
        const o = { keep: true };
        c.A($('[data-mo-skel]', c.box), [{ opacity: 1 }, { opacity: 0 }], D('base'), 900, o);
        c.A($('[data-mo-content]', c.box), [{ opacity: 0 }, { opacity: 1 }], D('base'), 900, o);
      },
    },
    like: {
      play(c) {
        const b = $('[data-mo-like]', c.box);
        b.setAttribute('aria-pressed', 'false');
        $('.num', b).textContent = '3';
        c.wait(200, () => { b.setAttribute('aria-pressed', 'true'); $('.num', b).textContent = '4'; });
        likePop(c, b, 200);
      },
    },
    prog: {
      play(c) {
        c.A($('[data-mo-bar]', c.box), [{ width: '0%' }, { width: '72%' }], D('slow'), 150);
        c.count($('[data-mo-pct]', c.box), 0, 72, D('slow'), 150, (n) => Math.round(n) + '%');
      },
    },
    dot: {
      play(c) { c.A($('[data-mo-ud]', c.box), [{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1)' }], D('fast'), 250); },
    },

    // ---------- Scenes ----------
    saved: {
      reset(c) { setRanks(k(c.box, 'list'), 'r0'); },
      play(c) {
        const b = c.box;
        c.A(k(b, 'av'), [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], D('slow'));
        c.rise(k(b, 'head'), 150);
        c.fadeIn(k(b, 'big'), 200);
        c.count(k(b, 'big'), 0, 14, COUNT(), 200, (n) => '+' + Math.round(n));
        c.A(k(b, 'coin'), [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], D('slow'), 450);
        c.rise(k(b, 'chart'), 300);
        draw(c, k(b, 'line'), 700, 350);
        c.fadeIn(k(b, 'list'), 550);
        c.wait(900, () => rankSwap(c, k(b, 'list'), D('slow')));
        ks(b, 'bd').forEach((e, i) => c.rise(e, 950 + i * STAG()));
        c.fadeIn(k(b, 'btn'), 1050);
      },
    },
    crown: {
      play(c) {
        const b = c.box;
        c.A(k(b, 'fill'), [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], 500);
        c.A(k(b, 'icon'), [{ opacity: 0, transform: 'translateY(-120px)' }, { opacity: 1, transform: 'none' }], 500, 250);
        c.rise(k(b, 'hero'), 550);
        c.rise(k(b, 'sub'), 650);
        ks(b, 'stat').forEach((e, i) => c.rise(e, 650 + i * STAG()));
        c.rise(k(b, 'bounty'), 760);
        c.count(k(b, 'bnum'), 0, 120, 500, 800);
        c.rise(k(b, 'notify'), 860);
        c.fadeIn(k(b, 'acts'), 960);
      },
    },
    challenge: {
      play(c) {
        const b = c.box;
        // two axes on different timings draw a curve, both on the same ease in out
        c.A(k(b, 'flyx'), [{ transform: 'translateX(-300px)' }, { transform: 'none' }], 700);
        c.A(k(b, 'flyy'), [{ transform: 'translateY(300px) rotate(-12deg)' }, { transform: 'none' }], 500);
        ks(b, 'tile').forEach((t, i) => c.rise(t, 700 + i * STAG()));
        c.rise(k(b, 'opp'), 0);
        c.rise(k(b, 'title'), 760);
        c.rise(k(b, 'sub'), 820);
        c.rise(k(b, 'exp'), 860);
        fill(c, k(b, 'expbar'), D('slow'), 900);
        c.fadeIn(k(b, 'btn'), 1000);
      },
    },
    badge: {
      play(c) {
        const b = c.box;
        const arc = k(b, 'arc');
        const C = 2 * Math.PI * arc.r.baseVal.value;
        arc.style.strokeDasharray = C;
        c.A(arc, [{ strokeDashoffset: C }, { strokeDashoffset: 0 }], 900);
        const em = k(b, 'em');
        c.A(em, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }], 900);
        c.A(em, [{ opacity: 0 }, { opacity: 1 }], 300, 0, { composite: 'replace' });
        c.rise(k(b, 'name'), 700);
        c.rise(k(b, 'desc'), 760);
        c.rise(k(b, 'tier'), 820);
        fill(c, k(b, 'tierbar'), D('slow'), 880);
        c.rise(k(b, 'others'), 900);
        c.rise(k(b, 'coin'), 960);
        c.fadeIn(k(b, 'btn'), 1020);
        confetti(c, k(b, 'confetti'), 36, 250, 300, 750, 850);
      },
    },
    cup: {
      play(c) {
        const b = c.box;
        c.A(k(b, 'trophy'), [{ opacity: 0, transform: 'translateY(80px)' }, { opacity: 1, transform: 'none' }], 600);
        c.A(k(b, 'rays'), [{ clipPath: 'circle(0% at 50% 50%)', transform: 'rotate(-24deg)' }, { clipPath: 'circle(50% at 50% 50%)', transform: 'none' }], 900, 150);
        c.A(k(b, 'name'), [{ transform: 'translateY(105%)' }, { transform: 'none' }], D('slow'), 450);
        c.rise(k(b, 'title'), 600);
        c.rise(k(b, 'final'), 660);
        ks(b, 'slot').forEach((e, i) => c.rise(e, 720 + i * STAG()));
        c.rise(k(b, 'coin'), 860);
        c.fadeIn(k(b, 'btn'), 920);
        confetti(c, k(b, 'confetti'), 36, 700, 120, 520, 580);
      },
    },
    live: {
      play(c) {
        const b = c.box;
        c.A(k(b, 'a'), [{ transform: 'translateX(-115%)' }, { transform: 'none' }], 500);
        c.A(k(b, 'b'), [{ transform: 'translateX(115%)' }, { transform: 'none' }], 500);
        c.A(k(b, 'vs'), [{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'none' }], D('base'), 480);
        if (!c.r) c.A(k(b, 'flash'), [{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0 }], 360, 480, { fill: 'none' });
        const pill = k(b, 'pill');
        c.A(pill, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], 200, 760);
        if (!c.r) c.A(pill, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], 250, 900, { iterations: 2, fill: 'none' });
        c.fadeIn(k(b, 'watch'), 760);
        c.rise(k(b, 'odds'), 820);
        fill(c, k(b, 'oa'), D('slow'), 860);
        fill(c, k(b, 'ob'), D('slow'), 860);
        c.rise(k(b, 'viewers'), 880);
        ks(b, 'msg').forEach((e, i) => c.rise(e, 940 + i * STAG()));
        c.fadeIn(k(b, 'btn'), 1060);
      },
    },
  };

  function likePop(c, btn, delay) {
    c.A(btn, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], D('base'), delay);
  }

  function play(box) {
    const def = DEFS[box.dataset.mo];
    if (!def) return;
    stop(box);
    const c = ctx(box);
    box.classList.toggle('mo-rm', c.r);
    def.reset?.(c);
    def.play(c);
    if (c.r && !def.noFade) c.A(box.querySelector('[data-mo-stage]'), [{ opacity: 0 }, { opacity: 1 }], D('base'), 0, { keep: true });
  }

  const boxes = $$('[data-mo]');

  // ---------- Wiring ----------
  boxes.forEach((box) => {
    $('[data-mo-replay]', box)?.addEventListener('click', () => play(box));
  });

  // live interaction on the demos themselves
  $$('[data-mo-slide]').forEach((s) => {
    $$('button', s).forEach((b, i) => b.addEventListener('click', () => {
      const box = s.closest('[data-mo]');
      if (box) stop(box);
      select(s, i, !R());
    }));
  });
  $$('[data-mo-toggle]').forEach((t) => t.addEventListener('click', () => {
    t.closest('[data-mo]')?.classList.toggle('mo-rm', R());
    t.setAttribute('aria-checked', String(t.getAttribute('aria-checked') !== 'true'));
  }));
  $$('[data-mo-like]').forEach((b) => b.addEventListener('click', () => {
    const box = b.closest('[data-mo]');
    const was = b.getAttribute('aria-pressed') === 'true';
    // page.js flips .react on document click; flip here only if nothing else did
    setTimeout(() => {
      if ((b.getAttribute('aria-pressed') === 'true') === was) b.setAttribute('aria-pressed', String(!was));
      const on = b.getAttribute('aria-pressed') === 'true';
      $('.num', b).textContent = on ? '4' : '3';
      if (on && !R()) { stop(box); likePop(ctx(box), b, 0); }
    }, 0);
  }));

  // reduced motion preview switch(es)
  const rmSw = $$('[data-mo-rm]');
  rmSw.forEach((t) => t.addEventListener('click', () => {
    sim = !sim;
    rmSw.forEach((x) => x.setAttribute('aria-checked', String(sim)));
  }));

  // indicators: place without animation now, after fonts, and on resize
  const slides = $$('[data-mo-slide]');
  const placeAll = () => slides.forEach((s) => select(s, Math.max(0, selIdx(s)), false));
  placeAll();
  document.fonts?.ready.then(placeAll);
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(placeAll); slides.forEach((s) => ro.observe(s)); }

  // play each demo once when it first comes into view
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      play(e.target);
    }), { threshold: 0.5 });
    boxes.forEach((b) => io.observe(b));
  }
})();
