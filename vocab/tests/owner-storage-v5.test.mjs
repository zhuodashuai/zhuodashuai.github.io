import assert from "node:assert/strict";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { createBlankEntry } from "../js/wordbook-schema.js";

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.BroadcastChannel = undefined;

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function deleteDatabase(name) {
  await requestValue(indexedDB.deleteDatabase(name));
}

async function createLegacyV4() {
  const request = indexedDB.open("wordbook-db", 4);
  request.onupgradeneeded = () => {
    const db = request.result;
    const entries = db.createObjectStore("entries", { keyPath: "id" });
    entries.createIndex("normalized", "normalized", { unique: true });
    entries.createIndex("dueAt", "review.dueAt", { unique: false });
    entries.createIndex("createdAt", "createdAt", { unique: false });
    db.createObjectStore("meta", { keyPath: "key" });
  };
  const db = await requestValue(request);
  const transaction = db.transaction("entries", "readwrite");
  transaction.objectStore("entries").put({
    id: "legacy-receive", term: "receive", normalized: "receive", headword: "receive",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z",
    review: { level: 3, dueAt: "2026-08-30T00:00:00.000Z", reviewCount: 4, lapseCount: 1, lastRating: "good" },
    history: [{ at: "2026-08-02T00:00:00.000Z", rating: "good", fromLevel: 2, toLevel: 3 }]
  });
  await transactionDone(transaction);
  db.close();
}

await deleteDatabase("wordbook-db");
await createLegacyV4();
const storage = await import(`../js/owner-storage.js?test=${Date.now()}`);

function publicSnapshot(entries, lastMutationId) {
  return {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    revisionId: `revision-${lastMutationId}`,
    lastMutationId,
    entries
  };
}

async function enqueueTestOperation({ draftId, mutationId, term = mutationId, meaning = "测试释义" }) {
  const entry = { ...createBlankEntry(term), meaning };
  const draft = await storage.saveDraft({
    id: draftId,
    scope: "owner-public",
    mode: "create",
    entryId: entry.id,
    value: entry,
    base: { entry: null, entryUpdatedAt: null, remoteSha: "a".repeat(40) },
    localState: "local_saved"
  });
  return storage.enqueuePublish(draft, {
    baseSha: "a".repeat(40),
    mutationId,
    mutation: { type: "add", entry }
  });
}

test("IndexedDB v5 migration creates separated stores and preserves legacy review state", async () => {
  const db = await storage.openDatabase();
  for (const name of ["entries", "meta", "drafts", "outbox", "publicCache", "reviewStates", "quarantine"]) {
    assert.equal(db.objectStoreNames.contains(name), true, `${name} should exist`);
  }
  const read = db.transaction(["entries", "reviewStates"], "readonly");
  const migrated = await requestValue(read.objectStore("entries").get("legacy-receive"));
  const review = await requestValue(read.objectStore("reviewStates").get("legacy-receive"));
  assert.equal("review" in migrated, false);
  assert.equal("history" in migrated, false);
  assert.deepEqual(migrated.lookupKeys, ["receive"]);
  assert.equal(review.level, 3);
  assert.equal(review.reviewCount, 4);
  assert.equal(review.history.length, 1);
  const entryStore = read.objectStore("entries");
  assert.equal(entryStore.indexNames.contains("lookupKeys"), true);
  assert.equal(entryStore.index("lookupKeys").unique, true);
  assert.equal(entryStore.index("lookupKeys").multiEntry, true);
  assert.equal(entryStore.indexNames.contains("updatedAt"), true);
  assert.equal(entryStore.indexNames.contains("dueAt"), false);
});

