export type Triple = [number, number, number];

export type OrbDesign = {
  seed: number;
  flowScale: number;
  warpAmp: number;
  swirl: number;
  anchorSpread: number;
  orbitSpeed: number;
  sheen: number;
  petals: number;
  lobe: number;
  grain: number;
  dim: number;
};

export const DEFAULT_DESIGN: OrbDesign = {
  seed: 0,
  flowScale: 1,
  warpAmp: 1,
  swirl: 0,
  anchorSpread: 1,
  orbitSpeed: 1,
  sheen: 1,
  petals: 0,
  lobe: 0,
  grain: 0,
  dim: 0,
};

export const GL_OPTS: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: "high-performance",
};

export type GLState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  u: {
    res: WebGLUniformLocation | null;
    origin: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    level: WebGLUniformLocation | null;
    glow: WebGLUniformLocation | null;
    energy: WebGLUniformLocation | null;
    playing: WebGLUniformLocation | null;
    c0: WebGLUniformLocation | null;
    c1: WebGLUniformLocation | null;
    c2: WebGLUniformLocation | null;
    c3: WebGLUniformLocation | null;

    seed: WebGLUniformLocation | null;
    flowScale: WebGLUniformLocation | null;
    warpAmp: WebGLUniformLocation | null;
    swirl: WebGLUniformLocation | null;
    anchorSpread: WebGLUniformLocation | null;
    orbitSpeed: WebGLUniformLocation | null;
    sheen: WebGLUniformLocation | null;
    petals: WebGLUniformLocation | null;
    lobe: WebGLUniformLocation | null;
    grain: WebGLUniformLocation | null;
    dim: WebGLUniformLocation | null;
    bloom: WebGLUniformLocation | null;
  };
};

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform vec2  u_origin;
uniform float u_time;
uniform float u_level;
uniform float u_glow;
uniform float u_energy;
uniform float u_playing;
uniform vec3  u_c0;
uniform vec3  u_c1;
uniform vec3  u_c2;
uniform vec3  u_c3;

uniform float u_seed;
uniform float u_flowScale;
uniform float u_warpAmp;
uniform float u_swirl;
uniform float u_anchorSpread;
uniform float u_orbitSpeed;
uniform float u_sheen;
uniform float u_petals;
uniform float u_lobe;
uniform float u_grain;
uniform float u_dim;
uniform float u_bloom;

#define DISC_R 0.97

