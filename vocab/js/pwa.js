export function setupPwa({ installButton, updateBanner, applyUpdateButton, beforeApplyUpdate }) {
  let installPrompt = null;
  let refreshing = false;
  let waitingWorker = null;
  let updateAccepted = false;
  let reloadBlocked = false;
  let reloadTask = null;

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
  const reloadAfterFinalSave = () => {
    if (!updateAccepted || refreshing || reloadBlocked) return reloadTask;
    if (reloadTask) return reloadTask;
    reloadTask = (async () => {
      try {
        // The owner may keep typing after accepting the update but before the
        // new worker takes control. Flush again at the actual reload boundary
        // so those last edits are not lost.
        if (beforeApplyUpdate) await beforeApplyUpdate();
      } catch {
        reloadBlocked = true;
        if (applyUpdateButton) {
          applyUpdateButton.disabled = false;
          applyUpdateButton.textContent = "草稿再次保存失败，新版本暂不刷新";
        }
        return;
      }
      if (!updateAccepted || refreshing || reloadBlocked) return;
      refreshing = true;
      window.location.reload();
    })().finally(() => {
      reloadTask = null;
    });
    return reloadTask;
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // A first-time install may claim this page. Reload only after the user
    // explicitly accepts an update so initial typing and focus are preserved.
    void reloadAfterFinalSave();
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
    if (!waitingWorker || refreshing || reloadTask || (updateAccepted && !reloadBlocked)) return;
    updateAccepted = false;
    reloadBlocked = false;
    try {
      if (beforeApplyUpdate) await beforeApplyUpdate();
    } catch {
      reloadBlocked = true;
      applyUpdateButton.textContent = "草稿保存失败，暂不更新";
      return;
    }
    updateAccepted = true;
    try {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      updateAccepted = false;
      reloadBlocked = true;
      applyUpdateButton.textContent = "新版本启用失败，请稍后重试";
      return;
    }
    // controllerchange is the normal path, but older/stale worker graphs have
    // occasionally failed to deliver it after the user clicked “立即更新”. A
    // bounded reload keeps that button effective without introducing reloads
    // during first install or before a draft has been flushed safely.
    window.setTimeout?.(() => {
      void reloadAfterFinalSave();
    }, 2_000);
  });
}
