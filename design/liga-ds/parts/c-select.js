(() => {
  const sec = document.getElementById('controls');
  if (!sec) return;

  // Steppers: step 1 inside data-min..data-max, the end button disables
  const sync = (st) => {
    const o = st.querySelector('output');
    const v = +o.textContent, min = +st.dataset.min, max = +st.dataset.max;
    st.querySelector('[data-cx-step="-1"]').disabled = v <= min;
    st.querySelector('[data-cx-step="1"]').disabled = v >= max;
  };
  sec.querySelectorAll('[data-cx-stepper]').forEach((st) => {
    sync(st);
    st.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cx-step]');
      if (!b || b.disabled) return;
      const o = st.querySelector('output');
      o.textContent = Math.max(+st.dataset.min, Math.min(+st.dataset.max, +o.textContent + +b.dataset.cxStep));
      sync(st);
    });
  });

  // Radio rows: one of many
  sec.querySelectorAll('[data-cx-radio]').forEach((g) => g.addEventListener('click', (e) => {
    const r = e.target.closest('[role=radio]');
    if (!r || r.disabled) return;
    g.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === r)));
  }));

  // Checkbox rows: picked count, page.js flips aria-checked
  const box = sec.querySelector('[data-cx-checks]');
  const out = sec.querySelector('[data-cx-picked]');
  const count = () => {
    const n = box.querySelectorAll('[aria-checked=true]').length;
    out.textContent = n === 0 ? 'Pick at least one' : `${n} picked`;
  };
  if (box && out) { box.addEventListener('click', () => requestAnimationFrame(count)); count(); }
})();
