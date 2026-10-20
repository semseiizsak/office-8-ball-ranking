(() => {
  const sec = document.getElementById('seg');
  if (!sec) return;
  const NB = ' ';

  // Segmented controls: equal segments, indicator slides by index
  const segs = [...sec.querySelectorAll('[data-cs-seg]')];
  const btns = (s) => [...s.querySelectorAll(':scope > button')];
  const setSeg = (s, i) => s.style.setProperty('--i', i);
  segs.forEach((s) => {
    const b = btns(s);
    s.style.setProperty('--n', b.length);
    s.classList.add('cs-noanim');
    setSeg(s, Math.max(0, b.findIndex((x) => x.getAttribute('aria-pressed') === 'true')));
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.remove('cs-noanim')));
    s.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.parentElement !== s || t.disabled) return;
      setSeg(s, b.indexOf(t));
      if (s.hasAttribute('data-cs-board')) board(b.indexOf(t));
    });
  });

  // Tabs: indicator follows the selected tab's position and width
  const tabsets = [...sec.querySelectorAll('[data-cs-tabs]')];
  const place = (tl) => {
    const on = tl.querySelector('[aria-selected=true]');
    const ind = tl.querySelector('.cs-tind');
    if (!on || !ind) return;
    ind.style.setProperty('--l', on.offsetLeft + 'px');
    ind.style.setProperty('--w', on.offsetWidth + 'px');
  };
  const placeAll = () => tabsets.forEach(place);
  tabsets.forEach((tl) => {
    tl.classList.add('cs-noanim');
    place(tl);
    requestAnimationFrame(() => requestAnimationFrame(() => tl.classList.remove('cs-noanim')));
    tl.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.parentElement !== tl) return;
      requestAnimationFrame(() => {
        place(tl);
        const sc = tl.closest('.cs-scroll');
        if (sc) {
          const target = t.offsetLeft - (sc.clientWidth - t.offsetWidth) / 2;
          sc.scrollTo({ left: Math.max(0, target), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
        const pid = tl.dataset.csPanels;
        if (pid) {
          const idx = [...tl.querySelectorAll(':scope > button')].indexOf(t);
          [...document.getElementById(pid).children].forEach((p, i) => { p.hidden = i !== idx; });
        }
      });
    });
  });
  if (document.fonts) document.fonts.ready.then(placeAll);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => placeAll());
    tabsets.forEach((tl) => ro.observe(tl));
  } else addEventListener('resize', placeAll);

  // Leaderboard swaps values with the segmented control
  const lb = sec.querySelector('[data-cs-lb]');
  const P = [
    ['Mira', 'orange', 'M', [1302, 980, 2140]],
    ['Dave', 'blue', 'D', [1248, 720, 1980]],
    ['You', 'green', 'Y', [1237, 1110, 1604], 'me'],
    ['Sam', 'yellow', 'S', [1190, 460, 1720]],
    ['Kim', 'purple', 'K', [1102, 860, 1311]],
  ];
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  const av = (c, l) => `<span class="av sm${c === 'yellow' ? ' yellow' : ''}" style="--c:var(--pc-${c})"><span class="ring"></span><span class="face">${l}</span></span>`;
  const render = (k) => {
    const rows = [...P].sort((a, b) => b[3][k] - a[3][k]);
    lb.innerHTML = rows.map(([n, c, l, v, cls], i) =>
      `<li class="${cls || ''}"><span class="r num">${i + 1}</span>${av(c, l)}<b>${n}${i === 0 ? ' 👑' : ''}</b><span class="v num">${k === 1 ? '<span class="coin"></span>' : ''}${fmt(v[k])}</span></li>`).join('');
  };
  let swapT;
  function board(k) {
    if (!lb) return;
    lb.classList.add('cs-swap');
    clearTimeout(swapT);
    swapT = setTimeout(() => { render(k); requestAnimationFrame(() => lb.classList.remove('cs-swap')); }, 180);
  }
  if (lb) render(0);
})();
