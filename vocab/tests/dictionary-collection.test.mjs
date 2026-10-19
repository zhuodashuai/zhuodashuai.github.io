import test from "node:test";
import assert from "node:assert/strict";
import { automaticDictionaryCollection, createDictionaryCollector } from "../js/dictionary-collection.js";
import { createBlankEntry, validateEnglishInput } from "../js/wordbook-schema.js?v=77";

const result = (term = "apple", extra = {}) => ({ term, meaning: "苹果", ...extra });
const response = (...results) => ({ results, hasMore: false });
function confirmed(term = "apple", added = true) {
  const entry = createBlankEntry(term); entry.meaning = "苹果"; entry.organizationMethod = "local-dictionary";
  return { entry, added, sha: "a".repeat(40) };
}
const options = { userId: "owner", csrfToken: "csrf", isCurrent: () => true };

test("only one exact English head automatically collects; Chinese, multiple results and matched forms require selection", () => {
  assert.equal(automaticDictionaryCollection("APPLE!", response(result())), true);
  assert.equal(automaticDictionaryCollection("24/7", response(result("24/7"))), true);
  assert.equal(automaticDictionaryCollection("苹果", response(result())), false);
  assert.equal(automaticDictionaryCollection("apples", response(result("apple", { matchedForm: "apples" }))), false);
  assert.equal(automaticDictionaryCollection("apple", response(result(), result("crabapple"))), false);
  assert.equal(automaticDictionaryCollection("apple", { ...response(result()), hasMore: true }), false);
});

test("a failed collection retains its idempotency key and sends no definitions or account content", async () => {
  const calls = [], states = []; let fail = true;
  const collector = createDictionaryCollector({ newId: () => "collection-operation-one", onChange: value => states.push(value), collect: async (body, request) => {
    calls.push([body, request]); if (fail) throw new Error("offline"); return confirmed();
  } });
  assert.equal(await collector.save("apple", options), false); fail = false;
  assert.equal(await collector.save("apple", options), true);
  assert.deepEqual(calls.map(([body]) => body), [{ term: "apple", mutationId: "collection-operation-one" }, { term: "apple", mutationId: "collection-operation-one" }]);
  assert.ok(calls[0][1].signal instanceof AbortSignal); assert.equal(calls[0][1].csrfToken, "csrf");
  assert.equal(states.at(-1).phase, "saved"); assert.match(states.at(-1).message, /公开词库/u);
});

test("query changes, cancellation and account changes ignore late success even if the transport ignores abort", async () => {
  for (const mode of ["cancel", "account"]) {
    let release, current = true; const states = [];
    const collector = createDictionaryCollector({ collect: () => new Promise(resolve => { release = resolve; }), onChange: value => states.push(value) });
    const pending = collector.save("apple", { ...options, isCurrent: () => current });
    if (mode === "cancel") collector.cancel(); else current = false;
    release(confirmed()); assert.equal(await pending, false); assert.equal(states.at(-1).phase, "saving");
  }
});

test("malformed or mismatched server confirmation cannot show a public success link", async () => {
  for (const value of [confirmed("pear"), { ...confirmed(), added: "yes" }, { ...confirmed(), sha: "bad" }]) {
    const states = []; const collector = createDictionaryCollector({ collect: async () => value, onChange: value => states.push(value) });
    assert.equal(await collector.save("apple", options), false); assert.equal(states.at(-1).phase, "error");
  }
  assert.equal(validateEnglishInput("24/7"), "24/7"); assert.throws(() => validateEnglishInput("1234"));
});

test("an existing entry returned for its established correction alias confirms collection without requiring an overwrite", async () => {
  const value = confirmed("apple", false);
  value.entry.correction = { status: "accepted", original: "aple", suggestion: "apple", chosen: "apple", confidence: 1, source: "manual" };
  const states = [], collector = createDictionaryCollector({ collect: async () => value, onChange: state => states.push(state) });
  assert.equal(await collector.save("aple", options), true);
  assert.match(states.at(-1).message, /原有内容已保留/u);
});
