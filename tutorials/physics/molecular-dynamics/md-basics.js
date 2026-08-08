// Interactive widgets for "How molecular dynamics works".

import { fitCanvas, theme, Plot, arrow, atom, runWhenVisible } from './lib/draw.js';
import {
  LJBox, ljEnergy, ljForce, ljRepulsion, ljAttraction,
  pairBinding, eamBinding,
  SIGMA, EPSILON, R_MIN, R_CUT, MASS_AR, KB, FORCE_TO_ACCEL,
} from './lib/physics.js';

const $ = (id) => document.getElementById(id);
const rgb = (css) => {
  const d = document.createElement('div');
  d.style.color = css; document.body.appendChild(d);
  const m = getComputedStyle(d).color.match(/\d+/g).map(Number);
  d.remove(); return m.slice(0, 3);
};

// ===========================================================================
// 1. One atom, one step at a time.
// A plain harmonic valley: it is the clearest way to show that too large a
// timestep does not just lose accuracy, it makes the simulation explode.
// ===========================================================================
function widgetLoop() {
  const canvas = $('c-loop');
  const K = 1.0, M = 1.0;               // arbitrary units; omega = 1
  const energy = (x) => 0.5 * K * x * x;
  const force = (x) => -K * x;

  let x, v, f, steps, running = false, blown = false;
  const trail = [];

  function reset() {
    x = 2.4; v = 0; f = force(x); steps = 0; blown = false; trail.length = 0;
  }
  reset();

  const dtOf = () => 0.05 + (+$('loop-dt').value - 1) * (2.45 / 59);
  const dtWord = (dt) =>
    dt < 0.3 ? 'tiny' : dt < 0.8 ? 'small' : dt < 1.5 ? 'medium'
      : dt < 2.0 ? 'large' : 'too big';

  function step() {
    if (blown) return;
    const dt = dtOf();
    v += 0.5 * dt * f / M;
    x += dt * v;
    f = force(x);
    v += 0.5 * dt * f / M;
    steps++;
    trail.push(x);
    if (trail.length > 240) trail.shift();
    if (Math.abs(x) > 12) blown = true;
  }

  function draw() {
    const { ctx, w, h } = fitCanvas(canvas, 260);
    const t = theme();
    const p = new Plot(ctx, w, h, { xMin: -6, xMax: 6, yMin: -1.4, yMax: 16,
                                    pad: { l: 44, r: 16, t: 16, b: 34 } });
    p.axes({ xTicks: [-4, -2, 0, 2, 4], yTicks: [0, 5, 10, 15],
             xLabel: 'position', yLabel: 'energy' });
    p.clip(() => {
      p.fn(energy, t.muted, { width: 2 });
      // where it has been
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < trail.length; i++) {
        const a = i / trail.length;
        ctx.globalAlpha = 0.06 + 0.3 * a;
        p.dot(trail[i], energy(trail[i]), t.neural, 2, false);
      }
      ctx.globalAlpha = 1;

      const px = p.x(x), py = p.y(energy(x));
      const F = force(x);
      if (Math.abs(F) > 1e-6) {
        arrow(ctx, px, py - 22, px + Math.max(-90, Math.min(90, F * 26)), py - 22,
              t.classical, 3);
      }
      atom(ctx, px, py, 9, rgb(t.neural), { ring: blown ? t.danger : null });
    });

    if (blown) {
      ctx.fillStyle = t.danger;
      ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('the simulation blew up: the step was too big',
                   w / 2, 30);
    }

    $('loop-x').textContent = x.toFixed(2);
    $('loop-v').textContent = v.toFixed(2);
    $('loop-f').textContent = force(x).toFixed(2);
    $('loop-n').textContent = String(steps);
    $('loop-dt-val').textContent = dtWord(dtOf());
  }

  $('loop-step').onclick = () => { step(); };
  $('loop-reset').onclick = () => { reset(); running = false; $('loop-run').textContent = 'Run'; };
  $('loop-run').onclick = () => {
    running = !running;
    $('loop-run').textContent = running ? 'Pause' : 'Run';
  };
  $('loop-dt').oninput = () => { $('loop-dt-val').textContent = dtWord(dtOf()); };

  let acc = 0;
  runWhenVisible($('w-loop'), () => {
    if (running) { acc++; if (acc % 2 === 0) step(); }
    draw();
  });
}

