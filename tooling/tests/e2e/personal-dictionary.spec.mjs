import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const ORIGIN = "http://127.0.0.1:4187";
const API = `${ORIGIN}/api/v1/member`;
const DICTIONARY_PATH = "/data/member-dictionary.json";
const DICTIONARY_ROUTE = "**/data/member-dictionary.json*";
const PASSWORD = "synthetic local dictionary 密码 75";
const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const source = snapshot.entries.find(entry => entry.readingContexts?.some(context => context.meaning && context.definition && context.usage && context.exampleEn));
const sourceContext = source.readingContexts.find(context => context.meaning && context.definition && context.usage && context.exampleEn);
const [collectionId, chapterId] = sourceContext.membership.slice("collection:".length).split(":");
const runId = info => `dictionary-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`;
async function isolate(context, info) { await context.addCookies([{ name: "e2e_run", value: runId(info), url: ORIGIN }]); }

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await isolate(context, info);
  page.on("pageerror", error => { throw new Error(error.message); });
});

async function api(context, method, path, data, session, mode = "member", supportsPos = true) {
  return context.request.fetch(`${API}/${path}`, { method,
    headers: { "X-Wordbook-Auth": mode, ...(supportsPos ? { "X-Wordbook-Fields": "partOfSpeech" } : {}), ...(method === "GET" ? {} : { Origin: ORIGIN, "Content-Type": "application/json" }), ...(session ? { "X-CSRF-Token": session.csrfToken } : {}) },
    ...(data === undefined ? {} : { data }) });
}
async function seed(context, username = "alice_dictionary") {
  const response = await api(context, "POST", "register", { username, password: PASSWORD });
  expect(response.status()).toBe(200); return response.json();
}
async function entries(context, mode = "member") {
  const response = await api(context, "GET", "entries", undefined, undefined, mode);
  expect(response.status()).toBe(200); return (await response.json()).entries;
}
async function ready(page, username = "alice_dictionary") {
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-username")).toHaveText(`@${username}`);
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#member-learning-summary")).not.toContainText("正在读取");
}
async function open(page, username = "alice_dictionary", mode = "member") {
  // Dictionary prewarming is intentionally independent of account readiness.
  // Waiting for networkidle would conceal that contract and deadlock gated loads.
  await page.goto(`/personal.html?auth=${mode}`); await ready(page, username);
}
async function registerInBrowser(page, username = "new_dictionary") {
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-auth")).toBeVisible();
  await page.locator('[data-auth-view="register"]').click();
  await page.locator("#register-username").fill(username);
  await page.locator("#register-password").fill(PASSWORD);
  await page.locator("#member-register-form button[type=submit]").click();
  await expect(page.locator("#member-recovery")).toBeVisible();
  await page.locator("#member-recovery-ack").check();
  await page.locator("#member-recovery-continue").click();
  await ready(page, username);
  await expect(page.locator("#register-password")).toHaveValue("");
}
async function lookup(page, term) {
  await page.locator("#member-dictionary-term").fill(term);
  await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-result")).toBeVisible();
}
function row(page, term) { return page.locator(".personal-entry").filter({ has: page.getByRole("button", { name: `查看 ${term}`, exact: true }) }); }
async function selectSource(context, session, mode = "member") {
  const response = await api(context, "POST", "selections", { entryIds: [source.id], collectionId, chapterId, mutationId: randomUUID() }, session, mode);
  expect(response.status()).toBe(200); return response.json();
}
async function delayedDictionary(page) {
  let release, reached, requests = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { reached = resolve; });
  await page.route(DICTIONARY_ROUTE, async route => {
    requests++;
    const response = await route.fetch(); reached(); await gate;
    try { await route.fulfill({ response }); } catch { /* Navigation/abort can intentionally discard this request. */ }
  });
  return { release, seen, requests: () => requests };
}
async function revalidateFocus(page) {
  const session = page.waitForResponse(response => response.url() === `${API}/session` && response.request().method() === "GET");
  const list = page.waitForResponse(response => response.url() === `${API}/entries` && response.request().method() === "GET");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await session).status()).toBe(200); expect((await list).status()).toBe(200); await ready(page);
}

