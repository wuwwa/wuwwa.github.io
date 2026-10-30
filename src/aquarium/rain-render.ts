import type { PondRain } from "./rain";
import { pondPalettes, type PondPalette } from "./palettes";

const TAU = Math.PI * 2;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function drawPondRain(
  c: CanvasRenderingContext2D,
  rain: PondRain,
  palette: PondPalette,
  spacing = 7,
  opacity = 1,
): void {
  const theme = pondPalettes[palette];
  const light = theme.light
    ? "241,241,217"
    : palette === "indigo"
      ? "191,209,224"
      : palette === "dusk"
        ? "220,212,190"
        : "197,220,207";
  const dark = theme.shadow;
  c.save();
  c.lineCap = "round";
  c.globalAlpha = 1;
  for (const impact of rain.impacts) {
    const progress = clamp(impact.age / impact.life, 0, 1),
      strength = clamp(impact.strength, 0, 1);
    const front = Math.max(0.6, impact.radius);
    const fade =
      ((1 - progress) ** 1.15 / Math.sqrt(1 + front * 0.045)) * opacity;
    if (fade < 0.006) continue;
    for (let wave = 0; wave < 3; wave++) {
      const radius = front - wave * spacing;
      if (radius <= 0.4) continue;
      const birth = clamp((radius - 0.4) / 2.5, 0, 1);
      const amplitude =
        fade * birth * [1, 0.62, 0.32][wave] * (0.15 + strength * 0.22);
      const diagonal = radius * 0.76;
      const slope = c.createLinearGradient(
        impact.x - diagonal,
        impact.y - diagonal,
        impact.x + diagonal,
        impact.y + diagonal,
      );
      slope.addColorStop(0, `rgba(${light},${amplitude})`);
      slope.addColorStop(0.26, `rgba(${light},${amplitude * 0.6})`);
      slope.addColorStop(0.45, `rgba(${light},0)`);
      slope.addColorStop(0.55, `${dark}00`);
      slope.addColorStop(
        0.76,
        `${dark}${Math.round(amplitude * 0.65 * 255)
          .toString(16)
          .padStart(2, "0")}`,
      );
      slope.addColorStop(
        1,
        `${dark}${Math.round(amplitude * 0.9 * 255)
          .toString(16)
          .padStart(2, "0")}`,
      );
      c.strokeStyle = slope;
      c.lineWidth = 0.65 + strength * 0.3;
      c.beginPath();
      c.arc(impact.x, impact.y, radius, 0, TAU);
      c.stroke();
      const underside = c.createLinearGradient(
        impact.x - diagonal,
        impact.y - diagonal,
        impact.x + diagonal,
        impact.y + diagonal,
      );
      underside.addColorStop(
        0,
        `${dark}${Math.round(amplitude * 0.55 * 255)
          .toString(16)
          .padStart(2, "0")}`,
      );
      underside.addColorStop(0.38, `${dark}00`);
      underside.addColorStop(0.62, `rgba(${light},0)`);
      underside.addColorStop(1, `rgba(${light},${amplitude * 0.38})`);
      c.strokeStyle = underside;
      c.lineWidth = 0.6;
      c.beginPath();
      c.arc(impact.x, impact.y, radius + 1.1, 0, TAU);
      c.stroke();
    }
    if (impact.age < 0.105) {
      const p = impact.age / 0.105,
        alpha = Math.sin(p * Math.PI) * (0.17 + strength * 0.2) * opacity;
      c.fillStyle = `rgba(${light},${alpha})`;
      c.beginPath();
      c.arc(impact.x, impact.y, 0.65 + strength * 0.55, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}
