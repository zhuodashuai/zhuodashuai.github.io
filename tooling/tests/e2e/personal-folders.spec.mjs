import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

const ORIGIN = "http://127.0.0.1:4187";
const API = `${ORIGIN}/api/v1/member`;
const PASSWORD = "synthetic folders local only 密码 100";
const runId = info => `folders-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`;

// Fault injection is browser transport QA, not a production offline/cache claim.
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: runId(info), url: ORIGIN }]);
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.protocol === "http:" && url.origin === ORIGIN) return route.continue();
    throw new Error(`Non-local browser request is forbidden in folders QA: ${url.origin}`);
  });
  page.on("pageerror", error => { throw error; });
  page.on("dialog", dialog => dialog.accept());
});

async function api(context, method, path, data, session, expectedUserId = session?.user.id) {
  return context.request.fetch(`${API}/${path}`, {
    method, headers: {
      "X-Wordbook-Auth": "member", "X-Wordbook-Fields": "partOfSpeech",
      ...(expectedUserId ? { "X-Member-User": expectedUserId } : {}),
      ...(method === "GET" ? {} : { Origin: ORIGIN, "Content-Type": "application/json" }),
      ...(session ? { "X-CSRF-Token": session.csrfToken } : {})
    }, ...(data === undefined ? {} : { data })
  });
}
async function json(response, expected = 200) { expect(response.status()).toBe(expected); return response.json(); }
async function seed(context, username = "alice_folders") {
  return json(await api(context, "POST", "register", { username, password: PASSWORD }));
}
async function list(context, session) { return (await json(await api(context, "GET", "entries", undefined, session))).entries; }
async function folders(context, session) { return (await json(await api(context, "GET", "folders", undefined, session))).folders; }
async function learning(context, session) { return (await json(await api(context, "GET", "learning", undefined, session))).reviews; }
async function createFolder(context, session, name) {
  return (await json(await api(context, "POST", "folders", { name, mutationId: randomUUID() }, session))).folder;
}
async function addEntry(context, session, term, meaning = "合成测试释义") {
  return (await json(await api(context, "POST", "entries", { term, meaning, note: "local synthetic note", mutationId: randomUUID() }, session))).entry;
}
async function classify(context, session, folder, entry, mode = "add") {
  return (await json(await api(context, "POST", `folders/${folder.id}/entries`, {
    entryIds: [entry.id], mode, revision: folder.revision, mutationId: randomUUID()
  }, session))).folder;
}
async function ready(page, username = "alice_folders") {
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-username")).toHaveText(`@${username}`);
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#member-learning-summary")).not.toContainText("正在读取");
}
async function open(page, username = "alice_folders") {
  await page.goto("/personal.html?auth=member"); await ready(page, username);
}
function row(page, term) { return page.locator(".personal-entry").filter({ has: page.getByRole("button", { name: `查看 ${term}`, exact: true }) }); }
async function createInBrowser(page, name) {
  await page.locator("#member-folder-new").click();
  await expect(page.locator("#member-folder-dialog")).toBeVisible();
  await page.locator("#member-folder-name").fill(name);
  await page.locator("#member-folder-save").click();
  await expect(page.locator("#member-folder-dialog")).not.toBeVisible();
}
async function lookup(page, term = "happy") {
  await page.locator("#member-dictionary-term").fill(term);
  await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-word")).toHaveText(term);
  await expect(page.locator("#member-dictionary-save")).toBeEnabled();
}
async function settleLookupSave(page, { pending = false } = {}) {
  await expect(page.locator(pending ? "#member-folder-retry" : "#member-dictionary-save")).toBeEnabled();
  if (await page.locator("#member-detail-dialog").isVisible()) await page.locator("#member-detail-close").click();
}
async function publicSnapshot(context) { return (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json(); }
async function login(page, username) {
  await page.locator("#login-username").fill(username);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("#member-login-form button[type=submit]").click();
  await ready(page, username);
}

test("create 阅读 and 口语, directly save happy to both without duplicating the private word, and reload", async ({ context, page }) => {
  const session = await seed(context); const beforePublic = await publicSnapshot(context);
  const writes = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(new URL(request.url()).pathname); });
  await open(page);
  await createInBrowser(page, "阅读"); await createInBrowser(page, "口语");
  const [reading, speaking] = await Promise.all(["阅读", "口语"].map(async name => (await folders(context, session)).find(folder => folder.name === name)));
  expect(reading).toBeTruthy(); expect(speaking).toBeTruthy();
  await lookup(page);
  await page.locator("#member-dictionary-folder").selectOption(reading.id);
  await page.locator("#member-dictionary-save").click();
  await expect.poll(async () => (await folders(context, session)).find(folder => folder.id === reading.id)?.entryIds.length).toBe(1);
  await settleLookupSave(page);
  const original = (await list(context, session))[0]; expect(original.term).toBe("happy");
  await page.locator("#member-dictionary-folder").selectOption(speaking.id);
  await page.locator("#member-dictionary-save").click();
  await expect.poll(async () => (await folders(context, session)).find(folder => folder.id === speaking.id)?.entryIds).toEqual([original.id]);
  await settleLookupSave(page);
  expect(await list(context, session)).toEqual([original]);
  expect(await learning(context, session)).toEqual([]);
  await expect(page.locator("#member-dictionary-private-status")).toContainText("happy");
  await page.locator("#member-dictionary-private-open").click();
  await expect(page.locator("#member-detail-term")).toHaveText("happy");
  await expect(page.locator("#member-detail-meaning")).toHaveText(original.meaning);
  await page.locator("#member-detail-close").click();
  // A receipt opens today's actual card, not the historical lookup payload.
  await json(await api(context, "PUT", `entries/${original.id}`, { term: original.term, meaning: "保留我的自定义快乐释义", note: original.note, revision: original.revision, mutationId: randomUUID() }, session));
  await page.locator("#member-refresh").click();
  await expect(row(page, "happy").locator(".entry-meaning")).toHaveText("保留我的自定义快乐释义");
  await page.locator("#member-dictionary-private-open").click();
  await expect(page.locator("#member-detail-meaning")).toHaveText("保留我的自定义快乐释义");
  await page.locator("#member-detail-close").click();
  await lookup(page, "patient"); await expect(page.locator("#member-dictionary-private-open")).not.toBeVisible();
  await page.reload(); await ready(page);
  for (const folder of [reading, speaking]) {
    await page.locator("#member-folder-filter").selectOption(folder.id);
    await expect(row(page, "happy")).toHaveCount(1);
  }
  await page.locator("#member-folder-filter").selectOption("unfiled");
  await expect(row(page, "happy")).toHaveCount(0);
  expect(writes.every(path => path.startsWith("/api/v1/member/"))).toBe(true);
  expect(await publicSnapshot(context)).toEqual(beforePublic);
});