test("Enter finds hip locally with noun and adjective Chinese senses, without lookup API or third parties", async ({ context, page }) => {
  const dictionaryRequests = [];
  page.on("request", request => { if (new URL(request.url()).pathname === DICTIONARY_PATH) dictionaryRequests.push(request.url()); });
  await seed(context); await open(page);
  const calls = []; page.on("request", request => calls.push({ method: request.method(), url: request.url() }));
  await lookup(page, "hip");
  await expect(page.locator("#member-dictionary-word")).toHaveText("hip");
  await expect(page.locator("#member-dictionary-pos")).toContainText(/noun/u);
  await expect(page.locator("#member-dictionary-pos")).toContainText(/adjective/u);
  await expect(page.locator("#member-dictionary-meaning")).toContainText("髋部");
  await expect(page.locator("#member-dictionary-meaning")).toContainText("时髦");
  await expect(page.locator("#member-dictionary-use")).toBeEnabled();
  await expect(page.locator("#member-term")).toHaveValue("");
  expect(dictionaryRequests).toHaveLength(1);
  expect(new URL(dictionaryRequests[0]).searchParams.get("v")).toMatch(/^[a-f0-9]{64}$/u);
  expect(calls.some(call => new URL(call.url).pathname.endsWith("/data/ecdict-core.json"))).toBe(false);
  expect(calls.filter(call => new URL(call.url).origin !== ORIGIN || new URL(call.url).pathname.startsWith("/api/"))).toEqual([]);
  expect(await entries(context)).toEqual([]);
});

test("first browser registration is usable before a cold dictionary response, and Enter reuses the background request", async ({ context, page }) => {
  const delayed = await delayedDictionary(page);
  const requests = [];
  page.on("request", request => requests.push({ method: request.method(), url: request.url() }));
  try {
    await registerInBrowser(page);
    await delayed.seen;
    // A deliberately held static response must not block account/list readiness.
    await expect(page.locator("#member-term")).toBeEnabled();
    await expect(page.locator("#member-dictionary-term")).toBeEnabled();
    expect(await entries(context)).toEqual([]);
    const calls = [];
    page.on("request", request => calls.push(request.url()));
    await page.locator("#member-dictionary-term").fill("received");
    await page.locator("#member-dictionary-term").press("Enter");
    await expect(page.locator("#member-dictionary-search")).toBeDisabled();
    // Synthetic 250 ms network latency only; this is not a production benchmark.
    const started = Date.now();
    await page.waitForTimeout(250);
    delayed.release();
    await expect(page.locator("#member-dictionary-result")).toBeVisible();
    await expect(page.locator("#member-dictionary-word")).toHaveText("receive");
    await expect(page.locator("#member-dictionary-meaning")).toContainText("收");
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(4_000);
    expect(delayed.requests()).toBe(1);
    expect(requests.filter(request => new URL(request.url).pathname === DICTIONARY_PATH)).toHaveLength(1);
    expect(calls.filter(url => new URL(url).origin !== ORIGIN || new URL(url).pathname.startsWith("/api/"))).toEqual([]);
    expect(requests.filter(request => new URL(request.url).origin !== ORIGIN)).toEqual([]);
    await expect(page.locator("#member-term")).toHaveValue("");
    expect(await entries(context)).toEqual([]);
  } finally { delayed.release(); }
});

test("known explicit forms went, received and apples find their canonical cards without provider requests", async ({ context, page }) => {
  await seed(context); await open(page);
  const calls = []; page.on("request", request => calls.push(request.url()));
  for (const [form, word, chinese] of [["went", "go", /去|走/u], ["received", "receive", /收|接/u], ["apples", "apple", /苹果/u], ["yummy", "yummy", /美味|好吃/u], ["palatable", "palatable", /可口|接受/u]]) {
    await lookup(page, form);
    await expect(page.locator("#member-dictionary-word")).toHaveText(word);
    await expect(page.locator("#member-dictionary-meaning")).toContainText(chinese);
    await expect(page.locator("#member-dictionary-pos")).not.toHaveText("词性未标注");
  }
  expect(calls.filter(url => new URL(url).origin !== ORIGIN || new URL(url).pathname.startsWith("/api/"))).toEqual([]);
  await expect(page.locator("#member-term")).toHaveValue("");
  expect(await entries(context)).toEqual([]);
});

