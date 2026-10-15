import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { createBlankEntry } from "../js/wordbook-schema.js";

globalThis.BroadcastChannel = undefined;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.indexedDB = new IDBFactory();
const storage = await import("../js/owner-storage.js");
const scan = (suffix = "1") => ({
  version: 1, status: "complete", sourceFingerprint: `s1:0000000${suffix}`, candidatesFingerprint: `s1:1111111${suffix}`,
  checkedAt: "2026-10-15T12:00:00.000Z", candidateCount: 3, matches: [], reason: ""
});
const snapshot = (entry, mutationId) => ({ schemaVersion: 3, exportedAt: new Date().toISOString(), revisionId: `revision-${mutationId}`, lastMutationId: mutationId, entries: [entry] });
test.beforeEach(async () => { await storage.closeDatabaseForTests(); globalThis.indexedDB = new IDBFactory(); });
test.afterEach(async () => { await storage.closeDatabaseForTests(); });

async function enqueue() {
  const entry = { ...createBlankEntry("scanword"), meaning: "测试词义", synonymScan: scan("1") };
  const draft = await storage.saveDraft({
    id: "scan-completion-draft", scope: "owner-public", mode: "create", entryId: entry.id, value: entry,
    base: { entry: null, entryUpdatedAt: null, remoteSha: "a".repeat(40) }, localState: "local_saved"
  });
  const queued = await storage.enqueuePublish(draft, {
    clientProtocol: "v38", queueProtocol: "v38", baseSha: "a".repeat(40), mutationId: "scan-completion-mutation", mutation: { type: "add", entry }
  });
  const claimed = await storage.claimNextOperation({ tabId: "scan-completion-tab", now: new Date() });
  assert.equal(claimed.operationId, queued.operation.operationId);
  return queued;
}

async function complete(queued, remoteChanges = {}) {
  const remoteEntry = { ...queued.operation.desiredEntry, synonymScan: scan("2"), ...remoteChanges };
  return storage.completeOperation(queued.operation.operationId, {
    tabId: "scan-completion-tab", sha: "b".repeat(40), snapshot: snapshot(remoteEntry, queued.operation.operationId)
  });
}

test("a server-only synonym scan change does not falsely mark a successful publish superseded", async () => {
  const queued = await enqueue();
  const result = await complete(queued);
  assert.deepEqual(result, { superseded: false });
  assert.equal((await storage.getDraft(queued.draft.id)).localState, "published");
  assert.deepEqual((await storage.getPublicCache()).snapshot.entries[0].synonymScan, scan("2"));
});

test("a scan-only local refresh also leaves the owner's queued content marked published", async () => {
  const queued = await enqueue();
  const current = await storage.getDraft(queued.draft.id);
  await storage.saveDraft({ ...current, value: { ...current.value, synonymScan: scan("3") } });
  assert.deepEqual(await complete(queued), { superseded: false });
  const saved = await storage.getDraft(queued.draft.id);
  assert.equal(saved.localState, "published");
  assert.deepEqual(saved.value.synonymScan, scan("3"));
});

for (const [field, value] of [["meaning", "排队后补写的释义"], ["synonyms", ["alternate"]], ["usage", "A genuine local usage edit."]]) {
  test(`a scan change cannot hide a genuine concurrent local ${field} edit`, async () => {
    const queued = await enqueue();
    const current = await storage.getDraft(queued.draft.id);
    await storage.saveDraft({ ...current, value: { ...current.value, [field]: value, synonymScan: scan("3") } });
    assert.deepEqual(await complete(queued), { superseded: true });
    const saved = await storage.getDraft(queued.draft.id);
    assert.equal(saved.localState, "local_saved"); assert.deepEqual(saved.value[field], value);
    assert.equal(saved.lastOperationId, null);
  });
}

test("changed remote synonyms remain a real content mismatch despite updated scan bookkeeping", async () => {
  const queued = await enqueue();
  assert.deepEqual(await complete(queued, { synonyms: ["alternate"] }), { superseded: true });
  assert.equal((await storage.getDraft(queued.draft.id)).localState, "local_saved");
});

test("response-lost reconciliation accepts scan-only changes and preserves later genuine draft edits", async () => {
  const queued = await enqueue();
  await storage.requireReviewForStoredOperations();
  const remoteEntry = { ...queued.operation.desiredEntry, synonymScan: scan("2") };
  const reconciled = await storage.reconcileCommittedOperations(snapshot(remoteEntry, queued.operation.operationId), "c".repeat(40));
  assert.deepEqual(reconciled, [{ operationId: queued.operation.operationId, superseded: false }]);
  assert.equal((await storage.getDraft(queued.draft.id)).localState, "published");

  // A later local edit is still content, even when both scan snapshots differ.
  const current = await storage.getDraft(queued.draft.id);
  const changed = await storage.saveDraft({ ...current, value: { ...current.value, meaning: "随后写下的新释义", synonymScan: scan("3") } });
  const second = await storage.enqueuePublish(changed, {
    clientProtocol: "v38", queueProtocol: "v38", baseSha: "c".repeat(40), mutationId: "scan-second-mutation", mutation: { type: "add", entry: changed.value }
  });
  await storage.claimNextOperation({ tabId: "second-tab", now: new Date() });
  const newest = await storage.getDraft(changed.id);
  await storage.saveDraft({ ...newest, value: { ...newest.value, synonyms: ["alternate"] } });
  await storage.requireReviewForStoredOperations();
  const secondRemote = { ...second.operation.desiredEntry, synonymScan: scan("2") };
  const secondResult = await storage.reconcileCommittedOperations(snapshot(secondRemote, second.operation.operationId), "d".repeat(40));
  assert.deepEqual(secondResult, [{ operationId: second.operation.operationId, superseded: true }]);
  const preserved = await storage.getDraft(changed.id);
  assert.equal(preserved.localState, "local_saved"); assert.deepEqual(preserved.value.synonyms, ["alternate"]);
});
