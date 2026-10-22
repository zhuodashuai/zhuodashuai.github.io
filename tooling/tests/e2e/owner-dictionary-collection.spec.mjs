import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expectFullPublicEntry } from "./public-entry-assertions.mjs";

const ORIGIN = "http://127.0.0.1:4187";
const COLLECTION = "/api/v1/owner/dictionary-collection";
const PUBLIC = "/api/v1/public/wordbook";
const PRIVATE = "/api/v1/member/entries";
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "e2e_run", value: `owner-collection-${randomUUID()}`, url: ORIGIN }, { name: "e2e_auth", value: "owner", url: ORIGIN }]);
  // Production public reads intentionally omit credentials and return one global
  // snapshot. Only this mock namespaces snapshots by the e2e_run cookie, so use
  // the isolated API context for its public GET without changing browser privacy.
  await context.route(`**${PUBLIC}*`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await context.request.get(`${ORIGIN}${PUBLIC}`);
    await route.fulfill({ response });
  });
});
test.afterEach(async ({ context }) => {
  // Drain the isolated public-snapshot mock before its API context is disposed.
  // Waiting preserves handler errors instead of silently ignoring them.
  await context.unrouteAll({ behavior: "wait" });
});
async function open(page) {
  await page.goto("/personal.html?auth=owner");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-auth-type")).toHaveText("GitHub 身份");
  await expect(page.locator("#member-privacy-badge")).toHaveText("查词公开收录 · 学习记录私有");
  await expect(page.locator("#member-privacy-note")).toContainText("不会自动公开");
  await expect(page.locator("#member-owner-public-panel")).toBeVisible();
  await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", false);
}
async function openPrivateTools(page) {
  await page.locator("#member-private-tools > summary").click();
  await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", true);
}
async function publicSnapshot(context) {
  const response = await context.request.get(`${ORIGIN}${PUBLIC}`);
  expect(response.status()).toBe(200); return response.json();
}
function publicRow(page, id) {
  return page.locator(`#member-owner-public-list button[data-owner-public-entry="${id}"]`);
}
async function expectEntryLink(link, id) {
  await expect(link).toBeVisible();
  const url = new URL(await link.getAttribute("href"), ORIGIN);
  expect(url.origin).toBe(ORIGIN); expect(url.pathname).toBe("/");
  expect(url.searchParams.getAll("entry")).toEqual([id]);
}
async function lookup(page, query) {
  await page.locator("#member-dictionary-term").fill(query);
  await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-result")).toBeVisible();
}

test("owner exact English auto-collects publicly with source, leaves private editor alone and deduplicates", async ({ context, page }) => {
  await open(page); await openPrivateTools(page); await page.locator("#member-term").fill("my unfinished draft");
  const calls = []; page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) calls.push(request); });
  await lookup(page, "abacus");
  await expect(page.locator("#member-dictionary-collection-status")).toContainText("已收录到卓的公开词库");
  await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
  await expect(page.locator("#member-term")).toHaveValue("my unfinished draft");
  const initial = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  const entry = initial.entries.find(value => value.normalized === "abacus");
  await expectEntryLink(page.locator("#member-dictionary-public-link"), entry.id);
  await expect(publicRow(page, entry.id)).toBeVisible();
  expect(entry.sourceTitle).toBeTruthy(); expect(entry.sources[0].kind).toBe("dictionary");
  expect(entry.definition).toBe(""); expect(entry.exampleEn).toBe(""); expect(entry.senses).toEqual([]);
  await lookup(page, "abacus");
  await expect(page.locator("#member-dictionary-collection-status")).toContainText("原有内容已保留");
  const after = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  expect(after.entries.filter(value => value.normalized === "abacus")).toHaveLength(1);
  expect(after.entries.find(value => value.id === entry.id)).toEqual(entry);
  const saves = calls.filter(request => new URL(request.url()).pathname === COLLECTION);
  expect(saves).toHaveLength(2);
  for (const request of saves) {
    expect(Object.keys(request.postDataJSON()).sort()).toEqual(["mutationId", "term"]);
    expect(request.headers()["idempotency-key"]).toBe(request.postDataJSON().mutationId);
  }
  expect(calls.some(request => /ai|translate/u.test(new URL(request.url()).pathname))).toBe(false);
  expect(calls.some(request => request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/v1/member"))).toBe(false);
});

