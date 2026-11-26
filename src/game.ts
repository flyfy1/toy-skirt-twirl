// Give It a Twirl: the loop. The stand (5.2), the skirt on it (gores, section 10), the camera (3.1), the tag
// and the tape measure (3.3), input (2), sound (4), runs and records (6), the 梗 layer (7) and the harness
// (?seed=, ?shot=, ?fabric=, &debug=under).
// Standing rule: the camera stays 14 degrees above the horizontal, and no gesture or flag moves it.
import { ident, lookAt, mul, perspective } from './cloth/gl'
import { Surface } from './cloth/mesh'
import { coast, stand } from './twirl/model'
import { goreSkirt, type FabricId, type Gores } from './twirl/gores'
import { Renderer, type ClothLook, type Frame } from './twirl/render'
import { formR } from './twirl/scene'
import * as A from './twirl/audio'

const PITCH = (14 * Math.PI) / 180
const FOV = (30 * Math.PI) / 180
const AIM = [0, 0, 0.88]
const CAP = 13.8
const TAU = Math.PI * 2
export const FABRICS: FabricId[] = ['chiffon', 'denim', 'mamian', 'tulle']

const LOOKS: Record<string, ClothLook> = {
  slip: { tex: 'slip', sh: [6, 0.03, 6, 0.03], fab: [0.08, 0, 0.45], alpha: 1, uvs: [4, 1], lining: [0.95, 0.9, 0.92], shadow: 0.9 },
  chiffon: { tex: 'chiffon', sh: [10, 0.07, 14, 0.08], fab: [0.24, 0.3, 0.42], alpha: 0.8, uvs: [1, 1], lining: [0.92, 0.86, 0.88], shadow: 0.5 },
  denim: { tex: 'denim', sh: [6, 0.04, 6, 0.04], fab: [0.1, 0, 0.55], alpha: 1, uvs: [1, 1], lining: [2.1, 1.9, 1.55], shadow: 0.9 },
  mamian: { tex: 'mamian', sh: [48, 0.5, 10, 0.1], fab: [0.22, 0.05, 0.5], alpha: 1, uvs: [1, 1], lining: [0.8, 0.8, 0.85], inner: [0.36, 0.44, 0.68], shadow: 0.9 },
  tulle: { tex: 'tulle', sh: [8, 0.06, 8, 0.06], fab: [0.45, 0.6, 0.2], alpha: 0.55, uvs: [5, 2], lining: [0.95, 0.92, 1], shadow: 0.35 },
}

/** What a run hands to the page and the share card. */
export interface RunInfo {
  turns: number
  peak: number
  bloom: number
  dz: boolean
  pk: boolean
  wr: boolean
}

export interface Hooks {
  onFirstTouch: () => void
  onNoGL: () => void
  label?: (s: string) => void
  /** the pill: live numbers during a run, the result after it (null hides it) */
  pill: (p: { n: number; r: number; best: boolean; done: boolean } | null) => void
  /** a deadpan line by key (the page rate-limits and translates) */
  line: (key: string) => void
  mum: () => void
  /** end of a run of at least 1 turn, with a snapshot from its most open frame */
  runEnd: (info: RunInfo, fabric: FabricId, snap: HTMLCanvasElement | null) => void
  track: (event: string, params?: Record<string, number | string>) => void
  act: (kind: 'spin' | 'fabric') => void
  fabric: (id: FabricId) => void
}

export interface Game {
  swap: (id: FabricId) => void
  dispose: () => void
}

