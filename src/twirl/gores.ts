// Fallback "pendulum gores" (twirl.md section 10): the skirt as hinged gores, each with a flare angle and a lag.
// Used for the 马面裙 (80 gores, flare clamped to 40 degrees, a saw-tooth knife-pleat profile from the surplus
// cloth, zero across the two flat panels) and available for the circle skirt (48 gores, 12 breathing folds).
import { hipR, rng, R_W, WAIST_Z, HEM_MAX_Z, type FabricId } from './model'

export interface Gores {
  cols: number
  rows: number
  su: number
  sv: number
  L: number
  drag: number
  bloomDeg: number
  step(dt: number, psi: number, omega: number): void
  positions(): Float32Array
  hem(): { deg: number; rho: number; z: number }
}

const G = 9.81
const TAU = Math.PI * 2

export function goreSkirt(fabric: FabricId, seed: number): Gores {
  const mam = fabric === 'mamian'
  const N = mam ? 80 : 48
  const cols = mam ? 160 : 96
  const rows = mam ? 12 : 14
  const L = mam ? 0.95 : 0.62
  const thMax = ((mam ? 40 : 86) * Math.PI) / 180
  const th0 = ((mam ? 3 : 9) * Math.PI) / 180 // the cut's own flare at rest (A-line)
  const cTh = mam ? 5 : 3
  const zeta = mam ? 0.5 : 0.25
  const kn = 60
  const th = new Float32Array(N).fill(th0), thv = new Float32Array(N)
  const ph = new Float32Array(N), phv = new Float32Array(N)
  const rnd = rng(seed + 5)
  const famp = Array.from({ length: 12 }, () => 1 + (rnd() * 2 - 1) * 0.3)
  const fph = rnd() * TAU
  const gph = Float32Array.from({ length: N }, () => rnd() * TAU)
  const x = new Float32Array(cols * rows * 3)
  let psi = 0, omega = 0, prevOmega = 0, t = 0

  // the 马面裙's material layout round the hem: front panel at +y, pleat run, back panel, pleat run (metres of cloth)
  const PANEL = 0.16, RUN = 2.09, HEM = 2 * PANEL + 2 * RUN
  const NP = 34 // knife pleats per run

  return {
    cols, rows, su: mam ? 1 : 2, sv: 2, L,
    drag: mam ? 0.9 : 1,
    bloomDeg: mam ? 30 : 65,
    step(dt, ps, w) {
      const n = 4, h = dt / n
      const acc = (w - prevOmega) / dt
      prevOmega = w
      for (let s = 0; s < n; s++) {
        for (let i = 0; i < N; i++) {
          const Om = w - phv[i]
          const a = th[i]
          const lap = th[(i + N - 1) % N] + th[(i + 1) % N] - 2 * a
          const dd = Om * Om * Math.sin(a) * Math.cos(a) + 1.5 * (R_W / L) * Om * Om * Math.cos(a) - 1.5 * (G / L) * Math.sin(a) - cTh * thv[i] + kn * lap
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
          const Wf = Math.sqrt(1.5 * G * Math.cos(th[i]) / L + 0.3 * w * w)
          const pd = acc - 2 * zeta * Wf * phv[i] - Wf * Wf * ph[i]
          phv[i] += pd * h
          ph[i] += phv[i] * h
        }
        t += h
      }
      psi = ps
      omega = w
    },
    positions() {
      const ds = L / (rows - 1)
      for (let c = 0; c < cols; c++) {
        // material angle of this column, and the gore values interpolated at it
        const u = c / cols
        const gf = u * N, g0 = Math.floor(gf), gt = gf - g0
        const ga = g0 % N, gb = (g0 + 1) % N
        const TH = th[ga] * (1 - gt) + th[gb] * gt
        const PH = ph[ga] * (1 - gt) + ph[gb] * gt
        const Om = Math.abs(omega - (phv[ga] * (1 - gt) + phv[gb] * gt))
        const gp = gph[ga] * (1 - gt) + gph[gb] * gt
        let rad = R_W, z = WAIST_Z
        // how the angle is spread down the gore: a hanging drape bends near the hip, a spinning one is nearly straight
        const ex = mam ? 0.15 : 0.8 - 0.74 * smoothstep(0.35, 1.25, TH)
        for (let r = 0; r < rows; r++) {
          const s = r * ds, f = s / L
          if (r > 0) {
            const pol = TH * Math.pow((s - ds / 2) / L, ex)
            rad += Math.sin(pol) * ds
            z -= Math.cos(pol) * ds
          }
          // the hip is implicit: the cloth slides over it
          const hr = hipR(z)
          if (hr > 0 && rad < hr + 0.003) rad = hr + 0.003
          let rr = rad, az: number, zz = Math.min(z, r ? HEM_MAX_Z : WAIST_Z)
          if (!mam) {
            az = psi + u * TAU - PH * f * f
            const C = TAU * (R_W + s)
            const A = r === 0 ? 0 : (2 * rad / 12) * Math.sqrt(Math.max(0, C / (TAU * rad) - 1))
            const fa = u * 12 + fph / TAU, f0 = Math.floor(fa), fr = fa - f0
            const m = famp[((f0 % 12) + 12) % 12] * (1 - fr) + famp[(f0 + 1) % 12] * fr
            rr = rad + A * m * Math.cos(u * 12 * TAU + fph) * Math.min(1, s / 0.12)
            zz += 0.02 * f * f * f * Math.sin(7 * (u * TAU) - 9 * t + gp * 0.2) * Math.min(1, Om / 8)
          } else {
            // 马面裙: material coordinate round the hem, then the angle it takes at this radius
            const mpos = u * HEM // 0 at the middle of the front panel
            const ring = TAU * rad
            const panA = Math.min(PANEL, ring / 4) / rad
            const runA = Math.PI - panA
            const runK = r === 0 ? (Math.PI - PANEL / R_W) / RUN : runA / RUN
            const panK = r === 0 ? 1 / R_W : panA / PANEL
            let a: number, inRun = -1, q = 0
            const m0 = (mpos + PANEL / 2) % HEM
            if (m0 < PANEL) a = (m0 - PANEL / 2) * panK
            else if (m0 < PANEL + RUN) {
              inRun = 0
              q = (m0 - PANEL) / RUN
              a = (PANEL / 2) * panK + (m0 - PANEL) * runK
            } else if (m0 < 2 * PANEL + RUN) a = (PANEL / 2) * panK + RUN * runK + (m0 - PANEL - RUN) * panK
            else {
              inRun = 1
              q = (m0 - 2 * PANEL - RUN) / RUN
              a = (PANEL / 2) * panK + RUN * runK + PANEL * panK + (m0 - 2 * PANEL - RUN) * runK
            }
            az = psi + Math.PI / 2 + a - PH * f * f
            if (inRun >= 0 && r > 0) {
              // knife pleats: a saw-tooth whose depth uses up the surplus cloth at this radius
              const p = (runA * rad) / NP, M = RUN / NP
              const D = Math.min(0.035, Math.max(0, (M * M - p * p) / (2 * M)))
              const tooth = (q * NP) % 1
              const edge = Math.min(1, Math.min(q, 1 - q) * NP * 2) // pleat runs ease into the panels
              rr = rad + D * edge * (tooth - 0.5)
            } else if (r > 0) {
              // a flat panel lies on its chord, not on the circle
              const half = (PANEL / 2) * panK
              const centre = m0 < PANEL ? 0 : half + RUN * runK + half
              rr = (rad * Math.cos(half)) / Math.cos(Math.min(1.2, Math.abs(a - centre)))
            }
          }
          // folds and pleats lie on the hip where they meet it, never inside it
          if (hr > 0) rr = Math.max(rr, hr + 0.004)
          const k = (r * cols + c) * 3
          x[k] = rr * Math.cos(az)
          x[k + 1] = rr * Math.sin(az)
          x[k + 2] = zz
        }
      }
      return x
    },
    hem() {
      const p = this.positions()
      const r0 = (rows - 1) * cols
      let sr = 0, sz = 0
      for (let c = 0; c < cols; c++) {
        const k = (r0 + c) * 3
        sr += Math.hypot(p[k], p[k + 1])
        sz += p[k + 2]
      }
      const rho = sr / cols, z = sz / cols
      return { deg: (Math.atan2(rho - R_W, WAIST_Z - z) * 180) / Math.PI, rho, z }
    },
  }
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
