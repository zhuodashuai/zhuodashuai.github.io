import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import {
  createOwnerBackupBlob, readOwnerBackupFile, OWNER_BACKUP_MAX_BYTES, OWNER_BACKUP_MAX_DRAFTS
} from "../js/owner-backup.js";
import { createBlankEntry } from "../js/wordbook-schema.js";
import { applyReviewRating } from "../js/study.js";

const snapshot = JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8"));
const emptyBackup = { backupVersion: 1, exportedAt: "2026-10-11T12:00:00.000Z", owner: "zhuodashuai", drafts: [], publicSnapshot: null };
const backupFile = value => new Blob([JSON.stringify(value)], { type: "application/json" });
const draft = (term = "receive") => ({
  id: "backup-original-draft", scope: "owner-public", mode: "create",
  value: createBlankEntry(term), localState: "queued", lastOperationId: "old-operation"
});

test("the current full wordbook exports and imports above the old 1.5 MB limit without losing content or publishing", async () => {
  globalThis.indexedDB = indexedDB;
  globalThis.IDBKeyRange = IDBKeyRange;
  globalThis.BroadcastChannel = undefined;
  const storage = await import("../js/owner-storage.js?backup-test");
  const original = { ...draft(), value: structuredClone(snapshot.entries[0]), entryId: snapshot.entries[0].id };
  const input = { drafts: [original], publicSnapshot: snapshot, exportedAt: emptyBackup.exportedAt };
  const before = structuredClone(input);
  const blob = createOwnerBackupBlob(input);
  assert.ok(blob.size > 1_500_000, "fixture reproduces the actual expanded-library regression");
  assert.ok(blob.size < OWNER_BACKUP_MAX_BYTES);
  const restored = await readOwnerBackupFile(blob);
  assert.deepEqual(restored.publicSnapshot, snapshot);
  assert.equal(restored.publicSnapshot.entries.length, snapshot.entries.length);
  assert.deepEqual(restored.drafts[0].value, original.value);
  assert.notEqual(restored.drafts[0].id, original.id);
  assert.equal(restored.drafts[0].localState, "local_saved");
  assert.equal(restored.drafts[0].lastOperationId, null);
  assert.deepEqual(input, before, "export and parsing do not mutate live data");
  try {
    const review = applyReviewRating(original.entryId, null, "good", new Date(emptyBackup.exportedAt));
    await storage.putReviewState(review, { expected: null });
    await storage.importDrafts(restored.drafts);
    assert.equal((await storage.listDrafts()).length, 1);
    assert.deepEqual((await storage.listDrafts())[0].value, original.value);
    assert.deepEqual(await storage.listOutbox({ includeCompleted: true }), [], "import cannot queue a publication");
    assert.deepEqual(await storage.getReviewState(original.entryId), review, "import cannot reset study progress");
    await storage.closeDatabaseForTests();
    assert.deepEqual((await storage.listDrafts())[0].value, original.value, "import survives reopening storage");
  } finally {
    await storage.closeDatabaseForTests();
  }
});

test("an exactly 10 MB valid backup is accepted", async () => {
  const text = JSON.stringify(emptyBackup);
  const file = new Blob([text, " ".repeat(OWNER_BACKUP_MAX_BYTES - new TextEncoder().encode(text).byteLength)]);
  assert.equal(file.size, OWNER_BACKUP_MAX_BYTES);
  assert.deepEqual(await readOwnerBackupFile(file), emptyBackup);
});

test("one byte above the shared limit is rejected before any file read", async () => {
  let read = false;
  await assert.rejects(readOwnerBackupFile({
    size: OWNER_BACKUP_MAX_BYTES + 1,
    async text() { read = true; throw new Error("the oversized file must not be read"); }
  }), /超过 10 MB，已拒绝读取/u);
  assert.equal(read, false);
});

test("byte verification also rejects mismatched file metadata before JSON parsing", async () => {
  const text = "中".repeat(Math.ceil(OWNER_BACKUP_MAX_BYTES / 3));
  assert.ok(text.length < OWNER_BACKUP_MAX_BYTES);
  await assert.rejects(readOwnerBackupFile({ size: text.length, async text() { return text; } }), /超过 10 MB，已拒绝解析/u);
});

test("export applies the same UTF-8 byte limit and refuses an unimportable backup", () => {
  const oversized = { ...draft(), comment: "中".repeat(Math.ceil(OWNER_BACKUP_MAX_BYTES / 3)) };
  assert.throws(() => createOwnerBackupBlob({ drafts: [oversized], publicSnapshot: null }), /超过 10 MB，无法导出/u);
});

test("the draft-count boundary remains 1000 and imports receive unique local-only IDs", async () => {
  const drafts = Array.from({ length: OWNER_BACKUP_MAX_DRAFTS }, () => draft());
  const imported = await readOwnerBackupFile(backupFile({ ...emptyBackup, drafts }));
  assert.equal(imported.drafts.length, OWNER_BACKUP_MAX_DRAFTS);
  assert.equal(new Set(imported.drafts.map(value => value.id)).size, OWNER_BACKUP_MAX_DRAFTS);
  assert.ok(imported.drafts.every(value => value.localState === "local_saved" && value.lastOperationId === null));
  const tooMany = [...drafts, draft()];
  await assert.rejects(readOwnerBackupFile(backupFile({ ...emptyBackup, drafts: tooMany })), /草稿数量过多/u);
  assert.throws(() => createOwnerBackupBlob({ drafts: tooMany, publicSnapshot: null }), /草稿数量过多/u);
});

test("increasing the byte budget does not bypass snapshot entry-count or content validation", async () => {
  await assert.rejects(readOwnerBackupFile(backupFile({
    ...emptyBackup, publicSnapshot: { ...snapshot, entries: Array.from({ length: 10_001 }, () => ({})) }
  })), /entries 格式不正确/u);
  await assert.rejects(readOwnerBackupFile(backupFile({
    ...emptyBackup, publicSnapshot: { ...snapshot, entries: [{ ...snapshot.entries[0], meaning: 123 }] }
  })), /必须是文本/u);
});

test("invalid backup envelopes, drafts and JSON remain rejected", async () => {
  for (const changed of [{ owner: "someone-else" }, { backupVersion: 2 }, { drafts: {} }]) {
    await assert.rejects(readOwnerBackupFile(backupFile({ ...emptyBackup, ...changed })), /备份文件格式不正确/u);
  }
  for (const badDraft of [null, [], { value: [] }, { value: "invalid" }]) {
    await assert.rejects(readOwnerBackupFile(backupFile({ ...emptyBackup, drafts: [badDraft] })), /格式不正确的草稿/u);
  }
  await assert.rejects(readOwnerBackupFile(new Blob(["{broken json"])), SyntaxError);
  for (const size of [-1, NaN, Infinity, "100"]) {
    await assert.rejects(readOwnerBackupFile({ size, async text() { return "{}"; } }), /备份文件格式不正确/u);
  }
});

test("unfinished source URLs stay recoverable draft text, not trusted published links", async () => {
  const original = draft();
  original.value.sourceUrl = "https://unfinished";
  const imported = await readOwnerBackupFile(createOwnerBackupBlob({ drafts: [original], publicSnapshot: null }));
  assert.equal(imported.drafts[0].value.sourceUrl, original.value.sourceUrl);
  assert.equal(imported.drafts[0].localState, "local_saved");
});
