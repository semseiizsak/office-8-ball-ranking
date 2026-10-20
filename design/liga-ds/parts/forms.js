/* Liga DS part: More inputs and controls (prefix fx-). Behaviour only. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const av = (c, letter, no, cls = '') =>
    `<span class="av ${cls} ${c === 'yellow' ? 'yellow' : ''}" style="--c:var(--pc-${c})"><span class="ring"></span><span class="face">${letter}</span>${no != null ? `<span class="no">${no}</span>` : ''}</span>`;
  let uid = 0;
  const k3 = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

  /* ===== Date and time picker ===== */
  const sched = $('[data-fx-sched]');
  if (sched) {
    const grid = $('[data-fx-cal-grid]', sched);
    const title = $('[data-fx-cal-title]', sched);
    const prev = $('[data-fx-cal-prev]', sched);
    const next = $('[data-fx-cal-next]', sched);
    const timesWrap = $('[data-fx-times-wrap]', sched);
    const whenEl = $('[data-fx-when]', sched);
    const whenSub = $('[data-fx-when-sub]', sched);
    const go = $('[data-fx-sched-go]', sched);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const same = (a, b) => a && b && a.getTime() === b.getTime();
    const busy = new Set([2, 5, 10].map((n) => add(today, n).getTime()));
    const sel = { match: add(today, 2), season: new Date(today.getFullYear(), today.getMonth() + 2, 0) };
    let mode = 'match';
    let view = new Date(today.getFullYear(), today.getMonth(), 1);
    let time = '12:30';

    const monthName = (d) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const dayName = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });
    const longName = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    function summary() {
      const d = sel[mode];
      if (mode === 'match') {
        whenEl.textContent = `${dayName(d)}, ${time}`;
        whenSub.textContent = 'Dave gets a reminder an hour before';
        go.textContent = 'Schedule match';
      } else {
        whenEl.textContent = `Season ends ${dayName(d)}`;
        whenSub.textContent = 'Ratings lock at midnight, then the next season starts';
        go.textContent = 'Set season end';
      }
    }

    function render(focus) {
      title.textContent = monthName(view);
      grid.setAttribute('aria-label', monthName(view));
      prev.disabled = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();
      const y = view.getFullYear(), m = view.getMonth();
      const off = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      const s = sel[mode];
      let tabDay = s && s.getMonth() === m && s.getFullYear() === y ? s.getDate() : null;
      if (tabDay == null) tabDay = today.getMonth() === m && today.getFullYear() === y ? today.getDate() : 1;
      let html = '';
      for (let i = 0; i < off; i++) html += '<span></span>';
      for (let d = 1; d <= days; d++) {
        const date = new Date(y, m, d);
        const past = date < today;
        const cls = ['fx-day', same(date, today) ? 'today' : '', busy.has(date.getTime()) ? 'busy' : ''].join(' ');
        const label = longName(date) + (same(date, today) ? ', today' : '') + (busy.has(date.getTime()) ? ', a match is planned' : '');
        html += `<button class="${cls}" data-d="${d}" aria-label="${label}" aria-pressed="${same(date, s)}" tabindex="${d === tabDay ? 0 : -1}" ${past ? 'disabled' : ''}><span>${d}</span></button>`;
      }
      grid.innerHTML = html;
      if (focus) $(`[data-d="${focus}"]`, grid)?.focus();
      summary();
    }

    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.fx-day');
      if (!b || b.disabled) return;
      sel[mode] = new Date(view.getFullYear(), view.getMonth(), +b.dataset.d);
      render(+b.dataset.d);
    });
    grid.addEventListener('keydown', (e) => {
      const b = e.target.closest('.fx-day');
      if (!b) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      const cur = new Date(view.getFullYear(), view.getMonth(), +b.dataset.d);
      let t = null;
      if (step) t = add(cur, step);
      if (e.key === 'PageUp') t = new Date(cur.getFullYear(), cur.getMonth() - 1, Math.min(cur.getDate(), 28));
      if (e.key === 'PageDown') t = new Date(cur.getFullYear(), cur.getMonth() + 1, Math.min(cur.getDate(), 28));
      if (!t) return;
      e.preventDefault();
      if (t < today) t = new Date(today);
      if (t.getMonth() !== view.getMonth() || t.getFullYear() !== view.getFullYear()) {
        view = new Date(t.getFullYear(), t.getMonth(), 1);
        render(t.getDate());
      } else {
        $$('.fx-day', grid).forEach((x) => (x.tabIndex = -1));
        const n = $(`[data-d="${t.getDate()}"]`, grid);
        n.tabIndex = 0; n.focus();
      }
    });
    prev.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
    next.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });

    $('[data-fx-times]', sched).addEventListener('click', (e) => {
      const b = e.target.closest('.fx-time');
      if (!b || b.disabled) return;
      $$('.fx-time', b.parentElement).forEach((x) => !x.disabled && x.setAttribute('aria-pressed', String(x === b)));
      time = b.textContent.trim();
      summary();
    });
    $('[data-fx-mode]', sched).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('button', b.parentElement).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      mode = b.dataset.mode;
      timesWrap.hidden = mode !== 'match';
      const s = sel[mode];
      view = new Date(s.getFullYear(), s.getMonth(), 1);
      render();
    });
    go.addEventListener('click', () => {
      const old = go.textContent;
      go.innerHTML = '<i data-lucide="check"></i>' + (mode === 'match' ? 'Match scheduled' : 'Season end set');
      icons();
      setTimeout(() => { go.textContent = old; }, 1600);
    });
    render();
  }

  /* ===== Sliders ===== */
  const fmt = (wrap, v) => (wrap.dataset.fmt === 'x' ? (+v).toFixed(1) + '×' : String(v));
  $$('[data-fx-slider]').forEach((w) => {
    const inp = $('input', w), bub = $('.fx-bub', w);
    const kDesc = w.closest('.fx-col') && $('[data-fx-k-desc]', w.closest('.fx-col'));
    const upd = () => {
      const p = (inp.value - inp.min) / (inp.max - inp.min);
      w.style.setProperty('--p', p);
      bub.textContent = fmt(w, inp.value);
      if (w.dataset.fmt === 'x') inp.setAttribute('aria-valuetext', bub.textContent.replace('×', ' times'));
      if (kDesc) {
        const v = +inp.value;
        kDesc.textContent = v < 24 ? 'Calm' : v > 36 ? 'Swingy' : 'Balanced';
        inp.setAttribute('aria-valuetext', `${v}, ${kDesc.textContent.toLowerCase()}`);
      }
      w.dispatchEvent(new CustomEvent('fx:change', { detail: +inp.value }));
    };
    inp.addEventListener('input', upd);
    w.fxUpdate = upd;
    upd();
  });
  $$('[data-fx-dual]').forEach((w) => {
    const [a, b] = $$('input', w);
    const ba = $('.fx-bub.a', w), bb = $('.fx-bub.b', w);
    const out = $('[data-fx-rr-out]', w.closest('.fx-col'));
    const gap = 50, min = +a.min, span = a.max - a.min;
    const upd = (e) => {
      if (+a.value > +b.value - gap) {
        if (e && e.target === a) a.value = +b.value - gap; else b.value = +a.value + gap;
      }
      w.style.setProperty('--a', (a.value - min) / span);
      w.style.setProperty('--b', (b.value - min) / span);
      ba.textContent = a.value; bb.textContent = b.value;
      a.style.zIndex = +a.value > +a.max - gap * 2 ? 2 : 1;
      if (out) out.textContent = `Rating ${a.value} to ${b.value}`;
    };
    a.addEventListener('input', upd); b.addEventListener('input', upd);
    upd();
  });

  /* ===== Colour and number ===== */
  const prof = $('[data-fx-prof]');
  if (prof) {
    const COLS = [['yellow', 'Yellow'], ['blue', 'Blue'], ['red', 'Red'], ['purple', 'Purple'], ['orange', 'Orange'], ['green', 'Green'], ['maroon', 'Maroon'], ['ink', 'Ink']];
    const TAKEN = { 1: 'Sam', 3: 'Joe', 4: 'Kim', 5: 'Mira', 6: 'Ann', 7: 'Dave' };
    const sw = $('[data-fx-swatches]', prof);
    const avEl = $('[data-fx-av]', prof), nameEl = $('[data-fx-pname]', prof), desc = $('[data-fx-pdesc]', prof);
    const numIn = $('[data-fx-num-in]', prof), hint = $('[data-fx-num-hint]', prof);
    let col = 'blue', num = 23;
    sw.innerHTML = COLS.map(([k, n]) => `<button class="fx-swatch ${k === 'yellow' ? 'lt' : ''}" role="radio" aria-checked="${k === col}" aria-label="${n}" tabindex="${k === col ? 0 : -1}" data-c="${k}" style="--c:var(--pc-${k})"><i data-lucide="check"></i></button>`).join('');
    const upd = () => {
      const n = COLS.find((c) => c[0] === col)[1];
      avEl.style.setProperty('--c', `var(--pc-${col})`);
      avEl.classList.toggle('yellow', col === 'yellow');
      $('.no', avEl).textContent = num;
      nameEl.style.color = `var(--pct-${col})`;
      desc.textContent = `${n}, number ${num}`;
      $$('[data-fx-num]', prof).forEach((b) => (b.disabled = (+b.dataset.fxNum < 0 && num <= 0) || (+b.dataset.fxNum > 0 && num >= 99)));
      $$('[data-fx-mirror]', prof).forEach((m) => {
        m.style.setProperty('--c', `var(--pc-${col})`);
        m.classList.toggle('yellow', col === 'yellow');
        const no = $('.no', m); if (no) no.textContent = num;
      });
      $$('[data-fx-mirror-name]', prof).forEach((m) => (m.style.color = `var(--pct-${col})`));
      hint.textContent = TAKEN[num] ? `${TAKEN[num]} wears ${num} too. That is fine, your colour tells you apart.` : `Nobody else wears ${num}.`;
    };
    const pick = (b) => {
      $$('.fx-swatch', sw).forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; });
      col = b.dataset.c; upd();
    };
    sw.addEventListener('click', (e) => { const b = e.target.closest('.fx-swatch'); if (b) pick(b); });
    sw.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const all = $$('.fx-swatch', sw);
      const n = all[(all.indexOf(document.activeElement) + d + all.length) % all.length];
      pick(n); n.focus();
    });
    const setNum = (v) => { num = clamp(isNaN(v) ? 0 : v, 0, 99); numIn.value = num; upd(); };
    $$('[data-fx-num]', prof).forEach((b) => b.addEventListener('click', () => setNum(num + +b.dataset.fxNum)));
    numIn.addEventListener('input', () => {
      numIn.value = numIn.value.replace(/\D/g, '').slice(0, 2);
      if (numIn.value !== '') { num = +numIn.value; upd(); }
    });
    numIn.addEventListener('blur', () => setNum(+numIn.value));
    numIn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); setNum(num + 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setNum(num - 1); }
    });
    icons();
    upd();
  }

  /* ===== Photo cropper ===== */
  $$('[data-fx-crop]').forEach((c) => {
    const frame = $('.fx-crop-frame', c), img = $('.fx-crop-img', c);
    const zw = $('[data-fx-slider]', c), zi = $('input', zw);
    let x = 0, y = 0, z = 1, drag = null;
    const apply = () => {
      const r = frame.getBoundingClientRect();
      const mx = (r.width * (z - 1)) / 2, my = (r.height * (z - 1)) / 2;
      x = clamp(x, -mx, mx); y = clamp(y, -my, my);
      c.style.setProperty('--xp', (x / r.width) * 100); c.style.setProperty('--yp', (y / r.height) * 100); c.style.setProperty('--z', z);
    };
    zw.addEventListener('fx:change', (e) => { z = e.detail; apply(); });
    const setZoom = (v) => { zi.value = clamp(v, 1, 3); zw.fxUpdate(); };
    $$('[data-fx-zoom]', c).forEach((b) => b.addEventListener('click', () => setZoom(+zi.value + +b.dataset.fxZoom * 0.2)));
    $('[data-fx-crop-reset]', c).addEventListener('click', () => { x = 0; y = 0; setZoom(1); apply(); });
    frame.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      drag = { sx: e.clientX - x, sy: e.clientY - y };
      frame.setPointerCapture(e.pointerId);
      frame.classList.add('drag'); c.classList.add('drag');
    });
    frame.addEventListener('pointermove', (e) => { if (!drag) return; x = e.clientX - drag.sx; y = e.clientY - drag.sy; apply(); });
    const end = () => { drag = null; frame.classList.remove('drag'); c.classList.remove('drag'); };
    frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
    frame.addEventListener('keydown', (e) => {
      const m = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
      if (m) { e.preventDefault(); x += m[0]; y += m[1]; apply(); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(+zi.value + 0.2); }
      if (e.key === '-') { e.preventDefault(); setZoom(+zi.value - 0.2); }
    });
  });

  /* ===== Shared listbox menu ===== */
  // trigger: button that opens; menu: ul[role=listbox]; opts.onPick(li) returns true to keep open
  function listbox(trigger, menu, opts) {
    const items = () => $$('[role=option]', menu);
    let active = -1;
    items().forEach((li) => { if (!li.id) li.id = 'fx-opt-' + ++uid; });
    const setActive = (i) => {
      const all = items();
      active = clamp(i, 0, all.length - 1);
      all.forEach((li, k) => li.classList.toggle('on', k === active));
      const li = all[active];
      if (li) { menu.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    };
    const isOpen = () => !menu.hidden;
    const open = () => {
      if (trigger.disabled) return;
      if (opts.beforeOpen) opts.beforeOpen();
      items().forEach((li) => { if (!li.id) li.id = 'fx-opt-' + ++uid; });
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      icons();
      const all = items();
      const s = all.findIndex((li) => li.getAttribute('aria-selected') === 'true' && li.getAttribute('aria-disabled') !== 'true');
      setActive(s < 0 ? 0 : s);
      menu.focus();
    };
    const close = (refocus = true) => {
      if (!isOpen()) return;
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      menu.removeAttribute('aria-activedescendant');
      if (refocus) trigger.focus();
    };
    const choose = (li) => {
      if (!li || li.getAttribute('aria-disabled') === 'true') return;
      const keep = opts.onPick(li);
      if (!keep) close();
      else setActive(items().indexOf(li));
    };
    trigger.addEventListener('click', () => (isOpen() ? close() : open()));
    trigger.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    });
    menu.addEventListener('keydown', (e) => {
      const all = items();
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(all.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(all[active]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') close(false);
    });
    menu.addEventListener('mousedown', (e) => e.preventDefault());
    menu.addEventListener('click', (e) => choose(e.target.closest('[role=option]')));
    menu.addEventListener('mousemove', (e) => { const li = e.target.closest('[role=option]'); if (li) { const i = items().indexOf(li); if (i !== active) setActive(i); } });
    document.addEventListener('pointerdown', (e) => {
      if (isOpen() && !menu.contains(e.target) && !trigger.contains(e.target) && !(opts.root && opts.root.contains(e.target))) close(false);
    });
    return { open, close };
  }

  // Single select dropdowns
  $$('[data-fx-dd]').forEach((dd) => {
    const btn = $('.fx-dd-btn', dd), menu = $('.fx-dd-menu', dd), val = $('.fx-dd-v', dd);
    const err = dd.parentElement.querySelector('[data-fx-dd-err]');
    listbox(btn, menu, {
      onPick(li) {
        $$('[role=option]', menu).forEach((x) => x.setAttribute('aria-selected', String(x === li)));
        val.textContent = li.textContent.trim();
        val.classList.remove('ph');
        if (li.dataset.icon) {
          const old = btn.firstElementChild;
          if (old) { const i = document.createElement('i'); i.dataset.lucide = li.dataset.icon; old.replaceWith(i); icons(); }
        }
        if (err) { err.hidden = true; btn.classList.remove('invalid'); btn.removeAttribute('aria-invalid'); }
        return false;
      },
    });
  });

  // Multi select with chips
  $$('[data-fx-ms]').forEach((ms) => {
    const PEOPLE = [['Dave', 'blue', 7, 1248], ['Mira', 'orange', 5, 1302], ['Sam', 'yellow', 1, 1190], ['Ann', 'green', 6, 1150], ['Joe', 'red', 3, 1001], ['Kim', 'purple', 4, 1102]];
    const max = +ms.dataset.max;
    const box = $('[data-fx-ms-box]', ms), add = $('[data-fx-ms-add]', ms), menu = $('[data-fx-ms-menu]', ms);
    const count = ms.parentElement.querySelector('[data-fx-ms-count]');
    const picked = new Set(['Dave', 'Mira']);
    menu.innerHTML = PEOPLE.map(([n, c, no, elo]) =>
      `<li role="option" aria-selected="false" data-n="${n}"><span class="check" aria-hidden="true"><i data-lucide="check"></i></span>${av(c, n[0], null, 'sm')}${n}<span class="elo">${k3(elo)}</span></li>`).join('');
    const sync = () => {
      $$('.fx-tag', box).forEach((t) => t.remove());
      PEOPLE.filter((p) => picked.has(p[0])).forEach(([n, c]) => {
        const t = document.createElement('span');
        t.className = 'fx-tag';
        t.innerHTML = `${av(c, n[0], null, 'sm')}${n}<button type="button" aria-label="Remove ${n}" data-rm="${n}"><i data-lucide="x"></i></button>`;
        box.insertBefore(t, add);
      });
      const full = picked.size >= max;
      $$('[role=option]', menu).forEach((li) => {
        const on = picked.has(li.dataset.n);
        li.setAttribute('aria-selected', String(on));
        if (!on && full) li.setAttribute('aria-disabled', 'true'); else li.removeAttribute('aria-disabled');
      });
      add.textContent = full ? 'Team is full' : picked.size ? 'Add more' : 'Add players';
      count.textContent = full ? `${max} of ${max} picked, ready for 2v2` : `${picked.size} of ${max} picked`;
      icons();
    };
    listbox(add, menu, {
      root: box,
      onPick(li) {
        const n = li.dataset.n;
        if (picked.has(n)) picked.delete(n); else if (picked.size < max) picked.add(n);
        sync();
        return true;
      },
    });
    box.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { picked.delete(rm.dataset.rm); sync(); add.focus(); return; }
      if (e.target === box) add.click();
    });
    sync();
  });

  /* ===== Search with results ===== */
  const srch = $('[data-fx-srch]');
  if (srch) {
    const PLAYERS = [['Dave', 'blue', 7, 1248], ['Mira', 'orange', 5, 1302], ['Sam', 'yellow', 1, 1190], ['Ann', 'green', 6, 1150], ['Joe', 'red', 3, 1001], ['Kim', 'purple', 4, 1102], ['Daniel', 'maroon', 9, 980], ['Samira', 'ink', 11, 1215]];
    const LEAGUES = [['Office foosball', 'target', 'Acme Studio, 14 players'], ['Friday darts', 'crosshair', 'Acme Studio, 8 players'], ['Lunch table tennis', 'circle-dot', '6 players'], ['Pool after work', 'disc', '9 players'], ['Madison pool club', 'disc', '22 players']];
    const q = $('[data-fx-sq]', srch), panel = $('[data-fx-spanel]', srch), clear = $('[data-fx-sclear]', srch), live = $('[data-fx-slive]', srch);
    let recent = ['Mira', 'Office foosball', 'table tennis'];
    let active = -1;
    const hl = (text, term) => {
      const i = text.toLowerCase().indexOf(term.toLowerCase());
      if (!term || i < 0) return esc(text);
      return esc(text.slice(0, i)) + '<mark class="fx-hl">' + esc(text.slice(i, i + term.length)) + '</mark>' + esc(text.slice(i + term.length));
    };
    const opts = () => $$('[role=option]', panel);
    const setActive = (i) => {
      const all = opts();
      if (!all.length) { active = -1; q.removeAttribute('aria-activedescendant'); return; }
      active = (i + all.length) % all.length;
      all.forEach((o, k) => o.classList.toggle('on', k === active));
      q.setAttribute('aria-activedescendant', all[active].id);
      all[active].scrollIntoView({ block: 'nearest' });
    };
    function render() {
      const term = q.value.trim();
      clear.hidden = !q.value;
      active = -1; q.removeAttribute('aria-activedescendant');
      if (!term) {
        panel.innerHTML = recent.length
          ? `<div class="fx-sr-gh"><span>Recent</span><button class="btn ghost sm" data-clear-all>Clear all</button></div><ul role="listbox" id="fx-sr-list" aria-label="Recent searches">${recent.map((r, i) =>
              `<li class="fx-rec" role="option" id="fx-sr-o${i}" data-v="${esc(r)}" aria-selected="false"><button tabindex="-1" data-pick><i data-lucide="clock"></i>${esc(r)}</button><button class="ibtn plain" tabindex="-1" aria-label="Remove ${esc(r)} from recent" data-rm="${i}"><i data-lucide="x"></i></button></li>`).join('')}</ul>`
          : `<ul role="listbox" id="fx-sr-list" aria-label="Recent searches"></ul><div class="empty"><span class="ill"><i data-lucide="history"></i></span><b>No recent searches</b><p>Players and leagues you look up show here.</p></div>`;
        live.textContent = '';
        icons();
        return;
      }
      const t = term.toLowerCase();
      const ps = PLAYERS.filter((p) => p[0].toLowerCase().includes(t));
      const ls = LEAGUES.filter((l) => l[0].toLowerCase().includes(t));
      let k = 0;
      let html = '<ul role="listbox" id="fx-sr-list" aria-label="Search results">';
      if (ps.length) {
        html += `<li role="presentation" class="fx-sr-gh"><span>Players</span><span class="num">${ps.length}</span></li>`;
        html += ps.map(([n, c, no, elo]) => `<li class="row fx-opt" role="option" aria-selected="false" id="fx-sr-o${k++}" data-v="${n}">${av(c, n[0], no, 'sm')}<span class="main"><b>${hl(n, term)}</b></span><span class="elo">${k3(elo)}</span></li>`).join('');
      }
      if (ls.length) {
        html += `<li role="presentation" class="fx-sr-gh"><span>Leagues</span><span class="num">${ls.length}</span></li>`;
        html += ls.map(([n, ic, sub]) => `<li class="row fx-opt" role="option" aria-selected="false" id="fx-sr-o${k++}" data-v="${n}"><span class="lead"><i data-lucide="${ic}"></i></span><span class="main"><b>${hl(n, term)}</b><span>${sub}</span></span><i data-lucide="chevron-right" style="color:var(--text-3)"></i></li>`).join('');
      }
      html += '</ul>';
      if (!ps.length && !ls.length) {
        html += `<div class="empty"><span class="ill"><i data-lucide="search-x"></i></span><b>Nobody called "${esc(term)}" yet</b><p>Check the spelling, or invite them to the league.</p><button class="btn secondary sm"><i data-lucide="user-plus"></i>Invite a player</button></div>`;
      }
      panel.innerHTML = html;
      live.textContent = k ? `${k} results` : 'No results';
      icons();
    }
    const select = (o) => {
      const v = o.dataset.v;
      recent = [v, ...recent.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, 5);
      q.value = v;
      render();
      live.textContent = `Opening ${v}`;
    };
    q.addEventListener('input', render);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); select(opts()[active]); }
      else if (e.key === 'Escape' && q.value) { e.preventDefault(); q.value = ''; render(); }
    });
    clear.addEventListener('click', () => { q.value = ''; render(); q.focus(); });
    panel.addEventListener('mousedown', (e) => { if (e.target.closest('[role=option]')) e.preventDefault(); });
    panel.addEventListener('click', (e) => {
      if (e.target.closest('[data-clear-all]')) { recent = []; render(); q.focus(); return; }
      const rm = e.target.closest('[data-rm]');
      if (rm) { recent.splice(+rm.dataset.rm, 1); render(); q.focus(); return; }
      const o = e.target.closest('[role=option]');
      if (o) select(o);
    });
    render();
  }

  /* ===== Swipe rows and long press ===== */
  const swWrap = $('[data-fx-swp-wrap]');
  if (swWrap) {
    const lp = $('[data-fx-lp]', swWrap), toastSlot = $('[data-fx-swp-toast]', swWrap);
    let openRow = null, lpRow = null, toastT = null;
    const W = 84;
    const width = (li) => $$('.fx-swp-act', li).length * W;
    const setX = (li, x) => $('.fx-swp-fg', li).style.setProperty('--x', x + 'px');
    const setOpen = (li, on) => {
      setX(li, on ? -width(li) : 0);
      $('.fx-swp-acts', li).setAttribute('aria-hidden', String(!on));
      $$('.fx-swp-act', li).forEach((b) => (b.tabIndex = on ? 0 : -1));
      if (on) { if (openRow && openRow !== li) setOpen(openRow, false); openRow = li; } else if (openRow === li) openRow = null;
    };
    const toast = (html) => {
      clearTimeout(toastT);
      toastSlot.innerHTML = `<div class="toast dk">${html}</div>`;
      icons();
      toastT = setTimeout(() => { toastSlot.innerHTML = ''; }, 6000);
    };
    const del = (li) => {
      const parent = li.parentElement, nextEl = li.nextElementSibling;
      const name = $('.fx-swp-fg', li).dataset.name;
      setOpen(li, false);
      li.style.height = li.offsetHeight + 'px';
      requestAnimationFrame(() => { li.style.height = '0px'; });
      setTimeout(() => li.remove(), reduced() ? 0 : 300);
      toast(`<i data-lucide="trash-2"></i><div class="tx"><b>Match with ${esc(name)} deleted</b>Ratings update in a moment</div><button class="fx-undo" data-undo>Undo</button>`);
      $('[data-undo]', toastSlot).addEventListener('click', () => {
        li.style.height = '';
        parent.insertBefore(li, nextEl && nextEl.parentElement === parent ? nextEl : null);
        toastSlot.innerHTML = '';
        $('.fx-swp-fg', li).focus();
      });
    };
    const act = (li, a) => {
      const name = $('.fx-swp-fg', li).dataset.name;
      if (a === 'delete') return del(li);
      setOpen(li, false);
      const msg = { rematch: [`rotate-ccw`, `Rematch sent to ${name}`, 'They have 24 h to accept'], share: ['share', 'Result copied', 'Paste it anywhere'], report: ['flag', 'Thanks, the admin will look', 'Nothing changes until they do'] }[a];
      toast(`<i data-lucide="${msg[0]}"></i><div class="tx"><b>${esc(msg[1])}</b>${msg[2]}</div>`);
    };
    const showMenu = (li) => {
      lpRow = li;
      const del = $('[data-act=delete]', lp);
      const canDel = !!$('.fx-swp-act.del', li);
      del.hidden = !canDel; lp.querySelector('hr').hidden = !canDel;
      lp.hidden = false;
      const top = li.offsetTop + li.offsetHeight - 6;
      const room = swWrap.offsetHeight - top;
      lp.style.top = (room < lp.offsetHeight ? Math.max(0, li.offsetTop - lp.offsetHeight + 6) : top) + 'px';
      icons();
      $('button:not([hidden])', lp).focus();
    };
    const hideMenu = (refocus) => {
      if (lp.hidden) return;
      lp.hidden = true;
      if (refocus && lpRow && lpRow.isConnected) $('.fx-swp-fg', lpRow).focus();
      lpRow = null;
    };
    lp.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !lpRow) return;
      const li = lpRow; hideMenu(false); act(li, b.dataset.act);
    });
    lp.addEventListener('keydown', (e) => {
      const items = $$('button:not([hidden])', lp);
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideMenu(true); }
      if (e.key === 'Tab') hideMenu(false);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!lp.hidden && !lp.contains(e.target)) hideMenu(false);
      if (openRow && !openRow.contains(e.target)) setOpen(openRow, false);
    });

    $$('[data-fx-swipe]', swWrap).forEach((li) => {
      const fg = $('.fx-swp-fg', li);
      let st = null, timer = null, moved = false;
      $$('.fx-swp-act', li).forEach((b) => b.addEventListener('click', () => act(li, b.dataset.act)));
      fg.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        const base = openRow === li ? -width(li) : 0;
        st = { x: e.clientX, y: e.clientY, base, drag: false, id: e.pointerId };
        moved = false;
        fg.classList.add('press');
        timer = setTimeout(() => { fg.classList.remove('press'); st = null; moved = true; showMenu(li); }, 500);
      });
      fg.addEventListener('pointermove', (e) => {
        if (!st) return;
        const dx = e.clientX - st.x, dy = e.clientY - st.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) { clearTimeout(timer); fg.classList.remove('press'); }
        if (!st.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          st.drag = true; moved = true;
          fg.setPointerCapture(st.id);
          fg.classList.add('drag');
        }
        if (st.drag) {
          const w = width(li);
          let x = st.base + dx;
          if (x < -w) x = -w - (-w - x) * 0.25;
          setX(li, Math.min(0, x));
        }
      });
      const up = (e) => {
        clearTimeout(timer); fg.classList.remove('press');
        if (!st) return;
        if (st.drag) {
          const dx = e.clientX - st.x;
          fg.classList.remove('drag');
          setOpen(li, st.base + dx < -width(li) / 2);
        }
        st = null;
      };
      fg.addEventListener('pointerup', up);
      fg.addEventListener('pointercancel', up);
      fg.addEventListener('click', (e) => { if (moved) { e.preventDefault(); moved = false; } });
      fg.addEventListener('contextmenu', (e) => { e.preventDefault(); clearTimeout(timer); fg.classList.remove('press'); st = null; showMenu(li); });
      fg.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setOpen(li, true); }
        if (e.key === 'ArrowRight' || (e.key === 'Escape' && openRow === li)) { e.preventDefault(); e.stopPropagation(); setOpen(li, false); }
        if (e.key === 'Enter' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); showMenu(li); }
      });
    });
  }

  /* ===== Pull to refresh and load more ===== */
  const ptr = $('[data-fx-ptr]');
  if (ptr) {
    const scroll = $('[data-fx-ptr-scroll]', ptr), content = $('[data-fx-ptr-content]', ptr);
    const feed = $('[data-fx-feed]', ptr), more = $('[data-fx-more]', ptr);
    const ic = $('[data-fx-ptr-ic]', ptr), tx = $('[data-fx-ptr-tx]', ptr), live = $('[data-fx-ptr-live]', ptr);
    const ind = $('.fx-ptr-ind', ptr);
    const TH = 64, HOLD = 56;
    const rowHtml = ([a, ac, ano, b, bc, s, when], cls = '') =>
      `<li class="row ${cls}">${av(ac, a[0], ano)}<span class="main"><b>${a} beat ${b}</b><span class="num">${s}, ${when}</span></span>${av(bc, b[0], null, 'sm')}</li>`;
    const FEED = [
      ['Mira', 'orange', 5, 'Dave', 'blue', '10 to 7', '12 min ago'], ['Sam', 'yellow', 1, 'Kim', 'purple', '10 to 9', '40 min ago'],
      ['Ann', 'green', 6, 'Joe', 'red', '10 to 4', '1 h ago'], ['Dave', 'blue', 7, 'Sam', 'yellow', '10 to 8', '2 h ago'],
      ['Kim', 'purple', 4, 'Ann', 'green', '10 to 6', '3 h ago'],
    ];
    const OLDER = [
      ['Joe', 'red', 3, 'Mira', 'orange', '10 to 9', 'yesterday'], ['Mira', 'orange', 5, 'Sam', 'yellow', '10 to 5', 'yesterday'],
      ['Ann', 'green', 6, 'Dave', 'blue', '10 to 8', 'Saturday'], ['Kim', 'purple', 4, 'Joe', 'red', '10 to 3', 'Friday'],
    ];
    const FRESH = [['Dave', 'blue', 7, 'Mira', 'orange', '10 to 8', 'just now'], ['Joe', 'red', 3, 'Kim', 'purple', '10 to 6', 'just now']];
    feed.innerHTML = FEED.map((r) => rowHtml(r)).join('');
    let loads = 0, state = 'idle', pull = 0, freshI = 0;

    const setIc = (name, rot = 0) => {
      if (name === 'spin') ic.innerHTML = '<span class="fx-spin"></span>';
      else { ic.innerHTML = `<i data-lucide="${name}"></i>`; icons(); }
      ic.style.setProperty('--rot', rot + 'deg');
    };
    const setPull = (v) => { pull = v; content.style.setProperty('--pull', v + 'px'); ind.style.setProperty('--o', Math.min(1, v / TH)); };
    const refresh = () => {
      if (state === 'busy') return;
      state = 'busy';
      setPull(HOLD); setIc('spin'); tx.textContent = 'Refreshing'; live.textContent = 'Refreshing';
      setTimeout(() => {
        const r = FRESH[freshI++ % FRESH.length];
        feed.insertAdjacentHTML('afterbegin', rowHtml(r, 'fx-new'));
        setIc('check'); tx.textContent = 'Updated just now'; live.textContent = 'Feed updated, 1 new match';
        setTimeout(() => { setPull(0); state = 'idle'; setTimeout(() => { if (state === 'idle') { setIc('arrow-down'); tx.textContent = 'Pull to refresh'; } }, 300); }, 700);
      }, 1200);
    };
    const move = (dy) => {
      const v = Math.min(110, Math.max(0, dy * 0.5));
      setPull(v);
      const past = v >= TH;
      if (past !== ptr._past) { ptr._past = past; tx.textContent = past ? 'Release to refresh' : 'Pull to refresh'; }
      ic.style.setProperty('--rot', past ? '180deg' : '0deg');
    };
    const release = () => {
      ptr.classList.remove('pulling');
      if (pull >= TH) refresh(); else setPull(0);
      ptr._past = false;
    };
    // Mouse and pen
    let sy = null;
    scroll.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button || state === 'busy' || scroll.scrollTop > 0 || e.target.closest('button')) return;
      sy = e.clientY;
    });
    scroll.addEventListener('pointermove', (e) => {
      if (sy == null) return;
      const dy = e.clientY - sy;
      if (dy > 4 && !ptr.classList.contains('pulling')) { ptr.classList.add('pulling'); scroll.setPointerCapture(e.pointerId); }
      if (ptr.classList.contains('pulling')) move(dy);
    });
    const pEnd = () => { if (sy == null) return; sy = null; if (ptr.classList.contains('pulling')) release(); };
    scroll.addEventListener('pointerup', pEnd); scroll.addEventListener('pointercancel', pEnd);
    // Touch
    let ty = null;
    scroll.addEventListener('touchstart', (e) => { if (state !== 'busy' && scroll.scrollTop <= 0) ty = e.touches[0].clientY; }, { passive: true });
    scroll.addEventListener('touchmove', (e) => {
      if (ty == null) return;
      const dy = e.touches[0].clientY - ty;
      if (dy <= 0 && !ptr.classList.contains('pulling')) { ty = null; return; }
      e.preventDefault();
      ptr.classList.add('pulling');
      move(dy);
    }, { passive: false });
    scroll.addEventListener('touchend', () => { if (ty == null) return; ty = null; if (ptr.classList.contains('pulling')) release(); });
    $('[data-fx-ptr-btn]', ptr).addEventListener('click', () => { scroll.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); refresh(); });

    const moreBtn = (label = 'Load older matches') => {
      more.innerHTML = `<button class="btn secondary" data-load>${label}</button>`;
    };
    more.addEventListener('click', (e) => {
      const b = e.target.closest('[data-load]');
      if (!b) return;
      b.disabled = true;
      b.innerHTML = '<span class="fx-spin"></span>Loading';
      live.textContent = 'Loading older matches';
      setTimeout(() => {
        loads++;
        if (loads === 2) {
          more.innerHTML = '<span class="fx-more-err"><i data-lucide="alert-circle"></i>Older matches did not load.</span><button class="btn secondary sm" data-load>Try again</button>';
          live.textContent = 'Older matches did not load';
          icons();
          return;
        }
        const chunk = loads === 1 ? OLDER.slice(0, 2) : OLDER.slice(2);
        feed.insertAdjacentHTML('beforeend', chunk.map((r) => rowHtml(r, 'fx-new')).join(''));
        live.textContent = `${chunk.length} older matches loaded`;
        if (loads >= 3) {
          more.innerHTML = '<span class="fx-more-end"><i data-lucide="check"></i>That is every match this season</span>';
          icons();
        } else moreBtn();
      }, 900);
    });
    moreBtn();
    icons();
  }

  /* ===== Invite code ===== */
  $$('[data-fx-otp]').forEach((g) => {
    const boxes = $$('input', g);
    const wrap = g.closest('[data-fx-otp-wrap]');
    const msg = $('[data-fx-otp-msg]', wrap);
    const VALID = '482913';
    const DEF = msg.innerHTML;
    let tmr = null;
    const code = () => boxes.map((b) => b.value).join('');
    const reset = () => {
      if (!g.classList.contains('err') && !g.classList.contains('ok')) return;
      g.classList.remove('err', 'ok');
      boxes.forEach((b) => b.removeAttribute('aria-invalid'));
      msg.className = 'fx-otp-msg'; msg.innerHTML = DEF;
    };
    const check = () => {
      clearTimeout(tmr);
      if (code().length < 6) return;
      g.classList.add('busy');
      msg.className = 'fx-otp-msg';
      msg.innerHTML = '<span class="fx-spin"></span>Checking the code';
      tmr = setTimeout(() => {
        g.classList.remove('busy');
        if (code() === VALID) {
          g.classList.add('ok');
          msg.className = 'fx-otp-msg ok';
          msg.innerHTML = '<i data-lucide="check-circle-2"></i>You are in. Joining Office foosball.';
          boxes.forEach((b) => b.blur());
        } else {
          g.classList.add('err');
          boxes.forEach((b) => b.setAttribute('aria-invalid', 'true'));
          msg.className = 'fx-otp-msg err';
          msg.innerHTML = '<i data-lucide="alert-circle"></i>No league uses this code. Ask for a fresh one.';
        }
        icons();
      }, 700);
    };
    const fill = (start, digits) => {
      let i = start;
      for (const d of digits) { if (i > 5) break; boxes[i++].value = d; }
      boxes[Math.min(i, 5)].focus();
      check();
    };
    boxes.forEach((b, i) => {
      b.addEventListener('focus', () => b.select());
      b.addEventListener('input', () => {
        reset();
        const d = b.value.replace(/\D/g, '');
        if (d.length > 1) { b.value = ''; fill(i, d); return; }
        b.value = d;
        if (d && i < 5) boxes[i + 1].focus();
        check();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); reset(); boxes[i - 1].value = ''; boxes[i - 1].focus(); }
        if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
        if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); boxes[i + 1].focus(); }
      });
      b.addEventListener('paste', (e) => {
        e.preventDefault();
        const d = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        if (!d) return;
        reset();
        fill(d.length === 6 ? 0 : i, d);
      });
    });
    $('[data-fx-otp-clear]', wrap).addEventListener('click', () => {
      clearTimeout(tmr); g.classList.remove('busy');
      boxes.forEach((b) => (b.value = '')); reset(); boxes[0].focus();
    });
  });

  /* ===== Form validation ===== */
  $$('[data-fx-form]').forEach((form) => {
    const sum = $('[data-fx-sum]', form), done = $('[data-fx-done]', form);
    const ta = $('textarea', form), cnt = $('[data-fx-count]', form), max = +ta.dataset.max;
    const F = {
      name: { el: $('#fx-f-name', form), label: 'League name', test: (v) => (v.length < 3 ? 'Give the league a name, 3 characters or more' : v.toLowerCase() === 'office foosball' ? 'Acme Studio already has a league with this name. Try another.' : ''), ok: (v) => `${v} is free` },
      email: { el: $('#fx-f-email', form), label: 'Invite by email', test: (v) => (!v ? 'Add one email to send the first invite' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Add the full address, like dave@example.com'), ok: () => 'Invite ready to send' },
      desc: { el: ta, label: 'Description', test: (v) => (v.length > max ? `${v.length - max} characters over, trim a little to save` : ''), ok: null },
    };
    const touched = new Set();
    const show = (k) => {
      const f = F[k], v = f.el.value.trim(), field = f.el.closest('.field');
      const m = $('.fx-msg', field), wrapEl = f.el.closest('.fx-fw') || field;
      const err = f.test(v);
      f.el.classList.toggle('invalid', !!err);
      if (err) f.el.setAttribute('aria-invalid', 'true'); else f.el.removeAttribute('aria-invalid');
      wrapEl.classList.toggle('fx-valid', !err && !!f.ok && !!v);
      if (err) m.innerHTML = `<span class="err"><i data-lucide="alert-circle"></i>${esc(err)}</span>`;
      else if (f.ok && v) m.innerHTML = `<span class="fx-okmsg"><i data-lucide="check-circle-2"></i>${esc(f.ok(v))}</span>`;
      else if (k !== 'desc') m.innerHTML = m.dataset.def;
      else m.innerHTML = '';
      icons();
      return err;
    };
    Object.entries(F).forEach(([k, f]) => {
      const m = $('.fx-msg', f.el.closest('.field'));
      m.dataset.def = m.innerHTML;
      f.el.addEventListener('blur', () => { if (f.el.value.trim()) touched.add(k); if (touched.has(k)) show(k); });
      f.el.addEventListener('input', () => { done.hidden = true; if (touched.has(k)) show(k); });
    });
    const count = () => {
      const n = ta.value.length;
      cnt.textContent = `${n} of ${max}`;
      cnt.classList.toggle('near', n >= max - 20 && n <= max);
      cnt.classList.toggle('over', n > max);
      if (n > max) { touched.add('desc'); show('desc'); } else if (touched.has('desc')) show('desc');
    };
    ta.addEventListener('input', count);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const errs = Object.keys(F).map((k) => { touched.add(k); return [k, show(k)]; }).filter(([, er]) => er);
      if (errs.length) {
        done.hidden = true;
        sum.hidden = false;
        sum.innerHTML = `<i data-lucide="alert-circle"></i><div class="tx"><b>${errs.length === 1 ? '1 thing needs' : errs.length + ' things need'} a look</b><ul>${errs.map(([k]) => `<li><button type="button" data-go="${k}">${F[k].label}<i data-lucide="arrow-down"></i></button></li>`).join('')}</ul></div>`;
        icons();
        sum.focus();
      } else {
        sum.hidden = true;
        done.hidden = false;
        done.innerHTML = `<i data-lucide="check-circle-2"></i><div class="tx"><b>${esc(F.name.el.value.trim())} is ready</b>The invite is on its way to ${esc(F.email.el.value.trim())}.</div>`;
        icons();
        done.focus();
      }
    });
    sum.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) F[b.dataset.go].el.focus(); });
    form.addEventListener('reset', () => {
      setTimeout(() => {
        touched.clear(); sum.hidden = true; done.hidden = true;
        Object.keys(F).forEach((k) => {
          const f = F[k]; f.el.classList.remove('invalid'); f.el.removeAttribute('aria-invalid');
          (f.el.closest('.fx-fw') || f.el.closest('.field')).classList.remove('fx-valid');
          const m = $('.fx-msg', f.el.closest('.field')); m.innerHTML = m.dataset.def;
        });
        count();
      });
    });
    count();
  });

  icons();
})();
