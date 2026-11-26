// The skirts on the stand (twirl.md section 5): the circle skirt as a polar XPBD grid, the 马面裙 as a
// pleated tube, the collisions with the dress form's hip and the pole, and the stand's coast-down.
import { Cloth } from '../cloth/solver'

export const WAIST_Z = 1.02
export const R_W = 0.11
export const HIP_Z = 0.92
export const HEM_MAX_Z = WAIST_Z - 0.02
const SKIN = 0.004

export type FabricId = 'chiffon' | 'mamian'

export interface Skirt {
  id: FabricId
  cloth: Cloth
  S: number
  Smin: number
  /** cloth length waist to hem (m) */
  L: number
  /** the stand's air-drag factor (5.2) */
  drag: number
  /** waist layout: angle and radius of each column at psi = 0 */
  wa: Float32Array
  wr: Float32Array
  /** bloom threshold, degrees */
  bloomDeg: number
}

export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Hip radius at height z (a cone from the waist to the hip cap, with a rounded lower edge), or -1 if none. */
export function hipR(z: number) {
  if (z > WAIST_Z + 0.01) return -1
  if (z >= HIP_Z) return 0.105 + ((WAIST_Z - z) / (WAIST_Z - HIP_Z)) * 0.045
  if (z >= HIP_Z - 0.03) {
    const q = (HIP_Z - z) / 0.03
    return 0.12 + 0.03 * Math.sqrt(Math.max(0, 1 - q * q))
  }
  return -1
}

/** Stand state shared with the collision (the form's surface carries the cloth by friction). */
export const stand = { psi: 0, omega: 0 }

/** Collision with the hip, its cap, the pole and the floor (README 3.3), plus the hem clamp (5.3). */
export function collide(c: Cloth, i: number, h: number) {
  const x = c.x, p = c.p
  const k = i * 3
  let px = x[k], py = x[k + 1], pz = x[k + 2]
  const r = Math.hypot(px, py)
  let d = 0, mx = 0, my = 0, mz = 0
  const R = hipR(pz)
  if (R > 0 && r < R + SKIN) {
    d = R + SKIN - r
    mx = r > 1e-6 ? px / r : 1
    my = r > 1e-6 ? py / r : 0
  } else if (pz < HIP_Z - 0.03 + SKIN && pz > HIP_Z - 0.05 && r < 0.12) {
    // under the hip cap: push down
    d = pz - (HIP_Z - 0.05)
    mz = -1
  } else if (pz < HIP_Z && r < 0.02 + SKIN) {
    d = 0.02 + SKIN - r
    mx = r > 1e-6 ? px / r : 1
    my = r > 1e-6 ? py / r : 0
  } else if (pz < SKIN) {
    d = SKIN - pz
    mz = 1
  }
  if (d > 0) {
    px += mx * d; py += my * d; pz += mz * d
    // friction on the tangential part of this substep's displacement, relative to the surface
    const turning = mz === 0 && pz > HIP_Z - 0.05
    const sx = turning ? -stand.omega * py * h : 0, sy = turning ? stand.omega * px * h : 0
    let tx = px - p[k] - sx, ty = py - p[k + 1] - sy, tz = pz - p[k + 2]
    const dn = tx * mx + ty * my + tz * mz
    tx -= dn * mx; ty -= dn * my; tz -= dn * mz
    const tl = Math.hypot(tx, ty, tz)
    if (tl < 0.4 * d) {
      px -= tx; py -= ty; pz -= tz
    } else if (tl > 0) {
      const f = Math.min(1, (0.3 * d) / tl)
      px -= tx * f; py -= ty * f; pz -= tz * f
    }
  }
  if (pz > HEM_MAX_Z && i >= c.cols * 1) pz = Math.min(pz, HEM_MAX_Z + (i < c.cols * 2 ? 0.02 : 0))
  // the cloth never curls up over the ring above it, so its underside never faces the camera (G2)
  if (i >= c.cols * 2) {
    const zu = x[(i - c.cols) * 3 + 2] - 0.001
    if (pz > zu) pz = zu
  }
  x[k] = px; x[k + 1] = py; x[k + 2] = pz
}

/** The 12-fold pleat depth (5.6) for a ring at slant s sitting at horizontal radius rho. */
export const foldA = (s: number, rho: number, n = 12) => (2 * rho / n) * Math.sqrt(Math.max(0, (2 * Math.PI * (R_W + s)) / (2 * Math.PI * rho) - 1))

