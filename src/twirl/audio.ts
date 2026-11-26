// Give It a Twirl's sounds (twirl.md section 4), all synthesised with Web Audio; no files.
type Fabric = 'chiffon' | 'denim' | 'mamian' | 'tulle'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let whoosh: { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode; am: GainNode; lfo: OscillatorNode; hiss: GainNode; silk: GainNode } | null = null

/** Create the context early (idle) so the first touch does not pay for it; resume on a gesture. */
export function prepare() {
  if (ctx) return
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(ctx.destination)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
}
export function unlock() {
  prepare()
  if (ctx && ctx.state !== 'running') void ctx.resume()
}
const ok = () => ctx && master && ctx.state === 'running'

function tone(freq: number, dur: number, gain: number, opts: { type?: OscillatorType; end?: number; delay?: number; attack?: number; vib?: number } = {}) {
  if (!ok()) return
  const c = ctx!
  const t = c.currentTime + (opts.delay ?? 0)
  const o = c.createOscillator()
  o.type = opts.type ?? 'sine'
  o.frequency.setValueAtTime(freq, t)
  if (opts.end) o.frequency.exponentialRampToValueAtTime(opts.end, t + dur)
  if (opts.vib) {
    const l = c.createOscillator(), lg = c.createGain()
    l.frequency.value = opts.vib
    lg.gain.value = freq * 0.03
    l.connect(lg).connect(o.frequency)
    l.start(t)
    l.stop(t + dur)
  }
  const g = c.createGain()
  const a = opts.attack ?? 0.004
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master!)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, gain: number, type: BiquadFilterType, freq: number, opts: { q?: number; end?: number; delay?: number; attack?: number } = {}) {
  if (!ok() || !noiseBuf) return
  const c = ctx!
  const t = c.currentTime + (opts.delay ?? 0)
  const s = c.createBufferSource()
  s.buffer = noiseBuf
  s.playbackRate.value = 0.8 + Math.random() * 0.4
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t)
  if (opts.end) f.frequency.exponentialRampToValueAtTime(opts.end, t + dur)
  f.Q.value = opts.q ?? 1
  const g = c.createGain()
  const a = opts.attack ?? 0.003
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(master!)
  s.start(t, Math.random())
  s.stop(t + dur + 0.02)
}

/** The stand's bearing, every eighth of a turn. */
export function tick() {
  tone(1100, 0.014, 0.04)
  noise(0.003, 0.03, 'highpass', 3000)
}

const PENTA = [0, 2, 4, 7, 9]
/** Once per full turn: a plucked note climbing a pentatonic scale over two octaves, then staying on top. */
export function turnNote(step: number) {
  const k = Math.min(step, 10)
  const semi = PENTA[k % 5] + 12 * Math.floor(k / 5)
  const f = 523.25 * Math.pow(2, semi / 12)
  tone(f, 0.4, 0.05)
  tone(f * 2, 0.3, 0.015)
}

/** Continuous rush of the folds, set every frame from the stand's speed. */
export function setWhoosh(omega: number, fabric: Fabric) {
  if (!ok() || !noiseBuf) return
  const c = ctx!
  if (!whoosh) {
    const src = c.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.2
    const am = c.createGain()
    const lfo = c.createOscillator()
    const lg = c.createGain()
    lg.gain.value = 0.4
    lfo.connect(lg).connect(am.gain)
    am.gain.value = 0.6
    const g = c.createGain()
    g.gain.value = 0
    src.connect(bp).connect(am).connect(g).connect(master!)
    // tulle's hiss and the 马面裙's silk rustle
    const hp = c.createBiquadFilter()
    hp.type = 'bandpass'
    hp.frequency.value = 6000
    const hiss = c.createGain()
    hiss.gain.value = 0
    src.connect(hp).connect(hiss).connect(master!)
    const sp = c.createBiquadFilter()
    sp.type = 'bandpass'
    sp.frequency.value = 4500
    sp.Q.value = 2
    const silk = c.createGain()
    silk.gain.value = 0
    src.connect(sp).connect(silk).connect(master!)
    src.start()
    lfo.start()
    whoosh = { src, bp, g, am, lfo, hiss, silk }
  }
  const w = Math.abs(omega), t = c.currentTime
  const centre = (500 + 90 * w) * (fabric === 'denim' ? 0.6 : fabric === 'tulle' ? 1.8 : 1)
  const gain = Math.min(0.14, 0.012 * w) * (fabric === 'denim' ? 1.3 : 1)
  whoosh.bp.frequency.setTargetAtTime(centre, t, 0.02)
  whoosh.g.gain.setTargetAtTime(w < 0.2 ? 0 : gain, t, 0.02)
  whoosh.lfo.frequency.setTargetAtTime(Math.max(0.1, (12 * w) / (2 * Math.PI)), t, 0.02)
  whoosh.hiss.gain.setTargetAtTime(fabric === 'tulle' ? Math.min(0.02, 0.003 * w) : 0, t, 0.02)
  whoosh.silk.gain.setTargetAtTime(fabric === 'mamian' ? 0.004 * w : 0, t, 0.02)
}

export function bloom() {
  noise(0.2, 0.06, 'lowpass', 700, { attack: 0.08 })
  tone(392, 0.25, 0.04, { end: 523, attack: 0.05 })
}

export function slap(fabric: Fabric) {
  noise(0.04, 0.15, 'bandpass', 900)
  noise(0.04, 0.07, 'bandpass', 900, { delay: 0.14 })
  noise(0.04, 0.035, 'bandpass', 900, { delay: 0.3 })
  if (fabric === 'denim') tone(120, 0.12, 0.08)
}

export function settle() {
  for (let k = 0; k < 3; k++) noise(0.03, 0.03 * Math.pow(0.6, k), 'bandpass', 3000, { delay: k * 0.2 })
}

export function swapLift() {
  noise(0.15, 0.05, 'bandpass', 1000, { end: 3000 })
}
export function swapLand() {
  noise(0.3, 0.05, 'lowpass', 900, { attack: 0.03 })
}

export function coin(delay = 0) {
  tone(4200, 0.18, 0.07, { delay })
  tone(6100, 0.18, 0.04, { delay })
}
/** A coin spinning down flat: the same ping at a rising rate, fading. */
export function coinRattle() {
  let t = 0
  for (let k = 0; k < 18 && t < 0.7; k++) {
    const rate = 8 + (32 * t) / 0.7
    tone(4200, 0.05, 0.05 * (1 - t / 0.7), { delay: t })
    t += 1 / rate
  }
}
export function keys() {
  for (const f of [2500, 3600, 5000]) tone(f + Math.random() * 300, 0.15, 0.04)
}

export function dizzy() {
  tone(600, 0.7, 0.04, { end: 300, vib: 6 })
  for (let k = 0; k < 4; k++) tone(1800, 0.03, 0.025, { delay: 0.3 + k * 0.55 })
}

/** Android haptics (no-op elsewhere). */
export function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not allowed */
  }
}
