// Small canvas helpers shared by the teaching widgets.

/** Size a canvas for the device pixel ratio and return a ready 2D context. */
export function fitCanvas(canvas, cssHeight) {
  if (cssHeight) canvas.style.height = cssHeight + 'px';
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

let _cache = null, _cacheKey = '';
/** Current theme colours, read from the CSS custom properties. */
export function theme() {
  const key = document.documentElement.dataset.theme || 'auto';
  const dark = key === 'dark'
    || (key === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const k = key + dark;
  if (_cache && _cacheKey === k) return _cache;
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  _cache = {
    dark,
    surface: v('--surface-1'),
    surface2: v('--surface-2'),
    border: v('--border'),
    text: v('--text-primary'),
    text2: v('--text-secondary'),
    muted: v('--text-muted'),
    classical: v('--classical'),
    neural: v('--neural'),
    good: v('--good'),
    danger: v('--danger'),
    violet: v('--violet'),
    grid: dark ? 'rgba(255,255,255,0.09)' : 'rgba(11,11,11,0.08)',
    axis: dark ? 'rgba(255,255,255,0.35)' : 'rgba(11,11,11,0.35)',
  };
  _cacheKey = k;
  return _cache;
}

/**
 * A minimal 2D line plot: axes, gridlines, curves, markers.
 * All data coordinates; the plot handles the mapping to pixels.
 */
export class Plot {
  constructor(ctx, w, h, opts = {}) {
    this.ctx = ctx; this.w = w; this.h = h;
    this.pad = Object.assign({ l: 52, r: 16, t: 14, b: 34 }, opts.pad);
    this.xMin = opts.xMin ?? 0; this.xMax = opts.xMax ?? 1;
    this.yMin = opts.yMin ?? 0; this.yMax = opts.yMax ?? 1;
    this.t = theme();
  }
  x(v) {
    return this.pad.l + (v - this.xMin) / (this.xMax - this.xMin)
      * (this.w - this.pad.l - this.pad.r);
  }
  y(v) {
    return this.h - this.pad.b - (v - this.yMin) / (this.yMax - this.yMin)
      * (this.h - this.pad.t - this.pad.b);
  }
  get plotW() { return this.w - this.pad.l - this.pad.r; }
  get plotH() { return this.h - this.pad.t - this.pad.b; }

  axes({ xTicks = [], yTicks = [], xLabel = '', yLabel = '', xFmt, yFmt } = {}) {
    const { ctx, t } = this;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.strokeStyle = t.grid; ctx.lineWidth = 1;
    ctx.fillStyle = t.muted;

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yTicks) {
      const y = this.y(v);
      ctx.beginPath(); ctx.moveTo(this.pad.l, y); ctx.lineTo(this.w - this.pad.r, y);
      ctx.stroke();
      ctx.fillText(yFmt ? yFmt(v) : String(v), this.pad.l - 7, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xTicks) {
      const x = this.x(v);
      ctx.beginPath(); ctx.moveTo(x, this.pad.t); ctx.lineTo(x, this.h - this.pad.b);
      ctx.stroke();
      ctx.fillText(xFmt ? xFmt(v) : String(v), x, this.h - this.pad.b + 6);
    }
    ctx.fillStyle = t.text2;
    if (xLabel) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(xLabel, this.pad.l + this.plotW / 2, this.h - 2);
    }
    if (yLabel) {
      ctx.save();
      // Anchor to this plot's left edge, not the canvas edge -- widgets that
      // put a picture beside the chart have a large left pad.
      ctx.translate(Math.max(11, this.pad.l - 40), this.pad.t + this.plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }
  }

  /** Horizontal or vertical reference line. */
  rule(value, { axis = 'y', color, dash = [4, 4], label, labelAlign = 'left' } = {}) {
    const { ctx, t } = this;
    ctx.strokeStyle = color || t.axis; ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.beginPath();
    if (axis === 'y') {
      const y = this.y(value);
      ctx.moveTo(this.pad.l, y); ctx.lineTo(this.w - this.pad.r, y);
    } else {
      const x = this.x(value);
      ctx.moveTo(x, this.pad.t); ctx.lineTo(x, this.h - this.pad.b);
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (label) {
      ctx.fillStyle = color || t.text2;
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      if (axis === 'y') {
        ctx.textAlign = labelAlign === 'right' ? 'right' : 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, labelAlign === 'right' ? this.w - this.pad.r - 4
                                                   : this.pad.l + 5, this.y(value) - 3);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(label, this.x(value), this.pad.t + 2);
      }
    }
  }

  clip(fn) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.pad.l, this.pad.t, this.plotW, this.plotH);
    ctx.clip();
    fn();
    ctx.restore();
  }

  /** points: array of [x, y] in data coordinates. */
  line(points, color, { width = 2, dash = null } = {}) {
    const { ctx } = this;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    let started = false;
    for (const [px, py] of points) {
      if (!Number.isFinite(py)) { started = false; continue; }
      const sx = this.x(px), sy = this.y(py);
      if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  /** Sample a function across the x range. */
  fn(f, color, opts = {}, n = 300) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = this.xMin + (this.xMax - this.xMin) * i / n;
      pts.push([x, f(x)]);
    }
    this.line(pts, color, opts);
  }

  dot(x, y, color, r = 5, ring = true) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(this.x(x), this.y(y), r, 0, Math.PI * 2); ctx.fill();
    if (ring) {
      ctx.strokeStyle = this.t.surface; ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  label(x, y, text, color, { align = 'left', baseline = 'middle', dy = 0,
                             weight = '600' } = {}) {
    const { ctx } = this;
    ctx.font = `${weight} 12px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align; ctx.textBaseline = baseline;
    ctx.fillText(text, this.x(x), this.y(y) + dy);
  }
}

/** An arrow, for force vectors. Coordinates in pixels. */
export function arrow(ctx, x0, y0, x1, y1, color, width = 3) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len, uy = dy / len;
  const head = Math.min(11, len * 0.45);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.42, y1 - uy * head + ux * head * 0.42);
  ctx.lineTo(x1 - ux * head + uy * head * 0.42, y1 - uy * head - ux * head * 0.42);
  ctx.closePath(); ctx.fill();
}

/** A shaded sphere, the standard atom look used across all the widgets. */
export function atom(ctx, x, y, r, rgb, { alpha = 1, ring = null } = {}) {
  const [cr, cg, cb] = rgb;
  const lighten = (v, f) => Math.min(255, Math.round(v + (255 - v) * f));
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, `rgba(${lighten(cr, 0.5)},${lighten(cg, 0.5)},${lighten(cb, 0.5)},${alpha})`);
  g.addColorStop(0.65, `rgba(${cr},${cg},${cb},${alpha})`);
  g.addColorStop(1, `rgba(${Math.round(cr * 0.5)},${Math.round(cg * 0.5)},${Math.round(cb * 0.5)},${alpha})`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (ring) {
    ctx.strokeStyle = ring; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); ctx.stroke();
  }
}

/** requestAnimationFrame loop that pauses when the widget scrolls out of view. */
export function runWhenVisible(element, draw) {
  let visible = false, raf = null;
  const tick = () => { draw(); raf = visible ? requestAnimationFrame(tick) : null; };
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && raf === null) raf = requestAnimationFrame(tick);
  }, { rootMargin: '80px' });
  io.observe(element);
  return () => io.disconnect();
}
