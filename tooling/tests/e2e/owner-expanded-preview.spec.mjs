import { expect, test } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:4187";
test.use({ serviceWorkers: "block" });
let browserErrors;

test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([
    { name: "e2e_run", value: `owner-preview-${info.testId}`.replace(/[^a-z0-9-]/giu, "-").slice(0, 80), url: ORIGIN },
    { name: "e2e_auth", value: "owner", url: ORIGIN },
    { name: "e2e_empty", value: "1", url: ORIGIN }
  ]);
  browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));
});
test.afterEach(() => expect(browserErrors).toEqual([]));

function gate() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, release: () => resolve() };
}

async function ownerReady(page) {
  await page.goto("/owner.html?e2e=1&testRun=expanded-preview");
  await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
  await expect(page.locator("#owner-entry-count")).toHaveText("0");
  await expect(page.locator("#organize-button")).toBeEnabled();
}

async function holdAi(page) {
  const started = gate(), held = gate(); let calls = 0;
  await page.route("**/api/v1/owner/ai/organize", async route => {
    calls++; started.release(); await held.promise;
    try { await route.continue(); } catch { /* The test can close a signed-out page. */ }
  });
  return { started: started.promise, release: held.release, calls: () => calls };
}

async function holdAsset(page, pattern) {
  const started = gate(), held = gate(), finished = gate();
  await page.route(pattern, async route => {
    const response = await route.fetch(); started.release(); await held.promise;
    try { await route.fulfill({ response }); } catch { /* AI completion can cancel this public preview. */ }
    finally { finished.release(); }
  });
  return { started: started.promise, release: held.release, finished: finished.promise };
}

async function begin(page, term, ai) {
  await page.locator("#capture-input").fill(term);
  await page.locator("#capture-input").press("Enter"); await ai.started;
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "busy");
  await expect(page.locator("#field-term")).toHaveValue(term);
}

async function finish(page, ai) {
  ai.release();
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "success");
  await expect(page.locator("#organize-button")).toHaveAttribute("aria-busy", "false");
  expect(ai.calls()).toBe(1);
}

for (const [term, meaning, source] of [
  ["abacus", "算盘", "ECDICT"],
  ["outgrowth", "发展", "ECDICT"],
  ["by some fluke", "碰巧走运", "卓式原创"]
]) {
  test(`expanded preview finds ${term} without changing draft fields or publishing before AI`, async ({ page }) => {
    const ai = await holdAi(page); let publications = 0;
    page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/publish")) publications++; });
    try {
      await ownerReady(page); await begin(page, term, ai);
      await expect(page.locator("#editor-ai-title")).toContainText("本地中文候选");
      await expect(page.locator("#editor-ai-message")).toContainText(meaning);
      await expect(page.locator("#editor-ai-message")).toContainText(source);
      await expect(page.locator("#editor-ai-message")).toContainText("候选不会自动发布");
      if (source === "卓式原创") await expect(page.locator("#editor-ai-message")).not.toContainText("ECDICT");
      await expect(page.locator("#field-meaning")).toHaveValue("");
      await expect(page.locator("#field-definition")).toHaveValue("");
      await expect(page.locator("#field-example-en")).toHaveValue("");
      await expect(page.locator("#publish-button")).toBeDisabled();
      expect(publications).toBe(0); expect(ai.calls()).toBe(1);
      await finish(page, ai);
      await expect(page.locator("#field-meaning")).toHaveValue("自动整理的测试释义");
      expect(publications).toBe(0);
    } finally { ai.release(); await page.unrouteAll({ behavior: "wait" }); }
  });
}

test("the existing corrected core hip preview takes priority and does not fetch expansion", async ({ page }) => {
  const ai = await holdAi(page), expansionRequests = [];
  page.on("request", request => { if (request.url().includes("/data/expanded-dictionary/")) expansionRequests.push(request.url()); });
  try {
    await ownerReady(page); await begin(page, "hip", ai);
    await expect(page.locator("#editor-ai-message")).toContainText("本地 ECDICT 候选");
    await expect(page.locator("#editor-ai-message")).toContainText("髋部");
    await expect(page.locator("#editor-ai-message")).toContainText("时髦");
    expect(expansionRequests).toEqual([]);
    await expect(page.locator("#field-meaning")).toHaveValue("");
    await finish(page, ai);
  } finally { ai.release(); await page.unrouteAll({ behavior: "wait" }); }
});

for (const asset of ["core", "expanded"]) {
  test(`a late ${asset} preview cannot turn a completed AI result back into busy`, async ({ page }) => {
    const ai = await holdAi(page);
    const delayed = await holdAsset(page, asset === "core" ? "**/data/ecdict-core.json*" : "**/data/expanded-dictionary/**/en-*.json*");
    try {
      await ownerReady(page); await begin(page, "abacus", ai); await delayed.started;
      await finish(page, ai);
      const completedMessage = await page.locator("#editor-ai-message").textContent();
      delayed.release(); await delayed.finished;
      await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "success");
      await expect(page.locator("#editor-ai-message")).toHaveText(completedMessage);
      await expect(page.locator("#field-meaning")).toHaveValue("自动整理的测试释义");
      expect(ai.calls()).toBe(1);
    } finally { delayed.release(); ai.release(); await page.unrouteAll({ behavior: "wait" }); }
  });
}

