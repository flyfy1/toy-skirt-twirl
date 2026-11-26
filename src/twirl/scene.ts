// Geometry for the atelier (twirl.md 3.1 to 3.3): the dress form (a surface of revolution with an oval
// section, so it really turns), the iron stand, the cutting table, the tag and the tape measure.
// There is nothing below the form's hip cap except the pole and the stand.

export interface Mesh {
  p: number[]
  n: number[]
  uv: number[]
  i: number[]
}
export const mesh = (): Mesh => ({ p: [], n: [], uv: [], i: [] })

/** A lathe of rows (z, rx, ry) with `seg` steps round; normals from the grid. u = angle / 2pi, v from `v`. */
export function lathe(m: Mesh, rows: [number, number, number][], seg: number, v: (z: number) => number, cx = 0, cy = 0) {
  const base = m.p.length / 3
  const R = rows.length
  const P: number[][] = []
  for (let r = 0; r < R; r++)
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2
      const [z, rx, ry] = rows[r]
      P.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), z])
    }
  const at = (r: number, s: number) => P[Math.max(0, Math.min(R - 1, r)) * (seg + 1) + ((s + seg) % seg)]
  for (let r = 0; r < R; r++)
    for (let s = 0; s <= seg; s++) {
      const p = at(r, s)
      const a = at(r, s - 1), b = at(r, s + 1), c = at(r - 1, s), d = at(r + 1, s)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
      const vx = d[0] - c[0], vy = d[1] - c[1], vz = d[2] - c[2]
      // rows go upward in z: outward = u x v
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const l = Math.hypot(nx, ny, nz) || 1
      nx /= l; ny /= l; nz /= l
      m.p.push(p[0], p[1], p[2])
      m.n.push(nx, ny, nz)
      m.uv.push(s / seg, v(p[2]))
    }
  for (let r = 0; r + 1 < R; r++)
    for (let s = 0; s < seg; s++) {
      const a = base + r * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1
      m.i.push(a, b, c, b, d, c)
    }
}

/** Flat disc facing up (+1) or down (-1). */
export function disc(m: Mesh, z: number, r: number, seg: number, up: number, cx = 0, cy = 0) {
  const base = m.p.length / 3
  m.p.push(cx, cy, z); m.n.push(0, 0, up); m.uv.push(0.5, 0.5)
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2
    m.p.push(cx + r * Math.cos(a), cy + r * Math.sin(a), z)
    m.n.push(0, 0, up)
    m.uv.push(0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a))
  }
  for (let s = 0; s < seg; s++) up > 0 ? m.i.push(base, base + 1 + s, base + 2 + s) : m.i.push(base, base + 2 + s, base + 1 + s)
}

export const cylinder = (m: Mesh, z0: number, z1: number, r: number, seg: number, caps = true, cx = 0, cy = 0) => {
  lathe(m, [[z0, r, r], [z0 + 1e-4, r, r], [z1 - 1e-4, r, r], [z1, r, r]], seg, () => 0.5, cx, cy)
  if (caps) {
    disc(m, z1, r, seg, 1, cx, cy)
    disc(m, z0, r, seg, -1, cx, cy)
  }
}

/** A tube between two points (legs of the tripod). */
export function tube(m: Mesh, a: number[], b: number[], r: number, seg = 10) {
  const base = m.p.length / 3
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const L = Math.hypot(dx, dy, dz)
  const t = [dx / L, dy / L, dz / L]
  const up = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  let ux = t[1] * up[2] - t[2] * up[1], uy = t[2] * up[0] - t[0] * up[2], uz = t[0] * up[1] - t[1] * up[0]
  const lu = Math.hypot(ux, uy, uz)
  ux /= lu; uy /= lu; uz /= lu
  const vx = t[1] * uz - t[2] * uy, vy = t[2] * ux - t[0] * uz, vz = t[0] * uy - t[1] * ux
  for (const e of [a, b])
    for (let s = 0; s <= seg; s++) {
      const q = (s / seg) * Math.PI * 2, c = Math.cos(q), sn = Math.sin(q)
      const nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn
      m.p.push(e[0] + nx * r, e[1] + ny * r, e[2] + nz * r)
      m.n.push(nx, ny, nz)
      m.uv.push(s / seg, e === a ? 0 : 1)
    }
  for (let s = 0; s < seg; s++) {
    const p = base + s, q = base + seg + 1 + s
    m.i.push(p, q, p + 1, p + 1, q, q + 1)
  }
}

export function sphere(m: Mesh, c: number[], r: number, rz = r, seg = 16) {
  const rows: [number, number, number][] = []
  for (let k = 0; k <= seg / 2; k++) {
    const t = -Math.PI / 2 + (k / (seg / 2)) * Math.PI
    rows.push([c[2] + rz * Math.sin(t), r * Math.cos(t) + 1e-5, r * Math.cos(t) + 1e-5])
  }
  lathe(m, rows, seg, () => 0.5, c[0], c[1])
}

