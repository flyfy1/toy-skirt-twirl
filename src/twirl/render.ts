// The atelier renderer (twirl.md 3.2): planar floor shadow (README 3.6), the room, the stand and the form,
// the things on the floor, then the skirt's cloth layers with the fabric shader (README 3.5). Plain WebGL 1.
import { program, texture, target, ident, mul, rotZ, type GL, type M4, type Prog, type Target } from '../cloth/gl'
import { Surface } from '../cloth/mesh'
import * as B from './bake'
import * as S from './scene'

export const LIGHT = (() => {
  const v = [-0.5, 0.45, 0.75], l = Math.hypot(v[0], v[1], v[2])
  return v.map((x) => x / l)
})()

const LIT_VS = `
attribute vec3 a_p;attribute vec3 a_n;attribute vec2 a_uv;
uniform mat4 u_vp;uniform mat4 u_m;
varying vec3 v_p;varying vec3 v_n;varying vec2 v_uv;
void main(){vec4 w=u_m*vec4(a_p,1.);v_p=w.xyz;v_n=mat3(u_m)*a_n;v_uv=a_uv;gl_Position=u_vp*w;}`

const LIT_FS = `
precision highp float;
uniform sampler2D u_tex;uniform sampler2D u_shadow;
uniform vec3 u_tint;uniform vec3 u_L;uniform vec3 u_eye;uniform vec2 u_res;
uniform float u_spec;uniform float u_shin;uniform float u_recv;uniform float u_cut;uniform float u_shadowK;
varying vec3 v_p;varying vec3 v_n;varying vec2 v_uv;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec4 tx=texture2D(u_tex,v_uv);
  if(tx.a<u_cut)discard;
  vec3 base=tx.rgb*u_tint;
  vec3 N=normalize(v_n);vec3 V=normalize(u_eye-v_p);
  if(dot(N,V)<0.)N=-N;
  vec3 H=normalize(u_L+V);
  float d=clamp((dot(N,u_L)+.4)/1.4,0.,1.);
  vec3 col=mix(base*base*.55,base,d);
  col+=pow(max(dot(N,H),0.),u_shin)*u_spec*d*vec3(1.,.97,.9);
  col+=pow(1.-max(dot(N,V),0.),4.)*.06*base;
  if(u_recv>0.){
    float s=texture2D(u_shadow,gl_FragCoord.xy/u_res).r;
    col*=1.-u_shadowK*s;
    col+=u_recv*.05*smoothstep(1.5,-1.5,v_p.x-v_p.y*.4);
  }
  col+=(hash(gl_FragCoord.xy)-.5)/255.;
  gl_FragColor=vec4(col,1.);
}`

const CLOTH_VS = `
attribute vec3 a_p;attribute vec3 a_n;attribute vec3 a_tu;attribute vec3 a_tv;attribute float a_k;attribute vec2 a_uv;attribute float a_m;
uniform mat4 u_vp;uniform mat4 u_m;
varying vec3 v_p;varying vec3 v_n;varying vec3 v_tu;varying vec3 v_tv;varying float v_k;varying vec2 v_uv;varying float v_m;
void main(){mat3 r=mat3(u_m);vec4 w=u_m*vec4(a_p,1.);v_p=w.xyz;v_n=r*a_n;v_tu=r*a_tu;v_tv=r*a_tv;v_k=a_k;v_uv=a_uv;v_m=a_m;gl_Position=u_vp*w;}`

