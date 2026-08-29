import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const canonicalSnapshot = JSON.parse(
  await readFile(new URL("../../vocab/data/owner-wordbook.json", import.meta.url), "utf8")
);
const CANONICAL_ENTRY_COUNT = canonicalSnapshot.entries.length;

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
  await expect(page.locator("#ai-service-status")).toContainText("UTC 日最多 20 次");
  await expect(page.locator("#ai-service-status")).toContainText("不会自动切换到付费引擎");
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

test("可证明的义项词性与顶层词性在 Owner、公开卡片、详情和复制文本中保持一致", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4187" });
  const cases = [
    {
      term: "jab at",
      partOfSpeech: "verb phrase · noun collocation",
      meaning: "① 朝某人或某物猛戳、猛刺或快速击打\n② （言语上）抨击、挖苦或嘲讽"
    },
    {
      term: "hip",
      partOfSpeech: "noun · adjective",
      meaning: "① noun: 髋部;臀部;髋关节\n② adjective: 时髦的;了解最新潮流的"
    },
    {
      term: "surveillance",
      partOfSpeech: "noun",
      meaning: "① noun: 监视, 监督\n② noun: [电] 侦测"
    },
    {
      term: "perspicacious",
      partOfSpeech: "adjective",
      meaning: "adjective：敏锐的;有洞察力的;目光锐利的"
    }
  ];

  await loginOwner(page);
  for (const { term, partOfSpeech, meaning } of cases) {
    await page.locator("#owner-search").fill(term);
    const ownerEntry = page.locator(".owner-entry-row", { hasText: term });
    await expect(ownerEntry).toHaveCount(1);
    await expect(ownerEntry.locator(".owner-entry-part-of-speech")).toHaveText(`词性 · ${partOfSpeech}`);
    expect(await ownerEntry.locator(".owner-entry-part-of-speech + p").innerText()).toBe(meaning);
  }

  await page.goto("/");
  for (const { term, partOfSpeech, meaning } of cases) {
    const canonicalEntry = canonicalSnapshot.entries.find((entry) => entry.term === term);
    expect(canonicalEntry, `${term} must remain in the canonical regression snapshot`).toBeTruthy();
    await page.locator("#library-search").fill(term);
    const publicEntry = page.locator(".word-card", { hasText: term });
    await expect(publicEntry).toHaveCount(1);
    await expect(publicEntry.locator(".card-kicker span").last()).toHaveText(partOfSpeech);
    expect(await publicEntry.locator(".card-meaning").innerText()).toBe(meaning);

    await page.getByRole("button", { name: `查看 ${term} 的完整词条` }).click();
    await expect(page.locator("#dialog-phonetic")).toHaveText(
      [canonicalEntry.phonetic, partOfSpeech].filter(Boolean).join(" · ")
    );
    expect(await page.locator("#dialog-meaning").innerText()).toBe(meaning);
    await page.getByRole("button", { name: "复制词条" }).click();
    await expect(page.getByRole("button", { name: "已复制" })).toBeVisible();
    const copiedLines = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n?/g, "\n").split("\n");
    const expectedLines = meaning.split("\n");
    expect(copiedLines[0]).toBe(term);
    expect(copiedLines[1]).toBe(canonicalEntry.phonetic);
    expect(copiedLines[2]).toBe(`词性：${partOfSpeech}`);
    expect(copiedLines.slice(3, 3 + expectedLines.length)).toEqual(expectedLines);
    await page.getByRole("button", { name: "关闭词条详情" }).click();
  }
});

test("公开词条详情按义项分块，各字段、双语例句与词形独立换行", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.locator("#library-search").fill("hip");
  await page.getByRole("button", { name: "查看 hip 的完整词条" }).click();

  const dialog = page.getByRole("dialog");
  const extra = dialog.locator("#dialog-extra");
  const senses = extra.locator("article.detail-sense");
  await expect(senses).toHaveCount(2);
  await expect(senses.locator(".sense-heading")).toHaveCount(2);
  expect(await senses.evaluateAll((elements) => elements.map((element) => element.tagName))).toEqual(["ARTICLE", "ARTICLE"]);
  expect(await senses.locator(".sense-heading").evaluateAll((elements) => elements.map((element) => element.tagName))).toEqual(["H4", "H4"]);

  const noun = senses.nth(0);
  await expect(noun.locator(".sense-heading")).toContainText("1");
  await expect(noun.locator(".sense-part-of-speech")).toHaveText("noun");
  await expect(noun.locator(".sense-meaning-zh > p")).toHaveText("髋部；臀部；髋关节");
  await expect(noun.locator(".sense-definition-en > p")).toContainText("the thigh bone meets the pelvis");
  await expect(noun.locator(".sense-example-pair")).toHaveCount(2);
  await expect(noun.locator(".sense-example-en > p")).toHaveText([
    "She has very wide hips.",
    "The doctor examined his hip joint."
  ]);
  await expect(noun.locator(".sense-example-zh > p")).toHaveText([
    "她的胯部很宽。",
    "医生检查了他的髋关节。"
  ]);
  await expect(noun.locator(".sense-usage > p")).toContainText("hip joint connects the femur");
  await expect(noun.locator(".sense-register > p")).toHaveText("general");

  const adjective = senses.nth(1);
  await expect(adjective.locator(".sense-part-of-speech")).toHaveText("adjective");
  await expect(adjective.locator(".sense-meaning-zh > p")).toHaveText("时髦的；了解最新潮流的");
  await expect(adjective.locator(".sense-definition-en > p")).toContainText("Fashionable or up-to-date");
  await expect(adjective.locator(".sense-example-pair")).toHaveCount(2);
  await expect(adjective.locator(".sense-example-en > p")).toHaveText([
    "The club is very hip and attracts young people.",
    "He is hip to the latest technology trends."
  ]);
  await expect(adjective.locator(".sense-example-zh > p")).toHaveText([
    "这家俱乐部非常时髦,吸引了很多年轻人。",
    "他了解最新的技术潮流。"
  ]);
  await expect(adjective.locator(".sense-usage > p")).toContainText("This sense is informal");
  await expect(adjective.locator(".sense-register > p")).toHaveText("informal");

  const forms = extra.locator(".detail-forms");
  await expect(forms).toHaveCount(1);
  await expect(forms.locator("p")).toHaveText("hips；hippest；hipper");

  const nounExamples = noun.locator(".sense-example-pair");
  const orderedLines = [
    noun.locator(".sense-heading"),
    noun.locator(".sense-meaning-zh"),
    noun.locator(".sense-definition-en"),
    nounExamples.nth(0).locator(".sense-example-en"),
    nounExamples.nth(0).locator(".sense-example-zh"),
    nounExamples.nth(1).locator(".sense-example-en"),
    nounExamples.nth(1).locator(".sense-example-zh"),
    noun.locator(".sense-usage"),
    noun.locator(".sense-register")
  ];
  const lineTops = [];
  for (const line of orderedLines) {
    const box = await line.boundingBox();
    expect(box).not.toBeNull();
    lineTops.push(box.y);
  }
  expect(lineTops).toHaveLength(9);
  for (let index = 1; index < lineTops.length; index += 1) {
    expect(lineTops[index]).toBeGreaterThan(lineTops[index - 1]);
  }

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
});

