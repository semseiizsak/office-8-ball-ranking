(() => {
  const sec = document.getElementById('feedback');
  if (!sec) return;
  const $$ = (s, r = sec) => [...r.querySelectorAll(s)];
  const nb = ' ';
  const av = (c, l, no) => `<span class="av${c === 'yellow' ? ' yellow' : ''}" style="--c:var(--pc-${c});--av:38px"><span class="ring"></span><span class="face">${l}</span><span class="no">${no}</span></span>`;

  // In-app screen behind the placement toasts
  const ladder = [
    [1, 'Mira 👑', 'orange', 5, '1' + nb + '302', 'Streak W4', 'first'], [2, 'Dave', 'blue', 7, '1' + nb + '248', 'Streak W1', ''],
    [3, 'You', 'green', 6, '1' + nb + '237', 'Streak L1', 'me'], [4, 'Sam', 'yellow', 1, '1' + nb + '190', 'Streak W2', ''],
    [5, 'Kim 🤡', 'purple', 4, '1' + nb + '102', 'Streak L3', ''], [6, 'Joe', 'red', 3, '1' + nb + '001', 'Dormant, 16 days', ''],
    [7, 'Ann', 'maroon', 2, '984', 'New this season', ''],
  ];
  const screen = `<div class="statusbar"><span>9:41</span><span class="sb-r"><i data-lucide="signal"></i><i data-lucide="wifi"></i><i data-lucide="battery-full"></i></span></div>
    <header class="appbar"><button class="league-sw" aria-label="Switch league, Office foosball"><span class="lg"><i data-lucide="circle-dot"></i></span><span class="xf-lsw"><b>Office foosball</b><span>Acme Studio<i data-lucide="chevron-down"></i></span></span></button><button class="ibtn" aria-label="Inbox"><i data-lucide="inbox"></i></button></header>
    <div class="xf-app"><div class="xf-app-h"><h3 class="t-title">Ranks</h3><span class="pill neutral">Week 43</span></div>
    <div class="list">${ladder.map(([r, n, c, no, elo, sub, cls]) => `<div class="row ${cls}"><span class="rank">${r}</span>${av(c, n[0], no)}<span class="main"><b>${n}</b><span>${sub}</span></span><span class="elo">${elo}</span></div>`).join('')}</div></div>
    <nav class="tabbar xf-tb" aria-label="Main"><button aria-selected="true"><i data-lucide="list-ordered"></i>Ranks</button><button aria-selected="false"><i data-lucide="swords"></i>Arena</button><button aria-selected="false"><i data-lucide="trophy"></i>Cup</button><button aria-selected="false"><i data-lucide="layers"></i>Cards</button><button aria-selected="false"><i data-lucide="history"></i>History</button></nav>
    <div class="homebar"></div>`;
  $$('[data-xf-app]').forEach((el) => el.insertAdjacentHTML('afterbegin', screen));

  // Home screen icons behind the push banner (generic names only)
  const apps = [['calendar', 'Calendar'], ['image', 'Photos'], ['camera', 'Camera'], ['map', 'Maps'], ['cloud-sun', 'Weather'], ['clock', 'Clock'], ['notebook-pen', 'Notes'], ['circle-dot', 'Liga', 'liga', 3],
    ['mail', 'Mail'], ['wallet', 'Wallet'], ['heart', 'Health'], ['settings', 'Settings'], ['calculator', 'Calculator'], ['podcast', 'Podcasts'], ['book-open', 'Books'], ['folder', 'Files'],
    ['tv', 'TV'], ['shopping-bag', 'Store'], ['mic', 'Voice'], ['users', 'Contacts']];
  $$('[data-xf-apps]').forEach((el) => { el.innerHTML = apps.map(([i, n, c = '', b]) => `<span class="xf-app-i ${c}"><span><i data-lucide="${i}"></i></span>${n}${b ? `<span class="xf-badge">${b}</span>` : ''}</span>`).join(''); });

  // Inbox: open marks read, filters, mark all read
  const list = sec.querySelector('.xf-list');
  const count = sec.querySelector('#xfUnread');
  const sync = () => {
    const n = $$('.nrow:not(.read)', list).length;
    count.textContent = `${n} new`;
    count.classList.toggle('zero', n === 0);
  };
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.nrow');
    if (!row) return;
    $$('.nrow', list).forEach((r) => r.removeAttribute('aria-current'));
    row.setAttribute('aria-current', 'true');
    row.classList.add('read');
    sync();
  });
  sec.querySelector('#xfAllRead').addEventListener('click', () => { $$('.nrow', list).forEach((r) => r.classList.add('read')); sync(); });
  sec.querySelector('.xf-fl').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const f = b.dataset.f;
    let shown = 0;
    $$('.xf-sw', list).forEach((s) => { const on = f === 'all' || s.dataset.k === f; s.hidden = !on; if (on) shown++; });
    $$('.xf-g', list).forEach((g) => {
      let n = g.nextElementSibling, any = false;
      while (n && !n.classList.contains('xf-g')) { if (n.classList.contains('xf-sw') && !n.hidden) any = true; n = n.nextElementSibling; }
      g.hidden = !any;
    });
    list.querySelector('.xf-none').hidden = shown > 0;
  });
  sync();
  if (window.lucide) lucide.createIcons();
})();
