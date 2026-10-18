import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCoreDictionary, resetCoreDictionaryCacheForTests } from "../js/core-dictionary.js?v=77";
import { lookupPersonalDictionary, personalDictionaryResult } from "../js/personal-dictionary.js";

const payload = JSON.parse(await readFile(new URL("../data/ecdict-core.json", import.meta.url), "utf8"));
const dictionary = parseCoreDictionary(payload);

test("hip keeps both noun and adjective rather than trusting the first-POS metadata", async () => {
  const result = await lookupPersonalDictionary("ＨＩＰ,", { dictionary });
  assert.equal(result.term, "hip"); assert.equal(result.partOfSpeech, "noun · adjective");
  assert.equal(result.meaning, "① n. 髋部；臀部\n② adj. 时髦的；消息灵通的");
  assert.equal(result.source, "ECDICT");
});

test("record retains transitive/intransitive labels, with all three primary parts of speech", async () => {
  const result = await lookupPersonalDictionary('"record"', { dictionary });
  assert.equal(result.partOfSpeech, "noun · verb · adjective");
  assert.match(result.meaning, /② vt\./u); assert.match(result.meaning, /③ vi\./u); assert.match(result.meaning, /④ adj\./u);
});

test("specialist continuation notes are not invented as another common noun sense", async () => {
  const result = await lookupPersonalDictionary("surveillance", { dictionary });
  assert.equal(result.partOfSpeech, "noun");
  assert.equal(result.meaning, "① n. 监视, 监督\n   [电] 侦测");
  assert.doesNotMatch(result.meaning, /②/u);
});

test("missing phrases and misspellings are honest misses without calling a provider", async () => {
  for (const word of ["by some fluke", "jab at", "accomodate", "xyzzy_nonexistent_2026"]) {
    assert.equal(await lookupPersonalDictionary(word, { dictionary, fetchImpl: () => { throw new Error("must not fetch"); } }), null);
  }
});

test("all 7500 packaged rows either retain Chinese or are explicitly rejected as unusable", async () => {
  assert.equal(dictionary.entries.size, 7500);
  for (const row of dictionary.entries.values()) {
    const result = personalDictionaryResult(row);
    if (!/\p{Script=Han}/u.test(row.meaning)) { assert.equal(result, null, row.word); continue; }
    assert.ok(result, row.word); assert.equal(result.term, row.word);
    assert.match(result.meaning, /\p{Script=Han}/u, row.word);
    assert.ok([...result.meaning].length <= 2000, row.word);
    assert.ok([...result.partOfSpeech].length <= 200, row.word);
    assert.doesNotMatch(result.meaning, /MYMEMORY WARNING|kamus在线/u);
  }
});

test("invalid/Chinese/oversized input cannot trigger a dictionary download", async () => {
  for (const value of ["", "中文", "a".repeat(201), null]) {
    await assert.rejects(lookupPersonalDictionary(value, { fetchImpl: () => { throw new Error("must not fetch"); } }));
  }
});

test("only one static first-party data download occurs, without cookies or the search term", async () => {
  resetCoreDictionaryCacheForTests();
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push([String(url), options]); return { ok: true, json: async () => payload }; };
  assert.equal((await lookupPersonalDictionary("hip", { fetchImpl })).term, "hip");
  assert.equal((await lookupPersonalDictionary("apple", { fetchImpl })).term, "apple");
  assert.equal(requests.length, 1);
  assert.match(requests[0][0], /\/data\/ecdict-core\.json$/u);
  assert.doesNotMatch(requests[0][0], /[?]|api\/|hip|apple|openai|anthropic|mymemory|languagetool/u);
  assert.equal(requests[0][1].credentials, "omit");
  resetCoreDictionaryCacheForTests();
});

test("failed data downloads can retry and never fall back to a provider", async () => {
  resetCoreDictionaryCacheForTests(); let calls = 0;
  await assert.rejects(lookupPersonalDictionary("hip", { fetchImpl: async () => { calls++; return { ok: false, status: 503 }; } }));
  assert.equal(calls, 1);
  const result = await lookupPersonalDictionary("hip", { fetchImpl: async () => { calls++; return { ok: true, json: async () => payload }; } });
  assert.equal(calls, 2); assert.equal(result.term, "hip"); resetCoreDictionaryCacheForTests();
});

test("an interrupted or timed-out lookup cannot keep waiting on a hanging dictionary", async () => {
  resetCoreDictionaryCacheForTests();
  const controller = new AbortController();
  const pending = lookupPersonalDictionary("hip", { signal: controller.signal, fetchImpl: () => new Promise(() => {}) });
  controller.abort(); await assert.rejects(pending, /停止/u);
  resetCoreDictionaryCacheForTests();
  await assert.rejects(lookupPersonalDictionary("hip", { timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }), /超时/u);
  resetCoreDictionaryCacheForTests();
});

test("a timed-out shared download resets itself so the very next healthy retry works without cache reset", async () => {
  resetCoreDictionaryCacheForTests(); let healthyCalls = 0;
  await assert.rejects(lookupPersonalDictionary("hip", { timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }), /超时/u);
  const result = await lookupPersonalDictionary("apple", { timeoutMs: 100, fetchImpl: async () => { healthyCalls++; return { ok: true, json: async () => payload }; } });
  assert.equal(healthyCalls, 1); assert.equal(result.term, "apple");
  resetCoreDictionaryCacheForTests();
});

test("headers alone do not complete a hanging dictionary body, and a retry is still possible", async () => {
  resetCoreDictionaryCacheForTests();
  await assert.rejects(lookupPersonalDictionary("hip", { timeoutMs: 5, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) }), /超时/u);
  assert.equal((await lookupPersonalDictionary("record", { fetchImpl: async () => ({ ok: true, json: async () => payload }) })).term, "record");
  resetCoreDictionaryCacheForTests();
});
