export type RainMode = "off" | "drizzle" | "rain";
export function rainMode(value: unknown): RainMode {
  return value === "off" || value === "drizzle" || value === "rain"
    ? value
    : "rain";
}
export interface RainDrop {
  x: number;
  y: number;
  age: number;
  duration: number;
  height: number;
  drift: number;
  depth: number;
}
export interface RainImpact {
  x: number;
  y: number;
  age: number;
  life: number;
  strength: number;
  radius: number;
}

export class PondRain {
  width = 390;
  height = 844;
  mode: RainMode = "rain";
  drops: RainDrop[] = [];
  impacts: RainImpact[] = [];
  private seed = 619831;
  private debt = 0;

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private range(a: number, b: number) {
    return a + (b - a) * this.random();
  }
  resize(width: number, height: number) {
    if (!Number.isFinite(width + height) || width <= 0 || height <= 0) return;
    const sx = width / this.width,
      sy = height / this.height;
    for (const particle of [...this.drops, ...this.impacts]) {
      particle.x *= sx;
      particle.y *= sy;
    }
    this.width = width;
    this.height = height;
  }
  setMode(mode: RainMode) {
    if (mode !== "off" && mode !== "drizzle" && mode !== "rain") return;
    this.mode = mode;
    if (mode === "off") this.clear();
  }
  clear() {
    this.drops = [];
    this.impacts = [];
    this.debt = 0;
  }
  reset() {
    this.clear();
    this.seed = 619831;
  }

  private spawn(age: number) {
    if (this.drops.length >= 80) return;
    const depth = this.range(0.15, 1);
    this.drops.push({
      x: this.random() * this.width,
      y: this.random() * this.height,
      age,
      duration: this.range(0.25, 0.5),
      height: 25 + depth * 30,
      drift: this.range(6, 15),
      depth,
    });
  }
  step(elapsed: number) {
    if (this.mode === "off" || !Number.isFinite(elapsed) || elapsed <= 0)
      return;
    const dt = Math.min(elapsed, 0.05);
    for (const impact of this.impacts) {
      impact.age += dt;
      impact.radius = 1 + impact.age * 24;
    }
    this.impacts = this.impacts.filter((impact) => impact.age < impact.life);
    for (const drop of this.drops) {
      drop.age += dt;
      if (drop.age < drop.duration) continue;
      const age = drop.age - drop.duration;
      if (this.impacts.length >= 120) this.impacts.shift();
      this.impacts.push({
        x: drop.x,
        y: drop.y,
        age,
        life: 1 + drop.depth * 0.5,
        strength: 0.18 + drop.depth * 0.42,
        radius: 1 + age * 24,
      });
    }
    this.drops = this.drops.filter((drop) => drop.age < drop.duration);
    const area = this.width * this.height;
    const rate =
      Math.max(1, Math.min(90, (40 * area) / (390 * 844))) *
      (this.mode === "drizzle" ? 0.3 : 1);
    const previousDebt = this.debt;
    this.debt += rate * dt;
    const births = Math.floor(this.debt + 1e-10);
    this.debt = Math.max(0, this.debt - births);
    for (let i = 0; i < births; i++) {
      const timeWithinStep = (i + 1 - previousDebt) / rate;
      this.spawn(Math.max(0, dt - timeWithinStep));
    }
  }
}
