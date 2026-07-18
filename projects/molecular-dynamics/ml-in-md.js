// Interactive widgets for "Where machine learning comes in".

import { fitCanvas, theme, Plot, arrow, atom, runWhenVisible } from './lib/draw.js';
import { ljEnergy, R_MIN } from './lib/physics.js';

const $ = (id) => document.getElementById(id);
const rgb = (css) => {
  const d = document.createElement('div');
  d.style.color = css; document.body.appendChild(d);
  const m = getComputedStyle(d).color.match(/\d+/g).map(Number);
  d.remove(); return m.slice(0, 3);
};

// ---------------------------------------------------------------------------
// Kernel ridge regression -- the actual fitting used by two of the widgets.
// Small enough that a plain Gaussian elimination is the right solver.
// ---------------------------------------------------------------------------
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-14) continue;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f === 0) continue;
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row[n]);
}

function krrFit(xs, ys, lengthScale, lambda = 1e-7) {
  const n = xs.length;
  const k = (a, b) => Math.exp(-((a - b) ** 2) / (2 * lengthScale * lengthScale));
  const K = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) row[j] = k(xs[i], xs[j]) + (i === j ? lambda : 0);
    K.push(row);
  }
  const alpha = solve(K, ys);
  return (x) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += alpha[i] * k(x, xs[i]);
    return s;
  };
}