test("24/7 can be looked up with Enter, saved, reloaded and looked up again without a duplicate", async ({ context, page }) => {
  await seed(context); await open(page); await lookup(page, "24/7");
  await expect(page.locator("#member-dictionary-word")).toHaveText("24/7");
  await expect(page.locator("#member-dictionary-pos")).toContainText("adverb");
  await expect(page.locator("#member-dictionary-meaning")).toContainText(/全天|不间断/u);
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-term")).toHaveValue("24/7");
  await page.locator("#member-note").fill("My own round-the-clock note.");
  await page.locator("#member-save").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  const saved = (await entries(context))[0];
  expect(saved.term).toBe("24/7"); expect(saved.partOfSpeech).toContain("adverb");
  await page.reload(); await ready(page);
  await expect(row(page, "24/7")).toBeVisible();
  await lookup(page, "24/7"); await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-dictionary-status")).toContainText(/已经|不会重复/u);
  if (await page.locator("#member-save").isEnabled()) await page.locator("#member-save").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  const after = (await entries(context))[0];
  expect(after.id).toBe(saved.id); expect(after.meaning).toBe(saved.meaning); expect(after.note).toBe(saved.note);
});

test("public picker explains deployed snapshot fallback and server-confirms a checked public word when live reads fail", async ({ context, page }) => {
  let failedReads = 0;
  await page.route("**/api/v1/public/wordbook*", async route => {
    failedReads++;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "synthetic_unavailable", message: "Synthetic public service failure." } }) });
  });
  await seed(context); await open(page);
  await page.locator("#member-source-toggle").click();
  await expect(page.locator("#member-source-panel")).toBeVisible();
  await expect(page.locator("#member-source-status")).toContainText(/已部署|快照/u);
  await expect(page.locator("#member-source-status")).toContainText(/可能不是最新|可能非最新/u);
  expect(failedReads).toBeGreaterThanOrEqual(1);
  await page.locator("#member-source-book").selectOption(collectionId);
  await page.locator("#member-source-chapter").selectOption(chapterId);
  await page.locator("#member-source-search").fill(source.term);
  const choice = page.locator(`.source-select[data-entry-id="${source.id}"]`);
  await expect(choice).toBeVisible(); await choice.check();
  await expect(page.locator("#member-source-selected-count")).toContainText("已选 1 / 100");
  const submitted = page.waitForRequest(request => request.url() === `${API}/selections` && request.method() === "POST");
  const confirmed = page.waitForResponse(response => response.url() === `${API}/selections` && response.request().method() === "POST");
  await page.locator("#member-source-add").click();
  const payload = (await submitted).postDataJSON();
  expect(payload.entryIds).toEqual([source.id]);
  expect(Object.hasOwn(payload, "meaning")).toBe(false);
  expect((await confirmed).status()).toBe(200);
  await expect(page.locator("#member-source-status")).toContainText("已确认");
  await expect(row(page, source.term)).toBeVisible();
  const saved = (await entries(context))[0];
  expect(saved.sourceContexts.some(item => item.entryId === source.id && item.chapterId === chapterId)).toBe(true);
  expect(saved.sourceContexts.find(item => item.chapterId === chapterId).meaning).toBe(sourceContext.meaning);
});

test("already published perspicacious and jab at are included in the same local lookup index", async ({ context, page }) => {
  await seed(context); await open(page);
  const calls = []; page.on("request", request => calls.push(request.url()));
  for (const [word, chinese] of [["perspicacious", /洞察|判断/u], ["jab at", /猛戳|猛刺|抨击/u]]) {
    await lookup(page, word);
    await expect(page.locator("#member-dictionary-word")).toHaveText(word);
    await expect(page.locator("#member-dictionary-meaning")).toContainText(chinese);
    await expect(page.locator("#member-dictionary-use")).toBeEnabled();
  }
  expect(calls.filter(url => new URL(url).origin !== ORIGIN || new URL(url).pathname.startsWith("/api/"))).toEqual([]);
  expect(await entries(context)).toEqual([]);
});

test("lookup leaves the current draft alone and filling a result requires an explicit discard decision", async ({ context, page }) => {
  await seed(context); await open(page);
  await page.locator("#member-term").fill("by some fluke");
  await page.locator("#member-partOfSpeech").fill("phrase");
  await page.locator("#member-meaning").fill("碰巧；侥幸");
  await page.locator("#member-note").fill("Do not replace my unsaved notes.");
  await lookup(page, "record");
  for (const pos of ["noun", "verb", "adjective"]) await expect(page.locator("#member-dictionary-pos")).toContainText(pos);
  await expect(page.locator("#member-term")).toHaveValue("by some fluke");
  await expect(page.locator("#member-meaning")).toHaveValue("碰巧；侥幸");
  page.once("dialog", dialog => dialog.dismiss()); await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-term")).toHaveValue("by some fluke");
  await expect(page.locator("#member-note")).toHaveValue("Do not replace my unsaved notes.");
  page.once("dialog", dialog => dialog.accept()); await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-term")).toHaveValue("record");
  await expect(page.locator("#member-partOfSpeech")).toHaveValue(/noun.*verb.*adjective/u);
  expect(await entries(context)).toEqual([]);
});