test("Chinese preview never writes, an actual choice click collects that head, and matched forms still require explicit use", async ({ page, context }) => {
  await open(page); let writes = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === COLLECTION) writes++; });
  await lookup(page, "苹果");
  await expect(page.locator("#member-dictionary-choices")).toBeVisible();
  await expect(page.locator("#member-dictionary-use")).toHaveText("收录到卓的公开词库");
  expect(writes).toBe(0);
  await page.locator('#member-dictionary-choices button[data-dictionary-term="apple"]').click();
  await expect(page.locator("#member-dictionary-word")).toHaveText("apple");
  await expect(page.locator("#member-dictionary-collection-status")).toContainText(/公开词库/u);
  // The saving message also mentions 公开词库. Wait for the validated receipt,
  // not merely the start of the write, before reading the public snapshot.
  await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
  expect(writes).toBe(1);
  const apple = (await publicSnapshot(context)).entries.find(entry => entry.normalized === "apple");
  expect(apple).toBeTruthy(); await expect(publicRow(page, apple.id)).toBeVisible();
  await expectEntryLink(page.locator("#member-dictionary-public-link"), apple.id);
  await lookup(page, "went");
  await expect(page.locator("#member-dictionary-word")).toHaveText("go");
  await expect(page.locator("#member-dictionary-use")).toHaveText("收录到卓的公开词库");
  expect(writes).toBe(1);
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-dictionary-collection-status")).toContainText(/公开词库/u);
  await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
  expect(writes).toBe(2);
});

test("the existing GitHub owner collects an imported non-MIT phrase with its own source and deduplicates", async ({ context, page }) => {
  await open(page); await lookup(page, "safety oracle");
  await expect(page.locator("#member-dictionary-collection-status")).toContainText("已收录到卓的公开词库");
  const first = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  const entry = first.entries.find(value => value.normalized === "safety oracle");
  expect(entry).toBeTruthy(); expect(entry.meaning).toContain("安全判定器");
  expect(entry.partOfSpeech).toBe("noun"); expect(entry.sourceTitle).toBe("词表补充整理（逐条标注来源）");
  expect(entry.sources[0].url).toBe("https://zhuodashuai.github.io/vocab/dictionary-references.html");
  expect(entry.sources[0].title).not.toContain(" · MIT");
  await lookup(page, "safety oracle");
  await expect(page.locator("#member-dictionary-collection-status")).toContainText("原有内容已保留");
  const after = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  expect(after.entries.filter(value => value.normalized === "safety oracle")).toHaveLength(1);
  expect(after.entries.find(value => value.id === entry.id)).toEqual(entry);
});

test("failed collection retries the same mutation key and old-query completion cannot show success", async ({ page }) => {
  await open(page); const bodies = []; let fail = true;
  await page.route(`**${COLLECTION}`, async route => {
    bodies.push(route.request().postDataJSON());
    if (fail) { fail = false; await route.fulfill({ status: 503, json: { error: { code: "temporary", message: "稍后重试" } } }); }
    else await route.continue();
  });
  await lookup(page, "abacus");
  await expect(page.locator("#member-dictionary-use")).toHaveText("重试公开收录");
  await expect(page.locator("#member-dictionary-public-link")).toBeHidden();
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
  expect(bodies[1].mutationId).toBe(bodies[0].mutationId);
  await page.unroute(`**${COLLECTION}`);
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; }), seen = new Promise(resolve => { reached = resolve; });
  await page.route(`**${COLLECTION}`, async route => { const response = await route.fetch(); reached(); await gate; try { await route.fulfill({ response }); } catch {} });
  await lookup(page, "abandon"); await seen;
  await page.locator("#member-dictionary-term").fill("new query"); release();
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
  await expect(page.locator("#member-dictionary-collection-status")).toBeHidden();
  await expect(page.locator("#member-dictionary-public-link")).toBeHidden();
});

