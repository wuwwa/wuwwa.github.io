import type { Koi, KoiPond, Point } from "./model";
import { pondPalettes, type PondPalette } from "./palettes";
import { PondWater } from "./water";
import { drawPondRain } from "./rain-render";
import { PondSurfaceMesh } from "./surface-mesh";

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function contour(c: C, points: Point[]) {
  const n = points.length;
  c.beginPath();
  c.moveTo(
    (points[0].x + points[n - 1].x) / 2,
    (points[0].y + points[n - 1].y) / 2,
  );
  for (let i = 0; i < n; i++) {
    const p = points[i],
      next = points[(i + 1) % n];
    c.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }
  c.closePath();
}

function section(f: Koi, t: number) {
  const v = clamp(t, 0, 1) * 0.82 * (f.spine.length - 1),
    i = Math.min(f.spine.length - 2, Math.floor(v)),
    a = f.spine[i],
    b = f.spine[i + 1];
  const q = v - i,
    dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy) || 1;
  return {
    x: a.x + (b.x - a.x) * q,
    y: a.y + (b.y - a.y) * q,
    nx: -dy / d,
    ny: dx / d,
    tx: dx / d,
    ty: dy / d,
  };
}

function girth(f: Koi, t: number) {
  // The narrow wrist gives the tail a clear hinge without thinning the shoulder.
  const shape = [0.52, 0.81, 0.98, 1, 0.98, 0.89, 0.74, 0.56, 0.37, 0.21, 0.13];
  const u = clamp(t, 0, 1) * 10,
    i = Math.min(9, Math.floor(u));
  return (shape[i] + (shape[i + 1] - shape[i]) * (u - i)) * f.length * 0.105;
}
function point(f: Koi, t: number, s: number): Point {
  const p = section(f, t),
    w = girth(f, t) * s;
  return { x: p.x + p.nx * w, y: p.y + p.ny * w };
}
function body(c: C, f: Koi) {
  const points: Point[] = [];
  for (let i = 0; i <= 24; i++) points.push(point(f, i / 24, 1));
  for (let i = 24; i >= 0; i--) points.push(point(f, i / 24, -1));
  contour(c, points);
}
function patch(
  c: C,
  f: Koi,
  start: number,
  end: number,
  side: number,
  width: number,
  color: string,
  seed: number,
) {
  const pts: Point[] = [];
  for (let k = 0; k <= 9; k++) {
    const u = k / 9,
      t = start + (end - start) * u;
    const edge = 0.38 + 0.62 * Math.sin(u * Math.PI) ** 0.5;
    const drift = 0.18 * Math.sin(u * 5 + seed);
    pts.push(
      point(
        f,
        t,
        side + drift + width * edge * (0.79 + 0.25 * Math.sin(k * 1.55 + seed)),
      ),
    );
  }
  for (let k = 9; k >= 0; k--) {
    const u = k / 9,
      t = start + (end - start) * u;
    const edge = 0.4 + 0.6 * Math.sin(u * Math.PI) ** 0.5;
    const drift = 0.18 * Math.sin(u * 5 + seed);
    pts.push(
      point(
        f,
        t,
        side + drift - width * edge * (0.85 + 0.24 * Math.cos(k * 1.15 + seed)),
      ),
    );
  }
  contour(c, pts);
  c.fillStyle = color;
  c.fill();
}