/** Box with outward normals; uv on the top face spans the top. */
export function box(m: Mesh, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const f = (pts: number[][], n: number[], uvs: number[][]) => {
    const base = m.p.length / 3
    for (let k = 0; k < 4; k++) {
      m.p.push(...pts[k])
      m.n.push(...n)
      m.uv.push(...uvs[k])
    }
    m.i.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const z = [[0, 0], [0, 0], [0, 0], [0, 0]]
  f([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[0, 1], [1, 1], [1, 0], [0, 0]])
  f([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], z)
  f([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], z)
  f([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], z)
  f([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], z)
}

/** Dress form profile (z, rx, ry): hip cap, waist, bust, shoulders, neck. Front is +y at psi = 0. */
export const FORM: [number, number, number][] = [
  [0.89, 0.12, 0.12],
  [0.9, 0.137, 0.137],
  [0.91, 0.146, 0.146],
  [0.92, 0.15, 0.15],
  [0.97, 0.128, 0.127],
  [1.02, 0.105, 0.105],
  [1.07, 0.11, 0.103],
  [1.13, 0.122, 0.108],
  [1.2, 0.135, 0.118],
  [1.26, 0.145, 0.13],
  [1.3, 0.148, 0.134],
  [1.35, 0.15, 0.124],
  [1.4, 0.156, 0.11],
  [1.43, 0.154, 0.1],
  [1.455, 0.125, 0.085],
  [1.47, 0.085, 0.066],
  [1.48, 0.052, 0.05],
  [1.5, 0.045, 0.045],
]
export const FORM_Z0 = 0.89, FORM_Z1 = 1.5

/** Radii (rx, ry) of the form at height z, for the tape measure's collision. */
export function formR(z: number): [number, number] {
  if (z <= FORM[0][0]) return [0, 0]
  for (let k = 0; k + 1 < FORM.length; k++) {
    const a = FORM[k], b = FORM[k + 1]
    if (z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0])
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    }
  }
  return [0, 0]
}

/** Smooth the profile by Catmull-Rom so the silhouette has no kinks. */
export function smoothProfile(rows: [number, number, number][], k = 3): [number, number, number][] {
  const out: [number, number, number][] = []
  const g = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))]
  for (let i = 0; i + 1 < rows.length; i++)
    for (let s = 0; s < k; s++) {
      const t = s / k
      const v = [0, 1, 2].map((d) => {
        const p0 = g(i - 1)[d], p1 = g(i)[d], p2 = g(i + 1)[d], p3 = g(i + 2)[d]
        const t2 = t * t, t3 = t2 * t
        return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
      })
      out.push([v[0], v[1], v[2]])
    }
  out.push(rows[rows.length - 1])
  return out
}

export function formMesh() {
  const m = mesh()
  // under the skirt the drawn hip sits a little inside the collision surface, so cloth never shows it poking through
  const rows = smoothProfile(FORM, 3).map(([z, rx, ry]): [number, number, number] => {
    const k = z < 1.03 ? 0.955 : 1
    return [z, rx * k, ry * k]
  })
  lathe(m, rows, 48, (z) => (z - FORM_Z0) / (FORM_Z1 - FORM_Z0))
  disc(m, FORM_Z0, 0.12 * 0.955, 48, -1)
  return m
}

/** The turned walnut neck cap and its brass key. */
export function capMesh() {
  const m = mesh()
  lathe(m, [[1.49, 0.05, 0.05], [1.5, 0.058, 0.058], [1.512, 0.06, 0.06], [1.52, 0.05, 0.05], [1.527, 0.03, 0.03], [1.53, 0.012, 0.012]], 32, () => 0.5)
  return m
}
export function keyMesh() {
  const m = mesh()
  cylinder(m, 1.528, 1.56, 0.006, 10)
  tube(m, [-0.018, 0, 1.57], [0.018, 0, 1.57], 0.008, 10)
  return m
}

/** Iron tripod, pole and brass collar; the base does not turn. */
export function standMesh() {
  const m = mesh()
  cylinder(m, 0.05, 0.13, 0.035, 20)
  cylinder(m, 0.12, FORM_Z0, 0.02, 20, false)
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 3 + 0.35
    const ex = 0.28 * Math.cos(a), ey = 0.28 * Math.sin(a)
    tube(m, [0.03 * Math.cos(a), 0.03 * Math.sin(a), 0.1], [ex, ey, 0.05], 0.013)
    sphere(m, [ex, ey, 0.022], 0.022, 0.022, 12)
    cylinder(m, 0.04, 0.056, 0.016, 12, true, ex, ey)
  }
  return m
}
export function brassMesh() {
  const m = mesh()
  cylinder(m, 0.54, 0.565, 0.052, 28)
  cylinder(m, 0.86, 0.89, 0.032, 20)
  return m
}

/** The corner of a cutting table at the left, behind the form, and the tomato pincushion on it. */
export function tableMesh() {
  const m = mesh()
  box(m, -1.8, -0.6, -1.3, -0.4, 0.84, 0.88)
  box(m, -0.68, -0.62, -0.5, -0.44, 0, 0.84)
  box(m, -0.68, -0.62, -1.26, -1.2, 0, 0.84)
  return m
}
export function cushionMesh() {
  const m = mesh()
  sphere(m, [-0.7, -0.62, 0.905], 0.042, 0.03, 18)
  return m
}
export function leafMesh() {
  const m = mesh()
  sphere(m, [-0.7, -0.62, 0.935], 0.014, 0.006, 10)
  return m
}

/** Floor and wall planes. */
export function floorMesh() {
  const m = mesh()
  const S = 6
  m.p.push(-S, -1.4, 0, S, -1.4, 0, S, S, 0, -S, S, 0)
  m.n.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1)
  // herringbone runs at 45 degrees to the wall
  const uv = (x: number, y: number) => [(x + y) / 0.64 / Math.SQRT2, (y - x) / 0.64 / Math.SQRT2]
  m.uv.push(...uv(-S, -1.4), ...uv(S, -1.4), ...uv(S, S), ...uv(-S, S))
  m.i.push(0, 1, 2, 0, 2, 3)
  return m
}
export function wallMesh() {
  const m = mesh()
  m.p.push(-3, -1.4, 0, 3, -1.4, 0, 3, -1.4, 3, -3, -1.4, 3)
  m.n.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
  m.uv.push(0, 1, 1, 1, 1, 0, 0, 0)
  m.i.push(0, 1, 2, 0, 2, 3)
  return m
}