test("单义释义不编号，人工 1/2 展示为 ①②但原始 meaning 与旧 senses 不被改写", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);

  await addWithAi(page, "singleword");
  await publishOpenDraft(page);
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  const ownerSingle = page.locator(".owner-entry-row", { hasText: "singleword" });
  const ownerSingleMeaning = ownerSingle.locator(".owner-entry-part-of-speech + p");
  await expect(ownerSingleMeaning).toHaveText("自动整理的测试释义");
  await expect(ownerSingleMeaning).not.toContainText(/①|②|③/);

  await page.goto("/");
  await page.locator("#library-search").fill("singleword");
  const publicSingle = page.locator(".word-card", { hasText: "singleword" });
  await expect(publicSingle.locator(".card-meaning")).toHaveText("自动整理的测试释义");
  await expect(publicSingle.locator(".card-meaning")).not.toContainText(/①|②|③/);
  await page.getByRole("button", { name: "查看 singleword 的完整词条" }).click();
  await expect(page.locator("#dialog-meaning")).toHaveText("自动整理的测试释义");
  await expect(page.locator("#dialog-meaning")).not.toContainText(/①|②|③/);
  await page.getByRole("button", { name: "关闭词条详情" }).click();

  const rawMeaning = "1. 人工释义 2. 第二义";
  await page.goto("/owner.html");
  await addWithAi(page, "polymanual");
  await expect(page.locator("#sense-list .sense-item")).toHaveCount(1);
  await expect(page.locator("#sense-list")).toContainText("自动整理的测试释义");
  await page.getByLabel("中文释义", { exact: true }).fill(rawMeaning);
  await publishOpenDraft(page);
  await expect(page.locator("#owner-entry-count")).toHaveText("2");

  const ownerManual = page.locator(".owner-entry-row", { hasText: "polymanual" });
  const ownerManualMeaning = ownerManual.locator(".owner-entry-part-of-speech + p");
  await expect(ownerManualMeaning).toHaveText(/①\s*人工释义[\s\S]*②\s*第二义/);
  await expect(ownerManualMeaning).not.toContainText("自动整理的测试释义");
  const ownerPayload = await (await page.request.get("/api/v1/owner/wordbook")).json();
  const storedManual = ownerPayload.snapshot.entries.find((entry) => entry.term === "polymanual");
  expect(storedManual.meaning).toBe(rawMeaning);
  expect(storedManual.senses).toHaveLength(1);
  expect(storedManual.senses[0].meaningZh).toBe("自动整理的测试释义");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.locator("#library-search").fill("polymanual");
  const publicManual = page.locator(".word-card", { hasText: "polymanual" });
  await expect(publicManual.locator(".card-meaning")).toHaveText(/①\s*人工释义[\s\S]*②\s*第二义/);
  await expect(publicManual.locator(".card-meaning")).not.toContainText("自动整理的测试释义");
  await page.getByRole("button", { name: "查看 polymanual 的完整词条" }).click();
  await expect(page.locator("#dialog-meaning")).toHaveText(/①\s*人工释义[\s\S]*②\s*第二义/);
  await expect(page.locator("#dialog-meaning")).not.toContainText("自动整理的测试释义");
  await page.getByRole("button", { name: "关闭词条详情" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出公开词库 JSON" }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  const exportedManual = exported.entries.find((entry) => entry.term === "polymanual");
  expect(exportedManual.meaning).toBe(rawMeaning);
  expect(exportedManual.senses[0].meaningZh).toBe("自动整理的测试释义");
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
});

