/* Liga: navigation pattern demos (prefix nv-). Large title, page tabs, back stack, sheet detents, modal stack,
   action sheet, context menu, FAB menu, tablet split view. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = 280;

  // cubic-bezier(.65,0,.35,1), the --ease token
  const bz = (u, a, b) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  const dbz = (u, a, b) => 3 * (1 - u) * (1 - u) * a + 6 * (1 - u) * u * (b - a) + 3 * u * u * (1 - b);
  const ease = (t) => {
    let u = t;
    for (let i = 0; i < 8; i++) { const d = dbz(u, .65, .35); if (Math.abs(d) < 1e-6) break; u -= (bz(u, .65, .35) - t) / d; u = clamp(u); }
    return bz(u, 0, 1);
  };
  const tween = (from, to, cb, done) => {
    if (reduce()) { cb(to); done && done(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / DUR);
      cb(from + (to - from) * ease(k));
      if (k < 1) requestAnimationFrame(step); else done && done();
    };
    requestAnimationFrame(step);
  };
  const scaleOf = (screen, logicalH) => screen.getBoundingClientRect().height / logicalH || 1;
  const ready = (fn) => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(fn));

  // Parts scrolled or slid out of a clipping box are hidden so they never count as screen content
  const hideOutside = (root, sel) => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('nv-off', !e.isIntersecting)), { root });
    $$(sel, root).forEach((el) => io.observe(el));
  };

  /* ---------- 1. Large title that folds into the bar ---------- */
  $$('[data-nv-lt]').forEach((scr) => {
    const sc = $('[data-nv-lt-scroll]', scr), title = $('.nv-ltitle', scr), srch = $('.nv-srch', scr);
    let S = 56, T = 44, busy = false, timer;
    const measure = () => { S = srch.offsetHeight + 12; T = title.offsetHeight; };
    const update = () => {
      const s = Math.max(0, sc.scrollTop);
      title.style.transform = `translateY(${Math.min(s, S)}px)`;
      srch.style.opacity = String(1 - clamp(s / (S * 0.8)));
      scr.style.setProperty('--ct', String(clamp((s - S - T * 0.4) / (T * 0.5))));
      scr.classList.toggle('nv-c', s >= S + T - 4);
    };
    const settle = () => {
      if (busy) return;
      const s = sc.scrollTop;
      let to = null;
      if (s > 0 && s < S) to = s < S / 2 ? 0 : S;
      else if (s > S && s < S + T) to = s < S + T / 2 ? S : S + T;
      if (to === null) return;
      busy = true;
      tween(s, to, (v) => { sc.scrollTop = v; }, () => { busy = false; });
    };
    hideOutside(sc, ':scope > *, .list > *');
    sc.addEventListener('scroll', () => {
      update();
      clearTimeout(timer);
      timer = setTimeout(settle, 140);
    }, { passive: true });
    ready(() => {
      measure();
      if (scr.dataset.nvStart) sc.scrollTop = +scr.dataset.nvStart;
      update();
    });
  });

  /* ---------- 2. Swipeable page tabs ---------- */
  $$('[data-nv-pager]').forEach((pager) => {
    const scr = pager.closest('.device-screen');
    const tabs = $$('.nv-ptabs [role=tab]', scr);
    const n = tabs.length;
    let p = 0;
    const set = (v) => {
      p = v;
      scr.style.setProperty('--p', String(v));
      const i = clamp(Math.round(v), 0, n - 1);
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    };
    let animT;
    const go = (i) => {
      scr.classList.add('nv-anim');
      set(clamp(i, 0, n - 1));
      clearTimeout(animT);
      animT = setTimeout(() => scr.classList.remove('nv-anim'), DUR + 40);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => go(i));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const j = clamp(Math.round(p) + (e.key === 'ArrowRight' ? 1 : -1), 0, n - 1);
          go(j); tabs[j].focus(); e.preventDefault();
        }
      });
    });
    let st = null;
    pager.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      st = { x: e.clientX, y: e.clientY, p0: p, mode: null, lx: e.clientX, lt: e.timeStamp, v: 0, id: e.pointerId };
    });
    pager.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.mode) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          st.mode = 'x'; try { pager.setPointerCapture(e.pointerId); } catch (_) {} pager.classList.add('nv-drag'); scr.classList.remove('nv-anim');
        } else if (Math.abs(dy) > 8) { st = null; return; }
      }
      if (st.mode !== 'x') return;
      const w = pager.getBoundingClientRect().width;
      let np = st.p0 - dx / w;
      if (np < 0) np *= 0.3;
      if (np > n - 1) np = n - 1 + (np - (n - 1)) * 0.3;
      const dt = e.timeStamp - st.lt;
      if (dt > 0) st.v = (e.clientX - st.lx) / dt;
      st.lx = e.clientX; st.lt = e.timeStamp;
      set(np);
    });
    const end = () => {
      if (!st) return;
      if (st.mode === 'x') {
        let target = Math.round(p);
        if (st.v < -0.3) target = Math.min(n - 1, Math.floor(st.p0) + 1);
        else if (st.v > 0.3) target = Math.max(0, Math.ceil(st.p0) - 1);
        pager.classList.remove('nv-drag');
        go(target);
      }
      st = null;
    };
    pager.addEventListener('pointerup', end);
    pager.addEventListener('pointercancel', end);
    set(0);
  });

  /* ---------- 2. Back stack with breadcrumb ---------- */
  $$('[data-nv-stack]').forEach((stack) => {
    const scr = stack.closest('.device-screen');
    const panes = $$('.nv-lvl', stack);
    const names = panes.map((p) => p.dataset.name);
    const back = $('.nv-back', scr), backL = $('span', back), live = $('.nv-bct', scr);
    const crumbs = $('.nv-crumbs', scr), cr = $$('.nv-cr', crumbs);
    let level = +stack.dataset.level || 0;
    const render = () => {
      panes.forEach((el, i) => {
        el.dataset.pos = i < level ? 'past' : i === level ? 'cur' : 'next';
        el.inert = i !== level;
      });
      back.style.visibility = level ? 'visible' : 'hidden';
      if (level) { backL.textContent = names[level - 1]; back.setAttribute('aria-label', `Back to ${names[level - 1]}`); }
      live.textContent = names[level];
      cr.forEach((c, i) => {
        c.hidden = i > level;
        const b = $('button', c);
        if (i === level) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      });
      crumbs.scrollTo({ left: crumbs.scrollWidth, behavior: reduce() ? 'auto' : 'smooth' });
    };
    const go = (l) => { level = clamp(l, 0, panes.length - 1); stack.dataset.level = level; render(); };
    stack.addEventListener('click', (e) => {
      const r = e.target.closest('[data-nv-push]');
      if (r && r.closest('.nv-lvl') === panes[level]) go(level + 1);
    });
    back.addEventListener('click', () => go(level - 1));
    crumbs.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); });
    render();
  });

  /* ---------- 3. Bottom sheet with detents ---------- */
  $$('[data-nv-sheet]').forEach((sheet) => {
    const scr = sheet.closest('.device-screen');
    const dim = $('[data-nv-dim]', scr), grab = $('.nv-grab', sheet), head = $('.nv-sh-h', sheet);
    const seg = $$('[data-nv-det]', scr.closest('.device-cap'));
    const H = 790, D = [210, 470, 790], NAMES = ['peek', 'half', 'full'];
    let cur = 1, vis = D[1], animT;
    hideOutside(sheet.parentElement, '.nv-sheet > *, .nv-chat > *');
    const set = (v) => {
      vis = v;
      sheet.style.setProperty('--y', `${H - v}px`);
      const o = clamp((v - D[1]) / (D[2] - D[1]));
      dim.style.opacity = String(o);
      dim.style.pointerEvents = o > 0.05 ? 'auto' : 'none';
    };
    const go = (i) => {
      cur = clamp(i, 0, 2);
      scr.classList.add('nv-anim');
      set(D[cur]);
      clearTimeout(animT);
      animT = setTimeout(() => scr.classList.remove('nv-anim'), DUR + 40);
      grab.setAttribute('aria-label', `Resize sheet, now ${NAMES[cur]}`);
      seg.forEach((b, k) => b.setAttribute('aria-pressed', String(k === cur)));
    };
    let st = null, moved = false;
    const down = (e) => {
      if (e.button) return;
      st = { y: e.clientY, v0: vis, ly: e.clientY, lt: e.timeStamp, vel: 0, k: scaleOf(scr, 852), id: e.pointerId };
      moved = false;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
      scr.classList.remove('nv-anim');
      sheet.classList.add('nv-drag');
    };
    const move = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dy = (e.clientY - st.y) / st.k;
      if (Math.abs(dy) > 4) moved = true;
      let v = st.v0 - dy;
      if (v > H) v = H + (v - H) * 0.2;
      if (v < D[0]) v = D[0] - (D[0] - v) * 0.3;
      const dt = e.timeStamp - st.lt;
      if (dt > 0) st.vel = -((e.clientY - st.ly) / st.k) / dt;
      st.ly = e.clientY; st.lt = e.timeStamp;
      set(v);
    };
    const up = () => {
      if (!st) return;
      sheet.classList.remove('nv-drag');
      if (moved) {
        const aim = vis + st.vel * 180;
        let best = 0;
        D.forEach((d, i) => { if (Math.abs(d - aim) < Math.abs(D[best] - aim)) best = i; });
        go(best);
      } else go(cur);
      st = null;
    };
    [grab, head].forEach((h) => {
      h.addEventListener('pointerdown', down);
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
    grab.addEventListener('click', () => { if (!moved) go(cur === 2 ? 0 : cur + 1); moved = false; });
    grab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { go(cur + 1); e.preventDefault(); }
      if (e.key === 'ArrowDown') { go(cur - 1); e.preventDefault(); }
    });
    dim.addEventListener('click', () => go(1));
    seg.forEach((b) => b.addEventListener('click', () => go(+b.dataset.nvDet)));
    set(D[cur]);
  });

  /* ---------- 3. Modal stack, a sheet over a sheet ---------- */
  $$('[data-nv-ms]').forEach((ms) => {
    const base = $('.nv-ms-base', ms), s1 = $('.nv-ms-s1', ms), s2 = $('.nv-ms-s2', ms);
    const depth = (d) => {
      ms.dataset.depth = String(clamp(d, 0, 2));
      base.inert = d !== 0; s1.inert = d !== 1; s2.inert = d !== 2;
    };
    ms.addEventListener('click', (e) => {
      const g = e.target.closest('[data-nv-ms-go]');
      if (g) { depth(+g.dataset.nvMsGo); return; }
      if (e.target.closest('[data-nv-ms-back]')) { depth(+ms.dataset.depth - 1); return; }
      const pick = e.target.closest('[data-nv-pick]');
      if (pick) {
        $$('[data-nv-pick] .radio', s2).forEach((r) => r.setAttribute('aria-checked', String(r.parentElement === pick)));
        const name = pick.dataset.nvPick, opp = $('.nv-opp', s1);
        $('.av', opp).replaceWith($('.av', pick).cloneNode(true));
        $('[data-nv-opp]', s1).textContent = name;
        $('[data-nv-opp2]', s1).textContent = name;
        setTimeout(() => depth(1), 120);
      }
    });
    depth(+ms.dataset.depth);
  });

  /* ---------- 4. Action sheet ---------- */
  $$('.nv-as-scr').forEach((scr) => {
    const as = $('.nv-as', scr);
    const set = (on) => { scr.classList.toggle('nv-as-on', on); as.inert = !on; };
    scr.addEventListener('click', (e) => {
      if (e.target.closest('[data-nv-as-open]')) set(true);
      else if (e.target.closest('[data-nv-as-close]')) set(false);
    });
    scr.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    set(scr.classList.contains('nv-as-on'));
  });

  /* ---------- 4. Context menu on long press ---------- */
  $$('.nv-cm-scr').forEach((scr) => {
    const layer = $('[data-nv-cm]', scr), pop = $('.nv-cm-pop', layer), prev = $('.nv-cm-prev', layer), menu = $('.nv-cm-menu', layer);
    const cards = $$('.nv-mc', scr);
    let open = null, timer = null, hideT;
    const show = (card) => {
      clearTimeout(hideT);
      if (open) open.classList.remove('nv-hide');
      const k = scaleOf(scr, 852), sr = scr.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const top = (cr.top - sr.top) / k, h = cr.height / k, mh = menu.offsetHeight || 300;
      const y = clamp(top, 64, 852 - 44 - h - 10 - mh);
      const c = card.cloneNode(true);
      c.classList.remove('nv-press'); c.removeAttribute('tabindex'); c.removeAttribute('role'); c.setAttribute('aria-hidden', 'true');
      prev.replaceChildren(c);
      pop.style.setProperty('--top', `${y}px`);
      card.classList.add('nv-hide');
      layer.classList.add('on');
      open = card;
    };
    const hide = () => {
      layer.classList.remove('on');
      const c = open; open = null;
      hideT = setTimeout(() => c && c.classList.remove('nv-hide'), DUR);
      if (c) c.focus({ preventScroll: true });
    };
    const cancel = (card) => { clearTimeout(timer); timer = null; card.classList.remove('nv-press'); };
    cards.forEach((card) => {
      let sx = 0, sy = 0;
      card.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        sx = e.clientX; sy = e.clientY;
        card.classList.add('nv-press');
        timer = setTimeout(() => { card.classList.remove('nv-press'); show(card); }, 450);
      });
      card.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel(card); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => card.addEventListener(t, () => cancel(card)));
      card.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(card); show(card); });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); show(card); $('button', menu).focus({ preventScroll: true }); }
      });
    });
    layer.addEventListener('click', (e) => { if (e.target.closest('[data-nv-cm-close]')) hide(); });
    scr.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) hide(); });
    ready(() => show(cards[1]));
  });

  /* ---------- 4. FAB menu ---------- */
  $$('[data-nv-fab]').forEach((scr) => {
    const fab = $('.nv-fab', scr), menu = $('.nv-fab-menu', scr);
    const set = (on) => {
      scr.dataset.open = String(on);
      fab.setAttribute('aria-expanded', String(on));
      fab.setAttribute('aria-label', on ? 'Close quick actions' : 'Quick actions');
      menu.inert = !on;
    };
    fab.addEventListener('click', () => set(scr.dataset.open !== 'true'));
    scr.addEventListener('click', (e) => { if (e.target.closest('[data-nv-fab-close]')) set(false); });
    scr.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    set(scr.dataset.open === 'true');
  });

  /* ---------- 5. Tablet split view ---------- */
  const PC = { You: ['green', 'Y', 6], Mira: ['orange', 'M', 5], Dave: ['blue', 'D', 7], Sam: ['yellow', 'S', 1], Kim: ['purple', 'K', 4],
    Joe: ['red', 'J', 3], Ann: ['maroon', 'A', 2], Eva: ['orange', 'E', 10], Lea: ['ink', 'L', 8], Ben: ['blue', 'B', 9] };
  const avHtml = (n, s) => {
    const [c, l, no] = PC[n];
    return `<span class="av${c === 'yellow' ? ' yellow' : ''}" style="--c:var(--pc-${c});--av:${s}px"><span class="ring"></span><span class="face">${l}</span><span class="no">${no}</span></span>`;
  };
  const MATCHES = [
    ['Mira', 'You', 10, 8, 'Today 12:41', 'Cup semi final', 14, '7:42', 3, 4, 7, 5],
    ['Sam', 'You', 10, 7, 'Today 11:05', 'Season 4', 9, '6:58', 2, 5, 6, 4],
    ['You', 'Kim', 10, 4, 'Today 9:30', 'Morning break', 6, '5:12', 1, 6, 8, 3],
    ['Dave', 'Joe', 10, 6, 'Yesterday 16:10', 'Season 4', 5, '6:21', 2, 4, 9, 2],
    ['Ann', 'Eva', 10, 9, 'Yesterday 14:20', 'Season 4', 11, '9:03', 6, 3, 3, 3],
    ['You', 'Dave', 10, 9, 'Yesterday 17:20', 'Crown chase', 16, '8:47', 5, 3, 5, 7],
    ['Mira', 'Ben', 10, 4, 'Sun 18 Oct', 'Season 4', 4, '5:40', 1, 5, 6, 0],
    ['Kim', 'Lea', 10, 8, 'Fri 16 Oct', 'Cup quarter final', 7, '7:15', 3, 3, 4, 2],
    ['Joe', 'Sam', 10, 7, 'Fri 16 Oct', 'Season 4', 8, '6:44', 2, 4, 2, 5],
  ];
  const points = (w, l, seed) => {
    const out = []; let a = 0, b = 0, s = seed * 9301 + 49297;
    while (a < w - 1 || b < l) {
      s = (s * 9301 + 49297) % 233280;
      const pickW = b >= l || (a < w - 1 && s / 233280 < (w - a) / (w - a + l - b));
      if (pickW) { a++; out.push('w'); } else { b++; out.push('l'); }
    }
    out.push('w');
    return out;
  };
  $$('[data-nv-split]').forEach((split) => {
    const det = $('[data-nv-det]', split);
    const f = (k) => $(`[data-f="${k}"]`, det);
    const name = (n) => (n === 'You' ? 'you' : n);
    const show = (i) => {
      const [a, b, sa, sb, t, tag, d, dur, lc, br, h1, h2] = MATCHES[i];
      det.classList.add('nv-swap');
      f('title').textContent = `${a} vs ${name(b)}`;
      f('pa').innerHTML = `${avHtml(a, 88)}<b>${a}</b><span class="delta up">+${d}</span>`;
      f('pb').innerHTML = `${avHtml(b, 88)}<b>${b}</b><span class="delta down">−${d}</span>`;
      f('score').textContent = `${sa}:${sb}`;
      f('won').textContent = `${a} won, ${tag}`;
      f('time').textContent = t;
      f('dur').textContent = dur; f('lc').textContent = lc; f('br').textContent = br;
      f('h1').textContent = h1; f('h2').textContent = h2;
      f('h1').nextElementSibling.textContent = a; f('h2').nextElementSibling.textContent = b;
      const hh = $('.nv-h2 .nv-hh', det);
      hh.children[0].style.flex = String(h1 || 0.01); hh.children[1].style.flex = String(h2 || 0.01);
      det.style.setProperty('--ca', `var(--pc-${PC[a][0]})`);
      det.style.setProperty('--cb', `var(--pc-${PC[b][0]})`);
      $('.nv-pts', det).innerHTML = points(sa, sb, i + 3).map((x) => `<i class="${x}"></i>`).join('');
      $('.nv-pts', det).nextElementSibling.lastElementChild.textContent = `${sa}:${sb}`;
      requestAnimationFrame(() => requestAnimationFrame(() => det.classList.remove('nv-swap')));
    };
    $$('[data-nv-row]', split).forEach((r) => r.addEventListener('click', () => {
      $$('[data-nv-row]', split).forEach((x) => { x.classList.toggle('on', x === r); x.setAttribute('aria-pressed', String(x === r)); });
      show(+r.dataset.nvRow);
    }));
    $$('.nv-sg', split).forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('.nv-si'); if (!b) return;
      $$('.nv-si', g).forEach((x) => { x.classList.toggle('on', x === b); if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
    }));
    const tog = $('[data-nv-side]', split), side = $('.nv-side-c', split);
    tog.addEventListener('click', () => {
      const c = split.classList.toggle('nv-collapsed');
      side.inert = c;
      tog.setAttribute('aria-label', c ? 'Show sidebar' : 'Hide sidebar');
    });
    $('.nv-pts', det).innerHTML = points(10, 8, 3).map((x) => `<i class="${x}"></i>`).join('');
  });
})();
