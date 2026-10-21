import test from "node:test";
import assert from "node:assert/strict";
import { createLibraryLookupController } from "../js/library-lookup-controller.js";
import { createBlankEntry } from "../js/wordbook-schema.js?v=77";

const OWNER_UID = "15604207-8000-4000-8000-000000000001";
const MEMBER_UID = "15604207-8000-4000-8000-000000000002";
const OWNER_CSRF = "owner_csrf_private_" + "x".repeat(32);
const FRESH_CSRF = "owner_csrf_refreshed_" + "y".repeat(32);
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const row = (term = "apple", extra = {}) => ({ term, partOfSpeech: "noun", meaning: "苹果", source: "ECDICT", ...extra });
const response = (...results) => ({ results, hasMore: false });
const ownerSession = (extra = {}) => ({ authenticated: true, authType: "github-owner",
  user: { id: OWNER_UID, username: "zhuodashuai" }, csrfToken: OWNER_CSRF, expiresAt: 10_000, ...extra });
function confirmed(term = "apple", added = true) {
  const entry = createBlankEntry(term); entry.meaning = "苹果"; entry.organizationMethod = "local-dictionary";
  return { entry, added, sha: "a".repeat(40) };
}
function fakeExpiryTimer() {
  const scheduled = [];
  let active = null;
  return { scheduled, schedule(value) { scheduled.push(value); active = value; }, clear() { active = null; },
    fire(value = active) { if (value?.isCurrent()) value.onExpire(); },
    get active() { return active; } };
}
function harness(t, overrides = {}) {
  const calls = { sessions: [], searches: [], collections: [], logouts: [], changes: [], collected: [] };
  const expiryTimer = overrides.expiryTimer || fakeExpiryTimer();
  const readSession = overrides.readSession || (async () => ownerSession());
  const collect = overrides.collect || (async body => confirmed(body.term));
  const signOut = overrides.signOut || (async () => {});
  const search = overrides.search || (async input => response(row(input)));
  const controller = createLibraryLookupController({ ownerRequested: true, ownerOrigin: true,
    suggest: async () => [], relatedSearch: async () => response(), now: () => 1_000,
    ...overrides, expiryTimer,
    readSession(options) { calls.sessions.push(options); return readSession(options); },
    search(input, options) { calls.searches.push({ input, options }); return search(input, options); },
    collect(body, options) { calls.collections.push({ body, options }); return collect(body, options); },
    signOut(options) { calls.logouts.push(options); return signOut(options); },
    onChange(state) { calls.changes.push(structuredClone(state)); overrides.onChange?.(state); },
    onCollected(...args) { calls.collected.push(args); overrides.onCollected?.(...args); }
  });
  t.after(() => controller.dispose());
  return { controller, calls, expiryTimer };
}
async function readyOwner(controller) {
  await controller.verifyOwner();
  assert.equal(controller.getState().authPhase, "ready");
  assert.equal(controller.getState().owner, true);
}
function assertPublicOnly(controller, calls) {
  assert.doesNotMatch(JSON.stringify({ state: controller.getState(), events: calls.changes }),
    /owner_csrf_private_|owner_csrf_refreshed_|csrfToken|mutationId|expiresAt|"session"|"signal"|transport-secret/u);
}

test("visitor mode and a non-owner origin never check a session or write, but keep public lookup usable", async t => {
  for (const modes of [{ ownerRequested: false, ownerOrigin: true }, { ownerRequested: true, ownerOrigin: false }]) {
    const { controller, calls } = harness(t, modes);
    await controller.verifyOwner();
    await controller.submit("apple"); controller.select(0); await tick();
    assert.equal(controller.getState().lookup.phase, "ready");
    assert.equal(controller.getState().lookup.results[0].term, "apple");
    assert.equal(controller.getState().owner, false);
    assert.equal(calls.sessions.length, 0); assert.equal(calls.collections.length, 0);
    assertPublicOnly(controller, calls);
  }
});

