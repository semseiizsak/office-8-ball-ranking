// Paste into the console on http://localhost:4620 (or run with the javascript tool).
// Lists every phone or tablet screen with an empty vertical band larger than 12% of its height.
(() => {
  const frames = [...document.querySelectorAll('.device-screen,.tablet-screen,.sec .sy-scr:not(.sy-auto),.sec .mo-phone,.sec .phone .scr')];
  const out = [];
  frames.forEach((f) => {
    const fr = f.getBoundingClientRect(); if (!fr.height) return;
    const ivs = [];
    f.querySelectorAll('*').forEach((e) => {
      if (e.matches('.statusbar,.statusbar *,.homebar')) return;
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.opacity === '0') return;
      const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const vis = hasText || e.matches('svg,img,input,button,.av,.ccard,.bar,.skel') || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== getComputedStyle(f).backgroundColor) || cs.boxShadow !== 'none';
      if (!vis) return;
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.height > fr.height * 0.8) return;
      ivs.push([Math.max(r.top, fr.top), Math.min(r.bottom, fr.bottom)]);
    });
    ivs.sort((a, b) => a[0] - b[0]);
    let gap = 0, at = 0, cur = fr.top + fr.height * 0.07;
    for (const [a, b] of ivs) { if (a > cur && a - cur > gap) { gap = a - cur; at = cur; } cur = Math.max(cur, b); }
    const end = fr.bottom - fr.height * 0.05; if (end - cur > gap) { gap = end - cur; at = cur; }
    if (gap / fr.height > 0.12) out.push(`${f.closest('.sec').id} #${[...f.closest('.sec').querySelectorAll('.device-screen,.tablet-screen,.sy-scr,.mo-phone,.phone .scr')].indexOf(f) + 1}: ${Math.round(gap / fr.height * 100)}% empty starting at ${Math.round((at - fr.top) / fr.height * 100)}%`);
  });
  return out.join('\n') || 'no gaps';
})();