/** Full circle skirt (chiffon): 96 spokes by 14 rings, hanging in 12 seeded folds. */
export function circleSkirt(seed: number): Skirt {
  const cols = 96, rows = 14, L = 0.62, dr = L / (rows - 1)
  const c = new Cloth(cols, rows)
  c.damp = 0.3
  c.air = 10
  // rest lengths from the flat circle
  const fx = new Float32Array(c.n * 2)
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const a = (2 * Math.PI * k) / cols, R = R_W + r * dr
      fx[2 * (r * cols + k)] = R * Math.cos(a)
      fx[2 * (r * cols + k) + 1] = R * Math.sin(a)
    }
  const rest = (i: number, j: number) => Math.hypot(fx[2 * i] - fx[2 * j], fx[2 * i + 1] - fx[2 * j + 1])
  c.build(rest, 0.3, () => 10, 10)
  // starting shape: each ring on the cone it would hang in, pushed in and out by 12 uneven folds
  const rnd = rng(seed)
  const amp = Array.from({ length: 12 }, () => 1 + (rnd() * 2 - 1) * 0.3)
  const phase = rnd() * Math.PI * 2
  const wa = new Float32Array(cols), wr = new Float32Array(cols).fill(R_W)
  for (let k = 0; k < cols; k++) wa[k] = (2 * Math.PI * k) / cols
  for (let r = 0; r < rows; r++) {
    const s = r * dr
    const rho = R_W + 0.045 * smooth(0, 0.12, s) + Math.max(0, s - 0.1) * 0.17
    const z = WAIST_Z - Math.sqrt(Math.max(0, s * s - (rho - R_W) ** 2))
    const A = foldA(s, rho) * smooth(0, 0.16, s)
    for (let k = 0; k < cols; k++) {
      const a = wa[k]
      const fa = (a * 12) / (2 * Math.PI) + phase / (2 * Math.PI)
      const f0 = Math.floor(fa), fr = fa - f0
      const m = amp[((f0 % 12) + 12) % 12] * (1 - fr) + amp[(((f0 + 1) % 12) + 12) % 12] * fr
      const rr = rho + A * m * Math.cos(12 * a + phase)
      const i = (r * cols + k) * 3
      c.x[i] = rr * Math.cos(a)
      c.x[i + 1] = rr * Math.sin(a)
      c.x[i + 2] = z
    }
  }
  c.p.set(c.x)
  return { id: 'chiffon', cloth: c, S: 10, Smin: 7, L, drag: 1, wa, wr, bloomDeg: 65 }
}

/**
 * 马面裙 (5.5): a 4.5 m by 0.95 m rectangle as a tube, 150 columns by 10 rows. Two flat panels (马面) front
 * and back, knife-pleat runs at the sides whose round bend constraints keep the pressed (folded) rest shape.
 */
