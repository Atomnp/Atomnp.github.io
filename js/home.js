/* Homepage: render the latest posts into the Writing section from posts.json,
   with a button that expands the list to every post in place */
(function () {
  var mount = document.getElementById('writing-list');
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

  fetch('posts/posts.json')
    .then(function (r) { return r.json(); })
    .then(function (posts) {
      var LATEST = 3;
      var more = document.getElementById('writing-more');
      var expanded = false;

      function render() {
        var shown = expanded ? posts : posts.slice(0, LATEST);
        mount.innerHTML = shown.map(item).join('');
      }

      render();
      if (more && posts.length > LATEST) {
        var label = more.querySelector('span');
        more.hidden = false;
        label.textContent = 'Show all writing (' + posts.length + ')';
        more.addEventListener('click', function () {
          expanded = !expanded;
          more.setAttribute('aria-expanded', String(expanded));
          label.textContent = expanded ? 'Show fewer' : 'Show all writing (' + posts.length + ')';
          render();
          /* after collapsing, bring the section back into view if we scrolled past it */
          if (!expanded) {
            var sec = document.getElementById('writing');
            if (sec.getBoundingClientRect().top < 0) sec.scrollIntoView({ behavior: 'smooth' });
          }
        });
      }

      function item(p) {
        /* a post with "url" ships as its own page instead of Markdown */
        var url = p.url ? p.url : 'post.html?p=' + encodeURIComponent(p.slug);
        return '<li>' +
          '<a class="wl" href="' + url + '">' +
            '<span class="wdate">' + fmt(p.date) + '</span>' +
            '<span class="wtitle">' + esc(p.title) + '</span>' +
            '<span class="cat">' + esc(p.category) + '</span>' +
          '</a>' +
          '<p class="wsum">' + esc(p.summary) + '</p>' +
        '</li>';
      }
    })
    .catch(function () {
      mount.innerHTML = '<li><p class="wsum">Unable to load posts.</p></li>';
    });
})();
