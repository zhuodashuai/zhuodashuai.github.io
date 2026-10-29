import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expectFullPublicEntry } from "./public-entry-assertions.mjs";

const ORIGIN = "http://127.0.0.1:4187";
const PUBLIC = "/api/v1/public/wordbook";
const COLLECTION = "/api/v1/owner/dictionary-collection";
const MEMBER = "/api/v1/member";
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_run", value: `inline-lookup-${randomUUID()}`, url: ORIGIN }]);
  // Production public GETs have one global snapshot and deliberately do not
  // need credentials. Only the mock namespaces its public state by e2e_run.
  // Forward that isolated fixture read through APIRequestContext; do not change
  // production fetch credentials, cookie scope, CORS or write authorization.
  await context.route(`**${PUBLIC}*`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await context.request.get(`${ORIGIN}${PUBLIC}`);
    await route.fulfill({ response });
  });
  page.on("pageerror", error => { throw new Error(`Inline lookup error: ${error.message}`); });
});

function observe(page) {
  const calls = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) calls.push({ path: url.pathname, method: request.method(),
      headers: request.headers(), body: request.postDataJSON() });
  });
  return calls;
}
const writes = calls => calls.filter(call => !["GET", "HEAD", "OPTIONS"].includes(call.method));
const receipts = page => page.locator("#lookup-receipts button[data-lookup-entry]");
const receipt = (page, id) => page.locator(`#lookup-receipts button[data-lookup-entry="${id}"]`);

async function publicSnapshot(context) {
  const response = await context.request.get(`${ORIGIN}${PUBLIC}`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function collected(context, term) {
  let found;
  await expect.poll(async () => {
    found = (await publicSnapshot(context)).entries.find(entry => entry.term === term);
    return Boolean(found);
  }).toBe(true);
  return found;
}
async function ownerCookie(context) {
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: ORIGIN }]);
}
async function openOwner(context, page, path = "/?auth=owner#library-lookup") {
  await ownerCookie(context);
  await page.goto(path);
  await expect(page.locator("#lookup-auth")).toHaveText(/卓.*自动公开收录/u);
  await expect(page.locator("#lookup-input")).toBeVisible();
}
async function lookup(page, query, expectedTerm = "") {
  await page.locator("#lookup-input").fill(query);
  await page.locator("#lookup-input").press("Enter");
  await expect(page.locator("#lookup-submit")).toBeEnabled();
  if (expectedTerm) {
    await expect(page.locator("#lookup-result")).toBeVisible();
    await expect(page.locator("#lookup-term")).toHaveText(expectedTerm);
  }
}
function expectNarrowCollection(calls) {
  for (const call of writes(calls)) {
    expect(call.path).toBe(COLLECTION);
    expect(call.method).toBe("POST");
    expect(Object.keys(call.body).sort()).toEqual(["mutationId", "term"]);
    expect(call.headers["idempotency-key"]).toBe(call.body.mutationId);
    expect(call.headers["x-csrf-token"]).toBeTruthy();
  }
  expect(calls.filter(call => /ai|translate/u.test(call.path))).toEqual([]);
  expect(calls.filter(call => call.path.startsWith(`${MEMBER}/`) && call.path !== `${MEMBER}/session`)).toEqual([]);
}

test("anonymous homepage lookup is inline, complete and read-only without checking private sessions", async ({ page }) => {
  const calls = observe(page);
  await page.goto("/");
  await expect(page.locator("#library-lookup")).toBeVisible();
  const originalUrl = page.url();
  await lookup(page, "abacus", "abacus");
  await expect(page.locator("#lookup-pos")).toContainText("noun");
  await expect(page.locator("#lookup-meaning")).toContainText("算盘");
  await expect(page.locator("#lookup-source")).not.toHaveText("");
  await expect(page.locator("#lookup-collect")).toBeHidden();
  await expect(receipts(page)).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);
  expect(writes(calls)).toEqual([]);
  expect(calls.filter(call => /\/(?:member\/)?session$/u.test(call.path))).toEqual([]);
});

