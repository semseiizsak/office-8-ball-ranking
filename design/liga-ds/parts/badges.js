/* Liga DS part: Badges and achievements, season emblems (prefix bd-). Replays the badge earned scene. */
(() => {
  const card = document.querySelector('[data-bd-reveal]');
  const btn = document.querySelector('[data-bd-replay]');
  if (!card || !btn) return;
  const play = () => {
    card.classList.remove('play');
    void card.offsetWidth; // restart the CSS animations
    card.classList.add('play');
  };
  btn.addEventListener('click', play);
  // play the first time the scene scrolls into view
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { play(); io.disconnect(); }
    }, { threshold: .5 });
    io.observe(card);
  }
})();
