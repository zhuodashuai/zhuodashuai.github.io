import "./dictionary-app-v109.js";
import { setupPwa } from "./pwa.js?v=77";
import { installDictionaryOfflineWarm } from "./dictionary-offline-warm-v108.js";

// Keep the reusable lookup controller's dependency graph unchanged. Only the
// standalone dictionary entry point installs the offline shell; lookup itself
// neither waits for activation nor reloads an in-progress query on update.
if (typeof document !== "undefined" && typeof window !== "undefined" && document.body?.dataset.page === "dictionary") {
  installDictionaryOfflineWarm();
  setupPwa({
    updateBanner: document.getElementById("update-banner"),
    applyUpdateButton: document.getElementById("apply-update")
  });
}
