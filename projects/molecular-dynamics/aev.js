// ANI-style atomic environment vectors + analytic gradients.
//
// Transliterated from src/mdlab/ml/aev_numpy.py, which is itself verified
// against PyTorch autograd to ~1e-10.  Keep the two in sync: tests/test_js_port
// re-checks this file against vectors dumped from the Python implementation.
//
// Descriptor layout (128 long, per atom):
//   [0:32]    radial   index = e*16 + s
//   [32:128]  angular  index = 32 + p*32 + s*8 + t

export const H = 0, C = 1;

export const RC_RADIAL = 5.2;
export const ETA_RADIAL = 16.0;
export const RS_RADIAL = Float64Array.from(
  { length: 16 }, (_, i) => 0.9 + (5.0 - 0.9) * i / 15);

export const RC_ANGULAR = 3.5;
export const ETA_ANGULAR = 8.0;
export const ZETA = 32.0;
export const RS_ANGULAR = Float64Array.from([0.90, 1.55, 2.20, 2.85]);
export const TS_ANGULAR = Float64Array.from(
  { length: 8 }, (_, i) => Math.PI / 16 + i * Math.PI / 4);

export const N_RS_R = 16, N_RS_A = 4, N_TS_A = 8;
export const ANG_BLOCK = N_RS_A * N_TS_A;   // 32
export const AEV_LEN = 128;
const RADIAL_LEN = 32;
const TWO_POW = Math.pow(2.0, 1.0 - ZETA);
const COS_CLAMP = 1.0 - 1e-7;

function fc(r, rc) {
  return r < rc ? 0.5 * Math.cos(Math.PI * r / rc) + 0.5 : 0.0;
}
function dfc(r, rc) {
  return r < rc ? -0.5 * Math.PI / rc * Math.sin(Math.PI * r / rc) : 0.0;
}

// Element pair -> angular block index: (H,H)=0, (H,C)=1, (C,C)=2.
function pairIndex(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return lo === H && hi === H ? 0 : (lo === H && hi === C ? 1 : 2);
}

/** Precompute the (i, j<k) triplet list for a fixed molecule. */
export function buildTriplets(n) {
  const t = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      for (let k = j + 1; k < n; k++) {
        if (k === i) continue;
        t.push([i, j, k]);
      }
    }
  return t;
}

/**
 * coords: Float64Array(3N), species: Int8Array/Array(N), out: Float64Array(N*128)
 */
export function computeAEV(coords, species, triplets, out) {
  const n = species.length;
  out.fill(0);

  // ---- radial ----
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = coords[3 * j] - coords[3 * i];
      const dy = coords[3 * j + 1] - coords[3 * i + 1];
      const dz = coords[3 * j + 2] - coords[3 * i + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r >= RC_RADIAL) continue;
      const f = fc(r, RC_RADIAL);
      const base = i * AEV_LEN + species[j] * N_RS_R;
      for (let s = 0; s < N_RS_R; s++) {
        const d = r - RS_RADIAL[s];
        out[base + s] += 0.25 * Math.exp(-ETA_RADIAL * d * d) * f;
      }
    }
  }

  // ---- angular ----
  const fa = new Float64Array(N_TS_A), fr = new Float64Array(N_RS_A);
  for (let t = 0; t < triplets.length; t++) {
    const [i, j, k] = triplets[t];
    const ax = coords[3 * j] - coords[3 * i],
          ay = coords[3 * j + 1] - coords[3 * i + 1],
          az = coords[3 * j + 2] - coords[3 * i + 2];
    const bx = coords[3 * k] - coords[3 * i],
          by = coords[3 * k + 1] - coords[3 * i + 1],
          bz = coords[3 * k + 2] - coords[3 * i + 2];
    const rij = Math.sqrt(ax * ax + ay * ay + az * az);
    const rik = Math.sqrt(bx * bx + by * by + bz * bz);
    const fcij = fc(rij, RC_ANGULAR), fcik = fc(rik, RC_ANGULAR);
    if (fcij === 0.0 || fcik === 0.0) continue;

    let c = (ax * bx + ay * by + az * bz) / (rij * rik);
    c = Math.min(COS_CLAMP, Math.max(-COS_CLAMP, c));
    const theta = Math.acos(c);
    for (let a = 0; a < N_TS_A; a++)
      fa[a] = TWO_POW * Math.pow(1.0 + Math.cos(theta - TS_ANGULAR[a]), ZETA);
    const rbar = 0.5 * (rij + rik);
    for (let s = 0; s < N_RS_A; s++) {
      const d = rbar - RS_ANGULAR[s];
      fr[s] = Math.exp(-ETA_ANGULAR * d * d);
    }

    const off = i * AEV_LEN + RADIAL_LEN + pairIndex(species[j], species[k]) * ANG_BLOCK;
    const scale = fcij * fcik;
    for (let s = 0; s < N_RS_A; s++)
      for (let a = 0; a < N_TS_A; a++)
        out[off + s * N_TS_A + a] += fr[s] * fa[a] * scale;
  }
  return out;
}

/**
 * Contract dE/dG (N*128) with dG/dx to get dE/dx (3N), written into gradOut.
 */