test("访客浏览、搜索、详情、导出，并且没有写入入口", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "卓的公开词库", exact: true })).toBeVisible();
  await expect(page.getByText(/已即时同步最新公开词库|已读取 GitHub Pages 备用快照/)).toBeVisible();
  await expect(page.locator("#entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT));
  await expect(page.getByRole("button", { name: /编辑|删除|发布/ })).toHaveCount(0);
  await page.locator("#library-search").fill("jab at");
  await page.getByRole("button", { name: "查看 jab at 的完整词条" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "jab at" })).toBeVisible();
  await page.getByRole("button", { name: "关闭词条详情" }).click();
  await page.locator("#library-search").fill("hip");
  await page.getByRole("button", { name: "查看 hip 的完整词条" }).click();
  await expect(page.getByRole("dialog")).toContainText("/hɪp/");
  await expect(page.getByRole("dialog")).toContainText("髋部");
  await expect(page.getByRole("dialog")).toContainText("时髦");
  await expect(page.getByRole("dialog")).toContainText("noun");
  await expect(page.getByRole("dialog")).toContainText("adjective");
  await page.getByRole("button", { name: "关闭词条详情" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出公开词库 JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^zhuo-public-wordbook-.*\.json$/);
});

test("公开搜索无结果时说明不是在线词典，并只把卓本人引向管理模式", async ({ page }) => {
  let aiRequestCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/owner/ai/organize")) aiRequestCount += 1;
  });

  await page.goto("/");
  await page.locator("#library-search").fill("unpublishedtestword");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(0);
  await expect(page.locator("#search-empty-title")).toHaveText("这里只搜索已发布词库；unpublishedtestword 尚未发布。");
  await expect(page.locator("#search-empty")).toContainText("公开页不会联网查词或调用 AI，也不会替访客创建草稿");
  const ownerRoute = page.getByRole("link", { name: "仅卓本人：去管理模式用 AI 整理 unpublishedtestword" });
  await expect(ownerRoute).toHaveAttribute("href", "http://127.0.0.1:4187/owner.html?input=unpublishedtestword");
  expect(aiRequestCount).toBe(0);

  await page.locator("#library-search").fill("unpublishedtestword & <script>");
  const encodedOwnerUrl = new URL(await page.locator("#search-owner-link").getAttribute("href"));
  expect(encodedOwnerUrl.pathname).toBe("/owner.html");
  expect(encodedOwnerUrl.searchParams.get("input")).toBe("unpublishedtestword & <script>");
  expect(aiRequestCount).toBe(0);

  await page.locator("#library-search").fill("jab at");
  await expect(page.locator("#search-empty")).toBeHidden();
  await expect(page.getByRole("button", { name: "查看 jab at 的完整词条" })).toBeVisible();
});

test("公开页带来的英文只在卓身份验证后预填，不自动调用 AI 或建立草稿", async ({ page }) => {
  let aiRequestCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/owner/ai/organize")) aiRequestCount += 1;
  });

  await page.goto("/owner.html?input=hip");
  await expect(page.locator("#owner-workspace")).toBeHidden();
  await expect(page.getByLabel("英文内容")).toHaveValue("");
  await page.getByRole("link", { name: "使用 GitHub 登录" }).click();
  await expect(page.getByRole("heading", { name: "卓的管理模式" })).toBeVisible();
  await expect(page.getByLabel("英文内容")).toHaveValue("hip");
  await expect(page.getByLabel("英文内容")).toBeFocused();
  await expect(page.locator("#capture-status")).toContainText("尚未调用 AI，也没有建立或发布草稿");
  await expect(page.locator("#draft-list > button")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("input")).toBe(false);
  expect(aiRequestCount).toBe(0);
});

test("管理链接拒绝超过 240 字符的输入且不消耗 AI", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  let aiRequestCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/owner/ai/organize")) aiRequestCount += 1;
  });
  await page.goto(`/owner.html?input=${"a".repeat(241)}`);
  await expect(page.getByRole("heading", { name: "卓的管理模式" })).toBeVisible();
  await expect(page.getByLabel("英文内容")).toHaveValue("");
  await expect(page.locator("#capture-status")).toContainText("不能超过 240 个字符");
  await expect(page.locator("#capture-status")).toContainText("未建立草稿，也没有调用 AI");
  expect(aiRequestCount).toBe(0);
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
  let publishEnvelope = null;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/v1/owner/publish")) {
      publishEnvelope = request.postDataJSON();
    }
  });
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await addWithAi(page, "jab at");
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("jab at");
  await expect(page.getByRole("combobox", { name: "类型", exact: true })).toHaveValue("phrase");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(/猛戳/);
  await context.addCookies([{ name: "e2e_ai_fail", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await page.getByLabel("英文内容").fill("jab at");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.locator("#capture-status")).toContainText("已有本地草稿，没有重复创建");
  await expect(page.locator("#capture-status")).toContainText("没有重复消耗 AI 额度");
  await expect(page.locator("#draft-list > button")).toHaveCount(1);
  await publishOpenDraft(page);
  expect(publishEnvelope).toMatchObject({ clientProtocol: "v38", queueProtocol: "v38" });
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.reload();
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.getByLabel("英文内容").fill("jab at");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.locator("#capture-status")).toContainText("已建立编辑草稿");
  await expect(page.locator("#capture-status")).toContainText("不会新增第二条公开记录");
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.locator("#capture-status")).toContainText("已打开现有编辑草稿");
  await expect(page.locator("#draft-list > button")).toHaveCount(2);
});

