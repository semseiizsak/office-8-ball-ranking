(() => {
  const sec = document.getElementById('live');
  if (!sec) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bc = sec.querySelector('[data-xl-live]');

  // momentum bars for the end screen: a = Dave point, b = Mira point (10 : 7)
  const mom = sec.querySelector('[data-xl-mom]');
  if (mom) mom.innerHTML = 'abbaabbaabaaaabba'.split('').map((p) =>
    `<i class="${p}" style="background:var(--pc-${p === 'a' ? 'blue' : 'orange'})"></i>`).join('');

  if (!bc) return;
  const $ = (s) => bc.querySelector(s);
  const pips = (k, n) => { const el = $(`[data-xl-pips="${k}"]`); el.innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<i style="${i < n ? `background:var(--pc-${k === 'a' ? 'blue' : 'orange'})` : ''}"></i>`).join(''); };
  let a = 7, b = 5;
  pips('a', a); pips('b', b);

  // match clock and viewers
  let secs = 18 * 60 + 42;
  const clock = $('[data-xl-clock]'), viewers = $('[data-xl-viewers]'), msgs = $('[data-xl-msgs]');
  setInterval(() => {
    secs++;
    clock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (secs % 4 === 0) viewers.textContent = String(Math.max(18, Math.min(31, +viewers.textContent + (Math.random() < .55 ? 1 : -1))));
  }, 1000);

  // score changes
  const setScore = (el, v) => {
    if (el.textContent === String(v)) return;
    if (reduce) { el.textContent = v; return; }
    el.classList.add('xl-bump');
    setTimeout(() => { el.textContent = v; el.classList.remove('xl-bump'); }, 280);
  };
  setInterval(() => {
    if (a >= 9 || b >= 9) { a = 7; b = 5; }
    else if (Math.random() < .55) a++; else b++;
    setScore($('[data-xl-a]'), a); setScore($('[data-xl-b]'), b);
    pips('a', a); pips('b', b);
    burst(Math.random() < .5 ? '🔥' : '👏', 4);
  }, 9000);

  // chat
  const lines = $('[data-xl-lines]');
  const POOL = [
    ['Sam', 'yellow', 'no way that went in'], ['Kim', 'purple', 'defence is asleep'], ['Ann', 'maroon', 'Mira comeback loading'],
    ['Joe', 'red', 'Dave on fire today 🔥'], ['You', 'green', 'best match of the week'], ['Mira', 'orange', 'just warming up'],
    ['Dave', 'blue', 'two more, easy'], ['Sam', 'yellow', 'who is on next?'], ['Ann', 'maroon', 'that was a clean shot'],
  ];
  let pi = 0;
  const say = (name, c, text) => {
    const p = document.createElement('p');
    p.className = 'xl-new';
    const n = document.createElement('b');
    n.style.color = `var(--pct-${c})`;
    n.textContent = name;
    p.append(n, document.createTextNode(text));
    lines.append(p);
    while (lines.children.length > 10) lines.firstElementChild.remove();
    msgs.textContent = String(+msgs.textContent + 1);
  };
  setInterval(() => { const [n, c, t] = POOL[pi++ % POOL.length]; say(n, c, t); }, 3200);
  const input = $('.xl-say .input');
  const send = () => { const v = input.value.trim(); if (!v) return; say('You', 'green', v); input.value = ''; };
  $('.xl-send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

  // flying reactions
  const fly = $('.xl-fly');
  const spawn = (emo) => {
    if (reduce || !fly) return;
    const s = document.createElement('span');
    s.textContent = emo;
    s.style.left = `${10 + Math.random() * 60}px`;
    s.style.setProperty('--dx1', `${Math.round(Math.random() * 20 - 10)}px`);
    s.style.setProperty('--dx2', `${Math.round(Math.random() * 60 - 30)}px`);
    fly.append(s);
    s.addEventListener('animationend', () => s.remove());
  };
  const burst = (emo, n) => { for (let i = 0; i < n; i++) setTimeout(() => spawn(emo), i * 140); };
  $('.xl-reacts').addEventListener('click', (e) => { const b = e.target.closest('.xl-rb'); if (b) burst(b.dataset.e, 3); });
  const AMB = ['🔥', '😂', '👏', '😱', '🔥', '👏'];
  setInterval(() => { if (!document.hidden) spawn(AMB[Math.floor(Math.random() * AMB.length)]); }, 900);
})();