export function aevBackward(coords, species, triplets, dEdG, gradOut) {
  const n = species.length;
  gradOut.fill(0);

  // ---- radial ----
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = coords[3 * j] - coords[3 * i];
      const dy = coords[3 * j + 1] - coords[3 * i + 1];
      const dz = coords[3 * j + 2] - coords[3 * i + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r >= RC_RADIAL) continue;
      const f = fc(r, RC_RADIAL), df = dfc(r, RC_RADIAL);
      const base = i * AEV_LEN + species[j] * N_RS_R;
      let sum = 0.0;
      for (let s = 0; s < N_RS_R; s++) {
        const d = r - RS_RADIAL[s];
        const ex = Math.exp(-ETA_RADIAL * d * d);
        sum += dEdG[base + s] * 0.25 * (-2.0 * ETA_RADIAL * d * ex * f + ex * df);
      }
      const ux = dx / r, uy = dy / r, uz = dz / r;
      gradOut[3 * i] -= sum * ux; gradOut[3 * i + 1] -= sum * uy; gradOut[3 * i + 2] -= sum * uz;
      gradOut[3 * j] += sum * ux; gradOut[3 * j + 1] += sum * uy; gradOut[3 * j + 2] += sum * uz;
    }
  }

  // ---- angular ----
  const fa = new Float64Array(N_TS_A), dfa = new Float64Array(N_TS_A);
  const fr = new Float64Array(N_RS_A), dfr = new Float64Array(N_RS_A);
  const ga = new Float64Array(N_RS_A), gr = new Float64Array(N_TS_A);

  for (let t = 0; t < triplets.length; t++) {
    const [i, j, k] = triplets[t];
    const ax = coords[3 * j] - coords[3 * i],
          ay = coords[3 * j + 1] - coords[3 * i + 1],
          az = coords[3 * j + 2] - coords[3 * i + 2];
    const bx = coords[3 * k] - coords[3 * i],
          by = coords[3 * k + 1] - coords[3 * i + 1],
          bz = coords[3 * k + 2] - coords[3 * i + 2];
    const rij = Math.sqrt(ax * ax + ay * ay + az * az);
    const rik = Math.sqrt(bx * bx + by * by + bz * bz);
    const fcij = fc(rij, RC_ANGULAR), fcik = fc(rik, RC_ANGULAR);
    if (fcij === 0.0 || fcik === 0.0) continue;

    const cRaw = (ax * bx + ay * by + az * bz) / (rij * rik);
    const c = Math.min(COS_CLAMP, Math.max(-COS_CLAMP, cRaw));
    const clamped = cRaw !== c;
    const theta = Math.acos(c);

    for (let a = 0; a < N_TS_A; a++) {
      const p = 1.0 + Math.cos(theta - TS_ANGULAR[a]);
      fa[a] = TWO_POW * Math.pow(p, ZETA);
      dfa[a] = TWO_POW * ZETA * Math.pow(p, ZETA - 1.0) * (-Math.sin(theta - TS_ANGULAR[a]));
    }
    const rbar = 0.5 * (rij + rik);
    for (let s = 0; s < N_RS_A; s++) {
      const d = rbar - RS_ANGULAR[s];
      fr[s] = Math.exp(-ETA_ANGULAR * d * d);
      dfr[s] = -ETA_ANGULAR * d * fr[s];   // d rbar/dRij = d rbar/dRik = 1/2
    }

    const off = i * AEV_LEN + RADIAL_LEN + pairIndex(species[j], species[k]) * ANG_BLOCK;
    ga.fill(0); gr.fill(0);
    for (let s = 0; s < N_RS_A; s++)
      for (let a = 0; a < N_TS_A; a++) {
        const g = dEdG[off + s * N_TS_A + a];
        ga[s] += g * fa[a];
        gr[a] += g * fr[s];
      }

    let gaDfr = 0, gaFr = 0, grDfa = 0;
    for (let s = 0; s < N_RS_A; s++) { gaDfr += ga[s] * dfr[s]; gaFr += ga[s] * fr[s]; }
    for (let a = 0; a < N_TS_A; a++) grDfa += gr[a] * dfa[a];

    const dEdTheta = grDfa * fcij * fcik;
    const common = gaDfr * fcij * fcik;
    const dEdRij = common + gaFr * dfc(rij, RC_ANGULAR) * fcik;
    const dEdRik = common + gaFr * fcij * dfc(rik, RC_ANGULAR);

    const uax = ax / rij, uay = ay / rij, uaz = az / rij;
    const ubx = bx / rik, uby = by / rik, ubz = bz / rik;
    gradOut[3 * i] += -dEdRij * uax - dEdRik * ubx;
    gradOut[3 * i + 1] += -dEdRij * uay - dEdRik * uby;
    gradOut[3 * i + 2] += -dEdRij * uaz - dEdRik * ubz;
    gradOut[3 * j] += dEdRij * uax; gradOut[3 * j + 1] += dEdRij * uay; gradOut[3 * j + 2] += dEdRij * uaz;
    gradOut[3 * k] += dEdRik * ubx; gradOut[3 * k + 1] += dEdRik * uby; gradOut[3 * k + 2] += dEdRik * ubz;

    if (clamped) continue;   // clamp passes zero gradient outside its bounds
    const w = dEdTheta * (-1.0 / Math.sqrt(Math.max(1e-30, 1.0 - c * c)));
    const inv = 1.0 / (rij * rik);
    const cij = c / (rij * rij), cik = c / (rik * rik);
    const dcvij = [bx * inv - cij * ax, by * inv - cij * ay, bz * inv - cij * az];
    const dcvik = [ax * inv - cik * bx, ay * inv - cik * by, az * inv - cik * bz];
    for (let d = 0; d < 3; d++) {
      gradOut[3 * j + d] += w * dcvij[d];
      gradOut[3 * k + d] += w * dcvik[d];
      gradOut[3 * i + d] -= w * (dcvij[d] + dcvik[d]);
    }
  }
  return gradOut;
}
