function initialiseProfileNavigation() {
  const header = document.querySelector(".site-header");
  const navigation = header?.querySelector(".navigation");
  if (!navigation) return;

  const sections = Array.from(navigation.querySelectorAll('a[href^="#"]'))
    .map(link => ({
      link,
      section: document.getElementById(link.getAttribute("href").slice(1)),
    }))
    .filter(entry => entry.section);
  if (!sections.length) return;

  let currentLink;
  let updateQueued = false;

  function setCurrentLink(nextLink) {
    if (nextLink === currentLink) return;
    currentLink = nextLink;

    for (const { link } of sections) {
      if (link === nextLink) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  function updateNavigation() {
    updateQueued = false;

    const viewportHeight = window.innerHeight;
    const scrollingElement = document.scrollingElement || document.documentElement;
    const scrollTop = scrollingElement.scrollTop;
    const anchorPadding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const headerPosition = getComputedStyle(header).position;
    const headerOverlap = headerPosition === "sticky" || headerPosition === "fixed"
      ? Math.max(0, header.getBoundingClientRect().bottom)
      : 0;
    // Highlight the section entering the reading area below the pinned header.
    const readingTop = Math.max(anchorPadding, headerOverlap);
    const readingLine = Math.min(viewportHeight - 1, readingTop + Math.min(112, viewportHeight * 0.15));

    // A short final section may never reach the reading line before scrolling ends.
    const atPageEnd = scrollTop > 0
      && scrollTop + viewportHeight >= scrollingElement.scrollHeight - 2;
    const sectionLine = atPageEnd ? viewportHeight - 1 : readingLine;
    let nextLink = null;
    let nearestTop = -Infinity;
    for (const { link, section } of sections) {
      const { top, height } = section.getBoundingClientRect();
      if (height > 0 && top <= sectionLine && top > nearestTop) {
        nextLink = link;
        nearestTop = top;
      }
    }

    setCurrentLink(nextLink);
  }

  function scheduleUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    requestAnimationFrame(updateNavigation);
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("pageshow", scheduleUpdate);
  window.addEventListener("hashchange", scheduleUpdate);
  document.addEventListener("toggle", scheduleUpdate, { capture: true, passive: true });
  document.addEventListener("load", scheduleUpdate, { capture: true, passive: true });

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(document.documentElement);
    observer.observe(header);
    for (const { section } of sections) observer.observe(section);
  }

  document.fonts?.ready.then(scheduleUpdate);
  scheduleUpdate();
}

initialiseProfileNavigation();