test("the owner query parameter alone grants no write authority and leaves public lookup usable", async ({ page, context }) => {
  const before = await publicSnapshot(context), calls = observe(page);
  await page.goto("/?auth=owner#library-lookup");
  await lookup(page, "abacus", "abacus");
  await expect(page.locator("#lookup-owner-login")).toBeVisible();
  await expect(page.locator("#lookup-auth")).not.toHaveText(/卓.*自动公开收录/u);
  await expect(page.locator("#lookup-collect")).toBeHidden();
  await expect(receipts(page)).toHaveCount(0);
  expect(writes(calls)).toEqual([]);
  expect(await publicSnapshot(context)).toEqual(before);
});

for (const ownerRequested of [false, true]) test(`ordinary member lookup never publishes${ownerRequested ? " even with the owner-intent URL" : " on the ordinary homepage"}`, async ({ page, context }) => {
  const registration = await context.request.post(`${ORIGIN}${MEMBER}/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "inline_reader", password: "synthetic inline lookup password 2026" }
  });
  expect(registration.status()).toBe(200);
  const before = await publicSnapshot(context), calls = observe(page);
  await page.goto(ownerRequested ? "/?auth=owner#library-lookup" : "/");
  await lookup(page, "abacus", "abacus");
  await expect(page.locator("#lookup-collect")).toBeHidden();
  await expect(receipts(page)).toHaveCount(0);
  expect(writes(calls)).toEqual([]);
  expect(await publicSnapshot(context)).toEqual(before);
  expectNarrowCollection(calls);
});

test("owner Enter confirms a public card in place, preserves chapter scope and private records, deduplicates and survives reload", async ({ page, context }) => {
  await ownerCookie(context);
  const sessionResponse = await context.request.get(`${ORIGIN}${MEMBER}/session`, { headers: { "X-Wordbook-Auth": "github-owner" } });
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json();
  const privateTerm = "unpublished keepsake", privateNote = `private-inline-${randomUUID()}`;
  const privateSave = await context.request.post(`${ORIGIN}${MEMBER}/entries`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "github-owner", "X-CSRF-Token": session.csrfToken },
    data: { term: privateTerm, meaning: "只属于私人的释义", note: privateNote, mutationId: randomUUID() }
  });
  expect(privateSave.status()).toBe(200);
  const privateEntries = async () => {
    const response = await context.request.get(`${ORIGIN}${MEMBER}/entries`, { headers: { "X-Wordbook-Auth": "github-owner", "X-Wordbook-Fields": "partOfSpeech" } });
    expect(response.status()).toBe(200); return response.json();
  };
  const privateBefore = await privateEntries();
  const calls = observe(page);
  await openOwner(context, page, "/?auth=owner&book=never-let-me-go&chapter=chapter-1#library-lookup");
  await expect(page.locator('#chapter-tabs button[data-value="chapter-1"]')).toHaveAttribute("aria-pressed", "true");
  const originalUrl = page.url();
  await lookup(page, "abacus", "abacus");
  const entry = await collected(context, "abacus");
  await expect(receipt(page, entry.id)).toBeVisible();
  await expect(receipt(page, entry.id)).toHaveCount(1);
  expect(page.url()).toBe(originalUrl);
  await expect(page.locator('#chapter-tabs button[data-value="chapter-1"]')).toHaveAttribute("aria-pressed", "true");
  await receipt(page, entry.id).click();
  await expectFullPublicEntry(page, entry);
  expect(page.url()).toBe(originalUrl);
  await page.keyboard.press("Escape");
  await lookup(page, "abacus", "abacus");
  await expect.poll(() => writes(calls).length).toBe(2);
  await expect(receipt(page, entry.id)).toBeVisible();
  const after = await publicSnapshot(context);
  expect(after.entries.filter(value => value.normalized === "abacus")).toHaveLength(1);
  expect(after.entries.find(value => value.id === entry.id)).toEqual(entry);
  expect(JSON.stringify(after)).not.toContain(privateTerm);
  expect(JSON.stringify(after)).not.toContain(privateNote);
  expect(await privateEntries()).toEqual(privateBefore);
  await expect(page.locator("body")).not.toContainText(privateNote);
  expectNarrowCollection(calls);
  await page.reload();
  await expect(page.locator('#chapter-tabs button[data-value="chapter-1"]')).toHaveAttribute("aria-pressed", "true");
  // A reload must read the actual public API, not depend on an in-memory receipt.
  await page.locator('#collection-tabs button[data-value="all"]').click();
  await page.locator("#library-search").fill("abacus");
  const publicCard = page.locator(`#entry-grid button[data-entry-id="${entry.id}"]`);
  await expect(publicCard).toBeVisible();
  await publicCard.click(); await expectFullPublicEntry(page, entry);
  expect((await publicSnapshot(context)).entries.find(value => value.id === entry.id)).toEqual(entry);
  expect(await privateEntries()).toEqual(privateBefore);
});

test("Chinese preview is passive, actual candidate clicks publish that head, and inflections require explicit collection", async ({ page, context }) => {
  await openOwner(context, page); const calls = observe(page), originalUrl = page.url();
  await lookup(page, "苹果");
  const appleChoice = page.locator("#lookup-choices button[data-lookup-choice]").filter({ hasText: /^apple\s+·/u });
  await expect(appleChoice).toHaveCount(1);
  await expect(appleChoice).toBeVisible();
  expect(writes(calls)).toEqual([]);
  await expect(receipts(page)).toHaveCount(0);
  await appleChoice.click();
  await expect(page.locator("#lookup-term")).toHaveText("apple");
  const apple = await collected(context, "apple");
  await expect(receipt(page, apple.id)).toBeVisible();
  expect(writes(calls).map(call => call.body.term)).toEqual(["apple"]);
  // The actual expanded index has a separate canonical "went" entry. Use a
  // verified form-only key here rather than incorrectly overriding that head.
  await lookup(page, "rehearsing", "rehearse");
  await expect(page.locator("#lookup-collect")).toBeVisible();
  expect(writes(calls).map(call => call.body.term)).toEqual(["apple"]);
  await page.locator("#lookup-collect").click();
  const rehearse = await collected(context, "rehearse");
  await expect(receipt(page, rehearse.id)).toBeVisible();
  expect(writes(calls).map(call => call.body.term)).toEqual(["apple", "rehearse"]);
  expect(page.url()).toBe(originalUrl); expectNarrowCollection(calls);
});

test("a related Chinese choice collects only after a real click and keeps its canonical source", async ({ page, context }) => {
  await openOwner(context, page); const calls = observe(page);
  await lookup(page, "开心");
  const happyChoice = page.locator("#lookup-choices button[data-lookup-choice]").filter({ hasText: /^happy\b/u });
  await expect(happyChoice).toBeVisible();
  expect(writes(calls)).toEqual([]);
  await happyChoice.click();
  await expect(page.locator("#lookup-term")).toHaveText("happy");
  const entry = await collected(context, "happy");
  await expect(receipt(page, entry.id)).toBeVisible();
  expect(writes(calls).map(call => call.body.term)).toEqual(["happy"]);
  expect(entry.sourceTitle).toBeTruthy(); expect(entry.sources[0].kind).toBe("dictionary");
  await receipt(page, entry.id).click(); await expectFullPublicEntry(page, entry);
  expectNarrowCollection(calls);
});

test("heppy remains a miss until a spelling suggestion is explicitly clicked in the same page", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOwner(context, page); const calls = observe(page), originalUrl = page.url();
  await lookup(page, "heppy");
  const suggestion = page.locator('#lookup-choices button[data-lookup-suggestion="0"]');
  await expect(suggestion).toHaveText("你是否想查 happy？");
  await expect(page.locator("#lookup-input")).toHaveValue("heppy");
  await expect(page.locator("#lookup-result")).toBeHidden();
  expect(writes(calls)).toEqual([]);
  await suggestion.click();
  await expect(page.locator("#lookup-term")).toHaveText("happy");
  await expect(page.locator("#lookup-input")).toHaveValue("happy");
  const entry = await collected(context, "happy");
  await expect(receipt(page, entry.id)).toBeVisible();
  expect(writes(calls).map(call => call.body.term)).toEqual(["happy"]);
  expect(page.url()).toBe(originalUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expectNarrowCollection(calls);
});

test("healthy sequential spelling reads survive initial library rendering without collecting or changing the typo", async ({ page, context }) => {
  const initial = await publicSnapshot(context);
  expect(initial.entries.length).toBeGreaterThan(500);
  let releaseSnapshot, snapshotReleased = false;
  const snapshotGate = new Promise(resolve => { releaseSnapshot = resolve; });
  await page.route(`**${PUBLIC}*`, async route => {
    const response = await context.request.get(`${ORIGIN}${PUBLIC}`); await snapshotGate;
    try { await route.fulfill({ response }); } catch { /* Cleanup may close an unfinished read. */ }
  });
  await page.route("**/data/dictionary-suggestions/**", async route => {
    const response = await route.fetch();
    if (!route.request().url().endsWith("manifest.json") && !snapshotReleased) { snapshotReleased = true; releaseSnapshot(); }
    // Each healthy read takes less than the existing three-second resource
    // limit; the two sequential stages exceed the obsolete aggregate limit.
    await new Promise(resolve => setTimeout(resolve, 1700));
    try { await route.fulfill({ response }); } catch { /* Editing or cleanup may cancel this optional read. */ }
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 }); await openOwner(context, page);
    const calls = observe(page); await lookup(page, "heppy");
    await expect(page.locator("#library-lookup")).toHaveAttribute("data-suggestion-phase", "loading");
    await expect(page.locator("#lookup-status")).toContainText("正在查找相近拼写");
    await expect(page.locator("#lookup-submit")).toBeEnabled();
    await expect(page.locator("#lookup-cancel")).toBeVisible();
    const suggestion = page.locator('#lookup-choices button[data-lookup-suggestion="0"]');
    await expect(suggestion).toHaveText("你是否想查 happy？");
    await expect(page.locator("#lookup-input")).toHaveValue("heppy");
    await expect(page.locator("#lookup-result")).toBeHidden();
    await expect(page.locator("#entry-grid")).toHaveAttribute("aria-busy", "false");
    expect(writes(calls)).toEqual([]); expect(await publicSnapshot(context)).toEqual(initial);
    await suggestion.click(); await expect(page.locator("#lookup-term")).toHaveText("happy");
    await collected(context, "happy"); expectNarrowCollection(calls);
  } finally { releaseSnapshot(); }
});