test("only the exact validated owner session grants collection authority", async t => {
  const payloads = [
    { authenticated: false },
    ownerSession({ authType: "member", user: { id: MEMBER_UID, username: "another_user" }, csrfToken: "m".repeat(43) }),
    ownerSession({ user: { id: MEMBER_UID, username: "zhuodashuai" } }),
    ownerSession({ user: { id: OWNER_UID, username: "another_user" } }),
    ownerSession({ csrfToken: "short" }),
    ownerSession({ expiresAt: 1_000 })
  ];
  for (const payload of payloads) {
    const { controller, calls } = harness(t, { readSession: async () => payload });
    await controller.verifyOwner();
    assert.equal(controller.getState().owner, false);
    assert.equal(controller.getState().authPhase, payload.authenticated === false ? "anonymous" : "locked");
    await controller.submit("apple"); controller.select(0); await tick();
    assert.equal(controller.getState().lookup.phase, "ready"); assert.equal(calls.collections.length, 0);
    assertPublicOnly(controller, calls);
  }
  const { controller, calls } = harness(t);
  await readyOwner(controller);
  assert.ok(calls.sessions[0].signal instanceof AbortSignal);
  assertPublicOnly(controller, calls);
});

test("failed owner verification reports unavailable without leaking transport details or blocking public search", async t => {
  const { controller, calls } = harness(t, { readSession: async () => { throw new Error("transport-secret"); } });
  await controller.verifyOwner();
  assert.equal(controller.getState().authPhase, "unavailable"); assert.equal(controller.getState().owner, false);
  await controller.submit("apple"); await tick();
  assert.equal(controller.getState().lookup.phase, "ready"); assert.equal(calls.collections.length, 0);
  assertPublicOnly(controller, calls);
});

test("a synchronous session-adapter failure can recover on an explicit verification retry", async t => {
  let attempts = 0;
  const { controller, calls } = harness(t, { readSession: () => {
    if (++attempts === 1) throw new Error("transport-secret");
    return Promise.resolve(ownerSession());
  } });
  await controller.verifyOwner();
  assert.equal(controller.getState().authPhase, "unavailable");
  await controller.verifyOwner();
  assert.equal(calls.sessions.length, 2); assert.equal(controller.getState().authPhase, "ready");
  await controller.submit("apple"); await tick();
  assert.equal(calls.collections.length, 1); assertPublicOnly(controller, calls);
});

test("a verified exact English hit sends only the canonical head and mutation key and exposes a confirmed public receipt", async t => {
  const { controller, calls } = harness(t, { search: async () => response(row("apple", { meaning: "展示用释义", exampleEn: "not a write payload" })) });
  await readyOwner(controller);
  await controller.submit("APPLE!"); await tick();
  assert.equal(calls.collections.length, 1);
  const { body, options } = calls.collections[0];
  assert.deepEqual(Object.keys(body).sort(), ["mutationId", "term"]); assert.equal(body.term, "apple");
  assert.match(body.mutationId, /^[A-Za-z0-9._:-]{12,180}$/u);
  assert.equal(options.csrfToken, OWNER_CSRF); assert.ok(options.signal instanceof AbortSignal);
  assert.equal(controller.getState().receipts.length, 1);
  assert.equal(controller.getState().receipts[0].entry.term, "apple");
  assert.equal(controller.getState().receipts[0].entry.meaning, "苹果");
  assert.equal(controller.getState().receipts[0].added, true);
  assert.equal(calls.collected.length, 1); assert.equal(controller.hasUnsettled(), false);
  assertPublicOnly(controller, calls);
});

test("Chinese, multiple, incomplete and morphological matches require explicit selection rather than automatic collection", async t => {
  const scenarios = [
    { input: "苹果", result: response(row("apple")) },
    { input: "apple", result: response(row("apple"), row("crabapple")) },
    { input: "apple", result: { ...response(row("apple")), hasMore: true } },
    { input: "apples", result: response(row("apple", { matchedForm: "apples" })) }
  ];
  for (const scenario of scenarios) {
    const { controller, calls } = harness(t, { search: async () => scenario.result });
    await readyOwner(controller);
    await controller.submit(scenario.input); await tick();
    assert.equal(calls.collections.length, 0);
    controller.select(0); await tick();
    assert.equal(calls.collections.length, 1); assert.equal(calls.collections[0].body.term, "apple");
  }
});

