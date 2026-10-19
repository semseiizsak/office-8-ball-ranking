/* Showcase page behaviour only. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;

  const PLAYERS = [
    ['yellow', 'Yellow', 1], ['blue', 'Blue', 2], ['red', 'Red', 3], ['purple', 'Purple', 4],
    ['orange', 'Orange', 5], ['green', 'Green', 6], ['maroon', 'Maroon', 7], ['ink', 'Ink', 8],
  ];
  const av = (c, letter, no, cls = '') =>
    `<span class="av ${cls} ${c === 'yellow' ? 'yellow' : ''}" style="--c:var(--pc-${c})"><span class="ring"></span><span class="face">${letter}</span><span class="no">${no}</span></span>`;

  // Player colours
  $('#pcols').innerHTML = PLAYERS.map(([k, n, no]) =>
    `<div class="pc">${av(k, n[0], no)}<span class="nm" style="color:var(--pct-${k})">${n}</span><code data-var="--pc-${k}"></code><code data-var="--pct-${k}"></code></div>`).join('');

  // Avatars
  $('#avatars').innerHTML = [
    av('blue', 'D', 7, 'xl'), av('orange', 'M', 5, 'lg'), av('green', 'A', 6), av('yellow', 'S', 1, 'sm'),
    `<span class="av-pair">${av('red', 'J', 3, 'lg')}${av('purple', 'K', 4, 'lg')}</span>`,
  ].join('');

  // Leaderboard
  const ladder = [
    [1, 'Mira', 'orange', 5, 1302, 'W4', '👑'], [2, 'Dave', 'blue', 7, 1248, 'W1', ''], [3, 'You', 'green', 6, 1237, 'L1', '', 'me'],
    [4, 'Sam', 'yellow', 1, 1190, 'W2', ''], [5, 'Kim', 'purple', 4, 1102, 'L3', '🤡'], [6, 'Joe', 'red', 3, 1001, '', '', 'dormant'],
  ];
  $('#ladder').innerHTML = ladder.map(([r, n, c, no, elo, st, em, cls = '']) =>
    `<li><button class="row ${r === 1 ? 'first' : ''} ${cls}"><span class="rank">${r}</span>${av(c, n[0], no)}<span class="main"><b>${n} ${em}</b><span>${cls === 'dormant' ? 'Dormant, 16 days' : st ? 'Streak ' + st : ''}</span></span><span class="elo">${elo}</span></button></li>`).join('');
  $('#recent').innerHTML = ladder.filter((p) => p[1] !== 'You').map(([, n, c, no, elo]) =>
    `<li><button class="row">${av(c, n[0], no)}<span class="main"><b>${n}</b><span class="num">${elo}</span></span><span class="end"><i data-lucide="chevron-right"></i></span></button></li>`).join('');

  // Spacing
  $('#spacing').innerHTML = [4, 8, 12, 16, 20, 24, 32, 40, 48].map((v) =>
    `<div class="sp"><span class="num">${v}</span><i style="width:${v * 4}px"></i></div>`).join('');

  // Icons
  const ICONS = {
    Navigation: ['list-ordered', 'swords', 'trophy', 'layers', 'history', 'chevron-right', 'chevron-down', 'arrow-left'],
    Actions: ['plus', 'pencil', 'share', 'search', 'settings', 'trash-2', 'flag', 'more-horizontal', 'x', 'check'],
    League: ['crown', 'coins', 'flame', 'target', 'users', 'user', 'calendar', 'clock', 'medal', 'shuffle'],
    Feedback: ['bell', 'message-circle', 'info', 'alert-circle', 'check-circle-2', 'wifi-off', 'sparkles', 'undo-2'],
  };
  $('#icons').innerHTML = Object.entries(ICONS).map(([g, list]) =>
    `<div class="ico-g"><span class="t-caption">${g}</span><div class="ico-row">${list.map((i) => `<span class="ico" title="${i}"><i data-lucide="${i}"></i><span>${i}</span></span>`).join('')}</div></div>`).join('');

  // Swatches
  const sw = $('[data-swatches]');
  sw.innerHTML = sw.dataset.swatches.split(',').map((p) => {
    const [v, n] = p.split(':');
    return `<div class="sw"><i style="background:var(${v})"></i><div><b>${n}</b><code>${v}</code><code data-var="${v}"></code></div></div>`;
  }).join('');
  const fillVars = () => $$('[data-var]').forEach((el) => {
    el.textContent = getComputedStyle(root).getPropertyValue(el.dataset.var).trim().toUpperCase();
  });

  // Theme
  const setTheme = (t) => {
    root.dataset.theme = t;
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    try { localStorage.setItem('liga-ds-theme', t); } catch (e) {}
    requestAnimationFrame(fillVars);
  };
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  let saved = 'dark';
  try { saved = localStorage.getItem('liga-ds-theme') || 'dark'; } catch (e) {}
  setTheme(saved);

  // TOC
  const nav = $('#tocnav');
  let html = '';
  $$('.page > .group, .page > .sec').forEach((el) => {
    if (el.classList.contains('group')) html += `<div class="g">${el.textContent}</div>`;
    else html += `<a href="#${el.id}">${el.dataset.title}</a>`;
  });
  nav.innerHTML = html;
  const links = $$('a', nav);
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-30% 0px -65% 0px' });
  $$('.sec').forEach((s) => io.observe(s));

  // Generic interactions
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-flip]')) t.setAttribute('aria-checked', String(t.getAttribute('aria-checked') !== 'true'));
    const single = t.parentElement?.closest('[data-single]');
    if (single && t.parentElement === single) $$(':scope > button', single).forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
    if (t.matches('[data-toggle-group] .chip')) t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true'));
    if (t.matches('[data-tabs] button, [data-tabbar] button')) $$('button', t.parentElement).forEach((b) => b.setAttribute('aria-selected', String(b === t)));
    if (t.matches('[data-radio] .radio')) $$('.radio', t.parentElement).forEach((b) => b.setAttribute('aria-checked', String(b === t)));
    if (t.matches('.react')) t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true'));
    if (t.dataset.step) { const o = $('output', t.parentElement); o.textContent = Math.max(8, Math.min(64, +o.textContent + +t.dataset.step * 8)); }
    if (t.dataset.open) openLayer(t.dataset.open);
    if (t.id === 'toastDemo') toast();
  });

  // Overlays
  let layer = null;
  const closeLayer = () => { layer?.forEach((n) => n.remove()); layer = null; };
  function openLayer(name) {
    closeLayer();
    const frag = $('#tpl-' + name).content.cloneNode(true);
    layer = [...frag.children];
    document.body.append(frag);
    lucide.createIcons();
    layer.forEach((n) => n.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeLayer(); }));
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayer(); });

  // Toast
  function toast() {
    const el = document.createElement('div');
    el.className = 'toast ok';
    el.innerHTML = '<i data-lucide="check-circle-2"></i><div class="tx"><b>Match saved</b>You gained 14 rating</div>';
    $('#toasts').append(el);
    lucide.createIcons();
    setTimeout(() => { el.style.transition = 'opacity 180ms cubic-bezier(.65,0,.35,1)'; el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 4000);
  }

  // Motion replay
  const mo = $('.motion');
  const play = () => { mo.classList.remove('go'); requestAnimationFrame(() => requestAnimationFrame(() => mo.classList.add('go'))); };
  mo.addEventListener('click', play);
  new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && play()), { threshold: .6 }).observe(mo);

  // Tokens JSON preview
  const names = ['--bg', '--surface', '--surface-2', '--surface-3', '--overlay', '--line', '--text', '--text-2', '--text-3', '--primary', '--on-primary', '--brand', '--win', '--loss', '--live', '--crown', '--error', '--warning', '--info'];
  const camel = (v) => v.replace(/^--/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const read = (theme) => {
    const prev = root.dataset.theme; root.dataset.theme = theme;
    const cs = getComputedStyle(root);
    const o = Object.fromEntries(names.map((n) => [camel(n), cs.getPropertyValue(n).trim().toUpperCase()]));
    root.dataset.theme = prev; return o;
  };
  const tokens = {
    color: { dark: read('dark'), light: read('light') },
    radius: { xs: 8, sm: 12, md: 16, lg: 24, pill: 999 },
    space: [4, 8, 12, 16, 20, 24, 32, 40, 48],
    font: { display: 'Sora_800ExtraBold', text: 'Inter' },
    motion: { easing: [0.65, 0, 0.35, 1], press: 120, fast: 180, base: 280, slow: 400, scene: 1200 },
  };
  $('#tokjson').textContent = JSON.stringify(tokens, null, 2);
  setTheme(saved);

  lucide.createIcons();

  // Phone frames are always 9:16. When a screen holds more than fits, scale its content down instead of stretching the frame.
  const fitFrames = () => $$('.phone .scr, .sy-scr:not(.sy-auto), .mo-phone').forEach((frame) => {
    let wrap = frame.querySelector(':scope > .fit');
    if (wrap) { wrap.style.zoom = ''; wrap.style.width = ''; wrap.style.minHeight = ''; }
    const cs = getComputedStyle(frame);
    const avail = frame.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const need = wrap ? wrap.scrollHeight : frame.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (need <= avail + 1) return;
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'fit';
      wrap.append(...frame.childNodes);
      frame.append(wrap);
    }
    const z = avail / wrap.scrollHeight;
    wrap.style.zoom = z;
    wrap.style.width = `${(frame.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / z}px`;
    wrap.style.minHeight = `${avail / z}px`;
  });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fitFrames);
  let fitT; addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitFrames, 150); });
})();
