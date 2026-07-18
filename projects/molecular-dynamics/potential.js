// Neural network potential: per-element MLPs over ANI descriptors, with
// analytic forces.  Pure JavaScript, no runtime dependency, ~165 KB of weights.
//
// Forces are the exact gradient of the predicted energy (backprop through the
// MLP, then the hand-derived AEV Jacobian in aev.js).  They are *not*
// separately predicted: a model whose forces are not the true gradient of its
// energy is non-conservative and will pump energy into the simulation.

import { AEV_LEN, buildTriplets, computeAEV, aevBackward } from './aev.js';

const CELU_ALPHA = 0.1;

function celu(x) {
  return x > 0 ? x : CELU_ALPHA * (Math.exp(x / CELU_ALPHA) - 1);
}
function dcelu(x) {
  return x > 0 ? 1 : Math.exp(x / CELU_ALPHA);
}

/**
 * A dense layer applied to a whole batch of atoms of the same element.
 *
 * All four hydrogens share one network, so processing them together lets each
 * row of W be loaded once and reused across the batch instead of being streamed
 * from L2 four separate times.  The weight matrices here (128x96 = 98 KB)
 * comfortably exceed L1, so this is worth roughly a factor of two -- and the
 * dense matvecs are ~85% of the cost of an evaluation.
 */
class Dense {
  constructor(w, b, nIn, nOut) {
    this.w = Float64Array.from(w);   // row-major, [out][in]
    this.b = Float64Array.from(b);
    this.nIn = nIn;
    this.nOut = nOut;
  }

  /** x: (batch, nIn) -> y: (batch, nOut) */
  forward(x, y, batch) {
    const { w, b, nIn, nOut } = this;
    // Row-outer: one atom's activation vector stays hot in L1 while W streams
    // past. Measured faster than the output-outer order, which reuses W across
    // the batch but costs extra index arithmetic -- these matvecs turn out to
    // be compute-bound, not memory-bound.
    for (let r = 0; r < batch; r++) {
      const xo = r * nIn, yo = r * nOut;
      for (let o = 0; o < nOut; o++) {
        const base = o * nIn;
        let s = b[o];
        for (let i = 0; i < nIn; i++) s += w[base + i] * x[xo + i];
        y[yo + o] = s;
      }
    }
  }

  /** dy: (batch, nOut) -> dx: (batch, nIn) */
  backward(dy, dx, batch) {
    const { w, nIn, nOut } = this;
    dx.fill(0, 0, batch * nIn);
    for (let r = 0; r < batch; r++) {
      const xo = r * nIn, yo = r * nOut;
      for (let o = 0; o < nOut; o++) {
        const g = dy[yo + o];
        if (g === 0) continue;
        const base = o * nIn;
        for (let i = 0; i < nIn; i++) dx[xo + i] += g * w[base + i];
      }
    }
  }
}

class ElementNet {
  constructor(spec, maxBatch) {
    this.layers = spec.layers.map((l) => new Dense(l.w, l.b, l.n_in, l.n_out));
    this.maxBatch = maxBatch;
    this.z = this.layers.map((l) => new Float64Array(maxBatch * l.nOut));
    this.a = this.layers.map((l) => new Float64Array(maxBatch * l.nOut));
    this.d = this.layers.map((l) => new Float64Array(maxBatch * l.nIn));
    this.dyTop = new Float64Array(maxBatch);
  }

  /** g: (batch, 128). Returns the summed output; caches state for backward(). */
  forward(g, batch) {
    let x = g;
    for (let li = 0; li < this.layers.length; li++) {
      const layer = this.layers[li];
      layer.forward(x, this.z[li], batch);
      const last = li === this.layers.length - 1;
      const z = this.z[li], a = this.a[li];
      const count = batch * layer.nOut;
      if (last) {
        a.set(z.subarray(0, count));
      } else {
        for (let i = 0; i < count; i++) a[i] = celu(z[i]);
      }
      x = a;
    }
    const out = this.a[this.a.length - 1];
    let sum = 0;
    for (let r = 0; r < batch; r++) sum += out[r];
    return sum;
  }

