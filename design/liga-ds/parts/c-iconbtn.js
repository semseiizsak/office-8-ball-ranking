(() => {
  const sec = document.getElementById('iconbuttons');
  if (!sec) return;

  // toggles
  sec.querySelectorAll('.ci-tog').forEach((b) => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    const st = b.parentElement.querySelector('span');
    if (st) st.textContent = st.textContent.replace(/, (on|off)$/, on ? ', on' : ', off');
  }));

  // tab bar selection, the log button is not a tab
  const tb = sec.querySelector('.ci-tabbar');
  if (tb) tb.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.classList.contains('ci-tlog')) return;
    tb.querySelectorAll('button:not(.ci-tlog)').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
  });

  // FAB folds while scrolling down, opens while scrolling up
  const feed = sec.querySelector('.ci-feed');
  const fab = sec.querySelector('.ci-fab');
  if (feed && fab) {
    let last = 0;
    feed.addEventListener('scroll', () => {
      const y = feed.scrollTop;
      if (y > last + 4 && y > 24) fab.classList.add('is-mini');
      else if (y < last - 4 || y <= 24) fab.classList.remove('is-mini');
      last = y;
    }, { passive: true });
  }

  // FAB menu
  const menu = sec.querySelector('.ci-menu');
  if (menu) {
    const mfab = menu.querySelector('.ci-mfab');
    const set = (open) => {
      menu.classList.toggle('is-open', open);
      mfab.setAttribute('aria-expanded', String(open));
      mfab.setAttribute('aria-label', open ? 'Close menu' : 'Open log menu');
      menu.querySelectorAll('.ci-items .ibtn').forEach((b) => (b.tabIndex = open ? 0 : -1));
    };
    mfab.addEventListener('click', () => set(!menu.classList.contains('is-open')));
    menu.querySelector('.ci-scrim').addEventListener('click', () => set(false));
    menu.querySelectorAll('.ci-items .ibtn').forEach((b) => b.addEventListener('click', () => set(false)));
    set(true);
  }
})();
