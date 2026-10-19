import test from "node:test";
import assert from "node:assert/strict";
import { createDictionaryCollectionQueue } from "../js/dictionary-collection.js";
import { createBlankEntry } from "../js/wordbook-schema.js?v=77";

const options = { userId: "owner", csrfToken: "secret-csrf-original", isCurrent: () => true };
const fresh = { ...options, csrfToken: "secret-csrf-refreshed" };
const tick = () => new Promise(resolve => setImmediate(resolve));
const idFactory = () => { let sequence = 0; return () => `collection-operation-${++sequence}`; };
function confirmed(term = "apple", added = true) {
  const entry = createBlankEntry(term); entry.meaning = "苹果"; entry.organizationMethod = "local-dictionary";
  return { entry, added, sha: "a".repeat(40) };
}

test("FIFO serializes distinct lookups without cancelling the active public write", async () => {
  const calls = [], releases = [], states = [];
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), onChange: value => states.push(value), collect: (body, request) => {
    calls.push({ body, request }); return new Promise(resolve => releases.push(resolve));
  } });
  const first = queue.enqueue("apple", options), second = queue.enqueue("pear", options), third = queue.enqueue("plum", options);
  assert.equal(calls.length, 1); assert.equal(calls[0].request.signal.aborted, false);
  assert.deepEqual(queue.snapshot().items.map(item => [item.term, item.phase]), [["apple", "saving"], ["pear", "queued"], ["plum", "queued"]]);
  assert.equal(queue.snapshot().pendingCount, 3); assert.equal(queue.hasUnsettled(), true);
  releases[0](confirmed("apple")); assert.equal(await first, true); await tick();
  assert.equal(calls.length, 2); assert.equal(calls[1].body.term, "pear");
  releases[1](confirmed("pear")); assert.equal(await second, true); await tick();
  assert.equal(calls.length, 3); releases[2](confirmed("plum")); assert.equal(await third, true);
  assert.equal(queue.snapshot().pendingCount, 0); assert.equal(queue.hasUnsettled(), false);
  assert.deepEqual(calls.map(call => Object.keys(call.body).sort()), Array(3).fill(["mutationId", "term"]));
  assert.deepEqual(states.filter(state => state.phase === "saved").map(state => state.entry.term), ["apple", "pear", "plum"]);
});

test("same UID and normalized unfinished head coalesce, but a saved head gets a fresh server check", async () => {
  let release; const calls = [];
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), collect: body => {
    calls.push(body); return new Promise(resolve => { release = resolve; });
  } });
  const first = queue.enqueue("apple", options), duplicate = queue.enqueue("APPLE!", options);
  assert.equal(first, duplicate); assert.equal(calls.length, 1);
  release(confirmed()); assert.equal(await first, true);
  const again = queue.enqueue("apple", options); assert.equal(calls.length, 2);
  assert.notEqual(calls[0].mutationId, calls[1].mutationId);
  release(confirmed("apple", false)); assert.equal(await again, true);
  assert.equal(queue.snapshot().items.length, 1);
});

test("generic failures continue the FIFO; explicit retry retains the same mutation key and refreshes CSRF", async () => {
  const calls = []; let offline = true;
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), collect: async (body, request) => {
    calls.push({ body, request }); if (offline && body.term === "apple") throw new Error(`offline ${request.csrfToken}`);
    return confirmed(body.term);
  } });
  const first = queue.enqueue("apple", options), second = queue.enqueue("pear", options);
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(queue.snapshot().failedCount, 1); assert.equal(queue.hasUnsettled(), true);
  assert.equal(await queue.enqueue("apple", fresh), false); assert.equal(calls.length, 2);
  offline = false; assert.equal(await queue.retry(fresh), true);
  assert.equal(calls.length, 3); assert.equal(calls[0].body.mutationId, calls[2].body.mutationId);
  assert.equal(calls[2].request.csrfToken, fresh.csrfToken); assert.equal(queue.hasUnsettled(), false);
  assert.doesNotMatch(JSON.stringify(queue.snapshot()), /secret-csrf|mutationId|isCurrent|AbortController/u);
});

