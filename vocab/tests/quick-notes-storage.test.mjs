import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { buildQuickNotesBackup, createQuickNotesStorage, parseQuickNotesBackup, QUICK_NOTES_LIMITS, resolveQuickNotesDatabaseName, validateQuickNote } from "../js/quick-notes-storage.js";

const at = "2026-10-17T12:00:00.000Z";
function note(overrides = {}) { return { schemaVersion: 1, id: "one", text: "by some fluke", createdAt: at, updatedAt: at, revision: 0, ...overrides }; }
function setup(options = {}) {
  const indexedDB = options.indexedDB || new IDBFactory();
  let serial = 0;
  return { indexedDB, storage: createQuickNotesStorage({ indexedDB, now: () => at, newId: () => `note-${++serial}`, ...options }) };
}
async function rawWrite(indexedDB, value) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("wordbook-quick-notes", 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const transaction = database.transaction("notes", "readwrite");
    transaction.objectStore("notes").put(value);
    transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

test("quick-note test database isolation cannot be enabled on a production origin", () => {
  assert.equal(resolveQuickNotesDatabaseName(), "wordbook-quick-notes");
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(resolveQuickNotesDatabaseName({ hostname, search: "?e2e=1&testRun=ABC!123" }), "wordbook-quick-notes-e2e-abc123");
  assert.equal(resolveQuickNotesDatabaseName({ hostname: "zhuodashuai.github.io", search: "?e2e=1&testRun=abc" }), "wordbook-quick-notes");
  assert.equal(resolveQuickNotesDatabaseName({ hostname: "localhost", search: "?e2e=0&testRun=abc" }), "wordbook-quick-notes");
});

test("new pages preserve raw whitespace, original casing, Unicode, and literal HTML without vocabulary writes", async () => {
  const { storage, indexedDB } = setup();
  const text = "  By some fluke\n\n<script>alert('not executed')</script>\t中文😀  ";
  const created = await storage.createQuickNote(text);
  assert.equal(created.text, text); assert.equal(created.revision, 0);
  assert.deepEqual((await indexedDB.databases()).map(({ name }) => name), ["wordbook-quick-notes"]);
  await storage.close();
  const reopened = createQuickNotesStorage({ indexedDB });
  assert.deepEqual(await reopened.getQuickNote(created.id), created);
  assert.equal(await reopened.getQuickNote("absent"), null);
  await reopened.close();
});

test("a blank page is valid and page text is not trimmed or split into formal vocabulary", async () => {
  const { storage } = setup();
  assert.equal((await storage.createQuickNote()).text, "");
  const second = await storage.createQuickNote("\n \t");
  assert.equal(second.text, "\n \t");
  assert.equal((await storage.listQuickNotes()).length, 2);
  await storage.close();
});

test("saves require an explicit revision and preserve creation identity", async () => {
  const { storage } = setup();
  const original = await storage.createQuickNote();
  await assert.rejects(storage.saveQuickNote({ id: original.id, text: "next" }), /字段/);
  await assert.rejects(storage.saveQuickNote({ id: original.id, text: "next", expectedRevision: -1 }), /版本/);
  await assert.rejects(storage.saveQuickNote({ id: original.id, text: "next", expectedRevision: 0, token: "must not be accepted" }), /字段/);
  const saved = await storage.saveQuickNote({ id: original.id, text: "next", expectedRevision: 0 });
  assert.equal(saved.note.id, original.id); assert.equal(saved.note.createdAt, original.createdAt);
  assert.equal(saved.note.revision, 1); assert.equal(saved.conflictCopy, false); assert.equal(saved.unchanged, false);
  assert.deepEqual(await storage.getQuickNote(original.id), saved.note);
  await storage.close();
});

test("concurrent tabs retain both inputs by atomically making a conflict copy", async () => {
  const { storage: first, indexedDB } = setup();
  const second = createQuickNotesStorage({ indexedDB });
  const original = await first.createQuickNote("original");
  const results = await Promise.all([
    first.saveQuickNote({ id: original.id, text: "first tab", expectedRevision: 0 }),
    second.saveQuickNote({ id: original.id, text: "second tab", expectedRevision: 0 })
  ]);
  assert.equal(results.filter(({ conflictCopy }) => conflictCopy).length, 1);
  assert.equal(new Set(results.map(({ note }) => note.id)).size, 2);
  assert.deepEqual(new Set((await first.listQuickNotes()).map(({ text }) => text)), new Set(["first tab", "second tab"]));
  const copy = results.find(({ conflictCopy }) => conflictCopy).note;
  const next = await second.saveQuickNote({ id: copy.id, text: "continue in the copy", expectedRevision: copy.revision });
  assert.equal(next.conflictCopy, false); assert.equal(next.note.id, copy.id);
  assert.equal((await first.listQuickNotes()).length, 2);
  await Promise.all([first.close(), second.close()]);
});

test("identical text is a no-op even with a stale revision, avoiding false conflict pages", async () => {
  const { storage } = setup();
  const original = await storage.createQuickNote("text");
  const first = await storage.saveQuickNote({ id: original.id, text: "new text", expectedRevision: 0 });
  const repeat = await storage.saveQuickNote({ id: original.id, text: "new text", expectedRevision: 0 });
  assert.equal(repeat.unchanged, true); assert.equal(repeat.conflictCopy, false);
  assert.deepEqual(repeat.note, first.note);
  assert.equal((await storage.listQuickNotes()).length, 1);
  await storage.close();
});

test("a missing page is recovered as a new conflict copy, not silently recreated under an old ID", async () => {
  const { storage } = setup();
  const result = await storage.saveQuickNote({ id: "missing", text: "retained input", expectedRevision: 2 });
  assert.equal(result.conflictCopy, true); assert.notEqual(result.note.id, "missing");
  assert.equal(await storage.getQuickNote("missing"), null);
  assert.equal(result.note.text, "retained input");
  await storage.close();
});

test("clock rollback cannot produce an invalid update timestamp", async () => {
  let clock = "2026-10-17T12:01:00.000Z";
  const { storage } = setup({ now: () => clock });
  const original = await storage.createQuickNote("one");
  clock = at;
  const { note: updated } = await storage.saveQuickNote({ id: original.id, text: "two", expectedRevision: 0 });
  assert.equal(updated.updatedAt, original.updatedAt);
  await storage.close();
});

test("UTF-16 per-page limits match textarea maxlength, including emoji", async () => {
  const { storage } = setup();
  assert.equal(QUICK_NOTES_LIMITS.maxTextLength, 50000);
  const allowed = "😀".repeat(25000);
  const original = await storage.createQuickNote(allowed);
  await assert.rejects(storage.createQuickNote(`${allowed}x`), /50,000/);
  await assert.rejects(storage.saveQuickNote({ id: original.id, text: `${allowed}x`, expectedRevision: 0 }), /50,000/);
  assert.equal((await storage.getQuickNote(original.id)).text, allowed);
  await storage.close();
});

test("at the 100-page limit edits still work but new pages and conflict copies fail without overwriting", async () => {
  const { storage } = setup();
  await storage.importQuickNotesBackup(buildQuickNotesBackup(Array.from({ length: 100 }, (_, index) => note({ id: `page-${index}`, text: `text ${index}` }))));
  await assert.rejects(storage.createQuickNote("overflow"), /100/);
  const original = await storage.getQuickNote("page-0");
  await storage.saveQuickNote({ id: original.id, text: "latest text", expectedRevision: 0 });
  await assert.rejects(storage.saveQuickNote({ id: original.id, text: "stale text", expectedRevision: 0 }), /100/);
  assert.equal((await storage.getQuickNote(original.id)).text, "latest text");
  assert.equal((await storage.listQuickNotes()).length, 100);
  await storage.close();
});

test("UTF-8 aggregate backup limit is enforced before mutation so every saved collection remains exportable", async () => {
  const { storage } = setup();
  const pages = Array.from({ length: 69 }, (_, index) => note({ id: `large-${index}`, text: "词".repeat(50000) }));
  await storage.importQuickNotesBackup(buildQuickNotesBackup(pages));
  await assert.rejects(storage.createQuickNote("词".repeat(50000)), /10 MB/);
  assert.equal((await storage.exportQuickNotesBackup()).notes.length, 69);
  assert.throws(() => buildQuickNotesBackup([...pages, note({ id: "extra", text: "词".repeat(50000) })]), /10 MB/);
  await storage.close();
});

test("backups round-trip all pages including deliberately identical blank pages", async () => {
  const { storage } = setup();
  await storage.createQuickNote(); await storage.createQuickNote(); await storage.createQuickNote("by some fluke");
  const document = await storage.exportQuickNotesBackup();
  assert.deepEqual(Object.keys(document), ["format", "schemaVersion", "exportedAt", "notes"]);
  assert.equal(document.format, "zhuo-quick-notes");
  const target = setup().storage;
  assert.deepEqual(await target.importQuickNotesBackup(JSON.stringify(document)), { added: 3, unchanged: 0, conflictCopies: 0 });
  assert.deepEqual(await target.listQuickNotes(), await storage.listQuickNotes());
  assert.deepEqual(await target.importQuickNotesBackup(document), { added: 0, unchanged: 3, conflictCopies: 0 });
  await Promise.all([storage.close(), target.close()]);
});

test("old backups never overwrite newer text and repeated conflict restores do not multiply copies", async () => {
  const { storage } = setup();
  const original = await storage.createQuickNote("earlier text");
  const backup = await storage.exportQuickNotesBackup();
  await storage.saveQuickNote({ id: original.id, text: "newer text", expectedRevision: 0 });
  assert.deepEqual(await storage.importQuickNotesBackup(backup), { added: 1, unchanged: 0, conflictCopies: 1 });
  assert.equal((await storage.getQuickNote(original.id)).text, "newer text");
  assert.deepEqual(new Set((await storage.listQuickNotes()).map(({ text }) => text)), new Set(["earlier text", "newer text"]));
  assert.deepEqual(await storage.importQuickNotesBackup(backup), { added: 0, unchanged: 1, conflictCopies: 0 });
  await storage.close();
});

test("backup validation rejects unsupported versions, extra sensitive fields, prototypes, accessors, and duplicate IDs", () => {
  const base = buildQuickNotesBackup([note()]);
  for (const value of [null, [], {}, { ...base, token: "secret" }, { ...base, schemaVersion: 2 }, { ...base, format: "owner-backup" }, { ...base, notes: [note(), note()] }, { ...base, notes: [note({ schemaVersion: 2 })] }, { ...base, notes: [note({ revision: -1 })] }, { ...base, notes: [note({ id: "../danger" })] }, { ...base, notes: [note({ token: "secret" })] }, { ...base, notes: [note({ text: null })] }, Object.assign(Object.create({ inherited: true }), base)]) {
    assert.throws(() => parseQuickNotesBackup(value));
  }
  let getterCalled = false;
  const accessor = { ...base };
  Object.defineProperty(accessor, "notes", { enumerable: true, get() { getterCalled = true; return []; } });
  assert.throws(() => parseQuickNotesBackup(accessor), /字段/);
  const arrayAccessor = [note()];
  Object.defineProperty(arrayAccessor, "0", { enumerable: true, get() { getterCalled = true; return note(); } });
  assert.throws(() => parseQuickNotesBackup({ ...base, notes: arrayAccessor }), /列表格式/);
  assert.equal(getterCalled, false);
  assert.throws(() => parseQuickNotesBackup(JSON.stringify(base).replace('"format":', '"__proto__":{},"format":')), /字段/);
  assert.equal(Object.prototype.polluted, undefined);
  assert.throws(() => parseQuickNotesBackup(" ".repeat(QUICK_NOTES_LIMITS.maxBackupBytes + 1)), /10 MB/);
  assert.throws(() => parseQuickNotesBackup("{broken"), /JSON/);
});

test("backup dates must be real standard ISO dates and consistent with creation", () => {
  for (const value of ["yesterday", "2026-02-30T12:00:00.000Z", "2026-10-17T12:00:00Z", "2026-10-17T13:00:00.000+01:00", "2026-10-16T12:00:00.000Z"]) assert.throws(() => validateQuickNote(note({ updatedAt: value })));
  assert.throws(() => buildQuickNotesBackup([note()], "invalid"), /ISO/);
});

test("invalid or oversized imports are atomic and do not partly add earlier valid pages", async () => {
  const { storage } = setup();
  const original = await storage.createQuickNote("preserve me");
  const invalid = buildQuickNotesBackup([note({ id: "valid", text: "valid page" })]);
  invalid.notes.push(note({ id: "bad", text: "x".repeat(50001) }));
  await assert.rejects(storage.importQuickNotesBackup(invalid), /50,000/);
  assert.deepEqual(await storage.listQuickNotes(), [original]);
  await storage.close();
});

test("a late import quota error rolls back all its new pages", async () => {
  const { storage } = setup();
  const original = await storage.createQuickNote("preserve original");
  const put = IDBObjectStore.prototype.put;
  let calls = 0;
  try {
    IDBObjectStore.prototype.put = function (...args) {
      if (++calls === 2) throw new DOMException("Import quota exhausted", "QuotaExceededError");
      return put.apply(this, args);
    };
    await assert.rejects(storage.importQuickNotesBackup(buildQuickNotesBackup([note({ id: "first" }), note({ id: "second", text: "second page" })])), /Import quota exhausted/);
  } finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await storage.listQuickNotes(), [original]);
  await storage.close();
});