// ===========================================================================
// 2. Force is minus the slope of the energy.
// ===========================================================================
function widgetSlope() {
  const canvas = $('c-slope');
  const energy = (x) => 0.35 * Math.pow(x * x - 4, 2);
  const slope = (x) => 1.4 * x * (x * x - 4);     // dE/dx
  let bx = -3.0, dragging = false;

  const toData = (clientX) => {
    const r = canvas.getBoundingClientRect();
    const { w } = { w: canvas.clientWidth };
    const p = new Plot(null, w, 1, { xMin: -3.6, xMax: 3.6,
                                     pad: { l: 44, r: 16, t: 16, b: 34 } });
    const frac = (clientX - r.left - p.pad.l) / p.plotW;
    return -3.6 + frac * 7.2;
  };
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; bx = Math.max(-3.5, Math.min(3.5, toData(e.clientX)));
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) bx = Math.max(-3.5, Math.min(3.5, toData(e.clientX)));
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function draw() {
    const { ctx, w, h } = fitCanvas(canvas, 290);
    const t = theme();
    const p = new Plot(ctx, w, h, { xMin: -3.6, xMax: 3.6, yMin: -1.5, yMax: 8,
                                    pad: { l: 44, r: 16, t: 16, b: 34 } });
    p.axes({ xTicks: [-3, -2, -1, 0, 1, 2, 3], yTicks: [0, 2, 4, 6],
             xLabel: 'position', yLabel: 'energy' });
    p.clip(() => {
      p.fn(energy, t.muted, { width: 2.5 });

      const e = energy(bx), s = slope(bx);
      // Tangent line showing the steepness. Shorten it where the curve is steep,
      // otherwise it shoots off the top of the frame and dominates the picture.
      const dx = 1.15 / Math.max(1, Math.abs(s) / 2.5);
      p.line([[bx - dx, e - s * dx], [bx + dx, e + s * dx]], t.good, { width: 2.5 });

      const px = p.x(bx), py = p.y(e);
      const F = -s;
      const scale = 12;
      if (Math.abs(F) > 0.02) {
        arrow(ctx, px, py - 26,
              px + Math.max(-110, Math.min(110, F * scale)), py - 26, t.classical, 3.5);
      }
      atom(ctx, px, py, 11, rgb(t.neural));

      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = t.text2; ctx.textAlign = 'center';
      const msg = Math.abs(F) < 0.15 ? 'flat here → no force'
        : (Math.abs(s) > 4 ? 'steep here → strong force' : 'gentle slope → gentle force');
      ctx.fillText(msg, Math.max(90, Math.min(w - 90, px)), py - 46);
    });
  }
  runWhenVisible($('w-slope'), draw);
}

