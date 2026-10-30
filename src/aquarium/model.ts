import { PondRain } from "./rain.ts";

export interface Point {
  x: number;
  y: number;
}
export interface Ripple extends Point {
  age: number;
  strength: number;
}
export interface Pellet extends Point {
  age: number;
  vx: number;
  vy: number;
}
export interface Droplet extends Point {
  age: number;
}
interface Motion {
  wander: number;
  nextWander: number;
  drift: number;
  burstUntil: number;
  nextBurst: number;
  depthTarget: number;
  nextDive: number;
  nextWake: number;
  startle: number;
  flee: Point;
  food: Pellet | null;
}
export interface Koi extends Point {
  id: number;
  angle: number;
  speed: number;
  length: number;
  phase: number;
  depth: number;
  spine: Point[];
  variant: number;
  entering: boolean;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const angleDelta = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class KoiPond {
  avoid: { left: number; right: number; top: number; bottom: number }[] = [];
  readonly rain = new PondRain();
  width = 800;
  height = 600;
  time = 0;
  reduced = false;
  fish: Koi[] = [];
  ripples: Ripple[] = [];
  pellets: Pellet[] = [];
  droplets: Droplet[] = [];
  private nextDrip = 5;
  target: (Point & { held: boolean }) | null = null;
  private heldTime = 0;
  private touchSpeed = 0;
  private rippleTime = 0;
  private curious: number | null = null;
  private paths = new Map<number, Point[]>();
  private motion = new Map<number, Motion>();
  private seed = 78217;
  private fitted = false;
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private range(a: number, b: number) {
    return a + (b - a) * this.random();
  }
  private count() {
    return this.width < 260
      ? 4
      : this.width < 600
        ? this.width * this.height > 300000
          ? 7
          : 6
        : this.width * this.height > 900000
          ? 10
          : 9;
  }
  private size(id: number) {
    return clamp(
      clamp(Math.min(this.width, this.height) * 0.4, 85, 200) *
        [1, 0.66, 0.87, 0.52, 0.92, 0.72, 0.58, 1.04, 0.8, 0.63][id % 10],
      65,
      200,
    );
  }
  private makeFish(id: number): Koi {
    const size = this.size(id);
    let x = this.width * (0.16 + ((id * 0.61803398875 + 0.12) % 1) * 0.68);
    let y = this.height * (0.14 + ((id * 0.38196601125 + 0.28) % 1) * 0.72);
    let angle = this.range(0, Math.PI * 2);
    if (!this.reduced) {
      const inset = 24 + size * 0.12 + Math.floor(id / 4) * 8;
      const side = id % 4;
      if (side === 0) {
        x = -inset;
        angle = 0.18;
      }
      if (side === 1) {
        y = -inset;
        angle = Math.PI / 2 + 0.18;
      }
      if (side === 2) {
        x = this.width + inset;
        angle = Math.PI + 0.18;
      }
      if (side === 3) {
        y = this.height + inset;
        angle = -Math.PI / 2 + 0.18;
      }
    }
    const depth =
      [0.12, 0.58, 0.84, 0.3, 0.7, 0.2, 0.88, 0.42, 0.64, 0.16][id % 10] +
      this.range(-0.025, 0.025);
    const fish = {
      id,
      x,
      y,
      angle,
      speed: 18,
      length: size,
      phase: this.range(0, Math.PI * 2),
      depth,
      variant: id % 6,
      entering: !this.reduced,
      spine: Array.from({ length: 22 }, (_, j) => ({
        x: x - (Math.cos(angle) * size * j) / 21,
        y: y - (Math.sin(angle) * size * j) / 21,
      })),
    };
    this.paths.set(
      id,
      fish.spine.map((p) => ({ ...p })),
    );
    this.motion.set(id, {
      wander: this.range(-0.5, 0.5),
      drift: this.range(-0.35, 0.35),
      nextWander: this.time + this.range(0.7, 2.2),
      burstUntil: 0,
      nextBurst: this.time + this.range(0, 4),
      depthTarget: depth,
      nextDive: this.time + this.range(6, 16),
      nextWake: this.time + this.range(2, 8),
      startle: 0,
      flee: { x: 0, y: 0 },
      food: null,
    });
    return fish;
  }
  constructor() {
    this.reset();
  }
  reset() {
    this.rain.resize(this.width, this.height);
    this.rain.reset();
    this.time = 0;
    this.seed = 78217;
    this.ripples = [];
    this.pellets = [];
    this.droplets = [];
    this.cancel();
    this.paths.clear();
    this.motion.clear();
    this.fish = Array.from({ length: this.count() }, (_, id) =>
      this.makeFish(id),
    );
    this.nextDrip = this.range(3, 7);
  }
  resize(w: number, h: number) {
    if (!Number.isFinite(w + h) || w <= 0 || h <= 0) return;
    if (!this.fitted) {
      this.fitted = true;
      this.width = w;
      this.height = h;
      this.reset();
      return;
    }
    if (w === this.width && h === this.height) return;
    const sx = w / this.width,
      sy = h / this.height;
    this.rain.resize(w, h);
    this.width = w;
    this.height = h;
    this.cancel();
    for (const f of this.fish) {
      f.x *= sx;
      f.y *= sy;
      const old = f.length;
      f.length = this.size(f.id);
      for (const points of [f.spine, this.paths.get(f.id)!]) {
        const previousHead = { ...points[0] };
        for (const p of points) {
          p.x = f.x + ((p.x - previousHead.x) * f.length) / old;
          p.y = f.y + ((p.y - previousHead.y) * f.length) / old;
        }
      }
    }
    for (const p of [...this.pellets, ...this.ripples, ...this.droplets]) {
      p.x *= sx;
      p.y *= sy;
    }
  }
  setReduced(value: boolean) {
    if (value === this.reduced) return;
    this.reduced = value;
    this.cancel();
    this.ripples = [];
    this.pellets = [];
    this.droplets = [];
    this.rain.clear();
    for (const state of this.motion.values()) {
      state.food = null;
      state.startle = 0;
    }
  }
  cancel() {
    this.target = null;
    this.heldTime = 0;
    this.touchSpeed = 0;
    this.curious = null;
  }
  attend(x: number, y: number, held = true, speed = 0) {
    if (!Number.isFinite(x + y + speed)) return;
    x = clamp(x, 0, this.width);
    y = clamp(y, 0, this.height);
    if (!this.target || Math.hypot(x - this.target.x, y - this.target.y) > 8) {
      this.heldTime = 0;
      this.curious = null;
    }
    this.target = { x, y, held };
    this.touchSpeed = Math.max(0, speed);
    if (this.time - this.rippleTime > 0.15 || !this.ripples.length) {
      this.ripple(x, y, 0.25 + Math.min(speed / 900, 0.5));
      this.rippleTime = this.time;
    }
  }
  private ripple(x: number, y: number, strength: number) {
    if (this.ripples.length >= 12) this.ripples.shift();
    this.ripples.push({ x, y, age: 0, strength });
  }
  tap(x: number, y: number) {
    this.feed(x, y);
  }
  drip(x: number, y: number) {
    if (!Number.isFinite(x + y)) return;
    x = clamp(x, 2, this.width - 2);
    y = clamp(y, 2, this.height - 2);
    if (this.reduced) {
      this.ripple(x, y, 0.45);
      return;
    }
    if (this.droplets.length < 4) this.droplets.push({ x, y, age: 0 });
  }
  feed(x: number, y: number) {
    if (!Number.isFinite(x + y)) return;
    x = clamp(x, 0, this.width);
    y = clamp(y, 0, this.height);
    this.ripple(x, y, 0.45);
    if (this.reduced) return;
    const count = Math.min(
      24 - this.pellets.length,
      3 + Math.floor(this.random() * 3),
    );
    const inset = Math.min(18, this.width * 0.1, this.height * 0.1);
    for (let i = 0; i < count; i++) {
      const angle = this.range(0, Math.PI * 2),
        radius = this.range(3, 18),
        speed = this.range(1, 4);
      this.pellets.push({
        x: clamp(x + Math.cos(angle) * radius, inset, this.width - inset),
        y: clamp(y + Math.sin(angle) * radius, inset, this.height - inset),
        age: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      });
    }
  }
  get active() {
    return !this.reduced || this.ripples.length > 0;
  }
  step(elapsed: number) {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    const dt = Math.min(elapsed, 0.05);
    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < 1.8);
    if (this.reduced) return;
    this.time += dt;
    this.rain.step(dt);
    for (const drop of this.droplets) {
      const before = drop.age;
      drop.age += dt;
      if (before < 0.28 && drop.age >= 0.28) this.ripple(drop.x, drop.y, 0.42);
    }
    this.droplets = this.droplets.filter((drop) => drop.age < 0.7);
    if (this.time > this.nextDrip) {
      const x = this.range(0.08, 0.92) * this.width,
        y = this.range(0.1, 0.86) * this.height;
      this.drip(x, y);
      this.nextDrip = this.time + this.range(10, 18);
    }
    const foodInset = Math.min(18, this.width * 0.1, this.height * 0.1);
    for (const p of this.pellets) {
      p.age += dt;
      p.vx *= Math.exp(-dt * 0.4);
      p.vy *= Math.exp(-dt * 0.4);
      p.x = clamp(p.x + p.vx * dt, foodInset, this.width - foodInset);
      p.y = clamp(p.y + p.vy * dt, foodInset, this.height - foodInset);
    }
    this.pellets = this.pellets.filter((p) => p.age < 12);
    if (this.target) {
      this.heldTime += dt;
      if (!this.target.held && this.heldTime > 1.5) this.cancel();
      else if (
        this.target.held &&
        this.heldTime > 0.65 &&
        this.touchSpeed < 100 &&
        this.curious === null
      ) {
        const near = this.fish
          .filter(
            (f) =>
              Math.hypot(f.x - this.target!.x, f.y - this.target!.y) <
              f.length * 1.8,
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - this.target!.x, a.y - this.target!.y) -
              Math.hypot(b.x - this.target!.x, b.y - this.target!.y),
          );
        this.curious = near[0]?.id ?? null;
      }
      this.touchSpeed *= Math.exp(-dt * 4);
    }
    for (const f of this.fish) {
      const state = this.motion.get(f.id)!;
      if (this.time > state.nextWander) {
        state.drift = this.range(-0.55, 0.55);
        state.nextWander = this.time + this.range(0.6, 2.6);
      }
      state.wander = clamp(state.wander + state.drift * dt, -0.9, 0.9);
      let dx = Math.cos(f.angle) + 0.65 * Math.cos(f.angle + state.wander);
      let dy = Math.sin(f.angle) + 0.65 * Math.sin(f.angle + state.wander);
      if (state.food && !this.pellets.includes(state.food)) state.food = null;
      if (!state.food) {
        let nearest = f.length * 1.5 + 55;
        for (const p of this.pellets) {
          if (
            p.age < 0.22 ||
            Array.from(this.motion.values()).some(
              (s) => s !== state && s.food === p,
            )
          )
            continue;
          const distance = Math.hypot(p.x - f.x, p.y - f.y);
          if (distance < nearest) {
            nearest = distance;
            state.food = p;
          }
        }
      }
      const margin = Math.min(
        f.length * 0.8,
        this.width * 0.23,
        this.height * 0.23,
      );
      dx +=
        Math.max(0, 1 - f.x / margin) * 5 -
        Math.max(0, 1 - (this.width - f.x) / margin) * 5;
      dy +=
        Math.max(0, 1 - f.y / margin) * 5 -
        Math.max(0, 1 - (this.height - f.y) / margin) * 5;
      for (const box of this.avoid) {
        const pad = f.length * 0.45;
        if (
          f.x < box.left - pad ||
          f.x > box.right + pad ||
          f.y < box.top - pad ||
          f.y > box.bottom + pad
        )
          continue;
        const edges = [
          { distance: f.x - box.left, x: -1, y: 0 },
          { distance: box.right - f.x, x: 1, y: 0 },
          { distance: f.y - box.top, x: 0, y: -1 },
          { distance: box.bottom - f.y, x: 0, y: 1 },
        ];
        const nearest = edges.reduce((a, b) =>
          a.distance < b.distance ? a : b,
        );
        const strength = clamp((nearest.distance + pad) / pad, 0, 2) * 2.5;
        dx += nearest.x * strength;
        dy += nearest.y * strength;
      }
      for (const other of this.fish) {
        if (other === f) continue;
        if (
          Math.abs(other.x - f.x) > f.length * 2 ||
          Math.abs(other.y - f.y) > f.length * 2
        )
          continue;
        for (let j = 0; j < other.spine.length; j += 4) {
          const point = other.spine[j],
            ox = f.x - point.x,
            oy = f.y - point.y,
            d = Math.hypot(ox, oy) || 1;
          const space = (f.length + other.length) * (state.food ? 0.12 : 0.18);
          if (d < space) {
            dx += (ox / d) * (1 - d / space) * 1.3;
            dy += (oy / d) * (1 - d / space) * 1.3;
          }
        }
        if (
          !state.food &&
          Math.hypot(other.x - f.x, other.y - f.y) < f.length * 1.5
        ) {
          dx += Math.cos(other.angle) * 0.12;
          dy += Math.sin(other.angle) * 0.12;
        }
      }
      if (this.target) {
        const tx = this.target.x - f.x,
          ty = this.target.y - f.y,
          d = Math.hypot(tx, ty) || 1;
        if (!state.food && this.curious === f.id && d > f.length * 0.38) {
          dx += (tx / d) * 1.5;
          dy += (ty / d) * 1.5;
        }
        if (this.touchSpeed > 500 && d < f.length * 0.9) {
          state.startle = 1;
          state.flee = { x: this.target.x, y: this.target.y };
        }
      }
      state.startle = Math.max(0, state.startle - dt * 0.65);
      if (state.food) {
        const tx = state.food.x - f.x,
          ty = state.food.y - f.y,
          d = Math.hypot(tx, ty) || 1;
        dx += (tx / d) * 3;
        dy += (ty / d) * 3;
      } else if (state.startle > 0.1) {
        const tx = f.x - state.flee.x,
          ty = f.y - state.flee.y,
          d = Math.hypot(tx, ty) || 1;
        dx += (tx / d) * state.startle * 3;
        dy += (ty / d) * state.startle * 3;
      }
      const wanted = Math.atan2(dy, dx);
      const edge =
        Math.min(f.x, this.width - f.x, f.y, this.height - f.y) < margin;
      const maxTurn =
        Math.max(
          edge ? 1.1 : 0.35,
          Math.min(state.food ? 1.6 : 0.85, (f.speed / f.length) * 4),
        ) * dt;
      f.angle += clamp(angleDelta(f.angle, wanted), -maxTurn, maxTurn);
      if (this.time > state.nextBurst) {
        state.burstUntil = this.time + this.range(0.7, 1.6);
        state.nextBurst = state.burstUntil + this.range(1.5, 4.8);
      }
      const swimming =
        this.time < state.burstUntil || !!state.food || state.startle > 0.1;
      const cruise =
        (12 + f.length * 0.05) *
        (state.startle > 0.1 ? 1.9 : state.food ? 1.55 : swimming ? 1.2 : 0.48);
      f.speed +=
        (cruise - f.speed) * (1 - Math.exp(-dt * (swimming ? 1.6 : 0.38)));
      f.phase += dt * (1.1 + (f.speed / f.length) * 8);
      if (this.time > state.nextDive) {
        state.depthTarget = this.range(0.12, 0.75);
        state.nextDive = this.time + this.range(8, 20);
      }
      f.depth +=
        ((state.food ? 0.1 : state.depthTarget) - f.depth) *
        (1 - Math.exp(-dt * (state.food ? 0.8 : 0.15)));
      const nextX = f.x + Math.cos(f.angle) * f.speed * dt;
      const nextY = f.y + Math.sin(f.angle) * f.speed * dt;
      f.x = f.entering ? nextX : clamp(nextX, 2, this.width - 2);
      f.y = f.entering ? nextY : clamp(nextY, 2, this.height - 2);
      if (
        f.entering &&
        f.x >= 2 &&
        f.x <= this.width - 2 &&
        f.y >= 2 &&
        f.y <= this.height - 2
      )
        f.entering = false;
      if (
        state.food &&
        state.food.age > 0.22 &&
        Math.hypot(state.food.x - f.x, state.food.y - f.y) < f.length * 0.07 + 5
      ) {
        this.pellets.splice(this.pellets.indexOf(state.food), 1);
        state.food = null;
        this.ripple(f.x, f.y, 0.45);
      }
      if (this.time > state.nextWake) {
        if (f.depth < 0.3 && swimming)
          this.ripple(f.spine[17].x, f.spine[17].y, 0.15);
        state.nextWake = this.time + this.range(2, 5);
      }
      const path = this.paths.get(f.id)!;
      path[0].x = f.x;
      path[0].y = f.y;
      let direction = f.angle + Math.PI;
      for (let j = 1; j < path.length; j++) {
        const previous = path[j - 1],
          point = path[j];
        const next = Math.atan2(point.y - previous.y, point.x - previous.x);
        direction += clamp(angleDelta(direction, next), -0.18, 0.18);
        point.x = previous.x + (Math.cos(direction) * f.length) / 21;
        point.y = previous.y + (Math.sin(direction) * f.length) / 21;
      }
      f.spine[0].x = f.x;
      f.spine[0].y = f.y;
      const effort = clamp(f.speed / f.length, 0.06, 0.38);
      for (let j = 1; j < f.spine.length; j++) {
        const s = j / 21,
          previous = f.spine[j - 1],
          point = f.spine[j];
        const tangent = Math.atan2(
          path[j].y - path[j - 1].y,
          path[j].x - path[j - 1].x,
        );
        const envelope = Math.pow(Math.max(0, (s - 0.16) / 0.84), 1.35);
        const wave =
          Math.sin(f.phase - s * 5.4) * envelope * (0.1 + effort * 0.75);
        point.x = previous.x + (Math.cos(tangent + wave) * f.length) / 21;
        point.y = previous.y + (Math.sin(tangent + wave) * f.length) / 21;
      }
    }
  }
}