test("opening errors are visible, retryable, and never reported as an in-memory save", async () => {
  const actual = new IDBFactory();
  let calls = 0;
  const { storage } = setup({ indexedDB: { open(...args) { if (++calls === 1) throw new DOMException("Storage blocked", "SecurityError"); return actual.open(...args); } } });
  await assert.rejects(storage.createQuickNote("unsaved"), /Storage blocked/);
  assert.equal((await storage.createQuickNote("saved after retry")).text, "saved after retry");
  assert.equal((await storage.listQuickNotes()).length, 1);
  await storage.close();
});

test("blocked opening fails promptly and closes a late successful connection", async () => {
  let request;
  let closed = 0;
  const { storage } = setup({ indexedDB: { open() { request = {}; queueMicrotask(() => request.onblocked()); return request; } } });
  await assert.rejects(storage.listQuickNotes(), /旧页面/);
  request.result = { close() { closed += 1; } };
  request.onsuccess();
  assert.equal(closed, 1);
  await storage.close();
});

test("an indefinitely pending opening times out, closes late success, and permits a later retry", async () => {
  const actual = new IDBFactory();
  let request;
  let calls = 0;
  let closed = 0;
  const { storage } = setup({ openTimeoutMs: 15, indexedDB: { open(...args) { if (++calls === 1) return (request = {}); return actual.open(...args); } } });
  await assert.rejects(storage.createQuickNote("unsaved"), /超时/);
  request.result = { close() { closed += 1; } }; request.onsuccess();
  assert.equal(closed, 1);
  assert.equal((await storage.createQuickNote("retry input")).text, "retry input");
  await storage.close();
});