test("public dictionary offers the authenticated owner search surface without writing anonymously", async ({ page }) => {
  await page.goto("/dictionary.html#q=abacus");
  await expect(page.locator("#dictionary-term")).toHaveText("abacus");
  await expect(page.locator("#dictionary-owner-link")).toHaveAttribute("href", `${ORIGIN}/personal.html?auth=owner#lookup=abacus`);
  await page.locator("#dictionary-owner-link").click();
  await expect(page.locator("#member-dictionary-term")).toHaveValue("abacus");
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
});

test("typing the next word keeps accepted collection work queued and guards leaving until confirmation", async ({ page, context }, testInfo) => {
  await open(page);
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; });
  const firstSeen = new Promise(resolve => { reached = resolve; });
  const bodies = [];
  await page.route(`**${COLLECTION}`, async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) { reached(); await gate; }
    try { await route.continue(); } catch { /* Cleanup after a failing assertion may close the page. */ }
  });
  try {
    await lookup(page, "abacus"); await firstSeen;
    await lookup(page, "abandon");
    await expect(page.locator("#member-dictionary-word")).toHaveText("abandon");
    await expect(page.locator("#member-collection-queue-summary")).toContainText("2 项处理中");
    await page.screenshot({ path: testInfo.outputPath("collection-queue.png") });
    expect(bodies).toHaveLength(1); // Serialized writes; searching is independent.
    expect(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    })).toBe(true);
    release();
    await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
    await expect(page.locator("#member-collection-queue")).toBeHidden();
    expect(bodies.map(body => body.term)).toEqual(["abacus", "abandon"]);
    const publicWords = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
    for (const term of ["abacus", "abandon"]) expect(publicWords.entries.filter(entry => entry.normalized === term)).toHaveLength(1);
    await expect(page.locator("#member-dictionary-word")).toHaveText("abandon");
  } finally { release(); }
});

test("a previous failed word stays available for explicit retry while the next lookup succeeds", async ({ page, context }) => {
  await open(page); let first = true; const bodies = [];
  await page.route(`**${COLLECTION}`, async route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    if (first) { first = false; await route.fulfill({ status: 503, json: { error: { code: "temporary", message: "稍后重试" } } }); }
    else await route.continue();
  });
  await lookup(page, "abacus");
  await expect(page.locator("#member-collection-queue-retry")).toBeVisible();
  await lookup(page, "abandon");
  await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
  await expect(page.locator("#member-collection-queue-summary")).toContainText("1 项待重试");
  await page.locator("#member-collection-queue-retry").click();
  await expect(page.locator("#member-collection-queue")).toBeHidden();
  expect(bodies.map(body => body.term)).toEqual(["abacus", "abandon", "abacus"]);
  expect(bodies[2].mutationId).toBe(bodies[0].mutationId);
  const publicWords = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  for (const term of ["abacus", "abandon"]) expect(publicWords.entries.filter(entry => entry.normalized === term)).toHaveLength(1);
  await expect(page.locator("#member-dictionary-word")).toHaveText("abandon");
});

test("session revalidation pauses collection and only the same verified owner can retry the unchanged operation", async ({ page }) => {
  await open(page);
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; }), firstSeen = new Promise(resolve => { reached = resolve; });
  const bodies = [];
  await page.route(`**${COLLECTION}`, async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) { reached(); await gate; }
    try { await route.continue(); } catch { /* Paused request may have been aborted before reaching the server. */ }
  });
  try {
    await lookup(page, "abacus"); await firstSeen;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator("#member-workspace")).toBeVisible();
    await expect(page.locator("#member-collection-queue-retry")).toBeVisible();
    release();
    await page.locator("#member-collection-queue-retry").click();
    await expect(page.locator("#member-collection-queue")).toBeHidden();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].mutationId).toBe(bodies[0].mutationId);
  } finally { release(); }
});

