import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dictionaryExampleBucket, DICTIONARY_EXAMPLE_SOURCE } from "../../../vocab/js/dictionary-examples.js";

const ORIGIN = "http://127.0.0.1:4187", API = `${ORIGIN}/api/v1/member`;
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const snapshot = await json("../../../vocab/data/owner-wordbook.json");
const manifest = await json("../../../vocab/data/dictionary-examples/manifest-v2.json");
const examples = new Map();
for (const term of ["agitated", "shrug", "quagmire"]) {
  const descriptor = manifest.shards[dictionaryExampleBucket(term)];
  const shard = await json(`../../../vocab/data/dictionary-examples/${descriptor.file}`);
  examples.set(term, shard.entries.find(row => row.term === term));
}
const agitated = snapshot.entries.find(entry => entry.term === "agitated");
const sidecar = page => page.locator(".dictionary-learning-examples");
const requestsForExamples = page => {
  const requests = [];
  page.on("request", request => { if (new URL(request.url()).pathname.includes("/data/dictionary-examples/")) requests.push(request); });
  return requests;
};
async function chapter(page) {
  await page.goto("/?book=never-let-me-go&chapter=chapter-1");
  await expect(page.locator("#entry-count")).toHaveText("29");
}
async function card(page, term) {
  await page.getByRole("button", { name: `查看 ${term} 的完整词条`, exact: true }).click();
  await expect(page.locator("#dialog-term")).toHaveText(term);
}
async function expectExamples(page, term) {
  const view = sidecar(page), row = examples.get(term);
  await expect(view).toHaveAttribute("data-term", term);
  expect(DICTIONARY_EXAMPLE_SOURCE).toBe("原创例句·AI复核（精选义项）");
  await expect(view.locator(".dictionary-learning-source")).toHaveText("原创学习例句");
  await expect(view.locator(".dictionary-learning-note")).toHaveText("以下为独立学习例句，按各自词性和义项阅读，不是书中原句。");
  await expect(view.locator(".dictionary-learning-sense")).toHaveCount(row.senses.length);
  for (const [index, sense] of row.senses.entries()) {
    const item = view.locator(".dictionary-learning-sense").nth(index);
    await expect(item.locator("h4")).toHaveText(`${sense.partOfSpeech} · ${sense.meaningZh}`);
    await expect(item.locator('[lang="en"]')).toHaveText(sense.examples.map(pair => pair.en));
    await expect(item.locator('[lang="zh-CN"]')).toHaveText(sense.examples.map(pair => pair.zh));
  }
  await expect(view).not.toContainText(/本次义项|匹配书中/u);
}
async function api(context, method, path, data, session, mode = "member") {
  return context.request.fetch(`${API}/${path}`, { method,
    headers: { "X-Wordbook-Auth": mode, "X-Wordbook-Fields": "partOfSpeech",
      ...(method === "GET" ? {} : { Origin: ORIGIN, "Content-Type": "application/json" }),
      ...(session ? { "X-CSRF-Token": session.csrfToken } : {}) },
    ...(data === undefined ? {} : { data }) });
}
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  const id = createHash("sha256").update(info.testId).digest("hex").slice(0, 24);
  await context.addCookies([{ name: "e2e_run", value: `card-examples-${id}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw error; });
});

test("mobile public details load one optional bucket while preserving the learning example and book source", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = requestsForExamples(page), writes = [];
  page.on("request", request => { if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(request.url()); });
  await chapter(page);
  expect(requests).toHaveLength(0);
  await card(page, "agitated"); await expectExamples(page, "agitated");
  await expect(page.locator("#dialog-example-en")).toHaveText(agitated.exampleEn);
  await expect(page.locator("#dialog-example-zh")).toHaveText(agitated.exampleZh);
  await expect(page.locator("#dialog-example-section h3")).toHaveText("原有学习例句");
  await expect(page.locator("#dialog-source-examples .book-passage-text")).not.toBeEmpty();
  expect(requests).toHaveLength(2);
  expect(requests.every(request => new URL(request.url()).origin === ORIGIN && !new URL(request.url()).search)).toBe(true);
  await sidecar(page).scrollIntoViewIfNeeded();
  expect(await sidecar(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.locator("#entry-dialog").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("public-card-examples-mobile.png") });
  expect(writes).toEqual([]);
  expect(await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates())).toEqual([]);
});

test("closing a delayed card and opening another cannot display the earlier card's late example", async ({ page }) => {
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; }), seen = new Promise(resolve => { reached = resolve; });
  const file = manifest.shards[dictionaryExampleBucket("agitated")].file;
  await page.route(`**/data/dictionary-examples/${file}`, async route => { reached(); await gate; await route.continue().catch(() => {}); });
  try {
    await chapter(page); await card(page, "agitated"); await seen;
    await expect(sidecar(page).locator(".dictionary-learning-status")).toContainText("正在读取");
    await page.keyboard.press("Escape");
    await expect(sidecar(page)).toBeHidden();
    await card(page, "shrug"); await expectExamples(page, "shrug");
    release();
    await expect(sidecar(page)).not.toContainText(examples.get("agitated").senses[0].examples[0].en);
    await expect(page.locator("#dialog-term")).toHaveText("shrug");
  } finally { release(); }
});

test("unavailable optional examples preserve the original card and can be retried", async ({ page }) => {
  let calls = 0;
  await page.route("**/data/dictionary-examples/manifest-v2.json", route => ++calls === 1
    ? route.fulfill({ status: 503, body: "Synthetic optional-data outage" }) : route.continue());
  await chapter(page); await card(page, "agitated");
  await expect(sidecar(page).getByRole("button", { name: "重试学习例句" })).toBeVisible();
  await expect(page.locator("#dialog-example-en")).toHaveText(agitated.exampleEn);
  await expect(page.locator("#dialog-meaning")).not.toBeEmpty();
  await sidecar(page).getByRole("button", { name: "重试学习例句" }).click();
  await expectExamples(page, "agitated");
  await expect(page.locator("#dialog-example-en")).toHaveText(agitated.exampleEn);
});

test("public recall and rating never start optional example requests or add retry controls", async ({ page }) => {
  const requests = requestsForExamples(page);
  await chapter(page); await page.locator("#study-button").click();
  await expect(page.locator("#recall-reveal")).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.locator("#recall-reveal").click();
  await expect(sidecar(page)).toBeHidden();
  await expect(page.locator('#dialog-review-actions [data-rating="good"]')).toBeEnabled();
  await page.locator('#dialog-review-actions [data-rating="good"]').click();
  await expect(page.locator("#recall-reveal")).toBeVisible();
  expect(requests).toHaveLength(0);
});

for (const mode of ["member", "github-owner"]) test(`${mode} saved details show separate selected-sense examples without changing account or learning data`, async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let session, term;
  if (mode === "github-owner") {
    await context.addCookies([{ name: "e2e_auth", value: "owner", url: ORIGIN }]);
    session = await (await api(context, "GET", "session", undefined, undefined, mode)).json();
    const selected = await api(context, "POST", "selections", { entryIds: [agitated.id], collectionId: "never-let-me-go", chapterId: "chapter-1", mutationId: randomUUID() }, session, mode);
    expect(selected.status()).toBe(200); term = "agitated";
  } else {
    const registered = await api(context, "POST", "register", { username: "card_examples", password: "Synthetic example test 密码 1234" });
    expect(registered.status()).toBe(200); session = await registered.json();
    const created = await api(context, "POST", "entries", { term: "quagmire", partOfSpeech: "noun", meaning: "困境（我的抽象语境）", note: "Keep this personal note.", mutationId: randomUUID() }, session);
    expect(created.status()).toBe(200); term = "quagmire";
  }
  const before = await (await api(context, "GET", "entries", undefined, undefined, mode)).json();
  const learning = await (await api(context, "GET", "learning", undefined, undefined, mode)).json();
  const requests = requestsForExamples(page), writes = [];
  page.on("request", request => { if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(request.url()); });
  await page.goto(`/personal.html?auth=${mode === "member" ? "member" : "owner"}`);
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  if (mode === "github-owner") {
    await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", false);
    await page.locator("#member-private-tools > summary").click();
    await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", true);
  }
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: `查看 ${term}`, exact: true }).click();
  await expectExamples(page, term);
  await expect(page.locator("#member-detail-meaning")).toHaveText(before.entries[0].meaning);
  if (mode === "github-owner") await expect(page.locator("#member-detail-example")).toContainText(before.entries[0].sourceContexts[0].exampleEn);
  else {
    await expect(page.locator("#member-detail-note")).toHaveText("Keep this personal note.");
    await expect(sidecar(page).locator("h4")).toContainText("泥潭");
    await expect(page.locator("#member-detail-meaning")).toContainText("困境");
  }
  await sidecar(page).scrollIntoViewIfNeeded();
  expect(await sidecar(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await (await api(context, "GET", "entries", undefined, undefined, mode)).json()).toEqual(before);
  expect(await (await api(context, "GET", "learning", undefined, undefined, mode)).json()).toEqual(learning);
  expect(writes).toEqual([]);
  await page.locator("#member-detail-close").click();
  await expect(sidecar(page)).toBeHidden();
});
