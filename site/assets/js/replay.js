// Replay button for animated sloppers (DESIGN §12.1: the only script on the site).
// The art is an <img>, so restarting means reloading the image with a fresh URL.
(() => {
  const btn = document.querySelector('[data-replay]');
  const img = document.getElementById('art');
  if (!btn || !img) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // the still is shown instead
  const base = img.getAttribute('src').split('#')[0].split('?')[0];
  let n = 0;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    n += 1;
    img.src = `${base}#replay-${n}`;
  });
})();