function fins(c: C, f: Koi, time: number, reduced: boolean) {
  const p = section(f, 0.28),
    w = girth(f, 0.28);
  for (const side of [-1, 1]) {
    const flutter = reduced ? 0 : Math.sin(f.phase * 0.67 + side * 0.8) * 0.14;
    c.save();
    c.translate(p.x + p.nx * w * 0.68 * side, p.y + p.ny * w * 0.68 * side);
    c.rotate(Math.atan2(p.ty, p.tx));
    c.scale(1, side);
    const l = f.length;
    c.beginPath();
    c.moveTo(-l * 0.045, 0);
    c.bezierCurveTo(
      -l * 0.07,
      l * 0.075,
      l * 0.025,
      l * (0.175 + flutter * 0.08),
      l * 0.075,
      l * 0.168,
    );
    c.bezierCurveTo(l * 0.115, l * 0.155, l * 0.095, l * 0.075, l * 0.055, 0);
    c.closePath();
    const g = c.createLinearGradient(0, 0, l * 0.06, l * 0.17);
    g.addColorStop(0, "rgba(222,229,205,.56)");
    g.addColorStop(0.65, "rgba(219,232,213,.34)");
    g.addColorStop(1, "rgba(229,239,222,.09)");
    c.fillStyle = g;
    c.fill();
    c.restore();
  }
  const tail = section(f, 1),
    wave = reduced ? 0 : Math.sin(f.phase - 1.6) * 0.22;
  c.save();
  c.translate(tail.x, tail.y);
  c.rotate(Math.atan2(tail.ty, tail.tx) + wave);
  const l = f.length;
  c.beginPath();
  c.moveTo(-l * 0.025, -l * 0.012);
  c.bezierCurveTo(
    l * 0.04,
    -l * 0.02,
    l * 0.095,
    -l * 0.103,
    l * 0.167,
    -l * 0.113,
  );
  c.bezierCurveTo(l * 0.156, -l * 0.064, l * 0.13, -l * 0.025, l * 0.115, 0);
  c.bezierCurveTo(
    l * 0.13,
    l * 0.025,
    l * 0.156,
    l * 0.064,
    l * 0.167,
    l * 0.113,
  );
  c.bezierCurveTo(
    l * 0.095,
    l * 0.103,
    l * 0.04,
    l * 0.02,
    -l * 0.025,
    l * 0.012,
  );
  c.closePath();
  const g = c.createLinearGradient(0, 0, l * 0.17, 0);
  g.addColorStop(0, "rgba(225,225,197,.75)");
  g.addColorStop(0.5, "rgba(226,235,214,.47)");
  g.addColorStop(1, "rgba(223,235,216,.13)");
  c.fillStyle = g;
  c.fill();
  c.restore();
}

function fish(c: C, f: Koi, time: number, reduced: boolean) {
  const depth = clamp(f.depth, 0, 1);
  c.save();
  c.globalAlpha = 0.92 - depth * 0.48;
  fins(c, f, time, reduced);
  const variety = f.variant % 6;
  body(c, f);
  c.fillStyle =
    variety === 4 ? "#c7b374" : variety === 2 ? "#ddd8bb" : "#eae4ce";
  c.fill();
  c.save();
  body(c, f);
  c.clip();
  const red = variety === 1 ? "#b45636" : "#c36240";
  if (variety === 0) {
    patch(c, f, 0.015, 0.25, -0.12, 0.88, red, 1);
    patch(c, f, 0.34, 0.58, 0.32, 0.94, red, 4);
    patch(c, f, 0.67, 0.88, -0.22, 0.86, red, 7);
  } else if (variety === 1) {
    patch(c, f, 0.04, 0.21, 0.18, 0.69, red, 2);
    patch(c, f, 0.28, 0.65, -0.28, 1.05, red, 6);
    patch(c, f, 0.7, 0.92, 0.18, 0.9, red, 3);
    patch(c, f, 0.29, 0.42, 0.68, 0.43, "#404844", 5);
    patch(c, f, 0.56, 0.72, -0.63, 0.6, "#46504a", 8);
  } else if (variety === 2) {
    patch(c, f, 0.12, 0.36, -0.55, 0.68, "#4c554b", 1);
    patch(c, f, 0.42, 0.73, 0.3, 1.1, "#50554a", 3);
    patch(c, f, 0.04, 0.23, 0.12, 0.62, red, 4);
    patch(c, f, 0.73, 0.94, -0.14, 0.76, red, 9);
  } else if (variety === 3) {
    patch(c, f, 0.035, 0.2, 0, 0.73, "#c65b40", 3);
  } else if (variety === 4) {
    patch(c, f, 0.22, 0.44, -0.38, 0.73, "#8b7953", 7);
    patch(c, f, 0.51, 0.78, 0.37, 0.88, "#9a8055", 2);
  } else {
    patch(c, f, 0.16, 0.33, 0.36, 0.78, "#454c48", 5);
    patch(c, f, 0.43, 0.65, -0.22, 1.05, "#414c47", 1);
    patch(c, f, 0.76, 0.91, 0.38, 0.68, "#515750", 8);
  }
  // Cross-body light follows each curved section instead of sliding over the fish.
  for (let i = 0; i < 36; i++) {
    const t = i / 36,
      u = Math.min(1, (i + 1.04) / 36),
      p = section(f, t),
      w = girth(f, t);
    const g = c.createLinearGradient(
      p.x - p.nx * w,
      p.y - p.ny * w,
      p.x + p.nx * w,
      p.y + p.ny * w,
    );
    g.addColorStop(0, "rgba(30,65,53,.28)");
    g.addColorStop(0.36, "rgba(255,250,222,.12)");
    g.addColorStop(0.58, "rgba(255,249,222,.07)");
    g.addColorStop(1, "rgba(32,65,53,.32)");
    const pts = [
      point(f, t, -1.1),
      point(f, u, -1.1),
      point(f, u, 1.1),
      point(f, t, 1.1),
    ];
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < 4; j++) c.lineTo(pts[j].x, pts[j].y);
    c.closePath();
    c.fillStyle = g;
    c.fill();
  }
  c.restore();
  c.restore();
}

