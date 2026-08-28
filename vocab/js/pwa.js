export function setupPwa({ installButton, updateBanner, applyUpdateButton, beforeApplyUpdate }) {
  let installPrompt = null;
  let refreshing = false;
  let waitingWorker = null;
  let updateAccepted = false;

  if (installButton) {
    installButton.addEventListener("click", async () => {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        installButton.textContent = "已处理安装";
      } else {
        installButton.textContent = "请用浏览器菜单安装";
        installButton.setAttribute("title", "Chrome / Edge：浏览器菜单 → 安装此应用");
      }
    });
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      installPrompt = event;
      installButton.hidden = false;
      installButton.textContent = "安装应用";
    });
    window.addEventListener("appinstalled", () => {
      installPrompt = null;
      installButton.textContent = "已安装";
    });
  }

  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // A first-time install may claim this page. Reload only after the user
    // explicitly accepts an update so initial typing and focus are preserved.
    if (!updateAccepted || refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  const showUpdate = (worker) => {
    waitingWorker = worker;
    if (updateBanner) updateBanner.hidden = false;
  };
  navigator.serviceWorker.register("sw.js", { scope: "./", updateViaCache: "none" })
    .then((registration) => {
      if (registration.waiting) showUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });
      window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    })
    .catch(() => {
      // The app remains usable when Service Worker registration is unavailable.
    });
  applyUpdateButton?.addEventListener("click", async () => {
    if (!waitingWorker) return;
    try {
      if (beforeApplyUpdate) await beforeApplyUpdate();
    } catch {
      applyUpdateButton.textContent = "草稿保存失败，暂不更新";
      return;
    }
    updateAccepted = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });
}
