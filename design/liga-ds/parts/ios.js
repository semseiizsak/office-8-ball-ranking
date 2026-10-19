(() => {
  const di = document.querySelector('[data-io-di]');
  const dim = document.querySelector('[data-io-dim]');
  const ctl = document.querySelector('[data-io-ctl]');
  if (!di || !dim) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const set = (s) => {
    di.classList.toggle('c', s === 'c');
    di.classList.toggle('x', s === 'x');
    di.classList.toggle('m', s === 'm');
    dim.classList.toggle('on', s === 'm');
    dim.classList.toggle('m', s === 'm');
    if (ctl) ctl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === s)));
  };
  let auto = !reduce, timer = 0, i = 0, visible = false;
  const seq = ['c', 'x', 'c', 'm'];
  const tick = () => { if (!auto || !visible) return; i = (i + 1) % seq.length; set(seq[i]); timer = setTimeout(tick, 2400); };
  const stop = () => { auto = false; clearTimeout(timer); };
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    clearTimeout(timer);
    if (visible && auto) timer = setTimeout(tick, 2400);
  }).observe(di);
  di.style.cursor = 'pointer';
  di.setAttribute('tabindex', '0');
  di.setAttribute('role', 'button');
  const toggle = () => { stop(); set(di.classList.contains('x') ? 'c' : 'x'); };
  di.addEventListener('click', toggle);
  di.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  if (ctl) ctl.addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (!b) return; stop(); set(b.dataset.s); });
})();
