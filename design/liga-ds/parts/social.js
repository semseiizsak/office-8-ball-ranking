/* Liga DS part: Community and media (prefix so-). Behaviour for the demos only. */
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Composer: send is enabled only when there is text
  const sync = (box) => {
    const input = box.querySelector('.so-cin input');
    const send = box.querySelector('.so-send');
    if (input && send) send.disabled = input.value.trim() === '';
  };
  $$('.so-composer').forEach(sync);
  document.addEventListener('input', (e) => {
    const box = e.target.closest('.so-composer');
    if (box) sync(box);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const box = e.target.closest && e.target.closest('.so-composer');
    if (box) { e.preventDefault(); box.querySelector('.so-send')?.click(); }
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;

    // Send: in the league chat, append your own bubble
    if (t.matches('.so-send') && !t.disabled) {
      const box = t.closest('.so-composer');
      const input = box.querySelector('.so-cin input');
      const text = input.value.trim();
      const msgs = t.closest('.so-chat')?.querySelector('[data-so-msgs]');
      if (msgs && text) {
        const typing = msgs.querySelector('.so-typing');
        const g = document.createElement('div');
        g.className = 'so-grp so-mine';
        g.innerHTML = `<div class="so-grp-c"><div class="so-bub">${esc(text)}</div></div>`;
        const m = document.createElement('div');
        m.className = 'so-meta so-r';
        m.textContent = 'Now';
        msgs.insertBefore(g, typing);
        msgs.insertBefore(m, typing);
      }
      input.value = '';
      sync(box);
    }

    // Like
    if (t.matches('.so-like')) {
      const on = t.getAttribute('aria-pressed') !== 'true';
      t.setAttribute('aria-pressed', String(on));
      const n = t.querySelector('.num');
      if (n) {
        n.textContent = Math.max(0, +n.textContent + (on ? 1 : -1));
        t.setAttribute('aria-label', 'Like, ' + n.textContent);
      }
    }

    // Reaction picker: one choice, tap again to remove
    if (t.parentElement?.matches('.so-rpick') && !t.matches('.so-rp-more')) {
      const was = t.getAttribute('aria-pressed') === 'true';
      $$('button', t.parentElement).forEach((b) => b.matches('.so-rp-more') || b.setAttribute('aria-pressed', 'false'));
      t.setAttribute('aria-pressed', String(!was));
    }

    // Who reacted tabs
    if (t.parentElement?.matches('[data-so-tabs]')) {
      $$('button', t.parentElement).forEach((b) => b.setAttribute('aria-selected', String(b === t)));
      const f = t.dataset.f;
      $$('.so-who-l .row', t.closest('.so-who')).forEach((r) => { r.hidden = f !== 'all' && r.dataset.e !== f; });
    }

    // Mention suggestion: complete the @word in the composer
    if (t.matches('[data-so-suggest] .so-sg')) {
      const list = t.closest('[data-so-suggest]');
      $$('.so-sg', list).forEach((b) => b.setAttribute('aria-selected', String(b === t)));
      const input = list.parentElement.querySelector('.so-cin input');
      if (input) {
        input.value = input.value.replace(/@\w*$/, '@' + t.dataset.name + ' ');
        sync(input.closest('.so-composer'));
        input.focus();
      }
    }

    // Copy invite link
    if (t.matches('.so-copy[data-copy]')) {
      try { navigator.clipboard?.writeText(t.dataset.copy); } catch (err) {}
      clearTimeout(t._so);
      t.setAttribute('data-copied', '');
      t.innerHTML = '<i data-lucide="check"></i><span>Copied</span>';
      icons();
      t._so = setTimeout(() => {
        t.removeAttribute('data-copied');
        t.innerHTML = '<i data-lucide="copy"></i><span>Copy</span>';
        icons();
      }, 2000);
    }
  });
})();
