// Give It a Twirl: the loop. The stand (5.2), the skirt on it (5.1, 5.5), the camera (3.1), the tag and
// the tape measure (3.3), input (2) and the harness (?seed=, ?shot=, ?fabric=, &debug=under).
// Standing rule: the camera stays 14 degrees above the horizontal, and no gesture or flag moves it.
import { lookAt, mul, perspective } from './cloth/gl'
import { Surface } from './cloth/mesh'
import { circleSkirt, coast, collide, drive, hem, mamianSkirt, stand, type FabricId, type Skirt } from './twirl/model'
import { goreSkirt, type Gores } from './twirl/gores'
import { Renderer, type Frame } from './twirl/render'
import { formR } from './twirl/scene'

const PITCH = (14 * Math.PI) / 180
const FOV = (30 * Math.PI) / 180
const AIM = [0, 0, 0.88]
const CAP = 13.8

export interface Hooks {
  onFirstTouch: () => void
  onNoGL: () => void
  label?: (s: string) => void
}

export function startGame(canvas: HTMLCanvasElement, hooks: Hooks) {
  const q = new URLSearchParams(location.search)
  const seed = Number(q.get('seed') ?? 7) || 7
  const shot = q.get('shot')
  const debug = q.get('debug') ?? ''
  const fabric: FabricId = q.get('fabric') === 'mamian' ? 'mamian' : 'chiffon'
  // the named fallback (pendulum gores) is the default for both skirts: see the gate notes; ?model=grid is the XPBD grid
  const model = q.get('model') ?? 'gores'
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false, premultipliedAlpha: false })
  if (!gl) {
    hooks.onNoGL()
    return () => {}
  }
  const r = new Renderer(gl, seed)
  let lost = false
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    lost = true
  })
  canvas.addEventListener('webglcontextrestored', () => {
    r.init()
    r.setSurface(surf, fabric + model)
    lost = false
  })

  // ---- the skirt ----
  let sk: Skirt | null = null
  let gores: Gores | null = null
  let surf: Surface
  if (model === 'gores') {
    gores = goreSkirt(fabric, seed)
    surf = new Surface(gores.cols, gores.rows, gores.su, gores.sv)
  } else {
    sk = fabric === 'mamian' ? mamianSkirt() : circleSkirt(seed)
    surf = new Surface(sk.cloth.cols, sk.cloth.rows, fabric === 'mamian' ? 1 : 2, 2)
  }
  r.setSurface(surf, fabric + model)

  // ---- stand, camera ----
  let psi = 0, omega = 0, alpha = 0
  let braking = false
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
  const hemInfo = () => (sk ? hem(sk) : gores!.hem())
  const camera = (dt: number) => {
    const sr = Math.min(W / 1.25, H / 2.55), sf = Math.min(W / 1.6, H / 2.55)
    const t = smooth(0.3, 0.7, hemInfo().rho)
    const goal = sr + (sf - sr) * t
    if (!scale) scale = goal
    // a 0.4 s spring
    const k = 120, c = 2 * Math.sqrt(k)
    scaleV += (k * (goal - scale) - c * scaleV) * dt
    scale += scaleV * dt
  }
  const view = () => {
    const d = H / (2 * scale * Math.tan(FOV / 2))
    const eye = [AIM[0], AIM[1] + d * Math.cos(PITCH), AIM[2] + d * Math.sin(PITCH)]
    // lens shift (not a tilt): the aim point sits at 0.41 h, which puts the figure where 3.1 anchors it
    const proj = perspective(FOV, W / H, 0.3, 40, 0.18)
    return { vp: mul(proj, lookAt(eye, AIM, [0, 0, 1])), eye }
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
      const f = (s + 1) / n
      const ps = ps0 + (ps1 - ps0) * f
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
        // keep it on the outside of the form (oval section, in the form's own frame)
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

  // dynamic geometry: tape ribbons, the tag, its string (interleaved p n uv)
  const dynV = new Float32Array((2 * (LINKS + 1) * 2 + 16 + 4 + 8) * 8)
  const dynI: number[] = []
  for (let sd = 0; sd < 2; sd++)
    for (let k = 0; k < LINKS; k++) {
      const a = (sd * (LINKS + 1) + k) * 2
      dynI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  // neck arc: 16 segments, after the chains
  const ARC0 = 2 * (LINKS + 1) * 2
  for (let k = 0; k < 7; k++) {
    const a = ARC0 + k * 2
    dynI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const tapeN = dynI.length
  const TAG0 = ARC0 + 16
  dynI.push(TAG0, TAG0 + 1, TAG0 + 2, TAG0 + 1, TAG0 + 3, TAG0 + 2)
  const tagN = 6
  const STR0 = TAG0 + 4
  dynI.push(STR0, STR0 + 1, STR0 + 2, STR0 + 1, STR0 + 3, STR0 + 2)
  const strN = 6
  const dynIdx = new Uint16Array(dynI)
  const put = (v: number, p: number[], n: number[], u: number, w: number) => {
    const o = v * 8
    dynV[o] = p[0]; dynV[o + 1] = p[1]; dynV[o + 2] = p[2]
    dynV[o + 3] = n[0]; dynV[o + 4] = n[1]; dynV[o + 5] = n[2]
    dynV[o + 6] = u; dynV[o + 7] = w
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
        let ax = ty * 0 - tz * ny, ay = tz * nx - tx * 0, az = tx * ny - ty * nx
        const al = Math.hypot(ax, ay, az) || 1
        ax /= al; ay /= al; az /= al
        const v = (sd * (LINKS + 1) + k) * 2
        const p = [tape[i] + nx * 0.004, tape[i + 1] + ny * 0.004, tape[i + 2]]
        put(v, [p[0] - ax * W2, p[1] - ay * W2, p[2] - az * W2], [nx, ny, 0], k * 0.06 + sd * 0.5, 0)
        put(v + 1, [p[0] + ax * W2, p[1] + ay * W2, p[2] + az * W2], [nx, ny, 0], k * 0.06 + sd * 0.5, 1)
      }
    for (let k = 0; k < 8; k++) {
      const a = Math.atan2(0.034, 0.056) + (k / 7) * (Math.PI - 2 * Math.atan2(0.034, 0.056))
      const la = a - Math.PI
      const rx = 0.066 * Math.cos(la) * 1.0, ry = 0.066 * Math.sin(la)
      const x = rx * c - ry * s, y = rx * s + ry * c
      const nl = Math.hypot(x, y) || 1
      put(ARC0 + k * 2, [x, y, 1.466], [x / nl, y / nl, 0.3], k * 0.05, 0)
      put(ARC0 + k * 2 + 1, [x * 0.92, y * 0.92, 1.482], [x / nl, y / nl, 0.3], k * 0.05, 1)
    }
    // tag: pinned at the chest front, swings out with the spin and back against the turn
    const nL = [0, 1, 0], tL = [-1, 0, 0]
    const R = (v: number[]) => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]
    const n = R(nL), t = R(tL)
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
    put(TAG0, at(-1, 0), N, 0, 0)
    put(TAG0 + 1, at(-1, 1), N, 0, 1)
    put(TAG0 + 2, at(1, 0), N, 1, 0)
    put(TAG0 + 3, at(1, 1), N, 1, 1)
    const hole = at(0, 0.12)
    const sw = 0.0016
    put(STR0, [pin[0] - side[0] * sw, pin[1] - side[1] * sw, pin[2]], N, 0, 0)
    put(STR0 + 1, [hole[0] - side[0] * sw, hole[1] - side[1] * sw, hole[2]], N, 0, 1)
    put(STR0 + 2, [pin[0] + side[0] * sw, pin[1] + side[1] * sw, pin[2]], N, 1, 0)
    put(STR0 + 3, [hole[0] + side[0] * sw, hole[1] + side[1] * sw, hole[2]], N, 1, 1)
  }

  // ---- one simulation frame ----
  let simMs = 0
  const tick = (dt: number) => {
    const t0 = performance.now()
    const p0 = psi
    const w0 = omega
    if (!held) {
      if (braking) omega *= Math.exp(-14 * dt)
      else omega = coast(omega, dt, sk ? sk.drag : gores!.drag)
    }
    omega = Math.max(-CAP, Math.min(CAP, omega))
    if (!held) psi += omega * dt
    else psi = heldPsi
    alpha = (omega - w0) / dt
    stand.psi = psi
    stand.omega = (psi - p0) / dt
    if (sk) {
      drive(sk, p0, psi)
      sk.cloth.step(dt, sk.S, collide)
    } else gores!.step(dt, psi, stand.omega)
    stepTape(dt, p0, psi)
    stepTag(dt)
    camera(dt)
    simMs = performance.now() - t0
  }

  // ---- input: swipe sideways to spin (2); vertical movement is ignored ----
  let held = false, heldPsi = 0, grabX = 0, grabPsi = 0, grabT = 0
  const trail: [number, number][] = []
  let touched = false
  const Rpx = () => Math.min(0.3 * W, 220)
  canvas.addEventListener('pointerdown', (e) => {
    if (shot) return
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
    if (Math.abs(omega) < 0.3) {
      held = true
      heldPsi = psi
    }
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!e.buttons && e.pointerType === 'mouse') return
    if (!trail.length) return
    const now = performance.now()
    trail.push([e.clientX, now])
    while (trail.length > 2 && now - trail[0][1] > 60) trail.shift()
    if (!held && now - grabT > 80) {
      held = true
      grabX = e.clientX
      grabPsi = psi
      omega = 0
    }
    if (held) heldPsi = grabPsi + (e.clientX - grabX) / Rpx()
  })
  const release = () => {
    if (!trail.length) return
    if (held) {
      const a = trail[0], b = trail[trail.length - 1]
      const dtm = (b[1] - a[1]) / 1000
      omega = dtm > 0.005 ? Math.max(-CAP, Math.min(CAP, (b[0] - a[0]) / Rpx() / dtm)) : 0
    }
    held = false
    trail.length = 0
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)

  // ---- harness ----
  const toy = {
    seed,
    ready: false,
    shot,
    fabric,
    model,
    hem: { deg: 0, rho: 0 },
    psi: 0,
    omega: 0,
    simMs: 0,
    degrade: 0,
    under: -1,
    ctl: -1,
    camPitchDeg: 14,
  }
  ;(window as unknown as Record<string, unknown>).__toy = toy

  const frame = (dbg = debug): Frame => {
    surf.update(sk ? sk.cloth.x : gores!.positions())
    r.uploadSurface(surf)
    buildDyn()
    const { vp, eye } = view()
    return { vp, eye, psi, fabric, debug: dbg, dyn: { v: dynV, i: dynIdx, tapeN, tagN, strN } }
  }
  /** Share of the skirt's visible pixels that are its underside (back faces): opaque, depth-tested. */
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
    return { frac: mag / Math.max(1, mag + grn), mag, grn }
  }

  // scripted states (fixed steps, not wall-clock)
  const DT = 1 / 60
  const run = (secs: number, w: (t: number) => number | null) => {
    const n = Math.round(secs / DT)
    for (let k = 0; k < n; k++) {
      const v = w(k * DT)
      if (v !== null) {
        held = true
        const ps = psi + v * DT
        heldPsi = ps
        omega = v
        tick(DT)
        held = false
      } else tick(DT)
    }
  }
  const settle = (secs: number) => run(secs, () => 0)
  if (shot) {
    settle(0.2)
    const ramp = (to: number, secs: number) => run(secs, (t) => (to * t) / secs)
    const hold = (v: number, secs: number) => run(secs, () => v)
    if (shot === 'rest') settle(3)
    else if (shot === 'lift') {
      settle(1)
      ramp(2 * Math.PI, 1.2)
      hold(2 * Math.PI, 5)
    } else if (shot === 'full' || shot === 'og') {
      settle(1)
      ramp(CAP, 1.5)
      hold(CAP, 4)
    } else if (shot === 'spinup') {
      settle(3)
      omega = 12
      run(0.25, () => null)
    } else if (shot === 'wrap') {
      settle(1)
      ramp(12, 1)
      hold(12, 3)
      braking = true
      run(Number(q.get('after') ?? 0.2), () => null)
    } else if (shot.startsWith('t')) {
      // t<secs>: coast from 1 turn/s for that long (the settle sheet)
      settle(1)
      ramp(2 * Math.PI, 1.2)
      hold(2 * Math.PI, 4)
      run(Number(shot.slice(1)) || 0, () => null)
    }
    const hi = hemInfo()
    toy.hem = { deg: hi.deg, rho: hi.rho }
    if (debug === 'under') {
      toy.under = countUnder('flat').frac
      toy.ctl = countUnder('ctl').frac
    }
    const turns = Math.abs(stand.omega) / (2 * Math.PI)
    hooks.label?.(
      `${shot}${fabric === 'mamian' ? ' · mamian' : ''} · ${turns.toFixed(2)} turns/s · hem ${hi.deg.toFixed(1)}° from vertical · hem radius ${hi.rho.toFixed(2)} m` +
        (toy.under >= 0 ? ` · underside ${(toy.under * 100).toFixed(2)}% of skirt px (control ${(toy.ctl * 100).toFixed(0)}%)` : ''),
    )
  }

  let raf = 0, last = performance.now(), slow = 0
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (lost) return
    const dt = Math.min(1 / 30, (now - last) / 1000)
    last = now
    if (!shot) tick(dt)
    r.draw(frame())
    toy.psi = psi
    toy.omega = omega
    toy.simMs = simMs
    const hi = hemInfo()
    toy.hem = { deg: hi.deg, rho: hi.rho }
    if (shot && ++slow > 3) toy.ready = true
  }
  if (!shot) settle(1)
  raf = requestAnimationFrame(loop)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