  /** d(sum of outputs)/dG for the last forward(), into out: (batch, 128). */
  backward(out, batch) {
    const n = this.layers.length;
    let dy = this.dyTop;
    dy.fill(1.0, 0, batch);
    let dyWidth = 1;
    for (let li = n - 1; li >= 0; li--) {
      const layer = this.layers[li];
      if (li !== n - 1) {
        const z = this.z[li];
        for (let i = 0; i < batch * dyWidth; i++) dy[i] *= dcelu(z[i]);
      }
      layer.backward(dy, this.d[li], batch);
      dy = this.d[li];
      dyWidth = layer.nIn;
    }
    out.set(dy.subarray(0, batch * this.layers[0].nIn));
  }
}

export class ANIPotential {
  constructor(spec) {
    this.species = spec.species;
    this.eMean = spec.e_mean;
    this.eStd = spec.e_std;
    const n = this.species.length;
    this.n = n;

    // Atoms grouped by element: every hydrogen shares one network, so they are
    // evaluated as a single batch.
    this.groups = spec.nets.map((_, e) =>
      this.species.map((s, i) => (s === e ? i : -1)).filter((i) => i >= 0));
    this.nets = spec.nets.map(
      (s, e) => new ElementNet(s, Math.max(1, this.groups[e].length)));
    this.gathered = this.groups.map(
      (g) => new Float64Array(Math.max(1, g.length) * AEV_LEN));
    this.scattered = this.groups.map(
      (g) => new Float64Array(Math.max(1, g.length) * AEV_LEN));

    this.triplets = buildTriplets(n);
    this.aev = new Float64Array(n * AEV_LEN);
    this.dEdG = new Float64Array(n * AEV_LEN);
    this.grad = new Float64Array(n * 3);
  }

  _gather(e) {
    const g = this.groups[e], buf = this.gathered[e];
    for (let r = 0; r < g.length; r++) {
      buf.set(this.aev.subarray(g[r] * AEV_LEN, (g[r] + 1) * AEV_LEN),
              r * AEV_LEN);
    }
    return g.length;
  }

  /**
   * The per-atom contributions the network invents, in kcal/mol.
   *
   * These are NOT a physical quantity and were never trained against anything.
   * No experiment or quantum calculation can say what one atom's share of the
   * energy is. Only their sum is ever compared with the truth. They are exposed
   * here so the teaching page can show exactly that.
   */
  atomEnergies(coords) {
    computeAEV(coords, this.species, this.triplets, this.aev);
    const out = new Float64Array(this.n);
    for (let e = 0; e < this.nets.length; e++) {
      const batch = this._gather(e);
      if (!batch) continue;
      const net = this.nets[e];
      net.forward(this.gathered[e], batch);
      const last = net.a[net.a.length - 1];
      const g = this.groups[e];
      for (let r = 0; r < batch; r++) out[g[r]] = last[r] * this.eStd;
    }
    // e_mean belongs to the molecule as a whole, so spread it evenly rather
    // than pretending any one atom owns it.
    for (let i = 0; i < this.n; i++) out[i] += this.eMean / this.n;
    return out;
  }

  /** Energy in kcal/mol (relative to the CH4 minimum). */
  energy(coords) {
    computeAEV(coords, this.species, this.triplets, this.aev);
    let sum = 0;
    for (let e = 0; e < this.nets.length; e++) {
      const batch = this._gather(e);
      if (batch) sum += this.nets[e].forward(this.gathered[e], batch);
    }
    return sum * this.eStd + this.eMean;
  }

  /**
   * Energy plus forces (kcal/mol/A) written into forcesOut (Float64Array 3N).
   */
  energyAndForces(coords, forcesOut) {
    computeAEV(coords, this.species, this.triplets, this.aev);
    let sum = 0;
    for (let e = 0; e < this.nets.length; e++) {
      const batch = this._gather(e);
      if (!batch) continue;
      const net = this.nets[e];
      sum += net.forward(this.gathered[e], batch);
      net.backward(this.scattered[e], batch);
      const g = this.groups[e], src = this.scattered[e];
      for (let r = 0; r < batch; r++) {
        const dst = g[r] * AEV_LEN, so = r * AEV_LEN;
        for (let f = 0; f < AEV_LEN; f++) {
          this.dEdG[dst + f] = src[so + f] * this.eStd;
        }
      }
    }
    aevBackward(coords, this.species, this.triplets, this.dEdG, this.grad);
    for (let i = 0; i < this.grad.length; i++) forcesOut[i] = -this.grad[i];
    return sum * this.eStd + this.eMean;
  }
}

export async function loadPotential(url) {
  const spec = await (await fetch(url)).json();
  return new ANIPotential(spec);
}