for (const status of [401, 429]) {
  test(`${status} pauses all unfinished words without auto retry or dispatching the next word`, async () => {
    const calls = [], states = []; let failed = true;
    const queue = createDictionaryCollectionQueue({ newId: idFactory(), onChange: value => states.push(value), collect: async body => {
      calls.push(body); if (failed) { const error = new Error("secret-csrf-original"); error.status = status; throw error; }
      return confirmed(body.term);
    } });
    const first = queue.enqueue("apple", options), second = queue.enqueue("pear", options);
    assert.deepEqual(await Promise.all([first, second]), [false, false]); await tick();
    assert.equal(calls.length, 1); assert.equal(queue.snapshot().pendingCount, 0); assert.equal(queue.snapshot().failedCount, 2);
    assert.equal(await queue.enqueue("plum", options), false); assert.equal(calls.length, 1);
    assert.equal(states.filter(value => value.authenticationRequired === true).length, status === 401 ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(states), /secret-csrf|mutationId|"error":/u);
    failed = false; assert.equal(await queue.retry(fresh), true);
    assert.deepEqual(calls.map(body => body.term), ["apple", "apple", "pear", "plum"]);
    assert.equal(calls[0].mutationId, calls[1].mutationId); assert.equal(queue.hasUnsettled(), false);
  });
}

test("clear aborts active work, resolves queued callers and suppresses an abort-ignoring late confirmation", async () => {
  const calls = [], states = []; let release;
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), onChange: value => states.push(value), collect: (body, request) => {
    calls.push({ body, request }); return new Promise(resolve => { release = resolve; });
  } });
  const first = queue.enqueue("apple", options), second = queue.enqueue("pear", options);
  queue.clear(); assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(calls[0].request.signal.aborted, true); assert.equal(queue.hasUnsettled(), false);
  assert.deepEqual(queue.snapshot(), { userId: null, items: [], pendingCount: 0, failedCount: 0 });
  const count = states.length; release(confirmed()); await tick();
  assert.equal(states.length, count); assert.equal(calls.length, 1);
});

test("pause preserves unfinished keys for explicit same-account retry; stale late success cannot complete the new attempt", async () => {
  const calls = [], releases = [], states = [];
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), onChange: value => states.push(value), collect: (body, request) => {
    calls.push({ body, request }); return new Promise(resolve => releases.push(resolve));
  } });
  const first = queue.enqueue("apple", options), second = queue.enqueue("pear", options);
  queue.pause(); assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(calls[0].request.signal.aborted, true); assert.equal(queue.snapshot().failedCount, 2);
  assert.equal(queue.snapshot().userId, "owner");
  assert.equal(await queue.retry({ ...fresh, userId: "someone-else" }), false); assert.equal(calls.length, 1);
  const retried = queue.retry(fresh); assert.equal(calls.length, 2);
  assert.equal(calls[0].body.mutationId, calls[1].body.mutationId);
  releases[0](confirmed()); await tick(); assert.equal(queue.snapshot().items[0].phase, "saving");
  releases[1](confirmed()); await tick(); assert.equal(calls.length, 3);
  releases[2](confirmed("pear")); assert.equal(await retried, true);
  assert.equal(states.filter(value => value.authenticationRequired).length, 0); assert.equal(queue.hasUnsettled(), false);
});

test("changed account authority stops the current and queued writes, emits errors, and needs clear before another UID", async () => {
  let active = true, release; const states = [], calls = [];
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), onChange: state => states.push(state), collect: body => {
    calls.push(body); return new Promise(resolve => { release = resolve; });
  } });
  const guarded = { ...options, isCurrent: () => active };
  const first = queue.enqueue("apple", guarded), second = queue.enqueue("pear", guarded);
  active = false; release(confirmed()); assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(calls.length, 1); assert.equal(queue.snapshot().failedCount, 2); assert.equal(states.at(-1).phase, "error");
  assert.equal(await queue.enqueue("plum", { ...options, userId: "someone-else" }), false);
  queue.clear(); const other = queue.enqueue("plum", { ...options, userId: "someone-else" });
  release(confirmed("plum")); assert.equal(await other, true); assert.equal(queue.snapshot().userId, "someone-else");
});

test("invalid or expired options cannot enqueue or retry, even if the guard throws", async () => {
  let calls = 0; const queue = createDictionaryCollectionQueue({ newId: idFactory(), collect: async () => { calls++; return confirmed(); } });
  for (const invalid of [{}, { ...options, csrfToken: "" }, { ...options, userId: "" }, { ...options, isCurrent: () => false }, { ...options, isCurrent: () => { throw new Error("guard"); } }]) {
    assert.equal(await queue.enqueue("apple", invalid), false); assert.equal(await queue.retry(invalid), false);
  }
  assert.equal(await queue.enqueue("苹果", options), false); assert.equal(calls, 0); assert.equal(queue.snapshot().userId, null);
});