test("related associations append without writing; an explicit related choice collects its canonical head", async t => {
  const related = deferred();
  const { controller, calls } = harness(t, { search: async () => response(row("cheerful")),
    relatedSearch: () => related.promise });
  await readyOwner(controller);
  await controller.submit("开心");
  related.resolve(response(row("happy", { matchType: "related", matchedChinese: "高兴" })));
  await tick();
  assert.equal(controller.getState().lookup.selectedIndex, 0); assert.equal(calls.collections.length, 0);
  assert.deepEqual(controller.getState().lookup.results.map(value => value.term), ["cheerful", "happy"]);
  controller.select(1); await tick();
  assert.equal(calls.collections.length, 1); assert.equal(calls.collections[0].body.term, "happy");
});

test("a spelling suggestion never writes until chosen and independently resolved as its new canonical query", async t => {
  const { controller, calls } = harness(t, { search: async input => input === "heppy" ? response() : response(row("happy")),
    suggest: async () => [{ term: "happy", distance: 1 }] });
  await readyOwner(controller);
  await controller.submit("heppy"); await tick();
  assert.equal(calls.collections.length, 0); assert.equal(controller.getState().lookup.input, "heppy");
  controller.chooseSuggestion(0); await tick();
  assert.deepEqual(calls.searches.map(value => value.input), ["heppy", "happy"]);
  assert.equal(controller.getState().lookup.input, "happy");
  assert.equal(calls.collections.length, 1); assert.equal(calls.collections[0].body.term, "happy");
});

test("lookup changes and cancellation do not abort or drop already-authorized FIFO collections", async t => {
  const releases = [];
  const { controller, calls } = harness(t, { collect: () => new Promise(resolve => releases.push(resolve)) });
  await readyOwner(controller);
  await controller.submit("apple"); await controller.submit("pear"); await tick();
  assert.equal(calls.collections.length, 1); assert.equal(controller.getState().pendingCount, 2);
  controller.change("unsubmitted text"); controller.cancel();
  assert.equal(calls.collections[0].options.signal.aborted, false); assert.equal(controller.hasUnsettled(), true);
  releases[0](confirmed("apple")); await tick();
  assert.equal(calls.collections.length, 2); assert.equal(calls.collections[1].body.term, "pear");
  releases[1](confirmed("pear")); await tick();
  assert.deepEqual(controller.getState().receipts.map(value => value.entry.term).sort(), ["apple", "pear"]);
  assert.equal(controller.getState().pendingCount, 0); assert.equal(controller.hasUnsettled(), false);
  assert.equal(controller.getState().lookup.phase, "cancelled");
});

test("an abort-ignoring stale lookup cannot enqueue after editing, cancellation, or a newer query", async t => {
  for (const action of ["change", "cancel", "submit"]) {
    const pending = deferred();
    const { controller, calls } = harness(t, { search: input => input === "apple" ? pending.promise : Promise.resolve(response(row(input))) });
    await readyOwner(controller);
    const first = controller.submit("apple");
    if (action === "change") controller.change("pear");
    if (action === "cancel") controller.cancel();
    if (action === "submit") await controller.submit("pear");
    assert.equal(calls.searches[0].options.signal.aborted, true);
    pending.resolve(response(row("apple"))); await first; await tick();
    assert.deepEqual(calls.collections.map(value => value.body.term), action === "submit" ? ["pear"] : []);
    assert.equal(controller.getState().lookup.results.some(value => value.term === "apple"), false);
  }
});

