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
uniform sampler2D fishInk;
uniform sampler2D glyphAtlas;
uniform sampler2D reflections;
uniform sampler2D cellHash;
uniform vec2 size;
uniform vec2 inkSize;
uniform float cell;
uniform float lightMode;
uniform vec3 waterColor;
uniform vec3 topColor;
uniform vec3 middleColor;
uniform vec3 bottomColor;
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
  vec2 direction=vec2(size.x*.7,size.y);
  float gradient=clamp(dot(samplePoint,direction)/dot(direction,direction),0.,1.);
  float t=gradient*gradient*(3.-2.*gradient);
  vec3 base=mix(mix(topColor,middleColor,t),mix(middleColor,bottomColor,t),t);
  vec4 objects=texture2D(scene,clamp(sourceUV,vec2(0.),vec2(1.)));
  vec3 color=mix(base,objects.rgb,objects.a);
  vec2 grid=floor(samplePoint/cell);
  vec2 inkUV=vec2((grid.x+.5)/inkSize.x,1.-(grid.y+.5)/inkSize.y);
  vec4 ink=texture2D(fishInk,inkUV);
  if(ink.a>.025){
    float hash=floor(texture2D(cellHash,inkUV).r*15.+.5);
    bool red=ink.r>ink.g*1.22;
    vec3 pigment=red?vec3(min(1.,ink.r*1.3),ink.g*.94,ink.b*.75):min(vec3(1.),ink.rgb*vec3(1.12,1.1,1.04));
    pigment=mix(pigment,waterColor,clamp((.84-ink.a)*.52,0.,.28));
    vec2 within=fract(samplePoint/cell);
    float tile=step(within.x,.94)*step(within.y,.94);
    float tileAlpha=ink.a*(mix(.1,.36,lightMode)+mod(hash,3.)*.025)*tile;
    color=mix(color,pigment,tileAlpha);
    float glyph=max(0.,min(6.,floor(ink.a*6.))-mod(hash,3.));
    vec2 glyphUV=vec2((glyph+within.x)/7.,1.-within.y);
    float mask=texture2D(glyphAtlas,glyphUV).a;
    color=mix(color,pigment,mask*min(1.,ink.a*(1.06+mod(hash,5.)*.025)));
  }
  vec4 reflection=texture2D(reflections,clamp(sourceUV,vec2(0.),vec2(1.)));
  color=mix(color,reflection.rgb,reflection.a);
  float facing=dot(slope,normalize(vec2(-.45,-.89)));
  float sheen=smoothstep(.15,1.5,facing)*.026;
  color=color*(1.+clamp(facing,-2.,2.)*.012)+lightColor*sheen;
  float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
  gl_FragColor=vec4(color+dither/255.,1.);
}
`;

export class PondSurfaceMesh {
  private canvas = document.createElement("canvas");
  private source = document.createElement("canvas");
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private auxiliary = new Map<
    string,
    { texture: WebGLTexture; width: number; height: number; version: number }
  >();
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
        "fishInk",
        "glyphAtlas",
        "reflections",
        "cellHash",
        "size",
        "inkSize",
        "cell",
        "lightMode",
        "waterColor",
        "topColor",
        "middleColor",
        "bottomColor",
        "time",
        "lightColor",
        "waves[0]",
        "count",
      ])
        this.uniforms[name] = gl.getUniformLocation(this.program, name);
      gl.uniform1i(this.uniforms.scene, 0);
      gl.uniform1i(this.uniforms.fishInk, 1);
      gl.uniform1i(this.uniforms.glyphAtlas, 2);
      gl.uniform1i(this.uniforms.reflections, 3);
      gl.uniform1i(this.uniforms.cellHash, 4);
    } catch {
      this.disabled = true;
      this.release();
    }
  }

  private upload(
    name: string,
    source: HTMLCanvasElement,
    unit: number,
    linear: boolean,
    version: number,
    dynamic = false,
  ) {
    const gl = this.gl!;
    let record = this.auxiliary.get(name);
    if (!record) {
      const texture = gl.createTexture();
      if (!texture) throw new Error("Pond texture unavailable");
      record = { texture, width: 0, height: 0, version: -1 };
      this.auxiliary.set(name, record);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        linear ? gl.LINEAR : gl.NEAREST,
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        linear ? gl.LINEAR : gl.NEAREST,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, record.texture);
    if (record.width !== source.width || record.height !== source.height) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      record.width = source.width;
      record.height = source.height;
    } else if (dynamic || record.version !== version)
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
    record.version = version;
  }

  apply(
    source: HTMLCanvasElement,
    widthCSS: number,
    heightCSS: number,
    time: number,
    reduced: boolean,
    ripples: readonly Ripple[],
    palette: PondPalette,
    fishInk: HTMLCanvasElement,
    cell: number,
    glyphAtlas: HTMLCanvasElement,
    reflection: HTMLCanvasElement,
    cellHash: HTMLCanvasElement,
    version: number,
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
      const input = this.source.getContext("2d");
      if (!input) return null;
      input.clearRect(0, 0, width, height);
      input.drawImage(source, 0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
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
      this.upload("fish", fishInk, 1, false, version, true);
      this.upload("glyphs", glyphAtlas, 2, true, version);
      this.upload("reflections", reflection, 3, true, version);
      this.upload("cellHash", cellHash, 4, false, version);
      gl.useProgram(this.program);
      gl.viewport(0, 0, width, height);
      gl.uniform2f(this.uniforms.size, widthCSS, heightCSS);
      gl.uniform1f(this.uniforms.time, reduced ? 0 : time);
      gl.uniform2f(this.uniforms.inkSize, fishInk.width, fishInk.height);
      gl.uniform1f(this.uniforms.cell, cell);
      gl.uniform1f(
        this.uniforms.lightMode,
        pondPalettes[palette].light ? 1 : 0,
      );
      const theme = pondPalettes[palette];
      gl.uniform3f(
        this.uniforms.waterColor,
        theme.water[0] / 255,
        theme.water[1] / 255,
        theme.water[2] / 255,
      );
      for (const [index, name] of [
        "topColor",
        "middleColor",
        "bottomColor",
      ].entries()) {
        const hex = theme.stops[index].slice(1);
        gl.uniform3f(
          this.uniforms[name],
          parseInt(hex.slice(0, 2), 16) / 255,
          parseInt(hex.slice(2, 4), 16) / 255,
          parseInt(hex.slice(4, 6), 16) / 255,
        );
      }
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
    for (const record of this.auxiliary.values())
      gl.deleteTexture(record.texture);
    this.auxiliary.clear();
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
