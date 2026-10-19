/* Liga: kiosk screen mockups. Ticking timers, cup countdown, rotating banner, cheers, cup sign up toggles. */
(function () {
  const root = document.querySelector('#sk-home') ? document : null;
  if (!root) return;
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const pad = (n) => String(n).padStart(2, '0');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // live match timers count up, the cup countdown counts down
  const timers = $$('[data-sk-timer]').map((el) => ({ el, s: +el.dataset.skTimer }));
  const counts = $$('[data-sk-count]').map((el) => ({ el, s: +el.dataset.skCount }));
  setInterval(() => {
    timers.forEach((t) => { t.s += 1; t.el.textContent = pad(Math.floor(t.s / 60)) + ':' + pad(t.s % 60); });
    counts.forEach((c) => {
      c.s = Math.max(0, c.s - 1);
      c.el.textContent = Math.floor(c.s / 3600) + ':' + pad(Math.floor((c.s % 3600) / 60)) + ':' + pad(c.s % 60);
    });
  }, 1000);

  // rotating banner on the chat screensaver
  const slides = [
    ['Monday cup at 12:30', 'Sign up on this tablet before noon'],
    ['Mira is on 5 wins in a row', 'Beat her and take the 40 coin bounty'],
    ['Season 4 ends Sunday, 8 Nov', 'Three weeks left, Dave is 3 points behind'],
    ['New here?', 'Scan the QR code on the home screen to join'],
  ];
  $$('[data-sk-rotate]').forEach((b) => {
    const t = b.querySelector('.sk-banner-t');
    const ti = b.querySelector('[data-sk-rot-title]');
    const su = b.querySelector('[data-sk-rot-sub]');
    const dots = $$('.sk-dots i', b);
    let i = 0;
    setInterval(() => {
      i = (i + 1) % slides.length;
      const swap = () => {
        ti.textContent = slides[i][0];
        su.textContent = slides[i][1];
        dots.forEach((d, k) => d.classList.toggle('on', k === i));
        t.classList.remove('sk-out');
      };
      if (reduce) { swap(); return; }
      t.classList.add('sk-out');
      setTimeout(swap, 280);
    }, 5000);
  });

  // cheers: a tap adds one and marks the button
  $$('.sk-cheer').forEach((btn) => btn.addEventListener('click', () => {
    const b = btn.querySelector('b');
    const on = btn.getAttribute('aria-pressed') === 'true';
    b.textContent = String(+b.textContent + (on ? -1 : 1));
    btn.setAttribute('aria-pressed', String(!on));
  }));

  // cup sign up wall: tap toggles, the counter and bar follow
  $$('[data-sk-cup]').forEach((grid) => {
    const wall = grid.closest('.sk-cup');
    const n = wall.querySelector('.sk-cup-n b');
    const bar = wall.querySelector('.sk-cup-bar i');
    const total = grid.children.length;
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('.sk-cupt');
      if (!t) return;
      const on = t.getAttribute('aria-pressed') !== 'true';
      t.setAttribute('aria-pressed', String(on));
      t.querySelector('.sk-cupi').innerHTML = `<i data-lucide="${on ? 'check' : 'plus'}"></i>`;
      if (window.lucide) window.lucide.createIcons();
      const c = $$('.sk-cupt[aria-pressed=true]', grid).length;
      n.textContent = c;
      bar.style.width = (c / total * 100) + '%';
    });
  });
})();