// ===========================================================================
// 1. The accuracy / cost trade-off, and the empty corner.
// ===========================================================================
function widgetTradeoff() {
  const canvas = $('c-tradeoff');
  // [seconds per energy, typical error kcal/mol, label, colourKey]
  const POINTS = [
    [1e-6, 25, 'pair potential', 'classical'],
    [2e-6, 12, 'classical force field', 'classical'],
    [3e-6, 6, 'EAM', 'classical'],
    [1.5e-4, 0.4, 'machine-learned potential', 'neural'],
    [2.6, 0.05, 'quantum mechanics', 'good'],
  ];

  function draw() {
    const { ctx, w, h } = fitCanvas(canvas, 320);
    const t = theme();
    const p = new Plot(ctx, w, h, {
      xMin: -6.6, xMax: 1.2, yMin: -1.6, yMax: 1.9,
      pad: { l: 62, r: 24, t: 20, b: 40 },
    });
    p.axes({
      xTicks: [-6, -4, -2, 0], yTicks: [-1, 0, 1],
      xLabel: 'time for one energy  (→ slower)',
      yLabel: 'error  (→ worse)',
      xFmt: (v) => (v === 0 ? '1 s' : `10^${v} s`),
      yFmt: (v) => (v === 0 ? '1' : `10^${v}`),
    });

    // The corner everyone wants: fast and accurate.
    p.clip(() => {
      ctx.fillStyle = t.neural;
      ctx.globalAlpha = 0.09;
      ctx.fillRect(p.x(-6.6), p.y(-1.6), p.x(-2.5) - p.x(-6.6), p.y(0.2) - p.y(-1.6));
      ctx.globalAlpha = 1;
    });
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.neural; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('fast AND accurate', p.x(-6.4), p.y(0.15) + 6);
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.muted;
    ctx.fillText('this corner used to be empty', p.x(-6.4), p.y(0.15) + 23);

    for (const [sec, err, label, key] of POINTS) {
      const x = Math.log10(sec), y = Math.log10(err);
      const col = t[key];
      p.dot(x, y, col, key === 'neural' ? 9 : 6.5);
      ctx.font = `${key === 'neural' ? '650' : '500'} 12px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = key === 'neural' ? t.neural : t.text2;
      const right = x > -1;
      ctx.textAlign = right ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x(x) + (right ? -14 : 14), p.y(y));
    }
  }
  runWhenVisible($('w-tradeoff'), draw);
}

// ===========================================================================
// 2. Learning a curve from a handful of expensive answers.
// ===========================================================================
function widgetFit() {
  const canvas = $('c-fit');
  const X0 = 3.35, X1 = 9.0;
  const truth = (r) => ljEnergy(r);
  let offset = 0.11;

  $('fit-n').oninput = () => { $('fit-n-val').textContent = $('fit-n').value; };
  $('fit-new').onclick = () => { offset = Math.random(); };

  // Golden-ratio sequence: as you add examples they fill the gaps evenly
  // instead of clumping, which is what a sensible sampling strategy does.
  const samplesFor = (n) => {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const f = (offset + i * 0.6180339887498949) % 1;
      xs.push(X0 + f * (X1 - X0));
    }
    return xs.sort((a, b) => a - b);
  };

  function draw() {
    const n = +$('fit-n').value;
    const showTruth = $('fit-truth').checked;
    const t = theme();
    const { ctx, w, h } = fitCanvas(canvas, 330);
    const p = new Plot(ctx, w, h, {
      xMin: X0 - 0.1, xMax: X1, yMin: -0.42, yMax: 0.62,
      pad: { l: 56, r: 18, t: 16, b: 38 },
    });
    p.axes({
      xTicks: [4, 5, 6, 7, 8, 9], yTicks: [-0.4, -0.2, 0, 0.2, 0.4],
      xLabel: 'distance between two atoms (Å)', yLabel: 'energy (kcal/mol)',
      yFmt: (v) => v.toFixed(1),
    });
    p.rule(0, { dash: [3, 3] });

    const xs = samplesFor(n);
    const ys = xs.map(truth);
    const f = krrFit(xs, ys, 0.62, 1e-8);

    let worst = 0;
    for (let i = 0; i <= 240; i++) {
      const x = X0 + (X1 - X0) * i / 240;
      worst = Math.max(worst, Math.abs(f(x) - truth(x)));
    }

    p.clip(() => {
      if (showTruth) p.fn(truth, t.muted, { width: 2.5 });
      p.fn(f, t.neural, { width: 2.5 });
      for (let i = 0; i < xs.length; i++) p.dot(xs[i], ys[i], t.classical, 5);
    });

    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = t.classical;
    ctx.fillText('● expensive answers we paid for', w - p.pad.r, p.pad.t + 2);
    ctx.fillStyle = t.neural;
    ctx.fillText(', what the model learned', w - p.pad.r, p.pad.t + 18);
    if (showTruth) {
      ctx.fillStyle = t.muted;
      ctx.fillText(', the truth (normally hidden)', w - p.pad.r, p.pad.t + 34);
    }

    $('fit-cost').textContent = String(n);
    $('fit-time').textContent = `${(n * 2.6).toFixed(0)} s`;
    $('fit-err').textContent = worst.toFixed(3);
    $('fit-verdict').textContent =
      worst < 0.01 ? 'excellent' : worst < 0.04 ? 'usable' : 'not yet';
    $('fit-verdict').style.color =
      worst < 0.01 ? t.good : worst < 0.04 ? t.classical : t.danger;
  }
  runWhenVisible($('w-fit'), draw);
}

// ===========================================================================
// 3. Move it, turn it, relabel it: raw coordinates lie, distances do not.
// ===========================================================================
function widgetInvariance() {
  const canvas = $('c-invariance');
  // A little molecule: a centre plus three neighbours, two of them identical.
  const BASE = [
    { x: 0, y: 0, el: 'C' },
    { x: 1.5, y: -0.9, el: 'H' },
    { x: -1.5, y: -0.9, el: 'H' },
    { x: 0, y: 1.7, el: 'O' },
  ];
  let atoms = BASE.map((a) => ({ ...a }));
  let order = [0, 1, 2, 3];
  let flash = 0, lastAction = '';

  const reset = () => {
    atoms = BASE.map((a) => ({ ...a })); order = [0, 1, 2, 3];
    lastAction = ''; flash = 0;
  };

  $('inv-move').onclick = () => {
    const dx = (Math.random() - 0.5) * 2.4, dy = (Math.random() - 0.5) * 1.6;
    atoms = atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy }));
    lastAction = 'moved'; flash = 1;
  };
  $('inv-rotate').onclick = () => {
    const th = 0.6 + Math.random() * 1.4;
    const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
    const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
    atoms = atoms.map((a) => {
      const dx = a.x - cx, dy = a.y - cy;
      return { ...a, x: cx + dx * Math.cos(th) - dy * Math.sin(th),
                     y: cy + dx * Math.sin(th) + dy * Math.cos(th) };
    });
    lastAction = 'turned'; flash = 1;
  };
  $('inv-swap').onclick = () => {
    [order[1], order[2]] = [order[2], order[1]];
    lastAction = 'relabelled'; flash = 1;
  };
  $('inv-reset').onclick = reset;

  const COLORS = { C: [58, 58, 70], H: [225, 225, 233], O: [214, 74, 62] };

  function distances() {
    const d = [];
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        d.push(Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y));
      }
    }
    return d.sort((a, b) => a - b);
  }

  function draw() {
    const t = theme();
    const { ctx, w, h } = fitCanvas(canvas, 320);
    flash = Math.max(0, flash - 0.02);

    // --- left: the molecule ---
    const panelW = Math.min(300, w * 0.42);
    const scale = Math.min(panelW, h) * 0.20;
    const cx = panelW / 2, cy = h / 2;
    const px = (a) => cx + a.x * scale, py = (a) => cy - a.y * scale;

    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, panelW - 16, h - 16);
    for (let i = 1; i < atoms.length; i++) {
      ctx.strokeStyle = t.muted; ctx.lineWidth = 3; ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(px(atoms[0]), py(atoms[0]));
      ctx.lineTo(px(atoms[i]), py(atoms[i]));
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    atoms.forEach((a, i) => {
      const idx = order.indexOf(i);
      atom(ctx, px(a), py(a), a.el === 'C' ? 17 : 14, COLORS[a.el]);
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = a.el === 'H' ? '#333' : '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), px(a), py(a));
    });
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.muted; ctx.textAlign = 'center';
    ctx.fillText(lastAction ? `just ${lastAction}` : 'starting position',
                 panelW / 2, h - 22);

    // --- right: the two descriptions, side by side ---
    const colX = panelW + 24;
    const colW = (w - colX - 20) / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    const header = (x, label, color) => {
      ctx.font = '650 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(label, x, 18);
    };
    header(colX, 'raw coordinates', t.danger);
    header(colX + colW, 'distances', t.good);

    ctx.font = '12px ui-monospace, "SF Mono", Menlo, monospace';
    const rows = order.map((i) => atoms[i]);
    rows.forEach((a, k) => {
      ctx.fillStyle = t.text2;
      ctx.fillText(`${(a.x).toFixed(2)}, ${(a.y).toFixed(2)}`, colX, 44 + k * 20);
    });
    const ds = distances();
    ds.slice(0, 6).forEach((d, k) => {
      ctx.fillStyle = t.text2;
      ctx.fillText(d.toFixed(2), colX + colW, 44 + k * 20);
    });

    // Highlight the column that just changed.
    if (flash > 0 && lastAction) {
      const changed = lastAction !== 'relabelled' ? 0 : 0;   // raw always changes
      ctx.globalAlpha = flash * 0.22;
      ctx.fillStyle = t.danger;
      ctx.fillRect(colX - 8, 34, colW - 10, 20 * rows.length + 8);
      ctx.globalAlpha = 1;
      void changed;
    }

    // Both captions sit below the longer of the two columns.
    const capY = 44 + Math.max(rows.length, Math.min(ds.length, 6)) * 20 + 12;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.danger;
    ctx.fillText('changes every time ✗', colX, capY);
    ctx.fillStyle = t.good;
    ctx.fillText('never changes ✓', colX + colW, capY);

    $('inv-raw').textContent = lastAction ? 'changed' : 'unchanged';
    $('inv-raw').style.color = lastAction ? t.danger : t.muted;
    $('inv-dist').textContent = 'unchanged';
    $('inv-energy').textContent = 'unchanged';
  }
  runWhenVisible($('w-invariance'), draw);
}

// ===========================================================================
// 4. The fingerprint: what one atom can see around it.
// Uses the same radial symmetry functions as the real trained model.
// ===========================================================================
function widgetFingerprint() {
  const canvas = $('c-fingerprint');
  const BASE = [[1.1, 0.35], [-0.75, 0.9], [-0.35, -1.15], [1.9, -1.0]];
  let neigh = BASE.map(([x, y]) => ({ x, y }));
  let drag = -1, spin = 0;

  const NBINS = 14, ETA = 3.2, RMAX = 3.2;
  const shifts = Array.from({ length: NBINS }, (_, i) => 0.5 + i * (RMAX - 0.5) / (NBINS - 1));

  $('fp-reset').onclick = () => { neigh = BASE.map(([x, y]) => ({ x, y })); spin = 0; };
  $('fp-rotate').onclick = () => { spin = 1; };

  const layout = (w, h) => {
    const panelW = Math.min(300, w * 0.42);
    return { panelW, cx: panelW / 2, cy: h / 2, scale: Math.min(panelW, h) * 0.24 };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const { cx, cy, scale } = layout(canvas.clientWidth, canvas.clientHeight);
    const mx = (e.clientX - r.left - cx) / scale, my = -(e.clientY - r.top - cy) / scale;
    let best = -1, bd = 0.6;
    neigh.forEach((n, i) => {
      const d = Math.hypot(n.x - mx, n.y - my);
      if (d < bd) { bd = d; best = i; }
    });
    drag = best;
    if (best >= 0) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const r = canvas.getBoundingClientRect();
    const { cx, cy, scale } = layout(canvas.clientWidth, canvas.clientHeight);
    let mx = (e.clientX - r.left - cx) / scale, my = -(e.clientY - r.top - cy) / scale;
    const d = Math.hypot(mx, my);
    if (d < 0.55) { mx *= 0.55 / d; my *= 0.55 / d; }
    if (d > 3.1) { mx *= 3.1 / d; my *= 3.1 / d; }
    neigh[drag] = { x: mx, y: my };
  });
  const end = () => { drag = -1; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function fingerprint() {
    const out = new Float64Array(NBINS);
    for (const n of neigh) {
      const r = Math.hypot(n.x, n.y);
      const cut = r < RMAX ? 0.5 * Math.cos(Math.PI * r / RMAX) + 0.5 : 0;
      for (let s = 0; s < NBINS; s++) {
        out[s] += Math.exp(-ETA * (r - shifts[s]) ** 2) * cut;
      }
    }
    return out;
  }

  function draw() {
    const t = theme();
    const { ctx, w, h } = fitCanvas(canvas, 320);
    if (spin > 0) {
      const th = 0.03;
      neigh = neigh.map((n) => ({
        x: n.x * Math.cos(th) - n.y * Math.sin(th),
        y: n.x * Math.sin(th) + n.y * Math.cos(th),
      }));
      spin = Math.max(0, spin - 0.006);
    }

    const { panelW, cx, cy, scale } = layout(w, h);
    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, panelW - 16, h - 16);
    // Reach of the fingerprint. Clipped to the left panel so the circle cannot
    // spill across into the bar chart.
    ctx.save();
    ctx.beginPath(); ctx.rect(8, 8, panelW - 16, h - 16); ctx.clip();
    ctx.setLineDash([3, 4]); ctx.strokeStyle = t.border;
    ctx.beginPath(); ctx.arc(cx, cy, RMAX * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    for (const n of neigh) {
      ctx.strokeStyle = t.muted; ctx.globalAlpha = 0.4; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx + n.x * scale, cy - n.y * scale);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const n of neigh) {
      atom(ctx, cx + n.x * scale, cy - n.y * scale, 13, rgb(t.muted));
    }
    atom(ctx, cx, cy, 16, rgb(t.neural));
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.muted; ctx.textAlign = 'center';
    ctx.fillText('drag any grey atom', panelW / 2, h - 20);

    // --- the fingerprint bars ---
    const fp = fingerprint();
    const p = new Plot(ctx, w, h, {
      xMin: 0, xMax: NBINS, yMin: 0, yMax: 2.6,
      pad: { l: panelW + 46, r: 20, t: 26, b: 40 },
    });
    p.axes({ xTicks: [], yTicks: [0, 1, 2],
             xLabel: 'near  ←  distance band  →  far',
             yLabel: 'how much is there' });
    const bw = p.plotW / NBINS;
    ctx.fillStyle = t.neural;
    for (let i = 0; i < NBINS; i++) {
      const y0 = p.y(Math.min(fp[i], 2.6));
      ctx.fillRect(p.x(i) + 1.5, y0, Math.max(1, bw - 3), p.y(0) - y0);
    }
    ctx.font = '650 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.text2; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('the blue atom’s fingerprint', panelW + 46, 6);
  }
  runWhenVisible($('w-fingerprint'), draw);
}

// ===========================================================================
// 4b. What the model actually predicts: invented per-atom shares, one real
// total. Uses the real trained weights, so every number here is real.
// ===========================================================================
async function widgetShare() {
  const canvas = $('c-share');
  const LABELS = ['C', 'H (leaving)', 'H', 'H', 'H'];
  let pot = null, path = null, dft = null;

  try {
    const [ps, rs] = await Promise.all([
      fetch('./assets/potential.json'), fetch('./assets/reference.json'),
    ]);
    if (!ps.ok || !rs.ok) throw new Error('assets missing');
    const { ANIPotential } = await import('./potential.js');
    pot = new ANIPotential(await ps.json());
    const ref = await rs.json();
    path = ref.geometry_path;
    dft = ref.curve.e_dft;
    $('share-status').textContent =
      `${LABELS.length} atoms · real trained model`;
  } catch {
    $('share-status').textContent = 'model not built yet (run the pipeline)';
    return;
  }

  const idxOf = () => Math.round(+$('share-r').value / 100 * (path.r.length - 1));
  $('share-r').oninput = () => {};

  function draw() {
    const t = theme();
    const { ctx, w, h } = fitCanvas(canvas, 320);
    const i = idxOf();
    const geom = Float64Array.from(path.geometry[i].flat());
    const shares = pot.atomEnergies(geom);
    const total = pot.energy(geom);
    const truth = dft[i];

    $('share-r-val').textContent = `${path.r[i].toFixed(2)} Å`;
    $('share-total').textContent = `${total.toFixed(1)}`;
    $('share-truth').textContent = `${truth.toFixed(1)}`;
    $('share-diff').textContent = `${Math.abs(total - truth).toFixed(2)} kcal/mol`;

    // --- left: the five invented shares ---
    const splitX = w * 0.58;
    const pL = new Plot(ctx, w, h, {
      xMin: -0.6, xMax: 4.6, yMin: -40, yMax: 175,
      pad: { l: 52, r: w - splitX + 20, t: 40, b: 46 },
    });
    pL.axes({ xTicks: [], yTicks: [0, 50, 100, 150], yLabel: 'kcal/mol' });
    pL.rule(0, { color: t.axis, dash: [] });
    const bw = pL.plotW / 5 * 0.62;
    for (let a = 0; a < 5; a++) {
      const x = pL.x(a), y0 = pL.y(0), y1 = pL.y(shares[a]);
      ctx.fillStyle = a === 1 ? t.classical : t.muted;
      ctx.globalAlpha = a === 1 ? 0.95 : 0.55;
      ctx.fillRect(x - bw / 2, Math.min(y0, y1), bw, Math.abs(y1 - y0));
      ctx.globalAlpha = 1;
      ctx.font = '10.5px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = t.muted;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(LABELS[a], x, h - 40);
      ctx.fillStyle = a === 1 ? t.classical : t.text2;
      ctx.font = '600 10.5px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText(shares[a].toFixed(0), x, Math.min(y0, y1) - 3);
    }
    ctx.font = '650 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.text2; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('what the network made up', 52, 12);
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.muted;
    ctx.fillText('never taught, never checked', 52, 26);

    // --- right: the one number that is real ---
    const pR = new Plot(ctx, w, h, {
      xMin: -0.7, xMax: 1.7, yMin: -40, yMax: 175,
      pad: { l: splitX + 44, r: 20, t: 40, b: 46 },
    });
    pR.axes({ xTicks: [], yTicks: [] });
    pR.rule(0, { color: t.axis, dash: [] });
    const bw2 = pR.plotW / 2 * 0.5;
    [[0, total, t.neural, 'model total'], [1, truth, t.good, 'quantum truth']]
      .forEach(([a, v, col, lab]) => {
        const y0 = pR.y(0), y1 = pR.y(v);
        ctx.fillStyle = col;
        ctx.fillRect(pR.x(a) - bw2 / 2, Math.min(y0, y1), bw2, Math.abs(y1 - y0));
        ctx.font = '10.5px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = t.muted;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(lab, pR.x(a), h - 40);
        ctx.fillStyle = col;
        ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(v.toFixed(1), pR.x(a), Math.min(y0, y1) - 3);
      });
    ctx.font = '650 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.text2; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('the only thing compared', splitX + 44, 12);
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.muted;
    ctx.fillText('their sum, against reality', splitX + 44, 26);

    // the sum arrow, from the invented pile to the real number
    ctx.strokeStyle = t.border; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(splitX - 4, pL.pad.t); ctx.lineTo(splitX - 4, h - 44);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.neural; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('add up →', splitX + 16, h - 26);
  }
  runWhenVisible($('w-share'), draw);
}

// ===========================================================================
// 5. Why forces matter: the same points, with and without slopes.
// ===========================================================================
function widgetForces() {
  const canvas = $('c-forces');
  const X0 = 3.5, X1 = 8.5;
  const truth = (r) => ljEnergy(r);
  const PTS = [3.9, 5.6, 7.6];

  function draw() {
    const t = theme();
    const { ctx, w, h } = fitCanvas(canvas, 300);
    const half = w / 2;

    const mk = (x0, x1, title, useSlopes) => {
      const p = new Plot(ctx, w, h, {
        xMin: X0, xMax: X1, yMin: -0.4, yMax: 0.32,
        pad: { l: x0 + 44, r: w - x1 + 12, t: 34, b: 36 },
      });
      p.axes({ xTicks: [4, 6, 8], yTicks: [-0.2, 0, 0.2],
               yFmt: (v) => v.toFixed(1) });
      ctx.font = '650 12.5px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = useSlopes ? t.good : t.danger;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(title, x0 + 44, 10);

      // Three models of different flexibility, all fitted to the same data.
      // Where the data pins the curve, they agree; where it does not, they
      // disagree wildly -- which is exactly what "not enough information" is.
      const scales = [0.35, 1.0, 2.5];
      p.clip(() => {
        p.fn(truth, t.muted, { width: 1.5, dash: [4, 4] });
        for (const ls of scales) {
          const xs = [], ys = [];
          for (const x of PTS) {
            xs.push(x); ys.push(truth(x));
            if (useSlopes) {
              // A force measurement pins the slope. Two closely spaced values
              // carry the same information, which keeps this honest and simple.
              const d = 0.12;
              xs.push(x - d, x + d);
              ys.push(truth(x - d), truth(x + d));
            }
          }
          const f = krrFit(xs, ys, ls, 1e-9);
          p.fn(f, useSlopes ? t.good : t.danger, { width: 2 });
        }
        for (const x of PTS) {
          p.dot(x, truth(x), t.classical, 5);
          if (useSlopes) {
            const d = 0.34;
            const s = (truth(x + 0.05) - truth(x - 0.05)) / 0.1;
            p.line([[x - d, truth(x) - s * d], [x + d, truth(x) + s * d]],
                   t.classical, { width: 2 });
          }
        }
      });
      return p;
    };

    mk(0, half - 8, '3 energies only', false);
    mk(half + 8, w, '3 energies + their slopes', true);

    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('three different models: they disagree', half / 2, h - 4);
    ctx.fillText('the same three: now they nearly agree', half + half / 2, h - 4);
  }
  runWhenVisible($('w-forces'), draw);
}

widgetTradeoff();
widgetFit();
widgetInvariance();
widgetFingerprint();
widgetForces();
widgetShare();
