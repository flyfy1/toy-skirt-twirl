// Render surface for a wrapped grid (README 3.4): Catmull-Rom refinement of the particle grid,
// then per vertex the normal, the thread tangents Tu and Tv, and the crease measure k.
// Any source of cols x rows positions can feed it (the XPBD grid or a gore model).

export class Surface {
  readonly cols: number
  readonly rows: number
  readonly su: number
  readonly sv: number
  /** render grid: RC columns (one duplicate seam column) by RR rows */
  readonly RC: number
  readonly RR: number
  readonly nv: number
  pos: Float32Array
  nrm: Float32Array
  tu: Float32Array
  tv: Float32Array
  crease: Float32Array
  uv: Float32Array
  /** an optional per-particle scalar carried to the render grid (the 马面裙's inner pleat faces) */
  mix: Float32Array
  idx: Uint16Array
  private tmp: Float32Array
  private tmpM: Float32Array

  constructor(cols: number, rows: number, su: number, sv: number) {
    this.cols = cols
    this.rows = rows
    this.su = su
    this.sv = sv
    this.RC = cols * su + 1
    this.RR = (rows - 1) * sv + 1
    this.nv = this.RC * this.RR
    this.pos = new Float32Array(this.nv * 3)
    this.nrm = new Float32Array(this.nv * 3)
    this.tu = new Float32Array(this.nv * 3)
    this.tv = new Float32Array(this.nv * 3)
    this.crease = new Float32Array(this.nv)
    this.uv = new Float32Array(this.nv * 2)
    this.tmp = new Float32Array(cols * su * rows * 3)
    this.tmpM = new Float32Array(cols * su * rows)
    this.mix = new Float32Array(this.nv)
    for (let r = 0; r < this.RR; r++)
      for (let c = 0; c < this.RC; c++) {
        const k = r * this.RC + c
        this.uv[2 * k] = c / (this.RC - 1)
        this.uv[2 * k + 1] = r / (this.RR - 1)
      }
    const idx: number[] = []
    for (let r = 0; r + 1 < this.RR; r++)
      for (let c = 0; c + 1 < this.RC; c++) {
        const a = r * this.RC + c, b = a + this.RC, e = a + 1, f = b + 1
        // (a, b, e): v down then u round: (b - a) x (e - a) is the outer face
        idx.push(a, b, e, e, b, f)
      }
    this.idx = new Uint16Array(idx)
  }

  /** Rebuild every attribute from particle positions x (cols x rows, row-major). */
  update(x: Float32Array, m?: Float32Array) {
    const { cols, rows, su, sv, RC, RR, tmp, pos, tmpM, mix } = this
    const U = cols * su
    // 1. refine round each row (wrapped Catmull-Rom)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        for (let s = 0; s < su; s++) {
          const t = s / su
          const o = (r * U + c * su + s) * 3
          const i0 = (r * cols + ((c - 1 + cols) % cols)) * 3, i1 = (r * cols + c) * 3
          const i2 = (r * cols + ((c + 1) % cols)) * 3, i3 = (r * cols + ((c + 2) % cols)) * 3
          for (let d = 0; d < 3; d++) tmp[o + d] = cr(x[i0 + d], x[i1 + d], x[i2 + d], x[i3 + d], t)
          if (m) tmpM[o / 3] = m[i1 / 3] * (1 - t) + m[i2 / 3] * t
        }
    // 2. refine down each column (clamped ends)
    for (let r = 0; r < RR; r++) {
      const j = Math.min(rows - 2, Math.floor(r / sv))
      const t = r / sv - j
      const j0 = Math.max(0, j - 1), j3 = Math.min(rows - 1, j + 2)
      for (let c = 0; c < U; c++) {
        const o = (r * RC + c) * 3
        for (let d = 0; d < 3; d++) {
          const a = tmp[(j0 * U + c) * 3 + d], b = tmp[(j * U + c) * 3 + d], e = tmp[((j + 1) * U + c) * 3 + d]
          const f = j3 === j + 1 ? 2 * e - b : tmp[(j3 * U + c) * 3 + d]
          const a2 = j0 === j ? 2 * b - e : a
          pos[o + d] = cr(a2, b, e, f, t)
        }
      }
      if (m) {
        for (let c = 0; c < U; c++) mix[r * RC + c] = tmpM[j * U + c] * (1 - t) + tmpM[Math.min(rows - 1, j + 1) * U + c] * t
        mix[r * RC + U] = mix[r * RC]
      }
      const o = (r * RC + U) * 3, z = r * RC * 3
      pos[o] = pos[z]; pos[o + 1] = pos[z + 1]; pos[o + 2] = pos[z + 2]
    }
    this.attributes()
  }

  private attributes() {
    const { RC, RR, pos, nrm, tu, tv, crease } = this
    const U = RC - 1
    for (let r = 0; r < RR; r++) {
      const r0 = Math.max(0, r - 1), r1 = Math.min(RR - 1, r + 1)
      for (let c = 0; c < RC; c++) {
        const cm = (c - 1 + U) % U, cp = (c + 1) % U, cc = c % U
        const a = (r * RC + cm) * 3, b = (r * RC + cp) * 3, u0 = (r0 * RC + cc) * 3, u1 = (r1 * RC + cc) * 3
        let ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
        let vx = pos[u1] - pos[u0], vy = pos[u1 + 1] - pos[u0 + 1], vz = pos[u1 + 2] - pos[u0 + 2]
        let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux
        const ln = Math.hypot(nx, ny, nz) || 1
        nx /= ln; ny /= ln; nz /= ln
        const lu = Math.hypot(ux, uy, uz) || 1, lv = Math.hypot(vx, vy, vz) || 1
        const k = (r * RC + c) * 3
        nrm[k] = nx; nrm[k + 1] = ny; nrm[k + 2] = nz
        tu[k] = ux / lu; tu[k + 1] = uy / lu; tu[k + 2] = uz / lu
        tv[k] = vx / lv; tv[k + 1] = vy / lv; tv[k + 2] = vz / lv
        // crease: (mean of the 4 neighbours - x) . n / spacing; positive is a valley
        const o = k
        const mx = (pos[a] + pos[b] + pos[u0] + pos[u1]) / 4 - pos[o]
        const my = (pos[a + 1] + pos[b + 1] + pos[u0 + 1] + pos[u1 + 1]) / 4 - pos[o + 1]
        const mz = (pos[a + 2] + pos[b + 2] + pos[u0 + 2] + pos[u1 + 2]) / 4 - pos[o + 2]
        const sp = (lu + (r0 === r || r1 === r ? lv * 2 : lv)) / 4 || 1
        crease[r * RC + c] = Math.max(-1, Math.min(1, ((mx * nx + my * ny + mz * nz) / sp) * 4))
      }
    }
  }
}

function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
