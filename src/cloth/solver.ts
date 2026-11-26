// XPBD cloth with small steps (README section 3.1 to 3.3), on a grid whose columns wrap round
// (a skirt is a tube: column `cols` is column 0 again) and whose row 0 is driven (the waistband).
// State lives in typed arrays and survives a lost GL context.

export type Collide = (c: Cloth, i: number, h: number) => void

export class Cloth {
  readonly cols: number
  readonly rows: number
  readonly n: number
  x: Float32Array
  p: Float32Array
  w: Float32Array
  /** unit normal per particle (outer face), refreshed once per frame by normals() */
  nrm: Float32Array
  /** driven targets: from (start of frame) and to (end of frame) */
  d0: Float32Array
  d1: Float32Array
  private ci: Int32Array
  private cr: Float32Array
  private ck: Float32Array
  private nc = 0
  g = 9.81
  damp = 0.3
  air = 10
  turb = 0.08
  t = 0

  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.n = cols * rows
    this.x = new Float32Array(this.n * 3)
    this.p = new Float32Array(this.n * 3)
    this.w = new Float32Array(this.n).fill(1)
    this.nrm = new Float32Array(this.n * 3)
    this.d0 = new Float32Array(cols * 3)
    this.d1 = new Float32Array(cols * 3)
    for (let c = 0; c < cols; c++) this.w[c] = 0
    const cap = this.n * 6 + 16
    this.ci = new Int32Array(cap * 2)
    this.cr = new Float32Array(cap)
    this.ck = new Float32Array(cap)
  }

  id = (r: number, c: number) => r * this.cols + (((c % this.cols) + this.cols) % this.cols)

  /** Add a distance constraint; `rho` is the softness ratio (0 rigid). */
  add(i: number, j: number, rest: number, rho: number) {
    const k = this.nc++
    this.ci[2 * k] = i
    this.ci[2 * k + 1] = j
    this.cr[k] = rest
    this.ck[k] = 1 / (1 + rho)
  }

  /**
   * The three families on the grid. rest(i, j) gives each rest length (from the flat pattern or a pressed shape);
   * rho per family, and bend round may vary by column (`bendU(c)`).
   */
  build(rest: (i: number, j: number) => number, shear: number, bendU: (c: number) => number, bendV: number) {
    const { rows, cols, id } = this
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = id(r, c)
        this.add(i, id(r, c + 1), rest(i, id(r, c + 1)), 0)
        if (r + 1 < rows) this.add(i, id(r + 1, c), rest(i, id(r + 1, c)), 0)
      }
    for (let r = 0; r + 1 < rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = id(r, c), b = id(r + 1, c + 1), e = id(r, c + 1), f = id(r + 1, c)
        this.add(a, b, rest(a, b), shear)
        this.add(e, f, rest(e, f), shear)
      }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = id(r, c)
        if (r > 0) this.add(i, id(r, c + 2), rest(i, id(r, c + 2)), bendU(c))
        if (r + 2 < rows) this.add(i, id(r + 2, c), rest(i, id(r + 2, c)), bendV)
      }
  }

  /** Normals per particle from central differences: outer face = Tv x Tu (v down the skirt, u round it). */
  normals() {
    const { rows, cols, x, nrm, id } = this
    for (let r = 0; r < rows; r++) {
      const r0 = Math.max(0, r - 1), r1 = Math.min(rows - 1, r + 1)
      for (let c = 0; c < cols; c++) {
        const a = id(r, c - 1) * 3, b = id(r, c + 1) * 3, u0 = id(r0, c) * 3, u1 = id(r1, c) * 3
        const ux = x[b] - x[a], uy = x[b + 1] - x[a + 1], uz = x[b + 2] - x[a + 2]
        const vx = x[u1] - x[u0], vy = x[u1 + 1] - x[u0 + 1], vz = x[u1 + 2] - x[u0 + 2]
        let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux
        const l = Math.hypot(nx, ny, nz) || 1
        nx /= l; ny /= l; nz /= l
        const k = (r * cols + c) * 3
        nrm[k] = nx; nrm[k + 1] = ny; nrm[k + 2] = nz
      }
    }
  }

  /** One frame of `S` substeps. Driven particles move from d0 to d1 across the frame. */
  step(dt: number, S: number, collide: Collide, post?: (c: Cloth) => void) {
    const h = dt / S
    const { x, p, w, nrm, n, cols, d0, d1, ci, cr, ck, nc } = this
    this.normals()
    const damp = 1 - this.damp * h, air = this.air * h, g = this.g * h, tu = this.turb
    for (let s = 0; s < S; s++) {
      const f = (s + 1) / S
      this.t += h
      const T = this.t
      for (let c = 0; c < cols; c++) {
        const k = c * 3
        p[k] = x[k]; p[k + 1] = x[k + 1]; p[k + 2] = x[k + 2]
        x[k] = d0[k] + (d1[k] - d0[k]) * f
        x[k + 1] = d0[k + 1] + (d1[k + 1] - d0[k + 1]) * f
        x[k + 2] = d0[k + 2] + (d1[k + 2] - d0[k + 2]) * f
      }
      for (let i = cols; i < n; i++) {
        if (w[i] === 0) continue
        const k = i * 3
        let vx = (x[k] - p[k]) / h, vy = (x[k + 1] - p[k + 1]) / h, vz = (x[k + 2] - p[k + 2]) / h - g
        // air: drag on the normal component only, against a still room plus a little turbulence
        const sp = Math.hypot(vx, vy, vz) * tu
        const wx = sp * Math.sin(x[k] * 41 + T * 31 + x[k + 2] * 17)
        const wy = sp * Math.sin(x[k + 1] * 37 - T * 29 + x[k] * 13)
        const wz = sp * Math.sin(x[k + 2] * 43 + T * 23 + x[k + 1] * 19)
        const nx = nrm[k], ny = nrm[k + 1], nz = nrm[k + 2]
        const rel = ((wx - vx) * nx + (wy - vy) * ny + (wz - vz) * nz) * air
        vx = (vx + rel * nx) * damp
        vy = (vy + rel * ny) * damp
        vz = (vz + rel * nz) * damp
        p[k] = x[k]; p[k + 1] = x[k + 1]; p[k + 2] = x[k + 2]
        x[k] += vx * h; x[k + 1] += vy * h; x[k + 2] += vz * h
      }
      const fwd = (s & 1) === 0
      for (let q = 0; q < nc; q++) {
        const kk = fwd ? q : nc - 1 - q
        const i = ci[2 * kk], j = ci[2 * kk + 1]
        const wi = w[i], wj = w[j], ws = wi + wj
        if (ws === 0) continue
        const a = i * 3, b = j * 3
        const dx = x[a] - x[b], dy = x[a + 1] - x[b + 1], dz = x[a + 2] - x[b + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < 1e-9) continue
        const l = ((cr[kk] - d) / (ws * d)) * ck[kk]
        x[a] += wi * l * dx; x[a + 1] += wi * l * dy; x[a + 2] += wi * l * dz
        x[b] -= wj * l * dx; x[b + 1] -= wj * l * dy; x[b + 2] -= wj * l * dz
      }
      for (let i = cols; i < n; i++) collide(this, i, h)
      post?.(this)
    }
  }
}
