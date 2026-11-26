// The skirt model: "pendulum gores" (twirl.md section 10 fallback), the default since the lead's gate.
// Each gore has a flare angle and a lag; the surface is rebuilt from them every frame, with folds that breathe
// (5.6), uneven and seeded, a hem that flutters at speed, and per skirt:
//   chiffon: 48 gores, 12 folds, and a matte slip underneath (shorter, no folds) so nothing hard shows through;
//   denim:   48 gores, 8 stiff folds, a 0.50 m umbrella skirt;
//   mamian:  80 gores, flare clamped to 40 degrees, knife pleats as a saw-tooth whose inner face opens with the
//            flare, zero across the two flat panels (the 马面);
//   tulle:   three stiff layers that stand out at rest.
import { hipR, rng, R_W, WAIST_Z, HEM_MAX_Z } from './model'
import { MAMIAN } from './bake'

export type FabricId = 'chiffon' | 'denim' | 'mamian' | 'tulle'

interface Spec {
  N: number
  cols: number
  rows: number
  L: number
  thMax: number
  th0: number
  cTh: number
  zeta: number
  folds: number
  foldK: number
  su: number
  sv: number
}

const G = 9.81
const TAU = Math.PI * 2
const D2R = Math.PI / 180

export interface Layer {
  cols: number
  rows: number
  su: number
  sv: number
  x: Float32Array
  m?: Float32Array
}

export interface Gores {
  id: FabricId
  L: number
  drag: number
  bloomDeg: number
  /** cloth layers, inner first (the slip, the tulle tiers); the last is the skirt itself */
  layers: Layer[]
  step(dt: number, psi: number, omega: number): void
  update(): void
  hem(): { deg: number; rho: number; z: number }
  /** set every gore's flare (a skirt dropped over the form arrives with its hem spread) */
  spread(deg: number): void
  /** world position of the outer layer at material u (0..1 round) and fraction f down */
  point(u: number, f: number): [number, number, number]
}

