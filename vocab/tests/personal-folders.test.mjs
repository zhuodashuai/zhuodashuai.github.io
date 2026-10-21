import assert from "node:assert/strict";
import test from "node:test";
import { createPersonalApi } from "../js/personal-api.js";
import { createPersonalFolderMutation, filterPersonalFolderEntries, serializePersonalFolderExport,
  validatePersonalFolder, validatePersonalFolderName, validatePersonalFolderResult, validatePersonalFolders } from "../js/personal-folders.js";
import { createPersonalSessionScope } from "../js/personal-storage.js";

const UID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FOLDER = `folder-${UID}`;
const ENTRY = `member-${UID}`;
const ENTRY2 = `member-${OTHER}`;
const time = "2026-10-21T12:00:00.000Z";
const folder = (extra = {}) => ({ id: FOLDER, name: "阅读", entryIds: [ENTRY], createdAt: time, updatedAt: time, revision: 1, ...extra });
const operation = (extra = {}) => ({ userId: UID, authType: "member", kind: "entries", folderId: FOLDER,
  afterSave: true, label: "已保存的词", body: { entryIds: [ENTRY], mode: "add", revision: 1 }, ...extra });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

test("folder names match NFKC/trim, preserve case and count Unicode codepoints", () => {
  assert.equal(validatePersonalFolderName("  Ｒｅａｄｉｎｇ  "), "Reading");
  assert.equal(validatePersonalFolderName("🙂".repeat(40)), "🙂".repeat(40));
  assert.throws(() => validatePersonalFolderName("🙂".repeat(41)));
  assert.throws(() => validatePersonalFolderName(" ".repeat(160) + "A"));
  for (const value of ["", "  ", "\n阅读", "阅读\n", "书\t夹", "a\u200bb", "a\ud800b", null, 5]) assert.throws(() => validatePersonalFolderName(value));
});

test("folder lists reject duplicate IDs/names, invalid times, revisions and oversized membership", () => {
  assert.deepEqual(validatePersonalFolder(folder()), folder());
  for (const extra of [{ id: "../entries" }, { revision: 0 }, { revision: 1.5 }, { entryIds: [ENTRY, ENTRY] }, { entryIds: ["public-card"] },
    { name: " Ａ " }, { createdAt: "yesterday" }, { updatedAt: "2020-01-01T00:00:00.000Z" }]) assert.throws(() => validatePersonalFolder(folder(extra)));
  assert.throws(() => validatePersonalFolders({ revision: 1, folders: [folder(), folder()] }));
  assert.throws(() => validatePersonalFolders({ revision: 1, folders: [folder({ name: "Reading" }), folder({ id: `folder-${OTHER}`, name: "reading" })] }));
  assert.throws(() => validatePersonalFolders({ revision: -1, folders: [] }));
  assert.throws(() => validatePersonalFolders({ revision: 1, folders: Array(51).fill(folder()) }));
});

test("one canonical member ID can belong to multiple folders without duplicated entries or shared-record edits", () => {
  const entries = [{ id: ENTRY, term: "happy" }, { id: ENTRY2, term: "quiet" }];
  const folders = [folder(), folder({ id: `folder-${OTHER}`, name: "口语" })];
  const original = structuredClone({ entries, folders });
  assert.deepEqual(filterPersonalFolderEntries(entries, folders, FOLDER), [entries[0]]);
  assert.deepEqual(filterPersonalFolderEntries(entries, folders, `folder-${OTHER}`), [entries[0]]);
  assert.deepEqual(filterPersonalFolderEntries(entries, folders, "unfiled"), [entries[1]]);
  assert.deepEqual(filterPersonalFolderEntries(entries, folders, "folder-missing"), []);
  assert.deepEqual(filterPersonalFolderEntries(entries, [folder({ entryIds: [] })], FOLDER), []);
  assert.notEqual(filterPersonalFolderEntries(entries, folders, "all"), entries);
  assert.deepEqual({ entries, folders }, original);
});

test("removing a classification makes a word unfiled without touching its entry or reviews", () => {
  const entries = [{ id: ENTRY, term: "happy" }], reviews = [{ entryId: ENTRY, reviews: 3 }];
  assert.deepEqual(filterPersonalFolderEntries(entries, [], "unfiled"), entries);
  assert.deepEqual(entries, [{ id: ENTRY, term: "happy" }]);
  assert.deepEqual(reviews, [{ entryId: ENTRY, reviews: 3 }]);
});

test("folder exports retain existing entries, learning and metadata, but reject orphan cross-snapshot IDs", () => {
  const base = { format: "zhuo-private-wordbook", version: 2, username: "student", exportedAt: time,
    entries: [{ id: ENTRY, meaning: "快乐" }], reviews: [{ entryId: ENTRY, reviews: 3 }] };
  const exported = JSON.parse(serializePersonalFolderExport(JSON.stringify(base), [folder()], 3));
  assert.deepEqual(exported.entries, base.entries); assert.deepEqual(exported.reviews, base.reviews);
  for (const key of ["format", "version", "username", "exportedAt"]) assert.equal(exported[key], base[key]);
  assert.deepEqual(exported.folders, [folder()]); assert.equal(exported.foldersRevision, 3);
  assert.throws(() => serializePersonalFolderExport(JSON.stringify(base), [folder({ entryIds: [ENTRY2] })], 3), /快照/);
});