test("same-account focus revalidation preserves automatic-fill provenance but never clears a manual replacement", async ({ context, page }) => {
  await seed(context); await open(page); await lookup(page, "hip"); await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-meaning")).toHaveValue(/髋部/u);
  await revalidateFocus(page); await expect(page.locator("#member-term")).toHaveValue("hip");
  await page.locator("#member-term").fill("bank");
  await expect(page.locator("#member-meaning")).toHaveValue(""); await expect(page.locator("#member-partOfSpeech")).toHaveValue("");
  page.once("dialog", dialog => dialog.accept()); await page.locator("#member-cancel").click();
  await lookup(page, "hip"); await page.locator("#member-dictionary-use").click();
  await page.locator("#member-meaning").fill("我自己补充的语境义，不要清空。"); await page.locator("#member-partOfSpeech").fill("my contextual POS");
  await page.locator("#member-note").fill("Handwritten note also survives revalidation.");
  await revalidateFocus(page); await page.locator("#member-term").fill("bank");
  await expect(page.locator("#member-meaning")).toHaveValue("我自己补充的语境义，不要清空。");
  await expect(page.locator("#member-partOfSpeech")).toHaveValue("my contextual POS");
  await expect(page.locator("#member-note")).toHaveValue("Handwritten note also survives revalidation.");
  expect(await entries(context)).toEqual([]);
});

test("legacy response projection strips only private-card POS while modern reads, conflicts and source contexts retain it", async ({ context }) => {
  const session = await seed(context);
  const body = { term: "hip", partOfSpeech: "noun · adjective", meaning: "髋部；时髦的", note: "Compatibility note.", mutationId: randomUUID() };
  const createdResponse = await api(context, "POST", "entries", body, session);
  expect(createdResponse.status()).toBe(200); const created = (await createdResponse.json()).entry;
  expect(created.partOfSpeech).toBe(body.partOfSpeech);
  await selectSource(context, session);
  const modernResponse = await api(context, "GET", "entries"); const modern = await modernResponse.json();
  const oldResponse = await api(context, "GET", "entries", undefined, undefined, "member", false); const legacy = await oldResponse.json();
  expect(oldResponse.status()).toBe(200); expect(oldResponse.headers()["cache-control"]).toContain("no-store");
  expect(legacy.entries.every(entry => !Object.hasOwn(entry, "partOfSpeech"))).toBe(true);
  expect(modern.entries.find(entry => entry.id === created.id).partOfSpeech).toBe(body.partOfSpeech);
  const sourceCard = modern.entries.find(entry => entry.sourceContexts?.length);
  expect(legacy.entries.find(entry => entry.id === sourceCard.id).sourceContexts).toEqual(sourceCard.sourceContexts);
  expect(sourceCard.sourceContexts[0].partOfSpeech).toBe(sourceContext.partOfSpeech);
  const duplicate = { ...body, mutationId: randomUUID() };
  const oldConflict = await api(context, "POST", "entries", duplicate, session, "member", false);
  expect(oldConflict.status()).toBe(409); const oldExisting = (await oldConflict.json()).error.details.existing;
  expect(Object.hasOwn(oldExisting, "partOfSpeech")).toBe(false); expect(oldExisting.note).toBe(body.note);
  const newConflict = await api(context, "POST", "entries", { ...duplicate, mutationId: randomUUID() }, session);
  expect(newConflict.status()).toBe(409); expect((await newConflict.json()).error.details.existing.partOfSpeech).toBe(body.partOfSpeech);
  const oldUpdate = await api(context, "PUT", `entries/${created.id}`, { revision: created.revision, term: created.term, meaning: created.meaning, note: "Edited by a v74 client.", mutationId: randomUUID() }, session, "member", false);
  expect(oldUpdate.status()).toBe(200); expect(Object.hasOwn((await oldUpdate.json()).entry, "partOfSpeech")).toBe(false);
  const final = (await entries(context)).find(entry => entry.id === created.id);
  expect(final.partOfSpeech).toBe(body.partOfSpeech); expect(final.note).toBe("Edited by a v74 client.");
});

