import { pondPalettes, type PondPalette } from "./palettes";

type Ripple = {
  x: number;
  y: number;
  age: number;
  strength: number;
  radius?: number;
  life?: number;
};
const LIMIT = 24;
const lightTints = Object.fromEntries(
  Object.entries(pondPalettes).map(([key, value]) => [
    key,
    value.glow.split(",").map(Number),
  ]),
) as Record<PondPalette, number[]>;
const vertex = `
attribute vec2 position;
varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}
`;
const fragment = `
precision highp float;
varying vec2 uv;
uniform sampler2D scene;
uniform vec2 size;
uniform float time;
uniform vec3 lightColor;
uniform vec4 waves[24];
uniform int count;
void main(){
  vec2 p=vec2(uv.x,1.-uv.y)*size;
  float scale=max(240.,min(size.x,size.y));
  vec2 a=normalize(vec2(.83,.55)),b=normalize(vec2(-.32,.95));
  float phaseA=dot(p,a)/scale*10.5-time*.29;
  float phaseB=dot(p,b)/scale*7.1+time*.19;
  vec2 slope=a*cos(phaseA)*.78+b*cos(phaseB)*.52;
  for(int i=0;i<24;i++){
    if(i>=count)break;
    vec4 wave=waves[i];
    vec2 delta=p-wave.xy;
    float reach=wave.z+24.;
    if(abs(delta.x)>reach||abs(delta.y)>reach)continue;
    float distance=length(delta),q=distance-wave.z;
    if(abs(q)>24.||distance<.1)continue;
    float packet=exp(-q*q/100.);
    float edge=1.-smoothstep(17.,24.,abs(q));
    slope+=delta/distance*cos(q*.349066)*packet*edge*wave.w;
  }
  // Bound the displacement smoothly where several waves meet.
  vec2 shift=slope*inversesqrt(1.+dot(slope,slope)/6.25);
  float border=min(min(p.x,size.x-p.x),min(p.y,size.y-p.y));
  shift*=smoothstep(0.,9.,border);
  vec2 samplePoint=p+shift;
  vec2 sourceUV=vec2(samplePoint.x/size.x,1.-samplePoint.y/size.y);
  vec4 color=texture2D(scene,clamp(sourceUV,vec2(0.),vec2(1.)));
  float facing=dot(slope,normalize(vec2(-.45,-.89)));
  float sheen=smoothstep(.15,1.5,facing)*.026;
  color.rgb=color.rgb*(1.+clamp(facing,-2.,2.)*.012)+lightColor*sheen;
  gl_FragColor=vec4(color.rgb,color.a);
}
`;

/** A separate optical surface over the already drawn pond. */
export class PondSurfaceMesh {
  private canvas = document.createElement("canvas");
  private source = document.createElement("canvas");
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private waveData = new Float32Array(LIMIT * 4);
  private scores = new Float32Array(LIMIT);
  private disabled = false;
  private disposed = false;
  private textureWidth = 0;
  private textureHeight = 0;
  private lost = (event: Event) => {
    event.preventDefault();
    this.disabled = true;
  };

  get available() {
    return (
      !this.disposed &&
      !this.disabled &&
      !!this.gl &&
      !this.gl.isContextLost() &&
      !!this.program
    );
  }

