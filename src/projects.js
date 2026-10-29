import "./projects.css";
import { projects } from "./data/projects.js";
import { mountOrb } from "./mel/thumbnail-orb.js";

export function setupProjects(hideCard) {
  const section = document.querySelector("#projects");
  const main = document.querySelector("main");
  const pond = document.querySelector("#pond");
  const rail = section.querySelector(".project-rail");
  const cards = [...section.querySelectorAll(".project")];
  const previous = section.querySelector(".previous-project");
  const next = section.querySelector(".next-project");
  const indexButtons = [...section.querySelectorAll("[data-go]")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const orb = section.querySelector(".mel-orb");
  const disposeOrb = mountOrb(orb, { active: () => !section.hidden });
  const controller = new AbortController();
  const signal = controller.signal;
  let current = 0,
    drag,
    suppressClick = false,
    motionFrame = 0,
    requestedIndex,
    shown,
    viewVersion = 0,
    viewAnimations = [];

  function offset(index) {
    return cards[index].offsetLeft - cards[0].offsetLeft;
  }
  function bounded(left) {
    return Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, left));
  }
  function stopMotion() {
    const wasNavigating = requestedIndex !== undefined;
    cancelAnimationFrame(motionFrame);
    motionFrame = 0;
    requestedIndex = undefined;
    if (wasNavigating && !section.hidden) update();
  }
  function goTo(index, behavior = "smooth") {
    const i = Math.max(0, Math.min(cards.length - 1, index));
    stopMotion();
    const start = rail.scrollLeft;
    const destination = bounded(offset(i));
    if (reduced.matches || behavior === "instant") {
      rail.scrollLeft = destination;
      update();
      return;
    }
    requestedIndex = i;
    update();
    const started = performance.now();
    function step(now) {
      const progress = Math.min(1, (now - started) / 300);
      rail.scrollLeft =
        start + (destination - start) * (1 - (1 - progress) ** 3);
      if (progress < 1) motionFrame = requestAnimationFrame(step);
      else {
        motionFrame = 0;
        requestedIndex = undefined;
        update();
      }
    }
    motionFrame = requestAnimationFrame(step);
  }
  function coast(velocity) {
    stopMotion();
    if (reduced.matches || Math.abs(velocity) < 0.05) return;
    // Exponential swipe decay.
    let speed = Math.max(-2, Math.min(2, velocity));
    let last = performance.now();
    function step(now) {
      const elapsed = Math.min(40, now - last);
      last = now;
      const decay = Math.exp(-elapsed / 220);
      const next = bounded(rail.scrollLeft + speed * 220 * (1 - decay));
      const before = rail.scrollLeft;
      rail.scrollLeft = next;
      speed *= decay;
      if (Math.abs(speed) > 0.03 && Math.abs(rail.scrollLeft - before) > 0.1)
        motionFrame = requestAnimationFrame(step);
      else motionFrame = 0;
    }
    motionFrame = requestAnimationFrame(step);
  }
  function update() {
    current = cards.reduce(
      (best, card, i) =>
        Math.abs(offset(i) - rail.scrollLeft) <
        Math.abs(offset(best) - rail.scrollLeft)
          ? i
          : best,
      0,
    );
    indexButtons.forEach((b, i) =>
      b.setAttribute("aria-pressed", String(i === current)),
    );
    previous.disabled = (requestedIndex ?? current) === 0;
    next.disabled = (requestedIndex ?? current) === cards.length - 1;
    orb.dispatchEvent(new Event("orb-resume"));
  }
  previous.addEventListener(
    "click",
    () => goTo((requestedIndex ?? current) - 1),
    { signal },
  );
  next.addEventListener("click", () => goTo((requestedIndex ?? current) + 1), {
    signal,
  });
  indexButtons.forEach((b, i) =>
    b.addEventListener("click", () => goTo(i), { signal }),
  );
  rail.addEventListener("scroll", update, { passive: true, signal });
  section.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(
          (requestedIndex ?? current) + (event.key === "ArrowRight" ? 1 : -1),
        );
      }
    },
    { signal },
  );

  // Map vertical wheel input to the horizontal rail.
  section.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || event.metaKey || drag?.moved) return;
      const amount =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (!amount) return;
      stopMotion();
      // Keep native trackpad momentum.
      if (
        Math.abs(event.deltaX) > Math.abs(event.deltaY) &&
        rail.contains(event.target)
      )
        return;
      event.preventDefault();
      rail.scrollLeft = bounded(
        rail.scrollLeft +
          amount *
            (event.deltaMode === 1
              ? 16
              : event.deltaMode === 2
                ? rail.clientWidth
                : 1),
      );
    },
    { passive: false, signal },
  );

  section.addEventListener(
    "pointerdown",
    (event) => {
      suppressClick = false;
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        event.target.closest("button")
      )
        return;
      stopMotion();
      drag = {
        id: event.pointerId,
        pointerType: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        left: rail.scrollLeft,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
        moved: false,
      };
    },
    { signal },
  );
  window.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      if (!drag.moved && Math.abs(dy) > 7 && Math.abs(dy) >= Math.abs(dx)) {
        drag = undefined;
        return;
      }
      if (!drag.moved && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
        drag.moved = true;
        section.classList.add("is-dragging");
        section.setPointerCapture(event.pointerId);
      }
      if (!drag.moved) return;
      event.preventDefault();
      const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
      const velocity = (drag.lastX - event.clientX) / elapsed;
      const weight = 1 - Math.exp(-elapsed / 40);
      drag.velocity += (velocity - drag.velocity) * weight;
      drag.lastX = event.clientX;
      drag.lastTime = event.timeStamp;
      rail.scrollLeft = bounded(drag.left - dx);
    },
    { passive: false, signal },
  );
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const finished = drag;
    drag = undefined;
    suppressClick = finished.moved;
    section.classList.remove("is-dragging");
    if (section.hasPointerCapture(event.pointerId))
      section.releasePointerCapture(event.pointerId);
    if (finished.moved && event.type !== "pointercancel") {
      if (
        finished.pointerType === "touch" &&
        event.timeStamp - finished.lastTime < 80
      )
        coast(finished.velocity);
    }
  }
  window.addEventListener("pointerup", endDrag, { signal });
  window.addEventListener("pointercancel", endDrag, { signal });
  section.addEventListener(
    "click",
    (event) => {
      if (suppressClick && event.detail !== 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
      }
    },
    { capture: true, signal },
  );
  section.addEventListener("dragstart", (event) => event.preventDefault(), {
    signal,
  });

  function finishView() {
    main.hidden = shown;
    section.hidden = !shown;
    document.body.classList.remove("is-switching");
    viewAnimations.forEach((animation) => animation.cancel());
    viewAnimations = [];
    if (shown) update();
  }
  function route() {
    // Redirect old project bookmarks.
    const legacy = projects.find((p) => location.hash === `#project/${p.id}`);
    if (legacy) {
      location.replace(legacy.site);
      return;
    }
    const show = location.hash === "#projects";
    if (show === shown) return;
    const initial = shown === undefined;
    shown = show;
    stopMotion();
    if (drag) endDrag({ pointerId: drag.id, type: "pointercancel" });
    hideCard();
    const version = ++viewVersion;
    const incoming = show ? section : main;
    const outgoing = show ? main : section;
    // Capture current styles before cancelling an interrupted transition.
    const starts = new Map(
      [main, section, pond].map((element) => {
        const style = getComputedStyle(element);
        return [
          element,
          {
            visible: style.display !== "none",
            opacity: style.opacity,
            transform: style.transform,
          },
        ];
      }),
    );
    viewAnimations.forEach((animation) => animation.cancel());
    viewAnimations = [];
    const menuOpen =
      document.querySelector("#menu-toggle").getAttribute("aria-expanded") ===
      "true";
    outgoing.inert = true;
    outgoing.setAttribute("aria-hidden", "true");
    incoming.inert = menuOpen;
    incoming.removeAttribute("aria-hidden");
    const moveFocus = !menuOpen && outgoing.contains(document.activeElement);
    if (!initial)
      document.body.classList.add("has-view-transition", "is-switching");
    document.body.classList.toggle("view-projects", show);
    document.title = show ? "Projects · Wilson Wu" : "Wilson Wu";
    document
      .querySelectorAll(".desktop-nav a,.mobile-menu-links a")
      .forEach((link) => {
        if (link.getAttribute("href") === (show ? "/#projects" : "/"))
          link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    if (initial || reduced.matches || document.hidden) {
      finishView();
      if (moveFocus) incoming.focus({ preventScroll: true });
      return;
    }
    main.hidden = false;
    section.hidden = false;
    if (moveFocus) incoming.focus({ preventScroll: true });
    const direction = show ? 1 : -1;
    for (const element of [outgoing, incoming, pond]) {
      const start = starts.get(element);
      const isPond = element === pond;
      const arriving = element === incoming || (isPond && !show);
      const fromTransform = isPond
        ? "none"
        : start.visible
          ? start.transform
          : `translateX(${direction * 24}px)`;
      const toTransform = isPond
        ? "none"
        : arriving
          ? "translateX(0)"
          : `translateX(${-direction * 16}px)`;
      viewAnimations.push(
        element.animate(
          [
            {
              opacity: start.visible ? start.opacity : 0,
              transform: fromTransform,
            },
            { opacity: arriving ? 1 : 0, transform: toTransform },
          ],
          {
            duration: arriving ? 240 : 120,
            delay: arriving ? 80 : 0,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          },
        ),
      );
    }
    if (show) update();
    Promise.allSettled(
      viewAnimations.map((animation) => animation.finished),
    ).then(() => {
      if (version === viewVersion) finishView();
    });
  }
  document
    .querySelectorAll(
      '.desktop-nav a[href="/"],.desktop-nav a[href="/#projects"],.mobile-menu-links a[href="/"],.mobile-menu-links a[href="/#projects"]',
    )
    .forEach((link) => {
      link.addEventListener(
        "click",
        (event) => {
          if (
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          const destination = link.getAttribute("href");
          if (location.pathname + location.hash !== destination)
            history.pushState(null, "", destination);
          route();
        },
        { signal },
      );
    });
  window.addEventListener("hashchange", route, { signal });
  window.addEventListener("popstate", route, { signal });
  window.addEventListener(
    "resize",
    () => {
      stopMotion();
      if (!section.hidden) goTo(current, "instant");
    },
    { signal },
  );
  reduced.addEventListener(
    "change",
    () => {
      stopMotion();
      if (reduced.matches) {
        ++viewVersion;
        finishView();
      }
    },
    { signal },
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        stopMotion();
        ++viewVersion;
        finishView();
      }
    },
    { signal },
  );
  window.addEventListener(
    "blur",
    () => {
      stopMotion();
      if (drag) endDrag({ pointerId: drag.id, type: "pointercancel" });
    },
    { signal },
  );
  route();
  return () => {
    controller.abort();
    stopMotion();
    ++viewVersion;
    finishView();
    disposeOrb();
  };
}
