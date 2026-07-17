/* Shared behaviour: theme toggle (persisted), nav shadow, scroll reveals.
   An inline snippet in each page's <head> sets the initial theme to avoid a flash. */
(function () {
  var root = document.documentElement;

  function systemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function currentTheme() {
    return root.getAttribute('data-theme') || systemTheme();
  }

  var SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>';
  var MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4 8.2 8.2 0 1 0 20 14.5Z"/>';

  function paintIcons() {
    var t = currentTheme();
    document.querySelectorAll('.toggle svg').forEach(function (svg) {
      svg.innerHTML = t === 'dark' ? SUN : MOON;
    });
  }
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    paintIcons();
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } }));
  }

  paintIcons();
  document.querySelectorAll('.toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
  });

  /* nav / backbar shadow on scroll */
  var bars = document.querySelectorAll('header.nav, .backbar');
  function onScroll() {
    var s = window.scrollY > 8;
    bars.forEach(function (b) { b.classList.toggle('scrolled', s); });
  }
  if (bars.length) { onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); }

  /* reveal on scroll */
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* expose for other page scripts */
  window.Site = { currentTheme: currentTheme };
})();