export function mamianSkirt(o: { pleat?: number; down?: number; panel?: number; shear?: number } = {}): Skirt {
  const cols = 150, rows = 10, L = 0.95, dv = L / (rows - 1), du = 0.03
  const c = new Cloth(cols, rows)
  c.damp = 0.5
  c.air = 3
  // layout: panel (6 columns), pleats (69), panel (6), pleats (69); the front panel faces +y at psi = 0
  const P = 6, Q = 69
  const kind = new Uint8Array(cols) // 0 panel, 1 pleat
  for (let k = 0; k < cols; k++) kind[k] = k < P || (k >= P + Q && k < 2 * P + Q) ? 0 : 1
  const gap = (2 * Math.PI * R_W - 2 * (P - 1) * du - 4 * 0.015) / (2 * (Q - 1))
  const wa = new Float32Array(cols), wr = new Float32Array(cols)
  let a = Math.PI / 2 - ((P - 1) * du) / 2 / R_W
  let q = 0
  for (let k = 0; k < cols; k++) {
    wa[k] = a
    if (kind[k]) q++
    wr[k] = kind[k] && q % 2 === 0 ? R_W + 0.006 : R_W
    if (!kind[k]) q = 0
    const next = (k + 1) % cols
    const step = kind[k] === kind[next] ? (kind[k] ? gap : du) : 0.015
    a += step / R_W
  }
  // starting shape per row: panels keep their 0.15 m width, the pleat runs fan into the rest as a radial zigzag
  const start = new Float32Array(c.n * 3)
  for (let r = 0; r < rows; r++) {
    const s = r * dv
    const R = r === 0 ? R_W : 0.158 + (s - dv) * 0.06
    const z = r === 0 ? WAIST_Z : WAIST_Z - Math.sqrt(Math.max(0, s * s - (R - R_W) ** 2))
    const panelA = ((P - 1) * du) / R, trans = 0.015 / R
    const pleatA = (2 * Math.PI - 2 * panelA - 4 * trans) / 2
    const t = (R * pleatA) / (Q - 1)
    const D = Math.sqrt(Math.max(0, du * du - t * t))
    let ang = Math.PI / 2 - panelA / 2
    let qq = 0
    for (let k = 0; k < cols; k++) {
      let rr = R
      if (kind[k]) {
        qq++
        if (qq % 2 === 0) rr = R + (r === 0 ? 0.006 : D)
      } else qq = 0
      if (r === 0) {
        ang = wa[k]
        rr = wr[k]
      }
      const i = (r * cols + k) * 3
      start[i] = rr * Math.cos(ang)
      start[i + 1] = rr * Math.sin(ang)
      start[i + 2] = z
      const next = (k + 1) % cols
      ang += kind[k] === kind[next] ? (kind[k] ? pleatA / (Q - 1) : panelA / (P - 1)) : trans
    }
  }
  const rest = (i: number, j: number) => {
    const ri = Math.floor(i / cols), rj = Math.floor(j / cols), ci = i % cols, cj = j % cols
    const dc = Math.min((cj - ci + cols) % cols, (ci - cj + cols) % cols)
    const dr = Math.abs(rj - ri)
    if (dr === 0 && dc === 2 && (kind[ci] || kind[cj]) && ri > 0)
      return Math.hypot(start[3 * i] - start[3 * j], start[3 * i + 1] - start[3 * j + 1], start[3 * i + 2] - start[3 * j + 2])
    return Math.hypot(dc * du, dr * dv)
  }
  c.build(rest, o.shear ?? 0.08, (k) => (kind[k] || kind[(k + 2) % cols] ? (o.pleat ?? 1.5) : (o.panel ?? 0.8)), o.down ?? 2)
  c.x.set(start)
  c.p.set(start)
  return { id: 'mamian', cloth: c, S: 10, Smin: 7, L, drag: 0.9, wa, wr, bloomDeg: 30 }
}

/** Set the waistband targets for this frame (psi from psi0 to psi1). */
export function drive(sk: Skirt, psi0: number, psi1: number) {
  const { cloth, wa, wr } = sk
  for (let k = 0; k < cloth.cols; k++) {
    const i = k * 3
    cloth.d0[i] = wr[k] * Math.cos(wa[k] + psi0)
    cloth.d0[i + 1] = wr[k] * Math.sin(wa[k] + psi0)
    cloth.d0[i + 2] = WAIST_Z
    cloth.d1[i] = wr[k] * Math.cos(wa[k] + psi1)
    cloth.d1[i + 1] = wr[k] * Math.sin(wa[k] + psi1)
    cloth.d1[i + 2] = WAIST_Z
  }
}

/** Mean hem angle from vertical (degrees) and mean hem radius (m). */
export function hem(sk: Skirt) {
  const { cloth } = sk
  const r0 = (cloth.rows - 1) * cloth.cols
  let sr = 0, sz = 0
  for (let k = 0; k < cloth.cols; k++) {
    const i = (r0 + k) * 3
    sr += Math.hypot(cloth.x[i], cloth.x[i + 1])
    sz += cloth.x[i + 2]
  }
  const rho = sr / cloth.cols, z = sz / cloth.cols
  return { deg: (Math.atan2(rho - R_W, WAIST_Z - z) * 180) / Math.PI, rho, z }
}

/** The stand's coast-down (5.2): bearing dry and viscous friction plus air on the skirt. */
export function coast(omega: number, dt: number, f: number) {
  const a = 0.5 + 0.15 * Math.abs(omega) + 0.02 * f * omega * omega
  const dw = a * dt
  return Math.abs(omega) <= dw ? 0 : omega - Math.sign(omega) * dw
}