test("a partial owner draft survives close and reopen without credentials", async () => {
  const entry = createBlankEntry("recieve");
  entry.meaning = "";
  const draft = await storage.saveDraft({
    id: "draft-receive", scope: "owner-public", mode: "create", entryId: entry.id, value: entry,
    base: { entry: null, entryUpdatedAt: null, remoteSha: "a".repeat(40) }, localState: "local_saved"
  });
  await storage.closeDatabaseForTests();
  const restored = await storage.getDraft(draft.id);
  assert.equal(restored.value.term, "recieve");
  assert.equal(restored.value.meaning, "");
  assert.equal(JSON.stringify(restored).match(/token|authorization|api.?key/i), null);
});

test("stale cross-tab draft writes fail instead of silently overwriting", async () => {
  const created = await storage.saveDraft({
    id: "draft-cas", scope: "owner-public", mode: "create", value: createBlankEntry("concurrency")
  });
  const tabA = structuredClone(created);
  const tabB = structuredClone(created);
  tabA.value.meaning = "tab A";
  const savedA = await storage.saveDraft(tabA);
  assert.equal(savedA.contentRevision, created.contentRevision + 1);
  tabB.value.meaning = "tab B";
  await assert.rejects(storage.saveDraft(tabB), /另一个页面更新/);
  assert.equal((await storage.getDraft("draft-cas")).value.meaning, "tab A");
});

test("draft storage rejects secret-like fields at every nesting level", async () => {
  await assert.rejects(storage.saveDraft({
    id: "bad-draft", scope: "owner-public", value: { term: "receive", nested: { githubToken: "secret" } }
  }), /不允许写入/);
});

test("backup drafts import in one transaction and reject duplicate IDs before writing", async () => {
  const first = { id: "import-one", scope: "owner-public", mode: "create", value: createBlankEntry("alpha") };
  const second = { id: "import-two", scope: "owner-public", mode: "create", value: createBlankEntry("beta") };
  const imported = await storage.importDrafts([first, second]);
  assert.deepEqual(imported.map((draft) => draft.id), ["import-one", "import-two"]);
  assert.equal((await storage.getDraft("import-one")).value.term, "alpha");
  await assert.rejects(storage.importDrafts([{ ...first, id: "duplicate-import" }, { ...second, id: "duplicate-import" }]), /ID 重复/);
  assert.equal(await storage.getDraft("duplicate-import"), undefined);
});

test("enqueue saves the draft and durable operation in one flow with a stable idempotency key", async () => {
  const entry = { ...createBlankEntry("receive"), meaning: "收到" };
  const draft = await storage.saveDraft({
    id: "draft-queue", scope: "owner-public", mode: "create", entryId: entry.id, value: entry,
    base: { entry: null, entryUpdatedAt: null, remoteSha: "a".repeat(40) }, localState: "local_saved"
  });
  const request = { baseSha: "a".repeat(40), mutationId: "mutation-storage-001", mutation: { type: "add", entry } };
  const queued = await storage.enqueuePublish(draft, request);
  assert.equal(queued.operation.operationId, request.mutationId);
  assert.equal(queued.operation.idempotencyKey, request.mutationId);
  assert.equal((await storage.getDraft(draft.id)).localState, "queued");
});

test("two tabs cannot claim the same queued operation", async () => {
  const [left, right] = await Promise.all([
    storage.claimNextOperation({ tabId: "tab-left", now: new Date() }),
    storage.claimNextOperation({ tabId: "tab-right", now: new Date() })
  ]);
  assert.equal([left, right].filter(Boolean).length, 1);
  const claimed = left || right;
  assert.equal(claimed.status, "syncing");
  assert.ok(["tab-left", "tab-right"].includes(claimed.leaseOwner));
});