test("malformed confirmations, wrong head and bad SHA cannot mark a queued word saved", async () => {
  for (const value of [confirmed("pear"), { ...confirmed(), sha: "bad" }, { ...confirmed(), added: "yes" }, { ...confirmed(), entry: {} }]) {
    const queue = createDictionaryCollectionQueue({ newId: idFactory(), collect: async () => value });
    assert.equal(await queue.enqueue("apple", options), false); assert.equal(queue.snapshot().failedCount, 1); assert.equal(queue.hasUnsettled(), true);
  }
});

test("established correction aliases confirm an existing public word without an overwrite", async () => {
  const value = confirmed("apple", false);
  value.entry.correction = { status: "accepted", original: "aple", suggestion: "apple", chosen: "apple", confidence: 1, source: "manual" };
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), collect: async () => value });
  assert.equal(await queue.enqueue("aple", options), true); assert.match(queue.snapshot().items[0].message, /原有内容已保留/u);
});

test("100 unfinished words are bounded without silently dropping failed or queued work", async () => {
  const requests = [];
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), collect: (body, request) => {
    requests.push(request); return new Promise(() => {});
  } });
  const attempts = Array.from({ length: 100 }, (_, index) => queue.enqueue(`word-${index}`, options));
  assert.equal(queue.snapshot().pendingCount, 100); assert.equal(await queue.enqueue("overflow", options), false);
  assert.equal(queue.snapshot().items.length, 100); assert.equal(requests.length, 1);
  queue.clear(); assert.ok((await Promise.all(attempts)).every(value => value === false)); assert.equal(requests[0].signal.aborted, true);
});

test("settled confirmations can be evicted after 100 entries without blocking new accepted work", async () => {
  let calls = 0;
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), collect: async body => { calls++; return confirmed(body.term); } });
  for (let index = 0; index < 105; index++) assert.equal(await queue.enqueue(`word-${index}`, options), true);
  assert.equal(calls, 105); assert.equal(queue.snapshot().items.length, 100); assert.equal(queue.hasUnsettled(), false);
});

test("an observer cannot dispatch after it synchronously clears the active saving event", async () => {
  let queue, calls = 0;
  queue = createDictionaryCollectionQueue({ newId: idFactory(), onChange: value => { if (value.phase === "saving") queue.clear(); },
    collect: async () => { calls++; return confirmed(); } });
  assert.equal(await queue.enqueue("apple", options), false); assert.equal(calls, 0); assert.equal(queue.hasUnsettled(), false);
});

test("an authentication-required observer may pause recursively without repeating the auth notification", async () => {
  let queue, authEvents = 0;
  queue = createDictionaryCollectionQueue({ newId: idFactory(), onChange: value => { if (value.authenticationRequired) { authEvents++; queue.pause(); } },
    collect: async () => { const error = new Error("unauthorized"); error.status = 401; throw error; } });
  assert.equal(await queue.enqueue("apple", options), false); assert.equal(authEvents, 1); assert.equal(queue.snapshot().failedCount, 1);
});

test("pause of a clean queue does not block fresh verified work or manufacture an unconfirmed item", async () => {
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), collect: async body => confirmed(body.term) });
  queue.pause(); assert.equal(await queue.enqueue("apple", options), true);
  queue.pause(); assert.equal(await queue.enqueue("pear", fresh), true); assert.equal(queue.hasUnsettled(), false);
});

test("public snapshots and events cannot expose transport credentials or injected error messages", async () => {
  const events = [];
  const queue = createDictionaryCollectionQueue({ newId: idFactory(), onChange: value => events.push(value), collect: async (body, request) => {
    throw new Error(`${request.csrfToken} ${body.mutationId}`);
  } });
  assert.equal(await queue.enqueue("apple", options), false);
  const snapshot = queue.snapshot(); snapshot.items[0].term = "changed";
  assert.equal(queue.snapshot().items[0].term, "apple");
  assert.doesNotMatch(JSON.stringify({ events, snapshot: queue.snapshot() }), /secret-csrf|collection-operation-|mutationId|csrfToken|isCurrent|controller/u);
});

test("invalid mutation keys never dispatch or bind the queue to an account", async () => {
  for (const key of ["short", "has unsafe spaces", "x".repeat(181), "<script>bad</script>"]) {
    let calls = 0; const queue = createDictionaryCollectionQueue({ newId: () => key, collect: async () => { calls++; return confirmed(); } });
    assert.equal(await queue.enqueue("apple", options), false); assert.equal(calls, 0); assert.equal(queue.snapshot().userId, null);
  }
});
