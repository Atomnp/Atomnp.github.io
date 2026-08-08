/* Page chrome shared by both molecular-dynamics pages: theme toggle, sticky
   backbar state, scroll-progress bar, and reveal-on-scroll. Mirrors the other
   posts on the site so these pages behave identically. Plain (non-module)
   script; the interactive widgets live in the separate module scripts. */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  var SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6"/>';
  var MOON = '<path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.9 6.9 0 0 0 11.1 11.1Z"/>';

  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function paintToggle() {
    var btn = $('themeBtn');
    if (!btn) return;
    var svg = btn.querySelector('svg');
    if (svg) svg.innerHTML = currentTheme() === 'dark' ? SUN : MOON;
  }
  paintToggle();
  var tb = $('themeBtn');
  if (tb) {
    tb.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      paintToggle();
      // Nudge the canvases: draw.js theme() re-reads the CSS variables, and the
      // widgets refit/redraw on resize, so they pick up the new palette.
      setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30);
    });
  }

  var bar = $('backbar'), prog = $('progress');
  function onScroll() {
    if (bar) bar.classList.toggle('scrolled', window.scrollY > 6);
    if (prog) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (h > 0 ? (window.scrollY / h * 100) : 0) + '%';
    }
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if ('IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } });
    }, { rootMargin: '-40px' });
    document.querySelectorAll('.reveal').forEach(function (el) { ro.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }
})();