test("quota exhaustion rejects saving and retains the prior committed page", async () => {
  const { storage } = setup();
  const original = await storage.createQuickNote("committed");
  const put = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function () { throw new DOMException("Quota exhausted", "QuotaExceededError"); };
    await assert.rejects(storage.saveQuickNote({ id: original.id, text: "must retain in editor", expectedRevision: 0 }), /Quota exhausted/);
  } finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await storage.getQuickNote(original.id), original);
  await storage.saveQuickNote({ id: original.id, text: "retry succeeds", expectedRevision: 0 });
  await storage.close();
});

test("a successful put request is not claimed saved before its transaction completes", async () => {
  const { storage } = setup();
  const original = await storage.createQuickNote("committed");
  const put = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
    await assert.rejects(storage.saveQuickNote({ id: original.id, text: "abort after request success", expectedRevision: 0 }), /保存失败/);
  } finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await storage.getQuickNote(original.id), original);
  await storage.close();
});

test("corrupt persisted records fail closed instead of being shown or silently dropped", async () => {
  const { storage, indexedDB } = setup();
  const original = await storage.createQuickNote("safe");
  await rawWrite(indexedDB, { ...original, revision: -1 });
  await assert.rejects(storage.getQuickNote(original.id), /版本/);
  await assert.rejects(storage.listQuickNotes(), /版本/);
  await assert.rejects(storage.createQuickNote("new"), /版本/);
  await assert.rejects(storage.exportQuickNotesBackup(), /版本/);
  await storage.close();
});

