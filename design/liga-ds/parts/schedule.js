/* Liga: scheduling and queue behaviour (prefix sc-). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icons = () => window.lucide && lucide.createIcons();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Time slots: pick up to 4 slots next to each other ---------- */
  const addMin = (t, m) => { const [h, mm] = t.split(':').map(Number); const x = h * 60 + mm + m; return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };
  const isFree = (b) => b && !b.dataset.s && !b.disabled && b.hasAttribute('aria-pressed');
  const markSlot = (b, on) => {
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').innerHTML = on ? '<i data-lucide="check"></i>Picked' : 'Free';
  };
  const summaryFor = (box) => {
    const host = box.closest('.demo, .sc-scr');
    return host && $('[data-sc-sum]', host);
  };
  const updateSum = (box) => {
    const sum = summaryFor(box); if (!sum) return;
    const picked = $$('.sc-slot[aria-pressed=true]', box);
    const b = $('.tx b', sum), s = $('.tx span', sum), btn = $('.btn', sum);
    if (!picked.length) {
      sum.setAttribute('data-empty', '');
      b.textContent = 'Pick a free slot'; s.textContent = '15 min each, up to 1 h';
      btn.disabled = true; return;
    }
    sum.removeAttribute('data-empty');
    const start = picked[0].dataset.t, end = addMin(picked[picked.length - 1].dataset.t, 15);
    const len = picked.length * 15;
    b.textContent = `${start} to ${end}`;
    s.textContent = `${len === 60 ? '1 h' : len + ' min'}, Table 1, 3rd floor`;
    btn.disabled = false;
    sum.dataset.when = `${start} to ${end}`;
  };
  $$('[data-sc-slots]').forEach((box) => {
    const all = $$('.sc-slot', box);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.sc-slot');
      if (!b || !isFree(b)) return;
      const idx = all.indexOf(b);
      const sel = all.map((x, i) => (x.getAttribute('aria-pressed') === 'true' ? i : -1)).filter((i) => i >= 0);
      let next;
      if (!sel.length) next = [idx];
      else if (sel.includes(idx)) next = (idx === sel[0] || idx === sel[sel.length - 1]) ? sel.filter((i) => i !== idx) : [idx];
      else if ((idx === sel[0] - 1 || idx === sel[sel.length - 1] + 1) && sel.length < 4) next = [...sel, idx].sort((a, c) => a - c);
      else next = [idx];
      all.forEach((x, i) => { if (isFree(x)) markSlot(x, next.includes(i)); });
      icons(); updateSum(box);
    });
  });
  // Contiguous check happens through DOM order; taken slots break a range because they are never free.
  $$('[data-sc-clear]').forEach((btn) => btn.addEventListener('click', () => {
    const box = $('[data-sc-slots]', btn.closest('.demo'));
    $$('.sc-slot', box).forEach((x) => isFree(x) && markSlot(x, false));
    updateSum(box);
  }));
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sc-book]');
    if (!t) return;
    const when = t.closest('[data-sc-sum]')?.dataset.when;
    requestAnimationFrame(() => { const w = $('[data-sc-tpl-when]'); if (w && when) w.textContent = when; });
  });

  /* ---------- Countdowns and elapsed timers in the mockups ---------- */
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fmt2 = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const counts = $$('[data-sc-count]').map((el) => ({ el, s: +el.dataset.scCount, ring: el.closest('.sc-ring, .sc-k-cd') }));
  const ups = $$('[data-sc-up]').map((el) => ({ el, s: +el.dataset.scUp }));
  if (!reduce) setInterval(() => {
    counts.forEach((c) => {
      c.s = c.s <= 0 ? 120 : c.s - 1;
      c.el.textContent = fmt(c.s);
      if (c.ring) { c.ring.style.setProperty('--v', (c.s / 120).toFixed(3)); c.ring.classList.toggle('low', c.ring.classList.contains('sc-ring') && c.s < 30); }
    });
    ups.forEach((u) => { u.s += 1; u.el.textContent = fmt2(u.s); });
  }, 1000);

  /* ---------- Queue card: join, wait, you're up, claim or pass ---------- */
  $$('[data-sc-q]').forEach((card) => {
    const body = $('[data-sc-q-body]', card), acts = $('[data-sc-q-acts]', card), sub = $('[data-sc-q-sub]', card), pill = $('.sc-qh .pill', card);
    let timer = null, pos = 3, left = 120;
    const stop = () => { clearInterval(timer); clearTimeout(timer); timer = null; };
    const busy = () => { pill.className = 'pill live'; pill.innerHTML = '<span class="live-dot"></span>Busy'; };
    const view = {
      out() {
        busy(); sub.textContent = '2 games waiting';
        body.innerHTML = '<span class="sc-ic idle"><i data-lucide="users"></i></span><div class="tx"><b>About 24 min</b><span>2 games ahead if you join now</span></div>';
        acts.className = 'sc-acts one'; acts.innerHTML = '<button class="btn primary lg" data-go="in"><i data-lucide="list-plus"></i>Join the queue</button>';
      },
      in() {
        busy(); sub.textContent = 'You play the winner';
        const mins = pos * 8 - 3;
        body.innerHTML = `<span class="sc-pos-n"><b>${pos}</b><span>in line</span></span><div class="tx"><b>About ${mins} min</b><span>${pos === 1 ? 'You are next, stay close' : 'We ping you one game before'}</span></div>`;
        acts.className = 'sc-acts one'; acts.innerHTML = '<button class="btn secondary lg" data-go="out"><i data-lucide="log-out"></i>Leave the queue</button>';
        timer = setTimeout(() => { if (pos > 1) { pos -= 1; render('in'); } else render('up'); }, 1800);
      },
      up() {
        pill.className = 'pill win'; pill.textContent = 'Your turn'; sub.textContent = 'The table is free';
        left = 120;
        body.innerHTML = '<span class="sc-ring sm" style="--v:1"><div><b>2:00</b><span>to claim</span></div></span><div class="tx"><b>You\'re up</b><span>You vs Joe, winner stays</span></div>';
        acts.className = 'sc-acts'; acts.innerHTML = '<button class="btn secondary lg" data-go="passed">Let it go</button><button class="btn sc-claim lg" data-go="claimed"><i data-lucide="hand"></i>Claim</button>';
        const ring = $('.sc-ring', body), b = $('.sc-ring b', body);
        timer = setInterval(() => {
          left -= 1; b.textContent = fmt(left);
          ring.style.setProperty('--v', (left / 120).toFixed(3)); ring.classList.toggle('low', left < 30);
          if (left <= 0) render('passed');
        }, 100);
      },
      claimed() {
        pill.className = 'pill win'; pill.textContent = 'Yours'; sub.textContent = 'Claimed at 16:31';
        body.innerHTML = '<span class="sc-ic win"><i data-lucide="check"></i></span><div class="tx"><b>Table is yours</b><span>Start the game when you are ready</span></div>';
        acts.className = 'sc-acts one'; acts.innerHTML = '<button class="btn primary lg" data-go="out"><i data-lucide="play"></i>Start the game</button>';
      },
      passed() {
        busy(); sub.textContent = 'Ann and Joe have it now';
        body.innerHTML = '<span class="sc-ic idle"><i data-lucide="clock"></i></span><div class="tx"><b>Passed on</b><span>No rush, rejoin and you are 3rd again</span></div>';
        acts.className = 'sc-acts one'; acts.innerHTML = '<button class="btn primary lg" data-go="in"><i data-lucide="rotate-ccw"></i>Rejoin</button>';
      },
    };
    function render(s) { stop(); if (s === 'out' || s === 'passed') pos = 3; card.dataset.state = s; view[s](); icons(); }
    card.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) { if (g.dataset.go === 'in') pos = 3; render(g.dataset.go); } });
    render('out');
  });

  /* ---------- Kiosk player picker ---------- */
  $$('.sc-k-pick').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
  }));

  /* ---------- Calendar view switch ---------- */
  $$('[data-sc-calsw]').forEach((sw) => sw.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('[data-sc-calv]', sw.closest('.demo')).forEach((v) => { v.hidden = v.dataset.scCalv !== b.dataset.v; });
  }));

  /* ---------- Availability: tap or drag to paint, heat follows ---------- */
  const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  $$('[data-sc-av=mine]').forEach((grid) => {
    const demo = grid.closest('.sc-avdemo');
    const heat = demo && $('[data-sc-heat]', demo);
    let others = null;
    if (heat) {
      others = new Map();
      $$('.sc-cell[data-d]', grid).forEach((c) => {
        const k = `${c.dataset.d}-${c.dataset.hAt}`;
        const cell = $$('.sc-cell', heat)[(+c.dataset.hAt - 9) * 7 + +c.dataset.d];
        others.set(k, Math.max(0, +cell.dataset.h - (c.getAttribute('aria-pressed') === 'true' ? 1 : 0)));
      });
    }
    const recalc = () => {
      if (!heat) return;
      const cells = $$('.sc-cell', heat);
      let best = null, bv = -1;
      $$('.sc-cell[data-d]', grid).forEach((c) => {
        const d = +c.dataset.d, h = +c.dataset.hAt;
        const v = Math.min(7, others.get(`${d}-${h}`) + (c.getAttribute('aria-pressed') === 'true' ? 1 : 0));
        const cell = cells[(h - 9) * 7 + d];
        cell.dataset.h = v; cell.classList.remove('best'); cell.textContent = v === 7 ? '7' : '';
        cell.setAttribute('aria-label', `${DN[d]} ${h}:00, ${v} of 7 free`);
        if (v > bv) { bv = v; best = { cell, d, h }; }
      });
      if (!best) return;
      best.cell.classList.add('best'); best.cell.innerHTML = '<i data-lucide="star"></i>';
      const card = $('[data-sc-best]', demo);
      $('.tx b', card).textContent = `${DN[best.d]} ${19 + best.d} Oct, ${best.h}:00`;
      $('.tx small', card).textContent = bv === 7 ? 'All 7 free, Table 1 is open' : `${bv} of 7 free, Table 1 is open`;
      icons();
    };
    let paint = null;
    const hit = (x, y) => { const el = document.elementFromPoint(x, y)?.closest('.sc-cell[data-d]'); return el && grid.contains(el) ? el : null; };
    grid.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.sc-cell[data-d]'); if (!c) return;
      e.preventDefault();
      paint = c.getAttribute('aria-pressed') !== 'true';
      c.setAttribute('aria-pressed', String(paint)); recalc();
    });
    grid.addEventListener('pointermove', (e) => {
      if (paint === null) return;
      const c = hit(e.clientX, e.clientY);
      if (c && c.getAttribute('aria-pressed') !== String(paint)) { c.setAttribute('aria-pressed', String(paint)); recalc(); }
    });
    addEventListener('pointerup', () => { paint = null; });
    grid.addEventListener('keydown', (e) => {
      const c = e.target.closest('.sc-cell[data-d]');
      if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true')); recalc(); }
    });
  });

  /* ---------- Quiet hours switch locks its time rows ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sc-quiet-t]'); if (!t) return;
    const on = t.getAttribute('aria-checked') === 'true';
    $$('.row', t.closest('[data-sc-quiet]')).forEach((r) => { if (!r.contains(t)) r.setAttribute('aria-disabled', String(!on)); });
    $$('.sc-wkdays button, .sc-time', t.closest('[data-sc-quiet]')).forEach((b) => { b.disabled = !on; });
  });

  /* ---------- Invite reply ---------- */
  const RSVP = {
    yes: ['<b>4 going</b>, 1 maybe', 'You are in. It is in your Plan.'],
    maybe: ['<b>3 going</b>, 2 maybe', 'Mira sees a maybe. We remind you Thu morning.'],
    no: ['<b>3 going</b>, 1 maybe, 1 can\'t', 'No worries, Mira can ask someone else.'],
  };
  $$('[data-sc-inv]').forEach((card) => $('.sc-rsvp', card).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const [att, st] = RSVP[b.dataset.v];
    $('[data-sc-att]', card).innerHTML = att;
    $('[data-sc-inv-st]', card).textContent = st;
  }));
})();