test("owner public list supports bounded paging, search and an exact full-card public entry link", async ({ page, context }) => {
  await open(page);
  const snapshot = await publicSnapshot(context);
  const buttons = page.locator("#member-owner-public-list button[data-owner-public-entry]");
  await expect.poll(() => buttons.count()).toBeGreaterThan(0);
  const firstCount = await buttons.count();
  expect(firstCount).toBeLessThan(snapshot.entries.length);
  await expect(page.locator("#member-owner-public-more")).toBeVisible();
  await page.locator("#member-owner-public-more").click();
  await expect.poll(() => buttons.count()).toBeGreaterThan(firstCount);
  const ids = await buttons.evaluateAll(elements => elements.map(element => element.dataset.ownerPublicEntry));
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every(id => snapshot.entries.some(entry => entry.id === id))).toBe(true);

  const entry = snapshot.entries.find(value => value.normalized === "idiosyncratic");
  expect(entry, "the owner's existing main-branch card must remain available").toBeTruthy();
  await page.locator("#member-owner-public-search").fill("IDIOSYNCRATIC");
  await expect(publicRow(page, entry.id)).toBeVisible();
  await expect(buttons).toHaveCount(1);
  await publicRow(page, entry.id).click();
  // Either an intentional new tab or a same-tab navigation is acceptable;
  // a library text search or a foreign-origin link is not an entry deep link.
  let destination;
  await expect.poll(() => {
    destination = context.pages().find(candidate => {
      const url = new URL(candidate.url());
      return url.origin === ORIGIN && url.pathname === "/" && url.searchParams.get("entry") === entry.id;
    });
    return Boolean(destination);
  }).toBe(true);
  await expectFullPublicEntry(destination, entry);
});

test("a late accepted A confirmation immediately enters the owner public list while query B is still pending", async ({ page, context }) => {
  await open(page);
  await expect.poll(() => page.locator("#member-owner-public-list button[data-owner-public-entry]").count()).toBeGreaterThan(0);
  let releaseA, releaseB, reachedA, reachedB, entryA;
  const gateA = new Promise(resolve => { releaseA = resolve; });
  const gateB = new Promise(resolve => { releaseB = resolve; });
  const seenA = new Promise(resolve => { reachedA = resolve; });
  const seenB = new Promise(resolve => { reachedB = resolve; });
  await page.route(`**${COLLECTION}`, async route => {
    const term = route.request().postDataJSON().term;
    if (term === "abacus") {
      const response = await route.fetch(); entryA = (await response.json()).entry;
      reachedA(); await gateA;
      try { await route.fulfill({ response }); } catch { /* Test cleanup can close a gated caller. */ }
    } else {
      expect(term).toBe("abandon"); reachedB(); await gateB;
      try { await route.continue(); } catch { /* Test cleanup can close a gated caller. */ }
    }
  });
  try {
    await lookup(page, "abacus"); await seenA;
    await lookup(page, "abandon");
    await expect(page.locator("#member-dictionary-word")).toHaveText("abandon");
    releaseA(); await seenB;
    // Do not release B first: a later blanket refresh must not hide a missing
    // queue-global confirmation handler for an inactive query A.
    await expect(publicRow(page, entryA.id)).toBeVisible();
    await expect(publicRow(page, entryA.id)).toHaveCount(1);
    await expect(page.locator("#member-dictionary-word")).toHaveText("abandon");
    await expect(page.locator("#member-dictionary-public-link")).toBeHidden();
    releaseB();
    await expect(page.locator("#member-collection-queue")).toBeHidden();
    const snapshot = await publicSnapshot(context);
    const entryB = snapshot.entries.find(entry => entry.normalized === "abandon");
    expect(snapshot.entries.filter(entry => entry.id === entryA.id)).toHaveLength(1);
    expect(entryB).toBeTruthy();
    await expect(publicRow(page, entryB.id)).toBeVisible();
    await expectEntryLink(page.locator("#member-dictionary-public-link"), entryB.id);
  } finally { releaseA(); releaseB(); }
});