test("a duplicate submit during loading neither dispatches twice nor suppresses collection of the original current lookup", async t => {
  const pending = deferred();
  const { controller, calls } = harness(t, { search: () => pending.promise });
  await readyOwner(controller);
  const first = controller.submit("apple");
  await controller.submit("apple");
  assert.equal(calls.searches.length, 1); assert.equal(calls.searches[0].options.signal.aborted, false);
  pending.resolve(response(row())); await first; await tick();
  assert.equal(controller.getState().lookup.phase, "ready");
  assert.equal(calls.collections.length, 1); assert.equal(calls.collections[0].body.term, "apple");
});

test("owner verification never delays a query, but can collect the still-current exact hit when verification finishes", async t => {
  const session = deferred();
  const { controller, calls } = harness(t, { readSession: () => session.promise });
  const verification = controller.verifyOwner();
  assert.equal(controller.getState().authPhase, "checking");
  const submitted = controller.submit("apple");
  await tick();
  assert.equal(controller.getState().lookup.phase, "ready"); assert.equal(calls.collections.length, 0);
  session.resolve(ownerSession()); await verification; await submitted; await tick();
  assert.equal(controller.getState().owner, true);
  assert.equal(calls.collections.length, 1); assert.equal(calls.collections[0].body.term, "apple");
});

test("late owner verification does not collect a query that was edited or cancelled while authority was pending", async t => {
  for (const action of ["change", "cancel"]) {
    const session = deferred();
    const { controller, calls } = harness(t, { readSession: () => session.promise });
    const verification = controller.verifyOwner();
    await controller.submit("apple");
    if (action === "change") controller.change("pear"); else controller.cancel();
    session.resolve(ownerSession()); await verification; await tick();
    assert.equal(calls.collections.length, 0);
  }
});

test("focus verification does not interrupt a valid in-flight collection or start a second session read", async t => {
  const write = deferred();
  const { controller, calls } = harness(t, { collect: () => write.promise });
  await readyOwner(controller);
  await controller.submit("apple"); await tick();
  await controller.verifyOwner();
  assert.equal(controller.getState().owner, true); assert.equal(controller.getState().authPhase, "ready");
  assert.equal(calls.sessions.length, 1); assert.equal(calls.collections[0].options.signal.aborted, false);
  write.resolve(confirmed()); await tick();
  assert.equal(controller.getState().receipts.length, 1); assert.equal(calls.collected.length, 1);
});

test("actual revalidation without pending writes synchronously revokes authority before accepting another session", async t => {
  const revalidation = deferred(); let reads = 0;
  const { controller, calls } = harness(t, { readSession: () => ++reads === 1 ? Promise.resolve(ownerSession()) : revalidation.promise });
  await readyOwner(controller);
  const verification = controller.verifyOwner();
  assert.equal(controller.getState().owner, false); assert.equal(controller.getState().authPhase, "checking");
  await tick();
  assert.equal(calls.sessions.length, 2);
  await controller.submit("apple"); await tick();
  assert.equal(calls.collections.length, 0); assert.equal(controller.getState().lookup.phase, "ready");
  revalidation.resolve({ authenticated: false }); await verification;
  assert.equal(controller.getState().authPhase, "anonymous"); assert.equal(controller.getState().owner, false);
  controller.select(0); await tick(); assert.equal(calls.collections.length, 0);
});

test("expiry locks even without navigation and an old timer cannot lock a newly verified owner", async t => {
  let clock = 1_000;
  const expiryTimer = fakeExpiryTimer();
  const { controller, calls } = harness(t, { now: () => clock, expiryTimer });
  await readyOwner(controller);
  const first = expiryTimer.active;
  assert.equal(first.expiresAt, 10_000); assert.equal(first.isCurrent(), true);
  await controller.verifyOwner();
  assert.equal(first.isCurrent(), false);
  expiryTimer.fire(first);
  assert.equal(controller.getState().owner, true);
  const current = expiryTimer.active;
  clock = 10_000; expiryTimer.fire(current);
  assert.equal(controller.getState().authPhase, "locked"); assert.equal(controller.getState().owner, false);
  await controller.submit("apple"); controller.select(0); await tick();
  assert.equal(controller.getState().lookup.phase, "ready"); assert.equal(calls.collections.length, 0);
});

