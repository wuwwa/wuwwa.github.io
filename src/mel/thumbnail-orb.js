import {
  buildGL,
  deleteGL,
  renderGL,
  genPalette,
  rgb01,
  GL_OPTS,
} from "./orb-paint.ts";
const warm = { color: "#e8a23c", energy: 0.45 };
export function mountOrb(
  canvas,
  { active = () => true, mood = () => warm, level = () => 0 } = {},
) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const gl = canvas.getContext("webgl2", GL_OPTS);
  const state = gl && buildGL(gl);
  if (!state) {
    canvas.classList.add("orb-fallback");
    return () => {};
  }
  let visible = false,
    raf = 0,
    disposed = false,
    last = 0;
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  });
  observer.observe(canvas);
  function draw(now) {
    raf = 0;
    if (disposed || !visible || document.hidden || !active()) return;
    if (now - last >= 32 || reduced.matches) {
      last = now;
      const size = Math.round(
        Math.min(
          540,
          Math.max(1, canvas.clientWidth) * Math.min(1.5, devicePixelRatio),
        ),
      );
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      const m = mood(),
        volume = level();
      renderGL(
        state,
        size,
        size,
        reduced.matches ? 0 : now / 1000,
        volume,
        0.24 + volume * 0.6,
        m.energy,
        volume > 0.005 ? 1 : 0,
        genPalette(rgb01(m.color)),
      );
    }
    if (!reduced.matches) schedule();
  }
  function schedule() {
    if (!disposed && !raf && visible && !document.hidden && active())
      raf = requestAnimationFrame(draw);
  }
  const visibility = () => {
    if (!document.hidden) schedule();
  };
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("orb-resume", schedule);
  reduced.addEventListener("change", schedule);
  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    canvas.removeEventListener("orb-resume", schedule);
    reduced.removeEventListener("change", schedule);
    deleteGL(state);
  };
}
