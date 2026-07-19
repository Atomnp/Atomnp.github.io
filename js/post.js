/* Post page: load a Markdown post by ?p=slug and render it
   with marked + highlight.js, plus KaTeX only when the post uses math. */
(function () {
  var params = new URLSearchParams(location.search);
  var slug = params.get('p') || '';
  var body = document.getElementById('post-body');
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtLong(iso) {
    var p = iso.split('-');
    return MONTHS[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0];
  }
  function fail(msg) {
    body.innerHTML = '<p style="color:var(--muted)">' + msg + ' <a href="blog.html">Back to all writing →</a></p>';
  }
  function isRelative(u) {
    return u && !/^([a-z]+:)?\/\//i.test(u) && u[0] !== '/' && u.indexOf('data:') !== 0 && u[0] !== '#';
  }

  /* highlight.js theme follows the site theme */
  function syncHljsTheme() {
    var link = document.getElementById('hljs-theme');
    if (!link) return;
    var dark = (window.Site ? window.Site.currentTheme() : 'light') === 'dark';
    link.href = 'vendor/highlight/' + (dark ? 'github-dark.min.css' : 'github.min.css');
  }
  window.addEventListener('themechange', syncHljsTheme);

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function renderMath() {
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/katex/katex.min.css';
    document.head.appendChild(css);
    return loadScript('vendor/katex/katex.min.js')
      .then(function () { return loadScript('vendor/katex/auto-render.min.js'); })
      .then(function () {
        window.renderMathInElement(body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      });
  }

  if (!slug) { fail('No post specified.'); return; }

  fetch('posts/posts.json')
    .then(function (r) { return r.json(); })
    .then(function (posts) {
      var meta = posts.find(function (p) { return p.slug === slug; });
      if (!meta) { fail('Post not found.'); throw 'stop'; }

      // fill header + document metadata
      document.title = meta.title + ' · Aayush Neupane';
      var idx = posts.indexOf(meta);
      document.getElementById('post-cat').textContent = meta.category;
      document.getElementById('post-title').textContent = meta.title;

      return fetch('posts/' + encodeURIComponent(slug) + '/index.md')
        .then(function (r) {
          if (!r.ok) throw 'md';
          return r.text();
        })
        .then(function (md) {
          var base = 'posts/' + slug + '/';

          marked.setOptions({ gfm: true, breaks: false });
          body.innerHTML = marked.parse(md);

          // resolve relative images/links against the post folder
          body.querySelectorAll('img').forEach(function (img) {
            var s = img.getAttribute('src');
            if (isRelative(s)) img.setAttribute('src', base + s);
            img.setAttribute('loading', 'lazy');
          });
          body.querySelectorAll('a').forEach(function (a) {
            var h = a.getAttribute('href');
            if (isRelative(h)) a.setAttribute('href', base + h);
            if (/^https?:\/\//i.test(a.getAttribute('href') || '')) {
              a.setAttribute('target', '_blank');
              a.setAttribute('rel', 'noopener');
            }
          });

          // syntax highlighting
          if (window.hljs) {
            body.querySelectorAll('pre code').forEach(function (el) { window.hljs.highlightElement(el); });
          }
          syncHljsTheme();

          // reading time
          var words = body.textContent.trim().split(/\s+/).length;
          var mins = Math.max(1, Math.round(words / 200));
          document.getElementById('post-meta').textContent =
            fmtLong(meta.date) + ' · ' + mins + ' min read';

          // math only when needed
          if (meta.math || /\$\$?[^$]/.test(md)) { return renderMath(); }
        });
    })
    .catch(function (e) {
      if (e !== 'stop') fail('Could not load this post.');
    });
})();