test("deleting a draft atomically cancels every unfinished operation that belongs to it", async () => {
  const original = await storage.getDraft("draft-queue");
  assert.ok(original);
  const secondEntry = { ...original.value, meaning: "第二个本地意图", updatedAt: new Date().toISOString() };
  await storage.enqueuePublish({ ...original, value: secondEntry }, {
    baseSha: "a".repeat(40),
    mutationId: "mutation-storage-002",
    mutation: { type: "add", entry: secondEntry }
  });

  const result = await storage.deleteDraftAndCancelOutbox("draft-queue");
  assert.equal(result.draftDeleted, true);
  assert.deepEqual(new Set(result.cancelledOperationIds), new Set(["mutation-storage-001", "mutation-storage-002"]));
  assert.equal(await storage.getDraft("draft-queue"), undefined);
  const operations = await storage.listOutbox({ includeCompleted: true });
  for (const operationId of result.cancelledOperationIds) {
    const operation = operations.find((candidate) => candidate.operationId === operationId);
    assert.equal(operation.status, "cancelled");
    assert.equal(operation.leaseOwner, null);
    assert.equal(operation.cancellationReason, "draft_deleted");
  }
});

test("completion marks an unchanged draft published while ignoring bookkeeping timestamps", async () => {
  const queued = await enqueueTestOperation({ draftId: "draft-complete", mutationId: "mutation-complete", term: "completeword" });
  const draft = await storage.getDraft(queued.draft.id);
  await storage.saveDraft({ ...draft, value: { ...draft.value, updatedAt: new Date(Date.now() + 1000).toISOString() } });
  const claimed = await storage.claimNextOperation({ tabId: "tab-complete", now: new Date() });
  assert.equal(claimed.operationId, "mutation-complete");
  const remoteEntry = { ...queued.operation.desiredEntry, revision: 1, updatedAt: new Date(Date.now() + 2000).toISOString() };
  const result = await storage.completeOperation(claimed.operationId, {
    tabId: "tab-complete",
    sha: "b".repeat(40),
    snapshot: publicSnapshot([remoteEntry], claimed.operationId)
  });
  assert.deepEqual(result, { superseded: false });
  assert.equal((await storage.getDraft(queued.draft.id)).localState, "published");
});

test("completion preserves newer local content instead of falsely marking it published", async () => {
  const queued = await enqueueTestOperation({ draftId: "draft-superseded", mutationId: "mutation-superseded", term: "supersededword" });
  const claimed = await storage.claimNextOperation({ tabId: "tab-superseded", now: new Date() });
  assert.equal(claimed.operationId, "mutation-superseded");
  const current = await storage.getDraft(queued.draft.id);
  await storage.saveDraft({ ...current, value: { ...current.value, meaning: "排队后新增的本地释义" } });
  const remoteEntry = { ...queued.operation.desiredEntry, revision: 1, updatedAt: new Date(Date.now() + 2000).toISOString() };
  const result = await storage.completeOperation(claimed.operationId, {
    tabId: "tab-superseded",
    sha: "c".repeat(40),
    snapshot: publicSnapshot([remoteEntry], claimed.operationId)
  });
  const preserved = await storage.getDraft(queued.draft.id);
  assert.deepEqual(result, { superseded: true });
  assert.equal(preserved.value.meaning, "排队后新增的本地释义");
  assert.equal(preserved.localState, "local_saved");
  assert.equal(preserved.lastOperationId, null);
});

test("idempotent completion does not mark a draft published when the current remote entry has moved on", async () => {
  const queued = await enqueueTestOperation({ draftId: "draft-remote-superseded", mutationId: "mutation-remote-superseded", term: "remotelychanged" });
  const claimed = await storage.claimNextOperation({ tabId: "tab-remote-superseded", now: new Date() });
  assert.equal(claimed.operationId, "mutation-remote-superseded");
  const newerRemoteEntry = {
    ...queued.operation.desiredEntry,
    meaning: "远端后续修改",
    revision: 2,
    updatedAt: new Date(Date.now() + 2000).toISOString()
  };

  const result = await storage.completeOperation(claimed.operationId, {
    tabId: "tab-remote-superseded",
    sha: "e".repeat(40),
    snapshot: publicSnapshot([newerRemoteEntry], "a-later-mutation")
  });

  const preserved = await storage.getDraft(queued.draft.id);
  assert.deepEqual(result, { superseded: true });
  assert.equal(preserved.value.meaning, queued.operation.desiredEntry.meaning);
  assert.equal(preserved.localState, "local_saved");
  assert.equal(preserved.lastOperationId, null);
});