test("saved local part of speech survives reload, detail, learning and duplicate lookup without replacing notes", async ({ context, page }) => {
  await seed(context); await open(page); await lookup(page, "hip");
  await page.locator("#member-dictionary-use").click();
  await page.locator("#member-note").fill("My anatomy and slang note.");
  await page.locator("#member-save").click(); await expect(page.locator(".personal-entry")).toHaveCount(1);
  const saved = (await entries(context))[0]; expect(saved.partOfSpeech).toMatch(/noun/u); expect(saved.partOfSpeech).toMatch(/adjective/u);
  await page.reload(); await ready(page);
  await expect(row(page, "hip").locator(".entry-pos")).toContainText("adjective");
  await row(page, "hip").locator('[data-action="view"]').click();
  await expect(page.locator("#member-detail-pos")).toContainText("adjective");
  await expect(page.locator("#member-detail-note")).toHaveText(saved.note);
  await page.locator("#member-detail-close").click(); await page.locator("#member-study-all").click();
  await expect(page.locator("#member-study-answer")).toBeHidden();
  await page.locator("#member-study-reveal").click(); await expect(page.locator("#member-study-pos")).toContainText("adjective");
  await page.locator("#member-study-close").click();
  await lookup(page, "ＨＩＰ"); await page.locator("#member-dictionary-use").click();
  if (await page.locator("#member-save").isEnabled()) await page.locator("#member-save").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  const after = (await entries(context))[0]; expect(after.id).toBe(saved.id); expect(after.note).toBe(saved.note); expect(after.meaning).toBe(saved.meaning);
});

test("missing local phrases are honest, clear any old result and never fall back to translation or AI", async ({ context, page }) => {
  await seed(context); await open(page); await lookup(page, "hip");
  const calls = []; page.on("request", request => calls.push(request.url()));
  for (const term of ["by some fluke", "zzzznonexistentlocalword", "a completely unlisted phrase zzz"]) {
    await page.locator("#member-dictionary-term").fill(term); await page.locator("#member-dictionary-term").press("Enter");
    await expect(page.locator("#member-dictionary-status")).toContainText(/未收录|未找到|没有收录/u);
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await expect(page.locator("#member-term")).toHaveValue("");
  }
  expect(calls.filter(url => new URL(url).origin !== ORIGIN || new URL(url).pathname.startsWith("/api/"))).toEqual([]);
  expect(await entries(context)).toEqual([]);
});

test("once loaded the dictionary can answer another local lookup offline without trying any API", async ({ context, page }) => {
  await seed(context); await open(page); await lookup(page, "hip");
  const calls = []; page.on("request", request => calls.push(request.url()));
  try {
    await context.setOffline(true); await lookup(page, "record");
    await expect(page.locator("#member-dictionary-word")).toHaveText("record");
    await expect(page.locator("#member-dictionary-meaning")).toContainText("记录");
    expect(calls.filter(url => new URL(url).origin !== ORIGIN || new URL(url).pathname.startsWith("/api/"))).toEqual([]);
    await expect(page.locator("#member-term")).toHaveValue("");
  } finally { await context.setOffline(false); }
});

test("a failed static dictionary load is retryable and never silently replaced by an online provider", async ({ context, page }) => {
  let attempts = 0, fail = true;
  await page.route(DICTIONARY_ROUTE, async route => { attempts++; if (fail) await route.abort("failed"); else await route.continue(); });
  await seed(context); await open(page);
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(1);
  const calls = [];
  page.on("request", request => calls.push(request.url()));
  // The failed background prewarm was silent and did not lock the account.
  await expect(page.locator("#member-term")).toBeEnabled();
  await page.locator("#member-dictionary-term").fill("hip"); await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-status")).toContainText(/失败|Failed|停止/u);
  await expect(page.locator("#member-dictionary-search")).toBeEnabled(); await expect(page.locator("#member-dictionary-result")).toBeHidden();
  const beforeRetry = attempts; fail = false;
  await page.locator("#member-dictionary-term").press("Enter"); await expect(page.locator("#member-dictionary-word")).toHaveText("hip");
  await expect(page.locator("#member-dictionary-result")).toBeVisible(); expect(attempts).toBe(beforeRetry + 1);
  expect(calls.filter(url => new URL(url).origin !== ORIGIN || new URL(url).pathname.startsWith("/api/"))).toEqual([]);
});