// ===========================================================================
// 3. Two atoms: the Lennard-Jones curve.
// ===========================================================================
function widgetLJ() {
  const canvas = $('c-lj');
  const R0 = 3.0, R1 = 11.0;
  let r = 6.4, vr = 0, released = false, showParts = false, dragging = false;

  const plotFor = (w, h) => new Plot(null, w, h, {
    xMin: R0, xMax: R1, yMin: -0.45, yMax: 0.75,
    pad: { l: 52, r: 16, t: 12, b: 34 },
  });

  const toR = (clientX, w) => {
    const rect = canvas.getBoundingClientRect();
    const p = plotFor(w, 1);
    return R0 + (clientX - rect.left - p.pad.l) / p.plotW * (R1 - R0);
  };
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; released = false; vr = 0;
    r = Math.max(3.05, Math.min(R1, toR(e.clientX, canvas.clientWidth)));
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    r = Math.max(3.05, Math.min(R1, toR(e.clientX, canvas.clientWidth)));
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  $('lj-release').onclick = () => { released = true; vr = 0; };
  $('lj-reset').onclick = () => { released = false; r = 6.4; vr = 0; };
  $('lj-total').onclick = () => {
    showParts = false;
    $('lj-total').classList.add('active'); $('lj-parts').classList.remove('active');
  };
  $('lj-parts').onclick = () => {
    showParts = true;
    $('lj-parts').classList.add('active'); $('lj-total').classList.remove('active');
  };

  function integrate() {
    if (!released || dragging) return;
    // Relative coordinate of two identical atoms: reduced mass = m/2.
    const mu = MASS_AR / 2, dt = 8;
    for (let i = 0; i < 4; i++) {
      const f0 = ljForce(r);
      vr += 0.5 * dt * FORCE_TO_ACCEL * f0 / mu;
      r += dt * vr;
      if (r < 3.0) { r = 3.0; vr = Math.abs(vr); }
      if (r > R1) { r = R1; vr = -Math.abs(vr) * 0.6; }
      const f1 = ljForce(r);
      vr += 0.5 * dt * FORCE_TO_ACCEL * f1 / mu;
    }
  }

  function draw() {
    const { ctx, w, h } = fitCanvas(canvas, 330);
    const t = theme();
    const atomRow = 62;

    // --- the two atoms, positioned on the same x scale as the plot below ---
    const p = new Plot(ctx, w, h, {
      xMin: R0, xMax: R1, yMin: -0.45, yMax: 0.75,
      pad: { l: 52, r: 16, t: 12 + atomRow, b: 34 },
    });
    const xLeft = p.x(R0 + 0.15), xRight = p.x(r);
    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(xLeft, atomRow / 2 + 6); ctx.lineTo(xRight, atomRow / 2 + 6);
    ctx.stroke(); ctx.setLineDash([]);

    const F = ljForce(r);
    if (Math.abs(F) > 0.002) {
      const dir = Math.sign(F);
      arrow(ctx, xRight, atomRow / 2 - 18,
            xRight + dir * Math.min(70, Math.abs(F) * 260), atomRow / 2 - 18,
            t.classical, 3);
    }
    atom(ctx, xLeft, atomRow / 2 + 6, 15, rgb(t.neural));
    atom(ctx, xRight, atomRow / 2 + 6, 15, rgb(t.neural),
         { ring: dragging ? t.good : null });
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.muted; ctx.textAlign = 'center';
    ctx.fillText('drag me →', xRight, atomRow / 2 + 32);

    // --- the energy curve ---
    p.axes({ xTicks: [4, 6, 8, 10], yTicks: [-0.2, 0, 0.2, 0.4, 0.6],
             xLabel: 'distance between the atoms (Å)',
             yLabel: 'energy (kcal/mol)',
             yFmt: (v) => v.toFixed(1) });
    p.rule(0, { dash: [3, 3] });
    p.clip(() => {
      if (showParts) {
        p.fn((x) => ljRepulsion(x), t.danger, { width: 2, dash: [5, 4] });
        p.fn((x) => ljAttraction(x), t.good, { width: 2, dash: [5, 4] });
      }
      p.fn((x) => ljEnergy(x), t.muted, { width: 2.5 });
      p.dot(r, ljEnergy(r), t.neural, 6);
      p.rule(r, { axis: 'x', color: t.neural, dash: [3, 3] });
    });
    if (showParts) {
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = t.danger; ctx.textAlign = 'left';
      ctx.fillText('pushing apart (close range)', p.x(4.35), p.y(0.62));
      ctx.fillStyle = t.good;
      ctx.fillText('pulling together (long range)', p.x(6.9), p.y(-0.30));
    }
    p.rule(R_MIN, { axis: 'x', color: t.muted, dash: [2, 4] });
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('comfortable distance', p.x(R_MIN) + 6, p.y(-0.36));

    // --- readouts ---
    const e = ljEnergy(r);
    $('lj-r').textContent = `${r.toFixed(2)} Å`;
    $('lj-e').textContent = `${e.toFixed(3)}`;
    $('lj-f').textContent = F.toFixed(3);
    $('lj-state').textContent =
      Math.abs(r - R_MIN) < 0.12 ? 'just right'
        : r < R_MIN ? 'pushing apart' : (r > R_CUT ? 'too far to care' : 'pulling together');
  }

  runWhenVisible($('w-lj'), () => { integrate(); draw(); });
}

