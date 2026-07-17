/* Homepage: render the latest posts into the Writing section from posts.json */
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
      var latest = posts.slice(0, 5);
      mount.innerHTML = latest.map(function (p) {
        var url = 'post.html?p=' + encodeURIComponent(p.slug);
        return '<li>' +
          '<a class="wl" href="' + url + '">' +
            '<span class="wdate">' + fmt(p.date) + '</span>' +
            '<span class="wtitle">' + esc(p.title) + '</span>' +
            '<span class="cat">' + esc(p.category) + '</span>' +
          '</a>' +
          '<p class="wsum">' + esc(p.summary) + '</p>' +
        '</li>';
      }).join('');
    })
    .catch(function () {
      mount.innerHTML = '<li><p class="wsum">Unable to load posts.</p></li>';
    });
})();
