import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEntrySort, sortWordbookEntries } from "../js/entry-sort.js";

const entries = Object.freeze([
  Object.freeze({ id: "old", term: "zebra", createdAt: "2020-01-01T00:00:00Z", updatedAt: "2030-01-01T00:00:00Z" }),
  Object.freeze({ id: "new", term: "apple", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }),
  Object.freeze({ id: "tie", term: "Banana", createdAt: "2026-01-01T08:00:00+08:00" }),
  Object.freeze({ id: "legacy", term: "cherry", updatedAt: "2035-01-01T00:00:00Z" })
]);
const ids = value => value.map(entry => entry.id);

test("sort modes accept only the explicit allowlist", () => {
  for (const value of [null, undefined, "toString", "__proto__", "date", "NEWEST", {}, 0]) assert.equal(normalizeEntrySort(value), "newest");
  assert.equal(normalizeEntrySort("oldest"), "oldest");
  assert.equal(normalizeEntrySort("bad", "source"), "source");
  assert.equal(normalizeEntrySort("bad", "bad"), "newest");
});
test("newest uses original creation time and keeps equal timestamps stable", () => {
  assert.deepEqual(ids(sortWordbookEntries(entries)), ["new", "tie", "old", "legacy"]);
});
test("oldest keeps missing and malformed creation dates last rather than using last edit", () => {
  assert.deepEqual(ids(sortWordbookEntries([...entries, { id: "bad", createdAt: "not-a-date" }], "oldest")), ["old", "new", "tie", "legacy", "bad"]);
});
test("alphabetical modes are case insensitive and reverse direction", () => {
  assert.deepEqual(ids(sortWordbookEntries(entries, "az")), ["new", "tie", "legacy", "old"]);
  assert.deepEqual(ids(sortWordbookEntries(entries, "za")), ["old", "legacy", "tie", "new"]);
});
test("alphabetical display normalizes full-width text and uses natural numbers", () => {
  const words = [{ term: "word10" }, { term: "ＷＯＲＤ２" }, { term: "apple" }, { term: "Apple" }];
  assert.deepEqual(sortWordbookEntries(words, "az"), [words[2], words[3], words[1], words[0]]);
});
test("source mode returns a separate array and every mode preserves stored objects and source order", () => {
  assert.notEqual(sortWordbookEntries(entries, "source"), entries);
  for (const sort of ["source", "newest", "oldest", "az", "za"]) {
    const sorted = sortWordbookEntries(entries, sort);
    assert.equal(sorted.length, entries.length);
    assert.ok(sorted.every(entry => entries.includes(entry)));
  }
  assert.deepEqual(ids(entries), ["old", "new", "tie", "legacy"]);
});
test("empty and single-entry lists are supported", () => {
  assert.deepEqual(sortWordbookEntries([]), []);
  assert.deepEqual(sortWordbookEntries([entries[0]], "za"), [entries[0]]);
});