test("completion recognizes an unchanged queued deletion intent", async () => {
  const entry = { ...createBlankEntry("deleteword"), meaning: "将被删除" };
  const draft = await storage.saveDraft({
    id: "draft-delete-complete",
    scope: "owner-public",
    mode: "edit",
    entryId: entry.id,
    value: entry,
    base: { entry, entryUpdatedAt: entry.updatedAt, remoteSha: "c".repeat(40) },
    localState: "local_saved"
  });
  await storage.enqueuePublish(draft, {
    baseSha: "c".repeat(40),
    mutationId: "mutation-delete-complete",
    mutation: { type: "delete", id: entry.id, expectedUpdatedAt: entry.updatedAt }
  });
  const claimed = await storage.claimNextOperation({ tabId: "tab-delete-complete", now: new Date() });
  assert.equal(claimed.operationId, "mutation-delete-complete");
  const result = await storage.completeOperation(claimed.operationId, {
    tabId: "tab-delete-complete",
    sha: "d".repeat(40),
    snapshot: publicSnapshot([], claimed.operationId)
  });
  assert.deepEqual(result, { superseded: false });
  assert.equal((await storage.getDraft(draft.id)).localState, "published");
});

test("startup reconciles a response-lost commit without sending a second publish", async () => {
  const queued = await enqueueTestOperation({ draftId: "draft-response-lost", mutationId: "mutation-response-lost", term: "responsegone" });
  const claimed = await storage.claimNextOperation({ tabId: "tab-that-refreshed", now: new Date() });
  assert.equal(claimed.operationId, queued.operation.operationId);
  await storage.requireReviewForStoredOperations();
  const committedEntry = {
    ...queued.operation.desiredEntry,
    revision: 1,
    updatedAt: new Date(Date.now() + 2000).toISOString()
  };

  const reconciled = await storage.reconcileCommittedOperations(
    publicSnapshot([committedEntry], queued.operation.request.mutationId),
    "f".repeat(40)
  );

  assert.deepEqual(reconciled, [{ operationId: queued.operation.operationId, superseded: false }]);
  assert.equal((await storage.getDraft(queued.draft.id)).localState, "published");
  const stored = (await storage.listOutbox({ includeCompleted: true })).find((operation) => operation.operationId === queued.operation.operationId);
  assert.equal(stored.status, "published");
  assert.equal(stored.publishedSha, "f".repeat(40));
});

test("startup refuses reconciliation when a matching mutation id does not have matching remote content", async () => {
  const queued = await enqueueTestOperation({ draftId: "draft-reconcile-mismatch", mutationId: "mutation-reconcile-mismatch", term: "mismatchword" });
  const claimed = await storage.claimNextOperation({ tabId: "tab-reconcile-mismatch", now: new Date() });
  assert.equal(claimed.operationId, queued.operation.operationId);
  await storage.requireReviewForStoredOperations();
  const mismatchedRemote = {
    ...queued.operation.desiredEntry,
    meaning: "并非这次操作提交的内容",
    revision: 2,
    updatedAt: new Date(Date.now() + 2000).toISOString()
  };

  assert.deepEqual(await storage.reconcileCommittedOperations(
    publicSnapshot([mismatchedRemote], queued.operation.request.mutationId),
    "1".repeat(40)
  ), []);
  const stored = (await storage.listOutbox({ includeCompleted: true })).find((operation) => operation.operationId === queued.operation.operationId);
  assert.equal(stored.status, "review_required");
  assert.equal((await storage.getDraft(queued.draft.id)).localState, "queued");
});