class Pend {
  th: Float32Array
  thv: Float32Array
  ph: Float32Array
  phv: Float32Array
  constructor(public s: Spec) {
    this.th = new Float32Array(s.N).fill(s.th0)
    this.thv = new Float32Array(s.N)
    this.ph = new Float32Array(s.N)
    this.phv = new Float32Array(s.N)
  }
  step(h: number, w: number, acc: number) {
    const { N, L, th0, thMax, cTh, zeta } = this.s
    const { th, thv, ph, phv } = this
    for (let i = 0; i < N; i++) {
      const Om = w - phv[i]
      const a = th[i]
      const lap = th[(i + N - 1) % N] + th[(i + 1) % N] - 2 * a
      const dd = Om * Om * Math.sin(a) * Math.cos(a) + 1.5 * (R_W / L) * Om * Om * Math.cos(a) - 1.5 * (G / L) * Math.sin(a - th0 * 0.9) - cTh * thv[i] + 60 * lap
      thv[i] += dd * h
      th[i] += thv[i] * h
      if (th[i] < th0) {
        th[i] = th0
        if (thv[i] < 0) thv[i] = 0
      }
      if (th[i] > thMax) {
        th[i] = thMax
        if (thv[i] > 0) thv[i] = 0
      }
      const Wf = Math.sqrt((1.5 * G * Math.cos(th[i])) / L + 0.3 * w * w)
      phv[i] += (acc - 2 * zeta * Wf * phv[i] - Wf * Wf * ph[i]) * h
      ph[i] += phv[i] * h
    }
  }
  /** interpolated gore values at material u */
  at(u: number, omega: number) {
    const N = this.s.N
    const gf = (((u % 1) + 1) % 1) * N, g0 = Math.floor(gf), t = gf - g0
    const a = g0 % N, b = (g0 + 1) % N
    return {
      th: this.th[a] * (1 - t) + this.th[b] * t,
      ph: this.ph[a] * (1 - t) + this.ph[b] * t,
      om: Math.abs(omega - (this.phv[a] * (1 - t) + this.phv[b] * t)),
    }
  }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Smooth periodic noise round the skirt: a few seeded sines. */
function ringNoise(seed: number, terms = 4) {
  const r = rng(seed)
  const k = Array.from({ length: terms }, (_, i) => [i + 1, r() * TAU, (r() * 2 - 1) / (i + 1)])
  return (u: number) => k.reduce((s, [n, p, a]) => s + a * Math.sin(n * u * TAU + p), 0)
}

/** Fold shape: uneven widths (a warped phase), seeded depths with two or three deep folds, slightly skewed. */
function folds(seed: number, n: number) {
  const warp = ringNoise(seed + 1, 3)
  const r = rng(seed + 2)
  const amp = Array.from({ length: n }, () => 0.7 + r() * 0.6)
  const deep = [Math.floor(r() * n), Math.floor(r() * n), Math.floor(r() * n)]
  for (const d of deep.slice(0, 2 + Math.floor(r() * 2))) amp[d] = 1.55 + r() * 0.3
  const ph = r() * TAU
  return (u: number) => {
    const x = u * n + warp(u) * 0.35 + ph / TAU
    const f0 = Math.floor(x), fr = x - f0
    const i0 = ((f0 % n) + n) % n, i1 = (i0 + 1) % n
    const s = fr * fr * (3 - 2 * fr)
    const m = amp[i0] * (1 - s) + amp[i1] * s
    const q = x * TAU
    return m * (Math.cos(q) + 0.28 * Math.sin(2 * q)) / 1.1
  }
}

const SPECS: Record<string, Spec> = {
  chiffon: { N: 48, cols: 96, rows: 14, L: 0.62, thMax: 86, th0: 9, cTh: 3, zeta: 0.25, folds: 12, foldK: 1, su: 2, sv: 2 },
  denim: { N: 48, cols: 96, rows: 12, L: 0.5, thMax: 84, th0: 13, cTh: 8, zeta: 0.7, folds: 8, foldK: 0.6, su: 2, sv: 2 },
  mamian: { N: 80, cols: 440, rows: 12, L: 0.95, thMax: 40, th0: 3, cTh: 5, zeta: 0.5, folds: 0, foldK: 0, su: 1, sv: 2 },
  tulle0: { N: 32, cols: 64, rows: 6, L: 0.4, thMax: 80, th0: 55, cTh: 6, zeta: 0.5, folds: 10, foldK: 0.35, su: 2, sv: 2 },
  tulle1: { N: 32, cols: 64, rows: 6, L: 0.36, thMax: 83, th0: 62, cTh: 6, zeta: 0.5, folds: 10, foldK: 0.35, su: 2, sv: 2 },
  tulle2: { N: 32, cols: 64, rows: 6, L: 0.32, thMax: 86, th0: 70, cTh: 6, zeta: 0.5, folds: 10, foldK: 0.35, su: 2, sv: 2 },
}
const spec = (k: string): Spec => {
  const s = SPECS[k]
  return { ...s, thMax: s.thMax * D2R, th0: s.th0 * D2R }
}

export function goreSkirt(id: FabricId, seed: number): Gores {
  const parts = id === 'tulle' ? ['tulle0', 'tulle1', 'tulle2'] : [id]
  const pends = parts.map((k) => new Pend(spec(k)))
  const main = pends[pends.length - 1]
  const mam = id === 'mamian'
  const mk = (s: Spec): Layer => ({ cols: s.cols, rows: s.rows, su: s.su, sv: s.sv, x: new Float32Array(s.cols * s.rows * 3), m: mam ? new Float32Array(s.cols * s.rows) : undefined })
  const outs = pends.map((p) => mk(p.s))
  // chiffon's slip: shorter, no folds, matte, inside the deepest fold
  const slip: Layer | null = id === 'chiffon' ? { cols: 48, rows: 12, su: 2, sv: 2, x: new Float32Array(48 * 12 * 3) } : null
  const layers = slip ? [slip, ...outs] : outs
  const fold = pends.map((p, k) => folds(seed * 7 + k * 13 + 3, p.s.folds || 1))
  const hemN = ringNoise(seed * 3 + 11, 4)
  let psi = 0, omega = 0, prevOmega = 0, t = 0

  // centre line of one column of one layer: radius and height at each row (and the polar angle there)
  const cRad = new Float32Array(64), cZ = new Float32Array(64), cPol = new Float32Array(64)
  const centre = (p: Pend, TH: number) => {
    const { L, rows } = p.s
    const ds = L / (rows - 1)
    const ex = mam ? 0.15 : 0.8 - 0.74 * smoothstep(0.35, 1.25, TH)
    let rad = R_W, z = WAIST_Z
    for (let r = 0; r < rows; r++) {
      const s = r * ds
      let pol = 0
      if (r > 0) {
        pol = TH * Math.pow((s - ds / 2) / L, ex)
        rad += Math.sin(pol) * ds
        z -= Math.cos(pol) * ds
      }
      const hr = hipR(z)
      if (hr > 0 && rad < hr + 0.003) rad = hr + 0.003
      cRad[r] = rad
      cZ[r] = z
      cPol[r] = pol
    }
  }

  const build = (k: number) => {
    const p = pends[k], out = outs[k]
    const { cols, rows, L, folds: nf, foldK } = p.s
    const ds = L / (rows - 1)
    const x = out.x
    const HEM = 2 * MAMIAN.PANEL + 2 * MAMIAN.RUN
    const NP = 34
    for (let c = 0; c < cols; c++) {
      const u = c / cols
      const { th: TH, ph: PH, om: Om } = p.at(u, omega)
      centre(p, TH)
      const spin = Math.min(1, Om / 8)
      const fu = fold[k](u)
      const hn = hemN(u)
      let floor = 0
      for (let r = 0; r < rows; r++) {
        const s = r * ds, f = s / L
        const rad = cRad[r]
        let rr = rad, az: number
        let zz = Math.min(cZ[r], r ? HEM_MAX_Z : WAIST_Z)
        let mix = 0
        if (!mam) {
          az = psi + u * TAU - PH * f * f
          const C = TAU * (R_W + s)
          const A = r === 0 ? 0 : (2 * rad / nf) * Math.sqrt(Math.max(0, C / (TAU * rad) - 1)) * foldK
          rr = rad + A * fu * Math.min(1, s / 0.12)
          // chiffon's valleys rest on the slip, never deeper
          if (slip && r > 0) rr = Math.max(rr, R_W + (SLIP_R / SLIP_Z) * 1.05 * (rad - R_W) + 0.004, floor)
          // the hem: a slight seeded undulation at rest; at speed a flutter of three waves running back round it
          zz += f * f * (0.012 * hn * (1 - spin) + spin * (0.016 * f * Math.sin(3 * u * TAU + 7 * t) + 0.006 * Math.sin(8 * u * TAU + 13 * t)))
        } else {
          const m0 = (u * HEM + MAMIAN.PANEL / 2) % HEM
          const ring = TAU * rad
          const panA = Math.min(MAMIAN.PANEL, ring / 4) / rad
          const runA = Math.PI - panA
          const runK = r === 0 ? (Math.PI - MAMIAN.PANEL / R_W) / MAMIAN.RUN : runA / MAMIAN.RUN
          const panK = r === 0 ? 1 / R_W : panA / MAMIAN.PANEL
          const half = (MAMIAN.PANEL / 2) * panK
          let a: number, q = -1, centreA = 0
          if (m0 < MAMIAN.PANEL) a = (m0 - MAMIAN.PANEL / 2) * panK
          else if (m0 < MAMIAN.PANEL + MAMIAN.RUN) {
            q = (m0 - MAMIAN.PANEL) / MAMIAN.RUN
            a = half + (m0 - MAMIAN.PANEL) * runK
          } else if (m0 < 2 * MAMIAN.PANEL + MAMIAN.RUN) {
            centreA = half + MAMIAN.RUN * runK + half
            a = half + MAMIAN.RUN * runK + (m0 - MAMIAN.PANEL - MAMIAN.RUN) * panK
          } else {
            q = (m0 - 2 * MAMIAN.PANEL - MAMIAN.RUN) / MAMIAN.RUN
            a = half + MAMIAN.RUN * runK + MAMIAN.PANEL * panK + (m0 - 2 * MAMIAN.PANEL - MAMIAN.RUN) * runK
          }
          az = psi + Math.PI / 2 + a - PH * f * f
          if (q >= 0 && r > 0) {
            // knife pleats: outer face then the inner face; the inner face widens as the pleat fans open
            const pch = (runA * rad) / NP, M = MAMIAN.RUN / NP
            const D = Math.min(0.035, Math.max(0, (M * M - pch * pch) / (2 * M)))
            const open = 1 - D / 0.035
            const pf = 0.86 - 0.26 * open * open
            const tooth = (q * NP) % 1
            const edge = Math.min(1, Math.min(q, 1 - q) * NP * 2)
            const Dd = Math.max(D, 0.012 * open * f) * edge
            rr = rad + Dd * (tooth < pf ? tooth / pf - 0.5 : 0.5 - (tooth - pf) / (1 - pf))
            if (tooth >= pf) mix = edge * smoothstep(0.1, 0.6, open) * 0.85
          } else if (r > 0) {
            // a flat panel lies on its chord, not on the circle
            rr = (rad * Math.cos(half)) / Math.cos(Math.min(1.2, Math.abs(a - centreA)))
          }
          zz += spin * f * f * f * 0.03 * Math.sin(5 * u * TAU + 6 * t)
        }
        const hr = hipR(zz)
        if (hr > 0) rr = Math.max(rr, hr + 0.004)
        if (slip && r > 0) floor = Math.max(floor, hr + 0.004)
        const i = (r * cols + c) * 3
        x[i] = rr * Math.cos(az)
        x[i + 1] = rr * Math.sin(az)
        x[i + 2] = zz
        if (out.m) out.m[r * cols + c] = mix
      }
    }
  }

  // the slip: the chiffon's own centre line pulled in toward the waist (radius x SLIP_R, drop x SLIP_Z), so it
  // hangs inside the folds at rest and is a smaller ring under the disc at speed
  const SLIP_R = 0.4, SLIP_Z = 0.85
  const buildSlip = () => {
    if (!slip) return
    const p = main
    const rows = p.s.rows
    for (let c = 0; c < slip.cols; c++) {
      const u = c / slip.cols
      const { th: TH, ph: PH } = p.at(u, omega)
      centre(p, TH)
      let prev = 0
      for (let r = 0; r < slip.rows; r++) {
        const fr = (r / (slip.rows - 1)) * (rows - 1)
        const j = Math.min(rows - 2, Math.floor(fr)), q = fr - j
        let rad = R_W - 0.001 + SLIP_R * (cRad[j] * (1 - q) + cRad[j + 1] * q - R_W)
        const z = WAIST_Z + SLIP_Z * (Math.min(cZ[j] * (1 - q) + cZ[j + 1] * q, r ? HEM_MAX_Z : WAIST_Z) - WAIST_Z)
        const hr = hipR(z)
        if (hr > 0) rad = Math.max(rad, hr + 0.002)
        // it falls straight from the hip, never tucks in under it
        if (r > 1) rad = Math.max(rad, prev)
        prev = rad
        const f = fr / (rows - 1)
        const az = psi + u * TAU - PH * f * f
        const i = (r * slip.cols + c) * 3
        slip.x[i] = rad * Math.cos(az)
        slip.x[i + 1] = rad * Math.sin(az)
        slip.x[i + 2] = z
      }
    }
  }

  const g: Gores = {
    id,
    L: main.s.L,
    drag: id === 'denim' ? 0.6 : id === 'mamian' ? 0.9 : id === 'tulle' ? 1.6 : 1,
    bloomDeg: mam ? 30 : 65,
    layers,
    step(dt, ps, w) {
      const n = 4, h = dt / n
      const acc = (w - prevOmega) / dt
      prevOmega = w
      for (let s = 0; s < n; s++) {
        for (const p of pends) p.step(h, w, acc)
        t += h
      }
      psi = ps
      omega = w
    },
    update() {
      for (let k = 0; k < pends.length; k++) build(k)
      buildSlip()
    },
    hem() {
      const out = outs[outs.length - 1]
      const { cols, rows } = main.s
      const r0 = (rows - 1) * cols
      let sr = 0, sz = 0
      for (let c = 0; c < cols; c++) {
        const k = (r0 + c) * 3
        sr += Math.hypot(out.x[k], out.x[k + 1])
        sz += out.x[k + 2]
      }
      const rho = sr / cols, z = sz / cols
      return { deg: (Math.atan2(rho - R_W, WAIST_Z - z) * 180) / Math.PI, rho, z }
    },
    spread(deg) {
      for (const p of pends) p.th.fill(Math.max(p.s.th0, Math.min(p.s.thMax, deg * D2R)))
    },
    point(u, f) {
      const out = outs[outs.length - 1]
      const { cols, rows } = main.s
      const c = Math.round((((u % 1) + 1) % 1) * cols) % cols, r = Math.round(f * (rows - 1))
      const i = (r * cols + c) * 3
      return [out.x[i], out.x[i + 1], out.x[i + 2]]
    },
  }
  g.update()
  return g
}
