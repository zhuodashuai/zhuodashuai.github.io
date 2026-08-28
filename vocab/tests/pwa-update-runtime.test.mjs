import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { setupPwa } from "../js/pwa.js";

class FakeEventTarget {
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) await listener(event);
  }
}

async function withBrowserGlobals(callback) {
  const previousWindow = globalThis.window;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    return await callback();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  }
}

test("a waiting Service Worker updates only after draft flush and explicit user acceptance", async () => {
  await withBrowserGlobals(async () => {
    const serviceWorker = new FakeEventTarget();
    serviceWorker.controller = {};
    const registration = new FakeEventTarget();
    const waitingWorker = { messages: [], postMessage(message) { this.messages.push(message); } };
    registration.waiting = waitingWorker;
    registration.installing = null;
    registration.update = async () => {};
    serviceWorker.register = async () => registration;

    let reloads = 0;
    globalThis.window = Object.assign(new FakeEventTarget(), {
      location: { reload: () => { reloads += 1; } },
      setInterval: () => 1
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker } });

    const updateBanner = { hidden: true };
    const applyUpdateButton = new FakeEventTarget();
    applyUpdateButton.textContent = "立即更新";
    let draftFlushes = 0;
    setupPwa({
      installButton: null,
      updateBanner,
      applyUpdateButton,
      beforeApplyUpdate: async () => { draftFlushes += 1; }
    });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(updateBanner.hidden, false, "a stale waiting worker must be visible to the user");
    await serviceWorker.dispatch("controllerchange");
    assert.equal(reloads, 0, "first install or an unaccepted update must not reload the editor");

    await applyUpdateButton.dispatch("click");
    assert.equal(draftFlushes, 1);
    assert.deepEqual(waitingWorker.messages, [{ type: "SKIP_WAITING" }]);
    await serviceWorker.dispatch("controllerchange");
    await Promise.resolve();
    assert.equal(draftFlushes, 2, "controller change must flush edits made after accepting the update");
    assert.equal(reloads, 1);
  });
});

test("the public reader activates a waiting Service Worker automatically and reloads exactly once", async () => {
  await withBrowserGlobals(async () => {
    const serviceWorker = new FakeEventTarget();
    serviceWorker.controller = {};
    const registration = new FakeEventTarget();
    const waitingWorker = { messages: [], postMessage(message) { this.messages.push(message); } };
    registration.waiting = waitingWorker;
    registration.installing = null;
    registration.update = async () => {};
    serviceWorker.register = async () => registration;

    let reloads = 0;
    globalThis.window = Object.assign(new FakeEventTarget(), {
      location: { reload: () => { reloads += 1; } },
      setInterval: () => 1,
      setTimeout: () => 1
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker } });

    setupPwa({
      installButton: null,
      updateBanner: { hidden: true },
      applyUpdateButton: null,
      autoApplyUpdate: true
    });
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(waitingWorker.messages, [{ type: "SKIP_WAITING" }]);
    assert.equal(reloads, 0, "activation must finish before the reader reloads");
    await serviceWorker.dispatch("controllerchange");
    await Promise.resolve();
    assert.equal(reloads, 1);
    await serviceWorker.dispatch("controllerchange");
    assert.equal(reloads, 1, "duplicate controllerchange events must not reload twice");
  });
});

test("public auto-update never reloads for a first install that has no waiting update", async () => {
  await withBrowserGlobals(async () => {
    const serviceWorker = new FakeEventTarget();
    serviceWorker.controller = null;
    const registration = new FakeEventTarget();
    registration.waiting = null;
    registration.installing = null;
    registration.update = async () => {};
    serviceWorker.register = async () => registration;
    let reloads = 0;
    globalThis.window = Object.assign(new FakeEventTarget(), {
      location: { reload: () => { reloads += 1; } },
      setInterval: () => 1,
      setTimeout: () => 1
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker } });

    setupPwa({
      installButton: null,
      updateBanner: { hidden: true },
      applyUpdateButton: null,
      autoApplyUpdate: true
    });
    await Promise.resolve();
    await Promise.resolve();
    await serviceWorker.dispatch("controllerchange");
    await Promise.resolve();
    assert.equal(reloads, 0);
  });
});

test("a failed draft flush prevents Service Worker activation", async () => {
  await withBrowserGlobals(async () => {
    const serviceWorker = new FakeEventTarget();
    serviceWorker.controller = {};
    const registration = new FakeEventTarget();
    const waitingWorker = { messages: [], postMessage(message) { this.messages.push(message); } };
    registration.waiting = waitingWorker;
    registration.installing = null;
    registration.update = async () => {};
    serviceWorker.register = async () => registration;
    globalThis.window = Object.assign(new FakeEventTarget(), {
      location: { reload: () => assert.fail("must not reload") },
      setInterval: () => 1
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker } });

    const applyUpdateButton = new FakeEventTarget();
    applyUpdateButton.textContent = "立即更新";
    setupPwa({
      installButton: null,
      updateBanner: { hidden: true },
      applyUpdateButton,
      beforeApplyUpdate: async () => { throw new Error("IndexedDB write failed"); }
    });
    await Promise.resolve();
    await Promise.resolve();

    await applyUpdateButton.dispatch("click");
    assert.deepEqual(waitingWorker.messages, []);
    assert.equal(applyUpdateButton.textContent, "草稿保存失败，暂不更新");
  });
});