test("顶部 AI 会补全同一份未完成草稿，完整后重复输入不再消耗额度", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  let aiRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/ai/organize")) aiRequestCount += 1;
  });
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("hip");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("");
  await expect(page.locator("#draft-completion-notice")).toBeVisible();
  await expect(page.locator("#draft-completion-message")).toContainText("中文释义、英文释义、IPA 音标、词性");
  await page.getByLabel("中文释义", { exact: true }).fill("卓手工释义");
  await expect(page.locator("#draft-list > button")).toHaveCount(1);

  await page.getByRole("button", { name: "补全这份草稿" }).click();
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("/hɪp/");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("卓手工释义");
  await expect(page.getByLabel("词性", { exact: true })).toHaveValue("noun · adjective");
  await expect(page.locator("#draft-completion-notice")).toBeHidden();
  await expect(page.locator("#draft-list > button")).toHaveCount(1);
  expect(aiRequestCount).toBe(1);

  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.locator("#capture-status")).toContainText("没有重复消耗 AI 额度");
  await expect(page.locator("#draft-list > button")).toHaveCount(1);
  expect(aiRequestCount).toBe(1);
});

test("已由 AI 整理但 IPA 被清空的旧草稿会重新补全音标", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  let aiRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/ai/organize")) aiRequestCount += 1;
  });
  await loginOwner(page);
  await addWithAi(page, "hip");
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("/hɪp/");

  await page.getByLabel("IPA", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存本地草稿" }).click();
  await expect(page.locator("#draft-completion-notice")).toBeVisible();
  await expect(page.locator("#draft-completion-message")).toContainText("IPA 音标");

  await page.getByLabel("英文内容").fill("hip");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("/hɪp/");
  await expect(page.locator("#draft-completion-notice")).toBeHidden();
  await expect(page.locator("#capture-status")).toContainText("候选已写入草稿");
  expect(aiRequestCount).toBe(2);
});

test("顶部整理和草稿补全的快速双击共用全局锁，只请求一次且按钮全程锁定", async ({ context, page }) => {
  await context.addCookies([
    { name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" },
    { name: "e2e_ai_delay", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }
  ]);
  let aiRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/ai/organize")) aiRequestCount += 1;
  });
  await loginOwner(page);

  await page.getByLabel("英文内容").fill("rapidtopword");
  await page.locator("#capture-form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "建立手动草稿" })).toBeDisabled();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("自动整理的测试释义");
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeEnabled();
  await expect(page.locator("#draft-list > button")).toHaveCount(1);
  expect(aiRequestCount).toBe(1);

  await page.getByLabel("英文内容").fill("hip");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await expect(page.locator("#draft-list > button")).toHaveCount(2);
  await page.locator("#complete-draft").evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "建立手动草稿" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "重新用 AI 整理" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "补全这份草稿" })).toBeDisabled();
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("/hɪp/");
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeEnabled();
  await expect(page.locator("#draft-list > button")).toHaveCount(2);
  expect(aiRequestCount).toBe(2);

  await page.getByLabel("英文内容").fill("manualrapidword");
  await page.locator("#manual-button").evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#draft-list > button")).toHaveCount(3);
  expect(aiRequestCount).toBe(2);
});

test("前端拒绝保存声称已锁定音标却缺少 IPA 的自相矛盾响应", async ({ context, page }) => {
  await context.addCookies([
    { name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" },
    { name: "e2e_ai_contract_break", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }
  ]);
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("hip");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.locator("#capture-status")).toContainText("AI 响应自相矛盾");
  await expect(page.locator("#capture-status")).toContainText("当前草稿没有被 AI 覆盖");
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("");
  await expect(page.locator("#draft-list > button")).toHaveCount(1);
});

test("公开页在 focus、重新可见、恢复联网和 30 秒前台轮询时获取最新快照且不整页重载", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-28T19:00:00.000Z") });

  await page.goto("/");
  await expect(page.locator("#entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT));
  const documentIdentity = await page.evaluate(() => {
    window.__freshnessDocumentIdentity = crypto.randomUUID();
    return window.__freshnessDocumentIdentity;
  });

  await page.evaluate((term) => fetch("/__e2e__/append-public", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term })
  }).then((response) => { if (!response.ok) throw new Error(`append failed: ${response.status}`); }), "focusfresh");
  await page.clock.fastForward(3_100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "查看 focusfresh 的完整词条" })).toBeVisible();

  await page.evaluate((term) => fetch("/__e2e__/append-public", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term })
  }).then((response) => { if (!response.ok) throw new Error(`append failed: ${response.status}`); }), "visiblefresh");
  await page.clock.fastForward(3_100);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "查看 visiblefresh 的完整词条" })).toBeVisible();

  await page.evaluate((term) => fetch("/__e2e__/append-public", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term })
  }).then((response) => { if (!response.ok) throw new Error(`append failed: ${response.status}`); }), "onlinefresh");
  await page.clock.fastForward(3_100);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("button", { name: "查看 onlinefresh 的完整词条" })).toBeVisible();

  await page.evaluate((term) => fetch("/__e2e__/append-public", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term })
  }).then((response) => { if (!response.ok) throw new Error(`append failed: ${response.status}`); }), "pollfresh");
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("button", { name: "查看 pollfresh 的完整词条" })).toBeVisible();
  expect(await page.evaluate(() => window.__freshnessDocumentIdentity)).toBe(documentIdentity);
});

