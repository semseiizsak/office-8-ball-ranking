/* Icons section: searchable icon library, inspector, sizes, stroke, icons in context.
   page.js fills the first #icons element (this section) with its old pill list, so this script rebuilds the whole section. */
(() => {
  const sec = document.getElementById('icons');
  if (!sec || typeof lucide === 'undefined') return;

  const GROUPS = {
    Navigation: 'house list-ordered swords trophy layers user history chevron-right chevron-left chevron-down arrow-left arrow-right menu ellipsis x external-link',
    Actions: 'plus pencil share-2 search settings trash-2 flag check copy download filter sliders-horizontal refresh-cw undo-2 log-out qr-code camera link',
    League: 'crown coins flame target medal award shuffle calendar clock timer users user-plus chart-line trending-up trending-down star zap gift ticket',
    Sport: 'circle-dot dumbbell bike gamepad-2 dice-5 volleyball table-2 joystick',
    Social: 'message-circle heart thumbs-up bell bell-off at-sign send image smile megaphone',
    Feedback: 'info circle-alert circle-check triangle-alert wifi-off loader-circle sparkles lock eye eye-off',
  };
  const TAGS = {
    'list-ordered': 'ladder leaderboard rank', swords: 'play match challenge duel', trophy: 'cup win season', layers: 'cards collection',
    history: 'log recent matches', crown: 'leader first king', coins: 'money wallet shop', flame: 'streak hot', target: 'goal aim',
    'chart-line': 'rating elo stats graph', 'trending-up': 'rating up gain', 'trending-down': 'rating down drop', users: 'team members league',
    'user-plus': 'invite friend', 'share-2': 'share invite send', 'circle-dot': 'foosball ball sport', 'table-2': 'table tennis ping pong',
    'dice-5': 'board game', ellipsis: 'more menu', pencil: 'edit', 'trash-2': 'delete remove', 'qr-code': 'join scan kiosk',
    bell: 'notification alert', 'message-circle': 'chat comment', 'loader-circle': 'loading spinner', 'circle-alert': 'error',
    'triangle-alert': 'warning', 'circle-check': 'success done', 'wifi-off': 'offline', timer: 'live clock countdown', zap: 'boost power',
  };
  const ICONS = Object.entries(GROUPS).flatMap(([g, s]) => s.split(' ').map((n) => ({ n, g, tags: TAGS[n] || '' })));
  const USE = {
    Navigation: 'Tab bar, app bar, rows that open a screen.', Actions: 'Buttons and menus, always with a text label or aria-label.',
    League: 'Stats, rating, cup, season and shop.', Sport: 'Sport label only. The rules are the same for every sport.',
    Social: 'Chat, reactions, notifications and invites.', Feedback: 'Toasts, alerts, empty and offline states.',
  };

  const ic = (n, cls = '') => `<i data-lucide="${n}"${cls ? ` class="${cls}"` : ''}></i>`;
  const sizes = [16, 20, 24, 32];

  sec.innerHTML = `
  <h2 class="t-title">Icons</h2>
  <p class="lead">Lucide line icons at stroke 2.25, so they hold their weight next to Sora and bold Inter. Four sizes, one rule: an icon supports a label, it never replaces one the user has to understand. Emoji only for badges, reactions and fun awards.</p>

  <div class="fi-lib">
    <div class="fi-main">
      <div class="fi-bar">
        <label class="search fi-search">${ic('search')}<input class="input" type="search" placeholder="Search ${ICONS.length} icons" aria-label="Search icons" data-fi-q></label>
        <div class="seg fi-size" role="group" aria-label="Icon size">${sizes.map((s) => `<button type="button" aria-pressed="${s === 24}" data-fi-s="${s}">${s}</button>`).join('')}</div>
      </div>
      <div class="fi-chips" role="group" aria-label="Filter by group">
        <button type="button" class="chip" aria-pressed="true" data-fi-g="All">All<span class="num">${ICONS.length}</span></button>
        ${Object.keys(GROUPS).map((g) => `<button type="button" class="chip" aria-pressed="false" data-fi-g="${g}">${g}<span class="num">${GROUPS[g].split(' ').length}</span></button>`).join('')}
      </div>
      <div class="fi-grid" data-fi-grid style="--fi-s:24px"></div>
      <div class="empty fi-empty" hidden>
        <div class="ill">${ic('search')}</div>
        <b>No icon matches that</b>
        <p>Try a shorter word like rating, chat or cup.</p>
        <button type="button" class="btn secondary sm" data-fi-clear>Clear search</button>
      </div>
    </div>

    <aside class="fi-insp" aria-live="polite">
      <div class="fi-stage"><span class="fi-px"></span><span data-fi-big></span></div>
      <div class="fi-insp-h"><b data-fi-name></b><span data-fi-group></span></div>
      <p class="fi-insp-use" data-fi-use></p>
      <div class="fi-insp-sizes" data-fi-sizes></div>
      <code class="fi-snip" data-fi-snip></code>
      <button type="button" class="btn secondary block" data-fi-copy>${ic('copy')}<span>Copy name</span></button>
    </aside>
  </div>

  <div class="fi-two">
    <div class="fi-card">
      <div class="fi-card-h"><b>Sizes</b><span>Four steps on a 4 px grid</span></div>
      <div class="fi-ladder">
        ${[[16, 'Pills, meta rows, inline with 13 px text'], [20, 'Default. Rows, buttons, inputs'], [24, 'App bar, tab bar, toasts'], [32, 'Empty states and feature tiles']].map(([s, u]) => `
        <div class="fi-step">
          <div class="fi-pxbox" style="--b:${s}px">${ic('trophy')}</div>
          <b class="num">${s} px</b><span>${u}</span>
        </div>`).join('')}
      </div>
    </div>
    <div class="fi-card">
      <div class="fi-card-h"><b>Stroke 2.25</b><span>Matched to the heavy type</span></div>
      <div class="fi-strokes">
        ${[[1.5, 'Too thin', 'Fades next to bold text'], [2.25, 'Liga', 'Same weight as Inter 600'], [3, 'Too heavy', 'Closes small shapes']].map(([w, t, u]) => `
        <div class="fi-stroke${w === 2.25 ? ' on' : ''}" style="--w:${w}">
          <div class="fi-stroke-demo">${ic('crown')}<span class="fi-word">Ladder</span></div>
          <b>${t}<span class="num">${w}</span></b><span>${u}</span>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="fi-ctx">
    <div class="fi-card">
      <div class="fi-card-h"><b>Tab bar</b><span>24 px, label always visible</span></div>
      <div class="fi-phone">
        ${[[1, 'Mira 👑', '1 302'], [2, 'Dave', '1 248'], [3, 'You', '1 237']].map(([r, n, e]) => `<div class="fi-sk"><b>${r}</b><span>${n}</span><em class="num">${e.replace(' ', '\u00a0')}</em></div>`).join('')}
        <div class="tabbar fi-tabbar" data-tabbar role="tablist">
          ${[['list-ordered', 'Ladder', 1], ['swords', 'Play'], ['trophy', 'Cup'], ['layers', 'Cards'], ['user', 'Me']].map(([n, l, on]) => `<button type="button" role="tab" aria-selected="${!!on}">${ic(n)}${l}</button>`).join('')}
        </div>
      </div>
      <p class="fi-note">Active tab is a solid pill. The icon stays outline so its shape is still readable.</p>
    </div>

    <div class="fi-card">
      <div class="fi-card-h"><b>Buttons</b><span>Icon leads, label follows</span></div>
      <div class="fi-btns">
        <button type="button" class="btn primary">${ic('plus')}Log match</button>
        <button type="button" class="btn brand">${ic('swords')}Challenge</button>
        <button type="button" class="btn secondary">${ic('share-2')}Invite</button>
        <button type="button" class="btn secondary sm">${ic('filter')}Filter</button>
        <div class="fi-ibtns">
          <button type="button" class="ibtn" aria-label="Notifications">${ic('bell')}<span class="dot-count">3</span></button>
          <button type="button" class="ibtn" aria-label="Search">${ic('search')}</button>
          <button type="button" class="ibtn plain" aria-label="More">${ic('ellipsis')}</button>
          <button type="button" class="ibtn primary" aria-label="Add match">${ic('plus')}</button>
        </div>
      </div>
      <p class="fi-note">Icon only buttons are 44 px round and always carry an aria-label.</p>
    </div>

    <div class="fi-card">
      <div class="fi-card-h"><b>List rows</b><span>20 px in a 36 px lead tile</span></div>
      <div class="list fi-list">
        ${[['bell', 'Notifications', 'Challenges, results, chat'], ['circle-dot', 'Sport', 'Foosball'], ['coins', 'Coins', '1 240 in your wallet'], ['users', 'Members', 'Acme Studio, 14 players']].map(([n, b, s]) => `
        <button type="button" class="row"><span class="lead">${ic(n)}</span><span class="main"><b>${b}</b><span>${s}</span></span><span class="end">${ic('chevron-right')}</span></button>`).join('')}
      </div>
    </div>

    <div class="fi-card">
      <div class="fi-card-h"><b>Filled means on</b><span>Only for a toggled state</span></div>
      <div class="fi-fills">
        ${[['heart', 'Like', 'live'], ['star', 'Favourite', 'crown'], ['bell', 'Alerts', 'text'], ['bookmark', 'Save', 'text']].map(([n, l, c], i) => `
        <button type="button" class="fi-fill" data-c="${c}" aria-pressed="${i % 2 === 0}" aria-label="${l}">${ic(n)}<span>${l}</span></button>`).join('')}
      </div>
      <div class="fi-pair">
        <span>${ic('heart')}<em>Off, outline</em></span>
        <span class="fi-on" data-c="live">${ic('heart')}<em>On, filled</em></span>
      </div>
      <p class="fi-note">Tap to toggle. Fill is solid in the icon colour, never a pale tint.</p>
    </div>

    <div class="fi-card">
      <div class="fi-card-h"><b>Inline</b><span>16 px with small text</span></div>
      <div class="fi-inline">
        <div class="fi-pills">
          <span class="pill win">${ic('flame')}W4 streak</span>
          <span class="pill crown">${ic('crown')}Leader</span>
          <span class="pill live">${ic('timer')}Live</span>
          <span class="pill neutral">${ic('trending-up')}+14</span>
        </div>
        <div class="fi-meta"><span>${ic('calendar')}Thu 22 Oct</span><span>${ic('clock')}12:30</span><span>${ic('target')}Best of 3</span></div>
        <label class="search">${ic('search')}<input class="input" type="search" placeholder="Search players" aria-label="Search players"></label>
      </div>
    </div>

    <div class="fi-card">
      <div class="fi-card-h"><b>Empty state</b><span>32 px in a 72 px circle</span></div>
      <div class="empty fi-ctx-empty">
        <div class="ill">${ic('swords')}</div>
        <b>No matches yet this week</b>
        <p>Challenge someone and your first result shows up here.</p>
      </div>
    </div>
  </div>

  <div class="dodont">
    <div class="do"><b>${ic('circle-check')}Do</b><ul>
      <li>Pair every icon with a label, or give icon buttons an aria-label.</li>
      <li>Use the icon colour of its text. Meaning colours only on meaning (win, live, crown).</li>
      <li>Keep one icon per meaning across the app: swords is always play.</li>
    </ul></div>
    <div class="dont"><b>${ic('circle-x')}Don't</b><ul>
      <li>Change the stroke per screen or mix in other icon sets.</li>
      <li>Use emoji for actions or navigation.</li>
      <li>Fill an icon for decoration. Filled means the state is on.</li>
    </ul></div>
  </div>

  <table class="spec">
    <thead><tr><th>Size</th><th>Where</th><th>Box</th><th>Stroke</th></tr></thead>
    <tbody>
      <tr><td>16 px</td><td>Pills, meta rows, small text</td><td>Inline, 6 px gap</td><td>2.25</td></tr>
      <tr><td>20 px</td><td>Rows, buttons, inputs (18 px in small buttons)</td><td>36 px lead tile, 44 px button</td><td>2.25</td></tr>
      <tr><td>24 px</td><td>App bar, tab bar (22 px), toasts</td><td>44 px hit area</td><td>2.25</td></tr>
      <tr><td>32 px</td><td>Empty states, feature tiles</td><td>72 px circle</td><td>2.25</td></tr>
    </tbody>
  </table>`;

  const $ = (s) => sec.querySelector(s);
  const $$ = (s) => [...sec.querySelectorAll(s)];
  const grid = $('[data-fi-grid]');
  const q = $('[data-fi-q]');
  const empty = $('.fi-empty');
  let group = 'All';
  let current = ICONS.find((i) => i.n === 'trophy');

  const tile = (i) => `<button type="button" class="fi-tile${i === current ? ' on' : ''}" data-fi-n="${i.n}" aria-pressed="${i === current}" title="${i.n}">${ic(i.n)}<span>${i.n}</span></button>`;
  function render() {
    const term = q.value.trim().toLowerCase();
    const hit = ICONS.filter((i) => (group === 'All' || i.g === group) && (!term || `${i.n} ${i.g} ${i.tags}`.toLowerCase().includes(term)));
    const byG = {};
    hit.forEach((i) => (byG[i.g] = byG[i.g] || []).push(i));
    grid.innerHTML = Object.entries(byG).map(([g, list]) =>
      `<div class="fi-gh"><b>${g}</b><span class="num">${list.length}</span><span class="fi-gh-u">${USE[g]}</span></div>${list.map(tile).join('')}`).join('');
    grid.hidden = !hit.length;
    empty.hidden = !!hit.length;
    lucide.createIcons();
  }
  function inspect(i) {
    current = i;
    $('[data-fi-big]').innerHTML = ic(i.n);
    $('[data-fi-name]').textContent = i.n;
    $('[data-fi-group]').textContent = i.g;
    $('[data-fi-use]').textContent = USE[i.g];
    $('[data-fi-sizes]').innerHTML = sizes.map((s) => `<span style="--b:${s}px">${ic(i.n)}<em class="num">${s}</em></span>`).join('');
    $('[data-fi-snip]').textContent = `<i data-lucide="${i.n}"></i>`;
    $$('.fi-tile').forEach((t) => { const on = t.dataset.fiN === i.n; t.classList.toggle('on', on); t.setAttribute('aria-pressed', String(on)); });
    lucide.createIcons();
  }

  q.addEventListener('input', render);
  sec.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !sec.contains(b)) return;
    if (b.dataset.fiG) { group = b.dataset.fiG; $$('[data-fi-g]').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); render(); }
    else if (b.dataset.fiS) { $$('[data-fi-s]').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); grid.style.setProperty('--fi-s', b.dataset.fiS + 'px'); }
    else if (b.dataset.fiN) inspect(ICONS.find((i) => i.n === b.dataset.fiN));
    else if (b.matches('[data-fi-clear]')) { q.value = ''; group = 'All'; $$('[data-fi-g]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.fiG === 'All'))); render(); q.focus(); }
    else if (b.matches('.fi-fill')) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    else if (b.matches('[data-fi-copy]')) {
      const label = b.querySelector('span');
      try { navigator.clipboard?.writeText(current.n); } catch (err) {}
      label.textContent = 'Copied';
      clearTimeout(b._t); b._t = setTimeout(() => (label.textContent = 'Copy name'), 1400);
    }
  });

  render();
  inspect(current);
})();