test("inline spelling failure is visible and Enter can retry without silently collecting the suggested word", async ({ page, context }) => {
  let unavailable = true;
  await page.route("**/data/dictionary-suggestions/**", route => unavailable
    ? route.fulfill({ status: 503, body: "Synthetic optional index outage" }) : route.continue());
  await openOwner(context, page); const calls = observe(page); await lookup(page, "heppy");
  await expect(page.locator("#library-lookup")).toHaveAttribute("data-suggestion-phase", "error");
  await expect(page.locator("#lookup-status")).toContainText("拼写建议暂不可用");
  await expect(page.locator("#lookup-submit")).toBeEnabled();
  await expect(page.locator("#lookup-input")).toHaveValue("heppy"); expect(writes(calls)).toEqual([]);
  unavailable = false; await page.locator("#lookup-input").press("Enter");
  await expect(page.locator('#lookup-choices button[data-lookup-suggestion="0"]')).toHaveText("你是否想查 happy？");
  await expect(page.locator("#lookup-result")).toBeHidden(); expect(writes(calls)).toEqual([]);
});

test("same-owner late A confirmation appears immediately while B is pending, without stealing B's result", async ({ page, context }) => {
  await openOwner(context, page); const calls = observe(page), originalUrl = page.url();
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
      try { await route.fulfill({ response }); } catch { /* The test's finally releases all gated callers. */ }
    } else {
      expect(term).toBe("abandon"); reachedB(); await gateB;
      try { await route.continue(); } catch { /* Cleanup may close the page. */ }
    }
  });
  try {
    await lookup(page, "abacus", "abacus"); await seenA;
    await lookup(page, "abandon", "abandon");
    expect(writes(calls)).toHaveLength(1); // FIFO writes, independent public search.
    releaseA(); await seenB;
    // Keep B pending: showing A must not rely on a later blanket refresh.
    await expect(receipt(page, entryA.id)).toBeVisible();
    await expect(receipt(page, entryA.id)).toHaveCount(1);
    await expect(page.locator("#lookup-term")).toHaveText("abandon");
    await receipt(page, entryA.id).click(); await expectFullPublicEntry(page, entryA);
    await page.keyboard.press("Escape");
    await expect(page.locator("#lookup-term")).toHaveText("abandon");
    expect(page.url()).toBe(originalUrl);
    releaseB();
    const entryB = await collected(context, "abandon");
    await expect(receipt(page, entryB.id)).toBeVisible();
    expect(writes(calls).map(call => call.body.term)).toEqual(["abacus", "abandon"]);
    expectNarrowCollection(calls);
  } finally { releaseA(); releaseB(); }
});