test("switching drafts does not put a delayed preview or AI result into the other draft", async ({ page }) => {
  const ai = await holdAi(page);
  const delayed = await holdAsset(page, "**/data/expanded-dictionary/**/en-*.json*");
  try {
    await ownerReady(page);
    await page.locator("#capture-input").fill("draft b"); await page.locator("#manual-button").click();
    await page.locator("#field-meaning").fill("B 的人工释义必须保留"); await page.locator("#save-local").click();
    await begin(page, "abacus", ai); await delayed.started;
    await page.locator("#draft-list").getByRole("button", { name: /draft b/iu }).click();
    delayed.release(); await delayed.finished;
    await expect(page.locator("#field-term")).toHaveValue("draft b");
    await expect(page.locator("#field-meaning")).toHaveValue("B 的人工释义必须保留");
    await expect(page.locator("#editor-ai-status")).toBeHidden();
    ai.release();
    await expect(page.locator("#capture-status")).toContainText("已在后台完成并保存");
    await expect(page.locator("#field-term")).toHaveValue("draft b");
    await expect(page.locator("#field-meaning")).toHaveValue("B 的人工释义必须保留");
    await expect(page.locator("#editor-ai-status")).toBeHidden();
    expect(ai.calls()).toBe(1);
  } finally { delayed.release(); ai.release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("logout invalidates a delayed preview even while its original AI request is held", async ({ page }) => {
  const ai = await holdAi(page);
  const delayed = await holdAsset(page, "**/data/expanded-dictionary/**/en-*.json*");
  try {
    await ownerReady(page); await begin(page, "abacus", ai); await delayed.started;
    const beforeLogout = await page.locator("#editor-ai-message").textContent();
    await page.locator("#logout-button").click();
    await expect(page.locator("#auth-gate")).toBeVisible();
    await expect(page.locator("#owner-workspace")).toBeHidden();
    delayed.release(); await delayed.finished;
    await expect(page.locator("#editor-ai-message")).toHaveText(beforeLogout);
    await expect(page.locator("#editor-ai-message")).not.toContainText("算盘");
    expect(ai.calls()).toBe(1);
  } finally { delayed.release(); ai.release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("a failed core download safely uses the expanded preview without changing the AI request", async ({ page }) => {
  await page.route("**/data/ecdict-core.json*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  const ai = await holdAi(page);
  try {
    await ownerReady(page); await begin(page, "abacus", ai);
    await expect(page.locator("#editor-ai-message")).toContainText("算盘");
    await expect(page.locator("#editor-ai-message")).toContainText("ECDICT");
    await expect(page.locator("#field-meaning")).toHaveValue("");
    await finish(page, ai);
  } finally { ai.release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("an unavailable expanded dictionary cannot fail AI completion or insert a fake result", async ({ page }) => {
  await page.route("**/data/expanded-dictionary/manifest.json*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  const ai = await holdAi(page);
  try {
    await ownerReady(page); await begin(page, "abacus", ai);
    await expect(page.locator("#field-meaning")).toHaveValue("");
    await expect(page.locator("#editor-ai-message")).toContainText("不是查询结果");
    await finish(page, ai);
    await expect(page.locator("#field-meaning")).toHaveValue("自动整理的测试释义");
  } finally { ai.release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("an ambiguous expanded form is explained without choosing or rewriting a lemma", async ({ page }) => {
  const ai = await holdAi(page);
  try {
    await ownerReady(page); await begin(page, "blitzes", ai);
    await expect(page.locator("#editor-ai-message")).toContainText("该词形对应多个词或语境");
    await expect(page.locator("#editor-ai-message")).toContainText("未自动选择或改词");
    await expect(page.locator("#field-term")).toHaveValue("blitzes");
    await expect(page.locator("#field-meaning")).toHaveValue("");
    await finish(page, ai);
  } finally { ai.release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("a unique expanded form is labelled as a candidate and leaves the entered form intact", async ({ page }) => {
  const ai = await holdAi(page);
  try {
    await ownerReady(page); await begin(page, "outgrowths", ai);
    await expect(page.locator("#editor-ai-message")).toContainText("outgrowth");
    await expect(page.locator("#editor-ai-message")).toContainText("不会自动改词");
    await expect(page.locator("#field-term")).toHaveValue("outgrowths");
    await expect(page.locator("#field-meaning")).toHaveValue("");
    await finish(page, ai);
  } finally { ai.release(); await page.unrouteAll({ behavior: "wait" }); }
});
