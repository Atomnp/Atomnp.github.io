/* rope.js — every visualization on the rotary position embeddings write-up.
 *
 * No dependencies. Colour comes from CSS custom properties, so light and dark
 * both work and a theme flip just re-reads the palette and redraws. Same widget
 * framework as the Part 1 (positional-encoding) piece. All widgets are
 * slider-driven, nothing animates on its own.
 */
(function () {
  'use strict';

  /* ================================================================== *
   * 0. palette
   * ================================================================== */
  var P = {};
  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    function g(n) { return cs.getPropertyValue(n).trim(); }
    P = {
      ink: g('--ink'), ink2: g('--ink-2'), soft: g('--ink-soft'),
      line: g('--line'), line2: g('--line-2'),
      accent: g('--accent'), acc2: g('--accent-ink'),
      good: g('--good'), warn: g('--warn'), hot: g('--hot'), bad: g('--bad'), cool: g('--cool'),
      surface: g('--surface'), paper: g('--paper'), raise: g('--raise'), tag: g('--tag')
    };
    P.mono = '"SF Mono","JetBrains Mono","Fira Code",ui-monospace,Menlo,Consolas,monospace';
    P.sans = '"Inter","Helvetica Neue","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
  }

  /* ================================================================== *
   * 1. helpers
   * ================================================================== */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hexToRgb(h) {
    h = (h || '').trim(); if (h.charAt(0) === '#') h = h.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); if (isNaN(n)) return [128, 128, 128];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function alpha(col, a) { var c = hexToRgb(col); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mixHex(c1, c2, t) {
    var a = hexToRgb(c1), b = hexToRgb(c2);
    return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';
  }
  var TAU = Math.PI * 2;

  /* an arrow from (cx,cy) at screen-angle ang (y measured upward) */
  function arrow(ctx, cx, cy, ang, len, col, w) {
    var ex = cx + Math.cos(ang) * len, ey = cy - Math.sin(ang) * len;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    var h = Math.max(6, w * 3);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(ang - 0.4) * h, ey + Math.sin(ang - 0.4) * h);
    ctx.lineTo(ex - Math.cos(ang + 0.4) * h, ey + Math.sin(ang + 0.4) * h);
    ctx.closePath(); ctx.fill();
    return { x: ex, y: ey };
  }
  function ring(ctx, cx, cy, r) {
    if (!(r > 0)) return;
    ctx.strokeStyle = P.line2; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  }
  function shortDelta(a, b) { var d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

  /* ================================================================== *
   * 2. canvas plumbing
   * ================================================================== */
  var widgets = [];
  function makeWidget(cv, spec) {
    if (!cv) return null;
    var ctx = cv.getContext('2d');
    var w = { cv: cv, ctx: ctx, W: 0, H: 0, spec: spec, state: {} };
    w.fit = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cssW = Math.round(cv.getBoundingClientRect().width) || +cv.dataset.w || 700;
      var baseW = +cv.dataset.w || 700, baseH = +cv.dataset.h || 300;
      var cssH = spec.height ? spec.height(cssW) : Math.round(cssW * baseH / baseW);
      cssH = Math.max(120, cssH);
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
      cv.style.height = cssH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w.W = cssW; w.H = cssH;
      if (spec.layout) spec.layout(w);
    };
    w.render = function () { ctx.clearRect(0, 0, w.W, w.H); spec.draw(w, ctx); };
    w.redraw = function () { w.fit(); w.render(); };
    if (spec.init) spec.init(w);
    widgets.push(w);
    return w;
  }
  var resizeTimer = null;
  function refitAll() { readPalette(); for (var i = 0; i < widgets.length; i++) widgets[i].redraw(); }
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(refitAll, 90); });

  /* ================================================================== *
   * 3. page chrome: theme toggle, progress bar, reveal
   * ================================================================== */
  var SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6"/>';
  var MOON = '<path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.9 6.9 0 0 0 11.1 11.1Z"/>';
  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function paintToggle() { var b = $('themeBtn'); if (!b) return; var s = b.querySelector('svg'); if (s) s.innerHTML = currentTheme() === 'dark' ? SUN : MOON; }
  readPalette(); paintToggle();
  var tb = $('themeBtn');
  if (tb) tb.addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    paintToggle(); setTimeout(refitAll, 30);
  });
  var bar = $('backbar'), prog = $('progress');
  function onScroll() {
    if (bar) bar.classList.toggle('scrolled', window.scrollY > 6);
    if (prog) { var h = document.documentElement.scrollHeight - window.innerHeight; prog.style.width = (h > 0 ? (window.scrollY / h * 100) : 0) + '%'; }
  }
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  if ('IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }); }, { rootMargin: '-40px' });
    document.querySelectorAll('.reveal').forEach(function (el) { ro.observe(el); });
  } else { document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); }); }

  /* ================================================================== *
   * 4. HERO — static filmstrip: position becomes a rotation angle
   * ================================================================== */
  makeWidget($('cv-hero'), {
    height: function (w) { return Math.max(200, Math.min(300, Math.round(w * 0.40))); },
    draw: function (w, ctx) {
      var N = w.W < 520 ? 6 : 9, step = 0.55, pad = 12;
      var cw = (w.W - pad * 2) / N, r = Math.max(2, Math.min(cw * 0.34, w.H * 0.30)), cy = w.H * 0.46;
      for (var i = 0; i < N; i++) {
        var cx = pad + cw * i + cw / 2, ang = i * step;
        ring(ctx, cx, cy, r);
        var col = mixHex(P.acc2, P.hot, i / (N - 1));
        arrow(ctx, cx, cy, ang, r, col, 2.4);
        ctx.fillStyle = P.soft; ctx.font = '600 11px ' + P.mono;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('pos ' + i, cx, cy + r + 12);
      }
      ctx.fillStyle = P.soft; ctx.font = '600 12px ' + P.sans;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('same arrow, turned a little more at each position', pad, 10);
    }
  });

  /* ================================================================== *
   * 5. W1 — rotate two arrows; the dot product tracks the difference
   * ================================================================== */
  (function () {
    var cv = $('cv-rotdot'); if (!cv) return;
    var a = 40, b = 110; // degrees
    var wg = makeWidget(cv, {
      height: function () { return 320; },
      draw: function (w, ctx) {
        var cx = w.W * 0.5, cy = w.H * 0.52, r = Math.max(2, Math.min(w.W * 0.20, w.H * 0.36));
        ring(ctx, cx, cy, r);
        var ar = a * Math.PI / 180, br = b * Math.PI / 180;
        /* wedge for the angle between (short way) */
        var d = shortDelta(ar, br), steps = 24;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        for (var s = 0; s <= steps; s++) { var ang = br + d * s / steps, rr = r * 0.42; ctx.lineTo(cx + Math.cos(ang) * rr, cy - Math.sin(ang) * rr); }
        ctx.closePath(); ctx.fillStyle = alpha(P.good, 0.18); ctx.fill();
        arrow(ctx, cx, cy, br, r, P.hot, 3);
        arrow(ctx, cx, cy, ar, r, P.acc2, 3);
        ctx.fillStyle = P.acc2; ctx.font = '700 12px ' + P.sans; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('query', 10, 10);
        ctx.fillStyle = P.hot; ctx.fillText('key', 66, 10);
        ctx.fillStyle = P.good; ctx.fillText('angle between', 110, 10);
      }
    });
    function between(x, y) { var d = ((x - y) % 360 + 360) % 360; return d > 180 ? 360 - d : d; }
    function sync() {
      a = +$('rd-a').value; b = +$('rd-b').value;
      $('rd-a-v').textContent = a + '°'; $('rd-b-v').textContent = b + '°';
      var bt = between(a, b);
      $('rd-gap').textContent = bt + '°';
      $('rd-dot').textContent = Math.cos(bt * Math.PI / 180).toFixed(2);
      wg.render();
    }
    $('rd-a').addEventListener('input', sync);
    $('rd-b').addEventListener('input', sync);
    $('rd-both').addEventListener('click', function () {
      $('rd-a').value = (a + 30) % 360; $('rd-b').value = (b + 30) % 360; sync();
    });
    sync();
  })();

  /* ================================================================== *
   * 6. W2 — position becomes rotation; score depends only on the gap
   * ================================================================== */
  (function () {
    var cv = $('cv-posrot'); if (!cv) return;
    var m = 2, n = 6, PMAX = 24, theta = TAU * 1.3 / 24; // ~1.3 turns across the range
    var wg = makeWidget(cv, {
      height: function () { return 300; },
      draw: function (w, ctx) {
        var cx = w.W * 0.5, cy = w.H * 0.42, r = Math.max(2, Math.min(w.W * 0.19, w.H * 0.32));
        ring(ctx, cx, cy, r);
        arrow(ctx, cx, cy, n * theta, r, P.hot, 3);
        arrow(ctx, cx, cy, m * theta, r, P.acc2, 3);
        ctx.fillStyle = P.acc2; ctx.font = '700 12px ' + P.sans; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('query @ m', 10, 10);
        ctx.fillStyle = P.hot; ctx.fillText('key @ n', 92, 10);
        /* position strip */
        var y = w.H - 34, x0 = 40, x1 = w.W - 40;
        ctx.strokeStyle = P.line; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        for (var p = 0; p <= PMAX; p++) {
          var x = lerp(x0, x1, p / PMAX);
          ctx.strokeStyle = P.line2; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
        }
        function tok(p, col, lbl) {
          var x = lerp(x0, x1, p / PMAX);
          ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = P.surface; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = col; ctx.font = '600 10px ' + P.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(lbl, x, y - 10);
        }
        tok(m, P.acc2, 'm'); tok(n, P.hot, 'n');
        ctx.fillStyle = P.soft; ctx.font = '600 10px ' + P.mono; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('position 0', x0, y + 8); ctx.textAlign = 'right'; ctx.fillText('' + PMAX, x1, y + 8);
      }
    });
    function sync() {
      m = +$('pr-m').value; n = +$('pr-n').value;
      $('pr-m-v').textContent = m; $('pr-n-v').textContent = n;
      $('pr-gap').textContent = (n - m);
      $('pr-score').textContent = Math.cos((m - n) * theta).toFixed(2);
      wg.render();
    }
    $('pr-m').addEventListener('input', sync);
    $('pr-n').addEventListener('input', sync);
    sync();
  })();

  /* ================================================================== *
   * 7. W3 — a row of wheels, each turning at its own frequency
   * ================================================================== */
  (function () {
    var cv = $('cv-wheels'); if (!cv) return;
    var pos = 8, shown = 6, base = 10000;
    function freq(i) { return Math.pow(base, -i / shown); } // theta_i, fast (i=0) -> slow
    var wg = makeWidget(cv, {
      height: function () { return 300; },
      draw: function (w, ctx) {
        var pad = 12, cw = (w.W - pad * 2) / shown, r = Math.max(2, Math.min(cw * 0.34, w.H * 0.30)), cy = w.H * 0.46;
        for (var i = 0; i < shown; i++) {
          var cx = pad + cw * i + cw / 2, ang = pos * freq(i);
          ring(ctx, cx, cy, r);
          var col = mixHex(P.acc2, P.hot, shown > 1 ? i / (shown - 1) : 0);
          arrow(ctx, cx, cy, ang, r, col, 2.4);
          var turns = pos * freq(i) / TAU;
          ctx.fillStyle = P.soft; ctx.font = '600 11px ' + P.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('i=' + i, cx, cy + r + 10);
          ctx.fillStyle = P.soft; ctx.font = '600 9px ' + P.mono;
          ctx.fillText(turns >= 1 ? (turns.toFixed(turns < 10 ? 1 : 0) + ' turns') : (turns.toFixed(2) + ' turn'), cx, cy + r + 24);
        }
        ctx.fillStyle = P.soft; ctx.font = '600 12px ' + P.sans; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('fast', pad, 8); ctx.textAlign = 'right'; ctx.fillText('slow', w.W - pad, 8);
      }
    });
    function sync() {
      pos = +$('wh-pos').value; shown = +$('wh-n').value;
      $('wh-pos-v').textContent = pos; $('wh-n-v').textContent = shown;
      wg.render();
    }
    $('wh-pos').addEventListener('input', sync);
    $('wh-n').addEventListener('input', function () { shown = +this.value; $('wh-n-v').textContent = shown; wg.render(); });
    sync();
  })();

  /* ================================================================== *
   * 8. W4 — position interpolation: slow the turns to fit a longer run
   * ================================================================== */
  (function () {
    var cv = $('cv-context'); if (!cv) return;
    var s = 1, len = 128, L0 = 64, AXMAX = 256;
    var wg = makeWidget(cv, {
      height: function () { return 240; },
      draw: function (w, ctx) {
        var x0 = 40, x1 = w.W - 20, y = w.H * 0.52, bh = 34;
        function X(turn) { return lerp(x0, x1, clamp(turn / AXMAX, 0, 1)); }
        /* trained (green) band and extrapolation (red) region */
        ctx.fillStyle = alpha(P.good, 0.16); ctx.fillRect(x0, y - bh / 2, X(L0) - x0, bh);
        ctx.fillStyle = alpha(P.hot, 0.10); ctx.fillRect(X(L0), y - bh / 2, x1 - X(L0), bh);
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(x0, y - bh / 2, x1 - x0, bh);
        /* boundary marker at L0 */
        ctx.strokeStyle = alpha(P.good, 0.9); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(X(L0), y - bh / 2 - 6); ctx.lineTo(X(L0), y + bh / 2 + 6); ctx.stroke();
        /* ticks, one per token position */
        var inCount = 0;
        for (var mm = 0; mm < len; mm++) {
          var turn = mm / s; if (turn > AXMAX) break;
          var x = X(turn), inside = turn <= L0; if (inside) inCount++;
          ctx.strokeStyle = alpha(inside ? P.good : P.hot, 0.75); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y - bh / 2 + 3); ctx.lineTo(x, y + bh / 2 - 3); ctx.stroke();
        }
        /* labels */
        ctx.fillStyle = P.soft; ctx.font = '600 11px ' + P.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('how far the wheel has turned  →', (x0 + x1) / 2, y + bh / 2 + 12);
        ctx.fillStyle = P.good; ctx.font = '600 10px ' + P.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('trained range', (x0 + X(L0)) / 2, y - bh / 2 - 8);
        if (X(L0) < x1 - 60) { ctx.fillStyle = P.hot; ctx.fillText('never seen in training', (X(L0) + x1) / 2, y - bh / 2 - 8); }
        w.state.inCount = inCount;
      }
    });
    function sync() {
      s = +$('cx-s').value; len = +$('cx-len').value;
      $('cx-s-v').textContent = s + '×'; $('cx-len-v').textContent = len;
      wg.render();
      var inC = wg.state.inCount || 0;
      $('cx-in').textContent = inC;
      $('cx-out').textContent = Math.max(0, len - inC);
    }
    $('cx-s').addEventListener('input', sync);
    $('cx-len').addEventListener('input', sync);
    sync();
  })();

  /* first paint */
  window.addEventListener('load', refitAll);
  refitAll();
})();