test("an old in-flight public GET and a deployed fallback cannot erase an API-confirmed card", async ({ page, context }) => {
  const baseline = await publicSnapshot(context);
  expect(baseline.entries.some(entry => entry.normalized === "abacus")).toBe(false);
  let release, reached, failedPublic = false, fallbackReads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { reached = resolve; });
  await page.route(`**${PUBLIC}*`, async route => {
    if (failedPublic) return route.fulfill({ status: 503, json: { error: { code: "public_snapshot_unavailable", message: "fixture outage" } } });
    reached(); await gate;
    try { await route.fulfill({ status: 200, json: baseline }); } catch { /* Cleanup releases an unfinished read. */ }
  });
  await page.route("**/data/owner-wordbook.json*", async route => {
    fallbackReads++; await route.fulfill({ status: 200, json: baseline });
  });
  try {
    await openOwner(context, page); await seen;
    await lookup(page, "abacus", "abacus");
    const entry = await collected(context, "abacus");
    await expect(receipt(page, entry.id)).toBeVisible();
    release();
    await expect(page.locator("#entry-grid")).toHaveAttribute("aria-busy", "false");
    await receipt(page, entry.id).click(); await expectFullPublicEntry(page, entry);
    await page.keyboard.press("Escape");
    failedPublic = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => fallbackReads).toBeGreaterThan(0);
    await expect(page.locator("#entry-grid")).toHaveAttribute("aria-busy", "false");
    await expect(receipt(page, entry.id)).toBeVisible();
    await receipt(page, entry.id).click(); await expectFullPublicEntry(page, entry);
    expect((await publicSnapshot(context)).entries.find(value => value.id === entry.id)).toEqual(entry);
  } finally { release(); }
});

