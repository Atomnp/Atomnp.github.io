/* Shared behaviour: nav shadow, scroll reveals. The site is light-only. */
(function () {
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
  window.Site = { currentTheme: function () { return 'light'; } };
})();
