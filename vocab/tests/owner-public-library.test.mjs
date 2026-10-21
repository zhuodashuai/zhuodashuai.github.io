import assert from "node:assert/strict";
import test from "node:test";
import { ownerPublicEntries, ownerWordbookLink, publicEntryIdFromUrl, publicEntryUrl, reconcileOwnerPublicConfirmations } from "../js/owner-public-library.js";
import { createDictionaryCollectionQueue } from "../js/dictionary-collection.js";
import { createBlankEntry } from "../js/wordbook-schema.js";

const entry = (id, term, createdAt, updatedAt = createdAt, meaning = "中文释义") => ({ id, term, createdAt, updatedAt, meaning });

test("public card links retain only the public entry identity on the current public root", () => {
  const id = "public & entry/#中文";
  for (const [from, path] of [
    ["https://zhuodashuai.github.io/vocab/personal.html?auth=owner#lookup=private-note", "/vocab/"],
    ["http://127.0.0.1:4187/personal.html?auth=owner#lookup=private-note", "/"]
  ]) {
    const url = new URL(publicEntryUrl(id, from));
    assert.equal(url.origin, new URL(from).origin);
    assert.equal(url.pathname, path);
    assert.deepEqual([...url.searchParams], [["entry", id]]);
    assert.equal(url.hash, "");
    assert.equal(publicEntryIdFromUrl(url.href), id);
  }
});

test("invalid or overlong public entry identities do not create a lookup or mutation link", () => {
  for (const id of ["", "bad\nentry", "bad\u007fentry", "x".repeat(201)]) {
    const url = publicEntryUrl(id, "https://example.test/personal.html?auth=owner");
    assert.equal(new URL(url).search, "");
    assert.equal(publicEntryIdFromUrl("https://example.test/?" + new URLSearchParams({ entry: id })), "");
  }
  const boundary = "x".repeat(200);
  assert.equal(publicEntryIdFromUrl(publicEntryUrl(boundary, "https://example.test/")), boundary);
});

test("owner navigation uses the fixed authentication origin, with an explicit owner mode", () => {
  const deployed = new URL(ownerWordbookLink({ href: "https://zhuodashuai.github.io/vocab/?entry=x#private" }));
  assert.equal(deployed.origin, "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev");
  assert.equal(deployed.pathname, "/personal.html");
  assert.deepEqual([...deployed.searchParams], [["auth", "owner"]]);
  assert.equal(deployed.hash, "");
  assert.equal(ownerWordbookLink({ href: "http://127.0.0.1:4187/dictionary.html#q=test" }), "http://127.0.0.1:4187/personal.html?auth=owner");
});

test("API confirmations survive a stale snapshot, and newer edits win without mutating either source", () => {
  const old = entry("a", "apple", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "旧释义");
  const confirmed = { ...old, updatedAt: "2026-01-03T00:00:00Z", meaning: "确认后的释义" };
  const added = entry("b", "pear", "2026-01-04T00:00:00Z");
  const snapshot = { entries: [old] };
  const confirmations = [{ entry: confirmed, added: false }, { entry: added, added: true }];
  const before = structuredClone({ snapshot, confirmations });
  assert.deepEqual(ownerPublicEntries(snapshot, confirmations).map(value => value.id), ["b", "a"]);
  assert.equal(ownerPublicEntries(snapshot, confirmations).find(value => value.id === "a").meaning, confirmed.meaning);
  const newer = { ...confirmed, updatedAt: "2026-01-05T00:00:00Z", meaning: "更新的公开释义" };
  assert.equal(ownerPublicEntries({ entries: [newer] }, confirmations).find(value => value.id === "a").meaning, newer.meaning);
  assert.deepEqual({ snapshot, confirmations }, before);
});