test("an unconfirmed collection retries the same narrow mutation key and never shows a premature receipt", async ({ page, context }) => {
  await openOwner(context, page);
  const bodies = []; let first = true;
  await page.route(`**${COLLECTION}`, async route => {
    bodies.push(route.request().postDataJSON());
    if (first) {
      first = false;
      return route.fulfill({ status: 503, json: { error: { code: "temporary", message: "fixture retry" } } });
    }
    return route.continue();
  });
  await lookup(page, "abacus", "abacus");
  await expect(page.locator("#lookup-retry")).toBeVisible();
  await expect(receipts(page)).toHaveCount(0);
  expect((await publicSnapshot(context)).entries.some(entry => entry.normalized === "abacus")).toBe(false);
  await page.locator("#lookup-retry").click();
  const entry = await collected(context, "abacus");
  await expect(receipt(page, entry.id)).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(Object.keys(bodies[0]).sort()).toEqual(["mutationId", "term"]);
});

test("a malformed claimed owner identity cannot enable public mutation", async ({ page, context }) => {
  await ownerCookie(context);
  await page.route(`**${MEMBER}/session`, async route => {
    const response = await route.fetch(); const payload = await response.json();
    expect(payload.authType).toBe("github-owner");
    await route.fulfill({ status: 200, json: { ...payload,
      user: { id: "11111111-1111-4111-8111-111111111111", username: "zhuodashuai" } } });
  });
  const calls = observe(page);
  await page.goto("/?auth=owner#library-lookup");
  await lookup(page, "abacus", "abacus");
  await expect(page.locator("#lookup-auth")).not.toHaveText(/卓.*自动公开收录/u);
  await expect(page.locator("#lookup-collect")).toBeHidden();
  await expect(receipts(page)).toHaveCount(0);
  expect(writes(calls)).toEqual([]);
});