vec3 permute(vec3 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 q = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                         + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(q * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 srgb2lin(vec3 c){
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 lin2srgb(vec3 c){
  return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 srgb2oklab(vec3 c){
  vec3 lc = srgb2lin(c);
  float l = 0.4122214708 * lc.r + 0.5363325363 * lc.g + 0.0514459929 * lc.b;
  float m = 0.2119034982 * lc.r + 0.6806995451 * lc.g + 0.1073969566 * lc.b;
  float s = 0.0883024619 * lc.r + 0.2817188376 * lc.g + 0.6299787005 * lc.b;
  l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklab2srgb(vec3 lab){
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  vec3 lms = vec3(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  vec3 lin = vec3(
     4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
  return lin2srgb(lin);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - u_origin) / u_res;
  vec2 p = (uv - 0.5) * 2.0;
  float d = length(p);

  float theta = atan(p.y, p.x);
  float rEdge = DISC_R * (1.0 - 0.5 * u_lobe + 0.5 * u_lobe * sin(u_petals * theta + u_seed));
  float dn = d / rEdge;

  float aa = fwidth(dn);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0, dn);
  if (disc <= 0.0) { outColor = vec4(0.0); return; }

  float t = u_time;
  float sp = 0.7 + 0.8 * u_energy + 0.08 * u_playing;

  float wAmp = (0.30 + 0.16 * u_energy + 0.05 * u_level) * u_warpAmp;
  vec2 fl1 = vec2(
    snoise(p * 0.70 * u_flowScale + vec2(0.0 + u_seed,  t * 0.40 * sp)),
    snoise(p * 0.70 * u_flowScale + vec2(4.0 + u_seed, -t * 0.34 * sp)));
  vec2 fl2 = vec2(
    snoise(p * 1.15 * u_flowScale + 1.1 * fl1 + vec2(9.0 + u_seed,  t * 0.30 * sp)),
    snoise(p * 1.15 * u_flowScale + 1.1 * fl1 + vec2(2.0 + u_seed, -t * 0.26 * sp)));
  vec2 q = p + wAmp * (fl1 + 0.5 * fl2);

  float sa = u_swirl * t;
  q = mat2(cos(sa), -sin(sa), sin(sa), cos(sa)) * q;

  float os = u_orbitSpeed;
  vec2 cen[5];
  cen[0] = vec2(0.30, 0.24) * u_anchorSpread * vec2(cos(t * 0.27 * sp * os + 0.0 + u_seed), sin(t * 0.31 * sp * os + 0.0 + u_seed));
  cen[1] = vec2(0.66, 0.60) * u_anchorSpread * vec2(cos(t * 0.22 * sp * os + 1.7 + u_seed), sin(t * 0.25 * sp * os + 1.7 + u_seed));
  cen[2] = vec2(0.58, 0.66) * u_anchorSpread * vec2(cos(-t * 0.20 * sp * os + 3.1 + u_seed), sin(t * 0.23 * sp * os + 3.1 + u_seed));
  cen[3] = vec2(0.70, 0.64) * u_anchorSpread * vec2(cos(t * 0.18 * sp * os + 4.6 + u_seed), sin(-t * 0.24 * sp * os + 4.6 + u_seed));
  cen[4] = vec2(0.44, 0.50) * u_anchorSpread * vec2(cos(-t * 0.26 * sp * os + 2.2 + u_seed), sin(t * 0.20 * sp * os + 2.2 + u_seed));

  vec3 cols[5];
  cols[0] = u_c0; cols[1] = u_c1; cols[2] = u_c2; cols[3] = u_c3; cols[4] = u_c0;

  float rad[5];
  rad[0] = 0.95; rad[1] = 0.68; rad[2] = 0.60; rad[3] = 0.55; rad[4] = 0.70;
  const float SHARP = 1.35;

  vec3 acc = vec3(0.0); float wsum = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 dd = q - cen[i];
    float w = exp(-dot(dd, dd) / (rad[i] * rad[i]) * SHARP);
    acc += w * srgb2oklab(cols[i]); wsum += w;
  }
  vec3 col = clamp(oklab2srgb(acc / max(wsum, 1e-4)), 0.0, 1.0);

  vec2 sc = 0.40 * vec2(cos(t * 0.32 * sp + 1.0), sin(t * 0.27 * sp + 1.0));
  float sd = length(q - sc);
  float sheen = exp(-sd * sd / (0.13 * u_sheen)) * (((0.07 + 0.10 * u_playing) + 0.12 * u_glow) * u_sheen);
  col += mix(vec3(1.0), u_c1, 0.40) * sheen;

  float breath = 0.97 + 0.03 * sin(t * 0.6);
  col *= (0.96 + 0.06 * u_playing) * breath + 0.06 * u_glow;

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = clamp(mix(vec3(luma), col, 1.12 + 0.03 * u_playing), 0.0, 1.0);

  float dofLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(dofLuma), col, mix(0.45, 1.0, u_bloom));
  col *= mix(0.72, 1.0, u_bloom);

  col *= 1.0 - 0.10 * smoothstep(0.5, 1.0, dn);

  vec2 lc = 0.10 * fl1;
  float cdn = length(p - lc) / DISC_R;
  float core = exp(-cdn * cdn / 0.42);
  vec3 lantern = mix(vec3(1.0, 0.97, 0.93), u_c1, 0.55);

  float coreAmt = 0.06 * u_bloom + 0.10 * u_playing + mix(0.22, 0.30, u_energy) * u_glow * u_playing;
  col *= 1.0 - 0.12 * core * u_bloom;
  col += lantern * core * coreAmt;

  float dl = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(dl), col, 1.0 - 0.7 * u_dim) * (1.0 - 0.45 * u_dim);

  float seat = smoothstep(1.0 - 3.0 * aa, 1.0, dn);
  col *= 1.0 - seat;

  vec3 base = vec3(0.059, 0.051, 0.051);
  vec3 outc = base + col;

  outc += (hash12(gl_FragCoord.xy + fract(t)) - 0.5) * (1.5 / 255.0);
  outc += (hash12(gl_FragCoord.xy * 2.7 + fract(t * 1.3)) - 0.5) * u_grain * 0.06;

  outColor = vec4(clamp(outc, 0.0, 1.0), disc);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    if (typeof console !== "undefined")
      console.warn(
        "orb-paint: shader compile failed:",
        gl.getShaderInfoLog(sh),
      );
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function buildGL(gl: WebGL2RenderingContext): GLState | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (typeof console !== "undefined")
      console.warn(
        "orb-paint: program link failed:",
        gl.getProgramInfoLog(program),
      );
    gl.deleteProgram(program);
    return null;
  }
  const vao = gl.createVertexArray();
  if (!vao) {
    gl.deleteProgram(program);
    return null;
  }

  const u = (n: string) => gl.getUniformLocation(program, n);
  return {
    gl,
    program,
    vao,
    u: {
      res: u("u_res"),
      origin: u("u_origin"),
      time: u("u_time"),
      level: u("u_level"),
      glow: u("u_glow"),
      energy: u("u_energy"),
      playing: u("u_playing"),
      c0: u("u_c0"),
      c1: u("u_c1"),
      c2: u("u_c2"),
      c3: u("u_c3"),
      seed: u("u_seed"),
      flowScale: u("u_flowScale"),
      warpAmp: u("u_warpAmp"),
      swirl: u("u_swirl"),
      anchorSpread: u("u_anchorSpread"),
      orbitSpeed: u("u_orbitSpeed"),
      sheen: u("u_sheen"),
      petals: u("u_petals"),
      lobe: u("u_lobe"),
      grain: u("u_grain"),
      dim: u("u_dim"),
      bloom: u("u_bloom"),
    },
  };
}

export function deleteGL(s: GLState) {
  s.gl.deleteProgram(s.program);
  s.gl.deleteVertexArray(s.vao);
}

export function drawOrb(
  s: GLState,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  t: number,
  level: number,
  glow: number,
  energy: number,
  playEnv: number,
  pal: Triple[],
  design: OrbDesign,
  bloom = 1,
) {
  const { gl, program, vao, u } = s;
  gl.viewport(bx, by, bw, bh);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.uniform2f(u.origin, bx, by);
  gl.uniform2f(u.res, bw, bh);
  gl.uniform1f(u.time, t);
  gl.uniform1f(u.level, level);
  gl.uniform1f(u.glow, glow);
  gl.uniform1f(u.energy, energy);
  gl.uniform1f(u.playing, playEnv);
  gl.uniform3f(u.c0, pal[0][0], pal[0][1], pal[0][2]);
  gl.uniform3f(u.c1, pal[1][0], pal[1][1], pal[1][2]);
  gl.uniform3f(u.c2, pal[2][0], pal[2][1], pal[2][2]);
  gl.uniform3f(u.c3, pal[3][0], pal[3][1], pal[3][2]);
  gl.uniform1f(u.seed, design.seed);
  gl.uniform1f(u.flowScale, design.flowScale);
  gl.uniform1f(u.warpAmp, design.warpAmp);
  gl.uniform1f(u.swirl, design.swirl);
  gl.uniform1f(u.anchorSpread, design.anchorSpread);
  gl.uniform1f(u.orbitSpeed, design.orbitSpeed);
  gl.uniform1f(u.sheen, design.sheen);
  gl.uniform1f(u.petals, design.petals);
  gl.uniform1f(u.lobe, design.lobe);
  gl.uniform1f(u.grain, design.grain);
  gl.uniform1f(u.dim, design.dim);
  gl.uniform1f(u.bloom, bloom);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function renderGL(
  s: GLState,
  W: number,
  H: number,
  t: number,
  level: number,
  glow: number,
  energy: number,
  playEnv: number,
  pal: Triple[],
) {
  const { gl } = s;
  if (gl.isContextLost()) return;
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawOrb(s, 0, 0, W, H, t, level, glow, energy, playEnv, pal, DEFAULT_DESIGN);
  gl.bindVertexArray(null);
}

export function render2D(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  glow: number,
  energy: number,
  playEnv: number,
  pal: Triple[],
) {
  const playing = playEnv > 0.5;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  const cx = W / 2,
    cy = H / 2;
  const R = (Math.min(W, H) / 2) * 0.97;

  c.save();
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.clip();

  c.fillStyle = "rgb(15, 13, 13)";
  c.fillRect(0, 0, W, H);

  const wash = c.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
  wash.addColorStop(0, css(pal[0], 0.9));
  wash.addColorStop(0.6, css(pal[2], 0.85));
  wash.addColorStop(1, css(pal[1], 0.8));
  c.fillStyle = wash;
  c.fillRect(0, 0, W, H);

  c.globalCompositeOperation = "lighter";
  const breath = 0.5 + 0.5 * Math.sin(t);
  const intensity = playing ? 0.4 + glow * 0.35 : 0.24 + 0.12 * breath;
  for (let i = 0; i < 4; i++) {
    const a = t * (0.18 + 0.05 * energy) + i * 1.7;
    const orbit = 0.18 + 0.42 * (0.5 + 0.5 * Math.sin(t * 0.21 + i * 2.3));
    const px = cx + Math.cos(a * 0.7 + i) * R * orbit;
    const py = cy + Math.sin(a * 0.9 - i) * R * orbit;
    const rad = R * (0.55 - energy * 0.12);
    const g = c.createRadialGradient(
      px,
      py,
      0,
      px,
      py,
      Math.max(1, rad + R * 0.35),
    );
    g.addColorStop(0, css(pal[i], 0.7 * intensity));
    g.addColorStop(1, css(pal[i], 0));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  const cg = c.createRadialGradient(cx, cy, 0, cx, cy, R);
  cg.addColorStop(0, css(pal[0], 0.16 + glow * 0.3));
  cg.addColorStop(1, css(pal[0], 0));
  c.fillStyle = cg;
  c.fillRect(0, 0, W, H);

  c.restore();
  c.globalCompositeOperation = "source-over";
}

export function css(col: Triple, a: number): string {
  const r = Math.round(col[0] * 255),
    g = Math.round(col[1] * 255),
    b = Math.round(col[2] * 255);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
}

export function rgb01(hex: string): Triple | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function srgbToLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function linearToSrgb(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
function srgbToOklab(c: Triple): Triple {
  const r = srgbToLinear(c[0]),
    g = srgbToLinear(c[1]),
    b = srgbToLinear(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToSrgb(lab: Triple): Triple {
  const l_ = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
  const m_ = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
  const s_ = lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2];
  const l = l_ * l_ * l_,
    m = m_ * m_ * m_,
    s = s_ * s_ * s_;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
function oklabToOklch(lab: Triple): Triple {
  const C = Math.hypot(lab[1], lab[2]);
  let h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [lab[0], C, h];
}
function oklchToOklab(L: number, C: number, hDeg: number): Triple {
  const h = (hDeg * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}
function inGamut(c: Triple): boolean {
  const e = 1e-4;
  return (
    c[0] >= -e &&
    c[0] <= 1 + e &&
    c[1] >= -e &&
    c[1] <= 1 + e &&
    c[2] >= -e &&
    c[2] <= 1 + e
  );
}

function oklchToSrgb(L: number, C: number, hDeg: number): Triple {
  let out = oklabToSrgb(oklchToOklab(L, C, hDeg));
  if (inGamut(out)) return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
  let lo = 0,
    hi = C;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    out = oklabToSrgb(oklchToOklab(L, mid, hDeg));
    if (inGamut(out)) lo = mid;
    else hi = mid;
  }
  out = oklabToSrgb(oklchToOklab(L, lo, hDeg));
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
}

export function genPalette(c: Triple): Triple[] {
  const [accL, accC, accH] = oklabToOklch(srgbToOklab(c));
  const baseL = Math.min(0.72, Math.max(0.58, 0.64 + (accL - 0.62) * 0.16));
  const cA = Math.min(0.195, Math.max(0.145, accC * 0.55 + 0.095));
  return [
    oklchToSrgb(baseL, cA, accH),
    oklchToSrgb(0.9, 0.115, accH + 34),
    oklchToSrgb(0.45, cA * 0.92, accH - 34),
    oklchToSrgb(0.63, 0.205, accH + 167),
  ];
}

function rgb(hex: string): Triple | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((x) =>
      Math.round(Math.max(0, Math.min(255, x)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

export function mixHex(a: string, b: string, t: number): string {
  const ca = rgb01(a),
    cb = rgb01(b);
  if (!ca || !cb) return a;
  const out = mixTriple(ca, cb, t);
  return toHex(out[0] * 255, out[1] * 255, out[2] * 255);
}

export function mixTriple(a: Triple, b: Triple, t: number): Triple {
  const la = srgbToOklab(a),
    lb = srgbToOklab(b);
  const out = oklabToSrgb([
    la[0] + (lb[0] - la[0]) * t,
    la[1] + (lb[1] - la[1]) * t,
    la[2] + (lb[2] - la[2]) * t,
  ]);
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
}

export function hueOrder(list: string[]): string[] {
  const hueOf = (hex: string): number => {
    const c = rgb01(hex);
    return c ? oklabToOklch(srgbToOklab(c))[2] : 0;
  };
  return [...list].sort((x, y) => hueOf(x) - hueOf(y));
}

export function avgHex(list: string[]): string {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (const h of list) {
    const c = rgb(h);
    if (c) {
      r += c[0];
      g += c[1];
      b += c[2];
      n++;
    }
  }
  return n ? toHex(r / n, g / n, b / n) : IDLE_SLATE;
}

const IDLE_SLATE = "#8a93a0";
export function idleDrift(accents: string[], phase: number): string {
  if (accents.length < 2) return IDLE_SLATE;
  const CYCLE = 26;
  const u = (((phase / CYCLE) % 1) + 1) % 1;
  const f = u * accents.length;
  const i = Math.floor(f) % accents.length;
  const between = mixHex(
    accents[i],
    accents[(i + 1) % accents.length],
    f - Math.floor(f),
  );
  return mixHex(IDLE_SLATE, between, 0.72);
}

export type PaintEngine = {
  buildGL(gl: WebGL2RenderingContext): object | null;
  deleteGL(state: object): void;
  renderGL(
    state: object,
    W: number,
    H: number,
    t: number,
    level: number,
    glow: number,
    energy: number,
    playEnv: number,
    pal: Triple[],
  ): void;
  render2D(
    c: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    glow: number,
    energy: number,
    playEnv: number,
    pal: Triple[],
  ): void;
};

export const orbPaint: PaintEngine = { buildGL, deleteGL, renderGL, render2D };