test("recent order uses creation rather than edit time, with English and Chinese search", () => {
  const olderEdited = entry("a", "apple", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", "苹果");
  const newer = entry("b", "pear", "2026-01-02T00:00:00Z", undefined, "梨");
  const snapshot = { entries: [olderEdited, newer] };
  assert.deepEqual(ownerPublicEntries(snapshot).map(value => value.id), ["b", "a"]);
  assert.deepEqual(ownerPublicEntries(snapshot, [], " APPLE ").map(value => value.id), ["a"]);
  assert.deepEqual(ownerPublicEntries(snapshot, [], "梨").map(value => value.id), ["b"]);
  assert.deepEqual(ownerPublicEntries(snapshot, [], "不存在"), []);
});

test("the merge helper itself retains more than twenty confirmed cards missing from an older GET", () => {
  const confirmations = Array.from({ length: 30 }, (_, index) => ({
    entry: entry(String(index), "term " + index, new Date(Date.UTC(2026, 0, index + 1)).toISOString()), added: true
  }));
  assert.equal(ownerPublicEntries({ entries: [] }, confirmations).length, 30);
  assert.equal(ownerPublicEntries({ entries: [] }, confirmations, "term 0").length, 1);
  for (const snapshot of [
    { entries: [], exportedAt: "2025-12-31T23:59:59Z" },
    { entries: [], exportedAt: "2026-12-31T23:59:59Z", readSource: "deployed-fallback" }
  ]) {
    const reconciled = reconcileOwnerPublicConfirmations(snapshot, confirmations);
    assert.equal(reconciled.length, 30);
    assert.ok(reconciled.every(item => !item.absorbed));
    assert.equal(ownerPublicEntries(snapshot, reconciled).length, 30);
    assert.equal(ownerPublicEntries(snapshot, reconciled, "term 0").length, 1);
  }
});

test("a fallback snapshot cannot absorb pending confirmations or reset prior absorption", () => {
  const confirmed = entry("a", "apple", "2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z", "API确认释义");
  const confirmations = [
    { entry: confirmed, added: true, absorbed: false },
    { entry: { ...confirmed, id: "b", term: "pear" }, added: false, absorbed: true }
  ];
  const before = structuredClone(confirmations);
  for (const entries of [[], [{ ...confirmed, updatedAt: "2026-01-05T00:00:00Z", meaning: "备用释义" }]]) {
    const snapshot = { entries, exportedAt: "2026-01-10T00:00:00Z", readSource: "deployed-fallback" };
    const reconciled = reconcileOwnerPublicConfirmations(snapshot, confirmations);
    assert.deepEqual(reconciled, before);
    assert.deepEqual(confirmations, before);
  }
});

test("an older canonical copy does not absorb a newer API confirmation", () => {
  const confirmed = entry("a", "apple", "2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z", "API确认释义");
  const snapshot = { entries: [{ ...confirmed, updatedAt: "2026-01-02T23:59:59Z", meaning: "旧释义" }], exportedAt: "2026-01-10T00:00:00Z" };
  const reconciled = reconcileOwnerPublicConfirmations(snapshot, [{ entry: confirmed, added: true, absorbed: false }]);
  assert.equal(reconciled[0].absorbed, false);
  assert.equal(ownerPublicEntries(snapshot, reconciled)[0].meaning, confirmed.meaning);
});

for (const updatedAt of ["2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z"]) {
  test(`canonical copy at ${updatedAt} absorbs the confirmation and supplies the displayed card`, () => {
    const confirmed = entry("a", "apple", "2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z", "API确认释义");
    const canonical = { ...confirmed, updatedAt, meaning: "权威快照释义" };
    const snapshot = { entries: [canonical], exportedAt: "2026-01-05T00:00:00Z" };
    const confirmations = [{ entry: confirmed, added: false, absorbed: false }];
    const before = structuredClone({ snapshot, confirmations });
    const reconciled = reconcileOwnerPublicConfirmations(snapshot, confirmations);
    assert.equal(reconciled[0].absorbed, true);
    assert.equal(reconciled[0].added, false);
    assert.deepEqual(ownerPublicEntries(snapshot, reconciled), [canonical]);
    assert.deepEqual({ snapshot, confirmations }, before);
  });
}

for (const exportedAt of ["2026-01-02T23:59:59Z", "2026-01-03T00:00:00Z"]) {
  test(`a missing card in a live snapshot at ${exportedAt} is not proof of deletion`, () => {
    const confirmed = entry("a", "apple", "2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z");
    const snapshot = { entries: [], exportedAt };
    const reconciled = reconcileOwnerPublicConfirmations(snapshot, [{ entry: confirmed, added: true, absorbed: false }]);
    assert.equal(reconciled[0].absorbed, false);
    assert.deepEqual(ownerPublicEntries(snapshot, reconciled), [confirmed]);
  });
}

test("a strictly newer live deletion is absorbed and cannot resurrect through an old confirmation", () => {
  const confirmed = entry("a", "apple", "2026-01-01T00:00:00Z", "2026-01-03T00:00:00.000Z");
  const snapshot = { entries: [], exportedAt: "2026-01-03T00:00:00.001Z" };
  const confirmations = [{ entry: confirmed, added: true, absorbed: false }];
  const before = structuredClone(confirmations);
  const reconciled = reconcileOwnerPublicConfirmations(snapshot, confirmations);
  assert.equal(reconciled[0].absorbed, true);
  assert.equal(reconciled[0].added, true);
  assert.deepEqual(ownerPublicEntries(snapshot, reconciled), []);
  assert.deepEqual(ownerPublicEntries(snapshot, reconciled, "apple"), []);
  assert.deepEqual(confirmations, before);
});

test("queue observers receive the validated added flag without credentials or mutation keys", async () => {
  const events = [];
  const publicEntry = createBlankEntry("apple"); publicEntry.meaning = "苹果";
  const queue = createDictionaryCollectionQueue({
    newId: () => "independent-review-operation",
    collect: async () => ({ entry: publicEntry, added: false, sha: "a".repeat(40) }),
    onChange: value => events.push(value)
  });
  assert.equal(await queue.enqueue("apple", { userId: "owner", csrfToken: "not-public-secret", isCurrent: () => true }), true);
  const saved = events.find(value => value.phase === "saved");
  assert.equal(saved.added, false);
  assert.equal(saved.entry.term, "apple");
  assert.doesNotMatch(JSON.stringify(saved), /not-public-secret|mutationId|independent-review-operation/u);
  assert.equal("entry" in queue.snapshot().items[0], false);
});
