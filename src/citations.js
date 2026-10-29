const sources = {
  northrop: {
    name: "Northrop Grumman",
    date: "2025–present",
    role: "Associate Software Engineer",
    summary:
      "Cloud engineering for DAF CLOUDworks; software assessment for the 16th Air Force.",
    href: "https://www.northropgrumman.com/",
  },
  doj: {
    name: "U.S. Department of Justice",
    date: "2024–2025",
    role: "IT Specialist",
    summary: "Infrastructure and automation supporting 500+ users.",
    href: "https://www.justice.gov/",
  },
};

export function setupCitations(mobileLayout) {
  const card = document.querySelector("#citation-card");
  const intro = document.querySelector(".intro");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let showTimer, hideTimer, animation, activeLink;
  function clearTimers() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  }
  function clearActive() {
    activeLink?.removeAttribute("data-cited-open");
    activeLink?.removeAttribute("aria-controls");
    intro.classList.remove("citation-active");
    activeLink = null;
  }
  function hide(immediate = false) {
    clearTimers();
    animation?.cancel();
    clearActive();
    card.inert = true;
    if (card.hidden || immediate || reduced.matches) {
      card.hidden = true;
      return;
    }
    animation = card.animate(
      [
        { opacity: 1, transform: "translateY(0) scale(1)" },
        { opacity: 0, transform: "translateY(2px) scale(.99)" },
      ],
      { duration: 80, easing: "ease-in", fill: "both" },
    );
    animation.onfinish = () => {
      card.hidden = true;
      animation.cancel();
    };
  }
  function scheduleHide() {
    if (mobileLayout.matches) return;
    clearTimers();
    hideTimer = setTimeout(() => hide(), 30);
  }
  function metadata(source) {
    return `<span class="meta"><span class="company">${source.name}</span><span class="dates">${source.date}</span></span>`;
  }
  function show(link) {
    clearTimers();
    animation?.cancel();
    clearActive();
    activeLink = link;
    link.setAttribute("data-cited-open", "true");
    link.setAttribute("aria-controls", "citation-card");
    intro.classList.add("citation-active");
    const source = sources[link.dataset.source];
    card.innerHTML = `<a class="citation-single" href="${source.href}" target="_blank" rel="noopener noreferrer"><span class="citation-content">${metadata(source)}<span class="role">${source.role}</span><span class="summary">${source.summary}</span></span><span class="foot">open site<span>↗</span></span></a>`;
    card.hidden = false;
    card.inert = false;
    const box = link.getBoundingClientRect();
    card.style.left = `${Math.max(16, Math.min(box.left, innerWidth - card.offsetWidth - 16))}px`;
    card.style.top = `${Math.max(16, box.top - card.offsetHeight - 10)}px`;
    animation = card.animate(
      [
        { opacity: 0, transform: "translateY(4px) scale(.98)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      {
        duration: reduced.matches ? 0 : 120,
        easing: "cubic-bezier(0,0,.58,1)",
        fill: "both",
      },
    );
  }
  document.querySelectorAll(".citation").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    function scheduleShow() {
      clearTimers();
      if (!mobileLayout.matches) showTimer = setTimeout(() => show(link), 55);
    }
    link.addEventListener("pointerenter", scheduleShow);
    link.addEventListener("focus", scheduleShow);
    link.addEventListener("pointerleave", scheduleHide);
    link.addEventListener("blur", scheduleHide);
    link.addEventListener("click", (event) => {
      if (mobileLayout.matches) {
        event.preventDefault();
        if (activeLink === link) hide(true);
        else show(link);
      } else hide(true);
    });
    link.addEventListener("keydown", (event) => {
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !card.hidden &&
        activeLink === link
      ) {
        event.preventDefault();
        card.querySelector("a")?.focus();
      }
    });
  });
  card.addEventListener("pointerenter", clearTimers);
  card.addEventListener("pointerleave", scheduleHide);
  card.addEventListener("focusin", clearTimers);
  card.addEventListener("focusout", (event) => {
    if (!card.contains(event.relatedTarget)) scheduleHide();
  });
  card.addEventListener("click", () => hide(true));
  document.addEventListener("pointerdown", (event) => {
    if (!card.contains(event.target) && !event.target.closest(".citation"))
      hide(true);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  window.addEventListener("resize", () => hide(true));
  return () => hide(true);
}
