/* Blog index: full post list with category filters, built from posts.json */
(function () {
  var mount = document.getElementById('blog-list');
  var filterBar = document.getElementById('blog-filters');
  if (!mount) return;

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmt(iso) {
    var p = iso.split('-');
    return MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Most posts are Markdown rendered by post.html. A post may instead set
     "url" in posts.json and ship as its own page, for pieces that need custom
     layout or interactivity. Both kinds sit in the same list. */
  function postUrl(p) {
    return p.url ? p.url : 'post.html?p=' + encodeURIComponent(p.slug);
  }

  function render(posts, cat) {
    var list = cat === 'All' ? posts : posts.filter(function (p) { return p.category === cat; });
    mount.innerHTML = list.map(function (p) {
      var url = postUrl(p);
      return '<li>' +
        '<a class="wl" href="' + url + '">' +
          '<span class="wdate">' + fmt(p.date) + '</span>' +
          '<span class="wtitle">' + esc(p.title) + '</span>' +
          '<span class="cat">' + esc(p.category) + '</span>' +
        '</a>' +
        '<p class="wsum">' + esc(p.summary) + '</p>' +
      '</li>';
    }).join('');
  }

  fetch('posts/posts.json')
    .then(function (r) { return r.json(); })
    .then(function (posts) {
      var cats = ['All'].concat(posts.map(function (p) { return p.category; })
        .filter(function (c, i, a) { return a.indexOf(c) === i; }));

      if (filterBar) {
        filterBar.innerHTML = cats.map(function (c, i) {
          return '<button class="' + (i === 0 ? 'on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
        }).join('');
        filterBar.addEventListener('click', function (e) {
          var b = e.target.closest('button');
          if (!b) return;
          filterBar.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          render(posts, b.getAttribute('data-cat'));
        });
      }
      render(posts, 'All');
    })
    .catch(function () {
      mount.innerHTML = '<li><p class="wsum">Unable to load posts.</p></li>';
    });
})();
