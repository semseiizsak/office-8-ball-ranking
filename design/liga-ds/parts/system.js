/* Liga DS part: System and account behaviour. Prefix sy-. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icons = () => { if (window.lucide) lucide.createIcons(); };
  const press = (group, btn) => $$(':scope > button', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));

  /* ---------- Paywall ---------- */
  const pw = $('#sy-paywall');
  if (pw) {
    const PRICES = {
      year: { price: '€31.99', per: 'A year, €2.67 a month', then: 'Then €31.99 a year, renews until you cancel' },
      month: { price: '€3.99', per: 'A month', then: 'Then €3.99 a month, renews until you cancel' },
    };
    let period = 'year';
    let plan = 'pro';
    const buy = $('[data-sy-buy]', pw);
    const then = $('[data-sy-then]', pw);
    const render = () => {
      const p = PRICES[period];
      $('[data-sy-price]', pw).textContent = p.price;
      $('[data-sy-per]', pw).textContent = p.per;
      const pro = plan === 'pro';
      buy.className = 'btn block lg ' + (pro ? 'brand' : 'secondary');
      buy.textContent = pro ? 'Start 7 days free' : 'Continue with Free';
      then.textContent = pro ? p.then : 'Free stays free, upgrade any time.';
    };
    pw.addEventListener('click', (e) => {
      const per = e.target.closest('[data-sy-period]');
      if (per) { press(per.parentElement, per); period = per.dataset.syPeriod; render(); }
      const pl = e.target.closest('[data-sy-plan]');
      if (pl) { press(pl.parentElement, pl); plan = pl.dataset.syPlan; render(); }
      if (e.target.closest('[data-sy-buy]') && plan === 'pro' && !buy.dataset.busy) {
        buy.dataset.busy = '1';
        buy.setAttribute('aria-disabled', 'true');
        buy.innerHTML = '<span class="spin"></span>Confirming';
        setTimeout(() => {
          buy.removeAttribute('aria-disabled');
          buy.classList.add('sy-btn-ok');
          buy.innerHTML = '<i data-lucide="check"></i>You\'re on Pro';
          icons();
          setTimeout(() => { delete buy.dataset.busy; buy.classList.remove('sy-btn-ok'); render(); }, 1800);
        }, 1200);
      }
    });
  }

  /* ---------- Onboarding pager ---------- */
  const onb = $('#sy-onb');
  if (onb) {
    const track = $('[data-sy-track]', onb);
    const dots = $$('[data-sy-dots] button', onb);
    const next = $('[data-sy-next]', onb);
    const skip = $('[data-sy-skip]', onb);
    const slides = $$('.sy-slide', onb);
    let i = 0;
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      track.style.transform = `translateX(${-100 * i}%)`;
      dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
      slides.forEach((s, k) => s.setAttribute('aria-hidden', String(k !== i)));
      const last = i === slides.length - 1;
      next.textContent = last ? 'Get started' : 'Next';
      skip.hidden = last;
    };
    next.addEventListener('click', () => go(i + 1));
    skip.addEventListener('click', () => go(slides.length - 1));
    dots.forEach((d, k) => d.addEventListener('click', () => go(k)));
    let x0 = null;
    track.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    track.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) go(Math.max(0, Math.min(slides.length - 1, i + (dx < 0 ? 1 : -1))));
    });
    go(0);
  }

  /* ---------- Sync pill demo ---------- */
  const runSync = $('[data-sy-sync-run]');
  const live = $('#sy-sync-live');
  if (runSync && live) {
    const STATES = {
      off: ['sy-off', '<i data-lucide="wifi-off"></i>Offline, 2 matches saved here'],
      ing: ['sy-ing', '<span class="sy-spin"></span>Syncing 2 matches'],
      ok: ['sy-ok', '<i data-lucide="check"></i>All synced'],
    };
    const set = (k) => { live.className = 'sy-sync ' + STATES[k][0]; live.innerHTML = STATES[k][1]; live.style.visibility = ''; icons(); };
    let t = [];
    runSync.addEventListener('click', () => {
      t.forEach(clearTimeout);
      set('ing');
      t = [setTimeout(() => set('ok'), 1600), setTimeout(() => { live.style.visibility = 'hidden'; }, 3600), setTimeout(() => set('off'), 5200)];
    });
  }

  /* ---------- Coach mark ---------- */
  const coach = $('#sy-coach');
  if (coach) {
    const STEPS = [
      ['Log a match here', 'Tap plus after every game. Opponent, winner, done.', 999],
      ['Switch leagues', 'Your teams and leagues live behind the league name.', 16],
      ['This is you', 'Your rank and rating. Win to climb, take the crown at 1.', 12],
    ];
    const spot = $('[data-sy-spot]', coach);
    const card = $('[data-sy-cmcard]', coach);
    const nextBtn = $('[data-sy-cmnext]', coach);
    let s = 0;
    const place = () => {
      const target = $(`[data-sy-cm="${s}"]`, coach);
      const pr = coach.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      const pad = 6;
      const top = r.top - pr.top - pad;
      Object.assign(spot.style, { left: r.left - pr.left - pad + 'px', top: top + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px', borderRadius: STEPS[s][2] + 'px' });
      $('[data-sy-cmt]', card).textContent = STEPS[s][0];
      $('[data-sy-cmp]', card).textContent = STEPS[s][1];
      $('[data-sy-cmn]', card).textContent = `${s + 1} of ${STEPS.length}`;
      nextBtn.textContent = s === STEPS.length - 1 ? 'Got it' : 'Next';
      const ch = card.offsetHeight;
      const below = top + r.height + pad * 2 + 12;
      card.style.top = (below + ch < pr.height - 8 ? below : top - ch - 12) + 'px';
      spot.style.visibility = card.style.visibility = '';
    };
    const end = () => {
      spot.style.visibility = card.style.visibility = 'hidden';
      setTimeout(() => { s = 0; place(); }, 1600);
    };
    nextBtn.addEventListener('click', () => { if (s === STEPS.length - 1) end(); else { s += 1; place(); } });
    $('[data-sy-cmskip]', coach).addEventListener('click', end);
    const ready = () => requestAnimationFrame(place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ready); else ready();
    window.addEventListener('resize', ready);
    new ResizeObserver(ready).observe(coach);
  }

  /* ---------- Kiosk: player picker (idempotent with page.js data-single) ---------- */
  $$('[data-sy-kiosk]').forEach((k) => k.addEventListener('click', (e) => {
    const b = e.target.closest('.sy-kpl');
    if (!b || b.disabled) return;
    const grid = b.parentElement;
    press(grid, b);
    $$('.sy-ktick', grid).forEach((t) => t.remove());
    b.insertAdjacentHTML('afterbegin', '<em class="sy-ktick"><i data-lucide="check"></i></em>');
    const name = $('b', b).textContent;
    const cta = $('[data-sy-kcta]', k);
    if (cta) cta.innerHTML = (name === 'Guest' ? 'Continue as guest' : `Continue as ${name}`) + '<i data-lucide="arrow-right"></i>';
    const pinEl = $('[data-sy-pin]', k);
    if (pinEl && name !== 'Guest') {
      pinEl.dataset.name = name;
      const t = $('[data-sy-kname]', pinEl); if (t) t.textContent = `Hi ${name}`;
      const slot = $('[data-sy-kav]', pinEl); const src = $('.av', b);
      if (slot && src) { const c = src.cloneNode(true); c.style.setProperty('--av', getComputedStyle($('.av', slot)).getPropertyValue('--av')); slot.replaceChildren(c); }
      pinEl.dispatchEvent(new CustomEvent('sy-reset'));
    }
    icons();
  }));

  /* ---------- Kiosk: PIN pad ---------- */
  $$('[data-sy-pin]').forEach((pin) => {
    const dotsWrap = $('[data-sy-kdots]', pin);
    const dots = $$('i', dotsWrap);
    const msg = $('[data-sy-kmsg]', pin);
    const keys = $$('.sy-kkey', pin);
    let code = '';
    let lock = false;
    const draw = () => {
      dots.forEach((d, k) => d.classList.toggle('sy-on', k < code.length));
      dotsWrap.setAttribute('aria-label', `${code.length} of 4 digits entered`);
    };
    const setMsg = (t, cls = '') => { msg.textContent = t; msg.className = 'sy-kmsg ' + cls; };
    const lockKeys = (v) => { lock = v; keys.forEach((k) => { k.disabled = v; }); };
    const reset = () => { dotsWrap.classList.remove('sy-ok', 'sy-err', 'sy-shake'); code = ''; draw(); setMsg('Demo PIN is 1234'); lockKeys(false); };
    pin.addEventListener('sy-reset', reset);
    const check = () => {
      lockKeys(true);
      if (code === '1234') {
        dotsWrap.classList.add('sy-ok');
        setMsg(`Welcome back, ${pin.dataset.name || 'Mira'}`, 'sy-good');
        setTimeout(reset, 1800);
      } else {
        dotsWrap.classList.add('sy-err', 'sy-shake');
        setMsg('That PIN didn\'t match, try again', 'sy-bad');
        setTimeout(() => { dotsWrap.classList.remove('sy-err', 'sy-shake'); code = ''; draw(); lockKeys(false); }, 700);
      }
    };
    const input = (k) => {
      if (lock) return;
      if (k === 'del') { code = code.slice(0, -1); draw(); return; }
      if (k === 'forgot') { setMsg(`Reset link sent to ${pin.dataset.name || 'Mira'}'s phone`); return; }
      if (code.length >= 4) return;
      code += k; draw();
      if (msg.classList.contains('sy-bad')) setMsg('Demo PIN is 1234');
      if (code.length === 4) setTimeout(check, 120);
    };
    pin.addEventListener('click', (e) => { const b = e.target.closest('.sy-kkey'); if (b) input(b.dataset.k); });
    pin.addEventListener('keydown', (e) => {
      if (/^[0-9]$/.test(e.key)) { input(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { input('del'); e.preventDefault(); }
    });
  });

  /* ---------- Delete account confirm ---------- */
  const del = $('#sy-del');
  if (del) {
    const field = $('#sy-del-input', del);
    const btn = $('[data-sy-delbtn]', del);
    const cancel = $('[data-sy-delcancel]', del);
    const hint = $('[data-sy-delhint]', del);
    const form = $('[data-sy-delform]', del);
    const done = $('[data-sy-deldone]', del);
    const sync = () => {
      const ok = field.value.trim() === 'DELETE';
      btn.disabled = !ok;
      hint.textContent = ok ? 'Matches, you can delete now' : 'Capital letters, exactly as shown';
      hint.classList.toggle('sy-match', ok);
    };
    field.addEventListener('input', sync);
    btn.addEventListener('click', () => {
      if (btn.dataset.state === 'done') { reset(); return; }
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span>Deleting';
      setTimeout(() => {
        form.hidden = true; done.hidden = false;
        btn.className = 'btn primary block lg'; btn.disabled = false; btn.textContent = 'Close'; btn.dataset.state = 'done';
        cancel.hidden = true;
      }, 1300);
    });
    const reset = () => {
      form.hidden = false; done.hidden = true; cancel.hidden = false;
      btn.className = 'btn danger block lg'; btn.textContent = 'Delete account'; delete btn.dataset.state;
      field.value = ''; sync();
    };
    cancel.addEventListener('click', () => { field.value = ''; sync(); });
    sync();
  }

  /* ---------- League switcher: current check (static and sheet) ---------- */
  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-sy-switch] .sy-lg-row');
    if (!row) return;
    $$('.sy-lg-row', row.closest('[data-sy-switch]')).forEach((r) => r.setAttribute('aria-current', String(r === row)));
  });

  /* ---------- Member menu ---------- */
  const members = $('[data-sy-members]');
  if (members) {
    const MENU = (admin) => `<div class="menu" role="menu">
      <button role="menuitem" data-sy-act="role"><i data-lucide="${admin ? 'shield-off' : 'shield'}"></i>${admin ? 'Make member' : 'Make admin'}</button>
      <button role="menuitem"><i data-lucide="refresh-ccw"></i>Reset kiosk PIN</button>
      <button role="menuitem"><i data-lucide="key-round"></i>Transfer ownership</button>
      <hr>
      <button role="menuitem" class="danger" data-sy-act="remove"><i data-lucide="user-minus"></i>Remove from league</button>
    </div>`;
    const close = () => {
      $$('.menu', members).forEach((m) => m.remove());
      $$('[data-sy-menu]', members).forEach((b) => b.setAttribute('aria-expanded', 'false'));
    };
    members.addEventListener('click', (e) => {
      const trig = e.target.closest('[data-sy-menu]');
      const act = e.target.closest('[data-sy-act]');
      if (trig) {
        const open = trig.getAttribute('aria-expanded') === 'true';
        close();
        if (open) return;
        const row = trig.closest('.sy-mrow');
        const admin = !!$('.sy-role.sy-admin', row);
        row.insertAdjacentHTML('beforeend', MENU(admin));
        trig.setAttribute('aria-expanded', 'true');
        icons();
        $('.menu button', row).focus();
        return;
      }
      if (act) {
        const row = act.closest('.sy-mrow');
        if (act.dataset.syAct === 'role') {
          const pill = $('.sy-role', row);
          const admin = pill.classList.contains('sy-admin');
          pill.className = 'sy-role ' + (admin ? 'sy-member' : 'sy-admin');
          pill.innerHTML = admin ? 'Member' : '<i data-lucide="shield"></i>Admin';
        }
        if (act.dataset.syAct === 'remove') {
          row.classList.add('sy-removing');
          setTimeout(() => { row.classList.remove('sy-removing'); }, 1400);
        }
        close(); icons();
      }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('[data-sy-members]')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
})();