test("moving out and deleting a folder preserve the exact private card and review history", async ({ context, page }) => {
  const session = await seed(context); const entry = await addEntry(context, session, "happy", "快乐的");
  let reading = await createFolder(context, session, "阅读"); const speaking = await createFolder(context, session, "口语");
  reading = await classify(context, session, reading, entry); await classify(context, session, speaking, entry);
  await json(await api(context, "POST", `reviews/${entry.id}`, { rating: "good", revision: 0, mutationId: randomUUID() }, session));
  const priorReviews = await learning(context, session); expect(priorReviews).toHaveLength(1);
  await open(page); await row(page, "happy").getByRole("button", { name: "查看 happy", exact: true }).click();
  await expect(page.locator("#member-detail-folders")).toContainText("阅读");
  await expect(page.locator("#member-detail-folders")).toContainText("口语");
  await page.locator("#member-detail-folder").selectOption(reading.id);
  await page.locator("#member-detail-folder-remove").click();
  await expect.poll(async () => (await folders(context, session)).find(folder => folder.id === reading.id)?.entryIds).toEqual([]);
  await expect(page.locator("#member-detail-folders")).not.toContainText("阅读");
  await expect(page.locator("#member-detail-folders")).toContainText("口语");
  await page.locator("#member-detail-close").click();
  await page.locator("#member-folder-filter").selectOption(speaking.id);
  await page.locator("#member-folder-delete").click();
  await expect.poll(async () => (await folders(context, session)).map(folder => folder.id)).not.toContain(speaking.id);
  await page.locator("#member-folder-filter").selectOption("unfiled"); await expect(row(page, "happy")).toHaveCount(1);
  expect(await list(context, session)).toEqual([entry]); expect(await learning(context, session)).toEqual(priorReviews);
  await page.reload(); await ready(page); await expect(row(page, "happy")).toHaveCount(1);
  expect(await learning(context, session)).toEqual(priorReviews);
});