test("a receipt follows a later authoritative edit and disappears after a later real deletion", async ({ page, context }) => {
  await openOwner(context, page);
  await lookup(page, "abacus", "abacus");
  const original = await collected(context, "abacus");
  await expect(receipt(page, original.id)).toBeVisible();
  await receipt(page, original.id).click(); await expectFullPublicEntry(page, original);

  // Exercise the isolated fixture's real edit/delete and public GET routes,
  // not a controller stub or a fabricated in-memory confirmation.
  const session = await (await context.request.get(`${ORIGIN}${MEMBER}/session`, {
    headers: { "X-Wordbook-Auth": "github-owner" }
  })).json();
  async function publishFixture(mutation) {
    const currentResponse = await context.request.get(`${ORIGIN}/api/v1/owner/wordbook`);
    expect(currentResponse.status()).toBe(200);
    const current = await currentResponse.json(), mutationId = randomUUID();
    const response = await context.request.post(`${ORIGIN}/api/v1/owner/publish`, {
      headers: { Origin: ORIGIN, "X-CSRF-Token": session.csrfToken, "Idempotency-Key": mutationId },
      data: { mutationId, baseSha: current.sha, clientProtocol: "v38", queueProtocol: "v38", mutation }
    });
    expect(response.status()).toBe(200); return response.json();
  }
  const changedMeaning = "n. 算盘；经编辑核对的公开释义";
  const update = await publishFixture({ type: "update", entry: { ...original, meaning: changedMeaning }, expectedUpdatedAt: original.updatedAt });
  expect(Date.parse(update.entry.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
  expect(Date.parse(update.snapshot.exportedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
  await expect.poll(async () => {
    // Focus refresh has a deliberate three-second throttle. Polling the real
    // event waits for that policy without a hard sleep or bypassing the loader.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    return page.locator("#dialog-meaning").innerText();
  }).toContain(changedMeaning);
  await expectFullPublicEntry(page, update.entry);
  await page.keyboard.press("Escape");
  await expect(receipt(page, original.id)).toBeFocused();
  await receipt(page, original.id).click(); await expectFullPublicEntry(page, update.entry);
  await page.keyboard.press("Escape");

  const removed = await publishFixture({ type: "delete", id: original.id, expectedUpdatedAt: update.entry.updatedAt });
  expect(removed.snapshot.entries.some(entry => entry.id === original.id)).toBe(false);
  expect(Date.parse(removed.snapshot.exportedAt)).toBeGreaterThan(Date.parse(update.entry.updatedAt));
  await expect.poll(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    return receipt(page, original.id).count();
  }).toBe(0);
  await expect(page.locator(`#entry-grid button[data-entry-id="${original.id}"]`)).toHaveCount(0);
  // An already-queued click identifying the old receipt must not resurrect its
  // closed-over pre-deletion card after the authoritative snapshot removed it.
  await page.evaluate(id => {
    const stale = document.createElement("button"); stale.dataset.lookupEntry = id;
    document.getElementById("lookup-receipts").append(stale); stale.click(); stale.remove();
  }, original.id);
  await expect(page.locator("#entry-dialog")).toBeHidden();
  expect((await publicSnapshot(context)).entries.some(entry => entry.id === original.id)).toBe(false);
});

test("a late A saving message cannot attach to selected Chinese candidate B while A's receipt remains available", async ({ page, context }) => {
  await openOwner(context, page); await lookup(page, "开心");
  const choices = page.locator("#lookup-choices button[data-lookup-choice]");
  const choiceA = choices.filter({ hasText: /^happy\b/u });
  const choiceB = choices.filter({ hasText: /^chuffed\b/u });
  await expect(choiceA).toBeVisible(); await expect(choiceB).toBeVisible();
  let releaseA, releaseB, reachedA, reachedB, entryA;
  const gateA = new Promise(resolve => { releaseA = resolve; }), gateB = new Promise(resolve => { releaseB = resolve; });
  const seenA = new Promise(resolve => { reachedA = resolve; }), seenB = new Promise(resolve => { reachedB = resolve; });
  await page.route(`**${COLLECTION}`, async route => {
    if (route.request().postDataJSON().term === "happy") {
      const response = await route.fetch(); entryA = (await response.json()).entry;
      reachedA(); await gateA;
      try { await route.fulfill({ response }); } catch { /* All gates are released in finally. */ }
    } else {
      expect(route.request().postDataJSON().term).toBe("chuffed"); reachedB(); await gateB;
      try { await route.continue(); } catch { /* Cleanup may close a pending caller. */ }
    }
  });
  try {
    await choiceA.click(); await seenA;
    await choiceB.click(); await expect(page.locator("#lookup-term")).toHaveText("chuffed");
    await expect(page.locator("#lookup-status")).not.toContainText("正在收录到公开词库");
    await page.evaluate(() => {
      window.inlineStatusWrites = [];
      // Read each actual added text node: MutationObserver's current text alone
      // could miss A's wrong message when B overwrites it in the same JS turn.
      window.inlineStatusObserver = new MutationObserver(records => {
        for (const record of records) window.inlineStatusWrites.push({ term: document.getElementById("lookup-term").textContent,
          message: [...record.addedNodes].map(node => node.textContent).join("") });
      });
      window.inlineStatusObserver.observe(document.getElementById("lookup-status"), { childList: true });
    });
    releaseA(); await seenB;
    await expect(receipt(page, entryA.id)).toBeVisible();
    await expect(page.locator("#lookup-term")).toHaveText("chuffed");
    expect(await page.evaluate(() => window.inlineStatusWrites.filter(row => row.term === "chuffed"
      && /已收录到卓的公开词库|公开词库已经收录/u.test(row.message)))).toEqual([]);
    await receipt(page, entryA.id).click(); await expectFullPublicEntry(page, entryA);
    await page.keyboard.press("Escape"); releaseB();
    const entryB = await collected(context, "chuffed");
    await expect(receipt(page, entryB.id)).toBeVisible();
  } finally {
    releaseA(); releaseB();
    await page.evaluate(() => window.inlineStatusObserver?.disconnect()).catch(() => {});
  }
});

test("IME composition Enter never submits or collects, but normal Enter after composition does", async ({ page, context }) => {
  await openOwner(context, page); const calls = observe(page), input = page.locator("#lookup-input");
  await input.fill("abacus");
  await input.dispatchEvent("compositionstart", { data: "a" });
  const prevented = await input.evaluate(element => {
    const key = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true });
    element.dispatchEvent(key); return key.defaultPrevented;
  });
  expect(prevented).toBe(true);
  // This trusted Enter may emit submit even when the synthetic key above does
  // not; the form-level composition state must independently reject it.
  await input.press("Enter");
  await expect(page.locator("#lookup-result")).toBeHidden();
  await expect(receipts(page)).toHaveCount(0);
  expect(writes(calls)).toEqual([]);
  await input.dispatchEvent("compositionend", { data: "abacus" });
  await input.press("Enter");
  await expect(page.locator("#lookup-term")).toHaveText("abacus");
  const entry = await collected(context, "abacus");
  await expect(receipt(page, entry.id)).toBeVisible();
  expect(writes(calls).map(call => call.body.term)).toEqual(["abacus"]);
  expectNarrowCollection(calls);
});

test("logout locks immediately before its response and never silently restores collection from a surviving owner cookie", async ({ page, context }) => {
  await openOwner(context, page); const calls = observe(page);
  await lookup(page, "abacus", "abacus");
  const saved = await collected(context, "abacus"); await expect(receipt(page, saved.id)).toBeVisible();
  const logout = page.locator("#lookup-logout"); await expect(logout).toBeEnabled();
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; }), seen = new Promise(resolve => { reached = resolve; });
  await page.route(`**${MEMBER}/logout`, async route => {
    expect(route.request().headers()["x-wordbook-auth"]).toBe("github-owner");
    expect(route.request().headers()["x-csrf-token"]).toBeTruthy();
    reached(); await gate;
    try { await route.continue(); } catch { /* Cleanup always releases the logout request. */ }
  });
  try {
    await logout.click(); await seen;
    // The server still has the owner cookie while this logout response is held.
    expect((await context.cookies(ORIGIN)).some(cookie => cookie.name === "e2e_auth" && cookie.value === "owner")).toBe(true);
    await expect(page.locator("#lookup-auth")).toContainText("退出");
    await expect(page.locator("#lookup-logout")).toBeHidden();
    const sessionReads = calls.filter(call => call.path === `${MEMBER}/session`).length;
    await lookup(page, "abandon", "abandon");
    await expect(page.locator("#lookup-collect")).toBeHidden();
    await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
    expect(calls.filter(call => call.path === `${MEMBER}/session`)).toHaveLength(sessionReads);
    expect(writes(calls).map(call => call.path)).toEqual([COLLECTION, `${MEMBER}/logout`]);
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage))))
      .toEqual({ "zhuo-member-explicit-login-required": "1" });
    release();
    await expect.poll(async () => (await context.cookies(ORIGIN)).some(cookie => cookie.name === "e2e_auth")).toBe(false);
    // A surviving/reissued cookie must not override this tab's explicit logout.
    await ownerCookie(context); await page.reload();
    await lookup(page, "abandon", "abandon");
    await expect(page.locator("#lookup-collect")).toBeHidden();
    expect(calls.filter(call => call.path === `${MEMBER}/session`)).toHaveLength(sessionReads);
    expect(writes(calls).map(call => call.path)).toEqual([COLLECTION, `${MEMBER}/logout`]);
    expect((await publicSnapshot(context)).entries.some(entry => entry.normalized === "abandon")).toBe(false);
  } finally { release(); }
});

