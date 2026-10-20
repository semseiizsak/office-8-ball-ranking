(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // collection filter
  document.querySelectorAll('[data-ac-col]').forEach((col) => {
    const btns = col.querySelectorAll('[data-ac-f]');
    const tiles = col.querySelectorAll('.ac-tile');
    btns.forEach((b) => b.addEventListener('click', () => {
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const f = b.dataset.acF;
      tiles.forEach((t) => { t.hidden = f !== 'all' && t.dataset.acS !== f; });
    }));
    tiles.forEach((t) => t.addEventListener('click', () => {
      tiles.forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
    }));
  });

  // unlock moment
  document.querySelectorAll('[data-ac-stage]').forEach((stage) => {
    const counters = stage.querySelectorAll('[data-ac-count]');
    let raf = 0;
    const count = () => {
      cancelAnimationFrame(raf);
      counters.forEach((el) => { el.textContent = '+' + el.dataset.acCount; });
      if (reduce.matches) return;
      const start = performance.now() + 620, dur = 600;
      const tick = (now) => {
        const t = Math.min(1, Math.max(0, (now - start) / dur));
        counters.forEach((el) => { el.textContent = '+' + Math.round(ease(t) * Number(el.dataset.acCount)); });
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const play = () => {
      stage.classList.remove('go');
      void stage.offsetWidth;
      stage.classList.add('go');
      count();
    };
    stage.parentElement.querySelector('[data-ac-replay]')?.addEventListener('click', play);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) { io.disconnect(); play(); }
      }, { threshold: 0.4 });
      io.observe(stage);
    }
  });
})();