test("NFKC duplicate rename cannot overwrite either folder and a valid rename persists", async ({ context, page }) => {
  const session = await seed(context); const reading = await createFolder(context, session, "Reading"); const speaking = await createFolder(context, session, "口语");
  await open(page); await page.locator("#member-folder-filter").selectOption(speaking.id);
  await page.locator("#member-folder-rename").click(); await page.locator("#member-folder-name").fill("Ｒｅａｄｉｎｇ");
  await page.locator("#member-folder-save").click();
  await expect(page.locator("#member-folders-status")).toContainText(/同名|名称/u);
  expect((await folders(context, session)).map(folder => [folder.id, folder.name])).toEqual([[reading.id, "Reading"], [speaking.id, "口语"]]);
  await expect(page.locator("#member-folder-name")).toHaveValue("Ｒｅａｄｉｎｇ");
  await page.locator("#member-folder-name").fill("口语练习"); await page.locator("#member-folder-save").click();
  await expect(page.locator("#member-folder-dialog")).not.toBeVisible();
  await page.reload(); await ready(page);
  await expect(page.locator(`#member-folder-filter option[value='${speaking.id}']`)).toHaveText(/口语练习/u);
});

test("a committed create with a lost response retries the same mutation, not a second folder", async ({ context, page }) => {
  const session = await seed(context); let first = true; const ids = [];
  await page.route(`${API}/folders`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    ids.push(route.request().postDataJSON().mutationId);
    if (!first) return route.continue();
    first = false; await route.fetch(); await route.abort("connectionfailed");
  });
  await open(page); await page.locator("#member-folder-new").click();
  await page.locator("#member-folder-name").fill("阅读"); await page.locator("#member-folder-save").click();
  await expect(page.locator("#member-folder-retry")).toBeVisible();
  expect(await folders(context, session)).toHaveLength(1);
  if (await page.locator("#member-folder-dialog").isVisible()) await page.locator("#member-folder-cancel").click();
  await page.locator("#member-folder-retry").click();
  await expect(page.locator("#member-folder-retry")).not.toBeVisible();
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  expect((await folders(context, session)).map(folder => folder.name)).toEqual(["阅读"]);
});

test("folder loading failure does not block basic lookup or an unfiled manual save", async ({ context, page }) => {
  const session = await seed(context);
  await page.route(`${API}/folders`, route => route.request().method() === "GET"
    ? route.fulfill({ status: 503, json: { error: { code: "member_unavailable", message: "分类暂不可用；基础词条仍可使用。" } } }) : route.continue());
  await open(page); await lookup(page);
  await expect(page.locator("#member-dictionary-meaning")).toContainText("快乐");
  await page.locator("#member-new").click(); await page.locator("#member-term").fill("folder fallback");
  await page.locator("#member-meaning").fill("分类失效时仍可保存"); await page.locator("#member-save").click();
  await expect(row(page, "folder fallback")).toHaveCount(1);
  expect((await list(context, session)).map(entry => entry.term)).toEqual(["folder fallback"]);
  await expect(page.locator("#member-folders-status")).toContainText(/不可用|失败|未能|暂时|连接/u);
});

test("a saved lookup whose folder attach fails is retained once and can retry just the classification", async ({ context, page }) => {
  const session = await seed(context); const reading = await createFolder(context, session, "阅读"); let fail = true; let entryPosts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url() === `${API}/entries`) entryPosts++; });
  await page.route(`${API}/folders/${reading.id}/entries`, route => fail
    ? route.fulfill({ status: 503, json: { error: { code: "member_unavailable", message: "归类暂未确认。" } } }) : route.continue());
  await open(page); await lookup(page); await page.locator("#member-dictionary-folder").selectOption(reading.id);
  await page.locator("#member-dictionary-save").click();
  await expect(page.locator("#member-folder-retry")).toBeVisible();
  await settleLookupSave(page, { pending: true });
  const stored = await list(context, session); expect(stored).toHaveLength(1); expect(stored[0].term).toBe("happy");
  expect((await folders(context, session))[0].entryIds).toEqual([]);
  fail = false; await page.locator("#member-folder-retry").click();
  await expect.poll(async () => (await folders(context, session))[0].entryIds).toEqual([stored[0].id]);
  expect(await list(context, session)).toEqual(stored); expect(entryPosts).toBe(1);
});

