// Baked textures for the atelier (twirl.md 3.3) and the skirts (3.4), painted once with Canvas 2D or
// written straight into pixel arrays (cloth patterns carry a sheen multiplier in alpha, so no premultiply).
import { rng } from './model'

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}
const hex = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]

/** Herringbone oak, one period: planks 0.08 by 0.32 m, period 0.64 m (texture repeats). */
export function floorTex(seed: number) {
  const N = 512, k = 4, w = N / (2 * k)
  const [c, g] = canvas(N, N)
  const r = rng(seed + 11)
  const cols = ['#C49A6C', '#B5895C', '#BE9365', '#B98F60']
  g.fillStyle = '#9C7650'
  g.fillRect(0, 0, N, N)
  const plank = (x: number, y: number, pw: number, ph: number, vert: boolean) => {
    g.fillStyle = cols[Math.floor(r() * cols.length)]
    g.fillRect(x + 0.8, y + 0.8, pw - 1.6, ph - 1.6)
    // grain along the plank
    g.save()
    g.beginPath()
    g.rect(x + 0.8, y + 0.8, pw - 1.6, ph - 1.6)
    g.clip()
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '120,80,45' : '220,180,130'},${0.08 + r() * 0.1})`
      g.lineWidth = 0.6 + r() * 1.2
      g.beginPath()
      if (vert) {
        const gx = x + r() * pw
        g.moveTo(gx, y)
        g.bezierCurveTo(gx + (r() - 0.5) * 6, y + ph / 3, gx + (r() - 0.5) * 6, y + (2 * ph) / 3, gx + (r() - 0.5) * 4, y + ph)
      } else {
        const gy = y + r() * ph
        g.moveTo(x, gy)
        g.bezierCurveTo(x + pw / 3, gy + (r() - 0.5) * 6, x + (2 * pw) / 3, gy + (r() - 0.5) * 6, x + pw, gy + (r() - 0.5) * 4)
      }
      g.stroke()
    }
    g.restore()
  }
  for (let a = -3; a <= 3; a++)
    for (let n = -3 * k; n <= 3 * k; n++) {
      const ox = n + a * k, oy = n - a * k
      for (const [tx, ty] of [[0, 0], [N, 0], [0, N], [-N, 0], [0, -N]]) {
        plank(ox * w + tx, oy * w + ty, k * w, w, false)
        plank((ox + k) * w + tx, (oy + 1 - k) * w + ty, w, k * w, true)
      }
    }
  return c
}

/** Atelier wall, x from -3 to 3 m, z from 0 to 3 m: warm cream, the arched window's light, a skirting board, paper patterns at the right. */
export function wallTex(seed: number) {
  const W = 1024, H = 512
  const [c, g] = canvas(W, H)
  const r = rng(seed + 23)
  const X = (m: number) => ((m + 3) / 6) * W, Z = (m: number) => H - (m / 3) * H
  g.fillStyle = '#EFE6DA'
  g.fillRect(0, 0, W, H)
  // plaster mottle
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '150,120,90' : '255,250,240'},${0.008 + r() * 0.012})`
    const s = 2 + r() * 10
    g.beginPath()
    g.ellipse(r() * W, r() * H, s, s * (0.6 + r() * 0.6), r() * 3, 0, 7)
    g.fill()
  }
  // the tall arched window's light, thrown from the upper left, soft
  g.save()
  g.filter = 'blur(14px)'
  g.fillStyle = 'rgba(255,246,222,0.55)'
  g.globalAlpha = 0.5
  const wx = X(-0.95), wz = Z(2.6), ww = X(-0.3) - wx, wh = Z(0.9) - wz
  g.beginPath()
  g.moveTo(wx, wz + ww / 2)
  g.arc(wx + ww / 2, wz + ww / 2, ww / 2, Math.PI, 0)
  g.lineTo(wx + ww + 40, wz + wh)
  g.lineTo(wx + 40, wz + wh)
  g.closePath()
  g.fill()
  // the glazing bars as softer bands
  g.fillStyle = 'rgba(200,180,150,0.5)'
  g.fillRect(wx + ww / 2 + 6, wz + 10, 6, wh)
  g.fillRect(wx + 10, wz + wh * 0.55, ww + 30, 6)
  g.restore()
  // skirting board
  g.fillStyle = '#E4D7C5'
  g.fillRect(0, Z(0.12), W, H - Z(0.12))
  g.fillStyle = 'rgba(120,90,60,0.25)'
  g.fillRect(0, Z(0.12), W, 2)
  // paper patterns pinned at the right edge, half out of frame
  const pats = [
    [0.62, 1.95, 0.32, 0.55, -0.05],
    [0.9, 1.7, 0.28, 0.62, 0.06],
    [0.7, 1.25, 0.26, 0.4, 0.02],
  ]
  for (const [px, pz, pw, ph, rot] of pats) {
    g.save()
    g.translate(X(px), Z(pz))
    g.rotate(rot)
    const w = (pw / 6) * W, h = (ph / 3) * H
    g.fillStyle = 'rgba(80,60,40,0.10)'
    g.fillRect(3, 4, w, h)
    g.fillStyle = '#E9D9B8'
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(w, 0)
    g.lineTo(w * 0.92, h)
    g.lineTo(w * 0.1, h * 0.96)
    g.closePath()
    g.fill()
    g.strokeStyle = 'rgba(90,70,50,0.55)'
    g.setLineDash([3, 3])
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(w * 0.15, h * 0.12)
    g.quadraticCurveTo(w * 0.55, h * 0.35, w * 0.2, h * 0.85)
    g.stroke()
    g.setLineDash([])
    g.strokeStyle = 'rgba(170,60,60,0.5)'
    g.beginPath()
    g.moveTo(w * 0.5, h * 0.2)
    g.lineTo(w * 0.5, h * 0.7)
    g.stroke()
    g.fillStyle = '#9A9AA0'
    g.beginPath()
    g.arc(w * 0.5, 5, 3, 0, 7)
    g.fill()
    g.restore()
  }
  return c
}

