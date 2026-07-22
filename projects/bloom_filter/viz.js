/* viz.js - every animation and chart on the Bloom filter write-up.
 *
 * No dependencies. Charts read window.BLOOM_DATA, which is generated from
 * the C benchmark by bench/report.py, so nothing here invents a number.
 *
 * Conventions:
 *   - canvases carry data-w / data-h for their base aspect ratio
 *   - all colour comes from CSS custom properties, so light and dark both
 *     work and a theme flip just triggers a redraw
 *   - animated widgets pause when scrolled out of view
 */
(function () {
  'use strict';

  var D = window.BLOOM_DATA || null;
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
      line: g('--line'), line2: g('--line-2'), grid: g('--grid'),
      accent: g('--accent'), acc2: g('--accent-ink'),
      good: g('--good'), warn: g('--warn'), hot: g('--hot'), bad: g('--bad'),
      off: g('--cell-off'), edge: g('--cell-edge'),
      surface: g('--surface'), paper: g('--paper'), raise: g('--raise'), tag: g('--tag')
    };
    P.mono = '"SF Mono","JetBrains Mono","Fira Code",ui-monospace,Menlo,Consolas,monospace';
    P.sans = '"Inter","Helvetica Neue","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
  }
  readPalette();

  /* ================================================================== *
   * 1. small helpers
   * ================================================================== */

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function rr(ctx, x, y, w, h, r) {
    /* A degenerate rect is always a layout bug upstream, but throwing an
     * IndexSizeError from deep inside a draw call kills the whole frame, so
     * clamp and carry on. */
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

  /* colour with alpha, accepting hex or rgb() from CSS */
  function alpha(col, a) {
    col = (col || '').trim();
    if (col.charAt(0) === '#') {
      var h = col.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    if (col.indexOf('rgba') === 0) return col.replace(/,[^,]*\)$/, ',' + a + ')');
    if (col.indexOf('rgb') === 0) return col.replace('rgb(', 'rgba(').replace(')', ',' + a + ')');
    return col;
  }

  /* Fixed decimals, deliberately. Stripping trailing zeros made "13.0 ns"
     print as "13 ns" and broke the alignment of every table column. */
  function fmtNum(v, dp) {
    if (dp === undefined) dp = 2;
    return v.toFixed(dp);
  }
  function fmtPct(x) {
    if (x >= 0.1) return (x * 100).toFixed(1) + '%';
    if (x >= 0.01) return (x * 100).toFixed(2) + '%';
    if (x >= 0.001) return (x * 100).toFixed(3) + '%';
    if (x >= 0.0001) return (x * 100).toFixed(4) + '%';
    return (x * 100).toPrecision(2) + '%';
  }
  /* 1 -> "100%", 0.001 -> "0.1%", 1e-6 -> "0.0001%" */
  function fmtPctTick(v) {
    var p = v * 100;
    var dp = Math.max(0, -Math.round(Math.log10(p)));
    return p.toFixed(dp) + '%';
  }

  /* Deterministic per-index noise. An earlier version used a single multiply
     and the "random" bit array came out visibly striped. */
  function rnd01(i) {
    var x = Math.imul(i + 0x9e3779b9, 2654435761) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 3266489909) >>> 0;
    x ^= x >>> 16;
    return (x >>> 8) / 16777216;
  }

  function fmtCount(n) {
    if (n >= 1e9) return (n / 1e9) + 'B';
    if (n >= 1e6) return (n / 1e6) + 'M';
    if (n >= 1e3) return (n / 1e3) + 'k';
    return '' + n;
  }
  function fmtMB(mb) {
    if (mb >= 1024) {
      var g = mb / 1024;
      return (Math.abs(g - Math.round(g)) < 0.05 ? Math.round(g) : g.toFixed(2)) + ' GB';
    }
    if (mb >= 10) return Math.round(mb) + ' MB';
    return fmtNum(mb, 1) + ' MB';
  }

  /* ================================================================== *
   * 2. canvas plumbing: DPR, resize, theme, visibility-gated animation
   * ================================================================== */

  var widgets = [];

  function makeWidget(cv, spec) {
    if (!cv) return null;
    var ctx = cv.getContext('2d');
    var w = {
      cv: cv, ctx: ctx, W: 0, H: 0,
      spec: spec, visible: false, t: 0, state: {}
    };

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

    w.render = function () {
      ctx.clearRect(0, 0, w.W, w.H);
      spec.draw(w, ctx);
    };

    w.redraw = function () { w.fit(); w.render(); };

    if (spec.init) spec.init(w);
    widgets.push(w);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        w.visible = es[0].isIntersecting;
      }, { rootMargin: '80px' }).observe(cv);
    } else {
      w.visible = true;
    }
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
  function refitAll() {
    readPalette();
    for (var i = 0; i < widgets.length; i++) widgets[i].redraw();
  }
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refitAll, 90);
  });

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
      setTimeout(refitAll, 30);
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

  /* ================================================================== *
   * 4. figures pulled out of the benchmark data and injected into prose
   * ================================================================== */

  function memRow(what, detail) {
    var rows = D.memory.rows;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].what === what && (!detail || rows[i].detail.indexOf(detail) === 0)) return rows[i];
    }
    return null;
  }
  function bitsRow(bpk) {
    for (var i = 0; i < D.fpr_vs_bits.length; i++) if (D.fpr_vs_bits[i].bits_per_key === bpk) return D.fpr_vs_bits[i];
    return null;
  }
  function kRow(k) {
    for (var i = 0; i < D.fpr_vs_k.length; i++) if (D.fpr_vs_k[i].k === k) return D.fpr_vs_k[i];
    return null;
  }
  function cacheRow(k) {
    var r = D.cache_sweep.rows;
    for (var i = 0; i < r.length; i++) if (r[i].k === k) return r[i];
    return null;
  }

  var FIG = {};
  function buildFigures() {
    if (!D) return;
    var last = D.size_sweep.rows[D.size_sweep.rows.length - 1];
    var set = memRow('open-addressed hash set');
    var keysOnly = memRow('the keys alone');
    var b10 = memRow('bloom filter', '10 bits');
    var c7 = cacheRow(7);

    FIG.setMB = fmtMB(set.total_mb);
    FIG.keysOnlyMB = fmtMB(keysOnly.total_mb);
    FIG.bloom10MB = fmtMB(b10.total_mb);
    FIG.memRatio = Math.round(set.total_mb / b10.total_mb) + '×';
    FIG.keysRatio = Math.round(keysOnly.total_mb / b10.total_mb) + '×';
    FIG.setBits = Math.round(set.bits_per_key) + ' bits';

    FIG.bigN = fmtCount(last.n);
    FIG.bigSetNs = fmtNum(last.neg_ns.hashset, 1) + ' ns';
    FIG.bigSetMB = fmtMB(last.bytes.hashset / 1048576);
    FIG.bigBlockedNs = fmtNum(last.neg_ns.blocked, 1) + ' ns';
    FIG.bigBlockedMB = fmtMB(last.bytes.blocked / 1048576);
    FIG.bigRegNs = fmtNum(last.neg_ns.register, 1) + ' ns';
    FIG.bigClassicNs = fmtNum(last.neg_ns.classic, 1) + ' ns';
    FIG.bigSpeedup = fmtNum(last.neg_ns.hashset / last.neg_ns.register, 1) + '×';

    /* the small-n end of the sweep, where the exact set actually wins */
    var small = D.size_sweep.rows[1];
    FIG.smallN = fmtCount(small.n);
    FIG.smallSetNs = fmtNum(small.neg_ns.hashset, 1) + ' ns';
    FIG.smallClassicNs = fmtNum(small.neg_ns.classic, 1) + ' ns';

    FIG.fpr10 = fmtPct(bitsRow(10).fpr_classic);
    FIG.fprBlocked10 = fmtPct(bitsRow(10).fpr_blocked);
    FIG.fprReg10 = fmtPct(bitsRow(10).fpr_register);

    FIG.fprK4 = fmtPct(kRow(4).fpr);
    FIG.fprK7 = fmtPct(kRow(7).fpr);
    FIG.nsK4 = fmtNum(kRow(4).ns_per_negative_lookup, 1) + ' ns';
    FIG.nsK7 = fmtNum(kRow(7).ns_per_negative_lookup, 1) + ' ns';
    FIG.kTimeCost = Math.round((kRow(7).ns_per_negative_lookup / kRow(4).ns_per_negative_lookup - 1) * 100) + '%';

    var sm = D.small_filters.rows[0];
    FIG.gapSmall = fmtNum((sm.exact - sm.textbook) / sm.textbook * 100, 1) + '%';
    FIG.gapSmallM = sm.m_bits;

    FIG.cacheWin = Math.round((c7.ns_classic - c7.ns_blocked) / c7.ns_classic * 100) + '%';
    FIG.cacheClassic7 = fmtNum(c7.ns_classic, 1) + ' ns';
    FIG.cacheBlocked7 = fmtNum(c7.ns_blocked, 1) + ' ns';
    var c1 = cacheRow(1), c12 = cacheRow(12);
    FIG.perProbe = fmtNum((c12.ns_classic - c1.ns_classic) / 11, 1) + ' ns';

    var dv = D.double_vs_independent;
    var sp = 0;
    for (var i = 0; i < dv.length; i++) sp += (dv[i].ns_independent - dv[i].ns_double) / dv[i].ns_independent;
    FIG.doubleSpeed = Math.round(sp / dv.length * 100) + '%';

    var bs = D.block_size_sweep.rows;
    function blk(bits) {
      for (var i = 0; i < bs.length; i++) if (bs[i].block_bits === bits) return bs[i];
      return bs[0];
    }
    FIG.block64Fpr = fmtPct(blk(64).fpr);
    FIG.block512Fpr = fmtPct(blk(512).fpr);
    FIG.block1024Fpr = fmtPct(blk(1024).fpr);
    FIG.block4096Fpr = fmtPct(blk(4096).fpr);
    var nsLo = Infinity, nsHi = 0;
    bs.forEach(function (r) { nsLo = Math.min(nsLo, r.neg_ns); nsHi = Math.max(nsHi, r.neg_ns); });
    FIG.blockNsLo = fmtNum(nsLo, 1) + ' ns';
    FIG.blockNsHi = fmtNum(nsHi, 1) + ' ns';

    document.querySelectorAll('[data-fig]').forEach(function (el) {
      var v = FIG[el.getAttribute('data-fig')];
      el.textContent = v === undefined ? '?' : v;
    });
  }

  /* ================================================================== *
   * 5. a small chart engine
   * ================================================================== */

  function makeScale(type, domain, px0, px1) {
    var f;
    if (type === 'log') {
      var l0 = Math.log(domain[0]), l1 = Math.log(domain[1]);
      f = function (v) { return px0 + (Math.log(Math.max(v, 1e-12)) - l0) / (l1 - l0) * (px1 - px0); };
      f.inv = function (p) { return Math.exp(l0 + (p - px0) / (px1 - px0) * (l1 - l0)); };
    } else {
      f = function (v) { return px0 + (v - domain[0]) / (domain[1] - domain[0]) * (px1 - px0); };
      f.inv = function (p) { return domain[0] + (p - px0) / (px1 - px0) * (domain[1] - domain[0]); };
    }
    f.domain = domain;
    return f;
  }

  function logTicks(lo, hi) {
    var t = [], e = Math.floor(Math.log10(lo));
    while (Math.pow(10, e) <= hi * 1.0001) {
      var v = Math.pow(10, e);
      if (v >= lo * 0.9999) t.push(v);
      e++;
    }
    return t;
  }

  /* Draws the frame, grid and ticks. Returns the plot rect. */
  function frame(ctx, w, o) {
    var pad = o.pad;
    var L = pad.l, R = w.W - pad.r, T = pad.t, B = w.H - pad.b;
    ctx.save();

    // horizontal grid + y ticks
    ctx.font = '10px ' + P.mono;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    o.yTicks.forEach(function (tk) {
      var y = o.y(tk.v !== undefined ? tk.v : tk);
      if (y < T - 1 || y > B + 1) return;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L, Math.round(y) + 0.5);
      ctx.lineTo(R, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = P.soft;
      ctx.fillText(tk.label !== undefined ? tk.label : tk, L - 8, y);
    });

    // x ticks
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    o.xTicks.forEach(function (tk) {
      var v = tk.v !== undefined ? tk.v : tk;
      var x = o.x(v);
      if (x < L - 1 || x > R + 1) return;
      if (o.xGrid) {
        ctx.strokeStyle = P.grid;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, T);
        ctx.lineTo(Math.round(x) + 0.5, B);
        ctx.stroke();
      }
      ctx.fillStyle = P.soft;
      ctx.fillText(tk.label !== undefined ? tk.label : tk, x, B + 8);
    });

    // axis lines
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, Math.round(B) + 0.5);
    ctx.lineTo(R, Math.round(B) + 0.5);
    ctx.stroke();

    // labels
    ctx.fillStyle = P.soft;
    ctx.font = '10px ' + P.mono;
    if (o.xLabel) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(o.xLabel, (L + R) / 2, w.H - 2);
    }
    if (o.yLabel) {
      ctx.save();
      ctx.translate(13, (T + B) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(o.yLabel, 0, 0);
      ctx.restore();
    }
    ctx.restore();
    return { L: L, R: R, T: T, B: B };
  }

  function polyline(ctx, pts, col, width, dash) {
    if (!pts.length) return;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = width || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
  }

  /* Labels that float over gridlines need to punch a hole in them first. */
  function haloText(ctx, text, x, y) {
    ctx.save();
    ctx.strokeStyle = P.surface;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillText(text, x, y);
  }

  function dot(ctx, x, y, col, r, hollow) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (hollow) {
      ctx.fillStyle = P.surface; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.fillStyle = col; ctx.fill();
    }
  }

  /* Tooltip drawn on the canvas itself so it always matches the theme. */
  function tooltip(ctx, w, x, y, lines, accent) {
    ctx.save();
    ctx.font = '11px ' + P.mono;
    var pad = 8, lh = 15, tw = 0;
    lines.forEach(function (l) { tw = Math.max(tw, ctx.measureText(l).width); });
    var bw = tw + pad * 2, bh = lines.length * lh + pad * 2 - 3;
    var bx = clamp(x + 12, 4, w.W - bw - 4);
    var by = clamp(y - bh - 10, 4, w.H - bh - 4);
    ctx.shadowColor = 'rgba(0,0,0,.22)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    rr(ctx, bx, by, bw, bh, 8);
    ctx.fillStyle = P.surface;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = accent ? alpha(accent, 0.5) : P.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach(function (l, i) {
      ctx.fillStyle = i === 0 ? P.ink : P.ink2;
      ctx.fillText(l, bx + pad, by + pad + i * lh - 1);
    });
    ctx.restore();
  }

  /* Attaches pointer tracking; spec.hitTest(w, mx, my) returns a hover object */
  function hoverable(w) {
    var cv = w.cv;
    function move(e) {
      var r = cv.getBoundingClientRect();
      var pt = e.touches ? e.touches[0] : e;
      w.state.mx = pt.clientX - r.left;
      w.state.my = pt.clientY - r.top;
      w.render();
    }
    cv.addEventListener('mousemove', move);
    cv.addEventListener('touchstart', move, { passive: true });
    cv.addEventListener('touchmove', move, { passive: true });
    cv.addEventListener('mouseleave', function () {
      w.state.mx = null; w.state.my = null; w.render();
    });
  }

  function nearest(pts, mx, my, maxd) {
    if (mx == null) return null;
    var best = null, bd = (maxd || 34) * (maxd || 34);
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i].px - mx, dy = pts[i].py - my, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = pts[i]; }
    }
    return best;
  }

  /* ================================================================== *
   * 6. hero: an ambient filter slowly filling up
   * ================================================================== */

  makeWidget($('cv-hero'), {
    height: function (w) { return w < 520 ? 190 : 240; },
    init: function (w) {
      w.state = { cells: [], packets: [], nextIn: 0.25, cols: 0, rows: 0, cycle: 0 };
    },
    layout: function (w) {
      var s = w.state;
      s.cols = w.W < 420 ? 26 : w.W < 620 ? 38 : 54;
      s.rows = w.W < 520 ? 7 : 9;
      var n = s.cols * s.rows;
      if (s.cells.length !== n) {
        s.cells = [];
        for (var i = 0; i < n; i++) s.cells.push({ on: 0, glow: 0 });
      }
      s.pad = 22;
      s.gap = w.W < 520 ? 2 : 3;
      s.cw = (w.W - s.pad * 2 - (s.cols - 1) * s.gap) / s.cols;
      s.ch = Math.min(s.cw, 11);
      s.gridH = s.rows * s.ch + (s.rows - 1) * s.gap;
      s.gridY = w.H - s.pad - s.gridH;
    },
    tick: function (w, dt) {
      if (reduced) return false;
      var s = w.state, i;
      s.nextIn -= dt;
      if (s.nextIn <= 0) {
        s.nextIn = 0.16 + Math.random() * 0.22;
        var targets = [];
        for (i = 0; i < 3; i++) targets.push(Math.floor(Math.random() * s.cells.length));
        s.packets.push({ t: 0, y0: 20 + Math.random() * 26, targets: targets, dur: 0.95 });
        s.cycle++;
        if (s.cycle > s.cells.length * 0.22) {
          s.cycle = 0;
          for (i = 0; i < s.cells.length; i++) s.cells[i].fading = true;
        }
      }
      for (i = s.packets.length - 1; i >= 0; i--) {
        var p = s.packets[i];
        var was = p.t;
        p.t += dt / p.dur;
        for (var j = 0; j < p.targets.length; j++) {
          var at = 0.45 + j * 0.16;
          if (was < at && p.t >= at) {
            /* a resize can shrink the grid after a packet picked its targets */
            var c = s.cells[p.targets[j] % s.cells.length];
            if (c) { c.on = 1; c.glow = 1; c.fading = false; }
          }
        }
        if (p.t >= 1.25) s.packets.splice(i, 1);
      }
      for (i = 0; i < s.cells.length; i++) {
        var cc = s.cells[i];
        if (cc.glow > 0) cc.glow = Math.max(0, cc.glow - dt * 1.4);
        if (cc.fading && cc.on > 0) cc.on = Math.max(0, cc.on - dt * 0.5);
      }
      return true;
    },
    draw: function (w, ctx) {
      var s = w.state, i, r, c;
      if (!s.cells.length) return;

      // the grid
      for (r = 0; r < s.rows; r++) {
        for (c = 0; c < s.cols; c++) {
          var idx = r * s.cols + c;
          var cell = s.cells[idx];
          var x = s.pad + c * (s.cw + s.gap), y = s.gridY + r * (s.ch + s.gap);
          rr(ctx, x, y, s.cw, s.ch, 2);
          if (cell.on > 0.01) {
            ctx.fillStyle = alpha(P.accent, 0.25 + 0.65 * cell.on);
          } else {
            ctx.fillStyle = alpha(P.edge, 0.55);
          }
          ctx.fill();
          if (cell.glow > 0.02) {
            ctx.save();
            ctx.shadowColor = alpha(P.accent, 0.9 * cell.glow);
            ctx.shadowBlur = 14 * cell.glow;
            rr(ctx, x, y, s.cw, s.ch, 2);
            ctx.fillStyle = alpha(P.accent, 0.9);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // packets arcing in
      function cellCenter(idx) {
        var rr2 = Math.floor(idx / s.cols), cc2 = idx % s.cols;
        return [s.pad + cc2 * (s.cw + s.gap) + s.cw / 2, s.gridY + rr2 * (s.ch + s.gap) + s.ch / 2];
      }
      for (i = 0; i < s.packets.length; i++) {
        var p = s.packets[i];
        var sx = s.pad, sy = p.y0;
        var fadeIn = clamp(p.t / 0.3, 0, 1);
        var fadeOut = 1 - clamp((p.t - 0.95) / 0.3, 0, 1);
        var a = Math.min(fadeIn, fadeOut);
        if (a <= 0) continue;
        for (var j = 0; j < p.targets.length; j++) {
          var tgt = cellCenter(p.targets[j]);
          var at = clamp((p.t - j * 0.05) / 0.62, 0, 1);
          var e = easeInOut(at);
          var cx = lerp(sx, tgt[0], 0.5), cy = sy - 26;
          ctx.save();
          ctx.strokeStyle = alpha(P.accent, 0.16 * a);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cx, cy, lerp(sx, tgt[0], e), lerp(sy, tgt[1], e));
          ctx.stroke();
          if (at < 1) {
            var px = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * tgt[0];
            var py = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * tgt[1];
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = alpha(P.accent, 0.85 * a);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = alpha(P.acc2, 0.7 * a);
        ctx.fill();
      }

      // caption
      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.soft;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('KEYS IN', s.pad, 8);
      ctx.textAlign = 'right';
      var on = 0;
      for (i = 0; i < s.cells.length; i++) if (s.cells[i].on > 0.5) on++;
      ctx.fillText(on + ' / ' + s.cells.length + ' BITS SET', w.W - s.pad, 8);
    }
  });

  /* ================================================================== *
   * 7. the interactive filter
   * ================================================================== */

  var WORDS = ('apple banana cherry orange grape lemon melon peach plum berry mango papaya guava lychee ' +
    'anchor bridge candle dragon ember forest garden harbor island jungle kernel lantern meadow needle ' +
    'ocean pillar quartz river summit thunder umbrella valley whisper anvil beacon cactus dagger echo ' +
    'falcon glacier hammer indigo jasmine kettle ladder marble nectar orchid prism quiver ribbon saddle ' +
    'temple utopia violet walnut xenon yonder zephyr abacus bramble compass drizzle emerald fossil ' +
    'granite hollow ivory juniper kindle lagoon monsoon nimbus obsidian pebble quill rustic silver ' +
    'timber velvet willow amber basalt cobalt dusk elm frost gale hazel iris jade kelp lilac mist ' +
    'nettle onyx pine quartzite reed sage thistle usher vine wren yarrow zinc almond bison clover ' +
    'dune eagle fern grove heron ibis jackal koala lynx moth newt otter puffin quail raven stoat ' +
    'toucan urchin viper walrus yak zebra anchorite bellow cinder dapple elder fathom gossamer ' +
    'hearth inkwell jetty kestrel lattice mortar nimble orbit plinth quarry rafter sextant tundra ' +
    'undertow vellum wharf yeoman ziggurat archive binder cipher docket entropy filament gantry ' +
    'hydra isotope junction kilobyte lumen matrix nucleus operand packet quantum radix schema ' +
    'tensor unicode vector wavelet yield zenith bucket cursor daemon endian fragment gateway heap ' +
    'index journal kernel lexeme mutex nonce opcode parser query runtime socket thread unwind ' +
    'varint widget yacc zipper bloom cuckoo quotient sketch trie heapsort radixsort bitset').split(/\s+/);

  function h32(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }
  /* the same double-hashing scheme the C code uses */
  function positions(word, m, k) {
    var h1 = h32(word, 2166136261);
    var h2 = (h32(word, 0x9e3779b9) | 1) >>> 0;
    var out = [], h = h1;
    for (var i = 0; i < k; i++) {
      out.push(h % m);
      h = (h + h2) >>> 0;
    }
    return out;
  }

  var FM = 96, FK = 3;

  var filterW = makeWidget($('cv-filter'), {
    height: function (w) {
      var cols = w < 430 ? 12 : w < 620 ? 16 : 24;
      var rows = FM / cols;
      var cell = (w - 44 - (cols - 1) * 5) / cols;
      return Math.round(120 + rows * (cell + 5) + 24);
    },
    init: function (w) {
      w.state = {
        bits: new Array(FM).fill(0),
        glow: new Array(FM).fill(0),
        inserted: [],
        anim: null,
        mode: null,
        word: ''
      };
    },
    layout: function (w) {
      var s = w.state;
      s.cols = w.W < 430 ? 12 : w.W < 620 ? 16 : 24;
      s.rows = FM / s.cols;
      s.gap = 5;
      s.pad = 22;
      s.cw = (w.W - s.pad * 2 - (s.cols - 1) * s.gap) / s.cols;
      s.ch = s.cw;
      s.gridY = 120;
    },
    tick: function (w, dt) {
      var s = w.state, changed = false, i;
      if (s.anim) {
        s.anim.t += dt / s.anim.dur;
        if (s.anim.t >= 1.35) { s.anim = null; }
        changed = true;
      }
      for (i = 0; i < FM; i++) {
        if (s.glow[i] > 0) { s.glow[i] = Math.max(0, s.glow[i] - dt * 1.6); changed = true; }
      }
      return changed;
    },
    draw: function (w, ctx) {
      var s = w.state, i;
      var srcX = w.W / 2, srcY = 44;

      // the word chip
      if (s.word) {
        ctx.font = '600 14px ' + P.mono;
        var tw = ctx.measureText(s.word).width;
        var cwid = tw + 26, cx = srcX - cwid / 2;
        rr(ctx, cx, srcY - 15, cwid, 30, 9);
        ctx.fillStyle = s.mode === 'query' ? alpha(P.hot, 0.1) : alpha(P.accent, 0.1);
        ctx.fill();
        ctx.strokeStyle = s.mode === 'query' ? alpha(P.hot, 0.45) : alpha(P.accent, 0.45);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = s.mode === 'query' ? P.hot : P.acc2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.word, srcX, srcY + 1);
      }
      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.soft;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(s.mode === 'query' ? 'QUERY' : s.mode === 'insert' ? 'INSERT' : '', srcX, 10);

      function cellXY(idx) {
        var r = Math.floor(idx / s.cols), c = idx % s.cols;
        return [s.pad + c * (s.cw + s.gap), s.gridY + r * (s.ch + s.gap)];
      }
      function cellC(idx) {
        var p = cellXY(idx);
        return [p[0] + s.cw / 2, p[1] + s.ch / 2];
      }

      // arcs
      if (s.anim) {
        var a = s.anim;
        for (i = 0; i < a.pos.length; i++) {
          var prog = clamp((a.t - i * 0.14) / 0.5, 0, 1);
          if (prog <= 0) continue;
          var e = easeOut(prog);
          var tgt = cellC(a.pos[i]);
          var mx = (srcX + tgt[0]) / 2, my = srcY + (tgt[1] - srcY) * 0.32 - 26;
          var col = a.mode === 'insert' ? P.accent : (a.hit[i] ? P.good : P.bad);
          ctx.save();
          ctx.strokeStyle = alpha(col, 0.5);
          ctx.lineWidth = 1.6;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(srcX, srcY + 16);
          var ex = (1 - e) * (1 - e) * srcX + 2 * (1 - e) * e * mx + e * e * tgt[0];
          var ey = (1 - e) * (1 - e) * (srcY + 16) + 2 * (1 - e) * e * my + e * e * tgt[1];
          // approximate partial quadratic by sampling
          ctx.beginPath();
          ctx.moveTo(srcX, srcY + 16);
          for (var t2 = 0.02; t2 <= e + 1e-9; t2 += 0.02) {
            var qx = (1 - t2) * (1 - t2) * srcX + 2 * (1 - t2) * t2 * mx + t2 * t2 * tgt[0];
            var qy = (1 - t2) * (1 - t2) * (srcY + 16) + 2 * (1 - t2) * t2 * my + t2 * t2 * tgt[1];
            ctx.lineTo(qx, qy);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          if (prog < 1) {
            ctx.beginPath();
            ctx.arc(ex, ey, 3.4, 0, Math.PI * 2);
            ctx.fillStyle = col;
            ctx.fill();
          }
          // label the hash
          if (prog > 0.15) {
            ctx.font = '9px ' + P.mono;
            ctx.fillStyle = alpha(col, 0.85);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('h' + (i + 1) + '=' + a.pos[i], mx, my + 12);
          }
          ctx.restore();
        }
      }

      /* Idle state: show faintly where the word currently in the box would
         land, so the top of the panel is never just empty space. */
      var preview = (!s.anim && s.word) ? positions(s.word, FM, FK) : null;
      if (preview) {
        ctx.save();
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = alpha(P.soft, 0.5);
        ctx.lineWidth = 1;
        for (i = 0; i < preview.length; i++) {
          var pt = cellC(preview[i]);
          var mmx = (srcX + pt[0]) / 2, mmy = srcY + (pt[1] - srcY) * 0.32 - 26;
          ctx.beginPath();
          ctx.moveTo(srcX, srcY + 16);
          ctx.quadraticCurveTo(mmx, mmy, pt[0], pt[1]);
          ctx.stroke();
        }
        ctx.restore();
        ctx.font = '9px ' + P.mono;
        ctx.fillStyle = P.soft;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('would set bits ' + preview.join(', '), srcX, srcY + 26);
      }

      // the bit grid
      for (i = 0; i < FM; i++) {
        var p = cellXY(i);
        var on = s.bits[i];
        rr(ctx, p[0], p[1], s.cw, s.ch, 3);
        ctx.fillStyle = on ? alpha(P.accent, 0.82) : P.off;
        ctx.fill();
        if (!on) {
          ctx.strokeStyle = P.edge;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (s.glow[i] > 0.02) {
          ctx.save();
          ctx.shadowColor = alpha(s.glowCol && s.glowCol[i] ? s.glowCol[i] : P.accent, 0.95 * s.glow[i]);
          ctx.shadowBlur = 16 * s.glow[i];
          rr(ctx, p[0], p[1], s.cw, s.ch, 3);
          ctx.fillStyle = alpha(s.glowCol && s.glowCol[i] ? s.glowCol[i] : P.accent, 0.95);
          ctx.fill();
          ctx.restore();
        }
        // index labels on wide layouts
        if (s.cw >= 22) {
          ctx.font = '8px ' + P.mono;
          ctx.fillStyle = on ? alpha(P.surface, 0.75) : alpha(P.soft, 0.5);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(i, p[0] + s.cw / 2, p[1] + s.ch / 2 + 0.5);
        }
      }
    }
  });

  if (filterW) {
    var fs = filterW.state;
    fs.glowCol = new Array(FM).fill(null);

    function fUpdate() {
      var set = 0;
      for (var i = 0; i < FM; i++) if (fs.bits[i]) set++;
      $('f-n').textContent = fs.inserted.length;
      $('f-bits').textContent = set;
      $('f-fill').textContent = Math.round(set / FM * 100) + '%';
      $('f-fpr').textContent = fmtPct(Math.pow(set / FM, FK));
      var bank = $('f-bank');
      bank.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('in', fs.inserted.indexOf(b.textContent) >= 0);
      });
    }

    function verdict(cls, text) {
      var v = $('f-verdict');
      v.className = 'verdict ' + (cls || '');
      $('f-verdict-t').textContent = text;
    }

    function doInsert(word) {
      word = (word || '').trim().toLowerCase();
      if (!word) return;
      var pos = positions(word, FM, FK);
      fs.word = word;
      fs.mode = 'insert';
      fs.anim = { t: 0, dur: 0.85, pos: pos, mode: 'insert', hit: [] };
      setTimeout(function () {
        pos.forEach(function (p, i) {
          setTimeout(function () {
            fs.bits[p] = 1;
            fs.glow[p] = 1;
            fs.glowCol[p] = P.accent;
            fUpdate();
          }, i * 120);
        });
      }, 380);
      if (fs.inserted.indexOf(word) < 0) fs.inserted.push(word);
      verdict('', 'Inserted "' + word + '". Bits ' + pos.join(', ') + ' are now 1.');
      setTimeout(fUpdate, 800);
    }

    function doQuery(word) {
      word = (word || '').trim().toLowerCase();
      if (!word) return;
      var pos = positions(word, FM, FK);
      var hit = pos.map(function (p) { return !!fs.bits[p]; });
      var all = hit.every(Boolean);
      var wasIn = fs.inserted.indexOf(word) >= 0;
      fs.word = word;
      fs.mode = 'query';
      fs.anim = { t: 0, dur: 0.85, pos: pos, mode: 'query', hit: hit };
      pos.forEach(function (p, i) {
        setTimeout(function () {
          fs.glow[p] = 1;
          fs.glowCol[p] = hit[i] ? P.good : P.bad;
        }, 380 + i * 120);
      });
      setTimeout(function () {
        if (!all) {
          verdict('no', '"' + word + '" is DEFINITELY NOT in the set. Bit ' +
            pos[hit.indexOf(false)] + ' is still 0.');
        } else if (wasIn) {
          verdict('yes', '"' + word + '" is PROBABLY in the set. All three bits are 1, and in this case it really was inserted.');
        } else {
          verdict('fp', 'False positive. "' + word + '" was never inserted, but bits ' +
            pos.join(', ') + ' were all set by other words.');
        }
      }, 380 + FK * 120);
    }

    $('f-insert').addEventListener('click', function () { doInsert($('f-input').value); });
    $('f-query').addEventListener('click', function () { doQuery($('f-input').value); });
    $('f-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doInsert($('f-input').value);
    });
    /* live preview of where whatever you are typing would land */
    $('f-input').addEventListener('input', function () {
      if (fs.anim) return;
      fs.word = this.value.trim().toLowerCase();
      fs.mode = null;
      filterW.render();
    });
    fs.word = ($('f-input').value || '').trim().toLowerCase();
    $('f-reset').addEventListener('click', function () {
      fs.bits = new Array(FM).fill(0);
      fs.glow = new Array(FM).fill(0);
      fs.glowCol = new Array(FM).fill(null);
      fs.inserted = [];
      fs.anim = null; fs.word = ''; fs.mode = null;
      verdict('', 'Cleared. Insert a few words, then query one you did not insert.');
      fUpdate();
      filterW.render();
    });
    $('f-findfp').addEventListener('click', function () {
      var found = null;
      for (var i = 0; i < WORDS.length; i++) {
        var word = WORDS[i];
        if (fs.inserted.indexOf(word) >= 0) continue;
        var pos = positions(word, FM, FK);
        if (pos.every(function (p) { return fs.bits[p]; })) { found = word; break; }
      }
      if (!found) {
        verdict('', 'No false positive in my word list yet. The array is only ' +
          Math.round(fs.bits.filter(Boolean).length / FM * 100) + '% full. Insert a few more and try again.');
        return;
      }
      $('f-input').value = found;
      doQuery(found);
    });

    // word bank
    var bankWords = ['strawberry', 'kestrel', 'obsidian', 'tensor', 'monsoon', 'cobalt', 'lantern', 'quartz', 'zephyr', 'walrus'];
    var bank = $('f-bank');
    bankWords.forEach(function (word) {
      var b = document.createElement('button');
      b.textContent = word;
      b.addEventListener('click', function () { $('f-input').value = word; doInsert(word); });
      bank.appendChild(b);
    });
    fUpdate();
  }

  /* ================================================================== *
   * 8. monotone proof widget
   * ================================================================== */

  var PM = 64, PK = 3;
  function proofGeom(w) {
    var pad = 20, cols = w < 420 ? 16 : 32, rows = PM / cols, gap = 5;
    var cw = (w - pad * 2 - (cols - 1) * gap) / cols;
    var ch = Math.min(cw, 22);
    return { pad: pad, cols: cols, rows: rows, gap: gap, cw: cw, ch: ch, gy: 58 };
  }

  var proofW = makeWidget($('cv-proof'), {
    height: function (w) {
      var g = proofGeom(w);
      return Math.round(g.gy + g.rows * g.ch + (g.rows - 1) * g.gap + 26);
    },
    init: function (w) { w.state = { n: 0 }; },
    draw: function (w, ctx) {
      var s = w.state;
      var g = proofGeom(w.W);
      var pad = g.pad, cols = g.cols, rows = g.rows, gap = g.gap, cw = g.cw, ch = g.ch, gy = g.gy;

      var bits = new Array(PM).fill(0);
      var tracked = positions('greenkey', PM, PK);
      var other = positions('pinkkey', PM, PK);
      tracked.forEach(function (p) { bits[p] = 1; });
      for (var i = 0; i < s.n; i++) {
        positions('filler' + i, PM, PK).forEach(function (p) { bits[p] = 1; });
      }
      var otherHit = other.every(function (p) { return bits[p]; });

      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.soft;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('BIT ARRAY, m = ' + PM + '   ·   ' + bits.filter(Boolean).length + ' SET', pad, 14);

      // legend markers
      ctx.textAlign = 'right';
      ctx.fillStyle = P.good;
      ctx.fillText('GREEN = INSERTED FIRST', w.W - pad, 14);
      ctx.fillStyle = P.hot;
      ctx.fillText('PINK = NEVER INSERTED', w.W - pad, 30);

      for (var j = 0; j < PM; j++) {
        var r = Math.floor(j / cols), c = j % cols;
        var x = pad + c * (cw + gap), y = gy + r * (ch + gap);
        var isT = tracked.indexOf(j) >= 0, isO = other.indexOf(j) >= 0;
        rr(ctx, x, y, cw, ch, 3);
        ctx.fillStyle = bits[j] ? alpha(P.accent, 0.75) : P.off;
        ctx.fill();
        if (!bits[j]) { ctx.strokeStyle = P.edge; ctx.lineWidth = 1; ctx.stroke(); }
        if (isT) {
          rr(ctx, x - 2, y - 2, cw + 4, ch + 4, 5);
          ctx.strokeStyle = P.good; ctx.lineWidth = 2; ctx.stroke();
        } else if (isO) {
          rr(ctx, x - 2, y - 2, cw + 4, ch + 4, 5);
          ctx.strokeStyle = alpha(P.hot, bits[j] ? 1 : 0.5);
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      var hp = $('p-hit'), fp = $('p-fp');
      if (hp) hp.textContent = 'yes';
      if (fp) fp.textContent = otherHit ? 'YES, false positive' : 'no';
      var fpPill = fp && fp.parentElement;
      if (fpPill) fpPill.style.opacity = otherHit ? '1' : '.55';
    }
  });
  if (proofW) {
    var pn = $('p-n');
    pn.addEventListener('input', function () {
      proofW.state.n = +pn.value;
      $('p-n-l').textContent = pn.value;
      proofW.render();
    });
    proofW.state.n = +pn.value;
  }

  /* ================================================================== *
   * 9. math playground
   * ================================================================== */

  function fprFormula(bpk, k) { return Math.pow(1 - Math.exp(-k / bpk), k); }
  function bestK(bpk) {
    var b = 1, bv = 1;
    for (var k = 1; k <= 40; k++) {
      var v = fprFormula(bpk, k);
      if (v < bv) { bv = v; b = k; }
    }
    return b;
  }

  var N_CHOICES = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9];

  var mathW = makeWidget($('cv-math'), {
    height: function (w) { return w < 560 ? 400 : 330; },
    init: function (w) { w.state = { bpk: 10, k: 7, n: 1e7 }; },
    draw: function (w, ctx) {
      var s = w.state;
      var stacked = w.W < 560;
      var gapx = 20;
      var leftW = stacked ? w.W : Math.round(w.W * 0.58) - gapx / 2;
      var leftH = stacked ? Math.round(w.H * 0.56) : w.H;

      /* --- left: fpr against k ---
         The y range follows the curve rather than being fixed, otherwise at
         high bits-per-key the interesting part collapses into the top inch. */
      var pad = { l: 58, r: 14, t: 20, b: 34 };
      var minv = 1;
      for (var kk = 1; kk <= 20; kk++) minv = Math.min(minv, fprFormula(s.bpk, kk));
      var lo = Math.pow(10, Math.floor(Math.log10(minv / 2.5)));
      var hi = Math.min(1, Math.pow(10, Math.ceil(Math.log10(fprFormula(s.bpk, 1) * 1.6))));
      var xs = makeScale('lin', [1, 20], pad.l, leftW - pad.r);
      var ys = makeScale('log', [lo, hi], leftH - pad.b, pad.t);
      var ticks = logTicks(lo, hi).map(function (v) {
        return { v: v, label: fmtPctTick(v) };
      });
      frame(ctx, { W: leftW, H: leftH }, {
        pad: pad, x: xs, y: ys,
        xTicks: [1, 5, 10, 15, 20], yTicks: ticks,
        xLabel: 'k, number of hash functions', xGrid: false
      });

      var pts = [];
      for (var k = 1; k <= 20; k += 0.25) pts.push([xs(k), ys(clamp(fprFormula(s.bpk, k), lo, hi))]);
      polyline(ctx, pts, P.accent, 2);

      var ko = bestK(s.bpk);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = alpha(P.good, 0.7);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(xs(ko), pad.t);
      ctx.lineTo(xs(ko), leftH - pad.b);
      ctx.stroke();
      ctx.restore();
      ctx.font = '9px ' + P.mono;
      ctx.fillStyle = P.good;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      haloText(ctx, 'best k = ' + ko, xs(ko), pad.t - 1);

      var cy = ys(clamp(fprFormula(s.bpk, s.k), lo, hi));
      dot(ctx, xs(s.k), cy, P.hot, 5);
      ctx.strokeStyle = alpha(P.hot, 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, cy);
      ctx.lineTo(xs(s.k), cy);
      ctx.stroke();

      /* --- right: what the array looks like --- */
      var rx = stacked ? 0 : leftW + gapx;
      var ry = stacked ? leftH + 10 : 0;
      var rw = stacked ? w.W : w.W - rx;
      var rh = stacked ? w.H - leftH - 10 : w.H;

      var fill = 1 - Math.exp(-s.k / s.bpk);
      var cols = 32, rows = 16, gp = 2;
      var avail = rw - 24;
      var cell = Math.max(1.5, Math.min((avail - (cols - 1) * gp) / cols,
                                        (rh - 62 - (rows - 1) * gp) / rows));
      var gw = cols * cell + (cols - 1) * gp;
      var gh = rows * cell + (rows - 1) * gp;
      var ox = rx + (rw - gw) / 2;
      var oy = ry + (rh - gh) / 2;   /* centred, not pinned to the top */

      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.soft;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('THE ARRAY AT ' + (fill * 100).toFixed(1) + '% FULL', rx + rw / 2, oy - 14);

      /* deterministic, so it does not shimmer while you drag the slider */
      for (var i = 0; i < cols * rows; i++) {
        var r2 = Math.floor(i / cols), c2 = i % cols;
        var x = ox + c2 * (cell + gp), y = oy + r2 * (cell + gp);
        rr(ctx, x, y, cell, cell, 2);
        ctx.fillStyle = rnd01(i) < fill ? alpha(P.accent, 0.8) : P.off;
        ctx.fill();
      }

      ctx.fillStyle = P.soft;
      ctx.font = '10px ' + P.mono;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('each square is one bit', rx + rw / 2, oy + gh + 12);
    }
  });

  if (mathW) {
    function mathSync() {
      var s = mathW.state;
      s.bpk = +$('m-bpk').value;
      s.k = +$('m-k').value;
      s.n = N_CHOICES[+$('m-n').value];
      $('m-bpk-l').textContent = s.bpk;
      $('m-k-l').textContent = s.k;
      $('m-n-l').textContent = fmtCount(s.n);
      var fpr = fprFormula(s.bpk, s.k);
      $('m-mem').textContent = fmtMB(s.bpk * s.n / 8 / 1048576);
      $('m-fill').textContent = ((1 - Math.exp(-s.k / s.bpk)) * 100).toFixed(1) + '%';
      $('m-fpr').textContent = fmtPct(fpr);
      $('m-kopt').textContent = bestK(s.bpk);
      $('m-oneIn').textContent = fpr > 0 ? Math.round(1 / fpr).toLocaleString() : '∞';
      mathW.render();
    }
    ['m-bpk', 'm-k', 'm-n'].forEach(function (id) {
      $(id).addEventListener('input', mathSync);
    });
    mathSync();
  }

  /* ================================================================== *
   * 10. tug of war
   * ================================================================== */

  var tugW = makeWidget($('cv-tug'), {
    height: function (w) { return w < 520 ? 260 : 300; },
    init: function (w) { w.state = { bpk: 10, k: 7 }; },
    draw: function (w, ctx) {
      var s = w.state;
      var pad = { l: 48, r: 46, t: 22, b: 40 };
      var xs = makeScale('lin', [1, 20], pad.l, w.W - pad.r);
      var ys = makeScale('lin', [0, 1], w.H - pad.b, pad.t);

      frame(ctx, w, {
        pad: pad, x: xs, y: ys,
        xTicks: [1, 5, 10, 15, 20],
        yTicks: [0, 0.25, 0.5, 0.75, 1].map(function (v) { return { v: v, label: v.toFixed(2) }; }),
        xLabel: 'k, number of hash functions'
      });

      var i, k;
      // curve A: fill ratio (rises with k) - "more bits get set"
      var a = [], b = [], c = [];
      var maxF = 0;
      for (k = 1; k <= 20; k += 0.2) maxF = Math.max(maxF, fprFormula(s.bpk, k));
      for (k = 1; k <= 20; k += 0.2) {
        var fill = 1 - Math.exp(-k / s.bpk);
        a.push([xs(k), ys(fill)]);
        // per-probe "hardness": chance a single probe finds a 0
        b.push([xs(k), ys(1 - fill)]);
        c.push([xs(k), ys(fprFormula(s.bpk, k) / maxF)]);
      }
      polyline(ctx, a, P.warn, 2);
      polyline(ctx, b, P.accent, 2);
      polyline(ctx, c, P.hot, 2.6);

      ctx.font = '10px ' + P.mono;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.warn;
      ctx.fillText('bits set', w.W - pad.r + 6, ys(1 - Math.exp(-20 / s.bpk)));
      ctx.fillStyle = P.accent;
      ctx.fillText('bits free', w.W - pad.r + 6, ys(Math.exp(-20 / s.bpk)));
      ctx.fillStyle = P.hot;
      ctx.fillText('FPR', w.W - pad.r + 6, ys(fprFormula(s.bpk, 20) / maxF));

      var ko = bestK(s.bpk);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = alpha(P.good, 0.8);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(xs(ko), pad.t);
      ctx.lineTo(xs(ko), w.H - pad.b);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.good;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      haloText(ctx, 'k* = ' + ko, xs(ko), pad.t - 2);

      // current k marker
      dot(ctx, xs(s.k), ys(fprFormula(s.bpk, s.k) / maxF), P.hot, 5);
      dot(ctx, xs(s.k), ys(1 - Math.exp(-s.k / s.bpk)), P.warn, 4, true);
      dot(ctx, xs(s.k), ys(Math.exp(-s.k / s.bpk)), P.accent, 4, true);

      ctx.font = '11px ' + P.mono;
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('k = ' + s.k + '  →  ' + fmtPct(fprFormula(s.bpk, s.k)), pad.l + 6, pad.t - 4);
    }
  });
  if (tugW) {
    function tugSync() {
      tugW.state.bpk = +$('t-bpk').value;
      tugW.state.k = +$('t-k').value;
      $('t-bpk-l').textContent = tugW.state.bpk;
      $('t-k-l').textContent = tugW.state.k;
      tugW.render();
    }
    $('t-bpk').addEventListener('input', tugSync);
    $('t-k').addEventListener('input', tugSync);
    tugSync();
  }

  /* ================================================================== *
   * 11. cache access cartoon
   * ================================================================== */

  var cacheW = makeWidget($('cv-cache'), {
    height: function (w) { return w < 520 ? 300 : 340; },
    init: function (w) {
      w.state = { k: 7, t: 99, auto: false, seedA: 3, seedB: 11 };
    },
    tick: function (w, dt) {
      var s = w.state;
      if (s.t < 4) { s.t += dt; return true; }
      if (s.auto) { s.t = 0; s.seedA = Math.random() * 1000 | 0; s.seedB = Math.random() * 1000 | 0; return true; }
      return false;
    },
    draw: function (w, ctx) {
      var s = w.state;
      var pad = 18;
      var half = (w.H - 30) / 2;
      var cols = w.W < 460 ? 12 : w.W < 620 ? 16 : 22;
      var rows = 4;

      function panel(oy, label, blocked, col) {
        var gy = oy + 26;
        var gap = 4;
        var cw = (w.W - pad * 2 - (cols - 1) * gap) / cols;
        var ch = clamp((half - 40 - (rows - 1) * gap) / rows, 8, 30);

        ctx.font = '10px ' + P.mono;
        ctx.fillStyle = P.soft;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, pad, oy + 4);

        var total = cols * rows;
        var touched = {};
        var seed = blocked ? s.seedB : s.seedA;
        var i;
        if (blocked) {
          var blk = (Math.imul(seed + 1, 2654435761) >>> 9) % total;
          touched[blk] = s.k;
        } else {
          var h = seed + 1;
          for (i = 0; i < s.k; i++) {
            h = Math.imul(h, 1664525) + 1013904223 >>> 0;
            var idx = h % total;
            touched[idx] = (touched[idx] || 0) + 1;
          }
        }

        var order = Object.keys(touched);
        for (i = 0; i < total; i++) {
          var r = Math.floor(i / cols), c = i % cols;
          var x = pad + c * (cw + gap), y = gy + r * (ch + gap);
          var hitAt = order.indexOf('' + i);
          var lit = hitAt >= 0;
          var reveal = lit ? clamp((s.t - 0.25 - (blocked ? 0 : hitAt * 0.14)) / 0.35, 0, 1) : 0;
          rr(ctx, x, y, cw, ch, 3);
          ctx.fillStyle = lit && reveal > 0 ? alpha(col, 0.2 + 0.7 * reveal) : P.off;
          ctx.fill();
          ctx.strokeStyle = lit && reveal > 0 ? alpha(col, 0.9) : P.edge;
          ctx.lineWidth = 1;
          ctx.stroke();
          if (lit && reveal > 0.1 && touched[i] > 1) {
            ctx.font = '9px ' + P.mono;
            ctx.fillStyle = P.surface;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('×' + touched[i], x + cw / 2, y + ch / 2);
          }
          if (lit && reveal > 0 && reveal < 1) {
            ctx.save();
            ctx.shadowColor = alpha(col, 0.9);
            ctx.shadowBlur = 14;
            rr(ctx, x, y, cw, ch, 3);
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
          }
        }

        var n = order.filter(function (idx) {
          var hitAt2 = order.indexOf(idx);
          return clamp((s.t - 0.25 - (blocked ? 0 : hitAt2 * 0.14)) / 0.35, 0, 1) > 0;
        }).length;

        ctx.font = '600 11px ' + P.mono;
        ctx.fillStyle = col;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(n + ' cache line' + (n === 1 ? '' : 's') + ' touched', w.W - pad, oy + 4);
        return order.length;
      }

      var a = panel(0, 'CLASSIC · k probes anywhere in m bits', false, P.accent);
      var b = panel(half + 18, 'BLOCKED · all k probes in one line', true, P.good);
      var la = $('c-lines-a'), lb = $('c-lines-b');
      if (la) la.textContent = a;
      if (lb) lb.textContent = b;
    }
  });
  if (cacheW) {
    $('c-run').addEventListener('click', function () {
      cacheW.state.t = 0;
      cacheW.state.seedA = Math.random() * 1000 | 0;
      cacheW.state.seedB = Math.random() * 1000 | 0;
      cacheW.render();
    });
    $('c-auto').addEventListener('click', function () {
      cacheW.state.auto = !cacheW.state.auto;
      this.textContent = cacheW.state.auto ? 'Stop' : 'Loop';
    });
    $('c-k').addEventListener('input', function () {
      cacheW.state.k = +this.value;
      $('c-k-l').textContent = this.value;
      cacheW.state.t = 0;
      cacheW.render();
    });
  }

  /* ================================================================== *
   * 12. counting filter
   * ================================================================== */

  var CM = 48, CK = 3;
  function countGeom(w) {
    var pad = 20, cols = w < 430 ? 12 : 24, rows = CM / cols, gap = 6;
    var cw = (w - pad * 2 - (cols - 1) * gap) / cols;
    var ch = Math.min(cw, 34);
    return { pad: pad, cols: cols, rows: rows, gap: gap, cw: cw, ch: ch, gy: 54 };
  }

  var countW = makeWidget($('cv-count'), {
    height: function (w) {
      var g = countGeom(w);
      return Math.round(g.gy + g.rows * g.ch + (g.rows - 1) * g.gap + 22);
    },
    init: function (w) { w.state = { counts: new Array(CM).fill(0), keys: [], flash: {} }; },
    draw: function (w, ctx) {
      var s = w.state;
      var g = countGeom(w.W);
      var pad = g.pad, cols = g.cols, rows = g.rows, gap = g.gap, cw = g.cw, ch = g.ch, gy = g.gy;

      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.soft;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('4-BIT COUNTERS, m = ' + CM, pad, 16);
      ctx.textAlign = 'right';
      ctx.fillText(s.keys.length + ' KEYS STORED', w.W - pad, 16);

      for (var i = 0; i < CM; i++) {
        var r = Math.floor(i / cols), c = i % cols;
        var x = pad + c * (cw + gap), y = gy + r * (ch + gap);
        var v = s.counts[i];
        rr(ctx, x, y, cw, ch, 4);
        ctx.fillStyle = v > 0 ? alpha(P.accent, 0.18 + 0.24 * Math.min(v, 3)) : P.off;
        ctx.fill();
        ctx.strokeStyle = v > 0 ? alpha(P.accent, 0.6) : P.edge;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = '600 ' + Math.max(9, Math.min(13, ch * 0.45)) + 'px ' + P.mono;
        ctx.fillStyle = v > 0 ? P.acc2 : alpha(P.soft, 0.4);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(v, x + cw / 2, y + ch / 2 + 0.5);
      }
    }
  });
  if (countW) {
    var ctCount = 0;
    function ctSync() {
      $('ct-n').textContent = countW.state.keys.length;
      $('ct-used').textContent = countW.state.counts.filter(function (v) { return v > 0; }).length;
      countW.render();
    }
    $('ct-add').addEventListener('click', function () {
      var word = WORDS[(ctCount * 37 + 5) % WORDS.length];
      ctCount++;
      countW.state.keys.push(word);
      positions(word, CM, CK).forEach(function (p) {
        countW.state.counts[p] = Math.min(15, countW.state.counts[p] + 1);
      });
      ctSync();
    });
    $('ct-del').addEventListener('click', function () {
      var word = countW.state.keys.pop();
      if (!word) return;
      positions(word, CM, CK).forEach(function (p) {
        countW.state.counts[p] = Math.max(0, countW.state.counts[p] - 1);
      });
      ctSync();
    });
    $('ct-reset').addEventListener('click', function () {
      countW.state.counts = new Array(CM).fill(0);
      countW.state.keys = [];
      ctCount = 0;
      ctSync();
    });
    ctSync();
  }

  /* ================================================================== *
   * 13. charts from the benchmark data
   * ================================================================== */

  if (!D) return;
  buildFigures();

  /* ---- 13a. fpr against k ---- */
  var chartK = makeWidget($('cv-chart-k'), {
    height: function (w) { return w < 520 ? 300 : 330; },
    draw: function (w, ctx) {
      var rows = D.fpr_vs_k;
      var pad = { l: 52, r: 50, t: 30, b: 42 };
      var lo = 0.005, hi = 0.15;
      var xs = makeScale('lin', [1, 14], pad.l, w.W - pad.r);
      var ys = makeScale('log', [lo, hi], w.H - pad.b, pad.t);
      var maxNs = 0;
      rows.forEach(function (r) { maxNs = Math.max(maxNs, r.ns_per_negative_lookup); });
      var ns2 = makeScale('lin', [0, Math.ceil(maxNs / 5) * 5], w.H - pad.b, pad.t);

      frame(ctx, w, {
        pad: pad, x: xs, y: ys,
        xTicks: [1, 2, 4, 6, 7, 8, 10, 12, 14],
        yTicks: [0.005, 0.01, 0.02, 0.05, 0.1].map(function (v) { return { v: v, label: (v * 100) + '%' }; }),
        xLabel: 'k, number of hash functions'
      });

      // right axis for ns
      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.warn;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      [0, 5, 10, 15].forEach(function (v) {
        if (v > ns2.domain[1]) return;
        ctx.fillText(v + ' ns', w.W - pad.r + 6, ns2(v));
      });

      var theory = [], meas = [], nsline = [], pts = [];
      rows.forEach(function (r) {
        theory.push([xs(r.k), ys(clamp(r.fpr_textbook, lo, hi))]);
        meas.push([xs(r.k), ys(clamp(r.fpr, lo, hi))]);
        nsline.push([xs(r.k), ns2(r.ns_per_negative_lookup)]);
        pts.push({ px: xs(r.k), py: ys(clamp(r.fpr, lo, hi)), r: r });
      });
      /* The formula sits underneath the measurement almost exactly, so draw
         it as a wide soft band rather than a hairline that vanishes behind
         the data. The overlap IS the result. */
      polyline(ctx, theory, alpha(P.soft, 0.45), 7);
      polyline(ctx, nsline, P.warn, 1.8);
      polyline(ctx, meas, P.accent, 2.4);
      rows.forEach(function (r, i) {
        dot(ctx, meas[i][0], meas[i][1], P.accent, r.k === 7 ? 5.5 : 3.6, r.k !== 7);
        dot(ctx, nsline[i][0], nsline[i][1], P.warn, 2.6);
      });

      var best = rows.reduce(function (a, b) { return b.fpr < a.fpr ? b : a; });
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = alpha(P.good, 0.6);
      ctx.beginPath();
      ctx.moveTo(xs(best.k), pad.t);
      ctx.lineTo(xs(best.k), w.H - pad.b);
      ctx.stroke();
      ctx.restore();
      ctx.font = '9px ' + P.mono;
      ctx.fillStyle = P.good;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      haloText(ctx, 'measured minimum', xs(best.k), 6);

      var h = nearest(pts, w.state.mx, w.state.my);
      if (h) {
        dot(ctx, h.px, h.py, P.accent, 6);
        tooltip(ctx, w, h.px, h.py, [
          'k = ' + h.r.k,
          'measured  ' + fmtPct(h.r.fpr),
          'formula   ' + fmtPct(h.r.fpr_textbook),
          'lookup    ' + fmtNum(h.r.ns_per_negative_lookup, 2) + ' ns',
          'fill      ' + (h.r.fill_ratio * 100).toFixed(1) + '%'
        ], P.accent);
      }
    }
  });
  if (chartK) hoverable(chartK);

  /* ---- 13b. the lower bound ---- */
  var chartBound = makeWidget($('cv-chart-bound'), {
    height: function (w) { return w < 520 ? 290 : 320; },
    draw: function (w, ctx) {
      var rows = D.small_filters.rows;
      var pad = { l: 70, r: 16, t: 20, b: 44 };
      var xs = makeScale('log', [rows[0].m_bits, rows[rows.length - 1].m_bits], pad.l, w.W - pad.r);
      var lo = 0.0055, hi = 0.0095;
      var ys = makeScale('lin', [lo, hi], w.H - pad.b, pad.t);

      frame(ctx, w, {
        pad: pad, x: xs, y: ys,
        xTicks: rows.map(function (r) { return { v: r.m_bits, label: '' + r.m_bits }; }),
        yTicks: [0.006, 0.007, 0.008, 0.009].map(function (v) { return { v: v, label: (v * 100).toFixed(1) + '%' }; }),
        xLabel: 'm, size of the filter in bits',
        yLabel: 'false positive rate'
      });

      var tb = [], ex = [], me = [], pts = [];
      rows.forEach(function (r) {
        tb.push([xs(r.m_bits), ys(clamp(r.textbook, lo, hi))]);
        ex.push([xs(r.m_bits), ys(clamp(r.exact, lo, hi))]);
        me.push([xs(r.m_bits), ys(clamp(r.measured_independent, lo, hi))]);
        pts.push({ px: xs(r.m_bits), py: ys(clamp(r.measured_independent, lo, hi)), r: r });
      });

      // shade the gap
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tb[0][0], tb[0][1]);
      for (var i = 1; i < tb.length; i++) ctx.lineTo(tb[i][0], tb[i][1]);
      for (i = ex.length - 1; i >= 0; i--) ctx.lineTo(ex[i][0], ex[i][1]);
      ctx.closePath();
      ctx.fillStyle = alpha(P.hot, 0.12);
      ctx.fill();
      ctx.restore();

      polyline(ctx, tb, P.soft, 1.8, [5, 4]);
      polyline(ctx, ex, P.accent, 2.2);
      polyline(ctx, me, P.hot, 0);
      rows.forEach(function (r, i2) {
        dot(ctx, ex[i2][0], ex[i2][1], P.accent, 3.4);
        dot(ctx, me[i2][0], me[i2][1], P.hot, 5, true);
      });

      /* Park the annotation in the empty top-left corner rather than on top
         of the curves, and run a leader line down to the gap it describes. */
      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.hot;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      var anX = xs(rows[0].m_bits) + 8, anY = ys(hi - (hi - lo) * 0.12);
      var gapX = xs(rows[1].m_bits), gapY = (tb[1][1] + ex[1][1]) / 2;
      ctx.save();
      ctx.strokeStyle = alpha(P.hot, 0.4);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(anX + 4, anY + 8);
      ctx.lineTo(gapX, gapY - 3);
      ctx.stroke();
      ctx.restore();
      haloText(ctx, 'the gap Jensen predicts', anX, anY);

      var h = nearest(pts, w.state.mx, w.state.my);
      if (h) {
        tooltip(ctx, w, h.px, h.py, [
          'm = ' + h.r.m_bits + ' bits, n = ' + h.r.n,
          'measured  ' + fmtPct(h.r.measured_independent),
          'exact     ' + fmtPct(h.r.exact),
          'textbook  ' + fmtPct(h.r.textbook),
          'textbook is ' + fmtNum((h.r.exact - h.r.textbook) / h.r.textbook * 100, 1) + '% low'
        ], P.hot);
      }
    }
  });
  if (chartBound) hoverable(chartBound);

  /* ---- 13c. fpr against bits per key ---- */
  var chartFpr = makeWidget($('cv-chart-fpr'), {
    height: function (w) { return w < 520 ? 320 : 360; },
    draw: function (w, ctx) {
      var rows = D.fpr_vs_bits;
      var pad = { l: 70, r: 16, t: 18, b: 44 };
      var lo = 5e-6, hi = 0.5;
      var xs = makeScale('lin', [2, 24], pad.l, w.W - pad.r);
      var ys = makeScale('log', [lo, hi], w.H - pad.b, pad.t);

      frame(ctx, w, {
        pad: pad, x: xs, y: ys,
        xTicks: [2, 4, 6, 8, 10, 12, 14, 16, 20, 24],
        yTicks: logTicks(lo, hi).map(function (v) { return { v: v, label: fmtPctTick(v) }; }),
        xLabel: 'bits per key (m/n)',
        yLabel: 'false positive rate'
      });

      var series = [
        { key: 'fpr_classic', col: P.accent, name: 'classic' },
        { key: 'fpr_blocked', col: P.good, name: 'blocked' },
        { key: 'fpr_register', col: P.warn, name: 'register' }
      ];
      /* Same treatment as the k chart: a soft wide band, because the classic
         line lands on top of it and a hairline would simply disappear. */
      var th = rows.map(function (r) { return [xs(r.bits_per_key), ys(clamp(r.fpr_textbook, lo, hi))]; });
      polyline(ctx, th, alpha(P.soft, 0.4), 8);

      var pts = [];
      series.forEach(function (s) {
        var line = rows.map(function (r) { return [xs(r.bits_per_key), ys(clamp(r[s.key], lo, hi))]; });
        polyline(ctx, line, s.col, 2.2);
        rows.forEach(function (r, i) {
          dot(ctx, line[i][0], line[i][1], s.col, 3.8);
          pts.push({ px: line[i][0], py: line[i][1], r: r, s: s });
        });
      });

      var h = nearest(pts, w.state.mx, w.state.my);
      if (h) {
        dot(ctx, h.px, h.py, h.s.col, 6);
        tooltip(ctx, w, h.px, h.py, [
          h.s.name + ' at ' + h.r.bits_per_key + ' bits/key',
          'k = ' + h.r.k,
          'measured  ' + fmtPct(h.r[h.s.key]),
          'formula   ' + fmtPct(h.r.fpr_textbook),
          h.r.queries.toLocaleString() + ' probes'
        ], h.s.col);
      }
    }
  });
  if (chartFpr) hoverable(chartFpr);

  /* ---- 13d. size sweep ---- */
  var chartSize = makeWidget($('cv-chart-size'), {
    height: function (w) { return w < 520 ? 320 : 360; },
    draw: function (w, ctx) {
      var rows = D.size_sweep.rows;
      var pad = { l: 68, r: 18, t: 22, b: 46 };
      var xs = makeScale('log', [rows[0].n, rows[rows.length - 1].n], pad.l, w.W - pad.r);
      var maxY = 0;
      rows.forEach(function (r) {
        ['classic', 'blocked', 'register', 'hashset'].forEach(function (k) { maxY = Math.max(maxY, r.neg_ns[k]); });
      });
      maxY = Math.ceil(maxY / 10) * 10;
      var ys = makeScale('lin', [0, maxY], w.H - pad.b, pad.t);

      frame(ctx, w, {
        pad: pad, x: xs, y: ys,
        xTicks: rows.map(function (r) { return { v: r.n, label: fmtCount(r.n) }; }),
        yTicks: [0, 10, 20, 30, 40, 50].filter(function (v) { return v <= maxY; })
          .map(function (v) { return { v: v, label: v + ' ns' }; }),
        xLabel: 'keys stored',
        yLabel: 'nanoseconds per negative lookup'
      });

      // mark where the structures stop fitting in L2
      var l2 = D.meta.l2_bytes;
      var nL2set = l2 / 32;   /* hash set: ~32 bytes per key at this load */
      var nL2f = l2 / 1.25;   /* filter: 10 bits per key */
      [[nL2set, 'hash set leaves L2', P.bad], [nL2f, 'filter leaves L2', P.accent]].forEach(function (mk) {
        if (mk[0] < xs.domain[0] || mk[0] > xs.domain[1]) return;
        var x = xs(mk[0]);
        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = alpha(mk[2], 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, w.H - pad.b);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.font = '9px ' + P.mono;
        ctx.fillStyle = alpha(mk[2], 0.9);
        /* sit clear of the dashed rule, not on top of it */
        ctx.translate(x - 9, pad.t + 4);
        ctx.rotate(Math.PI / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        haloText(ctx, mk[1], 0, 0);
        ctx.restore();
      });

      var series = [
        { key: 'hashset', col: P.bad, name: 'exact hash set' },
        { key: 'classic', col: P.accent, name: 'classic' },
        { key: 'blocked', col: P.good, name: 'blocked' },
        { key: 'register', col: P.warn, name: 'register-blocked' }
      ];
      var pts = [];
      series.forEach(function (s) {
        var line = rows.map(function (r) { return [xs(r.n), ys(r.neg_ns[s.key])]; });
        polyline(ctx, line, s.col, 2.2);
        rows.forEach(function (r, i) {
          dot(ctx, line[i][0], line[i][1], s.col, 3.6);
          pts.push({ px: line[i][0], py: line[i][1], r: r, s: s });
        });
      });

      var h = nearest(pts, w.state.mx, w.state.my);
      if (h) {
        dot(ctx, h.px, h.py, h.s.col, 6);
        tooltip(ctx, w, h.px, h.py, [
          h.s.name + ', n = ' + h.r.n.toLocaleString(),
          'negative  ' + fmtNum(h.r.neg_ns[h.s.key], 2) + ' ns',
          'positive  ' + fmtNum(h.r.pos_ns[h.s.key], 2) + ' ns',
          'memory    ' + fmtMB(h.r.bytes[h.s.key] / 1048576),
          'hash only ' + fmtNum(h.r.neg_ns.hash_only, 2) + ' ns'
        ], h.s.col);
      }
    }
  });
  if (chartSize) hoverable(chartSize);

  /* ---- 13e. cache sweep ---- */
  var chartCache = makeWidget($('cv-chart-cache'), {
    height: function (w) { return w < 520 ? 290 : 330; },
    draw: function (w, ctx) {
      var rows = D.cache_sweep.rows;
      var pad = { l: 68, r: 18, t: 22, b: 44 };
      var maxY = 0;
      rows.forEach(function (r) { maxY = Math.max(maxY, r.ns_classic, r.ns_blocked); });
      maxY = Math.ceil(maxY / 5) * 5;
      var xs = makeScale('lin', [1, rows.length], pad.l, w.W - pad.r);
      var ys = makeScale('lin', [0, maxY], w.H - pad.b, pad.t);

      frame(ctx, w, {
        pad: pad, x: xs, y: ys,
        xTicks: rows.map(function (r) { return { v: r.k, label: '' + r.k }; }),
        yTicks: [0, 5, 10, 15, 20, 25, 30].filter(function (v) { return v <= maxY; })
          .map(function (v) { return { v: v, label: v + ' ns' }; }),
        xLabel: 'k, probes per lookup',
        yLabel: 'nanoseconds per positive lookup'
      });

      var a = rows.map(function (r) { return [xs(r.k), ys(r.ns_classic)]; });
      var b = rows.map(function (r) { return [xs(r.k), ys(r.ns_blocked)]; });

      // shade the win
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a[0][0], a[0][1]);
      for (var i = 1; i < a.length; i++) ctx.lineTo(a[i][0], a[i][1]);
      for (i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i][0], b[i][1]);
      ctx.closePath();
      ctx.fillStyle = alpha(P.good, 0.1);
      ctx.fill();
      ctx.restore();

      polyline(ctx, a, P.accent, 2.4);
      polyline(ctx, b, P.good, 2.4);

      var pts = [];
      rows.forEach(function (r, i2) {
        dot(ctx, a[i2][0], a[i2][1], P.accent, 3.6);
        dot(ctx, b[i2][0], b[i2][1], P.good, 3.6);
        pts.push({ px: a[i2][0], py: a[i2][1], r: r });
        pts.push({ px: b[i2][0], py: b[i2][1], r: r });
      });

      // annotate the per-probe slope
      var slope = (rows[rows.length - 1].ns_classic - rows[0].ns_classic) / (rows.length - 1);
      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.soft;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      haloText(ctx, 'classic costs ~' + fmtNum(slope, 1) + ' ns per extra probe', w.W - pad.r - 6, w.H - pad.b - 20);
      haloText(ctx, 'a DRAM round trip on this machine is ~80 ns', w.W - pad.r - 6, w.H - pad.b - 6);

      var h = nearest(pts, w.state.mx, w.state.my);
      if (h) {
        tooltip(ctx, w, h.px, h.py, [
          'k = ' + h.r.k,
          'classic  ' + fmtNum(h.r.ns_classic, 2) + ' ns',
          'blocked  ' + fmtNum(h.r.ns_blocked, 2) + ' ns',
          'blocked wins ' + fmtNum((h.r.ns_classic - h.r.ns_blocked) / h.r.ns_classic * 100, 1) + '%'
        ], P.accent);
      }
    }
  });
  if (chartCache) hoverable(chartCache);

  /* ---- 13f. block size sweep ---- */
  var chartBlock = makeWidget($('cv-chart-block'), {
    height: function (w) { return w < 520 ? 300 : 330; },
    draw: function (w, ctx) {
      var rows = D.block_size_sweep.rows;
      var pad = { l: 68, r: 54, t: 22, b: 46 };
      var maxF = 0, maxNs = 0;
      rows.forEach(function (r) { maxF = Math.max(maxF, r.fpr); maxNs = Math.max(maxNs, r.neg_ns); });
      maxF = Math.ceil(maxF * 1000) / 1000;
      maxNs = Math.ceil(maxNs / 5) * 5;
      var L = pad.l, R = w.W - pad.r, T = pad.t, B = w.H - pad.b;
      var ys = makeScale('lin', [0, maxF], B, T);
      var ns2 = makeScale('lin', [0, maxNs], B, T);
      var bw = (R - L) / rows.length;

      frame(ctx, w, {
        pad: pad, x: function (i) { return L + bw * (i + 0.5); }, y: ys,
        xTicks: [], yTicks: [0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03].filter(function (v) { return v <= maxF; })
          .map(function (v) { return { v: v, label: (v * 100).toFixed(1) + '%' }; }),
        yLabel: 'false positive rate',
        xLabel: 'block size'
      });

      var pts = [];
      rows.forEach(function (r, i) {
        var x = L + bw * i + bw * 0.18, ww = bw * 0.64;
        var y = ys(r.fpr);
        var isLine = r.block_bytes === D.block_size_sweep.cache_line_bytes;
        rr(ctx, x, y, ww, B - y, 4);
        ctx.fillStyle = isLine ? alpha(P.good, 0.7) : alpha(P.accent, 0.55);
        ctx.fill();
        ctx.font = '9px ' + P.mono;
        ctx.fillStyle = P.soft;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(r.block_bits, L + bw * (i + 0.5), B + 7);
        ctx.fillText(r.block_bytes + 'B', L + bw * (i + 0.5), B + 19);
        pts.push({ px: L + bw * (i + 0.5), py: y, r: r });
      });

      var line = rows.map(function (r, i) { return [L + bw * (i + 0.5), ns2(r.neg_ns)]; });
      polyline(ctx, line, P.warn, 2);
      rows.forEach(function (r, i) { dot(ctx, line[i][0], line[i][1], P.warn, 3.4); });

      ctx.font = '10px ' + P.mono;
      ctx.fillStyle = P.warn;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      [0, 5, 10, 15, 20].filter(function (v) { return v <= maxNs; }).forEach(function (v) {
        ctx.fillText(v + ' ns', R + 6, ns2(v));
      });

      // call out the cache line
      var lineIdx = -1;
      rows.forEach(function (r, i) { if (r.block_bytes === D.block_size_sweep.cache_line_bytes) lineIdx = i; });
      if (lineIdx >= 0) {
        ctx.font = '9px ' + P.mono;
        ctx.fillStyle = P.good;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        haloText(ctx, 'one cache line', L + bw * (lineIdx + 0.5), ys(rows[lineIdx].fpr) - 6);
      }

      var h = nearest(pts, w.state.mx, w.state.my, 40);
      if (h) {
        tooltip(ctx, w, h.px, h.py, [
          h.r.block_bits + '-bit block (' + h.r.block_bytes + ' bytes)',
          'false positives  ' + fmtPct(h.r.fpr),
          'negative lookup  ' + fmtNum(h.r.neg_ns, 2) + ' ns',
          'positive lookup  ' + fmtNum(h.r.pos_ns, 2) + ' ns'
        ], P.good);
      }
    }
  });
  if (chartBlock) hoverable(chartBlock);

  /* ================================================================== *
   * 14. tables and headline stats
   * ================================================================== */

  var tblD = $('tbl-double');
  if (tblD) {
    var tb = tblD.querySelector('tbody');
    D.double_vs_independent.forEach(function (r) {
      var dRel = (r.fpr_double - r.fpr_independent) / r.fpr_independent * 100;
      var speed = (r.ns_independent - r.ns_double) / r.ns_independent * 100;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + r.bits_per_key + '</td>' +
        '<td>' + r.k + '</td>' +
        '<td><b>' + fmtPct(r.fpr_double) + '</b> <span style="opacity:.6">' + fmtNum(r.ns_double, 1) + ' ns</span></td>' +
        '<td>' + fmtPct(r.fpr_independent) + ' <span style="opacity:.6">' + fmtNum(r.ns_independent, 1) + ' ns</span></td>' +
        '<td>' + (dRel >= 0 ? '+' : '') + fmtNum(dRel, 1) + '%</td>' +
        '<td style="color:var(--good)">' + fmtNum(speed, 0) + '% faster</td>';
      tb.appendChild(tr);
    });
  }

  var tblM = $('tbl-mem');
  if (tblM) {
    var tbm = tblM.querySelector('tbody');
    D.memory.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (r.detail.indexOf('10 bits') === 0) tr.className = 'hi';
      tr.innerHTML =
        '<td>' + r.what + ' <span style="opacity:.6">' + r.detail + '</span></td>' +
        '<td>' + fmtNum(r.bits_per_key, 1) + '</td>' +
        '<td><b>' + fmtMB(r.total_mb) + '</b></td>' +
        '<td>' + (r.exact ? '<span style="color:var(--good)">none</span>' : fmtPct(r.fpr)) + '</td>';
      tbm.appendChild(tr);
    });
  }

  var statsEl = $('stats-headline');
  if (statsEl) {
    var last = D.size_sweep.rows[D.size_sweep.rows.length - 1];
    var b10 = memRow('bloom filter', '10 bits');
    var setr = memRow('open-addressed hash set');
    var cards = [
      { k: 'memory, 10M keys', v: fmtMB(b10.total_mb), d: 'against ' + fmtMB(setr.total_mb) + ' for the exact set' },
      { k: 'false positives', v: fmtPct(bitsRow(10).fpr_classic), d: 'measured at 10 bits per key, k = 7' },
      { k: 'negative lookup', v: fmtNum(last.neg_ns.blocked, 1) + ' ns', d: 'blocked filter, ' + fmtCount(last.n) + ' keys' },
      { k: 'the exact set', v: fmtNum(last.neg_ns.hashset, 1) + ' ns', d: 'same workload, ' + fmtMB(last.bytes.hashset / 1048576) }
    ];
    cards.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = '<div class="k">' + c.k + '</div><div class="v">' + c.v + '</div><div class="d">' + c.d + '</div>';
      statsEl.appendChild(d);
    });
  }

  /* first paint */
  refitAll();
  window.addEventListener('load', refitAll);
})();