test("lost classification acknowledgement survives same-UID focus validation but never automatically resends", async ({ context, page }) => {
  const session = await seed(context); const reading = await createFolder(context, session, "阅读");
  const ids = []; let first = true; let entryPosts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url() === `${API}/entries`) entryPosts++; });
  await page.route(`${API}/folders/${reading.id}/entries`, async route => {
    ids.push(route.request().postDataJSON().mutationId);
    if (!first) return route.continue();
    first = false; await route.fetch(); await route.abort("connectionfailed");
  });
  await open(page); await lookup(page); await page.locator("#member-dictionary-folder").selectOption(reading.id);
  await page.locator("#member-dictionary-save").click();
  await expect(page.locator("#member-folder-retry")).toBeVisible(); await settleLookupSave(page, { pending: true });
  const stored = await list(context, session); expect(stored).toHaveLength(1); expect(ids).toHaveLength(1);
  const verified = page.waitForResponse(response => response.url() === `${API}/session` && response.request().method() === "GET");
  const reread = page.waitForResponse(response => response.url() === `${API}/folders` && response.request().method() === "GET");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await verified).status()).toBe(200); expect((await reread).status()).toBe(200); await ready(page);
  await expect(page.locator("#member-folder-retry")).toBeVisible(); await expect(page.locator("#member-folder-retry")).toBeEnabled();
  expect(ids).toHaveLength(1); expect(entryPosts).toBe(1); // Focus is verification, never mutation replay.
  await page.locator("#member-folder-retry").click(); await expect(page.locator("#member-folder-retry")).not.toBeVisible();
  expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0]); expect(entryPosts).toBe(1);
  expect(await list(context, session)).toEqual(stored);
  expect((await folders(context, session))[0].entryIds).toEqual([stored[0].id]);
});

test("logout discards uncertain classification and another account cannot restore or replay it", async ({ browser, context, page }, info) => {
  const alice = await seed(context); const reading = await createFolder(context, alice, "Alice私密阅读");
  const other = await browser.newContext({ serviceWorkers: "block" });
  await other.addCookies([{ name: "e2e_run", value: runId(info), url: ORIGIN }]);
  const bob = await seed(other, "bob_folders"); await createFolder(other, bob, "Bob口语");
  const ids = [];
  await page.route(`${API}/folders/${reading.id}/entries`, async route => {
    ids.push(route.request().postDataJSON().mutationId); await route.fetch(); await route.abort("connectionfailed");
  });
  try {
    await open(page); await lookup(page); await page.locator("#member-dictionary-folder").selectOption(reading.id);
    await page.locator("#member-dictionary-save").click(); await expect(page.locator("#member-folder-retry")).toBeVisible();
    await settleLookupSave(page, { pending: true });
    await page.locator("#member-logout").click(); await expect(page.locator("#member-auth")).toBeVisible();
    await expect(page.locator("#member-folder-retry")).not.toBeVisible();
    await login(page, "bob_folders"); await expect(page.locator("#member-folder-filter")).toContainText("Bob口语");
    await expect(page.locator("#member-folder-filter")).not.toContainText("Alice私密阅读");
    await expect(page.locator("#member-folder-retry")).not.toBeVisible();
    const verified = page.waitForResponse(response => response.url() === `${API}/session` && response.request().method() === "GET");
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); expect((await verified).status()).toBe(200); await ready(page, "bob_folders");
    await expect(page.locator("#member-folder-retry")).not.toBeVisible(); expect(ids).toHaveLength(1);
    expect(await list(context, bob)).toEqual([]);
  } finally { await other.close(); }
});

test("late account-A folder GET cannot refill DOM after logout and account-B login", async ({ browser, context, page }, info) => {
  const alice = await seed(context); const aFolder = await createFolder(context, alice, "Alice私密阅读");
  const other = await browser.newContext({ serviceWorkers: "block" });
  await other.addCookies([{ name: "e2e_run", value: runId(info), url: ORIGIN }]);
  const bob = await seed(other, "bob_folders"); await createFolder(other, bob, "Bob口语");
  let release, reached; const gate = new Promise(resolve => { release = resolve; }); const seen = new Promise(resolve => { reached = resolve; });
  let delay = false;
  await page.route(`${API}/folders`, async route => {
    if (route.request().method() !== "GET" || !delay) return route.continue();
    delay = false; const response = await route.fetch(); reached(); await gate;
    try { await route.fulfill({ response }); } catch { /* Account scope intentionally aborts the old read. */ }
  });
  try {
    await open(page); await expect(page.locator(`#member-folder-filter option[value='${aFolder.id}']`)).toHaveCount(1);
    delay = true; await page.locator("#member-folders-refresh").click(); await seen;
    await page.locator("#member-logout").click(); await expect(page.locator("#member-auth")).toBeVisible();
    expect(await page.locator("select option").allTextContents()).not.toContain("Alice私密阅读");
    await expect(page.locator("#member-folder-name")).toHaveValue("");
    await login(page, "bob_folders");
    release(); await expect(page.locator("#member-folder-filter")).toContainText("Bob口语");
    await expect(page.locator("#member-folder-filter")).not.toContainText("Alice私密阅读");
    await expect(page.locator("#member-detail-folders")).not.toContainText("Alice私密阅读");
    expect(await list(context, bob)).toEqual([]);
    await page.reload(); await ready(page, "bob_folders");
    await expect(page.locator("#member-folder-filter")).not.toContainText("Alice私密阅读");
  } finally { release(); await other.close(); }
});

