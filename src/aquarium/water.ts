import { pondPalettes, type PondPalette } from "./palettes";

type C = CanvasRenderingContext2D;
type Ripple = {
  x: number;
  y: number;
  age: number;
  strength: number;
  radius?: number;
  life?: number;
};
const TAU = Math.PI * 2;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function stone(c: C, x: number, y: number, r: number, seed: number) {
  const points = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * TAU,
      k = 1 + 0.16 * Math.sin(i * 2.1 + seed) + 0.09 * Math.cos(i * 3.3 - seed);
    return { x: x + Math.cos(a) * r * k, y: y + Math.sin(a) * r * 0.64 * k };
  });
  c.beginPath();
  c.moveTo((points[11].x + points[0].x) / 2, (points[11].y + points[0].y) / 2);
  for (let i = 0; i < 12; i++) {
    const a = points[i],
      b = points[(i + 1) % 12];
    c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  c.closePath();
}

function bloom(
  c: C,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number,
) {
  c.save();
  c.translate(x, y);
  c.scale(rx, ry);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (let step = 0; step <= 16; step++) {
    const radius = step / 16;
    g.addColorStop(
      radius,
      `rgba(${color},${alpha * (1 - radius * radius) ** 2})`,
    );
  }
  c.fillStyle = g;
  c.fillRect(-1, -1, 2, 2);
  c.restore();
}

export class PondWater {
  get reflectionSource() {
    return this.reflection;
  }
  private floor = document.createElement("canvas");
  private reflection = document.createElement("canvas");
  private pixels = new Uint8ClampedArray(0);
  private output: ImageData | null = null;
  private slopeX = new Float32Array(0);
  private slopeY = new Float32Array(0);
  private surface = document.createElement("canvas");
  private width = 1;
  private height = 1;
  private scale = 1;