export function startGame(canvas: HTMLCanvasElement, hooks: Hooks, startFabric: FabricId): Game {
  const q = new URLSearchParams(location.search)
  const seed = Number(q.get('seed') ?? 7) || 7
  const shot = q.get('shot')
  const debug = q.get('debug') ?? ''
  const qf = q.get('fabric') as FabricId | null
  let fabric: FabricId = qf && FABRICS.includes(qf) ? qf : startFabric
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: !!shot, premultipliedAlpha: false })
  if (!gl) {
    hooks.onNoGL()
    return { swap: () => {}, dispose: () => {} }
  }
  const r = new Renderer(gl, seed)
  let lost = false
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    lost = true
  })
  canvas.addEventListener('webglcontextrestored', () => {
    r.init()
    lost = false
  })
  if (!shot) (window.requestIdleCallback ?? setTimeout)(() => A.prepare())

  // ---- the skirt ----
  let sk: Gores = goreSkirt(fabric, seed)
  let surfs: Surface[] = []
  const makeSurfs = () => (surfs = sk.layers.map((l) => new Surface(l.cols, l.rows, l.su, l.sv)))
  makeSurfs()
  const looksFor = (id: FabricId): ClothLook[] =>
    sk.layers.map((_, k) => (id === 'chiffon' && k === 0 ? LOOKS.slip : LOOKS[id]))
  let looks = looksFor(fabric)

  // ---- stand, camera ----
  let psi = 0, omega = 0, alpha = 0, nudge = 0
  let W = 0, H = 0, dpr = 1
  let scale = 0, scaleV = 0
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
  }
  resize()
  window.addEventListener('resize', resize)
  const camera = (dt: number) => {
    const sr = Math.min(W / 1.25, H / 2.55), sf = Math.min(W / 1.6, H / 2.55)
    const t = smooth(0.3, 0.7, sk.hem().rho)
    const goal = sr + (sf - sr) * t
    if (!scale) scale = goal
    const k = 120, c = 2 * Math.sqrt(k)
    scaleV += (k * (goal - scale) - c * scaleV) * dt
    scale += scaleV * dt
  }
  const view = () => {
    const sc = shot === 'og' && W > H * 1.4 ? H / 1.45 : scale
    const d = H / (2 * sc * Math.tan(FOV / 2))
    // the og picture (landscape, title at the left): the form sits right of centre
    const og = shot === 'og' && W > H * 1.4
    const ax = og ? -0.5 : 0
    const aim = [ax, AIM[1], og ? 1.02 : AIM[2]]
    const eye = [ax, aim[1] + d * Math.cos(PITCH), aim[2] + d * Math.sin(PITCH)]
    const proj = perspective(FOV, W / H, 0.3, 40, 0.18)
    return { vp: mul(proj, lookAt(eye, aim, [0, 0, 1])), eye }
  }

  // ---- the dizzy sway: the form's axis tilts 3 degrees and circles twice as it dies (2.5 s) ----
  let sway = -1
  const tiltM = () => {
    if (sway < 0) return ident()
    const k = sway / 2.5
    const a = ((3 * Math.PI) / 180) * (1 - k) * Math.min(1, sway / 0.15)
    const b = k * 2 * TAU
    const ax = -Math.sin(b), ay = Math.cos(b)
    const c = Math.cos(a), s = Math.sin(a), C = 1 - c
    return new Float32Array([
      c + ax * ax * C, ay * ax * C, -ay * s, 0,
      ax * ay * C, c + ay * ay * C, ax * s, 0,
      ay * s, -ax * s, c, 0,
      0, 0, 0, 1,
    ])
  }

  // ---- tag (a pendulum pinned at the chest) and the tape measure (two chains of 14 links) ----
  const TAG_Z = 1.33, TAG_R = formR(TAG_Z)[1] + 0.004
  let ta = 0, tav = 0, tb = 0, tbv = 0
  const LINKS = 14, LL = 0.026
  const tape = new Float32Array(2 * (LINKS + 1) * 3), tapeP = new Float32Array(tape.length)
  const root = (side: number, ps: number) => {
    const lx = side * 0.056, ly = 0.034, c = Math.cos(ps), s = Math.sin(ps)
    return [lx * c - ly * s, lx * s + ly * c, 1.472]
  }
  for (let sd = 0; sd < 2; sd++)
    for (let k = 0; k <= LINKS; k++) {
      const z = 1.472 - k * LL
      const ry = formR(Math.max(0.95, z))[1]
      const i = (sd * (LINKS + 1) + k) * 3
      tape[i] = (sd ? 1 : -1) * (0.056 + k * 0.001)
      tape[i + 1] = Math.max(0.034, ry + 0.006)
      tape[i + 2] = z
    }
  tapeP.set(tape)
  const stepTape = (dt: number, ps0: number, ps1: number) => {
    const n = 4, h = dt / n
    for (let s = 0; s < n; s++) {
      const ps = ps0 + (ps1 - ps0) * ((s + 1) / n)
      const c = Math.cos(-ps), sn = Math.sin(-ps)
      for (let sd = 0; sd < 2; sd++) {
        const rt = root(sd ? 1 : -1, ps)
        const o = sd * (LINKS + 1) * 3
        tapeP[o] = tape[o]; tapeP[o + 1] = tape[o + 1]; tapeP[o + 2] = tape[o + 2]
        tape[o] = rt[0]; tape[o + 1] = rt[1]; tape[o + 2] = rt[2]
        for (let k = 1; k <= LINKS; k++) {
          const i = o + k * 3
          const vx = (tape[i] - tapeP[i]) * 0.995, vy = (tape[i + 1] - tapeP[i + 1]) * 0.995, vz = (tape[i + 2] - tapeP[i + 2]) * 0.995 - 9.81 * h * h
          tapeP[i] = tape[i]; tapeP[i + 1] = tape[i + 1]; tapeP[i + 2] = tape[i + 2]
          tape[i] += vx; tape[i + 1] += vy; tape[i + 2] += vz
        }
        for (let it = 0; it < 2; it++)
          for (let k = 1; k <= LINKS; k++) {
            const a = o + (k - 1) * 3, b = o + k * 3
            const dx = tape[b] - tape[a], dy = tape[b + 1] - tape[a + 1], dz = tape[b + 2] - tape[a + 2]
            const d = Math.hypot(dx, dy, dz) || 1
            const e = (d - LL) / d
            if (k === 1) {
              tape[b] -= dx * e; tape[b + 1] -= dy * e; tape[b + 2] -= dz * e
            } else {
              tape[a] += dx * e * 0.5; tape[a + 1] += dy * e * 0.5; tape[a + 2] += dz * e * 0.5
              tape[b] -= dx * e * 0.5; tape[b + 1] -= dy * e * 0.5; tape[b + 2] -= dz * e * 0.5
            }
          }
        for (let k = 1; k <= LINKS; k++) {
          const i = o + k * 3
          const lx = tape[i] * c - tape[i + 1] * sn, ly = tape[i] * sn + tape[i + 1] * c
          const [rx, ry] = formR(tape[i + 2])
          if (rx <= 0) continue
          const m = Math.hypot(lx / (rx + 0.005), ly / (ry + 0.005))
          if (m < 1) {
            const kx = lx / m, ky = ly / m
            const c2 = Math.cos(ps), s2 = Math.sin(ps)
            tape[i] = kx * c2 - ky * s2
            tape[i + 1] = kx * s2 + ky * c2
          }
        }
      }
    }
  }
  const stepTag = (dt: number) => {
    const g = 9.81, l = 0.05, rr = TAG_R
    tav += ((omega * omega * rr * Math.cos(ta) - g * Math.sin(ta)) / l - 4 * tav) * dt
    ta += tav * dt
    if (ta < 0) {
      ta = 0
      tav = Math.max(0, tav)
    }
    ta = Math.min(ta, 1.35)
    tbv += ((-rr * alpha * Math.cos(tb) - g * Math.sin(tb)) / l - 3 * tbv) * dt
    tb += tbv * dt
  }

  const dynV = new Float32Array((2 * (LINKS + 1) * 2 + 16 + 4 + 8) * 8)
  const dynI: number[] = []
  for (let sd = 0; sd < 2; sd++)
    for (let k = 0; k < LINKS; k++) {
      const a = (sd * (LINKS + 1) + k) * 2
      dynI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  const ARC0 = 2 * (LINKS + 1) * 2
  for (let k = 0; k < 7; k++) {
    const a = ARC0 + k * 2
    dynI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const tapeN = dynI.length
  const TAG0 = ARC0 + 16
  dynI.push(TAG0, TAG0 + 1, TAG0 + 2, TAG0 + 1, TAG0 + 3, TAG0 + 2)
  const STR0 = TAG0 + 4
  dynI.push(STR0, STR0 + 1, STR0 + 2, STR0 + 1, STR0 + 3, STR0 + 2)
  const dynIdx = new Uint16Array(dynI)
  const put = (arr: Float32Array, v: number, p: number[], n: number[], u: number, w: number) => {
    const o = v * 8
    arr[o] = p[0]; arr[o + 1] = p[1]; arr[o + 2] = p[2]
    arr[o + 3] = n[0]; arr[o + 4] = n[1]; arr[o + 5] = n[2]
    arr[o + 6] = u; arr[o + 7] = w
  }
  const buildDyn = () => {
    const c = Math.cos(psi), s = Math.sin(psi)
    const W2 = 0.008
    for (let sd = 0; sd < 2; sd++)
      for (let k = 0; k <= LINKS; k++) {
        const i = (sd * (LINKS + 1) + k) * 3
        const j = (sd * (LINKS + 1) + Math.min(LINKS, k + 1)) * 3, h0 = (sd * (LINKS + 1) + Math.max(0, k - 1)) * 3
        const tx = tape[j] - tape[h0], ty = tape[j + 1] - tape[h0 + 1], tz = tape[j + 2] - tape[h0 + 2]
        const rl = Math.hypot(tape[i], tape[i + 1]) || 1
        const nx = tape[i] / rl, ny = tape[i + 1] / rl
        let ax = -tz * ny, ay = tz * nx, az = tx * ny - ty * nx
        const al = Math.hypot(ax, ay, az) || 1
        ax /= al; ay /= al; az /= al
        const v = (sd * (LINKS + 1) + k) * 2
        const p = [tape[i] + nx * 0.004, tape[i + 1] + ny * 0.004, tape[i + 2]]
        put(dynV, v, [p[0] - ax * W2, p[1] - ay * W2, p[2] - az * W2], [nx, ny, 0], k * 0.06 + sd * 0.5, 0)
        put(dynV, v + 1, [p[0] + ax * W2, p[1] + ay * W2, p[2] + az * W2], [nx, ny, 0], k * 0.06 + sd * 0.5, 1)
      }
    for (let k = 0; k < 8; k++) {
      const a = Math.atan2(0.034, 0.056) + (k / 7) * (Math.PI - 2 * Math.atan2(0.034, 0.056))
      const la = a - Math.PI
      const rx = 0.066 * Math.cos(la), ry = 0.066 * Math.sin(la)
      const x = rx * c - ry * s, y = rx * s + ry * c
      const nl = Math.hypot(x, y) || 1
      put(dynV, ARC0 + k * 2, [x, y, 1.466], [x / nl, y / nl, 0.3], k * 0.05, 0)
      put(dynV, ARC0 + k * 2 + 1, [x * 0.92, y * 0.92, 1.482], [x / nl, y / nl, 0.3], k * 0.05, 1)
    }
    const R = (v: number[]) => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]
    const n = R([0, 1, 0]), t = R([-1, 0, 0])
    const pin = R([0, TAG_R, TAG_Z])
    const ca = Math.cos(ta), sa = Math.sin(ta), cb = Math.cos(tb), sb = Math.sin(tb)
    const hd = [n[0] * sa + t[0] * sb * ca, n[1] * sa + t[1] * sb * ca, -ca * cb]
    const hl = Math.hypot(hd[0], hd[1], hd[2])
    hd[0] /= hl; hd[1] /= hl; hd[2] /= hl
    const dt0 = t[0] * hd[0] + t[1] * hd[1] + t[2] * hd[2]
    const side = [t[0] - hd[0] * dt0, t[1] - hd[1] * dt0, t[2] - hd[2] * dt0]
    const sl = Math.hypot(side[0], side[1], side[2])
    side[0] /= sl; side[1] /= sl; side[2] /= sl
    const fn = [side[1] * hd[2] - side[2] * hd[1], side[2] * hd[0] - side[0] * hd[2], side[0] * hd[1] - side[1] * hd[0]]
    const fo = fn[0] * n[0] + fn[1] * n[1] < 0 ? -1 : 1
    const N = [fn[0] * fo, fn[1] * fo, fn[2] * fo]
    const top = [pin[0] + hd[0] * 0.022 + N[0] * 0.002, pin[1] + hd[1] * 0.022 + N[1] * 0.002, pin[2] + hd[2] * 0.022]
    const tw = 0.021, th = 0.084
    const at = (u: number, v: number) => [top[0] - side[0] * tw * u + hd[0] * th * v, top[1] - side[1] * tw * u + hd[1] * th * v, top[2] - side[2] * tw * u + hd[2] * th * v]
    put(dynV, TAG0, at(-1, 0), N, 0, 0)
    put(dynV, TAG0 + 1, at(-1, 1), N, 0, 1)
    put(dynV, TAG0 + 2, at(1, 0), N, 1, 0)
    put(dynV, TAG0 + 3, at(1, 1), N, 1, 1)
    const hole = at(0, 0.12)
    const sw = 0.0016
    put(dynV, STR0, [pin[0] - side[0] * sw, pin[1] - side[1] * sw, pin[2]], N, 0, 0)
    put(dynV, STR0 + 1, [hole[0] - side[0] * sw, hole[1] - side[1] * sw, hole[2]], N, 0, 1)
    put(dynV, STR0 + 2, [pin[0] + side[0] * sw, pin[1] + side[1] * sw, pin[2]], N, 1, 0)
    put(dynV, STR0 + 3, [hole[0] + side[0] * sw, hole[1] + side[1] * sw, hole[2]], N, 1, 1)
  }

  // ---- things on the floor: the pockets' contents (denim) and glitter (tulle) ----
  type Item = { cell: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; rot: number; spin: number; size: number; coin: boolean; rest: boolean; keep?: boolean }
  let items: Item[] = []
  const MAX_ITEMS = 64
  const itV = new Float32Array(MAX_ITEMS * 4 * 8)
  const itIdx = new Uint16Array(MAX_ITEMS * 6)
  for (let k = 0; k < MAX_ITEMS; k++) itIdx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 1, k * 4 + 3, k * 4 + 2], k * 6)
  const throwItem = (cell: number, size: number, coin: boolean, u: number, speed: number) => {
    const p = sk.point(u, 0.2)
    const rr = Math.hypot(p[0], p[1]) || 1
    const dir = Math.sign(omega) || 1
    const tx = (-p[1] / rr) * dir, ty = (p[0] / rr) * dir
    items.push({ cell, x: p[0], y: p[1], z: p[2], vx: tx * speed + (p[0] / rr) * 0.3, vy: ty * speed + (p[1] / rr) * 0.3, vz: 0.6 + Math.random() * 0.5, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 20, size, coin, rest: false })
  }
  let bounced = 0
  const stepItems = (dt: number) => {
    for (const it of items) {
      if (it.rest) continue
      it.vz -= 9.81 * dt
      if (it.cell === 4) {
        // glitter drifts
        it.vx *= 1 - 3 * dt
        it.vy *= 1 - 3 * dt
        it.vz = Math.max(it.vz, -0.35)
      }
      it.x += it.vx * dt
      it.y += it.vy * dt
      it.z += it.vz * dt
      it.rot += it.spin * dt
      if (it.z < 0.003) {
        it.z = 0.003
        if (it.vz < -0.6 && it.cell !== 4) {
          it.vz = -it.vz * 0.4
          if (it.coin) A.coin()
          else if (it.cell === 0) A.keys()
          if (bounced++ < 12) A.buzz(5)
        } else {
          it.vz = 0
          const f = it.coin ? 0.6 : it.cell === 4 ? 30 : 4
          it.vx *= Math.exp(-f * dt)
          it.vy *= Math.exp(-f * dt)
          it.spin *= Math.exp(-(it.coin ? 1.5 : 6) * dt)
          if (Math.hypot(it.vx, it.vy) < 0.02 && Math.abs(it.spin) < 0.3) {
            it.rest = true
            if (it.coin) A.coinRattle()
          }
        }
      }
      // the edges of the floor in view: they bounce back softly
      if (Math.abs(it.x) > 0.6) {
        it.x = Math.sign(it.x) * 0.6
        it.vx *= -0.4
      }
      if (it.y < -0.9 || it.y > 0.55) {
        it.y = Math.max(-0.9, Math.min(0.55, it.y))
        it.vy *= -0.4
      }
    }
  }
  const buildItems = () => {
    const n = Math.min(MAX_ITEMS, items.length)
    for (let k = 0; k < n; k++) {
      const it = items[k]
      const c = Math.cos(it.rot), s = Math.sin(it.rot), h = it.size / 2
      const cu = (it.cell === 4 ? 1 : it.cell % 2) * 0.5, cv = (it.cell === 4 ? 0 : Math.floor(it.cell / 2)) * 0.5
      // a 14 degree camera sees a flat thing as a sliver: everything on the floor leans up toward it a little
      const tau = it.cell === 4 ? 0.2 : 0.62, ct = Math.cos(tau), st = Math.sin(tau)
      const corners = [[-h, -h], [h, -h], [-h, h], [h, h]]
      corners.forEach(([a, b], j) => {
        const lx = a * c - b * s, ly = a * s + b * c
        put(itV, k * 4 + j, [it.x + lx, it.y - ly * ct, it.z + (ly + h) * st], [0, st, ct], cu + (j % 2 ? 0.5 : 0), cv + (j < 2 ? 0.5 : 0))
      })
    }
    return n * 6
  }
  let pocketsDone = false

  // ---- swap: the skirt lifts straight off (250 ms), the new one drops over the form (about 500 ms) ----
  let swapT = -1, swapNext: FabricId | null = null, dropZ = 0, dropV = 0
  let swaps = 0
  const tried = new Set<FabricId>([fabric])
  let glitterKept = false
  const swap = (id: FabricId) => {
    if (swapT >= 0 || id === fabric) return
    swapT = 0
    swapNext = id
    swaps++
    A.unlock()
    A.swapLift()
    hooks.track('swap', { fabric: id, n: swaps })
    hooks.act('fabric')
    if (fabric === 'tulle' && !glitterKept) {
      glitterKept = true
      hooks.line('twirl_glitter')
    }
  }
  const stepSwap = (dt: number) => {
    if (swapT < 0) return
    swapT += dt
    if (swapNext && swapT >= 0.25) {
      // put on the new skirt: everything on the floor is swept, except five specks of glitter
      const prev = fabric
      fabric = swapNext
      swapNext = null
      tried.add(fabric)
      hooks.fabric(fabric)
      sk = goreSkirt(fabric, seed)
      sk.spread(fabric === 'mamian' ? 30 : 40)
      makeSurfs()
      r.forget([])
      looks = looksFor(fabric)
      const glitter = items.filter((it) => it.cell === 4 && it.rest)
      items = prev === 'tulle' || glitter.some((g) => g.keep) ? glitter.slice(0, 5).map((g) => ({ ...g, keep: true })) : []
      pocketsDone = false
      dropZ = 0.15
      dropV = 0
    }
    if (!swapNext && swapT >= 0.25) {
      dropV -= 9.81 * dt * 0.8
      dropZ = Math.max(0, dropZ + dropV * dt)
      if (dropZ === 0 && swapT < 5) {
        A.swapLand()
        swapT = -1
      }
    }
  }
  const skirtM = () => {
    if (swapT < 0) return undefined
    const z = swapNext ? Math.pow(swapT / 0.25, 2) * 1.4 : dropZ
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1])
  }

  // ---- runs, records, lines ----
  interface Run { turns: number; peak: number; bloom: number; swipes: number; cw: boolean; ccw: boolean; dz: boolean; pk: boolean; wr: boolean; best: number; snapAt: number }
  let run: Run | null = null
  let quiet = 0
  let runs = 0, totalTurns = 0, visitPeak = 0
  let lastTickAng = 0, lastTurnAng = 0, lastQuarter = 0, lastBuzz = 0, noteStep = 0
  let inBloom = false, firstBloom = false
  const said = new Set<string>()
  const once = (k: string) => {
    if (said.has(k)) return
    said.add(k)
    hooks.line(k)
  }
  let snapCanvas: HTMLCanvasElement | null = null
  let snapBest = -1, snapT = 0, snapW = 0
  const takeSnap = () => {
    const w = Math.min(720, canvas.width), h = Math.round((w * canvas.height) / canvas.width)
    if (!snapCanvas) snapCanvas = document.createElement('canvas')
    snapCanvas.width = w
    snapCanvas.height = h
    snapCanvas.getContext('2d')!.drawImage(canvas, 0, 0, w, h)
  }
  let wantSnap = false
  const copy = (c: HTMLCanvasElement | null) => {
    if (!c) return null
    const o = document.createElement('canvas')
    o.width = c.width
    o.height = c.height
    o.getContext('2d')!.drawImage(c, 0, 0)
    return o
  }
  const dizzyAt = [25, 40, 100]
  let dizzyFace = false
  const endRun = () => {
    if (!run) return
    const R = run
    run = null
    hooks.pill(R.turns >= 3 ? { n: Math.floor(R.turns), r: R.peak, best: R.turns > R.best, done: true } : null)
    if (R.turns >= 3) setTimeout(() => !run && hooks.pill(null), 3000)
    if (R.turns >= 1) {
      runs++
      hooks.track('spin', { fabric, turns: Math.floor(R.turns), peak: Math.round(R.peak * 10), bloom_ms: Math.round(R.bloom * 1000), swipes: R.swipes, dir: R.cw && R.ccw ? 'both' : R.cw ? 'cw' : 'ccw', n: runs })
      hooks.runEnd({ turns: Math.floor(R.turns), peak: R.peak, bloom: R.bloom, dz: R.dz, pk: R.pk, wr: R.wr }, fabric, snapBest >= 0 ? copy(snapCanvas) : null)
      saveBest(fabric, R)
    }
    if (dizzyFace) {
      sway = 0
      A.dizzy()
      once('twirl_dizzy')
    }
    A.settle()
  }
  const runStep = (dt: number, dpsi: number, hemDeg: number) => {
    const w = Math.abs(omega)
    if (!run && w > 0.3) {
      run = { turns: 0, peak: 0, bloom: 0, swipes: 0, cw: false, ccw: false, dz: false, pk: false, wr: false, best: bestOf(fabric), snapAt: 0 }
      noteStep = 0
      snapBest = -1
      snapW = 0
      lastTurnAng = 0
      lastTickAng = 0
    }
    if (!run) return
    run.turns += Math.abs(dpsi) / TAU
    run.peak = Math.max(run.peak, w / TAU)
    visitPeak = Math.max(visitPeak, w / TAU)
    totalTurns += Math.abs(dpsi) / TAU
    if (omega > 0.3) run.ccw = true
    if (omega < -0.3) run.cw = true
    const ang = run.turns
    if (ang - lastTickAng >= 1 / 8) {
      lastTickAng = ang
      A.tick()
    }
    if (ang - lastQuarter >= 0.25 || ang < lastQuarter) {
      lastQuarter = ang
      const now = performance.now()
      if (now - lastBuzz > 40) {
        lastBuzz = now
        A.buzz(4)
      }
    }
    if (ang - lastTurnAng >= 1) {
      lastTurnAng = Math.floor(ang)
      A.turnNote(noteStep++)
    }
    const bl = sk.bloomDeg
    if (hemDeg >= bl) {
      run.bloom += dt
      if (!inBloom) {
        inBloom = true
        A.bloom()
        A.buzz(12)
        if (!firstBloom) {
          firstBloom = true
          once('twirl_first')
        } else if (fabric === 'mamian') once('twirl_mamian')
      }
    } else if (hemDeg < bl - 5) inBloom = false
    // the share snapshot: the most open frame of the run (copied right after it is drawn)
    const need = fabric === 'mamian' ? 28 : 60
    snapT += dt
    if (snapT > 0.25 && ((hemDeg >= need && hemDeg > snapBest) || (snapBest < need && w > snapW + 0.5))) {
      // the most open frame at or past the threshold; until then, the frame of peak speed
      if (hemDeg >= need) snapBest = hemDeg
      else snapBest = Math.max(snapBest, 0)
      snapW = Math.max(snapW, w)
      snapT = 0
      wantSnap = true
    }
    for (const n of dizzyAt)
      if (run.turns >= n && !(run as unknown as Record<string, boolean>)['d' + n]) {
        ;(run as unknown as Record<string, boolean>)['d' + n] = true
        hooks.track('dizzy', { turns: n, fabric })
        if (n === 25) {
          dizzyFace = true
          run.dz = true
        } else if (n === 40) hooks.mum()
        else once('twirl_100')
      }
    // it has pockets
    if (fabric === 'denim' && w > 9 && !run.pk) {
      if (!pocketsDone) {
        pocketsDone = true
        run.pk = true
        const v = w * 0.12
        throwItem(0, 0.13, false, 0, v)
        throwItem(1, 0.06, true, 0.02, v * 1.1)
        throwItem(1, 0.06, true, 0.5, v * 0.9)
        throwItem(2, 0.13, false, 0.5, v)
        throwItem(3, 0.09, false, 0.48, v)
        hooks.track('pockets', { n: 5 })
        if (!said.has('twirl_pockets')) once('twirl_pockets')
      } else if (!(run as unknown as Record<string, boolean>).extra) {
        ;(run as unknown as Record<string, boolean>).extra = true
        if (Math.random() < 0.25) throwItem(1, 0.06, true, Math.random() < 0.5 ? 0 : 0.5, w * 0.12)
      }
    }
    // tulle sheds glitter at speed
    if (fabric === 'tulle' && w > 6 && items.filter((i) => i.cell === 4).length < 40 && Math.random() < dt * 12) {
      const u = Math.random()
      const p = sk.point(u, 1)
      items.push({ cell: 4, x: p[0], y: p[1], z: p[2], vx: -p[1] * omega * 0.3, vy: p[0] * omega * 0.3, vz: 0.2, rot: Math.random() * TAU, spin: 3, size: 0.012, coin: false, rest: false })
    }
    hooks.pill({ n: Math.floor(run.turns), r: w / TAU, best: false, done: false })
  }

  // bests per day and per fabric (localStorage twirl.best)
  const today = () => new Date().toISOString().slice(0, 10)
  const readBest = (): Record<string, { turns: number; peak: number; bloom: number }> => {
    try {
      const o = JSON.parse(localStorage.getItem('twirl.best') || '{}')
      return o.day === today() ? o.f || {} : {}
    } catch {
      return {}
    }
  }
  const bestOf = (id: FabricId) => readBest()[id]?.turns ?? 0
  const saveBest = (id: FabricId, R: Run) => {
    try {
      const f = readBest()
      const b = f[id] || { turns: 0, peak: 0, bloom: 0 }
      f[id] = { turns: Math.max(b.turns, Math.floor(R.turns)), peak: Math.max(b.peak, Math.round(R.peak * 10) / 10), bloom: Math.max(b.bloom, Math.round(R.bloom * 10) / 10) }
      localStorage.setItem('twirl.best', JSON.stringify({ day: today(), f }))
    } catch {
      /* private mode */
    }
  }

  // ---- input: swipe sideways to spin (2); vertical movement is ignored ----
  let held = false, follow = false, grabX = 0, grabPsi = 0, grabT = 0, brakeFrom = 0
  const trail: [number, number][] = []
  let touched = false
  const Rpx = () => Math.min(0.3 * W, 220)
  const fingerV = () => {
    if (trail.length < 2) return 0
    const a = trail[0], b = trail[trail.length - 1]
    const dtm = (b[1] - a[1]) / 1000
    return dtm > 0.004 ? (b[0] - a[0]) / Rpx() / dtm : 0
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (shot) return
    A.unlock()
    if (!touched) {
      touched = true
      hooks.onFirstTouch()
    }
    canvas.setPointerCapture(e.pointerId)
    grabX = e.clientX
    grabT = performance.now()
    grabPsi = psi
    trail.length = 0
    trail.push([e.clientX, grabT])
    held = true
    // the nudge: 2 degrees toward the finger's side and back, a tick, 6 ms
    nudge = ((e.clientX < W / 2 ? 1 : -1) * 2 * Math.PI) / 180
    A.tick()
    A.buzz(6)
    follow = Math.abs(omega) < 0.3
    if (follow) omega = 0
    brakeFrom = Math.abs(omega)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!held) return
    const now = performance.now()
    trail.push([e.clientX, now])
    while (trail.length > 2 && now - trail[0][1] > 60) trail.shift()
    if (follow) psi = grabPsi + (e.clientX - grabX) / Rpx()
  })
  const release = () => {
    if (!held) return
    held = false
    const v = fingerV()
    const moved = trail.length > 1 && Math.abs(trail[trail.length - 1][0] - trail[0][0]) > 6
    const inGrace = performance.now() - grabT < 80 && !follow
    if (inGrace) omega = Math.max(-CAP, Math.min(CAP, omega + v))
    else if (moved) omega = Math.max(-CAP, Math.min(CAP, v))
    else if (follow) omega = 0
    if (moved) {
      if (run) run.swipes++
      hooks.act('spin')
      if (Math.abs(omega) > 6) A.buzz(10)
    }
    trail.length = 0
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    A.unlock()
    omega = Math.max(-CAP, Math.min(CAP, omega + (e.deltaY > 0 ? -1.2 : 1.2)))
  }, { passive: false })
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      A.unlock()
      omega = Math.max(-CAP, Math.min(CAP, omega + (e.key === 'ArrowLeft' ? 2 : -2)))
    }
  }
  window.addEventListener('keydown', onKey)

  // ---- one simulation frame ----
  let simMs = 0, prevPsi = 0
  let wrapped = false
  const tick = (dt: number) => {
    const t0 = performance.now()
    // the angle at the end of the last tick: a dragging finger moves psi between ticks
    const p0 = prevPsi
    const w0 = omega
    if (held && !follow) {
      // a finger on a spinning form: 80 ms of grace, then the form follows the finger and a still finger brakes
      if (performance.now() - grabT > 80) {
        const fv = fingerV()
        omega += (fv - omega) * (1 - Math.exp(-14 * dt))
        if (!wrapped && brakeFrom >= 8 && Math.abs(fv) < 1 && Math.abs(omega) < brakeFrom * 0.5) {
          wrapped = true
          if (run) run.wr = true
          A.slap(fabric)
          A.buzz(16)
          hooks.track('wrap', { peak: Math.round((brakeFrom / TAU) * 10), fabric })
          if (fabric === 'mamian') once('twirl_mamian_flat')
          else once('twirl_wrap')
        }
        if (Math.abs(omega) < 0.3 && Math.abs(fv) < 0.3) {
          follow = true
          omega = 0
          grabX = trail.length ? trail[trail.length - 1][0] : grabX
          grabPsi = psi
        }
      }
      psi += omega * dt
    } else if (!held) {
      omega = coast(omega, dt, sk.drag)
      psi += omega * dt
      wrapped = false
    }
    if (held && follow) omega = (psi - p0) / dt
    omega = Math.max(-CAP, Math.min(CAP, omega))
    nudge *= Math.exp(-dt / 0.06)
    const ps = psi + nudge
    alpha = (omega - w0) / dt
    stand.psi = ps
    stand.omega = (psi - p0) / dt
    sk.step(dt, ps, stand.omega)
    sk.update()
    stepTape(dt, p0, ps)
    stepTag(dt)
    stepItems(dt)
    stepSwap(dt)
    camera(dt)
    if (sway >= 0) {
      sway += dt
      if (sway > 2.5) {
        sway = -1
        dizzyFace = false
      }
    }
    if (!shot) {
      runStep(dt, psi - p0, sk.hem().deg)
      if (run && Math.abs(omega) <= 0.3 && !held) {
        quiet += dt
        if (quiet > 0.5) endRun()
      } else quiet = 0
      A.setWhoosh(stand.omega, fabric)
    }
    prevPsi = psi
    simMs = performance.now() - t0
  }

  // ---- harness ----
  const toy = { seed, ready: false, shot, fabric, hem: { deg: 0, rho: 0 }, psi: 0, omega: 0, simMs: 0, degrade: 0, under: -1, ctl: -1, items: 0, drawn: false }
  ;(window as unknown as Record<string, unknown>).__toy = toy

  const frame = (dbg = debug): Frame => {
    const m = skirtM()
    sk.layers.forEach((l, k) => {
      surfs[k].update(l.x, l.m)
      r.uploadSurface(surfs[k])
    })
    buildDyn()
    const nItems = buildItems()
    const { vp, eye } = view()
    return {
      vp, eye, psi: psi + nudge, tilt: tiltM(), dizzy: dizzyFace, band: fabric, bandM: m, debug: dbg,
      cloth: surfs.map((s, k) => ({ surf: s, look: looks[k], m })),
      dyn: { v: dynV, i: dynIdx, tapeN, tagN: 6, strN: 6 },
      items: { v: itV, i: itIdx, n: nItems },
    }
  }
  const countUnder = (mode: 'flat' | 'ctl') => {
    r.draw(frame(mode))
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight
    const px = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    let mag = 0, grn = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 200 && px[i + 1] < 40 && px[i + 2] > 200) mag++
      else if (px[i] < 40 && px[i + 1] > 200 && px[i + 2] < 40) grn++
    }
    return mag / Math.max(1, mag + grn)
  }

  const DT = 1 / 60
  const runFor = (secs: number, w: (t: number) => number | null) => {
    const n = Math.round(secs / DT)
    for (let k = 0; k < n; k++) {
      const v = w(k * DT)
      if (v !== null) omega = v
      tick(DT)
    }
  }
  if (shot) {
    const settle = (s: number) => runFor(s, () => 0)
    const ramp = (to: number, secs: number) => runFor(secs, (t) => (to * t) / secs)
    const hold = (v: number, secs: number) => runFor(secs, () => v)
    settle(0.2)
    if (shot === 'rest') settle(3)
    else if (shot === 'lift') {
      settle(1)
      ramp(TAU, 1.2)
      hold(TAU, 5)
    } else if (shot === 'full' || shot === 'og') {
      settle(1)
      ramp(CAP, 1.5)
      hold(CAP, 4)
    } else if (shot === 'spinup') {
      settle(3)
      omega = 12
      runFor(0.25, () => null)
    } else if (shot === 'wrap') {
      settle(1)
      ramp(12, 1)
      hold(12, 3)
      const n = Math.round(Number(q.get('after') ?? 0.6) / DT)
      for (let k = 0; k < n; k++) {
        omega *= Math.exp(-14 * DT)
        held = true
        follow = false
        grabT = -1e9
        psi += omega * DT
        tick(DT)
      }
      held = false
    } else if (shot === 'pockets') {
      settle(1)
      ramp(CAP, 1.5)
      hold(CAP, 0.4)
      pocketsDone = true
      const v = CAP * 0.12
      omega = CAP
      throwItem(0, 0.13, false, 0, v)
      throwItem(1, 0.06, true, 0.02, v * 1.1)
      throwItem(1, 0.06, true, 0.5, v * 0.9)
      throwItem(2, 0.13, false, 0.5, v)
      throwItem(3, 0.09, false, 0.48, v)
      hold(CAP, Number(q.get('after') ?? 0.35))
    } else if (shot.startsWith('t')) {
      settle(1)
      ramp(TAU, 1.2)
      hold(TAU, 4)
      runFor(Number(shot.slice(1)) || 0, () => null)
    }
    const hi = sk.hem()
    toy.hem = { deg: hi.deg, rho: hi.rho }
    if (debug === 'under') {
      toy.under = countUnder('flat')
      toy.ctl = countUnder('ctl')
    }
    const turns = Math.abs(stand.omega) / TAU
    hooks.label?.(
      `${shot} · ${fabric} · ${turns.toFixed(2)} turns/s · hem ${hi.deg.toFixed(1)}° from vertical · hem radius ${hi.rho.toFixed(2)} m` +
        (toy.under >= 0 ? ` · underside ${(toy.under * 100).toFixed(2)}% of skirt px` : ''),
    )
  }

  let raf = 0, last = performance.now(), slow = 0, idle = 0
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (lost || document.hidden) {
      last = now
      return
    }
    const dt = Math.min(1 / 30, (now - last) / 1000)
    // asleep: nothing moving, render at about 20 fps
    const asleep = !shot && !held && omega === 0 && swapT < 0 && sway < 0 && items.every((i) => i.rest) && Math.abs(tav) + Math.abs(tbv) < 0.01
    idle = asleep ? idle + dt : 0
    if (idle > 1.5 && now - last < 48) return
    last = now
    if (!shot) tick(dt)
    r.draw(frame())
    if (wantSnap) {
      wantSnap = false
      takeSnap()
    }
    toy.psi = psi
    toy.omega = omega
    toy.simMs = simMs
    toy.items = items.length
    const hi = sk.hem()
    toy.hem = { deg: hi.deg, rho: hi.rho }
    if (shot && ++slow > 3) {
      toy.drawn = true
      if (!q.has('card')) toy.ready = true
    }
  }
  if (!shot) runFor(1, () => 0)
  raf = requestAnimationFrame(loop)

  const onHide = () => {
    if (document.visibilityState === 'hidden' && runs > 0) hooks.track('session_twirl', { turns: Math.floor(totalTurns), runs, peak: Math.round(visitPeak * 10), fabrics: tried.size })
  }
  document.addEventListener('visibilitychange', onHide)
  return {
    swap,
    dispose: () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onHide)
    },
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