test("an accepted update reloads through a bounded fallback when controllerchange is missed", async () => {
  await withBrowserGlobals(async () => {
    const serviceWorker = new FakeEventTarget();
    serviceWorker.controller = {};
    const registration = new FakeEventTarget();
    const waitingWorker = { messages: [], postMessage(message) { this.messages.push(message); } };
    registration.waiting = waitingWorker;
    registration.installing = null;
    registration.update = async () => {};
    serviceWorker.register = async () => registration;

    let reloads = 0;
    let fallback = null;
    globalThis.window = Object.assign(new FakeEventTarget(), {
      location: { reload: () => { reloads += 1; } },
      setInterval: () => 1,
      setTimeout: (callback) => { fallback = callback; return 1; }
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker } });

    const applyUpdateButton = new FakeEventTarget();
    setupPwa({
      installButton: null,
      updateBanner: { hidden: true },
      applyUpdateButton,
      beforeApplyUpdate: async () => {}
    });
    await Promise.resolve();
    await Promise.resolve();

    await applyUpdateButton.dispatch("click");
    assert.deepEqual(waitingWorker.messages, [{ type: "SKIP_WAITING" }]);
    assert.equal(typeof fallback, "function");
    fallback();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(reloads, 1);
    await serviceWorker.dispatch("controllerchange");
    assert.equal(reloads, 1, "late controllerchange must not cause a second reload");
  });
});

test("an edit made after accepting an update is flushed again and a failed final save blocks reload", async () => {
  await withBrowserGlobals(async () => {
    const serviceWorker = new FakeEventTarget();
    serviceWorker.controller = {};
    const registration = new FakeEventTarget();
    const waitingWorker = { messages: [], postMessage(message) { this.messages.push(message); } };
    registration.waiting = waitingWorker;
    registration.installing = null;
    registration.update = async () => {};
    serviceWorker.register = async () => registration;

    let reloads = 0;
    let fallback = null;
    globalThis.window = Object.assign(new FakeEventTarget(), {
      location: { reload: () => { reloads += 1; } },
      setInterval: () => 1,
      setTimeout: (callback) => { fallback = callback; return 1; }
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker } });

    const applyUpdateButton = new FakeEventTarget();
    applyUpdateButton.textContent = "立即更新";
    let draftFlushes = 0;
    setupPwa({
      installButton: null,
      updateBanner: { hidden: true },
      applyUpdateButton,
      beforeApplyUpdate: async () => {
        draftFlushes += 1;
        if (draftFlushes === 2) throw new Error("new edit could not be saved");
      }
    });
    await Promise.resolve();
    await Promise.resolve();

    await applyUpdateButton.dispatch("click");
    assert.equal(draftFlushes, 1, "the state present when update was accepted is saved first");
    assert.deepEqual(waitingWorker.messages, [{ type: "SKIP_WAITING" }]);

    // This represents another editor input after acceptance. The fallback must
    // perform the second flush and refuse to reload when that save fails.
    fallback();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(draftFlushes, 2);
    assert.equal(reloads, 0);
    assert.equal(applyUpdateButton.textContent, "草稿再次保存失败，新版本暂不刷新");
    assert.equal(applyUpdateButton.disabled, false);

    await serviceWorker.dispatch("controllerchange");
    await Promise.resolve();
    assert.equal(draftFlushes, 2, "a late controllerchange must not bypass the failed final save");
    assert.equal(reloads, 0);
  });
});

test("controllerchange and the timeout fallback share one final flush and reload once", async () => {
  await withBrowserGlobals(async () => {
    const serviceWorker = new FakeEventTarget();
    serviceWorker.controller = {};
    const registration = new FakeEventTarget();
    const waitingWorker = { messages: [], postMessage(message) { this.messages.push(message); } };
    registration.waiting = waitingWorker;
    registration.installing = null;
    registration.update = async () => {};
    serviceWorker.register = async () => registration;

    let reloads = 0;
    let fallback = null;
    globalThis.window = Object.assign(new FakeEventTarget(), {
      location: { reload: () => { reloads += 1; } },
      setInterval: () => 1,
      setTimeout: (callback) => { fallback = callback; return 1; }
    });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker } });

    const applyUpdateButton = new FakeEventTarget();
    let draftFlushes = 0;
    let finishFinalSave;
    setupPwa({
      installButton: null,
      updateBanner: { hidden: true },
      applyUpdateButton,
      beforeApplyUpdate: async () => {
        draftFlushes += 1;
        if (draftFlushes === 2) await new Promise((resolve) => { finishFinalSave = resolve; });
      }
    });
    await Promise.resolve();
    await Promise.resolve();

    await applyUpdateButton.dispatch("click");
    await serviceWorker.dispatch("controllerchange");
    assert.equal(draftFlushes, 2);
    assert.equal(reloads, 0, "reload waits for the final draft flush");

    fallback();
    assert.equal(draftFlushes, 2, "timeout must join the controllerchange flush instead of starting another one");
    finishFinalSave();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(reloads, 1);

    await serviceWorker.dispatch("controllerchange");
    fallback();
    await Promise.resolve();
    assert.equal(draftFlushes, 2);
    assert.equal(reloads, 1);
  });
});

test("Service Worker activation deletes stale wordbook caches and preserves unrelated caches", async () => {
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const listeners = new Map();
  const deleted = [];
  let claimed = 0;
  const context = {
    self: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      clients: { async claim() { claimed += 1; } }
    },
    caches: {
      async keys() { return ["zhuo-wordbook-v18", "zhuo-wordbook-v22", "zhuo-wordbook-v32", "another-app-v1"]; },
      async delete(key) { deleted.push(key); return true; }
    },
    URL,
    Response,
    fetch: async () => { throw new Error("not used"); }
  };
  vm.runInNewContext(source, context, { filename: "vocab/sw.js" });

  let activation;
  listeners.get("activate")({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert.deepEqual(deleted.sort(), ["zhuo-wordbook-v18", "zhuo-wordbook-v22", "zhuo-wordbook-v32"]);
  assert.equal(claimed, 1);
});