test("idempotent folder results expose the current folder or null and do not manufacture success", () => {
  assert.deepEqual(validatePersonalFolderResult({ revision: 8, action: "idempotent", folder: null }, FOLDER), { revision: 8, action: "idempotent", folder: null });
  const current = folder({ name: "新名称", entryIds: [], revision: 8 });
  assert.deepEqual(validatePersonalFolderResult({ revision: 8, action: "idempotent", folder: current }, FOLDER).folder, current);
  assert.throws(() => validatePersonalFolderResult({ revision: 8, action: "created", folder: null }));
  assert.throws(() => validatePersonalFolderResult({ revision: 8, action: "deleted", folder: current }));
  assert.throws(() => validatePersonalFolderResult({ revision: 8, action: "updated", folder: current }, `folder-${OTHER}`));
});

test("all folder endpoints retain same-origin/no-store, expected UID, exact auth and CSRF boundaries", async () => {
  const seen = [];
  const api = createPersonalApi({ fetchImpl: async (url, options) => { seen.push({ url, options }); return response({}); } });
  const options = { expectedUserId: UID, authType: "github-owner" };
  const body = { name: "阅读", mutationId: OTHER };
  await api.folders(options); await api.createFolder(body, "csrf", options);
  await api.renameFolder(FOLDER, { ...body, revision: 3 }, "csrf", options);
  await api.removeFolder(FOLDER, { revision: 3, mutationId: OTHER }, "csrf", options);
  await api.folderEntries(FOLDER, { entryIds: [ENTRY], mode: "add", revision: 3, mutationId: OTHER }, "csrf", options);
  assert.deepEqual(seen.map(item => item.url), ["/api/v1/member/folders", "/api/v1/member/folders", `/api/v1/member/folders/${FOLDER}`, `/api/v1/member/folders/${FOLDER}`, `/api/v1/member/folders/${FOLDER}/entries`]);
  assert.deepEqual(seen.map(item => item.options.method), ["GET", "POST", "PUT", "DELETE", "POST"]);
  for (const { options: request, url } of seen) {
    assert.equal(request.credentials, "same-origin"); assert.equal(request.cache, "no-store");
    assert.equal(request.headers["X-Member-User"], UID); assert.equal(request.headers["X-Wordbook-Auth"], "github-owner");
    assert.ok(request.signal instanceof AbortSignal); assert.equal(url.includes("?"), false);
  }
  for (const { options: request } of seen.slice(1)) {
    assert.equal(request.headers["X-CSRF-Token"], "csrf"); assert.equal(request.body.includes("csrf"), false);
    assert.equal(JSON.parse(request.body).mutationId, OTHER);
  }
});

test("missing expected UID and unsafe folder IDs cannot start a transport", () => {
  let calls = 0; const api = createPersonalApi({ fetchImpl: async () => { calls++; return response({}); } });
  assert.throws(() => api.folders()); assert.throws(() => api.createFolder({}, "csrf", {}));
  for (const id of ["../owner", ENTRY, "folder-not-uuid"]) assert.throws(() => api.renameFolder(id, {}, "csrf", { expectedUserId: UID }));
  assert.equal(calls, 0);
});

test("a timeout/failed-ack retry preserves exactly the original operation and mutation ID", () => {
  let ids = 0; const tracker = createPersonalFolderMutation({ newId: () => { ids++; return OTHER; } });
  const first = tracker.begin(operation()); first.body.entryIds.push(ENTRY2);
  assert.deepEqual(tracker.snapshot(UID).body.entryIds, [ENTRY]);
  assert.equal(tracker.snapshot(OTHER), null);
  assert.equal(tracker.begin(operation()).body.mutationId, OTHER); assert.equal(ids, 1);
  assert.throws(() => tracker.begin(operation({ body: { entryIds: [ENTRY], mode: "add", revision: 2 } })), /尚未确认/);
  assert.throws(() => tracker.begin(operation({ userId: OTHER })), /尚未确认/);
});

test("same-UID revalidation may restore only the exact tracker; clearing or another account cannot see it", () => {
  const tracker = createPersonalFolderMutation({ newId: () => OTHER });
  tracker.begin(operation()); const held = tracker.snapshot(UID); tracker.clear();
  assert.equal(tracker.hasPending(), false); tracker.restore(held);
  assert.deepEqual(tracker.begin(operation()), held);
  tracker.clear(); assert.equal(tracker.snapshot(UID), null); assert.equal(tracker.snapshot(OTHER), null);
  assert.throws(() => tracker.restore({ ...held, body: { ...held.body, mutationId: "invalid" } }));
});

test("account generation invalidates an in-flight folder operation independently of transport abort support", async () => {
  const scope = createPersonalSessionScope(); scope.advance(UID); const ticket = scope.request();
  scope.advance(OTHER); assert.equal(ticket.current(), false); assert.equal(ticket.signal.aborted, true); ticket.release();
});

test("pending tracker rejects invalid mutation kinds, stale/missing revision and bulk payloads", () => {
  for (const extra of [{ kind: "publish" }, { folderId: "../entries" }, { body: { entryIds: [], mode: "add", revision: 1 } },
    { body: { entryIds: [ENTRY, ENTRY], mode: "add", revision: 1 } }, { body: { entryIds: [ENTRY], mode: "add", revision: 0 } }]) {
    assert.throws(() => createPersonalFolderMutation({ newId: () => OTHER }).begin(operation(extra)));
  }
});