test("same-owner revalidation plus explicit retry keeps the uncertain mutation key and uses refreshed CSRF", async t => {
  let offline = true, reads = 0;
  const { controller, calls } = harness(t, { readSession: async () => ownerSession({ csrfToken: ++reads === 1 ? OWNER_CSRF : FRESH_CSRF }),
    collect: async body => { if (offline) throw new Error("transport-secret"); return confirmed(body.term); } });
  await readyOwner(controller);
  await controller.submit("apple"); await tick();
  assert.equal(controller.getState().failedCount, 1); assert.equal(controller.hasUnsettled(), true);
  await controller.verifyOwner(); await tick();
  assert.equal(calls.collections.length, 1);
  offline = false; await controller.retry(); await tick();
  assert.equal(calls.collections.length, 2);
  assert.equal(calls.collections[0].body.mutationId, calls.collections[1].body.mutationId);
  assert.equal(calls.collections[1].options.csrfToken, FRESH_CSRF);
  assert.equal(controller.getState().failedCount, 0); assert.equal(controller.hasUnsettled(), false);
  assertPublicOnly(controller, calls);
});

test("401 locks and pauses the queue; no next word dispatches or retries without renewed owner authority", async t => {
  const failure = deferred();
  const { controller, calls } = harness(t, { collect: () => failure.promise });
  await readyOwner(controller);
  await controller.submit("apple"); await controller.submit("pear");
  const error = new Error("transport-secret"); error.status = 401; failure.reject(error); await tick();
  assert.equal(controller.getState().owner, false); assert.equal(controller.getState().authPhase, "locked");
  assert.equal(calls.collections.length, 1);
  await controller.retry(); await tick(); assert.equal(calls.collections.length, 1);
  assertPublicOnly(controller, calls);
});

test("429 pauses collections without falsely revoking valid owner authentication or auto-retrying", async t => {
  const failure = deferred();
  const { controller, calls } = harness(t, { collect: () => failure.promise });
  await readyOwner(controller);
  await controller.submit("apple"); await controller.submit("pear");
  const error = new Error("transport-secret"); error.status = 429; failure.reject(error); await tick();
  assert.equal(controller.getState().owner, true); assert.equal(controller.getState().authPhase, "ready");
  assert.equal(calls.collections.length, 1); assert.equal(controller.getState().failedCount, 2);
  assert.equal(controller.hasUnsettled(), true); assertPublicOnly(controller, calls);
});

test("invalid collection confirmations cannot create receipts or call onCollected", async t => {
  for (const value of [confirmed("pear"), { ...confirmed(), sha: "bad" }, { ...confirmed(), added: "yes" }, { ...confirmed(), entry: {} }]) {
    const { controller, calls } = harness(t, { collect: async () => value });
    await readyOwner(controller);
    await controller.submit("apple"); await tick();
    assert.equal(controller.getState().receipts.length, 0); assert.equal(calls.collected.length, 0);
    assert.equal(controller.getState().failedCount, 1); assert.equal(controller.hasUnsettled(), true);
  }
});

test("lock aborts pending owner verification and its abort-ignoring result cannot unlock the controller", async t => {
  const session = deferred();
  const { controller, calls } = harness(t, { readSession: () => session.promise });
  const verification = controller.verifyOwner();
  await tick();
  controller.lock("Locked for explicit owner confirmation.");
  assert.equal(calls.sessions.at(-1).signal.aborted, true);
  session.resolve(ownerSession()); await verification; await tick();
  assert.equal(controller.getState().authPhase, "locked"); assert.equal(controller.getState().owner, false);
  assert.equal(controller.getState().receipts.length, 0); assert.equal(calls.collections.length, 0);
});