test("storage failure and failed logout still lock both owner tabs across focus, online and reload", async ({ page, context }) => {
  await openOwner(context, page);
  const second = await context.newPage();
  try {
    await second.goto("/?auth=owner#library-lookup");
    await expect(second.locator("#lookup-auth")).toHaveText(/卓.*自动公开收录/u);
    await page.bringToFront();
    await expect(page.locator("#lookup-auth")).toHaveText(/卓.*自动公开收录/u);
    const callsA = observe(page), callsB = observe(second), before = await publicSnapshot(context);
    // Install only after owner verification, then retain the same unavailable
    // session storage on reload. Local/public preferences are left untouched.
    function unavailableSessionStorage() {
      const storage = window.sessionStorage, prototype = Storage.prototype;
      for (const method of ["getItem", "setItem"]) {
        const original = prototype[method];
        Object.defineProperty(prototype, method, { configurable: true, value: function (...args) {
          if (this === storage) throw new DOMException("Session storage unavailable in fixture", "SecurityError");
          return original.apply(this, args);
        } });
      }
    }
    await page.addInitScript(unavailableSessionStorage);
    await page.evaluate(unavailableSessionStorage);
    await page.route(`**${MEMBER}/logout`, route => route.fulfill({ status: 503,
      json: { error: { code: "logout_unavailable", message: "Synthetic logout outage" } } }));
    await page.locator("#lookup-logout").click();
    await expect(page.locator("#lookup-auth")).toContainText("服务器退出尚未确认");
    // A's failing setItem must not suppress its independent cross-tab message.
    await expect(second.locator("#lookup-auth")).toContainText("另一页面的账号状态已改变");
    await expect(page.locator("#lookup-logout")).toBeHidden();
    await expect(second.locator("#lookup-logout")).toBeHidden();
    expect(await second.evaluate(() => sessionStorage.getItem("zhuo-member-explicit-login-required"))).toBe("1");
    expect((await context.cookies(ORIGIN)).some(cookie => cookie.name === "e2e_auth" && cookie.value === "owner")).toBe(true);
    const sessionReads = calls => calls.filter(call => call.path === `${MEMBER}/session`).length;
    const readsA = sessionReads(callsA), readsB = sessionReads(callsB);
    for (const tab of [page, second]) {
      await tab.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
      await lookup(tab, "abacus", "abacus");
      await expect(tab.locator("#lookup-collect")).toBeHidden();
      await expect(receipts(tab)).toHaveCount(0);
    }
    expect(sessionReads(callsA)).toBe(readsA); expect(sessionReads(callsB)).toBe(readsB);
    expect(writes(callsA).map(call => call.path)).toEqual([`${MEMBER}/logout`]);
    expect(writes(callsB)).toEqual([]);
    await page.reload(); await second.reload();
    await expect(page.locator("#lookup-auth")).toContainText("存储不可用");
    await expect(page.locator("#lookup-auth")).toContainText("开启站点存储");
    await expect(second.locator("#lookup-auth")).toContainText("已退出公开收录");
    for (const tab of [page, second]) {
      await tab.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
      await lookup(tab, "abandon", "abandon");
      await expect(tab.locator("#lookup-collect")).toBeHidden();
    }
    expect(sessionReads(callsA)).toBe(readsA); expect(sessionReads(callsB)).toBe(readsB);
    expect(writes(callsA).map(call => call.path)).toEqual([`${MEMBER}/logout`]);
    expect(writes(callsB)).toEqual([]);
    expect(await publicSnapshot(context)).toEqual(before);
  } finally { await second.close(); }
});