test("confirmed public words survive reload while saved owner-private records remain private and collapsed", async ({ page, context }) => {
  await open(page);
  const before = await publicSnapshot(context);
  const privateTerm = "unpublished keepsake";
  const privateNote = `private-only-${randomUUID()}`;
  await openPrivateTools(page);
  await page.locator("#member-term").fill(privateTerm);
  await page.locator("#member-meaning").fill("只给自己看的释义");
  await page.locator("#member-note").fill(privateNote);
  await page.locator("#member-save").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  const privateEntries = async () => {
    const response = await context.request.get(`${ORIGIN}${PRIVATE}`, {
      headers: { "X-Wordbook-Auth": "github-owner", "X-Wordbook-Fields": "partOfSpeech" }
    });
    expect(response.status()).toBe(200); return (await response.json()).entries;
  };
  const privateBefore = await privateEntries();
  expect(privateBefore).toHaveLength(1); expect(privateBefore[0].note).toBe(privateNote);
  expect(await publicSnapshot(context)).toEqual(before);
  await expect(page.locator("#member-owner-public-list")).not.toContainText(privateTerm);
  await page.locator("#member-private-tools > summary").click();
  await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", false);
  await lookup(page, "abacus");
  await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
  const saved = await publicSnapshot(context);
  const entry = saved.entries.find(value => value.normalized === "abacus");
  expect(entry).toBeTruthy(); await expect(publicRow(page, entry.id)).toBeVisible();
  expect(JSON.stringify(saved)).not.toContain(privateTerm); expect(JSON.stringify(saved)).not.toContain(privateNote);
  await expect(page.locator("#member-owner-public-list")).not.toContainText(privateTerm);
  expect(await privateEntries()).toEqual(privateBefore);
  await page.reload();
  await expect(page.locator("#member-owner-public-panel")).toBeVisible();
  await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", false);
  await expect(page.locator("#member-term")).toBeHidden();
  await page.locator("#member-owner-public-search").fill("abacus");
  await expect(publicRow(page, entry.id)).toBeVisible();
  expect((await publicSnapshot(context)).entries.find(value => value.id === entry.id)).toEqual(entry);
  expect(await privateEntries()).toEqual(privateBefore);
  expect(await page.locator("#member-owner-public-list").textContent()).not.toContain(privateTerm);
});

for (const alsoOwnerCookie of [false, true]) test(`an ordinary member keeps private tools open with no owner writes or public panel${alsoOwnerCookie ? " even with a separate GitHub cookie" : ""}`, async ({ page, context }) => {
  await context.clearCookies({ name: "e2e_auth" });
  const registration = await context.request.post(`${ORIGIN}/api/v1/member/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "ordinary_lookup", password: "synthetic private lookup password 2026" }
  });
  expect(registration.status()).toBe(200);
  if (alsoOwnerCookie) await context.addCookies([{ name: "e2e_auth", value: "owner", url: ORIGIN }]);
  const before = await publicSnapshot(context), writes = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(new URL(request.url()).pathname); });
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-username")).toHaveText("@ordinary_lookup");
  await expect(page.locator("#member-auth-type")).not.toHaveText("GitHub 身份");
  await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", true);
  await expect(page.locator("#member-owner-public-panel")).toBeHidden();
  await lookup(page, "abacus");
  await expect(page.locator("#member-dictionary-public-link")).toBeHidden();
  await expect(page.locator("#member-term")).toHaveValue("");
  expect(writes).toEqual([]);
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-term")).toHaveValue("abacus");
  await page.locator("#member-save").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  expect(writes).toContain(PRIVATE);
  expect(writes.filter(path => path.startsWith("/api/v1/owner/"))).toEqual([]);
  expect(await publicSnapshot(context)).toEqual(before);
});