// ===========================================================================
// 4 + 5. Many atoms in a box, and the spread of their speeds.
// ===========================================================================
function widgetBox() {
  const canvas = $('c-box');
  const speedCanvas = $('c-speed');
  // 110 x 75 A for 220 atoms is dense enough that the cold phase condenses into
  // a clump with visible empty space around it, and dilute enough that the hot
  // phase genuinely fills the box.
  // 40 K: the lattice start is already the equilibrium state here, so the
  // widget opens settled rather than mid-transient. Heating melts it.
  const START_T = 40;
  const box = new LJBox({ n: 220, width: 110, height: 75, temperature: START_T,
                          friction: 0.004 });
  const coord = new Int8Array(box.n);
  const spd = new Float64Array(box.n);
  let colorByNeighbours = true;
  let tAvg = START_T;
  // Target temperature, approached gradually. A sudden quench traps the atoms
  // in a disordered glassy clump; ramping lets them find ordered packing, which
  // is also how it is done for real.
  let targetT = START_T;
  for (let i = 0; i < 800; i++) box.step();

  // Fixed speed axis (set by the hottest the slider goes) so that heating the
  // box visibly shifts and broadens the distribution instead of just rescaling
  // the axis underneath it.
  const V_MAX = 4.2 * Math.sqrt(KB * 300 * FORCE_TO_ACCEL / MASS_AR);
  const NB = 30;
  const binsSmooth = new Float64Array(NB);
  let yMaxSmooth = 0.15;

  $('box-temp').oninput = (e) => {
    targetT = +e.target.value;
    $('box-temp-val').textContent = `${targetT} K`;
  };
  const setT = (v) => {
    targetT = v; $('box-temp').value = v; $('box-temp-val').textContent = `${v} K`;
  };
  $('box-cool').onclick = () => setT(15);
  $('box-heat').onclick = () => setT(200);
  $('box-reset').onclick = () => { box.reset(); targetT = box.T; };
  $('box-color').onchange = (e) => { colorByNeighbours = e.target.checked; };

  const COLD = [42, 120, 214], WARM = [235, 104, 52];

  function draw() {
    box.T += (targetT - box.T) * 0.012;    // gradual ramp, not a quench
    for (let i = 0; i < 5; i++) box.step();
    box.coordination(coord);
    const t = theme();

    const { ctx, w, h } = fitCanvas(canvas, 330);
    const scale = Math.min(w / box.W, h / box.H);
    const ox = (w - box.W * scale) / 2, oy = (h - box.H * scale) / 2;

    ctx.fillStyle = t.surface2;
    ctx.fillRect(ox, oy, box.W * scale, box.H * scale);
    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, box.W * scale, box.H * scale);

    const rad = Math.max(2.4, 0.42 * SIGMA * scale);
    for (let i = 0; i < box.n; i++) {
      const px = ox + box.x[2 * i] * scale, py = oy + box.x[2 * i + 1] * scale;
      let col = COLD;
      if (colorByNeighbours) {
        const f = Math.max(0, Math.min(1, 1 - coord[i] / 6));
        col = [
          Math.round(COLD[0] + (WARM[0] - COLD[0]) * f),
          Math.round(COLD[1] + (WARM[1] - COLD[1]) * f),
          Math.round(COLD[2] + (WARM[2] - COLD[2]) * f),
        ];
      }
      atom(ctx, px, py, rad, col);
    }

    const tm = box.temperature();
    tAvg += (tm - tAvg) * 0.03;
    let mean = 0;
    for (let i = 0; i < box.n; i++) mean += coord[i];
    mean /= box.n;
    // Thresholds set from measured mean coordination at this density.
    // Thresholds from equilibrated measurements at this density: mean
    // neighbours is 5.5 at 18 K, 5.3 at 40 K, 3.1 at 80 K, 1.9 at 200 K.
    const phase = mean > 4.5 ? 'frozen solid, locked in place'
      : mean > 2.7 ? 'liquid, stuck together but flowing'
        : 'gas, flying free';
    $('box-phase').textContent = phase;
    $('box-n').textContent = String(box.n);
    $('box-pairs').textContent = (box.n * (box.n - 1) / 2).toLocaleString();
    $('box-tmeas').textContent = `${tAvg.toFixed(0)} K`;
    $('box-time').textContent = `${(box.time / 1000).toFixed(1)} ps`;

    drawSpeeds(t);
  }

  function drawSpeeds(t) {
    if (!speedCanvas) return;
    box.speeds(spd);
    const { ctx, w, h } = fitCanvas(speedCanvas, 210);

    // 220 atoms across 30 bins is only ~7 per bin, so a single snapshot is
    // very noisy. Averaging over frames is a time average of the same
    // distribution, and makes the agreement with theory legible.
    const inst = new Float64Array(NB);
    for (let i = 0; i < box.n; i++) {
      const b = Math.floor(spd[i] / V_MAX * NB);
      if (b >= 0 && b < NB) inst[b] += 1 / box.n;
    }
    let peak = 0;
    for (let i = 0; i < NB; i++) {
      binsSmooth[i] += (inst[i] - binsSmooth[i]) * 0.05;
      peak = Math.max(peak, binsSmooth[i]);
    }
    yMaxSmooth += (Math.max(peak, 0.02) * 1.35 - yMaxSmooth) * 0.05;

    const p = new Plot(ctx, w, h, {
      xMin: 0, xMax: V_MAX, yMin: 0, yMax: yMaxSmooth,
      pad: { l: 46, r: 16, t: 14, b: 34 },
    });
    p.axes({
      xTicks: [0, V_MAX / 2, V_MAX], yTicks: [],
      xLabel: 'speed of an atom  (slow → fast)', yLabel: 'how many atoms',
      xFmt: () => '',
    });

    const bw = p.plotW / NB;
    ctx.fillStyle = t.neural;
    for (let i = 0; i < NB; i++) {
      if (binsSmooth[i] <= 0) continue;
      const x0 = p.x(i / NB * V_MAX) + 1;
      const y0 = p.y(Math.min(binsSmooth[i], yMaxSmooth));
      ctx.fillRect(x0, y0, Math.max(1, bw - 2), p.y(0) - y0);
    }

    // 2-D Maxwell-Boltzmann:  P(v) ∝ v exp(-m v² / 2kT), scaled to the same
    // per-bin fraction the histogram uses so the two are directly comparable.
    const T = Math.max(1, tAvg);
    const a = MASS_AR / (2 * FORCE_TO_ACCEL * KB * T);
    const binW = V_MAX / NB;
    p.clip(() => {
      p.fn((v) => 2 * a * v * Math.exp(-a * v * v) * binW, t.classical, { width: 2.5 });
    });
  }

  runWhenVisible($('w-box'), draw);
}

