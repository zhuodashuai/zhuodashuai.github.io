import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
globalThis.indexedDB = new IDBFactory(); globalThis.IDBKeyRange = IDBKeyRange; globalThis.BroadcastChannel = undefined;
const storage = await import("../js/owner-storage.js?v=78");
const { importMarkedCandidates, validateMarkedCandidate } = await import("../js/marked-import.js");
const { createBlankEntry } = await import("../js/wordbook-schema.js?v=78");
const canonical = JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8"));
const snapshot = { ...canonical, entries: [] };
const item = (text = "by some fluke", extra = {}) => ({ text, context: `I found ${text} in the passage.`, markType: "underline", certainty: "clear", region: [.1, .2, .3, .04], pageNumber: 2, ...extra });
const options = (extra = {}) => ({ snapshot, lookup: async () => null, fileName: "private-reading.pdf", fileHash: "a".repeat(64), ...extra });
test.beforeEach(async () => { await storage.closeDatabaseForTests(); globalThis.indexedDB = new IDBFactory(); });

test("selected original forms become local review drafts, never publications or review attempts", async () => {
  const result = await importMarkedCandidates([item("electrify", { originalText: "electrified" })], options());
  assert.equal(result.added.length, 1);
  const draft = result.added[0];
  assert.equal(draft.value.term, "electrify"); assert.equal(draft.value.originalInput, "electrified");
  assert.equal(draft.value.attributionStatus, "unverified"); assert.equal(draft.localState, "local_saved");
  assert.ok(draft.value.tags.includes("待复核")); assert.equal(draft.value.meaning, "");
  assert.equal(draft.base.captureSources[0].fileName, "private-reading.pdf");
  assert.ok(!JSON.stringify(draft.value).includes("private-reading.pdf"));
  assert.equal(draft.base.captureSources[0].pageNumber, 2);
  assert.deepEqual(await storage.listOutbox(), []); assert.deepEqual(await storage.listReviewStates(), []);
});

test("a reviewed source-form correction keeps the raw OCR reading private without publishing its mistake", async () => {
  const result = await importMarkedCandidates([item("electrify", { originalText: "electrified", recognizedText: "electrined" })], options());
  assert.equal(result.added[0].value.originalInput, "electrified");
  assert.equal(result.added[0].base.captureSources[0].recognizedText, "electrined");
  assert.ok(!JSON.stringify(result.added[0].value).includes("electrined"));
});
test("same selection, repeated upload and changed filename all reuse the existing draft", async () => {
  const first = await importMarkedCandidates([item(), item("BY SOME FLUKE")], options());
  assert.equal(first.added.length, 1); assert.equal(first.duplicates.length, 1);
  const changed = { ...first.added[0], value: { ...first.added[0].value, usage: "我的手动笔记" } };
  await storage.saveDraft(changed);
  const second = await importMarkedCandidates([item()], options({ fileName: "other.pdf", fileHash: "b".repeat(64) }));
  assert.equal(second.added.length, 0); assert.equal(second.duplicates[0].kind, "draft");
  assert.equal((await storage.listDrafts()).length, 1); assert.equal((await storage.listDrafts())[0].value.usage, "我的手动笔记");
});
test("simultaneous tabs cannot create duplicate semantic drafts", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => importMarkedCandidates([item()], options())));
  assert.equal(results.reduce((sum, result) => sum + result.added.length, 0), 1);
  assert.equal((await storage.listDrafts()).length, 1);
});
test("existing public terms and newer cached terms are skipped without changing the snapshot", async () => {
  const source = structuredClone(canonical), before = JSON.stringify(source);
  const result = await importMarkedCandidates([item("pavilion")], options({ snapshot: source }));
  assert.equal(result.added.length, 0); assert.equal(result.duplicates[0].kind, "published");
  assert.equal(JSON.stringify(source), before);
  await storage.putPublicCache(canonical, "a".repeat(40));
  const cached = await importMarkedCandidates([item("pavilion")], options());
  assert.equal(cached.added.length, 0); assert.equal(cached.duplicates[0].kind, "published");
});
test("only real collected book/chapter destinations are accepted", async () => {
  const result = await importMarkedCandidates([item()], options({ snapshot: canonical, bookId: "never-let-me-go", chapterId: "chapter-5" }));
  assert.ok(result.added[0].value.tags.includes("collection:never-let-me-go:chapter-5"));
  assert.equal(result.added[0].value.sourceWork, "Never Let Me Go");
  await assert.rejects(importMarkedCandidates([item("different")], options({ snapshot: canonical, bookId: "made-up", chapterId: "chapter-1" })));
  assert.equal((await storage.listDrafts()).length, 1);
});
test("a whole batch is validated before any write, including malicious terms and bad locations", async () => {
  for (const invalid of [item("<script>alert(1)</script>"), item("中文"), item("safe", { region: [.9, .9, .3, .4] }), item("safe", { pageNumber: 0 }), item("safe", { certainty: "verified" })]) {
    await assert.rejects(importMarkedCandidates([item(), invalid], options()));
    assert.equal((await storage.listDrafts()).length, 0);
  }
  await assert.rejects(importMarkedCandidates([], options()));
  await assert.rejects(importMarkedCandidates(Array.from({ length: 61 }, () => item()), options()));
});
test("whole paragraph markings are never split into many inferred unknown words", () => {
  assert.throws(() => validateMarkedCandidate(item("The entire paragraph is highlighted but this does not mean that every word is unknown to the reader.")), /整句|整段/u);
});
test("dictionary failure or non-Chinese garbage does not block saving the English/source draft", async () => {
  const broken = await importMarkedCandidates([item()], options({ lookup: async () => { throw new Error("offline"); } }));
  assert.equal(broken.added[0].value.meaning, "");
  const garbage = await importMarkedCandidates([item("fluke")], options({ lookup: async () => ({ meaning: "QUOTA EXCEEDED", partOfSpeech: "noun" }) }));
  assert.equal(garbage.added[0].value.meaning, "");
});
test("local dictionary Chinese is clearly an unreviewed reference without forged structured senses", async () => {
  const result = await importMarkedCandidates([item("fluke")], options({ lookup: async () => ({ meaning: "n. 侥幸；偶然事件", partOfSpeech: "noun", phonetic: "/fluːk/", definition: "A chance event." }) }));
  assert.equal(result.added[0].value.partOfSpeech, "noun");
  assert.match(result.added[0].value.meaning, /侥幸/u); assert.deepEqual(result.added[0].value.senses, []);
  assert.equal(result.added[0].value.organizationMethod, "manual");
});