  resize(width: number, height: number, palette: PondPalette) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.scale = Math.min(1, 384 / Math.max(this.width, this.height));
    for (const canvas of [this.floor, this.reflection, this.surface]) {
      canvas.width = Math.ceil(this.width * this.scale);
      canvas.height = Math.ceil(this.height * this.scale);
    }
    const theme = pondPalettes[palette],
      w = this.width,
      h = this.height,
      s = Math.min(w, h);
    const floor = this.floor.getContext("2d")!;
    floor.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const stones = [
      [-0.02, 0.92, 0.13],
      [0.1, 0.98, 0.1],
      [-0.015, 0.8, 0.083],
      [0.16, 1.035, 0.075],
      [0.035, 1.06, 0.09],
    ];
    for (let i = 0; i < stones.length; i++) {
      const [u, v, size] = stones[i],
        x = u * w,
        y = v * h,
        r = size * s;
      floor.save();
      floor.filter = `blur(${Math.max(1, s * 0.004) * this.scale}px)`;
      stone(floor, x + r * 0.04, y + r * 0.08, r, i);
      floor.fillStyle = theme.shadow;
      floor.globalAlpha = 0.2;
      floor.fill();
      stone(floor, x, y, r, i);
      floor.clip();
      const g = floor.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, theme.light ? "#a8ad8c" : "#8a9686");
      g.addColorStop(0.5, theme.light ? "#7d8c77" : "#5d746b");
      g.addColorStop(1, theme.shadow);
      floor.fillStyle = g;
      floor.globalAlpha = 0.24 - i * 0.018;
      floor.fillRect(x - r * 1.3, y - r, r * 2.6, r * 2);
      floor.globalAlpha = 0.1;
      floor.fillStyle = theme.glow ? `rgb(${theme.glow})` : "#b8c5ae";
      floor.beginPath();
      floor.moveTo(x - r, y - r * 0.13);
      floor.lineTo(x - r * 0.15, y - r * 0.43);
      floor.lineTo(x + r * 0.6, y - r * 0.12);
      floor.lineTo(x - r * 0.18, y + r * 0.1);
      floor.closePath();
      floor.fill();
      floor.restore();
    }
    const c = this.reflection.getContext("2d")!;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    // A broken opening in the canopy, rather than a second uniform gradient.
    bloom(
      c,
      w * 0.13,
      h * 0.035,
      w * 0.49,
      h * 0.34,
      theme.glow,
      theme.light ? 0.15 : 0.17,
    );
    bloom(c, w * 0.37, h * 0.1, w * 0.18, h * 0.2, theme.glow, 0.065);
    bloom(c, w * 0.08, h * 0.29, w * 0.23, h * 0.11, theme.glow, 0.055);
    const shade = theme.water.map((n) => Math.round(n * 0.4)).join(",");
    for (let i = 0; i < 19; i++) {
      const t = i / 18;
      const x = w * (1.03 - 0.22 * t) + Math.sin(i * 2.37) * s * 0.075;
      const y = h * (-0.035 + 0.41 * t) + Math.cos(i * 1.83) * s * 0.065;
      bloom(
        c,
        x,
        y,
        s * (0.1 + 0.035 * Math.sin(i * 0.7)),
        s * (0.075 + 0.025 * Math.cos(i)),
        shade,
        0.2,
      );
    }
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      bloom(
        c,
        w * (-0.09 + 0.21 * t) + Math.sin(i * 2.7) * s * 0.05,
        h * (0.66 + 0.32 * t),
        s * (0.11 + 0.025 * Math.sin(i)),
        s * 0.07,
        shade,
        0.15,
      );
    }
    // A few long, interrupted dark gestures suggest branches outside the view.
    c.save();
    c.filter = `blur(${s * 0.009 * this.scale}px)`;
    c.strokeStyle = `rgba(${shade},.12)`;
    c.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      c.lineWidth = s * (0.012 - i * 0.002);
      c.beginPath();
      c.moveTo(w * 1.04, h * (0.01 + i * 0.06));
      c.bezierCurveTo(
        w * 0.93,
        h * (0.09 + i * 0.04),
        w * 0.84,
        h * (0.15 + i * 0.045),
        w * (0.77 - i * 0.025),
        h * (0.24 + i * 0.025),
      );
      c.stroke();
    }
    c.restore();
    const pw = this.reflection.width,
      ph = this.reflection.height;
    this.pixels = c.getImageData(0, 0, pw, ph).data;
    this.output = new ImageData(pw, ph);
    this.slopeX = new Float32Array(pw * ph);
    this.slopeY = new Float32Array(pw * ph);
  }

  drawFloor(c: C) {
    c.drawImage(this.floor, 0, 0, this.width, this.height);
  }

  drawStillSurface(c: C) {
    c.drawImage(this.reflection, 0, 0, this.width, this.height);
  }

  drawSurface(
    c: C,
    time: number,
    reduced: boolean,
    ripples: readonly Ripple[],
  ) {
    const w = this.reflection.width,
      h = this.reflection.height,
      k = this.scale;
    const out = this.output;
    if (!out) return;
    const sx = this.slopeX,
      sy = this.slopeY;
    sx.fill(0);
    sy.fill(0);
    for (const r of ripples) {
      const life = r.life ?? 1.8,
        progress = clamp(r.age / life, 0, 1);
      const radius = r.radius ?? 6 + r.age * 40;
      const resolved = clamp((7 * k - 1.5) / 1.5, 0, 1);
      const amplitude =
        r.strength *
        (1 - progress) ** 2 *
        Math.min(1, r.age / 0.09) *
        5 *
        resolved;
      if (radius < 1 || amplitude < 0.004) continue;
      const cx = r.x * k,
        cy = r.y * k,
        extent = (radius + 3) * k;
      const x0 = Math.max(0, Math.floor(cx - extent)),
        x1 = Math.min(w - 1, Math.ceil(cx + extent));
      const y0 = Math.max(0, Math.floor(cy - extent)),
        y1 = Math.min(h - 1, Math.ceil(cy + extent));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = (x - cx) / k,
            dy = (y - cy) / k,
            d = Math.hypot(dx, dy),
            q = d - radius;
          if (q > 3 || q < -21 || d < 0.1) continue;
          // A traveling packet: alternating slopes, a soft leading edge and a quiet tail.
          const edge =
            q > 0 ? (1 - q / 3) ** 2 : q < -14 ? ((q + 21) / 7) ** 2 : 1;
          const slope =
            Math.cos((q * Math.PI * 2) / 7) *
            Math.exp(-(((q + 3) / 10) ** 2)) *
            edge *
            amplitude *
            k;
          const i = y * w + x;
          sx[i] += (dx / d) * slope;
          sy[i] += (dy / d) * slope;
        }
    }
    const src = this.pixels,
      dst = out.data,
      t = reduced ? 0 : time;
    for (let y = 0; y < h; y++) {
      const wind =
        (Math.sin((y / h) * 12 + t * 0.33) * 1.25 +
          Math.sin((y / h) * 23 - t * 0.21) * 0.55) *
        k;
      for (let x = 0; x < w; x++) {
        const i = y * w + x,
          u = clamp(x + sx[i] - wind, 0, w - 1),
          v = clamp(y + sy[i], 0, h - 1);
        const ix = Math.floor(u),
          iy = Math.floor(v),
          fx = u - ix,
          fy = v - iy;
        const a = (iy * w + ix) * 4,
          b = (iy * w + Math.min(w - 1, ix + 1)) * 4;
        const d = (Math.min(h - 1, iy + 1) * w + ix) * 4,
          e = (Math.min(h - 1, iy + 1) * w + Math.min(w - 1, ix + 1)) * 4;
        for (let channel = 0; channel < 4; channel++) {
          dst[i * 4 + channel] =
            (src[a + channel] * (1 - fx) + src[b + channel] * fx) * (1 - fy) +
            (src[d + channel] * (1 - fx) + src[e + channel] * fx) * fy;
        }
      }
    }
    this.surface.getContext("2d")!.putImageData(out, 0, 0);
    c.drawImage(this.surface, 0, 0, this.width, this.height);
  }

  dispose() {
    for (const canvas of [this.floor, this.reflection, this.surface])
      canvas.width = canvas.height = 1;
    this.pixels = new Uint8ClampedArray(0);
    this.output = null;
    this.slopeX = new Float32Array(0);
    this.slopeY = new Float32Array(0);
  }
}