test("lock aborts an active write and its abort-ignoring confirmation cannot publish a receipt", async t => {
  const write = deferred();
  const { controller, calls } = harness(t, { collect: () => write.promise });
  await readyOwner(controller);
  await controller.submit("apple");
  controller.lock("Locked for explicit owner confirmation.");
  assert.equal(calls.collections[0].options.signal.aborted, true);
  write.resolve(confirmed()); await tick();
  assert.equal(controller.getState().authPhase, "locked"); assert.equal(controller.getState().owner, false);
  assert.equal(controller.getState().receipts.length, 0); assert.equal(calls.collected.length, 0);
});

test("dispose clears expiry and aborts all work without permitting any later state publication or collection", async t => {
  const session = deferred(), lookup = deferred();
  const { controller, calls, expiryTimer } = harness(t, { readSession: () => session.promise, search: () => lookup.promise });
  const verification = controller.verifyOwner(), submitted = controller.submit("apple");
  await tick();
  controller.dispose();
  assert.equal(calls.sessions[0].signal.aborted, true); assert.equal(calls.searches[0].options.signal.aborted, true);
  assert.equal(expiryTimer.active, null);
  const eventCount = calls.changes.length;
  session.resolve(ownerSession()); lookup.resolve(response(row())); await verification; await submitted; await tick();
  assert.equal(calls.changes.length, eventCount); assert.equal(calls.collections.length, 0);
});

test("logout revokes local write authority before its request settles and public lookup never silently logs back in", async t => {
  const signedOut = deferred();
  const { controller, calls, expiryTimer } = harness(t, { signOut: () => signedOut.promise });
  await readyOwner(controller);
  const loggingOut = controller.logout();
  assert.equal(controller.getState().owner, false); assert.equal(controller.getState().authPhase, "locked");
  assert.equal(expiryTimer.active, null);
  assert.deepEqual(calls.logouts, [{ csrfToken: OWNER_CSRF }]);
  await controller.submit("apple"); controller.select(0); await tick();
  assert.equal(controller.getState().lookup.phase, "ready");
  assert.equal(calls.collections.length, 0); assert.equal(calls.sessions.length, 1);
  signedOut.resolve(); assert.equal(await loggingOut, true);
  assert.equal(controller.getState().owner, false); assert.equal(controller.getState().authPhase, "locked");
  assertPublicOnly(controller, calls);
});

test("logout refuses pending FIFO work without interrupting its authorized writes or contacting sign-out", async t => {
  const releases = [];
  const { controller, calls } = harness(t, { collect: () => new Promise(resolve => releases.push(resolve)) });
  await readyOwner(controller);
  await controller.submit("apple"); await controller.submit("pear");
  assert.equal(controller.getState().pendingCount, 2);
  assert.equal(await controller.logout(), false);
  assert.equal(calls.logouts.length, 0); assert.equal(calls.collections[0].options.signal.aborted, false);
  assert.equal(controller.getState().owner, true); assert.equal(controller.getState().authPhase, "ready");
  releases[0](confirmed("apple")); await tick();
  assert.equal(calls.collections.length, 2); releases[1](confirmed("pear")); await tick();
  assert.equal(controller.getState().pendingCount, 0); assert.equal(controller.getState().receipts.length, 2);
  assert.equal(await controller.logout(), true); assert.equal(calls.logouts.length, 1);
  assert.equal(controller.getState().owner, false); assertPublicOnly(controller, calls);
});

test("failed sign-out keeps this page locked, reports unconfirmed logout, and never reveals the adapter error or CSRF", async t => {
  const { controller, calls } = harness(t, { signOut: async () => { throw new Error("transport-secret " + OWNER_CSRF); } });
  assert.equal(await controller.logout(), false); assert.equal(calls.logouts.length, 0);
  await readyOwner(controller);
  assert.equal(await controller.logout(), false);
  assert.equal(controller.getState().owner, false); assert.equal(controller.getState().authPhase, "locked");
  assert.match(controller.getState().authMessage, /退出尚未确认/u);
  await controller.submit("apple"); controller.select(0); await tick();
  assert.equal(controller.getState().lookup.phase, "ready"); assert.equal(calls.collections.length, 0);
  assert.equal(calls.sessions.length, 1); assertPublicOnly(controller, calls);
});
