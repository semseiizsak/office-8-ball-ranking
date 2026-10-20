/* Settings and modules: live count, filter, dependency fix, stepper. */
(() => {
  const sec = document.getElementById('modules');
  if (!sec) return;
  const grid = sec.querySelector('.xd-grid');
  const mods = () => [...grid.querySelectorAll('.xd-mod')];
  const isOn = (m) => m.querySelector('.toggle')?.getAttribute('aria-checked') === 'true';
  let filter = 'all';

  const sync = () => {
    const coins = grid.querySelector('[data-mod=coins]');
    const cards = grid.querySelector('[data-mod=cards]');
    const coinsOn = isOn(coins);
    if (cards) {
      const t = cards.querySelector('.toggle');
      const fix = cards.querySelector('.xd-need');
      const meta = cards.querySelector('.xd-meta span');
      if (coinsOn) {
        t.disabled = false; t.setAttribute('data-flip', '');
        if (fix) fix.hidden = true;
        cards.dataset.state = isOn(cards) ? 'on' : 'off';
        meta.textContent = isOn(cards) ? '3 packs opened today' : 'Ready, Coins is on';
      } else {
        t.disabled = true; t.removeAttribute('data-flip'); t.setAttribute('aria-checked', 'false');
        if (fix) fix.hidden = false;
        cards.dataset.state = 'needs';
        meta.textContent = 'Needs Coins';
      }
    }
    mods().forEach((m) => {
      if (m.dataset.state === 'on' || m.dataset.state === 'off') m.dataset.state = isOn(m) ? 'on' : 'off';
    });
    coins.querySelector('.xd-meta span').textContent = coinsOn ? '1 240 in circulation'.replace(' ', ' ') : 'Cards need this';
    const n = mods().filter(isOn).length;
    const out = sec.querySelector('[data-xd-count]');
    if (out) out.textContent = n;
    mods().forEach((m) => {
      const s = m.dataset.state;
      const show = filter === 'all' || (filter === 'on' && isOn(m)) || (filter === 'off' && !isOn(m) && s !== 'pro') || (filter === 'pro' && s === 'pro');
      m.hidden = !show;
    });
  };

  sec.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('.xd-grid .xd-need')) {
      grid.querySelector('[data-mod=coins] .toggle').setAttribute('aria-checked', 'true');
      setTimeout(() => { grid.querySelector('[data-mod=cards] .toggle').setAttribute('aria-checked', 'true'); sync(); }, 0);
    }
    if (b.dataset.f) filter = b.dataset.f;
    if (b.dataset.xdStep) {
      const o = b.parentElement.querySelector('output');
      o.textContent = Math.max(4, Math.min(8, +o.textContent + +b.dataset.xdStep));
    }
    setTimeout(sync, 0); // after page.js flips the switch
  });
  sync();
})();