test("即时源短暂失败时旧的 Pages 备用快照不能把公开页回滚", async ({ context, page }) => {
  await page.clock.install({ time: new Date("2026-08-28T19:00:00.000Z") });
  await page.goto("/");
  await page.evaluate((term) => fetch("/__e2e__/append-public", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term })
  }).then((response) => { if (!response.ok) throw new Error(`append failed: ${response.status}`); }), "neverrollback");
  await page.clock.fastForward(3_100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "查看 neverrollback 的完整词条" })).toBeVisible();
  await expect(page.locator("#entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT + 1));

  await context.addCookies([
    { name: "e2e_public_fail", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" },
    { name: "e2e_pages_stale", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }
  ]);
  await page.clock.fastForward(3_100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "查看 neverrollback 的完整词条" })).toBeVisible();
  await expect(page.locator("#entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT + 1));
});

test("AI 只保留卓实际输入过的单向同义词，不创建候选词条且重复输入不消耗 AI", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  let aiRequestCount = 0;
  const aiRequests = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/ai/organize")) {
      aiRequestCount += 1;
      aiRequests.push(request.postDataJSON());
    }
  });

  await loginOwner(page);
  await addWithAi(page, "alleviate");
  await expect(page.locator("#field-synonyms")).toHaveValue("");
  await expect(page.locator("#draft-list > button")).toHaveCount(1);
  await expect(page.locator("#owner-entry-count")).toHaveText("0");
  expect(aiRequests[0]).toEqual({ input: "alleviate", allowedSynonyms: [] });
  await publishOpenDraft(page);
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await expect(page.locator(".owner-entry-row", { hasText: "alleviate" }).locator(".owner-entry-synonyms")).toBeHidden();
  expect(aiRequestCount).toBe(1);

  await page.goto("/");
  await expect(page.locator("#entry-count")).toHaveText("1");
  const alleviateCard = page.locator(".word-card", { hasText: "alleviate" });
  await expect(alleviateCard.locator(".card-synonyms")).toBeHidden();
  const publicSearch = page.getByLabel("搜索卓已发布的英文、中文、同义词、标签或作者（不是在线词典）");
  await publicSearch.fill("mitigate");
  await expect(page.locator(".word-card")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出公开词库 JSON" }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.entries).toHaveLength(1);
  expect(exported.entries[0]).toMatchObject({ term: "alleviate", synonyms: [] });

  await page.goto("/owner.html");
  await expect(page.getByRole("heading", { name: "卓的管理模式" })).toBeVisible();
  await addWithAi(page, "ease");
  await expect(page.locator("#field-synonyms")).toHaveValue("alleviate");
  await expect(page.locator("#draft-list > button")).toHaveCount(2);
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  expect(aiRequests[1]).toEqual({ input: "ease", allowedSynonyms: ["alleviate"] });
  await publishOpenDraft(page);
  await expect(page.locator("#owner-entry-count")).toHaveText("2");
  expect(aiRequestCount).toBe(2);

  await page.locator("#owner-search").fill("ease");
  await expect(page.locator(".owner-entry-row")).toHaveCount(1);
  await expect(page.locator(".owner-entry-row strong").first()).toHaveText("ease");
  await expect(page.locator(".owner-entry-row").first()).toContainText("同义词：alleviate");
  await page.locator("#owner-search").fill("alleviate");
  await expect(page.locator(".owner-entry-row")).toHaveCount(2);
  await expect(page.locator(".owner-entry-row strong").first()).toHaveText("alleviate");

  await page.goto("/");
  await publicSearch.fill("ease");
  await expect(page.locator(".word-card")).toHaveCount(1);
  await expect(page.locator(".word-card h3").first()).toHaveText("ease");
  await expect(page.locator(".word-card").first()).toContainText("同义词：alleviate");
  await page.getByRole("button", { name: "查看 ease 的完整词条" }).click();
  const detailSynonyms = page.getByRole("dialog").locator(".detail-synonyms");
  await expect(detailSynonyms.locator(".sense-field-label")).toHaveText("同义词");
  await expect(detailSynonyms.locator("p")).toHaveText("alleviate");
  await page.getByRole("button", { name: "关闭词条详情" }).click();
  await publicSearch.fill("alleviate");
  await expect(page.locator(".word-card")).toHaveCount(2);
  await expect(page.locator(".word-card h3").first()).toHaveText("alleviate");
  const linkedDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出公开词库 JSON" }).click();
  const linkedDownload = await linkedDownloadPromise;
  const linkedExport = JSON.parse(await readFile(await linkedDownload.path(), "utf8"));
  expect(linkedExport.entries.find((entry) => entry.term === "alleviate")?.synonyms).toEqual([]);
  expect(linkedExport.entries.find((entry) => entry.term === "ease")?.synonyms).toEqual(["alleviate"]);
  await publicSearch.fill("lessen");
  await expect(page.locator(".word-card")).toHaveCount(0);

  await page.goto("/owner.html");
  await page.getByLabel("英文内容").fill("ease");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.locator("#capture-status")).toContainText(/已有|已建立|已打开/);
  await expect(page.locator("#owner-entry-count")).toHaveText("2");
  expect(aiRequestCount).toBe(2);
});