test("a delayed dictionary response cannot show a stale result after the input changes", async ({ context, page }) => {
  const delayed = await delayedDictionary(page); await seed(context); await open(page);
  try {
    await page.locator("#member-dictionary-term").fill("hip"); await page.locator("#member-dictionary-term").press("Enter"); await delayed.seen;
    await page.locator("#member-dictionary-term").fill("bank"); delayed.release();
    await expect(page.locator("#member-dictionary-search")).toBeEnabled();
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await page.locator("#member-dictionary-term").press("Enter");
    await expect(page.locator("#member-dictionary-result")).toBeVisible(); await expect(page.locator("#member-dictionary-word")).toHaveText("bank");
    await expect(page.locator("#member-dictionary-meaning")).toContainText("银行");
  } finally { delayed.release(); }
});

test("logout clears a delayed local result and no old result reappears when another account signs in", async ({ context, page }) => {
  const delayed = await delayedDictionary(page); await seed(context); await open(page);
  try {
    await page.locator("#member-dictionary-term").fill("hip"); await page.locator("#member-dictionary-term").press("Enter"); await delayed.seen;
    await page.locator("#member-logout").click(); await expect(page.locator("#member-workspace")).toBeHidden();
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await seed(context, "bob_dictionary");
    await page.locator("#login-username").fill("bob_dictionary"); await page.locator("#login-password").fill(PASSWORD);
    await page.locator("#member-login-form button[type=submit]").click(); await ready(page, "bob_dictionary");
    await expect(page.locator("#member-dictionary-term")).toHaveValue("");
    delayed.release();
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await lookup(page, "bank"); await expect(page.locator("#member-dictionary-word")).toHaveText("bank");
    await expect(page.locator("#member-dictionary-meaning")).toContainText("银行");
    expect(delayed.requests()).toBe(1); expect(await entries(context)).toEqual([]);
  } finally { delayed.release(); }
});

test("member cards show only POS, Chinese and personal note while owner source expansion remains available", async ({ context, page }) => {
  const session = await seed(context); await selectSource(context, session); await open(page);
  await page.locator("#member-book").selectOption(collectionId); await page.locator("#member-chapter").selectOption(chapterId);
  await row(page, source.term).locator('[data-action="view"]').click();
  await expect(page.locator("#member-detail-pos")).toHaveText(sourceContext.partOfSpeech);
  for (const id of ["member-detail-original", "member-detail-definition", "member-detail-usage", "member-detail-example"]) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator("#member-detail-source")).toContainText(`Chapter ${chapterId.slice(8)}`);
  await page.locator("#member-detail-close").click(); await page.locator("#member-study-all").click(); await page.locator("#member-study-reveal").click();
  for (const id of ["member-study-usage", "member-study-example"]) await expect(page.locator(`#${id}`)).toBeHidden();
  await page.locator("#member-study-close").click();
  expect((await entries(context))[0].sourceContexts[0].definition).toBe(sourceContext.definition);
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: ORIGIN }]);
  const owner = await (await api(context, "GET", "session", undefined, undefined, "github-owner")).json(); await selectSource(context, owner, "github-owner");
  await open(page, "zhuodashuai", "owner"); await row(page, source.term).locator('[data-action="view"]').click();
  await expect(page.locator("#member-detail-definition")).toHaveText(sourceContext.definition);
  await expect(page.locator("#member-detail-usage")).toHaveText(sourceContext.usage);
  await expect(page.locator("#member-detail-example")).toContainText(sourceContext.exampleEn);
});

test("390px local dictionary and multi-POS cards have readable controls without horizontal overflow", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await seed(context); await open(page); await lookup(page, "record");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  for (const id of ["member-dictionary-term", "member-dictionary-search", "member-dictionary-use"]) {
    const bounds = await page.locator(`#${id}`).boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  }
  await mkdir(resolve("test-results"), { recursive: true }); await page.screenshot({ path: resolve("test-results/member-local-dictionary-mobile.png"), fullPage: true });
  await page.locator("#member-dictionary-use").click(); await page.locator("#member-save").click(); await expect(page.locator(".personal-entry")).toHaveCount(1);
  await expect(row(page, "record").locator(".entry-pos")).toContainText("adjective");
});
