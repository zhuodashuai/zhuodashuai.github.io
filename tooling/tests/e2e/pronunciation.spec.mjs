import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const chapterUrl = "/?book=never-let-me-go&chapter=chapter-8";

// Deterministic contract tests: these do not verify the quality of a real
// installed voice, iPhone audio hardware, offline voice packs or lock-screen use.
async function installSpeechStub(page, { unsupported = false, voices = "english" } = {}) {
  await page.addInitScript(({ unsupported, voices }) => {
    const state = { calls: [], cancels: 0, active: null };
    const dispatch = (utterance, type, detail = {}) => {
      if (!utterance) return;
      const event = new Event(type);
      Object.assign(event, detail);
      utterance.dispatchEvent(event);
      utterance[`on${type}`]?.(event);
    };
    const speech = new EventTarget();
    let available = voices === "none" ? [] : voices === "chinese" ? [
      { name: "中文", lang: "zh-CN", localService: true, default: true, voiceURI: "zh-test" }
    ] : [
      { name: "American English", lang: "en-US", localService: true, default: true, voiceURI: "us-test" },
      { name: "British English", lang: "en-GB", localService: true, default: false, voiceURI: "gb-test" }
    ];
    speech.getVoices = () => available;
    speech.cancel = () => {
      state.cancels += 1;
      const previous = state.active;
      state.active = null;
      dispatch(previous, "error", { error: "canceled" });
    };
    speech.resume = () => {};
    speech.speak = utterance => {
      state.active = utterance;
      state.calls.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate, voiceLang: utterance.voice?.lang || "" });
      queueMicrotask(() => { if (state.active === utterance) dispatch(utterance, "start"); });
    };
    class Utterance extends EventTarget {
      constructor(text) { super(); this.text = text; }
    }
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: unsupported ? undefined : speech });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: unsupported ? undefined : Utterance });
    window.__speechTest = {
      state,
      end() { const current = state.active; state.active = null; dispatch(current, "end"); },
      fail(error = "network") { const current = state.active; state.active = null; dispatch(current, "error", { error }); },
      setVoices(next) { available = next; speech.dispatchEvent(new Event("voiceschanged")); }
    };
  }, { unsupported, voices });
}

