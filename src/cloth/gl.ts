// Small WebGL 1 plumbing and 4x4 matrix helpers (column-major), hand-written, no dependencies.
// Part of this repo's cloth kit (README section 2 and 3); not a shared file.

export type GL = WebGLRenderingContext

export function program(gl: GL, vs: string, fs: string) {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || 'shader')
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p) || 'link')
  const u: Record<string, WebGLUniformLocation | null> = {}
  const a: Record<string, number> = {}
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < nu; i++) {
    const info = gl.getActiveUniform(p, i)!
    const name = info.name.replace(/\[0\]$/, '')
    u[name] = gl.getUniformLocation(p, info.name)
  }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES) as number
  for (let i = 0; i < na; i++) {
    const info = gl.getActiveAttrib(p, i)!
    a[info.name] = gl.getAttribLocation(p, info.name)
  }
  return { p, u, a }
}
export type Prog = ReturnType<typeof program>

/** Upload an RGBA pixel array (not premultiplied) or a canvas as a texture. */
export function texture(gl: GL, src: TexImageSource | { w: number; h: number; data: Uint8Array }, repeat = false, mips = true) {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  if ('w' in src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.w, src.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data)
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  const w = 'w' in src ? src.w : (src as { width: number }).width, h = 'w' in src ? src.h : (src as { height: number }).height
  const pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0
  if (mips && pot) {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  return t
}

export function target(gl: GL, w: number, h: number) {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fb, w, h }
}
export type Target = ReturnType<typeof target>

// ---- matrices (column-major) ----
export type M4 = Float32Array
export const ident = (): M4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

export function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      o[c * 4 + r] = s
    }
  return o
}

/** Perspective with a vertical lens shift `sy` (NDC units): moves the picture without tilting the camera. */
export function perspective(fovY: number, aspect: number, near: number, far: number, sy = 0): M4 {
  const f = 1 / Math.tan(fovY / 2)
  const o = new Float32Array(16)
  o[0] = -f / aspect // mirrored: world -x is screen left (the spec's light is upper left); winding is CW
  o[5] = f
  o[9] = -sy
  o[10] = (far + near) / (near - far)
  o[11] = -1
  o[14] = (2 * far * near) / (near - far)
  return o
}

export function lookAt(e: number[], t: number[], up: number[]): M4 {
  let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2]
  let l = Math.hypot(zx, zy, zz)
  zx /= l; zy /= l; zz /= l
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx
  l = Math.hypot(xx, xy, xz)
  xx /= l; xy /= l; xz /= l
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
  ])
}

/** Rotation about z by `a`, plus a translation. */
export function rotZ(a: number, tx = 0, ty = 0, tz = 0): M4 {
  const c = Math.cos(a), s = Math.sin(a)
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1])
}

/** Project a world point with a view-projection matrix to [x, y] in 0..1 screen units (y down) and clip w. */
export function project(vp: M4, x: number, y: number, z: number) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12]
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13]
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15]
  return [(cx / cw) * 0.5 + 0.5, 0.5 - (cy / cw) * 0.5, cw]
}