/** Cutting table top (kraft paper over wood) with shears and a stub of tailor's chalk. 1.2 by 0.9 m. */
export function tableTex() {
  const W = 512, H = 512
  const [c, g] = canvas(W, H)
  g.fillStyle = '#C9A57A'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#E2CFA9'
  g.fillRect(20, 16, W - 40, H - 32)
  g.strokeStyle = 'rgba(120,90,60,0.3)'
  for (let i = 0; i < 9; i++) {
    g.beginPath()
    g.moveTo(40 + i * 50, 16)
    g.lineTo(40 + i * 50, H - 16)
    g.stroke()
  }
  // shears (closed), near the front right corner of the table
  g.save()
  g.translate(W * 0.78, H * 0.78)
  g.rotate(-0.5)
  g.fillStyle = '#3B3B40'
  g.beginPath()
  g.ellipse(-40, -7, 13, 9, 0, 0, 7)
  g.ellipse(-40, 9, 13, 9, 0, 0, 7)
  g.fill()
  g.fillStyle = '#E2CFA9'
  g.beginPath()
  g.ellipse(-40, -7, 7, 4.5, 0, 0, 7)
  g.ellipse(-40, 9, 7, 4.5, 0, 0, 7)
  g.fill()
  g.fillStyle = '#B9BCC2'
  g.beginPath()
  g.moveTo(-27, -4)
  g.lineTo(60, -1)
  g.lineTo(60, 1)
  g.lineTo(-27, 5)
  g.closePath()
  g.fill()
  g.restore()
  // tailor's chalk
  g.save()
  g.translate(W * 0.6, H * 0.88)
  g.rotate(0.3)
  g.fillStyle = '#F4EFE6'
  g.fillRect(-12, -8, 24, 16)
  g.fillStyle = 'rgba(0,0,0,0.12)'
  g.fillRect(-12, 6, 24, 3)
  g.restore()
  return c
}

