/* Post page: load a Markdown post by ?p=slug and render it
   with marked + highlight.js, plus KaTeX only when the post uses math. */
(function () {
  var params = new URLSearchParams(location.search);
  var slug = params.get('p') || '';
  var body = document.getElementById('post-body');
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtLong(iso) {
    var p = iso.split('-');
    return MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
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
            { left: '$', right: '$', display: false },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      });
  }

  function escapeHtml(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* Drop YAML front matter, and a leading "# Title" that repeats the page title. */
  function stripHeader(md, title) {
    md = md.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    var m = md.match(/^\s*#\s+(.+?)\s*\r?\n/);
    if (m && m[1].toLowerCase() === title.toLowerCase()) md = md.slice(m[0].length);
    return md;
  }
  /* Hide \( \) and \[ \] math from marked (it would eat the backslashes),
     skipping fenced and inline code. Restored after parsing. */
  function protectMath(md, stash) {
    return md.split(/(```[\s\S]*?```|`[^`\n]*`)/).map(function (part, i) {
      if (i % 2) return part;
      return part.replace(/\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g, function (m) {
        stash.push(m);
        return 'MATHSTASH' + (stash.length - 1) + 'X';
      });
    }).join('');
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

          var stash = [];
          md = protectMath(stripHeader(md, meta.title), stash);

          marked.setOptions({ gfm: true, breaks: false });
          body.innerHTML = marked.parse(md).replace(/MATHSTASH(\d+)X/g, function (_, i) {
            return escapeHtml(stash[+i]);
          });

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

          document.getElementById('post-meta').textContent = fmtLong(meta.date);

          // math only when needed
          if (meta.math || stash.length || /\$\$?[^$]/.test(md)) { return renderMath(); }
        });
    })
    .catch(function (e) {
      if (e !== 'stop') fail('Could not load this post.');
    });
})();
