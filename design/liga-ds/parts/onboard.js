/* Liga: onboarding, sign in, plans and plan picker behaviour (prefix ob-). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NB = ' ';
  const money = (v) => {
    const [i, d] = v.toFixed(2).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, NB) + '.' + d;
  };
  const icons = () => { if (window.lucide) lucide.createIcons(); };
  const seen = (el, on, off) => new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? on() : off && off())), { threshold: 0.25 }).observe(el);

  /* ---------- Hero loop: pause off screen ---------- */
  $$('.ob-hero').forEach((h) => seen(h, () => h.classList.remove('ob-off'), () => h.classList.add('ob-off')));

  /* ---------- Ready checklist: play when visible ---------- */
  $$('.ob-checks').forEach((ul) => seen(ul, () => ul.classList.add('ob-play')));

  /* ---------- Story carousel ---------- */
  $$('[data-ob-story]').forEach((root) => {
    const segs = $$('.ob-segs > span', root);
    const track = $('[data-ob-track]', root);
    const pauseBtn = $('[data-ob-pause]', root);
    let i = 0, held = false, holdT = 0, userPaused = false, visible = false;
    const go = (n) => {
      i = Math.max(0, Math.min(segs.length - 1, n));
      segs.forEach((s, k) => { s.classList.remove('on'); s.classList.toggle('done', k < i); });
      void segs[i].offsetWidth;
      segs[i].classList.add('on');
      track.style.transform = `translateX(${-i * 100}%)`;
      $$('.ob-slide', track).forEach((s, k) => s.setAttribute('aria-hidden', String(k !== i)));
    };
    const setPaused = () => root.classList.toggle('ob-paused', userPaused || held || !visible);
    segs.forEach((s, k) => s.querySelector('i').addEventListener('animationend', () => { if (k === i && i < segs.length - 1) go(i + 1); else if (k === i) s.classList.replace('on', 'done'); }));
    $('[data-ob-next]', root).addEventListener('click', () => { if (held) return; go(i + 1); });
    $('[data-ob-prev]', root).addEventListener('click', () => { if (held) return; go(i - 1); });
    $$('.ob-zone', root).forEach((z) => {
      z.addEventListener('pointerdown', () => { holdT = setTimeout(() => { held = true; setPaused(); }, 260); });
      const up = () => { clearTimeout(holdT); if (held) setTimeout(() => { held = false; setPaused(); }, 0); };
      z.addEventListener('pointerup', up); z.addEventListener('pointerleave', up); z.addEventListener('pointercancel', up);
    });
    pauseBtn.addEventListener('click', () => {
      userPaused = !userPaused; setPaused();
      pauseBtn.setAttribute('aria-label', userPaused ? 'Play' : 'Pause');
      pauseBtn.innerHTML = `<i data-lucide="${userPaused ? 'play' : 'pause'}"></i>`; icons();
    });
    if (reduce) userPaused = true;
    seen(root, () => { visible = true; setPaused(); }, () => { visible = false; setPaused(); });
    go(0); setPaused();
  });

  /* ---------- Competitive level sets the defaults ---------- */
  $$('[data-ob-comps]').forEach((group) => {
    const scr = group.closest('.ob-scr');
    group.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ob-comp]'); if (!b) return;
      const lvl = +b.dataset.obComp - 1;
      let on = 0;
      $$('[data-ob-set]', scr).forEach((t) => { const v = t.dataset.obSet[lvl] === '1'; t.setAttribute('aria-checked', String(v)); on += v; });
      const c = $('[data-ob-setcount]', scr); if (c) c.textContent = `${on} of 5`;
    });
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ob-set]'); if (!t) return;
    const scr = t.closest('.ob-scr');
    requestAnimationFrame(() => { const c = $('[data-ob-setcount]', scr); if (c) c.textContent = `${$$('[data-ob-set][aria-checked=true]', scr).length} of 5`; });
  });

  /* ---------- Resend timer ---------- */
  $$('[data-ob-resend]').forEach((box) => {
    const total0 = +box.dataset.obResend;
    const tx = $('[data-ob-rtx]', box), btn = $('[data-ob-rbtn]', box), ring = $('.ob-rp', box);
    const C = 94.25;
    let left = total0, total = total0, timer = 0, started = false, prefix = "Didn't get it? Resend in ";
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const paint = () => {
      ring.style.strokeDashoffset = String(C * (1 - left / total));
      if (left > 0) { tx.innerHTML = `${prefix}<b class="num">${fmt(left)}</b>`; btn.disabled = true; }
      else { tx.textContent = "Didn't get it?"; btn.disabled = false; ring.style.strokeDashoffset = '0'; }
    };
    const run = (secs) => {
      clearInterval(timer); total = left = secs; paint();
      timer = setInterval(() => { left -= 1; paint(); if (left <= 0) clearInterval(timer); }, 1000);
    };
    btn.addEventListener('click', () => { prefix = 'Sent again. Resend in '; run(60); });
    seen(box, () => { if (!started) { started = true; run(total0); } });
    paint();
  });

  /* ---------- Price roll ---------- */
  const strip = '<span class="ob-strip">' + '0123456789'.split('').map((d) => `<span>${d}</span>`).join('') + '</span>';
  function buildRoll(w) {
    const n = $('.ob-roll-n', w);
    const vals = [w.dataset.m, w.dataset.y];
    const intLen = Math.max(...vals.map((v) => v.split('.')[0].length));
    const dec = vals[0].includes('.') ? vals[0].split('.')[1].length : 0;
    let html = '';
    for (let k = 0; k < intLen; k++) html += `<span class="ob-dg" data-int>${strip}</span>`;
    if (dec) { html += '<span class="ob-pt">.</span>'; for (let k = 0; k < dec; k++) html += `<span class="ob-dg" data-dec>${strip}</span>`; }
    const cur = n.textContent.trim();
    n.innerHTML = html;
    n.setAttribute('aria-hidden', 'true');
    w._ob = { intLen };
    setRoll(w, cur, true);
  }
  function setRoll(w, v, instant) {
    if (!w._ob) return;
    const [ip, dp = ''] = v.split('.');
    const ints = $$('[data-int]', w), decs = $$('[data-dec]', w);
    const pad = w._ob.intLen - ip.length;
    if (instant) $$('.ob-dg,.ob-strip', w).forEach((x) => (x.style.transition = 'none'));
    ints.forEach((d, k) => {
      const ch = k < pad ? null : ip[k - pad];
      d.classList.toggle('ob-z', ch === null);
      d.firstElementChild.style.setProperty('--d', ch === null ? 0 : +ch);
    });
    decs.forEach((d, k) => d.firstElementChild.style.setProperty('--d', +(dp[k] || 0)));
    w.setAttribute('aria-label', '€' + v);
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => $$('.ob-dg,.ob-strip', w).forEach((x) => (x.style.transition = ''))));
  }
  $$('[data-ob-slot]').forEach(buildRoll);

  /* ---------- Billing toggles (plans list, cards, picker, roll demo) ---------- */
  const scopeOf = (el) => el.closest('[data-ob-picker],[data-ob-rolldemo],[data-ob-plans]');
  const setBilling = (scope, b) => {
    $$('[data-ob-slot]', scope).forEach((w) => setRoll(w, w.dataset[b]));
    $$('[data-ob-billtx]', scope).forEach((t) => (t.textContent = t.dataset[b]));
    scope._obBill = b;
    if (scope._obSum) scope._obSum();
  };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ob-btog] button[data-b], [data-ob-bill] button[data-b]');
    if (!btn) return;
    $$('button[data-b]', btn.parentElement).forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
    const scope = scopeOf(btn); if (scope) setBilling(scope, btn.dataset.b);
  });

  /* ---------- Per player calculator ---------- */
  $$('[data-ob-calc]').forEach((root) => {
    const RATE = { club: { y: 0.79, m: 0.99 }, biz: { y: 1.99, m: 2.49 } };
    const TEAM = { y: 5.0, m: 5.99 };
    const NAME = { club: 'Club', biz: 'Business' };
    const sl = $('[data-ob-sl]', root), input = $('input', sl);
    let plan = 'club', bill = 'y';
    const upd = () => {
      const n = +input.value;
      sl.style.setProperty('--p', (n - input.min) / (input.max - input.min));
      const r = RATE[plan][bill], tot = n * r;
      $('[data-ob-n]', root).textContent = n;
      $('[data-ob-tot]', root).textContent = '€' + money(tot);
      $('[data-ob-totx]', root).textContent = bill === 'y'
        ? `€${money(r)} per ${plan === 'club' ? 'player' : 'seat'} a month, €${money(tot * 12)} billed yearly`
        : `€${money(r)} per ${plan === 'club' ? 'player' : 'seat'} a month, billed monthly`;
      const vals = { team: n <= 30 ? TEAM[bill] : null, club: n * RATE.club[bill], biz: n * RATE.biz[bill] };
      const max = Math.max(...Object.values(vals).filter((v) => v !== null));
      $$('[data-ob-bars] .ob-brow', root).forEach((row) => {
        const k = row.dataset.k, v = vals[k];
        row.classList.toggle('ob-on', k === plan);
        row.classList.toggle('ob-na', v === null);
        $('i', row).style.width = v === null ? '0%' : `${Math.max(4, (v / max) * 100)}%`;
        $('[data-v]', row).textContent = v === null ? 'Up to 30' : '€' + money(v);
      });
      $('[data-ob-ccta]', root).textContent = `Choose ${NAME[plan]} for ${n} ${plan === 'club' ? 'players' : 'seats'}`;
    };
    input.addEventListener('input', upd);
    root.addEventListener('click', (e) => {
      const p = e.target.closest('[data-ob-cplan] button'); if (p) { plan = p.dataset.p; upd(); }
      const b = e.target.closest('[data-ob-cbill] button'); if (b) { bill = b.dataset.b; upd(); }
      const q = e.target.closest('[data-ob-quick] .chip'); if (q) { input.value = q.textContent; upd(); }
    });
    upd();
  });

  /* ---------- Promo code demo ---------- */
  $$('[data-ob-promo-demo]').forEach((root) => {
    const box = $('.ob-promo', root), input = $('input', root), btn = $('[data-ob-apply]', root), msg = $('[data-ob-pmsg]', root);
    const say = (cls, icon, text) => { msg.className = 'ob-pmsg' + (cls ? ' ' + cls : ''); msg.innerHTML = (icon ? `<i data-lucide="${icon}"></i>` : '') + text; icons(); };
    const reset = () => { box.classList.remove('ob-ok'); input.classList.remove('invalid'); input.readOnly = false; input.value = ''; btn.textContent = 'Apply'; say('', '', 'Codes are not case sensitive.'); input.focus(); };
    btn.addEventListener('click', () => {
      if (btn.textContent === 'Remove') return reset();
      const v = input.value.trim().toUpperCase();
      if (!v) return say('', 'info', 'Add a code to apply it.');
      btn.setAttribute('aria-disabled', 'true'); btn.innerHTML = '<span class="spin"></span>'; input.classList.remove('invalid');
      setTimeout(() => {
        btn.removeAttribute('aria-disabled');
        if (v === 'OFFICE20') { input.value = v; input.readOnly = true; box.classList.add('ob-ok'); btn.textContent = 'Remove'; say('ok', 'circle-check', 'OFFICE20 applied, 20% off the first year'); }
        else { btn.textContent = 'Apply'; input.classList.add('invalid'); say('er', 'alert-circle', "We couldn't find that code. Try another one."); }
      }, 900);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
  });

  /* ---------- Animated plan picker ---------- */
  $$('[data-ob-picker]').forEach((root) => {
    const car = $('[data-ob-car]', root), cards = $$('.ob-pc', car), dots = $$('.ob-dots i', root);
    const sum = $('[data-ob-sum]', root), sName = $('[data-ob-sname]', root), sPrice = $('[data-ob-sprice]', root), buy = $('[data-ob-buy]', root);
    const NAMES = { free: 'Free', team: 'Team', club: 'Club', biz: 'Business' };
    const PRICE = {
      free: { y: 'No card needed', m: 'No card needed' },
      team: { y: '€59.99 a year', m: '€5.99 a month' },
      club: { y: '€9.48 a player a year', m: '€0.99 a player a month' },
      biz: { y: '€23.88 a seat a year', m: '€2.49 a seat a month' },
    };
    let cur = -1, settleT = 0, buyT = 0;
    root._obBill = 'y';
    const swap = (el, text) => { if (el.textContent === text) return; el.textContent = text; el.classList.remove('ob-swap'); void el.offsetWidth; el.classList.add('ob-swap'); };
    root._obSum = () => {
      const k = cards[cur]?.dataset.k || 'team';
      sum.dataset.state = k === 'free' ? 'free' : 'paid';
      swap(sName, k === 'free' ? 'Free' : `${NAMES[k]}, ${root._obBill === 'y' ? 'yearly' : 'monthly'}`);
      swap(sPrice, PRICE[k][root._obBill]);
      $('.ob-buy-d', buy).textContent = k === 'free' ? 'Continue with Free' : 'Start free trial';
      $('.ob-buy-s', buy).innerHTML = `<i data-lucide="check"></i>You're on ${NAMES[k]}`; icons();
    };
    const select = (n) => {
      if (n === cur) return;
      cur = n;
      cards.forEach((c, k) => { c.classList.toggle('ob-on', k === n); c.setAttribute('aria-selected', String(k === n)); });
      dots.forEach((d, k) => d.classList.toggle('on', k === n));
      const key = cards[n].dataset.k;
      $$('.ob-pf', root).forEach((u) => u.classList.toggle('ob-on', u.dataset.k === key));
      if (buy.dataset.state !== 'processing') { clearTimeout(buyT); buy.dataset.state = 'default'; }
      root._obSum();
    };
    const nearest = () => {
      const cr = car.getBoundingClientRect(), mid = cr.left + cr.width / 2;
      let best = 0, bd = Infinity;
      cards.forEach((c, k) => {
        const r = c.getBoundingClientRect(), w = r.width / parseFloat(getComputedStyle(c).getPropertyValue('--s') || 1);
        const d = Math.abs(r.left + r.width / 2 - mid) / (w || 1);
        c.style.setProperty('--s', (1 - 0.08 * Math.min(d, 1)).toFixed(4));
        if (d < bd) { bd = d; best = k; }
      });
      return best;
    };
    let raf = 0;
    car.addEventListener('scroll', () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; nearest(); });
      clearTimeout(settleT); settleT = setTimeout(() => select(nearest()), 90);
    }, { passive: true });
    const centre = (k, smooth) => {
      const c = cards[k];
      car.scrollTo({ left: c.offsetLeft - (car.clientWidth - c.offsetWidth) / 2, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    };
    cards.forEach((c, k) => c.addEventListener('click', () => centre(k, true)));
    car.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); centre(Math.max(0, Math.min(cards.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))), true); }
    });
    buy.addEventListener('click', () => {
      if (buy.dataset.state !== 'default') return;
      buy.dataset.state = 'processing'; buy.setAttribute('aria-disabled', 'true');
      buyT = setTimeout(() => {
        buy.dataset.state = 'success'; buy.removeAttribute('aria-disabled');
        buyT = setTimeout(() => (buy.dataset.state = 'default'), 2400);
      }, 1600);
    });
    const init = () => { centre(1, false); nearest(); select(1); };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(init));
    addEventListener('resize', () => requestAnimationFrame(() => { centre(cur < 0 ? 1 : cur, false); nearest(); }));
  });

  /* ---------- Setup steps row ---------- */
  $$('[data-ob-steps]').forEach((ol) => {
    const steps = $$('[data-ob-step]', ol);
    const LBL = { 'ob-s-done': 'Answered', 'ob-s-cur': 'Current question', 'ob-s-next': 'Up next' };
    ol.addEventListener('click', (e) => {
      const h = e.target.closest('.ob-step-h'); if (!h) return;
      const n = steps.indexOf(h.closest('[data-ob-step]'));
      steps.forEach((st, k) => {
        const c = k < n ? 'ob-s-done' : k === n ? 'ob-s-cur' : 'ob-s-next';
        st.classList.remove('ob-s-done', 'ob-s-cur', 'ob-s-next'); st.classList.add(c);
        const sn = $('.ob-sn', st); sn.innerHTML = c === 'ob-s-done' ? '<i data-lucide="check"></i>' : String(k + 1);
        $('.ob-sst', st).textContent = k === steps.length - 1 && c === 'ob-s-cur' ? 'Done' : LBL[c];
        $('.ob-step-h', st).setAttribute('aria-current', c === 'ob-s-cur' ? 'step' : 'false');
      });
      icons();
    });
  });

  /* ---------- Pricing table: move the highlight ---------- */
  $$('[data-ob-ptab]').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      const c = e.target.closest('.ob-pt-h[data-col]'); if (!c) return;
      const k = c.dataset.col;
      $$('[data-col]', tab).forEach((x) => x.classList.toggle('ob-on', x.dataset.col === k));
      $$('[data-ob-pick]', tab).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.obPick === k)));
    });
  });
})();
