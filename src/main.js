import { setupCitations } from "./citations.js";
import { KoiPond } from "./koi-pond.js";
import { AquariumPond } from "./aquarium/pond.js";
import { pondPalettes } from "./aquarium/palettes.ts";
import "./style.css";
import { setupProjects } from "./projects.js";

const themeButton = document.querySelector("#theme");
const mobileThemeButton = document.querySelector("#mobile-theme");
const mobileLayout = matchMedia("(max-width: 1023px)");
const classic = new URLSearchParams(location.search).get("pond") === "classic";
const environments = ["sand", "jade", "indigo", "slate", "dusk"];
let environment = document.body.dataset.environment || "sand";
let light = !matchMedia("(prefers-color-scheme: dark)").matches;
try {
  const savedTheme = localStorage.getItem("pond-theme");
  if (savedTheme) light = savedTheme === "light";
} catch {}
const Pond = classic ? KoiPond : AquariumPond;
const pond = new Pond(
  document.querySelector("#pond"),
  classic ? light : environment,
  ({ koi, pellets }) => {
    document.querySelector("#fish-count").textContent = koi;
    const count = document.querySelector("#food-count");
    count.textContent = pellets;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      count.getAnimations().forEach((animation) => animation.cancel());
      count.animate([{ opacity: 1 }, { opacity: 0.32 }], {
        duration: 600,
        easing: "cubic-bezier(0,0,.58,1)",
      });
    }
  },
  {
    palette:
      new URLSearchParams(location.search).get("pond-palette") === "original"
        ? "original"
        : "warm",
  },
);
const sun =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
const moon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M20 14.4A8.5 8.5 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4Z"/></svg>';
function applyTheme() {
  if (!classic) light = pondPalettes[environment].light;
  document.body.classList.toggle("dark", !light);
  document.body.dataset.environment = classic ? "classic" : environment;
  for (const button of [themeButton, mobileThemeButton]) {
    const next =
      environments[
        (environments.indexOf(environment) + 1) % environments.length
      ];
    button.innerHTML = classic
      ? light
        ? moon
        : sun
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M20 8a8.5 8.5 0 1 0 .3 7M20 3v5h-5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>';
    button.setAttribute(
      "aria-label",
      classic
        ? `Switch to ${light ? "dark" : "light"} mode`
        : `${pondPalettes[environment].name} pond. Switch to ${pondPalettes[next].name} pond`,
    );
    button.title = button.getAttribute("aria-label");
  }
  pond.setTheme(classic ? light : environment);
}
function toggleTheme() {
  if (classic) light = !light;
  else
    environment =
      environments[
        (environments.indexOf(environment) + 1) % environments.length
      ];
  try {
    if (classic) localStorage.setItem("pond-theme", light ? "light" : "dark");
    else localStorage.setItem("pond-environment", environment);
  } catch {}
  applyTheme();
  if (!classic && new URLSearchParams(location.search).has("water")) {
    const url = new URL(location.href);
    url.searchParams.set("water", environment);
    history.replaceState(history.state, "", url);
  }
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const button of [themeButton, mobileThemeButton]) {
      button.getAnimations().forEach((animation) => animation.cancel());
      button.animate(
        [
          { transform: "rotate(-90deg)", opacity: 0.3 },
          { transform: "rotate(0)", opacity: 1 },
        ],
        { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" },
      );
    }
  }
}
themeButton.addEventListener("click", toggleTheme);
mobileThemeButton.addEventListener("click", toggleTheme);
applyTheme();

const menuToggle = document.querySelector("#menu-toggle");
const mobileMenu = document.querySelector("#mobile-menu");
const main = document.querySelector("main");
let menuTimer;
let iconAnimation;
let iconVersion = 0;
const menuIcon = document.querySelector(".menu-icon");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function animateMenuIcon(open) {
  const version = ++iconVersion;
  iconAnimation?.cancel();
  const update = () => menuIcon.classList.toggle("shows-close", open);
  if (reducedMotion.matches) {
    update();
    return;
  }
  iconAnimation = menuIcon.animate(
    [
      { opacity: 1, transform: "rotate(0deg)" },
      { opacity: 0, transform: `rotate(${open ? -45 : 45}deg)` },
    ],
    { duration: 180, easing: "ease-in-out", fill: "both" },
  );
  iconAnimation.onfinish = () => {
    if (version !== iconVersion) return;
    update();
    iconAnimation = menuIcon.animate(
      [
        { opacity: 0, transform: `rotate(${open ? 45 : -45}deg)` },
        { opacity: 1, transform: "rotate(0deg)" },
      ],
      { duration: 180, easing: "ease-in-out", fill: "both" },
    );
  };
}
function setMenu(open) {
  clearTimeout(menuTimer);
  menuToggle.setAttribute("aria-expanded", String(open));
  animateMenuIcon(open);
  mobileMenu.inert = !open;
  main.inert = open || main.getAttribute("aria-hidden") === "true";
  const projectsView = document.querySelector("#projects");
  projectsView.inert =
    open || projectsView.getAttribute("aria-hidden") === "true";
  if (open) {
    mobileMenu.hidden = false;
    // Flush layout before opening.
    mobileMenu.getBoundingClientRect();
    mobileMenu.classList.add("is-open", "menu-entered");
  } else {
    mobileMenu.classList.remove("is-open");
    menuTimer = setTimeout(
      () => {
        mobileMenu.hidden = true;
        mobileMenu.classList.remove("menu-entered");
      },
      reducedMotion.matches ? 0 : 200,
    );
  }
}
menuToggle.addEventListener("click", () =>
  setMenu(menuToggle.getAttribute("aria-expanded") !== "true"),
);
mobileMenu
  .querySelectorAll('a[href="/"],a[href="/#projects"]')
  .forEach((link) => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (event) => {
  if (menuToggle.getAttribute("aria-expanded") !== "true") return;
  if (event.key === "Escape") {
    setMenu(false);
    menuToggle.focus();
  }
  if (event.key === "Tab") {
    const controls = [menuToggle, ...mobileMenu.querySelectorAll("a,button")];
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      menuToggle.focus();
    }
  }
});
mobileLayout.addEventListener("change", () => {
  setMenu(false);
  hideCard();
  pond.measureContent();
});

const hideCard = setupCitations(mobileLayout);
const disposeProjects = setupProjects(hideCard);
document.fonts.ready.then(() => pond.measureContent());
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    pond.destroy();
    disposeProjects();
  });
