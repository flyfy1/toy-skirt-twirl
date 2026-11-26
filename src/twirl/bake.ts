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

/** Kraft luggage tag with a pencil face (two dots and a short curve; spiral eyes when the form is dizzy). */
export function tagTex(dizzy: boolean) {
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
  g.fillStyle = '#E8D3A8'
  g.beginPath()
  g.arc(W / 2, H * 0.12, 11, 0, 7)
  g.fill()
  g.fillStyle = '#6B4A28'
  g.beginPath()
  g.arc(W / 2, H * 0.12, 5, 0, 7)
  g.fill()
  g.strokeStyle = 'rgba(50,45,45,0.85)'
  g.fillStyle = 'rgba(50,45,45,0.85)'
  g.lineCap = 'round'
  if (dizzy) {
    g.lineWidth = 2.5
    for (const ex of [0.33, 0.67]) {
      g.beginPath()
      for (let a = 0; a < Math.PI * 5; a += 0.2) {
        const r = 1 + a * 1.1
        const x = W * ex + r * Math.cos(a), y = H * 0.47 + r * Math.sin(a)
        if (a === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    g.lineWidth = 3.5
    g.beginPath()
    for (let x = -16; x <= 16; x += 2) g.lineTo(W / 2 + x, H * 0.6 + Math.sin(x / 3) * 3)
    g.stroke()
  } else {
    g.beginPath()
    g.arc(W * 0.37, H * 0.48, 5, 0, 7)
    g.arc(W * 0.63, H * 0.48, 5, 0, 7)
    g.fill()
    g.lineWidth = 4
    g.beginPath()
    g.arc(W / 2, H * 0.56, 16, 0.5, Math.PI - 0.5)
    g.stroke()
  }
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

/** The pockets' contents and glitter, one 128 px cell each: keys, coin, tissues, hair tie. */
export function itemsTex() {
  const [c, g] = canvas(256, 256)
  g.clearRect(0, 0, 256, 256)
  // keys on a ring
  g.strokeStyle = '#B8BCC4'
  g.lineWidth = 6
  g.beginPath()
  g.arc(40, 40, 22, 0, 7)
  g.stroke()
  for (const [ang, col] of [[0.6, '#C9A24A'], [1.3, '#C4C8CE']] as const) {
    g.save()
    g.translate(40 + 22 * Math.cos(ang), 40 + 22 * Math.sin(ang))
    g.rotate(ang)
    g.fillStyle = col
    g.beginPath()
    g.arc(10, 0, 11, 0, 7)
    g.fill()
    g.fillRect(16, -5, 52, 10)
    g.fillRect(52, 4, 6, 8)
    g.fillRect(62, 4, 5, 6)
    g.fillStyle = 'rgba(0,0,0,0.5)'
    g.beginPath()
    g.arc(8, 0, 4, 0, 7)
    g.fill()
    g.restore()
  }
  // coin
  const gr = g.createRadialGradient(178, 52, 6, 192, 64, 52)
  gr.addColorStop(0, '#FFF3C4')
  gr.addColorStop(0.6, '#D9B44A')
  gr.addColorStop(1, '#9C7A22')
  g.fillStyle = gr
  g.beginPath()
  g.arc(192, 64, 50, 0, 7)
  g.fill()
  g.strokeStyle = 'rgba(110,80,20,0.7)'
  g.lineWidth = 3
  g.beginPath()
  g.arc(192, 64, 40, 0, 7)
  g.stroke()
  g.fillStyle = 'rgba(110,80,20,0.8)'
  g.font = 'bold 34px sans-serif'
  g.textAlign = 'center'
  g.fillText('1', 192, 76)
  // tissues
  g.fillStyle = '#F7F7F4'
  g.fillRect(14, 150, 100, 70)
  g.fillStyle = '#7FB3D9'
  g.fillRect(14, 172, 100, 22)
  g.fillStyle = '#FFFFFF'
  g.fillRect(40, 158, 48, 8)
  // hair tie
  g.strokeStyle = '#2A2226'
  g.lineWidth = 12
  g.beginPath()
  g.arc(192, 192, 38, 0, 7)
  g.stroke()
  return c
}

/** Chiffon (3.4), one texture round the whole skirt: dusty rose to peach, a deeper band near the waist, four
 * panel seams, and sheen bands round the skirt (alpha = sheen multiplier / 2.5) that turn with the cloth. */
export function chiffonTex(seed: number) {
  const W = 512, H = 256
  const d = new Uint8Array(W * H * 4)
  const a = hex('#F2A0B0'), b = hex('#F8C4BC'), deep = hex('#DC7E92')
  const r = rng(seed + 41)
  const noise = new Float32Array(W * H).map(() => r())
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1)
    const t = Math.pow(v, 0.9)
    const inner = Math.max(0, 1 - v / 0.22)
    for (let x = 0; x < W; x++) {
      const u = x / W
      const i = (y * W + x) * 4
      const weave = ((x & 1) ^ (y & 1) ? 1 : -1) * 3 + (noise[y * W + x] - 0.5) * 5
      const band = Math.sin(u * Math.PI * 2 * 8)
      const tone = 1 + 0.06 * band
      let R = (a[0] + (b[0] - a[0]) * t) * tone + weave, G = (a[1] + (b[1] - a[1]) * t) * tone + weave, B = (a[2] + (b[2] - a[2]) * t) * tone + weave
      R += (deep[0] - R) * inner * 0.7; G += (deep[1] - G) * inner * 0.7; B += (deep[2] - B) * inner * 0.7
      const seam = Math.abs(((u * 4 + 0.5) % 1) - 0.5) * W / 4
      if (seam < 1.2) { R *= 0.9; G *= 0.86; B *= 0.88 }
      if (v > 0.965) {
        const e = v > 0.985 ? 0.8 : 0.88
        R *= e; G *= e; B *= e
        if (v > 0.972 && v < 0.978 && x % 6 < 3) { R *= 0.82; G *= 0.8; B *= 0.82 }
      }
      d[i] = Math.max(0, Math.min(255, R))
      d[i + 1] = Math.max(0, Math.min(255, G))
      d[i + 2] = Math.max(0, Math.min(255, B))
      d[i + 3] = Math.round(102 * (0.35 + 0.75 * (0.5 + 0.5 * band)))
    }
  }
  return { w: W, h: H, data: d }
}

/** The slip under the chiffon: matte soft pink with a plain hem. */
export function slipTex() {
  const W = 64, H = 64
  const d = new Uint8Array(W * H * 4)
  const a = hex('#F3B3BF')
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, e = y / H > 0.95 ? 0.9 : 1
      d[i] = a[0] * e; d[i + 1] = a[1] * e; d[i + 2] = a[2] * e; d[i + 3] = 40
    }
  return { w: W, h: H, data: d }
}

/** Denim (3.4) round the whole skirt: indigo twill, orange double topstitching at the hem, two patch pockets at the hips (u 0 and 0.5). */
export function denimTex(seed: number) {
  const W = 1024, H = 256
  const g = canvas(W, H)[1]
  const r = rng(seed + 61)
  g.fillStyle = '#3B5B8C'
  g.fillRect(0, 0, W, H)
  for (let k = -H; k < W; k += 3) {
    g.strokeStyle = `rgba(${r() < 0.5 ? '20,35,70' : '120,150,200'},${0.18 + r() * 0.12})`
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(k, 0)
    g.lineTo(k + H, H)
    g.stroke()
  }
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(230,240,255,${r() * 0.06})`
    g.fillRect(r() * W, r() * H, 2 + r() * 6, 1)
  }
  const stitch = (x0: number, y0: number, x1: number, y1: number) => {
    g.strokeStyle = '#E08A2E'
    g.lineWidth = 1.6
    g.setLineDash([5, 3])
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
    g.setLineDash([])
  }
  // hem: a folded band and two rows of orange topstitching
  g.fillStyle = 'rgba(20,30,60,0.35)'
  g.fillRect(0, H * 0.93, W, H * 0.07)
  stitch(0, H * 0.945, W, H * 0.945)
  stitch(0, H * 0.965, W, H * 0.965)
  // patch pockets at the hips
  for (const u of [0, 0.5, 1]) {
    const pw = W * 0.09, x = u * W - pw / 2, y = H * 0.1, ph = H * 0.32
    g.fillStyle = '#44659A'
    g.fillRect(x, y, pw, ph)
    g.fillStyle = 'rgba(10,20,50,0.35)'
    g.fillRect(x, y + ph, pw, 3)
    g.fillRect(x + pw, y, 3, ph)
    stitch(x + 3, y + 3, x + 3, y + ph - 3)
    stitch(x + pw - 3, y + 3, x + pw - 3, y + ph - 3)
    stitch(x + 3, y + ph - 3, x + pw - 3, y + ph - 3)
    stitch(x, y + 10, x + pw, y + 10)
  }
  const img = g.getImageData(0, 0, W, H).data
  const d = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    d[4 * i] = img[4 * i]; d[4 * i + 1] = img[4 * i + 1]; d[4 * i + 2] = img[4 * i + 2]
    d[4 * i + 3] = 102
  }
  return { w: W, h: H, data: d }
}

/** Tulle: lilac net with sparse glitter (glitter carries a strong sheen). */
export function tulleTex(seed: number) {
  const W = 256, H = 256
  const d = new Uint8Array(W * H * 4)
  const a = hex('#C9B6F2')
  const r = rng(seed + 71)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const net = (x % 6 === 0 || (y + (x % 12 < 6 ? 0 : 3)) % 6 === 0) ? 0.88 : 1
      d[i] = a[0] * net; d[i + 1] = a[1] * net; d[i + 2] = a[2] * net; d[i + 3] = 80
    }
  for (let k = 0; k < 60; k++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H)
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = (((y + dy) % H) * W + ((x + dx) % W)) * 4
      d[i] = 255; d[i + 1] = 250; d[i + 2] = 255; d[i + 3] = 255
    }
  }
  return { w: W, h: H, data: d }
}

/** 马面裙 round the whole 4.5 m hem (u = 0 is the middle of the front panel). */
export const MAMIAN = { PANEL: 0.16, RUN: 2.09 }

/**
 * 马面裙 (3.4): deep navy satin; a 0.14 m band of woven gold scrollwork above the hem and a narrower one at
 * knee height; the two flat 马面 panels (front and back) woven with a column of gold roundels and edged in gold,
 * so a panel is plain to see as it passes. Alpha = sheen multiplier / 2.5 (gold 2.5).
 */
export function mamianTex() {
  const W = 2048, H = 512
  const g = canvas(W, H)[1]
  const HEM = 2 * MAMIAN.PANEL + 2 * MAMIAN.RUN
  g.fillStyle = '#1E2A4A'
  g.fillRect(0, 0, W, H)
  const V = (m: number) => (m / 0.95) * H
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
  // the two 马面: a richer ground, gold edges, a column of woven roundels
  const pw = (MAMIAN.PANEL / HEM) * W
  for (const cx of [0, W / 2, W]) {
    const x0 = cx - pw / 2
    g.fillStyle = '#243466'
    g.fillRect(x0, 0, pw, V(0.95 - 0.175))
    g.fillStyle = '#D6B25A'
    g.fillRect(x0, 0, 3, H)
    g.fillRect(x0 + pw - 3, 0, 3, H)
    g.fillRect(x0 + 7, 0, 1.5, V(0.95 - 0.175))
    g.fillRect(x0 + pw - 8.5, 0, 1.5, V(0.95 - 0.175))
    for (let y = V(0.12); y < V(0.95 - 0.2); y += 58) {
      g.strokeStyle = '#E2BE62'
      g.lineWidth = 3
      g.beginPath()
      g.arc(cx, y, pw * 0.3, 0, 7)
      g.stroke()
      g.lineWidth = 2
      cloud(g, cx, y + 3, pw * 0.1, true)
      g.fillStyle = '#E2BE62'
      g.beginPath()
      g.arc(cx, y - pw * 0.12, 2.5, 0, 7)
      g.fill()
    }
  }
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