test("an older in-flight folder snapshot cannot erase a newer confirmed create", async ({ context, page }) => {
  const session = await seed(context); await createFolder(context, session, "阅读");
  await open(page); await expect(page.locator("#member-folder-new")).toBeEnabled();
  let release, reached; const gate = new Promise(resolve => { release = resolve; }); const seen = new Promise(resolve => { reached = resolve; });
  let delay = true;
  await page.route(`${API}/folders`, async route => {
    if (route.request().method() !== "GET" || !delay) return route.continue();
    delay = false; const response = await route.fetch(); reached(); await gate;
    try { await route.fulfill({ response }); } catch { /* A scope change may cancel the old snapshot. */ }
  });
  try {
    await page.locator("#member-folders-refresh").click(); await seen;
    await createInBrowser(page, "口语");
    await expect(page.locator("#member-folder-filter")).toContainText("口语");
    release();
    await expect(page.locator("#member-folders-refresh")).toBeEnabled();
    await expect(page.locator("#member-folder-filter")).toContainText("口语");
    expect((await folders(context, session)).map(folder => folder.name)).toEqual(["阅读", "口语"]);
  } finally { release(); }
});

test("creation-time sorting ignores later edits, has stable ties, and stays within the selected folder", async ({ context, page }) => {
  const session = await seed(context); const alpha = await addEntry(context, session, "alpha"); const beta = await addEntry(context, session, "beta"); const gamma = await addEntry(context, session, "gamma");
  let reading = await createFolder(context, session, "阅读"); reading = await classify(context, session, reading, alpha); await classify(context, session, reading, beta);
  const dates = { alpha: ["2025-01-01T00:00:00.000Z", "2030-01-01T00:00:00.000Z"], beta: ["2025-02-01T00:00:00.000Z", "2025-02-01T00:00:00.000Z"], gamma: ["2025-02-01T00:00:00.000Z", "2025-03-01T00:00:00.000Z"] };
  await page.route(`${API}/entries`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch(); const value = await response.json();
    value.entries = value.entries.map(entry => ({ ...entry, createdAt: dates[entry.term][0], updatedAt: dates[entry.term][1] }));
    await route.fulfill({ response, json: value });
  });
  await open(page); const titles = page.locator("#member-entry-list .personal-entry .entry-term");
  await expect(page.locator("#member-sort")).toHaveValue("newest"); await expect(titles).toHaveText(["beta", "gamma", "alpha"]);
  await page.locator("#member-sort").selectOption("oldest"); await expect(titles).toHaveText(["alpha", "beta", "gamma"]);
  await page.locator("#member-sort").selectOption("za"); await expect(titles).toHaveText(["gamma", "beta", "alpha"]);
  await page.locator("#member-folder-filter").selectOption(reading.id); await expect(titles).toHaveText(["beta", "alpha"]);
  await page.locator("#member-sort").selectOption("az"); await expect(titles).toHaveText(["alpha", "beta"]);
  expect((await list(context, session)).map(entry => entry.id)).toEqual([alpha.id, beta.id, gamma.id]);
});