test("旧本地草稿中的未输入同义词会在发布前移除", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  let publishedEntry = null;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/publish")) {
      publishedEntry = request.postDataJSON()?.mutation?.entry || null;
    }
  });

  await loginOwner(page);
  await page.evaluate(async () => {
    const { createBlankEntry } = await import("/js/wordbook-schema.js");
    const entry = createBlankEntry("temper");
    entry.meaning = "使缓和；使温和";
    entry.definition = "To make something less severe or intense.";
    entry.phonetic = "/ˈtempə/";
    entry.partOfSpeech = "verb";
    entry.exampleEn = "Time tempered their anger.";
    entry.exampleZh = "时间缓和了他们的愤怒。";
    entry.usage = "A complete legacy draft for E2E migration coverage.";
    entry.senses = [{
      partOfSpeech: "verb",
      meaningZh: entry.meaning,
      definitionEn: entry.definition,
      usageNotes: entry.usage,
      register: "neutral",
      collocations: [],
      examples: [{ en: entry.exampleEn, zh: entry.exampleZh }],
      confusables: []
    }];
    entry.synonyms = ["mitigate", "soothe"];
    const now = new Date().toISOString();
    const request = indexedDB.open("wordbook-db", 6);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put({
      schemaVersion: 1,
      id: "legacy-draft-with-unentered-synonyms",
      scope: "owner-public",
      mode: "create",
      entryId: entry.id,
      value: entry,
      base: { entry: null, entryUpdatedAt: null, remoteSha: "a".repeat(40) },
      localState: "local_saved",
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      lastOperationId: null,
      contentRevision: 1
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "卓的管理模式" })).toBeVisible();
  await page.locator("#draft-list > button", { hasText: "temper" }).click();
  await expect(page.locator("#field-synonyms")).toHaveValue("");
  await publishOpenDraft(page);
  expect(publishedEntry).toMatchObject({ term: "temper", synonyms: [] });
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
});

test("前端拒绝 200 响应中的空中文并在同一草稿就地重试", async ({ context, page }) => {
  await context.addCookies([
    { name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" },
    { name: "e2e_ai_empty_meaning", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }
  ]);
  await loginOwner(page);
  await addWithAi(page, "hip");
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#editor-ai-message")).toContainText("中文释义没有有效汉字");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "重试补全这份草稿" })).toBeVisible();
  await expect(page.locator("#draft-list > button")).toHaveCount(1);

  await context.addCookies([{ name: "e2e_ai_empty_meaning", value: "0", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await page.getByRole("button", { name: "重试补全这份草稿" }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(/髋部/);
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "success");
  await expect(page.locator("#draft-list > button")).toHaveCount(1);
});

test("AI 等待时明确标示空白不是结果，切换草稿后仍后台保存原请求", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("draft b");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("B 的人工释义");
  await page.getByRole("button", { name: "保存本地草稿" }).click();

  let markStarted;
  let releaseRequest;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const held = new Promise((resolve) => { releaseRequest = resolve; });
  await page.route("**/api/v1/owner/ai/organize", async (route) => {
    if (route.request().postDataJSON()?.input === "backgroundword") {
      markStarted();
      await held;
    }
    await route.continue();
  });

  await page.getByLabel("英文内容").fill("backgroundword");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await started;
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "busy");
  await expect(page.locator("#editor-ai-message")).toContainText("当前空白");
  await expect(page.locator("#editor-ai-message")).toContainText("不是查询结果");
  await expect(page.locator("#entry-form")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#organize-button")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#organize-button .button-busy-label")).toBeVisible();

  await page.locator("#draft-list").getByRole("button", { name: /draft b/ }).click();
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("draft b");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("B 的人工释义");
  await expect(page.locator("#editor-ai-status")).toBeHidden();
  await expect(page.locator("#entry-form")).not.toHaveAttribute("aria-busy", "true");
  releaseRequest();
  await expect(page.locator("#capture-status")).toContainText("已在后台完成并保存");
  await expect(page.locator("#organize-button")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("draft b");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("B 的人工释义");

  await page.locator("#draft-list").getByRole("button", { name: /backgroundword/ }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("自动整理的测试释义");
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "success");
});

test("无法可靠对齐的本地词典多义词保留中文但保持待复核且不能直接发布", async ({ context, page }) => {
  await context.addCookies([
    { name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" },
    { name: "e2e_dictionary_review", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }
  ]);
  let publishRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/publish")) publishRequests += 1;
  });
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("bank");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(/银行[\s\S]*河岸/);
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "review");
  await expect(page.locator("#editor-ai-message")).toContainText("已保留有效中文候选");
  await expect(page.getByRole("button", { name: "继续用 AI 补全" })).toBeVisible();
  await expect(page.locator("#draft-completion-notice")).toBeVisible();
  await expect(page.locator("#draft-completion-message")).toContainText("可靠对齐的分义项");
  await expect(page.getByLabel("标签", { exact: true })).toHaveValue(/待复核/);
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.locator("#editor-error")).toContainText("中英文义项尚未可靠对齐");
  await expect(page.locator("#editor-error")).toContainText("移除“待复核”");
  expect(publishRequests).toBe(0);

  await page.getByLabel("中文释义", { exact: true }).fill("卓人工核对的银行释义");
  await page.getByLabel("Usage notes", { exact: true }).fill(`${await page.getByLabel("Usage notes", { exact: true }).inputValue()}\n卓人工笔记`);
  await context.addCookies([
    { name: "e2e_dictionary_review", value: "0", url: "http://127.0.0.1:4187", sameSite: "Lax" }
  ]);
  await page.getByRole("button", { name: "补全这份草稿" }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("卓人工核对的银行释义");
  await expect(page.getByLabel("English definition", { exact: true })).toHaveValue("A test definition.");
  await expect(page.getByLabel("Usage notes", { exact: true })).toHaveValue(/卓人工笔记/);
  await expect(page.getByLabel("标签", { exact: true })).not.toHaveValue(/待复核|ECDICT 原始释义/);
  await expect(page.locator("#sense-list .sense-item")).toHaveCount(1);
  await expect(page.locator("#draft-completion-notice")).toBeHidden();
});

test("缺少双语例句的本地词典 200 响应降级为待复核而不是成功", async ({ context, page }) => {
  await context.addCookies([
    { name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" },
    { name: "e2e_dictionary_no_examples", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }
  ]);
  let publishRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/publish")) publishRequests += 1;
  });
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("hip");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(/髋部/);
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "review");
  await expect(page.locator("#editor-ai-message")).toContainText("缺少双语例句");
  await expect(page.getByLabel("标签", { exact: true })).toHaveValue(/待复核/);
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.locator("#editor-error")).toContainText("不能当作 AI 整理成功直接发布");
  expect(publishRequests).toBe(0);

  await context.addCookies([
    { name: "e2e_dictionary_no_examples", value: "0", url: "http://127.0.0.1:4187", sameSite: "Lax" }
  ]);
  await page.getByRole("button", { name: "继续用 AI 补全" }).click();
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "success");
  await expect(page.locator("#sense-list .sense-item")).toHaveCount(2);
  await expect(page.locator("#sense-list .sense-example").first()).toHaveText("She injured her hip while running.");
  await expect(page.locator("#sense-list .sense-example-zh").first()).toHaveText("她跑步时伤了髋部。");
  await expect(page.getByLabel("标签", { exact: true })).not.toHaveValue(/待复核|ECDICT 原始释义/);
  await expect(page.locator("#draft-completion-notice")).toBeHidden();
});