test.beforeEach(async ({ context, page }, testInfo) => {
  const value = `audio-${testInfo.workerIndex}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", error => { throw new Error(`Unhandled pronunciation error: ${error.message}`); });
});

async function speechState(page) {
  return page.evaluate(() => ({ calls: window.__speechTest.state.calls, cancels: window.__speechTest.state.cancels, activeText: window.__speechTest.state.active?.text || "" }));
}

async function expectSpeechStopped(page) {
  // Native <dialog> close dispatch can trail its visible open=false state.
  // Bound the observable result without depending on OS event-loop timing.
  await expect.poll(async () => (await speechState(page)).activeText, {
    timeout: 2_000, intervals: [20, 50, 100], message: "closing or leaving a word must stop its pronunciation"
  }).toBe("");
}

test("card speaker reads the full expression without opening the card, and clicking again stops it", async ({ page }) => {
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  await expect(page.locator("#entry-count")).toHaveText("25");
  expect((await speechState(page)).calls).toHaveLength(0);
  const speaker = page.locator('#entry-grid button[data-audio-text="be crawling with"]');
  await expect(speaker).toHaveAccessibleName("朗读 be crawling with");
  await speaker.click();
  await expect(page.locator("#entry-dialog")).not.toBeVisible();
  await expect(speaker).toHaveAccessibleName("停止朗读 be crawling with");
  expect((await speechState(page)).calls).toEqual([{ text: "be crawling with", lang: "en-GB", rate: 1, voiceLang: "en-GB" }]);
  await speaker.click();
  await expect(speaker).toHaveAccessibleName("朗读 be crawling with");
  const stopped = await speechState(page);
  expect(stopped.calls).toHaveLength(1);
  expect(stopped.activeText).toBe("");
});

test("the next speaker cancels the previous word and keyboard activation is supported", async ({ page }) => {
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  const first = page.locator('#entry-grid button[data-audio-text="be crawling with"]');
  const second = page.locator('#entry-grid button[data-audio-text="tranquil"]');
  await first.click();
  const cancels = (await speechState(page)).cancels;
  await second.focus();
  await second.press("Enter");
  const actual = await speechState(page);
  expect(actual.cancels).toBeGreaterThan(cancels);
  expect(actual.calls.map(call => call.text)).toEqual(["be crawling with", "tranquil"]);
  expect(actual.activeText).toBe("tranquil");
  await expect(first).toHaveAccessibleName("朗读 be crawling with");
  await expect(second).toHaveAccessibleName("停止朗读 tranquil");
  await expect(page.locator("#entry-dialog")).not.toBeVisible();
  await page.evaluate(() => window.__speechTest.end());
  await expect(second).toHaveAccessibleName("朗读 tranquil");
});

test("accent and speed preferences persist across reload and are shared with detail playback", async ({ page }) => {
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  const settings = page.locator("#library-audio-settings");
  await settings.locator("summary").click();
  await settings.locator("[data-audio-accent]").selectOption("en-US");
  await settings.locator("[data-audio-rate]").selectOption("0.75");
  await page.locator('#entry-grid button[data-audio-text="tranquil"]').click();
  expect((await speechState(page)).calls.at(-1)).toMatchObject({ text: "tranquil", lang: "en-US", rate: 0.75 });
  await page.reload();
  await settings.locator("summary").click();
  await expect(settings.locator("[data-audio-accent]")).toHaveValue("en-US");
  await expect(settings.locator("[data-audio-rate]")).toHaveValue("0.75");
  await page.getByRole("button", { name: "查看 tranquil 的完整词条", exact: true }).click();
  const detail = page.locator("#entry-dialog");
  await detail.locator("#detail-audio-settings summary").click();
  await expect(detail.locator("[data-audio-accent]")).toHaveValue("en-US");
  await expect(detail.locator("[data-audio-rate]")).toHaveValue("0.75");
  await detail.locator("#dialog-speak").click();
  expect((await speechState(page)).calls.at(-1)).toMatchObject({ text: "tranquil", lang: "en-US", rate: 0.75 });
  await detail.locator("[data-audio-accent]").selectOption("en-GB");
  await detail.locator("[data-audio-rate]").selectOption("1");
  await expect(settings.locator("[data-audio-accent]")).toHaveValue("en-GB");
  await expect(settings.locator("[data-audio-rate]")).toHaveValue("1");
});

test("closing details or advancing to a new review word stops current speech", async ({ page }) => {
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  await page.getByRole("button", { name: "查看 tranquil 的完整词条", exact: true }).click();
  await page.locator("#dialog-speak").click();
  expect((await speechState(page)).activeText).toBe("tranquil");
  await page.keyboard.press("Escape");
  await expect(page.locator("#entry-dialog")).not.toBeVisible();
  await expectSpeechStopped(page);
  await page.locator("#study-button").click();
  await expect(page.locator("#dialog-term")).toHaveText("be crawling with");
  await page.locator("#dialog-speak").click();
  await page.getByRole("button", { name: "很熟", exact: true }).click();
  await expect(page.locator("#dialog-term")).toHaveText("tranquil");
  await expectSpeechStopped(page);
  await page.locator("#dialog-speak").click();
  expect((await speechState(page)).calls.at(-1).text).toBe("tranquil");
});

test("the explicit X closes speech and reopening the word still allows pronunciation and saved review", async ({ page }) => {
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  const opener = page.getByRole("button", { name: "查看 tranquil 的完整词条", exact: true });
  await opener.click();
  await page.locator("#dialog-speak").click();
  expect((await speechState(page)).activeText).toBe("tranquil");
  await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
  await expect(page.locator("#entry-dialog")).not.toBeVisible();
  await expectSpeechStopped(page);
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(page.locator("#dialog-term")).toHaveText("tranquil");
  await page.locator("#dialog-speak").click();
  expect((await speechState(page)).activeText).toBe("tranquil");
  await page.getByRole("button", { name: "很熟", exact: true }).click();
  await expect(page.locator("#dialog-review-status")).toContainText("已记录");
  const saved = await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ reviewCount: 1, lastRating: "easy" });
  await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
  await expectSpeechStopped(page);
  await expect(page.locator("#due-count")).toHaveText("24");

  await page.locator("#study-button").click();
  await expect(page.locator("#dialog-term")).toHaveText("be crawling with");
  await page.locator("#dialog-speak").click();
  expect((await speechState(page)).activeText).toBe("be crawling with");
  await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
  await expectSpeechStopped(page);
});

test("a delayed native close event cannot silence or clear a newly reopened word", async ({ page }) => {
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  await page.getByRole("button", { name: "查看 tranquil 的完整词条", exact: true }).click();
  await page.locator("#dialog-speak").click();
  await page.evaluate(async () => {
    const dialog = document.querySelector("#entry-dialog");
    const dispatchedClose = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
    dialog.close();
    document.querySelector('button[aria-label="查看 gouge 的完整词条"]').click();
    document.querySelector("#dialog-speak").click();
    await dispatchedClose;
  });
  await expect(page.locator("#entry-dialog")).toBeVisible();
  await expect(page.locator("#dialog-term")).toHaveText("gouge");
  expect((await speechState(page)).activeText).toBe("gouge");
  await page.getByRole("button", { name: "很熟", exact: true }).click();
  await expect(page.locator("#dialog-review-status")).toContainText("已记录");
  const saved = await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ reviewCount: 1, lastRating: "easy" });
  await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
  await expectSpeechStopped(page);
});

test("audio failure is visible and retry works without losing the selected word", async ({ page }) => {
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  await page.getByRole("button", { name: "查看 tranquil 的完整词条", exact: true }).click();
  await page.locator("#dialog-speak").click();
  await page.evaluate(() => window.__speechTest.fail("network"));
  const status = page.locator("#entry-dialog [data-audio-status]");
  await expect(status).toBeVisible();
  await expect(status).toHaveText(/无法|失败|网络|重试|不可用/);
  await expect(page.locator("#dialog-term")).toHaveText("tranquil");
  await page.locator("#dialog-speak").click();
  expect((await speechState(page)).calls).toHaveLength(2);
  expect((await speechState(page)).activeText).toBe("tranquil");
});

test("unsupported browser shows an explanation and keeps reading and review usable", async ({ page }) => {
  await installSpeechStub(page, { unsupported: true });
  await page.goto(chapterUrl);
  await expect(page.locator('#entry-grid button[data-audio-text="tranquil"]')).toBeDisabled();
  await page.locator("#library-audio-settings summary").click();
  await expect(page.locator("#library-audio-settings").locator("..").locator("[data-audio-status]")).toHaveText(/不支持|不可用/);
  await page.getByRole("button", { name: "查看 tranquil 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-meaning")).toContainText("宁静");
  await expect(page.locator("#dialog-speak")).toBeDisabled();
  await expect(page.getByRole("button", { name: "很熟", exact: true })).toBeEnabled();
});

test("a device with only Chinese voices shows an error instead of silently choosing the wrong language", async ({ page }) => {
  await installSpeechStub(page, { voices: "chinese" });
  await page.goto(chapterUrl);
  await page.locator('#entry-grid button[data-audio-text="tranquil"]').click();
  expect((await speechState(page)).calls).toHaveLength(0);
  const status = page.locator("#library-audio-settings").locator("..").locator("[data-audio-status]");
  await expect(status).toBeVisible();
  await expect(status).toContainText("英文语音");
  await expect(page.locator("#entry-dialog")).not.toBeVisible();
});

test("375px card controls and detail settings remain usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  const speaker = page.locator('#entry-grid button[data-audio-text="be crawling with"]');
  await speaker.scrollIntoViewIfNeeded();
  const box = await speaker.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await speaker.click();
  await expect(page.locator("#entry-dialog")).not.toBeVisible();
  expect((await speechState(page)).calls.at(-1).text).toBe("be crawling with");
  await page.getByRole("button", { name: "查看 be crawling with 的完整词条", exact: true }).click();
  await page.locator("#detail-audio-settings summary").click();
  await page.locator("#entry-dialog [data-audio-accent]").selectOption("en-US");
  await page.locator("#entry-dialog [data-audio-rate]").selectOption("0.75");
  const layout = await page.evaluate(() => {
    const dialog = document.querySelector("#entry-dialog");
    return { documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, dialogWidth: dialog.clientWidth, dialogScrollWidth: dialog.scrollWidth };
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.dialogScrollWidth).toBeLessThanOrEqual(layout.dialogWidth + 1);
});

test("owner detail uses the same pronunciation controls without requiring an AI call", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await installSpeechStub(page);
  await page.goto("/owner.html");
  await page.locator("#owner-search").fill("tranquil");
  await page.getByRole("button", { name: "查看 tranquil 的完整词条", exact: true }).click();
  await page.locator("#dialog-speak").click();
  expect((await speechState(page)).calls.at(-1)).toMatchObject({ text: "tranquil", lang: "en-GB", rate: 1 });
  await page.getByRole("button", { name: "关闭词条详情" }).click();
  await expectSpeechStopped(page);
});

test("PWA caches pronunciation modules and offline reload still wires local voice controls", async ({ context, page }) => {
  await installSpeechStub(page);
  await page.goto(chapterUrl);
  await expect(page.locator("#entry-count")).toHaveText("25");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cachedModules = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith("zhuo-wordbook-"));
    const urls = (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat();
    return urls.filter(url => /\/js\/pronunciation(?:-ui)?\.js$/.test(url));
  });
  expect(cachedModules).toContain("/js/pronunciation.js");
  expect(cachedModules).toContain("/js/pronunciation-ui.js");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#entry-count")).toHaveText("25");
  await page.locator('#entry-grid button[data-audio-text="tranquil"]').click();
  expect((await speechState(page)).calls.at(-1)).toMatchObject({ text: "tranquil", lang: "en-GB", voiceLang: "en-GB" });
  await context.setOffline(false);
});

test.describe("remote snapshots while pronunciation is active", () => {
  // Route the source deterministically rather than intercepting a Service Worker.
  test.use({ serviceWorkers: "block" });

  for (const mode of ["card", "detail"]) {
    test(`${mode}: unchanged-word refresh keeps speech playing, but same-ID rename stops the old word`, async ({ page }) => {
      const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
      await installSpeechStub(page);
      await page.route("**/api/v1/public/wordbook**", route => route.fulfill({ json: snapshot }));
      await page.goto(chapterUrl);
      await expect(page.locator("#entry-count")).toHaveText("25");
      if (mode === "detail") {
        await page.getByRole("button", { name: "查看 tranquil 的完整词条", exact: true }).click();
        await page.locator("#dialog-speak").click();
      } else await page.locator('#entry-grid button[data-audio-text="tranquil"]').click();
      const initial = await speechState(page);
      expect(initial.activeText).toBe("tranquil");

      snapshot.revisionId = "audio-refresh-same-content";
      snapshot.exportedAt = new Date(Date.parse(snapshot.exportedAt) + 1000).toISOString();
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect.poll(() => page.evaluate(async () => (await (await import("/js/owner-storage.js")).getPublicCache())?.snapshot?.revisionId)).toBe(snapshot.revisionId);
      const unchanged = await speechState(page);
      expect(unchanged.cancels).toBe(initial.cancels);
      expect(unchanged.activeText).toBe("tranquil");
      await expect(page.locator(mode === "detail" ? "#dialog-speak" : '#entry-grid button[data-audio-text="tranquil"]')).toHaveAccessibleName("停止朗读 tranquil");

      const entry = snapshot.entries.find(item => item.term === "tranquil");
      const originalId = entry.id;
      entry.term = entry.normalized = entry.standardForm = "tranquillity";
      entry.revision += 1;
      entry.updatedAt = new Date(Date.parse(entry.updatedAt) + 1000).toISOString();
      snapshot.revisionId = "audio-refresh-same-id-new-term";
      snapshot.exportedAt = new Date(Date.parse(snapshot.exportedAt) + 1000).toISOString();
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(page.getByRole("button", { name: "查看 tranquillity 的完整词条", exact: true })).toBeAttached();
      expect(entry.id).toBe(originalId);
      const renamed = await speechState(page);
      expect(renamed.cancels).toBeGreaterThan(unchanged.cancels);
      expect(renamed.activeText).toBe("");
      if (mode === "detail") {
        await expect(page.locator("#dialog-term")).toHaveText("tranquillity");
        await page.locator("#dialog-speak").click();
      } else await page.locator('#entry-grid button[data-audio-text="tranquillity"]').click();
      expect((await speechState(page)).calls.at(-1).text).toBe("tranquillity");
    });
  }
});
