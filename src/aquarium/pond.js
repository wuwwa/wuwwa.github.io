import { KoiPond } from "./model.ts";
import { PondRenderer } from "./render.ts";

export class AquariumPond {
  constructor(canvas, environment, onStats) {
    this.canvas = canvas;
    this.onStats = onStats;
    this.world = new KoiPond();
    this.world.rain.setMode("off");
    this.renderer = new PondRenderer(canvas);
    this.renderer.setPalette(environment);
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.visible = true;
    this.disposed = false;
    this.frame = 0;
    this.last = 0;
    this.elapsed = 0;
    this.grip = null;
    this.counts = "";
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.resizeObserver.observe(canvas);
    this.intersectionObserver.observe(canvas);
    this.reduced.addEventListener(
      "change",
      () => {
        this.world.setReduced(this.reduced.matches);
        this.schedule();
      },
      { signal },
    );
    document.addEventListener("visibilitychange", () => this.schedule(), {
      signal,
    });
    window.addEventListener("resize", () => this.resize(), { signal });
    window.addEventListener("blur", () => this.release(), { signal });
    document.documentElement.addEventListener(
      "pointerleave",
      () => this.release(),
      { signal },
    );
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.accepts(event) || event.button !== 0 || !event.isPrimary)
          return;
        const point = this.point(event);
        this.grip = {
          id: event.pointerId,
          ...point,
          started: performance.now(),
          moved: false,
        };
        this.world.attend(point.x, point.y);
      },
      { signal, passive: true },
    );
    window.addEventListener(
      "pointermove",
      (event) => {
        if (
          !this.accepts(event) ||
          (event.pointerType === "touch" && !this.grip)
        )
          return;
        if (this.grip && this.grip.id !== event.pointerId) return;
        const point = this.point(event),
          now = performance.now();
        const speed = this.previous
          ? Math.hypot(point.x - this.previous.x, point.y - this.previous.y) /
            Math.max(0.016, (now - this.previous.time) / 1000)
          : 0;
        this.previous = { ...point, time: now };
        if (this.grip)
          this.grip.moved ||=
            Math.hypot(point.x - this.grip.x, point.y - this.grip.y) > 8;
        this.world.attend(point.x, point.y, !!this.grip, Math.min(1600, speed));
      },
      { signal, passive: true },
    );
    window.addEventListener(
      "pointerup",
      (event) => {
        if (this.grip?.id !== event.pointerId) return;
        const point = this.point(event);
        if (
          this.accepts(event) &&
          !this.grip.moved &&
          performance.now() - this.grip.started < 350 &&
          Math.hypot(point.x - this.grip.x, point.y - this.grip.y) <= 8 &&
          !window.getSelection()?.toString()
        ) {
          this.world.tap(point.x, point.y);
          this.report();
        }
        this.release();
      },
      { signal },
    );
    window.addEventListener("pointercancel", () => this.release(), { signal });
    this.world.setReduced(this.reduced.matches);
    this.resize();
    this.schedule();
  }

  accepts(event) {
    return (
      this.visible &&
      !document.hidden &&
      !document.querySelector("main").inert &&
      !event
        .composedPath()
        .some(
          (node) =>
            node instanceof Element &&
            node.matches(
              "a,button,input,textarea,select,label,[role='button'],[data-koi-ignore]",
            ),
        )
    );
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  release() {
    this.grip = this.previous = null;
    this.world.cancel();
  }

  setTheme(environment) {
    this.renderer.setPalette(environment);
    this.draw();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (
      this.renderer.width === rect.width &&
      this.renderer.height === rect.height &&
      this.renderer.ratio === Math.min(2, window.devicePixelRatio || 1)
    )
      return;
    this.renderer.resize(rect.width, rect.height);
    this.world.resize(rect.width, rect.height);
    this.measureContent();
    this.draw();
  }

  measureContent() {
    const canvas = this.canvas.getBoundingClientRect();
    this.world.avoid = [...document.querySelectorAll("[data-koi-avoid]")]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        left: rect.left - canvas.left,
        right: rect.right - canvas.left,
        top: rect.top - canvas.top,
        bottom: rect.bottom - canvas.top,
      }));
  }

  report() {
    const koi = this.world.fish.length,
      pellets = this.world.pellets.length;
    if (this.counts === `${koi}:${pellets}`) return;
    this.counts = `${koi}:${pellets}`;
    this.onStats({ koi, pellets });
  }

  draw() {
    if (this.disposed) return;
    this.renderer.render(this.world);
    this.report();
    this.canvas.dataset.environment = this.renderer.palette;
    if (import.meta.env.DEV)
      this.canvas.dataset.pond = JSON.stringify({
        time: this.world.time,
        reduced: this.world.reduced,
        fish: this.world.fish.length,
        pellets: this.world.pellets.length,
        scheduled: !!this.frame,
      });
  }

  schedule() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.release();
    if (this.disposed || !this.visible || document.hidden) return;
    this.draw();
    if (this.reduced.matches) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  tick = (now) => {
    const dt = Math.min(0.04, (now - this.last) / 1000);
    this.last = now;
    this.world.step(dt);
    this.elapsed += dt;
    if (this.elapsed > 0.5) {
      this.measureContent();
      this.elapsed = 0;
    }
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.controller.abort();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.renderer.dispose();
  }
}
