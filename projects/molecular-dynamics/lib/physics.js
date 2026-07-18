// Physics for the teaching pages: Lennard-Jones, a 2D MD engine, and the
// coordination behaviour that separates pair potentials from many-body ones.
//
// Units are the same as the rest of the project: Angstrom, femtosecond, amu,
// kcal/mol.  The atoms are modelled on argon.

export const KB = 0.0019872041;          // kcal/(mol K)
export const FORCE_TO_ACCEL = 4.184e-4;  // a[A/fs^2] = this * F[kcal/mol/A] / m[amu]

// Argon: sigma 3.4 A, well depth 120 K in temperature units.
export const SIGMA = 3.4;
export const EPSILON = 120 * KB;         // 0.2385 kcal/mol
export const MASS_AR = 39.95;
export const R_MIN = Math.pow(2, 1 / 6) * SIGMA;   // 3.816 A, bottom of the well
export const R_CUT = 2.5 * SIGMA;                  // 8.5 A

/** Lennard-Jones pair energy, shifted so it reaches exactly zero at the cutoff. */
export function ljEnergy(r, eps = EPSILON, sigma = SIGMA, rc = R_CUT) {
  if (r >= rc) return 0;
  const s6 = Math.pow(sigma / r, 6);
  const c6 = Math.pow(sigma / rc, 6);
  return 4 * eps * (s6 * s6 - s6) - 4 * eps * (c6 * c6 - c6);
}

/** The two halves of it, for the "attraction + repulsion" widget. */
export function ljRepulsion(r, eps = EPSILON, sigma = SIGMA) {
  return 4 * eps * Math.pow(sigma / r, 12);
}
export function ljAttraction(r, eps = EPSILON, sigma = SIGMA) {
  return -4 * eps * Math.pow(sigma / r, 6);
}

/** Force along r (positive = pushing the pair apart). F = -dE/dr. */
export function ljForce(r, eps = EPSILON, sigma = SIGMA, rc = R_CUT) {
  if (r >= rc) return 0;
  const s6 = Math.pow(sigma / r, 6);
  return 24 * eps / r * (2 * s6 * s6 - s6);
}

function gaussPair() {
  let u, v, s;
  do { u = 2 * Math.random() - 1; v = 2 * Math.random() - 1; s = u * u + v * v; }
  while (s >= 1 || s === 0);
  const m = Math.sqrt(-2 * Math.log(s) / s);
  return [u * m, v * m];
}

/**
 * 2D Lennard-Jones molecular dynamics in a box with reflecting walls.
 *
 * Walls rather than periodic boundaries: when the gas condenses you can watch
 * it pull itself into a droplet and then crystallise, which is the whole point
 * of the widget.  Periodic boundaries hide that behind wrap-around.
 */
export class LJBox {
  constructor({ n = 160, width = 150, height = 100, temperature = 120,
                dt = 5, friction = 0.002, mass = MASS_AR } = {}) {
    this.n = n; this.W = width; this.H = height;
    this.T = temperature; this.dt = dt; this.gamma = friction; this.m = mass;
    this.x = new Float64Array(2 * n);
    this.v = new Float64Array(2 * n);
    this.f = new Float64Array(2 * n);
    this.potential = 0;
    this.time = 0;
    this.reset();
  }