test("重新整理已发布词条时保留远端身份并正常更新而不是新增", async ({ page }) => {
  await loginOwner(page);
  const beforePayload = await (await page.request.get("/api/v1/owner/wordbook")).json();
  const beforeEntry = beforePayload.snapshot.entries.find((entry) => entry.term === "jab at");
  await page.locator(".owner-entry-row", { hasText: "jab at" }).getByRole("button", { name: "编辑" }).click();
  await page.getByRole("button", { name: "重新用 AI 整理" }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(/猛戳/);
  await publishOpenDraft(page);
  await expect(page.locator("#owner-entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT));
  await expect(page.locator(".owner-entry-row", { hasText: "jab at" })).toHaveCount(1);
  const afterPayload = await (await page.request.get("/api/v1/owner/wordbook")).json();
  const afterEntry = afterPayload.snapshot.entries.find((entry) => entry.term === "jab at");
  expect(afterEntry.id).toBe(beforeEntry.id);
  expect(afterEntry.revision).toBe(beforeEntry.revision + 1);
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
  await expect(page.locator("#capture-status")).toContainText("公开词条已存在");
  await expect(page.locator("#capture-status")).toContainText("不会新增第二条公开记录");
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.goto("/");
  await page.locator("#library-search").fill("hip");
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
  await page.locator("#library-search").fill("quotation");
  await page.getByRole("button", { name: `查看 ${quote} 的完整词条` }).click();
  await expect(page.getByText(/出处未核验/).first()).toBeVisible();
});

test("AI 故障回退到手动草稿，不会丢失输入", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_ai_fail", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await addWithAi(page, "fallbackword");
  await expect(page.locator("#capture-status")).toContainText("草稿仍可手动填写");
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#editor-ai-message")).toContainText("AI 测试故障");
  await expect(page.getByRole("button", { name: "重试补全这份草稿" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "建立手动草稿" })).toBeEnabled();
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("fallbackword");
  await context.addCookies([{ name: "e2e_ai_fail", value: "0", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await page.getByRole("button", { name: "重试补全这份草稿" }).click();
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("自动整理的测试释义");
  await expect(page.locator("#editor-ai-status")).toHaveAttribute("data-state", "success");
  await publishOpenDraft(page);
});

test("离线时只保留手动草稿能力并禁用全部 AI 补全入口", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("offlineword");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await expect(page.locator("#draft-completion-notice")).toBeVisible();

  await context.setOffline(true);
  await expect(page.locator("#network-chip")).toContainText("离线");
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "补全这份草稿" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "重新用 AI 整理" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "建立手动草稿" })).toBeEnabled();

  await context.setOffline(false);
  await expect(page.locator("#network-chip")).toHaveText("在线");
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "补全这份草稿" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "重新用 AI 整理" })).toBeEnabled();
});

test("AI 返回较慢时保留卓已经输入的人工修改", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_ai_delay", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("slowword");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.getByRole("heading", { name: /slowword/ })).toBeVisible();
  await page.getByLabel("中文释义", { exact: true }).fill("卓在等待 AI 时手动写的释义");
  await page.getByLabel("IPA", { exact: true }).fill("/ˈsləʊ.wɜːd/");
  await expect(page.locator("#capture-status")).toContainText("人工修改已保留");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("卓在等待 AI 时手动写的释义");
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("/ˈsləʊ.wɜːd/");
  await expect(page.locator("#entry-form")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#entry-form")).not.toHaveAttribute("aria-busy", "true");
});

