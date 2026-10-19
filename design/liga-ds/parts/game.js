/* Liga DS part: Gamification (prefix gm-). Behaviour for the demos only. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };
  const nb = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const press = (btn) => $$(':scope > button', btn.parentElement).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));

  /* ---------- Countdown timers ---------- */
  const fmt = (s) => {
    if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
  };
  const timers = $$('[data-gm-timer]').map((el) => ({ el, s: +el.dataset.gmTimer }));
  timers.forEach((t) => { t.el.textContent = fmt(t.s); });
  setInterval(() => timers.forEach((t) => { t.s = Math.max(0, t.s - 1); t.el.textContent = fmt(t.s); }), 1000);

  /* ---------- Wallet ---------- */
  const countUp = (el, add) => {
    const from = +el.dataset.gmWallet, to = from + add;
    el.dataset.gmWallet = to;
    const t0 = performance.now(), dur = reduced() ? 1 : 600;
    const ease = (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = nb(Math.round(from + (to - from) * ease(p)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* ---------- XP gain and level up ---------- */
  const TITLES = { 12: 'Sharpshooter', 13: 'Playmaker', 14: 'Wall', 15: 'Sniper', 16: 'Wizard' };
  const xpBox = $('[data-gm-xp]');
  const xpCard = $('[data-gm-xpcard]');
  const xpStart = xpBox && { level: +xpBox.dataset.level, xp: +xpBox.dataset.xp, max: +xpBox.dataset.max };
  const xpRender = (st) => {
    $('.gm-lvl b', xpBox).textContent = st.level;
    $('.gm-lvl', xpBox).setAttribute('aria-label', 'Level ' + st.level);
    $('[data-gm-l]', xpBox).textContent = 'Level ' + st.level;
    $('[data-gm-s]', xpBox).textContent = `${TITLES[st.level] || 'Legend'}, ${nb(st.max - st.xp)} XP to level ${st.level + 1}`;
    $('[data-gm-v]', xpBox).textContent = nb(st.xp);
    $('[data-gm-m]', xpBox).textContent = nb(st.max);
    $('.gm-xpbar', xpBox).setAttribute('aria-valuenow', st.xp);
  };
  let xp = xpStart && { ...xpStart };
  let busy = false;
  const gain = (amt) => {
    if (busy) return;
    busy = true;
    const bar = $('.gm-xpbar i', xpBox), chunk = $('.gm-xpbar u', xpBox), plus = $('.gm-plus', xpBox);
    plus.classList.remove('go'); void plus.offsetWidth; plus.classList.add('go');
    const old = xp.xp / xp.max * 100;
    const next = xp.xp + amt;
    const end = Math.min(100, next / xp.max * 100);
    chunk.style.left = old + '%';
    chunk.style.width = (end - old) + '%';
    const fillMs = reduced() ? 1 : 400;
    setTimeout(() => { bar.style.width = end + '%'; }, reduced() ? 0 : 160);
    setTimeout(() => {
      chunk.style.width = '0';
      if (next >= xp.max) {
        xp = { level: xp.level + 1, xp: next - xp.max, max: xp.max + 200 };
        xpCard.classList.remove('gm-flash'); void xpCard.offsetWidth; xpCard.classList.add('gm-flash');
        const up = $('[data-gm-up]', xpCard);
        $('[data-gm-ut]', up).textContent = `Level ${xp.level} reached`;
        up.hidden = false;
        setTimeout(() => {
          bar.style.transition = 'none'; bar.style.width = '0';
          void bar.offsetWidth; bar.style.transition = '';
          xpRender(xp);
          bar.style.width = (xp.xp / xp.max * 100) + '%';
        }, reduced() ? 0 : 380);
        setTimeout(() => { busy = false; }, reduced() ? 0 : 1100);
      } else {
        xp.xp = next; xpRender(xp); busy = false;
      }
    }, (reduced() ? 0 : 160) + fillMs);
  };

  /* ---------- Streak ---------- */
  const SK = {
    active: { n: '13 days', sub: 'Played today, see you tomorrow', fl: '', today: ['on', 'flame'], risk: false },
    risk: { n: '12 days', sub: 'Play one match before midnight', fl: 'risk', today: ['risk', 'clock'], risk: true },
    broken: { n: '0 days', sub: 'Every streak starts with one match', fl: 'off', today: ['today', ''], risk: false },
  };
  const skSet = (box, state) => {
    const d = SK[state];
    box.dataset.state = state;
    $('[data-gm-n]', box).textContent = d.n;
    $('[data-gm-sub]', box).textContent = d.sub;
    $('[data-gm-fl]', box).className = 'gm-fl ' + d.fl;
    $('[data-gm-risk]', box).hidden = !d.risk;
    const week = state === 'broken' ? ['on', 'on', 'on', 'on', 'frz', 'miss'] : ['on', 'on', 'on', 'on', 'frz', 'on'];
    const ic = { on: 'flame', frz: 'snowflake', miss: 'x' };
    const dots = $$('.gm-dd', box);
    dots.forEach((dd, i) => {
      const [cls, icon] = i < 6 ? [week[i] === 'miss' ? '' : week[i], ic[week[i]]] : d.today;
      dd.className = 'gm-dd ' + cls;
      dd.innerHTML = icon ? `<i data-lucide="${icon}"></i>` : '';
    });
    icons();
  };

  /* ---------- Quests ---------- */
  const board = $('[data-gm-board]');
  const wallet = board && $('[data-gm-wallet]', board);
  const boardCount = () => {
    if (!board) return;
    const n = $$('.gm-claim', board).length;
    $('[data-gm-cl]', board).textContent = n ? `${n} reward${n > 1 ? 's' : ''} ready` : 'All rewards claimed';
    $('[data-gm-all]', board).disabled = !n;
  };
  const claim = (btn) => {
    const q = btn.closest('.gm-quest');
    const coins = +btn.dataset.gmClaim || 0;
    q.classList.remove('ready', 'err');
    q.classList.add('claimed');
    const err = $('.gm-qerr', q);
    if (err) err.outerHTML = '<span class="bar win gm-qbar"><i style="width:100%"></i></span>';
    btn.outerHTML = '<span class="gm-got"><i data-lucide="check-circle-2"></i>Claimed</span>';
    const w = q.closest('[data-gm-board]') && wallet;
    if (w && coins) countUp(w, coins);
    icons();
    boardCount();
  };
  boardCount();

  /* ---------- Chest ---------- */
  const chestSet = (card, state) => {
    const c = $('.gm-chest', card);
    card.classList.toggle('open', state === 'open');
    card.classList.toggle('done', state === 'done');
    c.classList.toggle('open', state !== 'closed');
    $('[data-gm-open]', card).hidden = state !== 'closed';
    $('[data-gm-collect]', card).hidden = state !== 'open';
    $('[data-gm-next]', card).hidden = state !== 'done';
    $('[data-gm-ct]', card).textContent = { closed: 'Daily chest ready', open: 'Nice haul', done: 'Chest claimed' }[state];
    $('[data-gm-cs]', card).textContent = { closed: 'You finished 3 quests today', open: '4 rewards inside', done: 'Rewards are in your wallet and collection' }[state];
  };

  /* ---------- Spin wheel ---------- */
  const PRIZES = [
    ['coin', '50 coins'], ['⚡', 'a 2x XP hour'], ['coin', '100 coins'], ['❄️', 'a streak freeze'],
    ['coin', '25 coins'], ['🃏', 'a rare pack'], ['coin', '250 coins'], ['💎', 'the 1 000 coin jackpot'],
  ];
  const WEIGHTS = [24, 14, 18, 10, 22, 6, 5, 1];
  let rot = 0, spinning = false;
  const pick = () => { let r = Math.random() * 100; for (let i = 0; i < 8; i++) { r -= WEIGHTS[i]; if (r < 0) return i; } return 0; };
  const spin = (stage) => {
    if (spinning) return;
    spinning = true;
    const disc = $('[data-gm-disc]', stage), hub = $('[data-gm-spin]', stage);
    hub.disabled = true; hub.innerHTML = '<i data-lucide="loader"></i>'; icons();
    const t = pick();
    const jitter = (Math.random() - .5) * 30; // stays inside the 45 degree segment
    const target = ((360 - (t * 45 + 22.5) + jitter) % 360 + 360) % 360;
    const cur = ((rot % 360) + 360) % 360;
    rot += 5 * 360 + ((target - cur + 360) % 360);
    disc.style.transform = `rotate(${rot}deg)`;
    const done = () => {
      const [ic, label] = PRIZES[t];
      $('[data-gm-prize]', stage).innerHTML = ic === 'coin' ? '<span class="coin"></span>' : ic;
      $('[data-gm-pt]', stage).textContent = 'You won ' + label;
      stage.classList.add('show');
      hub.innerHTML = '<i data-lucide="clock"></i>'; icons();
      $('[data-gm-sp]', stage).textContent = 'Spin used, come back tomorrow';
      spinning = false;
    };
    if (reduced()) setTimeout(done, 20);
    else disc.addEventListener('transitionend', done, { once: true });
  };

  /* ---------- Season pass ---------- */
  const PRO_STATE = (tier) => (tier <= 4 ? 'claimed' : tier <= 6 ? 'ready' : '');
  const passPro = (pass, on) => {
    $$('.gm-pc.pro', pass).forEach((el) => {
      const tier = +el.dataset.tier;
      const st = on ? PRO_STATE(tier) : 'lock';
      const tag = st === 'ready' ? 'button' : 'div';
      const inner = [...el.childNodes].filter((n) => !(n.classList && n.classList.contains('bdg')));
      const nu = document.createElement(tag);
      nu.className = `gm-pc pro ${st}`;
      nu.dataset.tier = tier;
      if (st === 'ready') nu.dataset.gmPc = '';
      nu.append(...inner);
      if (st === 'claimed') nu.insertAdjacentHTML('beforeend', '<span class="bdg"><i data-lucide="check"></i></span>');
      if (st === 'lock') nu.insertAdjacentHTML('beforeend', '<span class="bdg lk"><i data-lucide="lock"></i></span>');
      el.replaceWith(nu);
    });
    icons();
  };
  const passClaim = (el) => {
    const d = document.createElement('div');
    d.className = el.className.replace('ready', 'claimed');
    d.dataset.tier = el.dataset.tier;
    d.append(...el.childNodes);
    d.insertAdjacentHTML('beforeend', '<span class="bdg"><i data-lucide="check"></i></span>');
    el.replaceWith(d);
    icons();
  };

  /* ---------- Divisions ---------- */
  const avHtml = (n, c, no) => `<span class="av${c === 'yellow' ? ' yellow' : ''}" style="--c:var(--pc-${c});--av:36px" aria-hidden="true"><span class="ring"></span><span class="face">${n === 'You' ? 'Y' : n[0]}</span><span class="no">${no}</span></span>`;
  const DIV = {
    bronze: { name: 'Bronze', up: 'Silver', down: null, rows: [['Ted', 'blue', 7, 30, '4 wins, 2 losses'], ['Uma', 'orange', 5, 26, '3 wins, 2 losses'], ['Vic', 'green', 6, 18, '2 wins, 3 losses'], ['Wes', 'purple', 4, 12, '1 win, 4 losses']] },
    silver: { name: 'Silver', up: 'Gold', down: 'Bronze', rows: [['Kim', 'purple', 4, 49, '6 wins, 2 losses'], ['Ann', 'maroon', 2, 45, '5 wins, 2 losses'], ['Max', 'blue', 7, 40, '4 wins, 3 losses'], ['Zoe', 'yellow', 1, 36, '4 wins, 4 losses'], ['Ola', 'green', 6, 30, '3 wins, 4 losses'], ['Joe', 'red', 3, 22, 'Wall of shame, L5']] },
    gold: { name: 'Gold', up: 'Diamond', down: 'Silver', rows: [['Dave', 'blue', 7, 58, '7 wins, 2 losses'], ['Lea', 'purple', 4, 55, '6 wins, 1 loss'], ['You', 'green', 6, 52, '3 pts to promotion', 'me'], ['Sam', 'yellow', 1, 47, '5 wins, 3 losses'], ['Tom', 'red', 3, 41, '4 wins, 4 losses'], ['Eva', 'orange', 5, 33, '3 wins, 5 losses'], ['Ben', 'maroon', 2, 24, '2 wins, 6 losses']] },
    diamond: { name: 'Diamond', up: 'Legend', down: 'Gold', rows: [['Mira', 'orange', 5, 66, 'Crown holder, 9 wins'], ['Nina', 'blue', 7, 60, '7 wins, 1 loss'], ['Omar', 'green', 6, 51, '6 wins, 3 losses'], ['Rui', 'red', 3, 44, '5 wins, 4 losses'], ['Ivy', 'purple', 4, 38, '4 wins, 4 losses'], ['Leo', 'yellow', 1, 30, '3 wins, 5 losses']] },
    legend: { name: 'Legend', rows: [] },
  };
  const divRender = (box, key) => {
    const d = DIV[key], list = $('[data-gm-divlist]', box);
    if (!d.rows.length) {
      list.innerHTML = '<div class="empty"><span class="ill"><i data-lucide="crown"></i></span><b>Nobody here yet</b><p>Reach a 1 450 rating to open the Legend division. Mira is 148 away.</p></div>'.replace(/(\d) (\d{3})/g, '$1 $2');
      icons(); return;
    }
    const n = d.rows.length, upN = d.up ? 2 : 0, dnN = d.down ? 2 : 0;
    let h = '';
    d.rows.forEach(([name, c, no, pts, sub, me], i) => {
      if (i === 0 && upN) h += `<div class="gm-zone up"><i><i data-lucide="arrow-up"></i></i>Top 2 move up to ${d.up}</div>`;
      if (i === upN && upN) h += '<div class="gm-zone"><i style="background:var(--surface-3)"><i data-lucide="minus"></i></i>Safe zone</div>';
      if (i === n - dnN && dnN) h += `<div class="gm-zone dn"><i><i data-lucide="arrow-down"></i></i>Bottom 2 move down to ${d.down}</div>`;
      const cls = [i < upN ? 'up' : '', i >= n - dnN && dnN ? 'dn' : '', me || ''].join(' ');
      h += `<div class="row ${cls}"><span class="gm-rk">${i + 1}</span>${avHtml(name, c, no)}<span class="main"><b>${name}</b><span>${sub}</span></span><span class="gm-pts"><b>${pts}</b><span>pts</span></span></div>`;
    });
    list.innerHTML = h;
    icons();
  };
  $$('[data-gm-divs]').forEach((b) => divRender(b, 'gold'));

  /* ---------- Clicks ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button,[data-gm-sclose]');
    if (!t) return;
    if (t.dataset.gmGain) gain(+t.dataset.gmGain);
    if (t.matches('[data-gm-reset]')) { xp = { ...xpStart }; $('.gm-xpbar i', xpBox).style.width = (xp.xp / xp.max * 100) + '%'; xpRender(xp); $('[data-gm-up]', xpCard).hidden = true; }
    if (t.dataset.gmSk) { press(t); skSet(t.closest('[data-gm-streak]'), t.dataset.gmSk); }
    if (t.matches('[data-gm-freeze]')) {
      const box = t.closest('[data-gm-streak]');
      const fz = $('[data-gm-fz]', box); fz.textContent = Math.max(0, +fz.textContent - 1);
      $('[data-gm-risk]', box).hidden = true;
      $('[data-gm-fl]', box).className = 'gm-fl';
      $('[data-gm-sub]', box).textContent = 'Freeze used, your streak is safe today';
      const last = $$('.gm-dd', box).pop(); last.className = 'gm-dd frz'; last.innerHTML = '<i data-lucide="snowflake"></i>'; icons();
    }
    if (t.matches('.gm-claim')) claim(t);
    if (t.dataset.gmTab) {
      press(t);
      $$('[data-gm-list]', board).forEach((l) => { l.hidden = l.dataset.gmList !== t.dataset.gmTab; });
      $$('[data-gm-tt]', board).forEach((l) => { l.hidden = l.dataset.gmTt !== t.dataset.gmTab; });
    }
    if (t.matches('[data-gm-all]')) $$('.gm-claim', board).forEach(claim);
    if (t.matches('[data-gm-open]')) chestSet(t.closest('[data-gm-chest]'), 'open');
    if (t.matches('[data-gm-collect]')) chestSet(t.closest('[data-gm-chest]'), 'done');
    if (t.matches('[data-gm-creset]')) chestSet(t.closest('[data-gm-chest]'), 'closed');
    if (t.matches('[data-gm-spin]')) spin(t.closest('[data-gm-stage]'));
    if (t.matches('[data-gm-sclose]')) t.closest('[data-gm-stage]').classList.remove('show');
    if (t.matches('[data-gm-again]')) {
      const st = t.closest('[data-gm-stage]');
      st.classList.remove('show');
      const hub = $('[data-gm-spin]', st); hub.disabled = false; hub.textContent = 'Spin';
      $('[data-gm-sp]', st).textContent = 'Extra spin, 50 coins';
    }
    if (t.dataset.gmPro) { press(t); passPro(t.closest('[data-gm-pass]'), t.dataset.gmPro === '1'); }
    if (t.matches('[data-gm-pc]')) passClaim(t);
    if (t.dataset.gmDiv) {
      $$('.chip', t.parentElement).forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
      divRender(t.closest('[data-gm-divs]'), t.dataset.gmDiv);
    }
  });
})();