export class PondRenderer {
  private water = new PondWater();
  private mesh: PondSurfaceMesh | null = null;
  private meshEnabled =
    new URLSearchParams(location.search).get("surface") !== "checkpoint";
  palette: PondPalette = "jade";
  private c: C;
  private backdrop = document.createElement("canvas");
  private ink = document.createElement("canvas");
  private inkContext = this.ink.getContext("2d", { willReadFrequently: true })!;
  private cell = 4;
  width = 1;
  height = 1;
  ratio = 1;
  zoom = 1;
  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("The pond needs Canvas support.");
    this.c = c;
  }
  setPalette(palette: PondPalette) {
    this.palette = palette;
    this.paintWater();
  }
  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.backdrop.width = Math.round(
      this.width * this.ratio,
    );
    this.canvas.height = this.backdrop.height = Math.round(
      this.height * this.ratio,
    );
    this.cell = clamp(Math.min(w, h) / 95, 2.2, 5);
    this.ink.width = Math.ceil(w / this.cell);
    this.ink.height = Math.ceil(h / this.cell);
    this.paintWater();
  }
  private paintWater() {
    this.water.resize(this.width, this.height, this.palette);
    const palette = pondPalettes[this.palette];
    const c = this.backdrop.getContext("2d")!;
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    const g = c.createLinearGradient(0, 0, this.width * 0.7, this.height);
    g.addColorStop(0, palette.stops[0]);
    g.addColorStop(0.36, palette.stops[1]);
    g.addColorStop(1, palette.stops[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, this.width, this.height);
    const light = c.createRadialGradient(
      this.width * 0.18,
      this.height * 0.08,
      0,
      this.width * 0.18,
      this.height * 0.08,
      this.height * 0.82,
    );
    light.addColorStop(0, `rgba(${palette.glow},.07)`);
    light.addColorStop(1, `rgba(${palette.glow},0)`);
    c.fillStyle = light;
    c.fillRect(0, 0, this.width, this.height);
  }
  render(model: KoiPond, aim?: Point) {
    const c = this.c,
      z = this.zoom,
      dx = (this.width * (1 - z)) / 2,
      dy = (this.height * (1 - z)) / 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.drawImage(this.backdrop, 0, 0);
    c.setTransform(
      this.ratio * z,
      0,
      0,
      this.ratio * z,
      this.ratio * dx,
      this.ratio * dy,
    );
    this.water.drawFloor(c);
    const ordered = [...model.fish].sort((a, b) => b.depth - a.depth);
    const palette = pondPalettes[this.palette];
    for (const f of ordered) {
      const depth = clamp(f.depth, 0, 1),
        scale = 1 - depth * 0.17;
      c.save();
      const offset = 4 + (1 - depth) * 21;
      c.translate(f.x + offset * 0.55, f.y + offset);
      c.scale(scale, scale);
      c.translate(-f.x, -f.y);
      c.globalAlpha = (palette.light ? 0.17 : 0.22) * (0.45 + depth * 0.55);
      c.fillStyle = palette.shadow;
      c.shadowColor = palette.shadow;
      c.shadowBlur = 3 + (1 - depth) * 8;
      body(c, f);
      c.fill();
      c.restore();
    }
    const ink = this.inkContext,
      cell = this.cell;
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.clearRect(0, 0, this.ink.width, this.ink.height);
    ink.setTransform(1 / cell, 0, 0, 1 / cell, 0, 0);
    for (const f of ordered) {
      const depth = clamp(f.depth, 0, 1),
        scale = 1 - depth * 0.17;
      ink.save();
      ink.translate(f.x, f.y);
      ink.scale(scale, scale);
      ink.translate(-f.x, -f.y);
      ink.filter = `blur(${depth * 0.48}px)`;
      fish(ink, f, model.time, model.reduced);
      ink.restore();
    }
    const pixels = ink.getImageData(0, 0, this.ink.width, this.ink.height).data;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `${cell * 1.18}px monospace`;
    const glyphs = ["·", ":", "+", "x", "*", "#", "%"];
    for (let y = 0; y < this.ink.height; y++)
      for (let x = 0; x < this.ink.width; x++) {
        const i = (y * this.ink.width + x) * 4,
          a = pixels[i + 3] / 255;
        if (a < 0.025) continue;
        const hash = ((x * 73 + y * 151) ^ (x * y * 7)) >>> 0;
        const r = pixels[i],
          g = pixels[i + 1],
          b = pixels[i + 2];
        const red = r > g * 1.22;
        const base = red
          ? [Math.min(255, r * 1.3), g * 0.94, b * 0.75]
          : [
              Math.min(255, r * 1.12),
              Math.min(255, g * 1.1),
              Math.min(255, b * 1.04),
            ];
        const haze = clamp((0.84 - a) * 0.52, 0, 0.28);
        const color = base.map((v, j) =>
          Math.round(v * (1 - haze) + palette.water[j] * haze),
        );
        c.fillStyle = `rgb(${color.join(",")})`;
        c.globalAlpha = a * ((palette.light ? 0.36 : 0.1) + (hash % 3) * 0.025);
        c.fillRect(x * cell, y * cell, cell * 0.94, cell * 0.94);
        c.globalAlpha = Math.min(1, a * (1.06 + (hash % 5) * 0.025));
        const density = Math.min(6, Math.floor(a * 6));
        c.fillText(
          glyphs[Math.max(0, density - (hash % 3))],
          (x + 0.5) * cell,
          (y + 0.5) * cell,
        );
      }
    c.globalAlpha = 1;
    const directRipples = model.ripples.slice(-3);
    if (this.meshEnabled && !this.mesh) this.mesh = new PondSurfaceMesh();
    const ripples = [...directRipples, ...model.rain.impacts];
    let hasSurface = false;
    if (this.mesh?.available && this.meshEnabled) {
      this.water.drawStillSurface(c);
      const surface = this.mesh.apply(
        this.canvas,
        this.width,
        this.height,
        model.time,
        model.reduced,
        ripples,
        this.palette,
      );
      if (surface) {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(surface, 0, 0, this.canvas.width, this.canvas.height);
        c.restore();
        hasSurface = true;
      }
    }
    if (!hasSurface)
      this.water.drawSurface(c, model.time, model.reduced, ripples);
    this.canvas.dataset.surface = hasSurface ? "mesh" : "checkpoint";
    for (const drop of model.droplets ?? []) {
      if (drop.age < 0.28) continue;
      const t = (drop.age - 0.28) / 0.42;
      c.globalAlpha = Math.sin(t * Math.PI) * 0.22;
      c.fillStyle = palette.light ? "#405e57" : "#dcebd4";
      c.beginPath();
      c.arc(drop.x, drop.y, 0.5 + Math.sin(t * Math.PI) * 0.65, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    for (const pellet of model.pellets ?? []) {
      const fade = clamp((12 - pellet.age) / 2, 0, 1),
        size = clamp(cell * 0.65, 1.5, 2.8);
      c.globalAlpha = fade * 0.86;
      c.fillStyle = "#d2ad70";
      c.fillRect(pellet.x - size / 2, pellet.y - size / 2, size, size * 0.8);
      c.globalAlpha = fade * 0.35;
      c.fillStyle = "#f0d6a0";
      c.fillRect(
        pellet.x - size / 2,
        pellet.y - size / 2,
        size * 0.5,
        size * 0.32,
      );
    }
    c.globalAlpha = 1;
    if (!hasSurface)
      for (const r of model.ripples) {
        const age = r.age,
          fade = Math.max(0, 1 - age / 1.8) * clamp(r.strength, 0.15, 1);
        if (!fade) continue;
        const radius = 6 + age * 40;
        c.lineWidth = 0.8;
        c.strokeStyle = `rgba(222,237,212,${fade * (palette.light ? 0.34 : 0.19)})`;
        c.beginPath();
        c.ellipse(r.x, r.y, radius, radius, 0, 0, TAU);
        c.stroke();
        c.strokeStyle = `rgba(20,65,62,${fade * 0.1})`;
        c.beginPath();
        c.ellipse(r.x, r.y, radius + 2, radius + 2, 0, 0, TAU);
        c.stroke();
      }
    if (!model.reduced)
      drawPondRain(
        c,
        model.rain,
        this.palette,
        hasSurface ? 18 : 7,
        hasSurface ? 0.55 : 1,
      );
    if (aim) {
      c.strokeStyle = "rgba(233,239,213,.6)";
      c.lineWidth = 1;
      c.setLineDash([2, 4]);
      c.beginPath();
      c.arc(aim.x, aim.y, 9, 0, TAU);
      c.stroke();
      c.setLineDash([]);
    }
  }
  dispose() {
    this.mesh?.dispose();
    this.water.dispose();
    this.backdrop.width =
      this.backdrop.height =
      this.ink.width =
      this.ink.height =
        1;
  }
}