test("a shared dictionary failure is attempted once per import instead of once per selected word", async () => {
  let calls = 0;
  const result = await importMarkedCandidates([item("fluke"), item("rummage"), item("quaint")], options({ lookup: async () => { calls++; throw new Error("dictionary download unavailable"); } }));
  assert.equal(calls, 1); assert.equal(result.added.length, 3);
  assert.ok(result.added.every(draft => draft.value.meaning === "" && draft.value.exampleEn && draft.base.captureSources.length === 1));
});

function storageCandidate(term, id = crypto.randomUUID()) {
  const value = createBlankEntry(term);
  return { id, entryId: value.id, scope: "owner-public", mode: "create", value, base: { entry: null, entryUpdatedAt: null, remoteSha: null }, localState: "local_saved" };
}

test("duplicate draft or entry IDs inside a batch reject before any writes", async () => {
  const first = storageCandidate("fluke", "same-draft-id"), second = storageCandidate("rummage", "same-draft-id");
  await assert.rejects(storage.insertMarkedDrafts([first, second]), /ID 重复/u);
  assert.equal((await storage.listDrafts()).length, 0);
  second.id = "different-draft-id"; second.entryId = first.entryId;
  await assert.rejects(storage.insertMarkedDrafts([first, second]), /ID 重复/u);
  assert.equal((await storage.listDrafts()).length, 0);
});

test("a synchronous mid-batch IndexedDB failure rolls back earlier adds and surfaces one failure", async () => {
  const initial = await importMarkedCandidates([item("original")], options());
  const before = await storage.listDrafts();
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (value, ...rest) {
    if (value.value?.term === "rummage") throw new DOMException("test quota failure", "QuotaExceededError");
    return add.call(this, value, ...rest);
  };
  try {
    await assert.rejects(storage.insertMarkedDrafts([storageCandidate("fluke"), storageCandidate("rummage")]), /test quota failure/u);
  } finally { IDBObjectStore.prototype.add = add; }
  assert.deepEqual(await storage.listDrafts(), before);
  assert.equal((await storage.getDraft(initial.added[0].id)).value.term, "original");
});

test("duplicate imports do not overwrite a queued draft, its source metadata, or its outbox request", async () => {
  const imported = await importMarkedCandidates([item("fluke")], options());
  const draft = imported.added[0];
  await storage.enqueuePublish(draft, { clientProtocol: "v38", queueProtocol: "v38", baseSha: "a".repeat(40), mutationId: "marked-source-preserved-queue", mutation: { type: "add", entry: draft.value } });
  const beforeDraft = await storage.getDraft(draft.id), beforeOutbox = await storage.listOutbox();
  const repeated = await importMarkedCandidates([item("fluke", { context: "A different occurrence of fluke." })], options({ fileName: "another.pdf" }));
  assert.equal(repeated.added.length, 0); assert.equal(repeated.duplicates[0].kind, "draft");
  assert.deepEqual(await storage.getDraft(draft.id), beforeDraft); assert.deepEqual(await storage.listOutbox(), beforeOutbox);
});