test("subscriber errors cannot turn committed writes into apparent failures; no-ops emit no change", async () => {
  const { storage } = setup();
  let changes = 0;
  const stop = storage.subscribe(() => { changes += 1; throw new Error("view failed"); });
  const created = await storage.createQuickNote("one");
  assert.equal(changes, 1);
  await storage.saveQuickNote({ id: created.id, text: "one", expectedRevision: 0 });
  assert.equal(changes, 1);
  stop();
  await storage.saveQuickNote({ id: created.id, text: "two", expectedRevision: 0 });
  assert.equal(changes, 1);
  await storage.close();
});

test("cross-tab notifications are database-scoped and subscriptions can be closed", async () => {
  const channels = new Set();
  class Channel {
    constructor(name) { this.name = name; channels.add(this); }
    postMessage(data) { for (const channel of channels) if (channel !== this && channel.name === this.name) channel.onmessage?.({ data }); }
    close() { channels.delete(this); }
  }
  const indexedDB = new IDBFactory();
  const first = setup({ indexedDB, BroadcastChannel: Channel }).storage;
  const second = setup({ indexedDB, BroadcastChannel: Channel }).storage;
  const unrelated = setup({ indexedDB, name: "separate", BroadcastChannel: Channel }).storage;
  const events = [];
  const stop = second.subscribe((event) => events.push(event));
  let unrelatedEvents = 0; unrelated.subscribe(() => { unrelatedEvents += 1; });
  await first.createQuickNote("a page");
  assert.deepEqual(events, [{ type: "change", external: true }]);
  assert.equal(unrelatedEvents, 0);
  stop();
  await first.createQuickNote("another page");
  assert.equal(events.length, 1);
  await Promise.all([first.close(), second.close(), unrelated.close()]);
  assert.equal(channels.size, 0);
});

test("generated ID collisions cannot overwrite an existing page", async () => {
  const { storage } = setup({ newId: () => "fixed" });
  const original = await storage.createQuickNote("original");
  await assert.rejects(storage.createQuickNote("would overwrite"), /ID/);
  assert.deepEqual(await storage.getQuickNote(original.id), original);
  await storage.close();
});
