/* pe.js — every visualization on the sinusoidal positional-encoding write-up.
 *
 * No dependencies. All colour comes from CSS custom properties, so light and
 * dark both work and a theme flip just re-reads the palette and redraws.
 *
 * Conventions (borrowed from the Bloom-filter piece so the whole site behaves
 * the same way):
 *   - canvases carry data-w / data-h for their base aspect ratio
 *   - work is done in CSS pixels; the context is pre-scaled by devicePixelRatio
 *   - animated widgets pause when scrolled out of view
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    P.accRGB = hexToRgb(P.accent);
    P.hotRGB = hexToRgb(P.hot);
    P.midRGB = hexToRgb(P.paper);
  }

  /* ================================================================== *
   * 1. helpers
   * ================================================================== */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function hexToRgb(h) {
    h = (h || '').trim();
    if (h.charAt(0) === '#') h = h.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return [128, 128, 128];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function alpha(col, a) {
    var c = hexToRgb(col);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mix(a, b, t) {
    return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
  }
  /* diverging: -1 -> accent (indigo), 0 -> paper (pale), +1 -> hot (magenta) */
  function valRGB(v) {
    v = clamp(v, -1, 1);
    return v < 0 ? mix(P.midRGB, P.accRGB, -v) : mix(P.midRGB, P.hotRGB, v);
  }
  function valColor(v) { var c = valRGB(v); return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  function rr(ctx, x, y, w, h, r) {
    if (!(w > 0) || !(h > 0)) { ctx.beginPath(); return; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* The one bit of maths that matters. PE(pos, dim) for a given base and width d. */
  function peVal(pos, dim, base, d) {
    var i = Math.floor(dim / 2);
    var freq = Math.pow(base, -(2 * i) / d);
    var a = pos * freq;
    return (dim % 2 === 0) ? Math.sin(a) : Math.cos(a);
  }

  function evtXY(cv, e) {
    var r = cv.getBoundingClientRect();
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    var cx = (t ? t.clientX : e.clientX) - r.left;
    var cy = (t ? t.clientY : e.clientY) - r.top;
    return { x: cx, y: cy };
  }

  /* ================================================================== *
   * 2. canvas plumbing
   * ================================================================== */
  var widgets = [];
  function makeWidget(cv, spec) {
    if (!cv) return null;
    var ctx = cv.getContext('2d');
    var w = { cv: cv, ctx: ctx, W: 0, H: 0, spec: spec, visible: false, t: 0, state: {} };

    w.fit = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cssW = Math.round(cv.getBoundingClientRect().width) || +cv.dataset.w || 700;
      var baseW = +cv.dataset.w || 700, baseH = +cv.dataset.h || 300;
      var cssH = spec.height ? spec.height(cssW) : Math.round(cssW * baseH / baseW);
      cssH = Math.max(120, cssH);
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
      cv.style.height = cssH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w.W = cssW; w.H = cssH;
      if (spec.layout) spec.layout(w);
    };
    w.render = function () { ctx.clearRect(0, 0, w.W, w.H); spec.draw(w, ctx); };
    w.redraw = function () { w.fit(); w.render(); };

    if (spec.init) spec.init(w);
    widgets.push(w);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { w.visible = es[0].isIntersecting; }, { rootMargin: '80px' }).observe(cv);
    } else { w.visible = true; }
    return w;
  }

  var lastT = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0);
    lastT = now;
    for (var i = 0; i < widgets.length; i++) {
      var w = widgets[i];
      if (!w.spec.tick) continue;
      if (!w.visible && !w.spec.always) continue;
      w.t += dt;
      if (w.spec.tick(w, dt) !== false) w.render();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

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
  function paintToggle() {
    var btn = $('themeBtn'); if (!btn) return;
    var svg = btn.querySelector('svg'); if (svg) svg.innerHTML = currentTheme() === 'dark' ? SUN : MOON;
  }
  readPalette();
  paintToggle();
  var tb = $('themeBtn');
  if (tb) tb.addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    paintToggle();
    setTimeout(refitAll, 30);
  });

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

  /* small offscreen helper for heatmaps */
  function makeOff(cols, rows) {
    var c = document.createElement('canvas'); c.width = cols; c.height = rows;
    return { c: c, ctx: c.getContext('2d'), img: c.getContext('2d').createImageData(cols, rows) };
  }
  function paintOff(off, base, d, posSpan, colFn) {
    var cols = off.c.width, rows = off.c.height, data = off.img.data, p = 0;
    for (var r = 0; r < rows; r++) {
      var pos = r / (rows - 1) * posSpan;
      for (var cc = 0; cc < cols; cc++) {
        var dim = Math.floor(cc / cols * d);
        var v = peVal(pos, dim, base, d);
        var col = valRGB(v);
        data[p++] = col[0]; data[p++] = col[1]; data[p++] = col[2]; data[p++] = 255;
      }
    }
    off.ctx.putImageData(off.img, 0, 0);
  }

  /* ================================================================== *
   * 4. HERO — static positional-encoding matrix
   * ================================================================== */
  makeWidget($('cv-hero'), {
    height: function (w) { return Math.max(220, Math.min(300, Math.round(w * 0.42))); },
    init: function (w) { w.state.off = makeOff(96, 64); },
    draw: function (w, ctx) {
      var base = 10000, d = 96, span = 140;
      var off = w.state.off, cols = off.c.width, rows = off.c.height, data = off.img.data, p = 0;
      for (var r = 0; r < rows; r++) {
        var pos = r / (rows - 1) * span;
        for (var cc = 0; cc < cols; cc++) {
          var dim = Math.floor(cc / cols * d);
          var v = peVal(pos, dim, base, d);
          var col = valRGB(v);
          data[p++] = col[0]; data[p++] = col[1]; data[p++] = col[2]; data[p++] = 255;
        }
      }
      off.ctx.putImageData(off.img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off.c, 0, 0, w.W, w.H);
      /* faint column guide + labels */
      ctx.fillStyle = alpha(P.ink, 0.0);
      ctx.font = '600 11px ' + P.sans;
      ctx.fillStyle = alpha(P.surface, 0.9);
      ctx.fillRect(0, w.H - 22, 148, 22);
      ctx.fillRect(w.W - 96, w.H - 22, 96, 22);
      ctx.fillStyle = P.soft;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('← fast dims', 8, w.H - 11);
      ctx.textAlign = 'right';
      ctx.fillText('slow dims →', w.W - 8, w.H - 11);
    }
  });

  /* ================================================================== *
   * 5. W1 — the bag of words (permutation invariance)
   * ================================================================== */
  (function () {
    var cv = $('cv-bag'); if (!cv) return;
    var TOKENS = [
      { w: 'dog', c: 'acc2' },
      { w: 'bites', c: 'hot' },
      { w: 'man', c: 'good' }
    ];
    /* fixed, content-only pairwise attention weights (symmetric) */
    var WT = [[0, 0.62, 0.31], [0.62, 0, 0.74], [0.31, 0.74, 0]];
    var order = [0, 1, 2];
    var drag = { id: -1, x: 0 };

    function tokColor(c) { return c === 'hot' ? P.hot : c === 'good' ? P.good : P.acc2; }

    var wg = makeWidget(cv, {
      height: function () { return 300; },
      layout: function (w) {
        var n = order.length, pad = 70;
        w.state.slotX = [];
        for (var s = 0; s < n; s++) w.state.slotX.push(lerp(pad, w.W - pad, n === 1 ? 0.5 : s / (n - 1)));
        w.state.tileY = w.H - 70;
      },
      draw: function (w, ctx) {
        var slotX = w.state.slotX, tileY = w.state.tileY, n = order.length;
        var tw = 96, th = 46;
        /* arcs between every pair, thickness ~ weight, drawn above the tiles */
        for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) {
          var ta = order[a], tb = order[b];
          var wt = WT[ta][tb];
          var xa = (drag.id === ta) ? drag.x : slotX[a];
          var xb = (drag.id === tb) ? drag.x : slotX[b];
          var mx = (xa + xb) / 2, span = Math.abs(xb - xa);
          var top = tileY - 30 - span * 0.42;
          ctx.beginPath();
          ctx.moveTo(xa, tileY - 24);
          ctx.quadraticCurveTo(mx, top, xb, tileY - 24);
          ctx.lineWidth = 1 + wt * 7;
          ctx.strokeStyle = alpha(P.acc2, 0.18 + wt * 0.5);
          ctx.stroke();
          /* weight label */
          var ly = (tileY - 24 + top) / 2 - 4;
          ctx.font = '600 12px ' + P.mono;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          var lw = ctx.measureText(wt.toFixed(2)).width + 12;
          ctx.fillStyle = P.surface;
          rr(ctx, mx - lw / 2, ly - 9, lw, 18, 5); ctx.fill();
          ctx.strokeStyle = alpha(P.acc2, 0.35); ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = P.acc2;
          ctx.fillText(wt.toFixed(2), mx, ly);
        }
        /* tiles */
        for (var s = 0; s < n; s++) {
          var id = order[s];
          var x = (drag.id === id) ? drag.x : slotX[s];
          var col = tokColor(TOKENS[id].c);
          ctx.save();
          rr(ctx, x - tw / 2, tileY - th / 2, tw, th, 11);
          ctx.fillStyle = P.surface; ctx.fill();
          ctx.lineWidth = drag.id === id ? 2.5 : 1.5;
          ctx.strokeStyle = col; ctx.stroke();
          ctx.fillStyle = col;
          ctx.font = '700 17px ' + P.sans;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(TOKENS[id].w, x, tileY);
          ctx.restore();
          /* slot index below */
          ctx.fillStyle = P.soft; ctx.font = '600 11px ' + P.mono;
          ctx.fillText('slot ' + s, slotX[s], tileY + th / 2 + 16);
        }
        /* title strip */
        ctx.fillStyle = P.soft; ctx.font = '600 12px ' + P.sans;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('reading now:  “' + order.map(function (i) { return TOKENS[i].w; }).join(' ') + '”', 6, 8);
        ctx.fillStyle = P.soft;
        ctx.fillText('attention weights are frozen: order carries no information', 6, 28);
      }
    });

    function slotFromX(w, x) {
      var best = 0, bd = 1e9;
      for (var s = 0; s < w.state.slotX.length; s++) { var dd = Math.abs(x - w.state.slotX[s]); if (dd < bd) { bd = dd; best = s; } }
      return best;
    }
    function down(e) {
      var pt = evtXY(cv, e); var tileY = wg.state.tileY;
      for (var s = 0; s < order.length; s++) {
        if (Math.abs(pt.x - wg.state.slotX[s]) < 52 && Math.abs(pt.y - tileY) < 34) {
          drag.id = order[s]; drag.x = pt.x; wg.render(); e.preventDefault(); return;
        }
      }
    }
    function move(e) {
      if (drag.id < 0) return;
      var pt = evtXY(cv, e); drag.x = pt.x;
      var from = order.indexOf(drag.id);
      var to = slotFromX(wg, pt.x);
      if (to !== from) { order.splice(from, 1); order.splice(to, 0, drag.id); }
      wg.render(); e.preventDefault();
    }
    function up() { if (drag.id < 0) return; drag.id = -1; wg.render(); }
    cv.addEventListener('mousedown', down);
    cv.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    cv.addEventListener('touchstart', down, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);

    $('bag-shuffle').addEventListener('click', function () {
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor((i + 1) * fakeRand(i + order[0])); var t = order[i]; order[i] = order[j]; order[j] = t; }
      wg.render();
    });
    $('bag-reset').addEventListener('click', function () { order = [0, 1, 2]; wg.render(); });
    var rs = 7;
    function fakeRand() { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; }
  })();

  /* ================================================================== *
   * 6. W2 — normalize-by-length is inconsistent
   * ================================================================== */
  (function () {
    var cv = $('cv-naive'); if (!cv) return;
    var len = 10;
    var wg = makeWidget(cv, {
      height: function () { return 220; },
      draw: function (w, ctx) {
        var padL = 40, padR = 40, y = w.H - 70, x0 = padL, x1 = w.W - padR;
        /* axis */
        ctx.strokeStyle = P.line; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.fillStyle = P.soft; ctx.font = '600 11px ' + P.mono; ctx.textBaseline = 'top';
        ctx.textAlign = 'left'; ctx.fillText('0.0', x0, y + 10);
        ctx.textAlign = 'right'; ctx.fillText('1.0', x1, y + 10);
        ctx.textAlign = 'center'; ctx.fillText('position ÷ sequence length', (x0 + x1) / 2, y + 10);
        /* dots */
        for (var k = 0; k < len; k++) {
          var f = len > 1 ? k / (len - 1) : 0;
          var x = lerp(x0, x1, f);
          var hot = (k === 3);
          ctx.beginPath(); ctx.arc(x, y, hot ? 7 : 4.5, 0, 7);
          ctx.fillStyle = hot ? P.hot : alpha(P.acc2, 0.55); ctx.fill();
          if (hot) {
            ctx.fillStyle = P.hot; ctx.font = '700 12px ' + P.sans;
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText('token 3', x, y - 14);
            ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 2); ctx.strokeStyle = P.hot; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }
        /* neighbour gap bracket between token 3 and 4 */
        if (len > 4) {
          var xa = lerp(x0, x1, 3 / (len - 1)), xb = lerp(x0, x1, 4 / (len - 1));
          var by = y + 34;
          ctx.strokeStyle = P.good; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(xa, by - 5); ctx.lineTo(xa, by); ctx.lineTo(xb, by); ctx.lineTo(xb, by - 5); ctx.stroke();
          ctx.fillStyle = P.good; ctx.font = '600 11px ' + P.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('one step = ' + (1 / (len - 1)).toFixed(3), (xa + xb) / 2, by + 3);
        }
        ctx.fillStyle = P.soft; ctx.font = '600 12px ' + P.sans; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(len + ' tokens', 6, 8);
      }
    });
    function sync() {
      $('nv-len-v').textContent = len;
      $('nv-p3').textContent = (len > 1 ? 3 / (len - 1) : 0).toFixed(2);
      $('nv-gap').textContent = (len > 1 ? 1 / (len - 1) : 0).toFixed(3);
      wg.render();
    }
    $('nv-len').addEventListener('input', function () { len = +this.value; sync(); });
    sync();
  })();

  /* ================================================================== *
   * 7. W3 — binary counter morphing into sines
   * ================================================================== */
  (function () {
    var cv = $('cv-binary'); if (!cv) return;
    var BITS = 6, RANGE = 64;
    var n = 0, playing = !reduced, morph = 0, morphTarget = 0, acc = 0;

    var wg = makeWidget(cv, {
      height: function () { return 320; },
      always: true,
      layout: function (w) {
        w.state.padL = 74; w.state.padR = 20; w.state.top = 34; w.state.laneH = (w.H - w.state.top - 24) / BITS;
      },
      tick: function (w, dt) {
        if (playing) { acc += dt; if (acc > 0.42) { acc = 0; n = (n + 1) % RANGE; } }
        if (Math.abs(morph - morphTarget) > 0.001) morph = lerp(morph, morphTarget, Math.min(1, dt * 6));
        else morph = morphTarget;
        return true;
      },
      draw: function (w, ctx) {
        var x0 = w.state.padL, x1 = w.W - w.state.padR, top = w.state.top, laneH = w.state.laneH;
        var cursorX = lerp(x0, x1, n / RANGE);
        for (var b = 0; b < BITS; b++) {
          var cy = top + laneH * b + laneH / 2;
          var amp = laneH * 0.34;
          var flip = Math.pow(2, b);       // bit b flips every 2^b steps
          var period = flip * 2;           // full cycle
          /* baseline */
          ctx.strokeStyle = P.line2; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x1, cy); ctx.stroke();
          /* waveform */
          ctx.beginPath();
          for (var px = 0; px <= x1 - x0; px += 2) {
            var xv = px / (x1 - x0) * RANGE;
            var sq = ((Math.floor(xv) >> b) & 1) ? 1 : 0;    // 0/1
            var sqY = (sq - 0.5) * 2;                         // -1/+1
            var siY = Math.sin(2 * Math.PI * xv / period - Math.PI / 2); // aligns phase with square
            var yv = lerp(sqY, siY, morph);
            var X = x0 + px, Y = cy - yv * amp;
            if (px === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
          }
          ctx.strokeStyle = b % 2 === 0 ? P.acc2 : P.hot;
          ctx.lineWidth = 2; ctx.stroke();
          /* lane label */
          ctx.fillStyle = P.soft; ctx.font = '600 11px ' + P.mono; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText('bit ' + b, x0 - 12, cy);
          /* current value marker */
          var curSq = ((n >> b) & 1);
          var curSqY = (curSq - 0.5) * 2;
          var curSi = Math.sin(2 * Math.PI * n / period - Math.PI / 2);
          var curY = cy - lerp(curSqY, curSi, morph) * amp;
          ctx.beginPath(); ctx.arc(cursorX, curY, 4.5, 0, 7);
          ctx.fillStyle = b % 2 === 0 ? P.acc2 : P.hot; ctx.fill();
          ctx.strokeStyle = P.surface; ctx.lineWidth = 2; ctx.stroke();
        }
        /* cursor */
        ctx.strokeStyle = alpha(P.ink, 0.5); ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(cursorX, top - 6); ctx.lineTo(cursorX, top + laneH * BITS + 2); ctx.stroke();
        ctx.setLineDash([]);
        /* binary readout at cursor */
        var bits = '';
        for (var bb = BITS - 1; bb >= 0; bb--) bits += ((n >> bb) & 1);
        ctx.fillStyle = P.ink; ctx.font = '700 12px ' + P.mono; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('n = ' + n + '  =  ' + bits, 6, 8);
      }
    });
    $('bin-n').textContent = '0';
    function refresh() { $('bin-n').textContent = n; }
    var timer = setInterval(refresh, 120);
    $('bin-play').addEventListener('click', function () { playing = !playing; this.textContent = playing ? 'Pause' : 'Play'; });
    $('bin-step').addEventListener('click', function () { playing = false; $('bin-play').textContent = 'Play'; n = (n + 1) % RANGE; });
    $('bin-reset').addEventListener('click', function () { n = 0; });
    var seg = $('bin-seg');
    seg.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        seg.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        morphTarget = btn.dataset.m === 'smooth' ? 1 : 0;
      });
    });
  })();

  /* ================================================================== *
   * 8. W4 — the frequency ladder + encoding-vector strip
   * ================================================================== */
  (function () {
    var cv = $('cv-ladder'); if (!cv) return;
    var pos = 8, pairs = 6, base = 10000, POSSPAN = 128, dragging = false;

    function freqOf(i, P_) { return Math.pow(base, -(i) / P_); } // d=2*pairs -> exponent 2i/d = i/pairs

    var wg = makeWidget(cv, {
      height: function () { return 380; },
      layout: function (w) {
        w.state.stripW = 96; w.state.padL = 16; w.state.padR = w.state.stripW + 26; w.state.top = 30;
        w.state.laneH = (w.H - w.state.top - 20) / pairs;
      },
      draw: function (w, ctx) {
        var x0 = w.state.padL, x1 = w.W - w.state.padR, top = w.state.top, laneH = w.state.laneH;
        var lineX = lerp(x0, x1, pos / POSSPAN);
        var vec = [];
        for (var i = 0; i < pairs; i++) {
          var cy = top + laneH * i + laneH / 2, amp = laneH * 0.34;
          var fr = freqOf(i, pairs);
          ctx.strokeStyle = P.line2; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x1, cy); ctx.stroke();
          /* sine then cosine */
          [['sin', P.acc2], ['cos', P.hot]].forEach(function (pair, k) {
            ctx.beginPath();
            for (var px = 0; px <= x1 - x0; px += 2) {
              var pv = px / (x1 - x0) * POSSPAN;
              var yv = pair[0] === 'sin' ? Math.sin(pv * fr) : Math.cos(pv * fr);
              var X = x0 + px, Y = cy - yv * amp;
              if (px === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
            }
            ctx.strokeStyle = alpha(pair[1], k === 0 ? 0.95 : 0.6); ctx.lineWidth = k === 0 ? 2 : 1.6; ctx.stroke();
          });
          /* sampled dots at position line */
          var sv = Math.sin(pos * fr), cvv = Math.cos(pos * fr);
          vec.push(sv); vec.push(cvv);
          ctx.beginPath(); ctx.arc(lineX, cy - sv * amp, 4.5, 0, 7); ctx.fillStyle = P.acc2; ctx.fill();
          ctx.strokeStyle = P.surface; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.arc(lineX, cy - cvv * amp, 3.6, 0, 7); ctx.fillStyle = P.hot; ctx.fill();
          ctx.strokeStyle = P.surface; ctx.lineWidth = 2; ctx.stroke();
          /* lane label */
          ctx.fillStyle = P.soft; ctx.font = '600 10px ' + P.mono; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText('i=' + i + '  λ≈' + Math.round(2 * Math.PI / fr), x0 + 2, cy + laneH / 2 - 3);
        }
        /* position line */
        ctx.strokeStyle = alpha(P.ink, 0.55); ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(lineX, top - 6); ctx.lineTo(lineX, top + laneH * pairs); ctx.stroke();
        ctx.setLineDash([]);
        /* encoding-vector strip on the right */
        var sx = w.W - w.state.stripW - 8, sy = top, sh = laneH * pairs, cellH = sh / vec.length;
        ctx.fillStyle = P.soft; ctx.font = '600 10px ' + P.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('PE(' + pos + ')', sx + w.state.stripW / 2, sy - 4);
        var paperRGBl = hexToRgb(P.paper);
        for (var j = 0; j < vec.length; j++) {
          var colc = mix(valRGB(vec[j]), paperRGBl, 0.5);
          ctx.fillStyle = 'rgb(' + colc[0] + ',' + colc[1] + ',' + colc[2] + ')';
          ctx.fillRect(sx, sy + j * cellH, w.state.stripW, cellH - 1);
          ctx.fillStyle = P.soft; ctx.font = '600 8px ' + P.mono; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(j % 2 === 0 ? 'sin' : 'cos', sx + 4, sy + j * cellH + cellH / 2);
          ctx.fillStyle = P.ink; ctx.font = '600 11px ' + P.mono; ctx.textAlign = 'right';
          ctx.fillText(vec[j].toFixed(2), sx + w.state.stripW - 5, sy + j * cellH + cellH / 2);
        }
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(sx, sy, w.state.stripW, sh);
        ctx.fillStyle = P.soft; ctx.font = '600 9px ' + P.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('the vector', sx + w.state.stripW / 2, sy + sh + 4);
      }
    });
    function setPos(x) {
      var x0 = wg.state.padL, x1 = wg.W - wg.state.padR;
      pos = Math.round(clamp((x - x0) / (x1 - x0), 0, 1) * POSSPAN);
      $('ld-pos').value = pos; $('ld-pos-v').textContent = pos; wg.render();
    }
    cv.addEventListener('mousedown', function (e) { dragging = true; setPos(evtXY(cv, e).x); e.preventDefault(); });
    cv.addEventListener('mousemove', function (e) { if (dragging) setPos(evtXY(cv, e).x); });
    window.addEventListener('mouseup', function () { dragging = false; });
    cv.addEventListener('touchstart', function (e) { dragging = true; setPos(evtXY(cv, e).x); e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', function (e) { if (dragging) { setPos(evtXY(cv, e).x); e.preventDefault(); } }, { passive: false });
    window.addEventListener('touchend', function () { dragging = false; });

    $('ld-pos').addEventListener('input', function () { pos = +this.value; $('ld-pos-v').textContent = pos; wg.render(); });
    $('ld-pairs').addEventListener('input', function () { pairs = +this.value; $('ld-pairs-v').textContent = pairs; wg.fit(); wg.render(); });
    $('ld-base').addEventListener('input', function () { base = +this.value; $('ld-base-v').textContent = base; wg.render(); });
  })();

  /* ================================================================== *
   * 9. W5 — the heatmap explorer
   * ================================================================== */
  (function () {
    var cv = $('cv-heat'); if (!cv) return;
    var d = 64, base = 10000, POS = 96, hover = null, mode = 'colour';

    var wg = makeWidget(cv, {
      height: function () { return 420; },
      layout: function (w) {
        w.state.padL = 44; w.state.padT = 24; w.state.padB = 30; w.state.padR = 16;
        w.state.off = makeOff(Math.max(8, d), POS);
        rebuild(w);
      },
      draw: function (w, ctx) {
        var x0 = w.state.padL, y0 = w.state.padT, pw = w.W - x0 - w.state.padR, ph = w.H - y0 - w.state.padB;
        if (mode === 'num') { drawNumbers(ctx, x0, y0, pw, ph); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(w.state.off.c, x0, y0, pw, ph);
        ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, pw, ph);
        /* axes */
        ctx.fillStyle = P.soft; ctx.font = '600 11px ' + P.mono;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('dimension  (0 … ' + (d - 1) + '),  fast to slow →', x0 + pw / 2, y0 + ph + 8);
        ctx.save(); ctx.translate(14, y0 + ph / 2); ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = 'middle'; ctx.fillText('position  (0 … ' + POS + ')', 0, 0); ctx.restore();
        /* crosshair */
        if (hover) {
          var hx = x0 + (hover.dim + 0.5) / d * pw, hy = y0 + hover.pos / POS * ph;
          ctx.strokeStyle = alpha(P.ink, 0.75); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, hy); ctx.lineTo(x0 + pw, hy); ctx.moveTo(hx, y0); ctx.lineTo(hx, y0 + ph); ctx.stroke();
          ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(hx, hy, 3, 0, 7); ctx.fill();
          ctx.strokeStyle = P.surface; ctx.lineWidth = 1.5; ctx.stroke();
        }
        /* colour legend */
        var lgX = w.W - 130, lgY = 6, lgW = 114, lgH = 8;
        var grad = ctx.createLinearGradient(lgX, 0, lgX + lgW, 0);
        grad.addColorStop(0, valColor(-1)); grad.addColorStop(0.5, valColor(0)); grad.addColorStop(1, valColor(1));
        ctx.fillStyle = grad; ctx.fillRect(lgX, lgY, lgW, lgH);
        ctx.strokeStyle = P.line; ctx.strokeRect(lgX, lgY, lgW, lgH);
        ctx.fillStyle = P.soft; ctx.font = '600 9px ' + P.mono; ctx.textBaseline = 'top';
        ctx.textAlign = 'left'; ctx.fillText('−1', lgX, lgY + lgH + 2);
        ctx.textAlign = 'right'; ctx.fillText('+1', lgX + lgW, lgY + lgH + 2);
      }
    });
    function rebuild(w) {
      if (!w.state.off || w.state.off.c.width !== d) w.state.off = makeOff(Math.max(8, d), POS);
      paintOff(w.state.off, base, d, POS, null);
    }
    function onMove(e) {
      var pt = evtXY(cv, e);
      var x0 = wg.state.padL, y0 = wg.state.padT, pw = wg.W - x0 - wg.state.padR, ph = wg.H - y0 - wg.state.padB;
      if (pt.x < x0 || pt.x > x0 + pw || pt.y < y0 || pt.y > y0 + ph) { hover = null; wg.render(); return; }
      var dim = clamp(Math.floor((pt.x - x0) / pw * d), 0, d - 1);
      var pos = clamp((pt.y - y0) / ph * POS, 0, POS);
      hover = { dim: dim, pos: pos };
      $('ht-pos').textContent = Math.round(pos);
      $('ht-dim').textContent = dim;
      $('ht-val').textContent = peVal(pos, dim, base, d).toFixed(3);
      wg.render();
    }
    cv.addEventListener('mousemove', onMove);
    cv.addEventListener('mouseleave', function () { hover = null; wg.render(); });
    cv.addEventListener('touchstart', onMove, { passive: true });
    cv.addEventListener('touchmove', onMove, { passive: true });
    $('ht-d').addEventListener('input', function () { d = +this.value; $('ht-d-v').textContent = d; rebuild(wg); wg.render(); });
    $('ht-base').addEventListener('input', function () { base = +this.value; $('ht-base-v').textContent = base; rebuild(wg); wg.render(); });
    var seg = $('ht-seg');
    if (seg) seg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); mode = b.dataset.m; wg.render();
      });
    });
    /* numeric view: a coarse grid of the actual encoding values, so the vectors are readable */
    function drawNumbers(ctx, x0, y0, pw, ph) {
      var NDIM = Math.min(d, 12), NPOS = 16, cw = pw / NDIM, chh = ph / NPOS, paperRGB = hexToRgb(P.paper);
      var fs = Math.max(8, Math.min(11, cw / 3.6));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var r = 0; r < NPOS; r++) for (var c = 0; c < NDIM; c++) {
        var v = peVal(r, c, base, d), col = mix(valRGB(v), paperRGB, 0.5);
        ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
        ctx.fillRect(x0 + c * cw, y0 + r * chh, cw - 1, chh - 1);
        ctx.fillStyle = P.ink; ctx.font = '600 ' + fs + 'px ' + P.mono;
        ctx.fillText(v.toFixed(2), x0 + c * cw + cw / 2, y0 + r * chh + chh / 2);
      }
      ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, pw, ph);
      ctx.fillStyle = P.soft; ctx.font = '600 11px ' + P.mono; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('dimension 0 … ' + (NDIM - 1) + (d > NDIM ? '  (first ' + NDIM + ' of ' + d + ')' : ''), x0 + pw / 2, y0 + ph + 8);
      ctx.save(); ctx.translate(14, y0 + ph / 2); ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle'; ctx.fillText('position 0 … ' + (NPOS - 1), 0, 0); ctx.restore();
    }
  })();

  /* first paint */
  window.addEventListener('load', refitAll);
  refitAll();
})();