// ===========================================================================
// 7. Getting a real number out: mean squared displacement.
// The standard way an MD run distinguishes a solid from a liquid, and the
// route to a diffusion coefficient you can compare against a measurement.
// ===========================================================================
function widgetMSD() {
  const canvas = $('c-msd');
  const box = new LJBox({ n: 180, width: 100, height: 68, temperature: 25,
                          friction: 0.004 });
  for (let i = 0; i < 900; i++) box.step();
  box.markMSD();

  const WINDOW = 10000;            // fs of measurement per run
  let history = [];                // [t since mark (fs), msd]
  let targetT = 25, settle = 0, yMax = 4;

  const restart = () => { box.markMSD(); history = []; };
  $('msd-temp').oninput = (e) => {
    targetT = +e.target.value;
    $('msd-temp-val').textContent = `${targetT} K`;
    // Let the box reach the new temperature before starting to measure,
    // otherwise the first picosecond is the heating transient, not diffusion.
    settle = 260;
    history = [];
  };
  $('msd-restart').onclick = () => { settle = 60; history = []; };

  function draw() {
    box.T += (targetT - box.T) * 0.05;
    for (let i = 0; i < 6; i++) box.step();

    if (settle > 0) {
      settle--;
      if (settle === 0) restart();
    } else if (box.msdRef) {
      const dt = box.time - box.msdT0;
      if (dt <= WINDOW) history.push([dt, box.msd()]);
    }

    const t = theme();
    const { ctx, w, h } = fitCanvas(canvas, 300);

    // --- left: the box ---
    const panelW = Math.min(250, w * 0.34);
    const scale = Math.min((panelW - 24) / box.W, (h - 40) / box.H);
    const ox = (panelW - box.W * scale) / 2, oy = (h - box.H * scale) / 2;
    ctx.fillStyle = t.surface2;
    ctx.fillRect(ox, oy, box.W * scale, box.H * scale);
    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, box.W * scale, box.H * scale);
    const rad = Math.max(2, 0.4 * SIGMA * scale);
    for (let i = 0; i < box.n; i++) {
      atom(ctx, ox + box.x[2 * i] * scale, oy + box.x[2 * i + 1] * scale,
           rad, [42, 120, 214]);
    }

    // --- right: the measurement ---
    let maxSeen = 0;
    for (const [, m] of history) maxSeen = Math.max(maxSeen, m);
    yMax += (Math.max(4, maxSeen * 1.2) - yMax) * 0.05;

    const p = new Plot(ctx, w, h, {
      xMin: 0, xMax: WINDOW / 1000, yMin: 0, yMax,
      pad: { l: panelW + 56, r: 20, t: 20, b: 38 },
    });
    p.axes({
      xTicks: [0, 2, 4, 6, 8, 10],
      yTicks: [0, yMax / 2, yMax],
      xLabel: 'time watched (ps)',
      yLabel: 'mean squared distance (Å²)',
      yFmt: (v) => v.toFixed(1),
    });
    p.clip(() => {
      p.line(history.map(([tt, m]) => [tt / 1000, m]), t.neural, { width: 2.5 });
    });

    const last = history.length ? history[history.length - 1] : [0, 0];
    // Slope over the second half: the early part is atoms rattling inside their
    // cage, which is not diffusion.
    let slope = 0;
    if (history.length > 40) {
      const a = history[Math.floor(history.length / 2)], b = last;
      slope = (b[1] - a[1]) / Math.max(1e-9, (b[0] - a[0]) / 1000);
    }
    const solid = slope < 0.3;
    const verdict = history.length < 60 ? 'measuring…' : (solid ? 'solid' : 'liquid');

    $('msd-time').textContent = `${(last[0] / 1000).toFixed(1)} ps`;
    $('msd-val').textContent = `${last[1].toFixed(2)} Å²`;
    $('msd-wander').textContent = `${Math.sqrt(last[1]).toFixed(2)} Å`;
    $('msd-verdict').textContent = verdict;
    $('msd-verdict').style.color =
      history.length < 60 ? t.muted : (solid ? t.neural : t.classical);
    $('msd-phase').textContent = history.length < 60
      ? 'settling to the new temperature'
      : (solid ? 'curve is flat: atoms are stuck'
               : 'curve keeps climbing: atoms are wandering');
  }
  runWhenVisible($('w-msd'), draw);
}