  constructor() {
    this.canvas.addEventListener("webglcontextlost", this.lost);
    try {
      const gl = this.canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
      });
      if (!gl) {
        this.disabled = true;
        return;
      }
      this.gl = gl;
      const shaders: WebGLShader[] = [];
      try {
        const compile = (type: number, source: string) => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("Surface shader unavailable");
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(
              gl.getShaderInfoLog(shader) || "Surface shader failed",
            );
          return shader;
        };
        const vs = compile(gl.VERTEX_SHADER, vertex),
          fs = compile(gl.FRAGMENT_SHADER, fragment);
        this.program = gl.createProgram();
        if (!this.program) throw new Error("Surface program unavailable");
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
          throw new Error(
            gl.getProgramInfoLog(this.program) || "Surface link failed",
          );
      } finally {
        for (const shader of shaders) gl.deleteShader(shader);
      }
      this.buffer = gl.createBuffer();
      this.texture = gl.createTexture();
      if (!this.buffer || !this.texture)
        throw new Error("Surface resources unavailable");
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(this.program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      for (const name of [
        "scene",
        "size",
        "time",
        "lightColor",
        "waves[0]",
        "count",
      ])
        this.uniforms[name] = gl.getUniformLocation(this.program, name);
      gl.uniform1i(this.uniforms.scene, 0);
    } catch {
      this.disabled = true;
      this.release();
    }
  }

  apply(
    source: HTMLCanvasElement,
    widthCSS: number,
    heightCSS: number,
    time: number,
    reduced: boolean,
    ripples: readonly Ripple[],
    palette: PondPalette,
  ): HTMLCanvasElement | null {
    const gl = this.gl;
    if (
      this.disposed ||
      this.disabled ||
      !gl ||
      gl.isContextLost() ||
      !this.program ||
      !this.texture
    )
      return null;
    if (
      !Number.isFinite(widthCSS + heightCSS + time) ||
      widthCSS <= 0 ||
      heightCSS <= 0 ||
      !source.width ||
      !source.height
    )
      return null;
    try {
      const ratio = Math.min(
        1.5,
        window.devicePixelRatio || 1,
        1600 / Math.max(widthCSS, heightCSS),
      );
      const width = Math.max(1, Math.round(widthCSS * ratio)),
        height = Math.max(1, Math.round(heightCSS * ratio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = this.source.width = width;
        this.canvas.height = this.source.height = height;
      }
      const input = this.source.getContext("2d", { alpha: false });
      if (!input) return null;
      input.drawImage(source, 0, 0, width, height);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      if (this.textureWidth !== width || this.textureHeight !== height) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          this.source,
        );
        this.textureWidth = width;
        this.textureHeight = height;
      } else
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          this.source,
        );
      this.scores.fill(0);
      this.waveData.fill(0);
      let count = 0;
      for (const ripple of ripples) {
        const life = ripple.life ?? 1.8,
          radius = ripple.radius ?? 6 + ripple.age * 40;
        if (
          !Number.isFinite(
            ripple.x + ripple.y + ripple.age + ripple.strength + life + radius,
          ) ||
          life <= 0 ||
          ripple.age < 0 ||
          ripple.age >= life ||
          radius < 0
        )
          continue;
        const score =
          Math.max(0, Math.min(1, ripple.strength)) *
          (1 - ripple.age / life) ** 2 *
          Math.min(1, ripple.age / 0.1);
        if (score < 0.004) continue;
        const priority = score + (ripple.life === undefined ? 1 : 0);
        let index = Math.min(count, LIMIT - 1);
        if (count === LIMIT && priority <= this.scores[index]) continue;
        while (index > 0 && priority > this.scores[index - 1]) {
          this.scores[index] = this.scores[index - 1];
          for (let j = 0; j < 4; j++)
            this.waveData[index * 4 + j] = this.waveData[(index - 1) * 4 + j];
          index--;
        }
        this.scores[index] = priority;
        this.waveData[index * 4] = ripple.x;
        this.waveData[index * 4 + 1] = ripple.y;
        this.waveData[index * 4 + 2] = radius;
        this.waveData[index * 4 + 3] = score * 2.2;
        count = Math.min(LIMIT, count + 1);
      }
      const tint = lightTints[palette];
      gl.useProgram(this.program);
      gl.viewport(0, 0, width, height);
      gl.uniform2f(this.uniforms.size, widthCSS, heightCSS);
      gl.uniform1f(this.uniforms.time, reduced ? 0 : time);
      gl.uniform3f(
        this.uniforms.lightColor,
        Number(tint[0]) / 255,
        Number(tint[1]) / 255,
        Number(tint[2]) / 255,
      );
      gl.uniform4fv(this.uniforms["waves[0]"], this.waveData);
      gl.uniform1i(this.uniforms.count, count);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return this.canvas;
    } catch {
      this.disabled = true;
      this.release();
      return null;
    }
  }

  private release() {
    const gl = this.gl;
    if (!gl) return;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    this.texture = null;
    this.buffer = null;
    this.program = null;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
    this.canvas.removeEventListener("webglcontextlost", this.lost);
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.canvas.width =
      this.canvas.height =
      this.source.width =
      this.source.height =
        1;
  }
}