test("AI 请求期间曾编辑后重新清空 IPA 也按卓的最终选择保留", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_empty", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await loginOwner(page);
  await addWithAi(page, "hip");
  await page.getByLabel("IPA", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存本地草稿" }).click();
  await context.addCookies([{ name: "e2e_ai_delay", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);

  await page.getByRole("button", { name: "重新用 AI 整理" }).click();
  await expect(page.getByRole("button", { name: "重新用 AI 整理" })).toBeDisabled();
  await page.getByLabel("IPA", { exact: true }).fill("/temporary/");
  await page.getByLabel("IPA", { exact: true }).fill("");

  await expect(page.locator("#capture-status")).toContainText("人工修改已保留");
  await expect(page.getByLabel("IPA", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(/髋部/);
  await expect(page.locator("#entry-form")).not.toHaveAttribute("inert", "");
});

test("AI 尚未返回时再次程序化提交也被全局锁拒绝", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_ai_delay", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  let aiRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/owner/ai/organize")) aiRequestCount += 1;
  });
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("firstslowword");
  await page.getByRole("button", { name: "AI 自动整理" }).click();
  await expect(page.getByRole("heading", { name: /firstslowword/ })).toBeVisible();

  await page.getByLabel("英文内容").fill("secondslowword");
  await page.locator("#capture-form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#capture-status")).toContainText("已有一项 AI 整理正在进行");
  await expect(page.getByRole("heading", { name: /secondslowword/ })).toHaveCount(0);
  await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue("firstslowword");
  await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue("自动整理的测试释义", { timeout: 8_000 });
  await expect(page.getByRole("button", { name: "AI 自动整理" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "建立手动草稿" })).toBeEnabled();
  await expect(page.locator("#draft-list").getByRole("button", { name: /firstslowword/ })).toHaveCount(1);
  await expect(page.locator("#draft-list").getByRole("button", { name: /secondslowword/ })).toHaveCount(0);
  expect(aiRequestCount).toBe(1);
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
  await expect(page.locator("#owner-entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT));
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
  await expect(page.locator("#owner-entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT));
  await page.locator("#draft-list").getByRole("button", { name: /reviewword/ }).click();
  await expect(page.locator("#capture-status")).toContainText("旧任务已取消");
  await publishOpenDraft(page);
  await expect(page.locator("#owner-entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT + 1));
});

test("OAuth 初始化期间的 online 事件不能抢在遗留队列复核前自动发布", async ({ context, page }) => {
  await loginOwner(page);
  await page.getByLabel("英文内容").fill("oauthraceword");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("OAuth 恢复窗口不应自动发布");
  await context.setOffline(true);
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.getByText("等待同步", { exact: true }).first()).toBeVisible();
  expectedOfflineNetworkError = true;
  await page.reload();
  await expect(page.locator("#owner-workspace")).toBeHidden();

  await context.addCookies([{ name: "e2e_owner_delay", value: "1", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator("#owner-workspace")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(page.getByText("等待卓本人复核", { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("#owner-entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT));
  await expect(page.locator(".owner-entry-row", { hasText: "oauthraceword" })).toHaveCount(0);
});

test("另一个已登录页面不能领取并发布不属于本次页面点击的队列任务", async ({ context, page }) => {
  await loginOwner(page);
  const otherPage = await context.newPage();
  otherPage.on("pageerror", (error) => browserErrors.push(`second pageerror: ${error.message}`));
  otherPage.on("console", (message) => {
    const expectedOfflineFailure = expectedOfflineNetworkError && message.text() === "Failed to load resource: net::ERR_FAILED";
    if (message.type() === "error" && !expectedOfflineFailure && !message.text().startsWith("Failed to load resource: the server responded with a status of")) {
      browserErrors.push(`second console: ${message.text()}`);
    }
  });
  await otherPage.goto("/owner.html");
  await expect(otherPage.getByRole("heading", { name: "卓的管理模式" })).toBeVisible();
  let publishRequests = 0;
  const countPublishRequest = (request) => {
    if (request.method() === "POST" && request.url().includes("/api/v1/owner/publish")) publishRequests += 1;
  };
  page.on("request", countPublishRequest);
  otherPage.on("request", countPublishRequest);

  await page.getByLabel("英文内容").fill("crossrunword");
  await page.getByRole("button", { name: "建立手动草稿" }).click();
  await page.getByLabel("中文释义", { exact: true }).fill("只能由收到发布点击的页面提交");
  await context.setOffline(true);
  await expect(page.locator("#network-chip")).toContainText("离线");
  await page.getByRole("button", { name: "发布到 GitHub" }).click();
  await expect(page.getByText("等待同步", { exact: true }).first()).toBeVisible();
  expectedOfflineNetworkError = true;
  await page.close();

  await context.setOffline(false);
  await otherPage.waitForTimeout(1_200);
  expect(publishRequests).toBe(0);
  await expect(otherPage.locator("#owner-entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT));

  await otherPage.reload();
  await expect(otherPage.getByText("等待卓本人复核", { exact: true })).toBeVisible();
  await expect(otherPage.locator("#owner-entry-count")).toHaveText(String(CANONICAL_ENTRY_COUNT));
  await expect(otherPage.locator(".owner-entry-row", { hasText: "crossrunword" })).toHaveCount(0);
  expect(publishRequests).toBe(0);
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
  await page.locator("#library-search").fill("xssword");
  await page.getByRole("button", { name: "查看 xssword 的完整词条" }).click();
  await expect(page.getByRole("dialog").getByText(/<img src=x onerror=window.__xss=1>/).first()).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBe(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe("http://127.0.0.1:4187/");
  const manifest = await page.evaluate(async () => fetch(document.querySelector('link[rel="manifest"]').href).then((response) => response.json()));
  expect(manifest).toMatchObject({ name: "卓的公开词库", start_url: "./", scope: "./", display: "standalone" });
});

test("375px 手机宽度无横向溢出，主要按钮和键盘焦点可用", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByText(/已即时同步最新公开词库|已读取 GitHub Pages 备用快照/)).toBeVisible();
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
  const searchBox = page.locator("#library-search");
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
    await page.locator("#library-search").fill("jab at");
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
