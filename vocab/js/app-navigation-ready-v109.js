import { setupAppNavigation } from "./app-navigation-entry.js?v=107";

const PENDING_TARGETS = [".app-header[data-app-navigation-pending]",
  "#member-github-owner-link[data-app-navigation-pending]",
  "#member-standard-login-link[data-app-navigation-pending]"].join(",");

// A fresh personal document must not activate fallback header URLs before the
// unchanged navigation107 capture and context refresh have actually installed.
export function readyAppNavigation({ document = globalThis.document, location = globalThis.location,
  window = document?.defaultView } = {}) {
  const controller = setupAppNavigation({ document, location, window });
  if (!controller) return null;
  controller.refresh();
  document.querySelectorAll(PENDING_TARGETS).forEach(target => {
    target.removeAttribute("inert");
    target.removeAttribute("data-app-navigation-pending");
  });
  return controller;
}

if (globalThis.document && globalThis.location) readyAppNavigation();