  /**
   * Start as a compact triangular cluster at the natural spacing, centred in
   * the box.  Beginning from a spread-out grid instead means the first several
   * thousand steps are just the gas condensing, which the viewer would have to
   * sit through before anything interesting happened.
   */
  reset() {
    const { n } = this;
    const a = R_MIN;                       // natural nearest-neighbour spacing
    const cols = Math.ceil(Math.sqrt(n * 2 / Math.sqrt(3)));
    const rows = Math.ceil(n / cols);
    const w = cols * a, h = rows * a * Math.sqrt(3) / 2;
    const x0 = (this.W - w) / 2, y0 = (this.H - h) / 2;
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      this.x[2 * i] = x0 + (c + (r % 2) * 0.5) * a + (Math.random() - 0.5) * 0.15;
      this.x[2 * i + 1] = y0 + r * a * Math.sqrt(3) / 2 + (Math.random() - 0.5) * 0.15;
    }
    this.setVelocitiesToTemperature(this.T);
    this.computeForces();
    this.time = 0;
  }

  setVelocitiesToTemperature(T) {
    const sig = Math.sqrt(KB * T * FORCE_TO_ACCEL / this.m);
    for (let i = 0; i < this.n; i++) {
      const [a, b] = gaussPair();
      this.v[2 * i] = sig * a;
      this.v[2 * i + 1] = sig * b;
    }
  }

  computeForces() {
    const { n, x, f } = this;
    f.fill(0);
    let pe = 0;
    const rc2 = R_CUT * R_CUT;
    for (let i = 0; i < n; i++) {
      const xi = x[2 * i], yi = x[2 * i + 1];
      for (let j = i + 1; j < n; j++) {
        const dx = x[2 * j] - xi, dy = x[2 * j + 1] - yi;
        const r2 = dx * dx + dy * dy;
        if (r2 >= rc2 || r2 === 0) continue;
        const r = Math.sqrt(r2);
        pe += ljEnergy(r);
        const fr = ljForce(r) / r;      // magnitude / r, so we can scale dx,dy
        f[2 * i] -= fr * dx; f[2 * i + 1] -= fr * dy;
        f[2 * j] += fr * dx; f[2 * j + 1] += fr * dy;
      }
    }
    this.potential = pe;
  }

  step() {
    const { n, x, v, f, dt, m } = this;
    const half = 0.5 * dt;
    const s = FORCE_TO_ACCEL / m * half;

    for (let i = 0; i < 2 * n; i++) v[i] += s * f[i];
    for (let i = 0; i < 2 * n; i++) x[i] += half * v[i];

    const c1 = Math.exp(-this.gamma * dt);
    const c2 = Math.sqrt(1 - c1 * c1) * Math.sqrt(KB * this.T * FORCE_TO_ACCEL / m);
    if (this.gamma > 0) {
      for (let i = 0; i < n; i++) {
        const [a, b] = gaussPair();
        v[2 * i] = c1 * v[2 * i] + c2 * a;
        v[2 * i + 1] = c1 * v[2 * i + 1] + c2 * b;
      }
    }

    for (let i = 0; i < 2 * n; i++) x[i] += half * v[i];
    this.reflect();
    this.computeForces();
    for (let i = 0; i < 2 * n; i++) v[i] += s * f[i];
    this.time += dt;
  }

  reflect() {
    const { n, x, v, W, H } = this;
    for (let i = 0; i < n; i++) {
      if (x[2 * i] < 0) { x[2 * i] = -x[2 * i]; v[2 * i] = Math.abs(v[2 * i]); }
      else if (x[2 * i] > W) { x[2 * i] = 2 * W - x[2 * i]; v[2 * i] = -Math.abs(v[2 * i]); }
      if (x[2 * i + 1] < 0) { x[2 * i + 1] = -x[2 * i + 1]; v[2 * i + 1] = Math.abs(v[2 * i + 1]); }
      else if (x[2 * i + 1] > H) { x[2 * i + 1] = 2 * H - x[2 * i + 1]; v[2 * i + 1] = -Math.abs(v[2 * i + 1]); }
    }
  }

  kinetic() {
    let k = 0;
    for (let i = 0; i < 2 * this.n; i++) k += this.v[i] * this.v[i];
    return 0.5 * this.m * k / FORCE_TO_ACCEL;
  }

  /** Instantaneous temperature; 2 degrees of freedom per atom in 2D. */
  temperature() { return this.kinetic() / (this.n * KB); }

  speeds(out) {
    const a = out || new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      a[i] = Math.hypot(this.v[2 * i], this.v[2 * i + 1]);
    }
    return a;
  }

  /**
   * Start (or restart) a mean-squared-displacement measurement from here.
   *
   * MSD is the standard way an MD run tells a solid from a liquid: in a solid
   * every atom rattles around a fixed site so MSD flattens off, while in a
   * liquid atoms wander and MSD keeps climbing. The slope of that climb is the
   * diffusion coefficient, a number you can compare against experiment.
   */
  markMSD() {
    this.msdRef = Float64Array.from(this.x);
    this.msdCom0 = this.centreOfMass();
    this.msdT0 = this.time;
  }

  centreOfMass() {
    let x = 0, y = 0;
    for (let i = 0; i < this.n; i++) { x += this.x[2 * i]; y += this.x[2 * i + 1]; }
    return [x / this.n, y / this.n];
  }

  /** Mean squared displacement since markMSD(), in A^2, drift removed. */
  msd() {
    if (!this.msdRef) return 0;
    const [cx, cy] = this.centreOfMass();
    const dcx = cx - this.msdCom0[0], dcy = cy - this.msdCom0[1];
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      // Subtract bulk drift, otherwise a droplet sliding across the box would
      // read as diffusion.
      const dx = this.x[2 * i] - dcx - this.msdRef[2 * i];
      const dy = this.x[2 * i + 1] - dcy - this.msdRef[2 * i + 1];
      m += dx * dx + dy * dy;
    }
    return m / this.n;
  }

  /** Neighbours within `cut` of each atom -- used to colour by coordination. */
  coordination(out, cut = 1.35 * R_MIN) {
    const a = out || new Int8Array(this.n);
    a.fill(0);
    const c2 = cut * cut;
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) {
        const dx = this.x[2 * j] - this.x[2 * i], dy = this.x[2 * j + 1] - this.x[2 * i + 1];
        if (dx * dx + dy * dy < c2) { a[i]++; a[j]++; }
      }
    }
    return a;
  }
}

// ---------------------------------------------------------------------------
// Many-body: why metals need more than a sum over pairs.
//
// In a pair model every bond is worth the same, so an atom's binding energy is
// proportional to how many neighbours it has.  In a metal the valence electrons
// are shared, so each extra neighbour gets a thinner slice: binding grows
// roughly like sqrt(n), not n.  That square root is the embedding function of
// the embedded-atom method (Finnis-Sinclair form), and it is genuinely
// many-body -- an atom's energy depends on where all of its neighbours are, not
// just on each one separately.
// ---------------------------------------------------------------------------

/** Binding energy of an atom with n neighbours, pair model. Normalised at nRef. */
export function pairBinding(n, eCohesive, nRef = 12) {
  return eCohesive * (n / nRef);
}

/** Same, embedded-atom (sqrt) model, tuned to agree with the pair model at nRef. */
export function eamBinding(n, eCohesive, nRef = 12) {
  return eCohesive * Math.sqrt(n / nRef);
}