// ===========================================================================
// 6. Pair model vs embedded-atom: binding energy against neighbour count.
// ===========================================================================
function widgetCoordination() {
  const canvas = $('c-coord');
  const E_COH = 3.54;      // eV per atom, copper
  const NREF = 12;

  $('coord-n').oninput = () => { $('coord-n-val').textContent = $('coord-n').value; };

  function draw() {
    const n = +$('coord-n').value;
    const t = theme();
    const { ctx, w, h } = fitCanvas(canvas, 300);

    // --- left: a picture of the atom and its neighbours ---
    const panelW = Math.min(230, w * 0.34);
    const cx = panelW / 2, cy = h / 2;
    const ringR = Math.min(panelW, h) * 0.33;
    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + i * 2 * Math.PI / Math.max(n, 1);
      const px = cx + ringR * Math.cos(ang), py = cy + ringR * Math.sin(ang);
      ctx.strokeStyle = t.muted; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
      ctx.globalAlpha = 1;
      atom(ctx, px, py, 11, rgb(t.muted));
    }
    atom(ctx, cx, cy, 15, rgb(t.neural));
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = t.text2; ctx.textAlign = 'center';
    ctx.fillText(`${n} neighbour${n === 1 ? '' : 's'}`, cx, h - 12);

    // --- right: the two model curves ---
    const p = new Plot(ctx, w, h, {
      xMin: 0, xMax: 12.6, yMin: 0, yMax: 4.2,
      pad: { l: panelW + 52, r: 18, t: 16, b: 34 },
    });
    p.axes({
      xTicks: [2, 4, 6, 8, 10, 12], yTicks: [1, 2, 3, 4],
      xLabel: 'number of neighbours', yLabel: 'how tightly held (eV)',
    });
    p.clip(() => {
      p.fn((x) => pairBinding(x, E_COH, NREF), t.classical, { width: 2.5 });
      p.fn((x) => eamBinding(x, E_COH, NREF), t.neural, { width: 2.5 });
      const ep = pairBinding(n, E_COH, NREF), ee = eamBinding(n, E_COH, NREF);
      // the gap between the two predictions
      ctx.strokeStyle = t.text2; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(p.x(n), p.y(ep)); ctx.lineTo(p.x(n), p.y(ee));
      ctx.stroke(); ctx.setLineDash([]);
      p.dot(n, ep, t.classical, 5.5);
      p.dot(n, ee, t.neural, 5.5);
    });
    p.label(12.3, pairBinding(12, E_COH, NREF) - 0.34, 'pair model', t.classical,
            { align: 'right' });
    p.label(12.3, eamBinding(12, E_COH, NREF) + 0.3, 'EAM (many-body)', t.neural,
            { align: 'right' });
    p.rule(NREF, { axis: 'x', color: t.muted, dash: [2, 4] });
    p.label(11.7, 0.28, 'bulk copper, both tuned to agree here', t.muted,
            { align: 'right', weight: '400' });

    const ep = pairBinding(n, E_COH, NREF), ee = eamBinding(n, E_COH, NREF);
    $('coord-pair').textContent = `${ep.toFixed(2)} eV`;
    $('coord-eam').textContent = `${ee.toFixed(2)} eV`;
    $('coord-diff').textContent = `${(ee / Math.max(ep, 1e-6)).toFixed(1)}×`;
  }
  runWhenVisible($('w-coord'), draw);
}

widgetLoop();
widgetSlope();
widgetLJ();
widgetBox();
widgetCoordination();
widgetMSD();