/** Linen for the dress form: weave noise, four princess seams, a small blank brass plate at the collarbone. u round (front at 0.25), v hip to neck. */
export function linenTex(seed: number) {
  const W = 512, H = 256
  const [c, g] = canvas(W, H)
  const r = rng(seed + 31)
  g.fillStyle = '#D9CDB8'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '140,120,90' : '250,244,230'},${0.06 + r() * 0.06})`
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1)
  }
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = 'rgba(120,100,70,0.035)'
    g.fillRect(0, y, W, 1)
  }
  // princess seams: curving over the bust, front pair and back pair
  for (const base of [0.25, 0.75])
    for (const sgn of [-1, 1]) {
      g.strokeStyle = 'rgba(110,90,60,0.5)'
      g.lineWidth = 1.6
      g.beginPath()
      for (let v = 0; v <= 1.001; v += 0.02) {
        const off = 0.055 + 0.03 * Math.sin(Math.PI * Math.min(1, v * 1.3))
        const x = (base + sgn * off) * W, y = H - v * H
        if (v === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      g.strokeStyle = 'rgba(250,245,232,0.5)'
      g.lineWidth = 0.8
      g.setLineDash([3, 3])
      g.stroke()
      g.setLineDash([])
    }
  // centre front seam, faint
  g.strokeStyle = 'rgba(110,90,60,0.25)'
  g.beginPath()
  g.moveTo(0.25 * W, 0)
  g.lineTo(0.25 * W, H)
  g.stroke()
  // brass plate at the collarbone
  const px = 0.25 * W, py = H * 0.12
  const gr = g.createLinearGradient(px - 14, py - 6, px + 14, py + 6)
  gr.addColorStop(0, '#8E6A2E')
  gr.addColorStop(0.45, '#E8C778')
  gr.addColorStop(1, '#9A7434')
  g.fillStyle = gr
  g.beginPath()
  g.roundRect(px - 13, py - 6, 26, 12, 3)
  g.fill()
  g.strokeStyle = 'rgba(80,55,20,0.6)'
  g.lineWidth = 1
  g.stroke()
  return c
}

/** Kraft luggage tag with a pencil face (two dots and a short curve). */
export function tagTex() {
  const W = 128, H = 256
  const [c, g] = canvas(W, H)
  g.clearRect(0, 0, W, H)
  g.fillStyle = '#C9A068'
  g.beginPath()
  g.moveTo(W * 0.25, 4)
  g.lineTo(W * 0.75, 4)
  g.lineTo(W - 4, H * 0.18)
  g.lineTo(W - 4, H - 4)
  g.lineTo(4, H - 4)
  g.lineTo(4, H * 0.18)
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(255,240,210,0.25)'
  g.fillRect(8, H * 0.2, W - 16, H * 0.5)
  // reinforced hole
  g.fillStyle = '#E8D3A8'
  g.beginPath()
  g.arc(W / 2, H * 0.12, 11, 0, 7)
  g.fill()
  g.fillStyle = '#6B4A28'
  g.beginPath()
  g.arc(W / 2, H * 0.12, 5, 0, 7)
  g.fill()
  // the face, in pencil
  g.fillStyle = 'rgba(50,45,45,0.85)'
  g.beginPath()
  g.arc(W * 0.37, H * 0.48, 5, 0, 7)
  g.arc(W * 0.63, H * 0.48, 5, 0, 7)
  g.fill()
  g.strokeStyle = 'rgba(50,45,45,0.8)'
  g.lineWidth = 4
  g.lineCap = 'round'
  g.beginPath()
  g.arc(W / 2, H * 0.56, 16, 0.5, Math.PI - 0.5)
  g.stroke()
  return c
}

/** Yellow tailor's tape: ticks and numbers along its length (u along, v across). */
export function tapeTex() {
  const W = 512, H = 16
  const [c, g] = canvas(W, H)
  g.fillStyle = '#F2C631'
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(40,30,20,0.85)'
  for (let i = 0; i < 64; i++) g.fillRect(i * 8, 0, 1, i % 5 === 0 ? 7 : 4)
  g.font = 'bold 7px sans-serif'
  for (let i = 0; i < 13; i++) g.fillText(String(i + 1), i * 40 + 3, 14)
  return c
}

/** Chiffon (3.4): dusty rose to peach from waist to hem, plain weave, narrow rolled hem. Alpha = sheen multiplier / 2.5. */
export function chiffonTex(seed: number) {
  const W = 256, H = 256
  const d = new Uint8Array(W * H * 4)
  const a = hex('#F4A7B5'), b = hex('#FBD5C0')
  const r = rng(seed + 41)
  const noise = new Float32Array(W * H).map(() => r())
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1)
    const t = Math.pow(v, 0.9)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const weave = ((x & 1) ^ (y & 1) ? 1 : -1) * 3 + (noise[y * W + x] - 0.5) * 5
      let R = a[0] + (b[0] - a[0]) * t + weave, G = a[1] + (b[1] - a[1]) * t + weave, B = a[2] + (b[2] - a[2]) * t + weave
      // rolled hem: a darker narrow band with a stitch line
      if (v > 0.965) {
        const e = v > 0.985 ? 0.8 : 0.88
        R *= e; G *= e; B *= e
        if (v > 0.972 && v < 0.978 && x % 6 < 3) { R *= 0.82; G *= 0.8; B *= 0.82 }
      }
      d[i] = Math.max(0, Math.min(255, R))
      d[i + 1] = Math.max(0, Math.min(255, G))
      d[i + 2] = Math.max(0, Math.min(255, B))
      d[i + 3] = 102 // sheen x1
    }
  }
  return { w: W, h: H, data: d }
}

/**
 * 马面裙 (3.4): deep navy satin, a 0.14 m band of woven gold scrollwork above the hem and a narrower one
 * at knee height, a faint self-colour damask. u runs round the 4.5 m hem (repeats `rep` times), v waist to hem (0.95 m).
 */
export function mamianTex() {
  const W = 512, H = 512
  const g = canvas(W, H)[1]
  g.fillStyle = '#1E2A4A'
  g.fillRect(0, 0, W, H)
  const V = (m: number) => (m / 0.95) * H
  // faint damask: cloud scrolls in a self colour
  g.strokeStyle = 'rgba(70,90,140,0.35)'
  g.lineWidth = 2
  for (let y = 40; y < V(0.55); y += 64)
    for (let x = (y / 64) % 2 ? 0 : 32; x < W; x += 64) cloud(g, x, y, 10)
  const band = (top: number, h: number, big: boolean) => {
    const y0 = V(top), y1 = V(top + h)
    g.fillStyle = '#C9A24A'
    g.fillRect(0, y0, W, 3)
    g.fillRect(0, y1 - 3, W, 3)
    g.fillStyle = '#25305A'
    g.fillRect(0, y0 + 5, W, y1 - y0 - 10)
    g.strokeStyle = '#E2BE62'
    g.lineWidth = big ? 4 : 3
    const mid = (y0 + y1) / 2, amp = (y1 - y0) * 0.22
    const per = big ? 64 : 48
    g.beginPath()
    for (let x = 0; x <= W; x += 2) {
      const y = mid + amp * Math.sin((x / per) * Math.PI * 2)
      if (x === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
    g.lineWidth = big ? 3 : 2
    for (let x = 0; x < W; x += per) {
      cloud(g, x + per * 0.25, mid - amp * 1.25, big ? 9 : 6, true)
      cloud(g, x + per * 0.75, mid + amp * 1.25, big ? 9 : 6, false)
      if (big) {
        g.fillStyle = '#E2BE62'
        g.beginPath()
        g.arc(x + per * 0.5, mid, 3.5, 0, 7)
        g.fill()
      }
    }
  }
  band(0.95 - 0.14 - 0.035, 0.14, true)
  band(0.52, 0.06, false)
  // hem edge
  g.fillStyle = '#C9A24A'
  g.fillRect(0, H - 6, W, 6)
  const img = g.getImageData(0, 0, W, H).data
  const d = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const R = img[4 * i], G = img[4 * i + 1], B = img[4 * i + 2]
    d[4 * i] = R; d[4 * i + 1] = G; d[4 * i + 2] = B
    const gold = Math.max(0, Math.min(1, (R - B - 10) / 90))
    d[4 * i + 3] = Math.round((1 + 1.5 * gold) * 102)
  }
  return { w: W, h: H, data: d }
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number, up = true) {
  const k = up ? 1 : -1
  g.beginPath()
  g.arc(x, y, s, Math.PI * 0.9, Math.PI * 2.4)
  g.stroke()
  g.beginPath()
  g.arc(x + s * 1.1, y + k * s * 0.3, s * 0.55, Math.PI * 1.1, Math.PI * 2.6)
  g.stroke()
  g.beginPath()
  g.arc(x - s * 1.1, y + k * s * 0.3, s * 0.55, Math.PI * 0.4, Math.PI * 1.9)
  g.stroke()
}
