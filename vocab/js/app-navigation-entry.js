import { navigationHref, readPublicNavigationContext } from "./app-navigation.js?v=107";

const installed = new WeakMap();
const LINKS = [
  ".app-primary-nav a[href]", ".app-header .brand[href]", ".app-header .personal-brand[href]",
  ".app-footer a[href]", ".guide-footer-nav a[href]", "#member-github-owner-link[href]", "#member-standard-login-link[href]"
].join(",");

/** Independent shell enhancement: no app state, storage, commands or history hooks. */
export function setupAppNavigation({ document = globalThis.document, location = globalThis.location,
  window = document?.defaultView } = {}) {
  if (!document || !location || installed.has(document)) return installed.get(document) || null;
  let retainedContext = readPublicNavigationContext(location.href);
  const refreshLink = link => {
    const href = link.getAttribute("href");
    const currentContext = readPublicNavigationContext(location.href);
    if (Object.keys(currentContext).length) retainedContext = currentContext;
    if (href) link.setAttribute("href", navigationHref(href, location.href, retainedContext));
  };
  const refresh = () => document.querySelectorAll(LINKS).forEach(refreshLink);
  // Reading location at activation catches chapter/sort replaceState changes.
  const onClick = event => {
    const link = event.target?.closest?.("a[href]");
    if (link?.matches(LINKS)) refreshLink(link);
  };
  // Keyboard activation dispatches click; auxclick also covers middle-button tabs.
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
  const header = document.querySelector(".app-header");
  const measureHeader = () => {
    if (!header) return;
    const height = header.getBoundingClientRect().height;
    if (Number.isFinite(height) && height > 0) {
      document.documentElement.style.setProperty("--app-header-clearance", `${Math.ceil(height) + 12}px`);
    }
  };
  let observer = null;
  if (header && window?.ResizeObserver) {
    observer = new window.ResizeObserver(measureHeader);
    observer.observe(header);
  }
  if (header) window?.addEventListener("resize", measureHeader);
  // Install capture before the application's deferred import graph is ready,
  // then repair any hrefs assigned by that application during initialization.
  const onReady = () => { refresh(); measureHeader(); };
  if (["loading", "interactive"].includes(document.readyState)) {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
    window?.addEventListener("load", onReady, { once: true });
  }
  const controller = { refresh, destroy() {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("auxclick", onClick, true);
    window?.removeEventListener("resize", measureHeader);
    document.removeEventListener("DOMContentLoaded", onReady);
    window?.removeEventListener("load", onReady);
    observer?.disconnect();
    installed.delete(document);
  } };
  installed.set(document, controller);
  refresh();
  measureHeader();
  return controller;
}

if (globalThis.document && globalThis.location) setupAppNavigation();
