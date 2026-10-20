(() => {
  const bar = document.querySelector('#pills [data-cp-bar]');
  if (!bar) return;
  const sec = bar.closest('.demo');
  const rmBox = bar.querySelector('[data-cp-removables]');
  const count = bar.querySelector('[data-cp-count]');
  const res = sec.querySelector('[data-cp-res]');
  const reset = sec.querySelector('[data-cp-reset]');
  const clear = bar.querySelector('[data-cp-clear]');
  const fmt = bar.querySelector('.cp-fmt');
  const original = rmBox.innerHTML;
  const FMT = { All: 64, '1v1': 31, '2v2': 17, Cup: 6, Live: 1 };

  const update = () => {
    const rms = rmBox.querySelectorAll('.cp-x:not(.cp-out)').length;
    const on = fmt.querySelector('[aria-pressed=true]');
    const label = on ? on.textContent.replace(/\d+/g, '').trim() : 'All';
    const n = rms + (label === 'All' ? 0 : 1);
    count.textContent = n;
    count.toggleAttribute('data-zero', n === 0);
    const base = FMT[label] ?? 64;
    res.textContent = Math.max(1, Math.round(base * Math.pow(0.655, rms)));
    clear.hidden = rms === 0;
    reset.hidden = rms !== 0;
  };
  const remove = (chip) => {
    chip.classList.add('cp-out');
    chip.setAttribute('aria-hidden', 'true');
    chip.tabIndex = -1;
    setTimeout(() => chip.remove(), 300);
    update();
  };
  bar.addEventListener('click', (e) => {
    const x = e.target.closest('.cp-x');
    if (x) return remove(x);
    if (e.target.closest('[data-cp-clear]')) return rmBox.querySelectorAll('.cp-x').forEach(remove);
    if (e.target.closest('.cp-fmt .chip')) requestAnimationFrame(update);
  });
  reset.addEventListener('click', () => {
    rmBox.innerHTML = original;
    if (window.lucide) lucide.createIcons();
    update();
  });
  update();
})();