const CLOTH_FS = `
precision highp float;
uniform sampler2D u_pat;
uniform vec3 u_L;uniform vec3 u_eye;
uniform vec4 u_sh;   // e_u k_u e_v k_v
uniform vec3 u_fab;  // k_rim t0 k_ao
uniform vec2 u_uvs;  // pattern repeats (u, v)
uniform float u_alpha;uniform float u_debug;uniform float u_flat;
uniform vec3 u_lining;uniform vec3 u_inner;
varying vec3 v_p;varying vec3 v_n;varying vec3 v_tu;varying vec3 v_tv;varying float v_k;varying vec2 v_uv;varying float v_m;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  bool ff=gl_FrontFacing;
  if(u_flat>.5){gl_FragColor=ff?vec4(0.,1.,0.,1.):vec4(1.,0.,1.,1.);return;}
  if(u_debug>.5&&!ff){gl_FragColor=vec4(1.,0.,1.,1.);return;}
  vec4 tx=texture2D(u_pat,v_uv*u_uvs);
  vec3 base=mix(tx.rgb,u_inner,clamp(v_m,0.,1.));float sm=tx.a*2.5;
  vec3 N=normalize(v_n);if(!ff){N=-N;base=base*u_lining;}
  vec3 V=normalize(u_eye-v_p);vec3 H=normalize(u_L+V);
  float d=clamp((dot(N,u_L)+.4)/1.4,0.,1.);
  vec3 col=mix(base*base*.55,base,d);
  vec3 tint=mix(vec3(1.,.97,.95),base*1.5,.35);
  float tu=dot(normalize(v_tu),H),tv=dot(normalize(v_tv),H);
  float su=pow(sqrt(max(0.,1.-tu*tu)),u_sh.x),sv=pow(sqrt(max(0.,1.-tv*tv)),u_sh.z);
  col+=(u_sh.y*su+u_sh.w*sv)*sm*tint*d*(ff?1.:.25);
  col+=pow(1.-clamp(dot(N,V),0.,1.),4.)*u_fab.x*mix(vec3(1.),base,.5)*.8;
  col+=u_fab.y*clamp(-dot(N,u_L),0.,1.)*base*1.1;
  col*=1.-u_fab.z*max(v_k,0.);
  col+=.06*max(-v_k,0.);
  if(!ff)col=mix(col,base,u_fab.y);
  col+=(hash(gl_FragCoord.xy)-.5)/255.;
  gl_FragColor=vec4(col,u_debug>.5?1.:u_alpha);
}`

const SHADOW_VS = `
attribute vec3 a_p;uniform mat4 u_vp;uniform mat4 u_m;uniform vec3 u_L;
void main(){vec4 w=u_m*vec4(a_p,1.);vec3 q=w.xyz-u_L*(w.z/u_L.z);q.z=.001;gl_Position=u_vp*vec4(q,1.);}`
const SHADOW_FS = `precision mediump float;uniform float u_k;void main(){gl_FragColor=vec4(u_k,0.,0.,1.);}`

const QUAD_VS = `attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}`
const BLUR_FS = `precision mediump float;uniform sampler2D u_t;uniform vec2 u_d;varying vec2 v;
void main(){float s=texture2D(u_t,v).r*.294;s+=(texture2D(u_t,v+u_d*1.33).r+texture2D(u_t,v-u_d*1.33).r)*.353;gl_FragColor=vec4(s,0.,0.,1.);}`

interface Buf {
  vb: WebGLBuffer
  ib: WebGLBuffer
  n: number
}

/** One cloth layer's look (README 3.5 parameters plus the pattern texture). */
export interface ClothLook {
  tex: string
  sh: [number, number, number, number]
  fab: [number, number, number]
  alpha: number
  uvs: [number, number]
  lining: [number, number, number]
  inner?: [number, number, number]
  /** shadow strength on the floor */
  shadow: number
}

export interface Band {
  tint: [number, number, number]
  z: [number, number]
  r: number
}
export const BANDS: Record<string, Band> = {
  chiffon: { tint: [0.93, 0.62, 0.68], z: [1.0, 1.04], r: 0.113 },
  denim: { tint: [0.26, 0.37, 0.56], z: [0.99, 1.045], r: 0.114 },
  mamian: { tint: [0.96, 0.95, 0.92], z: [0.965, 1.035], r: 0.124 },
  tulle: { tint: [0.74, 0.66, 0.9], z: [1.0, 1.04], r: 0.113 },
}

interface LayerGL {
  vb: WebGLBuffer
  ib: WebGLBuffer
  n: number
  data: Float32Array
}

const STRIDE = 16

