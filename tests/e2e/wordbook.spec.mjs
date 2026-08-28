import { expect, test } from "@playwright/test";

let browserErrors;
let expectedOfflineNetworkError;

test.beforeEach(async ({ context, page }, testInfo) => {
  const run = `${testInfo.workerIndex}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  browserErrors = [];
  expectedOfflineNetworkError = false;
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const expectedOfflineFailure = expectedOfflineNetworkError && message.text() === "Failed to load resource: net::ERR_FAILED";
    if (message.type() === "error" && !expectedOfflineFailure && !message.text().startsWith("Failed to load resource: the server responded with a status of")) {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
});

test.afterEach(() => {
  expect(browserErrors, "page must not emit unhandled errors").toEqual([]);
});

async function loginOwner(page) {
  await page.goto("/owner.html");
  await expect(page.getByRole("heading", { name: "只有卓本人可以进入。" })).toBeVisible();
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page.getByRole("heading", { name: "卓的管理模式" })).toBeVisible();
  await expect(page.getByText(/已验证 GitHub @zhuodashuai/)).toBeVisible();
}

async function addWithAi(page, input) {
  await page.getByLabel("英文内容").fill(input);
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeVisible();
}

async function publishOpenDraft(page) {
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.getByText("已发布", { exact: true }).first()).toBeVisible();
}

test("访客浏览、搜索、详情、导出，并且没有写入入口", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "卓的公开词库", exact: true })).toBeVisible();
  await expect(page.getByText(/已验证 GitHub 公开快照/)).toBeVisible();
  await expect(page.locator("#entry-count")).toHaveText("1");
  await expect(page.getByRole("button", { name: /编辑|删除|发布/ })).toHaveCount(0);
  await page.getByLabel("搜索英文、中文、标签或作者").fill("jab at");
  await page.getByRole("button", { name: "查看 jab at 的完整词条" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "jab at" })).toBeVisible();
  await page.getByRole("button", { name: "关闭词条详情" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出公开词库 JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^zhuo-public-wordbook-.*\.json$/);
});

test("未登录与错误账号状态保持 fail closed", async ({ context, page }) => {
  await page.goto("/owner.html");
  await expect(page.locator("#owner-workspace")).toBeHidden();
  await expect(page.getByRole("button", { name: "发布到 GitHub" })).toBeHidden();
  await page.locator("#owner-workspace").evaluate((element) => {
    element.hidden = false;
    element.inert = false;
  });
  await page.getByLabel("英文内容").fill("visitor must not create this");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await expect(page.locator("#capture-status")).toContainText("没有通过验证的卓本人会话");
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((database) => database.name));
  expect(databases).not.toContain("wordbook-db");
  await context.addCookies([{ name: "e2e_auth", value: "other", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await page.reload();
  await expect(page.locator("#owner-workspace")).toBeHidden();
});

test("未认证页面断网后仍 fail closed，不能用 IndexedDB 冒充卓", async ({ context, page }) => {
  await page.goto("/owner.html");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  expectedOfflineNetworkError = true;
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#owner-workspace")).toBeHidden();
  await expect(page.locator("#auth-message")).toContainText("管理区保持锁定");
  await expect(page.getByRole("button", { name: "建立手动草稿" })).toBeHidden();
  await context.setOffline(false);
});

test("卓登录后添加 jab at、发布、刷新保留并防止重复", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await addWithAi(page, "jab at");
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("jab at");
  await expect(page.getByRole("combobox", { name: "类型", exact: true })).toHaveValue("phrase");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(/猛戳/);
  await publishOpenDraft(page);
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.reload();
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.getByLabel("英文内容").fill("jab at");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.locator("#capture-status")).toContainText("已存在，没有重复创建");
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
});

test("hip 永久语义回归：IPA、noun/adjective 分义项、双语例句、发布和标点去重", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await addWithAi(page, "hip");
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("hip");
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("/hɪp/");
  await expect(page.getByLabel("词性", { exact: true })).toHaveValue("noun · adjective");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(/髋部[\s\S]*时髦/);
  await expect(page.locator("#sense-list")).toContainText("1. noun");
  await expect(page.locator("#sense-list")).toContainText("髋关节");
  await expect(page.locator("#sense-list")).toContainText("2. adjective");
  await expect(page.locator("#sense-list")).toContainText("了解最新潮流");
  await expect(page.locator("#sense-list")).toContainText("The neighbourhood is full of hip cafés.");
  await publishOpenDraft(page);
  await page.reload();
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.getByLabel("英文内容").fill("HIP!");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.locator("#capture-status")).toContainText("已存在，没有重复创建");
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.goto("/");
  await page.getByLabel("搜索英文、中文、标签或作者").fill("hip");
  await page.getByRole("button", { name: "查看 hip 的完整词条" }).click();
  await expect(page.getByRole("dialog")).toContainText("/hɪp/");
  await expect(page.getByRole("dialog")).toContainText("noun");
  await expect(page.getByRole("dialog")).toContainText("adjective");
  await expect(page.getByRole("dialog")).toContainText("She injured her hip while running.");
  await expect(page.getByRole("dialog")).toContainText("The neighbourhood is full of hip cafés.");
});

test("recieve 只显示 receive 建议，必须由卓明确采用", async ({ page }) => {
  await loginOwner(page);
  await addWithAi(page, "recieve");
  await expect(page.locator("#correction-card")).toBeVisible();
  await expect(page.locator("#correction-original")).toHaveText("recieve");
  await expect(page.locator("#correction-suggestion")).toHaveText("receive");
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.locator("#editor-error")).toContainText("请先选择");
  await page.getByRole("button", { name: "使用建议" }).click();
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("receive");
  await publishOpenDraft(page);
});

test("无可靠来源的名言保持未核验且不虚构作者", async ({ page }) => {
  await loginOwner(page);
  const quote = "A quotation with no reliable source.";
  await addWithAi(page, quote);
  await expect(page.getByRole("combobox", { name: "核验状态", exact: true })).toHaveValue("unverified");
  await expect(page.getByLabel("作者", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("核验说明", { exact: true })).toHaveValue(/出处未核验/);
  await publishOpenDraft(page);
  await page.goto("/");
  await page.getByLabel("搜索英文、中文、标签或作者").fill("quotation");
  await page.getByRole("button", { name: `查看 ${quote} 的完整词条` }).click();
  await expect(page.getByText(/出处未核验/).first()).toBeVisible();
});

test("AI 故障回退到手动草稿，不会丢失输入", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_ai_fail", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await addWithAi(page, "fallbackword");
  await expect(page.locator("#capture-status")).toContainText("草稿仍可手动填写");
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "建立手动草稿" })).toBeEnabled();
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("fallbackword");
  await page.getByLabel("中文释义", { exact: true }).fill("手动补充释义");
  await publishOpenDraft(page);
});

test("AI 返回较慢时保留卓已经输入的人工修改", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_ai_delay", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("slowword");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.getByRole("heading", { name: /slowword/ })).toBeVisible();
  await page.getByLabel("中文释义", { exact: true }).fill("卓在等待 AI 时手动写的释义");
  await expect(page.locator("#capture-status")).toContainText("人工修改已保留");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("卓在等待 AI 时手动写的释义");
});

test("AI 尚未返回时再次提交只允许最新草稿接收最新结果", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_ai_delay", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("firstslowword");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.getByRole("heading", { name: /firstslowword/ })).toBeVisible();

  await page.getByLabel("英文内容").fill("secondslowword");
  await page.locator("#capture-form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole("heading", { name: /secondslowword/ })).toBeVisible();
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("secondslowword");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("自动整理的测试释义", { timeout: 8_000 });
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "建立手动草稿" })).toBeEnabled();
  await expect(page.locator("#draft-list").getByRole("button", { name: /firstslowword/ })).toHaveCount(1);
  await expect(page.locator("#draft-list").getByRole("button", { name: /secondslowword/ })).toHaveCount(1);
});

test("400ms 自动保存期间切换草稿不会丢最后输入", async ({ page }) => {
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("firstdraft");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("切换前最后一刻输入的释义");
  await page.getByLabel("英文内容").fill("seconddraft");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.locator("#draft-list").getByRole("button", { name: /firstdraft/ }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("切换前最后一刻输入的释义");
});

test("离线保存进入等待队列，恢复网络后自动发布", async ({ context, page }) => {
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("offlineword");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("离线词条");
  await context.setOffline(true);
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.getByText("等待同步", { exact: true }).first()).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("已发布", { exact: true }).first()).toBeVisible({ timeout: 12_000 });
});

test("GitHub 超时保留草稿和队列，显式重试后只发布一次", async ({ context, page }) => {
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("githubtimeoutword");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("GitHub 超时后仍应保留");
  await context.addCookies([{ name: "e2e_github_timeout", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.getByText("同步失败，将安全重试", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("githubtimeoutword");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("GitHub 超时后仍应保留");

  await context.addCookies([{ name: "e2e_github_timeout", value: "0", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("已发布", { exact: true }).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".owner-entry-row", { hasText: "githubtimeoutword" })).toHaveCount(1);
});

test("删除离线草稿会同时取消待发布任务，恢复网络也不会偷偷发布", async ({ context, page }) => {
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("cancelledword");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("不应发布");
  await context.setOffline(true);
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.getByText("等待同步", { exact: true }).first()).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除草稿" }).click();
  await context.setOffline(false);
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await expect(page.locator(".owner-entry-row", { hasText: "cancelledword" })).toHaveCount(0);
});

test("跨刷新恢复的离线队列必须由卓重新打开复核，不能登录后自动发布", async ({ context, page }) => {
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("reviewword");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("需要重新复核");
  await context.setOffline(true);
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.getByText("等待同步", { exact: true }).first()).toBeVisible();
  expectedOfflineNetworkError = true;
  await page.reload();
  await expect(page.locator("#owner-workspace")).toBeHidden();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText("等待卓本人复核", { exact: true })).toBeVisible();
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.locator("#draft-list").getByRole("button", { name: /reviewword/ }).click();
  await expect(page.locator("#capture-status")).toContainText("旧任务已取消");
  await publishOpenDraft(page);
  await expect(page.locator("#owner-entry-count")).toHaveText("2");
});

test("远端同字段变化打开冲突面板且保留本地草稿", async ({ context, page }) => {
  await loginOwner(page);
  const row = page.locator(".owner-entry-row", { hasText: "jab at" });
  await row.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("本地并发修改的释义");
  await context.addCookies([{ name: "e2e_conflict", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.getByRole("dialog", { name: /同步冲突/ })).toBeVisible();
  await expect(page.locator("#conflict-fields")).toContainText("meaning");
  await page.getByRole("button", { name: "采用非冲突合并并继续检查" }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("本地并发修改的释义");
  await expect(page.locator("#editor-error")).toContainText("请逐项检查");
  await publishOpenDraft(page);
});

test("编辑、删除与备份导入均为显式操作", async ({ page }) => {
  await loginOwner(page);
  const row = page.locator(".owner-entry-row", { hasText: "jab at" });
  await row.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("更新后的 jab at 释义");
  await publishOpenDraft(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".owner-entry-row", { hasText: "jab at" }).getByRole("button", { name: "删除" }).click();
  await expect(page.locator(".owner-entry-row", { hasText: "jab at" })).toHaveCount(0);
  await page.locator("#import-file").setInputFiles(path);
  await expect(page.locator("#capture-status")).toContainText("已安全导入");
});

test("恶意 HTML 仅作为文本显示，PWA 条件成立", async ({ page }) => {
  await page.addInitScript(() => { window.__xss = 0; });
  await loginOwner(page);
  await addWithAi(page, "xssword");
  await publishOpenDraft(page);
  await page.goto("/");
  await page.getByLabel("搜索英文、中文、标签或作者").fill("xssword");
  await page.getByRole("button", { name: "查看 xssword 的完整词条" }).click();
  await expect(page.getByRole("dialog").getByText(/<img src=x onerror=window.__xss=1>/)).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBe(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe("http://127.0.0.1:4187/");
  const manifest = await page.evaluate(async () => fetch(document.querySelector('link[rel="manifest"]').href).then((response) => response.json()));
  expect(manifest).toMatchObject({ name: "卓的公开词库", start_url: "./", scope: "./", display: "standalone" });
});

test("375px 手机宽度无横向溢出，主要按钮和键盘焦点可用", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByText(/已验证 GitHub 公开快照/)).toBeVisible();
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
  const searchBox = page.getByLabel("搜索英文、中文、标签或作者");
  await searchBox.focus();
  await expect(searchBox).toBeFocused();
  const boxes = await page.locator("button:visible, a:visible").evaluateAll((elements) => elements.slice(0, 12).map((element) => element.getBoundingClientRect().height));
  expect(boxes.every((height) => height >= 40)).toBe(true);
});

test("真实多标签页能看到已保存草稿，前进后退不会丢失管理状态", async ({ context, page }) => {
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("tabword");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await expect(page.getByRole("heading", { name: /tabword/ })).toBeVisible();
  await page.getByLabel("中文释义", { exact: true }).fill("多标签页测试词");
  await page.getByRole("button", { name: "保存本地草稿" }).click();
  await expect(page.locator("#capture-status")).toContainText("草稿已可靠保存在当前设备");

  const secondPage = await context.newPage();
  await secondPage.goto("/owner.html");
  await expect(secondPage.getByRole("heading", { name: "卓的管理模式" })).toBeVisible();
  await expect(secondPage.locator("#draft-list")).toContainText("tabword");
  await secondPage.close();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "卓的公开词库", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "卓的管理模式" })).toBeVisible();
  await expect(page.locator("#draft-list")).toContainText("tabword");
});

test("Slow 3G 条件下公开页仍会结束加载且保持可操作", async ({ context, page }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: 187_500,
    uploadThroughput: 93_750,
    connectionType: "cellular3g"
  });
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "卓的公开词库", exact: true })).toBeVisible();
    await expect(page.locator("#entry-grid")).toHaveAttribute("aria-busy", "false");
    await page.getByLabel("搜索英文、中文、标签或作者").fill("jab at");
    await expect(page.getByRole("button", { name: "查看 jab at 的完整词条" })).toBeVisible();
  } finally {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: "none"
    });
  }
});
