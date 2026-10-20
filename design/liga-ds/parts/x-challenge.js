(() => {
  const sec = document.getElementById('challenge');
  if (!sec) return;
  const comp = sec.querySelector('[data-xc-composer]');
  if (comp) {
    const q = (s) => comp.querySelector(s);
    comp.querySelector('.xc-pick').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const { w, l, c, n, pc } = b.dataset;
      q('.xc-pn').textContent = 'Against ' + n;
      q('.xc-pc').textContent = c;
      q('.xc-pw').textContent = '+' + w;
      q('.xc-pl').textContent = '−' + l;
      q('.xc-ps1').style.flexGrow = c;
      const s2 = q('.xc-ps2');
      s2.style.flexGrow = 100 - c;
      s2.style.background = `var(--pc-${pc})`;
    });
    comp.querySelector('.xc-quick').addEventListener('click', (e) => {
      const b = e.target.closest('.xc-qc');
      if (!b) return;
      q('.xc-ta').value = b.textContent;
      comp.querySelectorAll('.xc-quick .xc-qc').forEach((r) => r.setAttribute('aria-pressed', String(r === b)));
    });
  }
  // countdown on the received card
  const t = sec.querySelector('.xc-tick');
  if (t) {
    let left = +t.dataset.left;
    const fmt = (s) => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')} left`;
    };
    t.textContent = fmt(left);
    setInterval(() => { left = Math.max(0, left - 1); t.textContent = fmt(left); }, 1000);
  }
})();