export class Renderer {
  gl: GL
  private lit!: Prog
  private cloth!: Prog
  private shadow!: Prog
  private blur!: Prog
  private quad!: WebGLBuffer
  private st: Record<string, Buf> = {}
  private tex: Record<string, WebGLTexture> = {}
  private layers = new Map<Surface, LayerGL>()
  private dynVB!: WebGLBuffer
  private dynIB!: WebGLBuffer
  private itVB!: WebGLBuffer
  private itIB!: WebGLBuffer
  private sh: [Target, Target] | null = null
  seed: number
  shadowDiv = 4

  constructor(gl: GL, seed: number) {
    this.gl = gl
    this.seed = seed
    this.init()
  }

  /** Programs, buffers and textures (again after a lost context). */
  init() {
    const gl = this.gl
    this.lit = program(gl, LIT_VS, LIT_FS)
    this.cloth = program(gl, CLOTH_VS, CLOTH_FS)
    this.shadow = program(gl, SHADOW_VS, SHADOW_FS)
    this.blur = program(gl, QUAD_VS, BLUR_FS)
    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const up = (name: string, m: S.Mesh) => {
      const data = new Float32Array((m.p.length / 3) * 8)
      for (let k = 0; k < m.p.length / 3; k++) {
        data.set(m.p.slice(3 * k, 3 * k + 3), 8 * k)
        data.set(m.n.slice(3 * k, 3 * k + 3), 8 * k + 3)
        data.set(m.uv.slice(2 * k, 2 * k + 2), 8 * k + 6)
      }
      const vb = gl.createBuffer()!, ib = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, vb)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.i), gl.STATIC_DRAW)
      this.st[name] = { vb, ib, n: m.i.length }
    }
    up('floor', S.floorMesh())
    up('wall', S.wallMesh())
    up('table', S.tableMesh())
    up('cushion', S.cushionMesh())
    up('leaf', S.leafMesh())
    up('stand', S.standMesh())
    up('brass', S.brassMesh())
    up('form', S.formMesh())
    up('cap', S.capMesh())
    up('key', S.keyMesh())
    for (const id of Object.keys(BANDS)) {
      const f = BANDS[id]
      const m = S.mesh()
      S.lathe(m, [[f.z[0], f.r, f.r], [f.z[0] + 0.004, f.r + 0.002, f.r + 0.002], [f.z[1] - 0.004, f.r + 0.002, f.r + 0.002], [f.z[1], f.r - 0.004, f.r - 0.004]], 48, () => 0.5)
      up('band_' + id, m)
    }
    const white = { w: 1, h: 1, data: new Uint8Array([255, 255, 255, 255]) }
    this.tex.white = texture(gl, white, false, false)
    this.tex.floor = texture(gl, B.floorTex(this.seed), true)
    this.tex.wall = texture(gl, B.wallTex(this.seed))
    this.tex.table = texture(gl, B.tableTex())
    this.tex.linen = texture(gl, B.linenTex(this.seed), true)
    this.tex.tag = texture(gl, B.tagTex(false))
    this.tex.tagDizzy = texture(gl, B.tagTex(true))
    this.tex.tape = texture(gl, B.tapeTex(), true)
    this.tex.items = texture(gl, B.itemsTex())
    this.tex.chiffon = texture(gl, B.chiffonTex(this.seed), true)
    this.tex.slip = texture(gl, B.slipTex(), true)
    this.tex.denim = texture(gl, B.denimTex(this.seed), true)
    this.tex.mamian = texture(gl, B.mamianTex(), true)
    this.tex.tulle = texture(gl, B.tulleTex(this.seed), true)
    this.dynVB = gl.createBuffer()!
    this.dynIB = gl.createBuffer()!
    this.itVB = gl.createBuffer()!
    this.itIB = gl.createBuffer()!
    this.sh = null
    this.layers.clear()
  }

  private layer(s: Surface): LayerGL {
    let L = this.layers.get(s)
    if (L) return L
    const gl = this.gl
    const vb = gl.createBuffer()!, ib = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, s.idx, gl.STATIC_DRAW)
    const data = new Float32Array(s.nv * STRIDE)
    gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW)
    L = { vb, ib, n: s.idx.length, data }
    this.layers.set(s, L)
    return L
  }

  /** Drop the GL buffers of surfaces no longer in use (after a skirt swap). */
  forget(keep: Surface[]) {
    for (const [s, L] of this.layers)
      if (!keep.includes(s)) {
        this.gl.deleteBuffer(L.vb)
        this.gl.deleteBuffer(L.ib)
        this.layers.delete(s)
      }
  }

  uploadSurface(s: Surface) {
    const L = this.layer(s)
    const d = L.data
    for (let k = 0; k < s.nv; k++) {
      const o = k * STRIDE
      d[o] = s.pos[3 * k]; d[o + 1] = s.pos[3 * k + 1]; d[o + 2] = s.pos[3 * k + 2]
      d[o + 3] = s.nrm[3 * k]; d[o + 4] = s.nrm[3 * k + 1]; d[o + 5] = s.nrm[3 * k + 2]
      d[o + 6] = s.tu[3 * k]; d[o + 7] = s.tu[3 * k + 1]; d[o + 8] = s.tu[3 * k + 2]
      d[o + 9] = s.tv[3 * k]; d[o + 10] = s.tv[3 * k + 1]; d[o + 11] = s.tv[3 * k + 2]
      d[o + 12] = s.crease[k]
      d[o + 13] = s.uv[2 * k]; d[o + 14] = s.uv[2 * k + 1]
      d[o + 15] = s.mix[k]
    }
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, L.vb)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d)
  }

  private bindLit(b: { vb: WebGLBuffer; ib: WebGLBuffer }, prog: Prog) {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vb)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib)
    const a = prog.a
    gl.enableVertexAttribArray(a.a_p)
    gl.vertexAttribPointer(a.a_p, 3, gl.FLOAT, false, 32, 0)
    if (a.a_n !== undefined) {
      gl.enableVertexAttribArray(a.a_n)
      gl.vertexAttribPointer(a.a_n, 3, gl.FLOAT, false, 32, 12)
    }
    if (a.a_uv !== undefined) {
      gl.enableVertexAttribArray(a.a_uv)
      gl.vertexAttribPointer(a.a_uv, 2, gl.FLOAT, false, 32, 24)
    }
  }

  private disableAttribs() {
    const gl = this.gl
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i)
  }

  draw(f: Frame) {
    const gl = this.gl
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight
    const I = ident()
    const T = f.tilt
    const formM = mul(T, rotZ(f.psi))
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynVB)
    gl.bufferData(gl.ARRAY_BUFFER, f.dyn.v, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.dynIB)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, f.dyn.i, gl.DYNAMIC_DRAW)
    const dyn = { vb: this.dynVB, ib: this.dynIB }
    if (f.items.n) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.itVB)
      gl.bufferData(gl.ARRAY_BUFFER, f.items.v, gl.DYNAMIC_DRAW)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.itIB)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, f.items.i, gl.DYNAMIC_DRAW)
    }
    for (const l of f.cloth) this.layer(l.surf)

    // 1. shadow mask (quarter resolution), blurred
    const sw = Math.max(1, Math.ceil(W / this.shadowDiv)), shh = Math.max(1, Math.ceil(H / this.shadowDiv))
    if (!this.sh || this.sh[0].w !== sw || this.sh[0].h !== shh) this.sh = [target(gl, sw, shh), target(gl, sw, shh)]
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sh[0].fb)
    gl.viewport(0, 0, sw, shh)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    const ext = gl.getExtension('EXT_blend_minmax')
    gl.blendEquation(ext ? ext.MAX_EXT : gl.FUNC_ADD)
    const sp = this.shadow
    gl.useProgram(sp.p)
    gl.uniformMatrix4fv(sp.u.u_vp, false, f.vp)
    gl.uniform3fv(sp.u.u_L, LIGHT)
    const cast = (b: Buf, m: M4, k: number, stride = 32) => {
      gl.uniformMatrix4fv(sp.u.u_m, false, m)
      gl.uniform1f(sp.u.u_k, k)
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vb)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib)
      gl.enableVertexAttribArray(sp.a.a_p)
      gl.vertexAttribPointer(sp.a.a_p, 3, gl.FLOAT, false, stride, 0)
      gl.drawElements(gl.TRIANGLES, b.n, gl.UNSIGNED_SHORT, 0)
    }
    cast(this.st.stand, T, 0.9)
    cast(this.st.brass, T, 0.9)
    cast(this.st.form, formM, 0.9)
    cast(this.st.cap, formM, 0.9)
    for (const l of f.cloth) cast(this.layers.get(l.surf)!, T, l.look.shadow, STRIDE * 4)
    this.disableAttribs()
    gl.blendEquation(gl.FUNC_ADD)
    gl.disable(gl.BLEND)
    const bp = this.blur
    gl.useProgram(bp.p)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(bp.a.a)
    gl.vertexAttribPointer(bp.a.a, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(bp.u.u_t, 0)
    const passes = this.shadowDiv > 4 ? 1 : 2
    for (let k = 0; k < passes; k++) {
      const rad = (k === 0 ? 2.2 : 1.2) * (4 / this.shadowDiv)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sh[1].fb)
      gl.bindTexture(gl.TEXTURE_2D, this.sh[0].tex)
      gl.uniform2f(bp.u.u_d, rad / sw, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sh[0].fb)
      gl.bindTexture(gl.TEXTURE_2D, this.sh[1].tex)
      gl.uniform2f(bp.u.u_d, 0, rad / shh)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    this.disableAttribs()

    // 2. the room, the stand and the form
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, W, H)
    gl.clearColor(0.93, 0.9, 0.85, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.frontFace(gl.CW)
    const lp = this.lit
    gl.useProgram(lp.p)
    gl.uniformMatrix4fv(lp.u.u_vp, false, f.vp)
    gl.uniform3fv(lp.u.u_L, LIGHT)
    gl.uniform3fv(lp.u.u_eye, f.eye)
    gl.uniform2f(lp.u.u_res, W, H)
    gl.uniform1i(lp.u.u_tex, 0)
    gl.uniform1i(lp.u.u_shadow, 1)
    gl.uniform1f(lp.u.u_shadowK, 0.42)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.sh[0].tex)
    gl.activeTexture(gl.TEXTURE0)
    const obj = (b: { vb: WebGLBuffer; ib: WebGLBuffer; n: number }, tex: string, tint: number[], m: M4, spec = 0, shin = 8, recv = 0, cut = 0, offset = 0) => {
      gl.bindTexture(gl.TEXTURE_2D, this.tex[tex])
      gl.uniformMatrix4fv(lp.u.u_m, false, m)
      gl.uniform3fv(lp.u.u_tint, tint)
      gl.uniform1f(lp.u.u_spec, spec)
      gl.uniform1f(lp.u.u_shin, shin)
      gl.uniform1f(lp.u.u_recv, recv)
      gl.uniform1f(lp.u.u_cut, cut)
      this.bindLit(b, lp)
      gl.drawElements(gl.TRIANGLES, b.n, gl.UNSIGNED_SHORT, offset * 2)
    }
    obj(this.st.wall, 'wall', [1, 1, 1], I, 0, 4, 0)
    obj(this.st.floor, 'floor', [1, 1, 1], I, 0.1, 6, 1)
    obj(this.st.table, 'table', [1, 1, 1], I, 0.05, 8)
    obj(this.st.cushion, 'white', [0.82, 0.16, 0.14], I, 0.25, 20)
    obj(this.st.leaf, 'white', [0.25, 0.48, 0.2], I, 0.1, 10)
    obj(this.st.stand, 'white', [0.09, 0.09, 0.1], T, 0.55, 40)
    obj(this.st.brass, 'white', [0.78, 0.6, 0.28], T, 0.9, 30)
    obj(this.st.form, 'linen', [1, 1, 1], formM, 0.04, 6)
    obj(this.st.cap, 'white', [0.54, 0.35, 0.21], formM, 0.45, 24)
    obj(this.st.key, 'white', [0.8, 0.62, 0.3], formM, 0.9, 30)
    const d = f.dyn
    if (d.tapeN) obj({ ...dyn, n: d.tapeN }, 'tape', [1, 1, 1], T, 0.15, 12)
    obj({ ...dyn, n: d.tagN }, f.dizzy ? 'tagDizzy' : 'tag', [1, 1, 1], T, 0.05, 8, 0, 0.5, d.tapeN)
    obj({ ...dyn, n: d.strN }, 'white', [0.85, 0.8, 0.7], T, 0, 8, 0, 0, d.tapeN + d.tagN)
    if (f.band) obj(this.st['band_' + f.band], 'white', BANDS[f.band].tint, mul(formM, f.bandM ?? I), 0.2, 16)
    if (f.items.n) obj({ vb: this.itVB, ib: this.itIB, n: f.items.n }, 'items', [1, 1, 1], I, 0.5, 30, 0, 0.5)
    this.disableAttribs()

    // 3. the skirt's layers, inner first: back faces (the inside), then the outer face over them
    const cp = this.cloth
    gl.useProgram(cp.p)
    gl.uniformMatrix4fv(cp.u.u_vp, false, f.vp)
    gl.uniform3fv(cp.u.u_L, LIGHT)
    gl.uniform3fv(cp.u.u_eye, f.eye)
    gl.uniform1f(cp.u.u_debug, f.debug === 'under' ? 1 : 0)
    gl.uniform1f(cp.u.u_flat, f.debug === 'flat' || f.debug === 'ctl' ? 1 : 0)
    gl.uniform1i(cp.u.u_pat, 0)
    for (const l of f.cloth) {
      const L = this.layers.get(l.surf)!
      const k = l.look
      gl.uniformMatrix4fv(cp.u.u_m, false, l.m ? mul(T, l.m) : T)
      gl.uniform4fv(cp.u.u_sh, k.sh)
      gl.uniform3fv(cp.u.u_fab, k.fab)
      gl.uniform2fv(cp.u.u_uvs, k.uvs)
      gl.uniform3fv(cp.u.u_lining, k.lining)
      gl.uniform3fv(cp.u.u_inner, k.inner ?? [0, 0, 0])
      gl.uniform1f(cp.u.u_alpha, k.alpha)
      gl.bindTexture(gl.TEXTURE_2D, this.tex[k.tex])
      gl.bindBuffer(gl.ARRAY_BUFFER, L.vb)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, L.ib)
      const at = (name: string, size: number, off: number) => {
        const loc = cp.a[name]
        if (loc === undefined) return
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, off * 4)
      }
      at('a_p', 3, 0)
      at('a_n', 3, 3)
      at('a_tu', 3, 6)
      at('a_tv', 3, 9)
      at('a_k', 1, 12)
      at('a_uv', 2, 13)
      at('a_m', 1, 15)
      const fade = l.fade ?? 1
      gl.enable(gl.CULL_FACE)
      // a skirt being lifted off fades out and its inside is not drawn (no looking into it through the waist)
      if (fade >= 1 || f.debug === 'ctl') {
        gl.cullFace(gl.FRONT)
        gl.drawElements(gl.TRIANGLES, L.n, gl.UNSIGNED_SHORT, 0)
      }
      if (f.debug !== 'ctl') {
        gl.cullFace(gl.BACK)
        const blend = (k.alpha < 1 || fade < 1) && !f.debug
        gl.uniform1f(cp.u.u_alpha, k.alpha * fade)
        if (blend) {
          gl.enable(gl.BLEND)
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        }
        gl.drawElements(gl.TRIANGLES, L.n, gl.UNSIGNED_SHORT, 0)
        gl.disable(gl.BLEND)
      }
      gl.disable(gl.CULL_FACE)
      this.disableAttribs()
    }
  }
}

export interface Frame {
  vp: M4
  eye: number[]
  psi: number
  /** the whole stand's sway (dizzy), applied to everything that stands on it */
  tilt: M4
  dizzy: boolean
  band: string
  /** the waistband's own offset (lifted during a swap) */
  bandM?: M4
  /** fade: 0..1 while a skirt is lifted off (drawn see-through, outside only) */
  cloth: { surf: Surface; look: ClothLook; m?: M4; fade?: number }[]
  debug: string
  dyn: { v: Float32Array; i: Uint16Array; tapeN: number; tagN: number; strN: number }
  items: { v: Float32Array; i: Uint16Array; n: number }
}