test("stored auto-publish states require review before one operation can be explicitly requeued", async () => {
  const pending = await enqueueTestOperation({ draftId: "draft-review-pending", mutationId: "review-pending", term: "reviewpending" });
  const retry = await enqueueTestOperation({ draftId: "draft-review-retry", mutationId: "review-retry", term: "reviewretry" });
  const syncing = await enqueueTestOperation({ draftId: "draft-review-syncing", mutationId: "review-syncing", term: "reviewsyncing" });
  const auth = await enqueueTestOperation({ draftId: "draft-review-auth", mutationId: "review-auth", term: "reviewauth" });
  const conflict = await enqueueTestOperation({ draftId: "draft-review-conflict", mutationId: "review-conflict", term: "reviewconflict" });
  await storage.markOperation(retry.operation.operationId, "retry_wait", { nextAttemptAt: new Date().toISOString() });
  await storage.markOperation(syncing.operation.operationId, "syncing", { leaseOwner: "stale-tab", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  await storage.markOperation(auth.operation.operationId, "awaiting_auth");
  await storage.markOperation(conflict.operation.operationId, "conflict");

  const isolated = await storage.requireReviewForStoredOperations();
  assert.deepEqual(new Set(isolated), new Set([
    pending.operation.operationId,
    retry.operation.operationId,
    syncing.operation.operationId,
    auth.operation.operationId
  ]));
  let operations = await storage.listOutbox({ includeCompleted: true });
  for (const operationId of isolated) {
    const operation = operations.find((candidate) => candidate.operationId === operationId);
    assert.equal(operation.status, "review_required");
    assert.equal(operation.leaseOwner, null);
  }
  assert.equal(operations.find((candidate) => candidate.operationId === conflict.operation.operationId).status, "conflict");
  assert.equal(await storage.claimNextOperation({ tabId: "tab-unreviewed", now: new Date(Date.now() + 86_400_000) }), null);

  const requeued = await storage.requeueOperationForReview(pending.operation.operationId);
  assert.equal(requeued.status, "pending");
  assert.equal(requeued.attemptCount, 0);
  assert.ok(requeued.reviewConfirmedAt);
  const requeuedDraft = await storage.getDraft(pending.draft.id);
  assert.equal(requeuedDraft.localState, "queued");
  assert.equal(requeuedDraft.lastOperationId, pending.operation.operationId);
  await assert.rejects(storage.requeueOperationForReview(pending.operation.operationId), /待确认任务/);
});

test("an invalid public snapshot never overwrites the last valid cache", async () => {
  const valid = { schemaVersion: 3, exportedAt: new Date().toISOString(), revisionId: "revision-cache-001", lastMutationId: "", entries: [] };
  await storage.putPublicCache(valid, "a".repeat(40), "test");
  await assert.rejects(storage.putPublicCache({ ...valid, entries: [{ html: "<script>alert(1)</script>" }] }, "b".repeat(40), "bad"));
  const cached = await storage.getPublicCache();
  assert.equal(cached.sha, "a".repeat(40));
  assert.equal(cached.snapshot.entries.length, 0);
});

test("an HTTP ETag updates separately without erasing a trusted Git blob SHA", async () => {
  const snapshot = { schemaVersion: 3, exportedAt: new Date().toISOString(), revisionId: "revision-cache-etag", lastMutationId: "", entries: [] };
  await storage.putPublicCache(snapshot, "", "public-static-json", { etag: 'W/"public-etag"' });
  let cached = await storage.getPublicCache();
  assert.equal(cached.sha, "a".repeat(40));
  assert.equal(cached.etag, 'W/"public-etag"');
  assert.equal(cached.sourceUrl, "public-static-json");

  await storage.putPublicCache(snapshot, '"legacy-etag-argument"', "legacy-public-call");
  cached = await storage.getPublicCache();
  assert.equal(cached.sha, "a".repeat(40));
  assert.equal(cached.etag, '"legacy-etag-argument"');
});

test.after(async () => {
  await storage.closeDatabaseForTests();
  await deleteDatabase("wordbook-db");
});