test("folder API fixture preserves tenant, CSRF, strict fields, revisions and current-state idempotency", async ({ browser, context }, info) => {
  const alice = await seed(context); const entry = await addEntry(context, alice, "happy"); const folder = await createFolder(context, alice, "阅读");
  const other = await browser.newContext({ serviceWorkers: "block" }); await other.addCookies([{ name: "e2e_run", value: runId(info), url: ORIGIN }]);
  try {
    const bob = await seed(other, "bob_folders"); const foreign = await addEntry(other, bob, "private foreign");
    expect((await api(context, "GET", "folders", undefined, alice, bob.user.id)).status()).toBe(401);
    expect((await api(context, "POST", "folders", { name: "wrong", mutationId: randomUUID(), userId: bob.user.id }, alice)).status()).toBe(400);
    expect((await api(context, "POST", "folders", { name: "no csrf", mutationId: randomUUID() })).status()).toBe(403);
    expect((await api(other, "DELETE", `folders/${folder.id}`, { revision: 1, mutationId: randomUUID() }, bob)).status()).toBe(404);
    expect((await api(context, "POST", `folders/${folder.id}/entries`, { entryIds: [foreign.id], mode: "add", revision: 1, mutationId: randomUUID() }, alice)).status()).toBe(404);
    const body = { entryIds: [entry.id], mode: "add", revision: 1, mutationId: randomUUID() };
    const attached = await json(await api(context, "POST", `folders/${folder.id}/entries`, body, alice));
    expect(attached.folder.entryIds).toEqual([entry.id]);
    const stale = await json(await api(context, "PUT", `folders/${folder.id}`, { name: "stale", revision: 1, mutationId: randomUUID() }, alice), 409);
    expect(stale.error.code).toBe("revision_conflict");
    const removed = await classify(context, alice, attached.folder, entry, "remove");
    const replay = await json(await api(context, "POST", `folders/${folder.id}/entries`, body, alice));
    expect(replay.action).toBe("idempotent"); expect(replay.folder).toEqual(removed); expect(replay.folder.entryIds).toEqual([]);
    await json(await api(context, "DELETE", `folders/${folder.id}`, { revision: removed.revision, mutationId: randomUUID() }, alice));
    expect((await json(await api(context, "POST", `folders/${folder.id}/entries`, body, alice))).folder).toBeNull();
    expect(await list(context, alice)).toEqual([entry]); expect((await list(other, bob))[0]).toEqual(foreign);
  } finally { await other.close(); }
});

test("deleting an entry prunes folder membership atomically without touching another entry or its review", async ({ context }) => {
  const session = await seed(context); const first = await addEntry(context, session, "happy"); const second = await addEntry(context, session, "patient");
  let folder = await createFolder(context, session, "阅读"); folder = await classify(context, session, folder, first); folder = await classify(context, session, folder, second);
  await json(await api(context, "POST", `reviews/${second.id}`, { rating: "good", revision: 0, mutationId: randomUUID() }, session));
  const reviews = await learning(context, session);
  await json(await api(context, "DELETE", `entries/${first.id}`, { revision: first.revision, mutationId: randomUUID() }, session));
  const updated = (await folders(context, session))[0]; expect(updated.entryIds).toEqual([second.id]); expect(updated.revision).toBe(folder.revision + 1);
  expect(await list(context, session)).toEqual([second]); expect(await learning(context, session)).toEqual(reviews);
});

test("320px folders, direct save, sort and details remain reachable without horizontal overflow", async ({ context, page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const session = await seed(context); const reading = await createFolder(context, session, "阅读与口语练习收藏夹");
  await open(page); await lookup(page); await page.locator("#member-dictionary-folder").selectOption(reading.id);
  await page.locator("#member-dictionary-save").click(); await expect(row(page, "happy")).toHaveCount(1);
  await expect.poll(async () => (await folders(context, session))[0].entryIds.length).toBe(1);
  await settleLookupSave(page);
  for (const id of ["member-dictionary-folder", "member-dictionary-save", "member-folder-filter", "member-sort", "member-folder-new"]) {
    const control = page.locator(`#${id}`); await control.scrollIntoViewIfNeeded(); await expect(control).toBeVisible();
    const box = await control.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("qa-artifacts", { recursive: true });
  await page.locator("#member-dictionary-result").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "qa-artifacts/personal-folders-320-lookup.png" });
  await page.locator("#member-folder-filter").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "qa-artifacts/personal-folders-320-toolbar.png" });
  await row(page, "happy").getByRole("button", { name: "查看 happy", exact: true }).click();
  await expect(page.locator("#member-detail-meaning")).toContainText("快乐"); await expect(page.locator("#member-detail-folders")).toContainText("阅读与口语练习收藏夹");
  expect(await page.locator("#member-detail-dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "qa-artifacts/personal-folders-320-card.png" });
  await page.screenshot({ path: "qa-artifacts/personal-folders-320.png", fullPage: true });
});
