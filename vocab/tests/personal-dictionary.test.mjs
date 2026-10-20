import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCoreDictionary } from "../js/core-dictionary.js?v=77";
import { lookupPersonalDictionary, searchPersonalDictionaryChinese, personalDictionaryResult, parsePersonalDictionary, preloadPersonalDictionary,
  resetPersonalDictionaryCacheForTests as resetCoreDictionaryCacheForTests } from "../js/personal-dictionary.js";

const payload = JSON.parse(await readFile(new URL("../data/ecdict-core.json", import.meta.url), "utf8"));
const dictionary = parseCoreDictionary(payload);
const memberPayload = JSON.parse(await readFile(new URL("../data/member-dictionary.json", import.meta.url), "utf8"));
const memberDictionary = parsePersonalDictionary(memberPayload);

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

test("all 7502 packaged rows either retain Chinese or are explicitly rejected as unusable", async () => {
  assert.equal(dictionary.entries.size, 7502);
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
  const fetchImpl = async (url, options) => { requests.push([String(url), options]); return { ok: true, json: async () => memberPayload }; };
  assert.equal((await lookupPersonalDictionary("hip", { fetchImpl })).term, "hip");
  assert.equal((await lookupPersonalDictionary("apple", { fetchImpl })).term, "apple");
  assert.equal(requests.length, 1);
  assert.match(requests[0][0], /\/data\/member-dictionary\.json\?v=[a-f0-9]{64}$/u);
  assert.doesNotMatch(requests[0][0], /api\/|hip|apple|openai|anthropic|mymemory|languagetool/u);
  assert.equal(requests[0][1].credentials, "omit");
  resetCoreDictionaryCacheForTests();
});

test("failed data downloads can retry and never fall back to a provider", async () => {
  resetCoreDictionaryCacheForTests(); let calls = 0;
  await assert.rejects(lookupPersonalDictionary("hip", { fetchImpl: async () => { calls++; return { ok: false, status: 503 }; } }));
  assert.equal(calls, 1);
  const result = await lookupPersonalDictionary("hip", { fetchImpl: async () => { calls++; return { ok: true, json: async () => memberPayload }; } });
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
  const result = await lookupPersonalDictionary("apple", { timeoutMs: 100, fetchImpl: async () => { healthyCalls++; return { ok: true, json: async () => memberPayload }; } });
  assert.equal(healthyCalls, 1); assert.equal(result.term, "apple");
  resetCoreDictionaryCacheForTests();
});

test("headers alone do not complete a hanging dictionary body, and a retry is still possible", async () => {
  resetCoreDictionaryCacheForTests();
  await assert.rejects(lookupPersonalDictionary("hip", { timeoutMs: 5, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) }), /超时/u);
  assert.equal((await lookupPersonalDictionary("record", { fetchImpl: async () => ({ ok: true, json: async () => memberPayload }) })).term, "record");
  resetCoreDictionaryCacheForTests();
});

test("shipped member index finds already-public words and full phrases without an API", async () => {
  for (const query of ["perspicacious", "jab at"]) {
    const result = await lookupPersonalDictionary(query, { dictionary: memberDictionary, fetchImpl: () => { throw new Error("must not fetch"); } });
    assert.equal(result.term, query); assert.equal(result.source, "卓的公开词库");
    assert.match(result.meaning, /\p{Script=Han}/u);
    assert.deepEqual(Object.keys(result).sort(), ["meaning", "partOfSpeech", "source", "term"]);
  }
  for (const query of ["yummy", "palatable"]) {
    const result = await lookupPersonalDictionary(query, { dictionary: memberDictionary });
    assert.equal(result.term, query); assert.equal(result.source, "ECDICT"); assert.equal(result.partOfSpeech, "adjective");
    assert.match(result.meaning, /美味|可口/u);
  }
  for (const query of ["by some fluke", "surveilance", "accomodate", "xyzqnotreal"]) {
    assert.equal(await lookupPersonalDictionary(query, { dictionary: memberDictionary }), null, query);
  }
});

test("general core senses and parts of speech are not replaced by narrower chapter glosses", async () => {
  for (const [query, expectedPOS] of [["nurse", "noun · verb"], ["cross", "noun · adjective · verb"], ["acoustic", "adjective"]]) {
    const result = await lookupPersonalDictionary(query, { dictionary: memberDictionary });
    assert.deepEqual(result, await lookupPersonalDictionary(query, { dictionary }));
    assert.equal(result.source, "ECDICT"); assert.equal(result.partOfSpeech, expectedPOS);
  }
  assert.match((await lookupPersonalDictionary("nurse", { dictionary: memberDictionary })).meaning, /护士/u);
  assert.match((await lookupPersonalDictionary("cross", { dictionary: memberDictionary })).meaning, /十字架/u);
  assert.doesNotMatch((await lookupPersonalDictionary("acoustic", { dictionary: memberDictionary })).meaning, /听力辅助药物|听觉疗法/u);
});

test("known unique forms work while exact canonical headwords retain priority", async () => {
  for (const [query, expected] of [["went", "go"], ["apples", "apple"], ["received", "receive"], ["carers", "carer"], ["tucked", "tuck"]]) {
    const result = await lookupPersonalDictionary(query, { dictionary: memberDictionary });
    assert.equal(result.term, expected); assert.equal(result.matchedForm, query);
  }
  const found = await lookupPersonalDictionary("found", { dictionary: memberDictionary });
  assert.equal(found.term, "found"); assert.equal(found.matchedForm, undefined);
  assert.equal((await lookupPersonalDictionary("Mar.", { dictionary: memberDictionary })).term, "Mar.");
  assert.equal((await lookupPersonalDictionary("mar", { dictionary: memberDictionary })).term, "mar");
  assert.equal((await lookupPersonalDictionary("24/7", { dictionary: memberDictionary })).term, "24/7");
});

function smallIndex({ core = [], published = [] } = {}) {
  return { schemaVersion: 1, source: structuredClone(memberPayload.source),
    counts: { coreInput: core.length, core: core.length, published: published.length,
      omittedWithoutChinese: 0, publicAliases: published.reduce((n, row) => n + row[3].length, 0),
      publishedInput: published.length, publicAliasesInput: published.reduce((n, row) => n + row[3].length, 0),
      omittedPublishedEntries: 0, omittedPublicAliases: 0 }, core, published };
}

test("multiple form heads or chapter meanings fail closed; an exact head still wins", async () => {
  const source = smallIndex({ core: [["axe", "noun", "n. 斧头", ["axes"]], ["axis", "noun", "n. 轴线", ["axes"]]],
    published: [["drift", "noun", "大意。", [["drifting", "verb", "漂移。"], ["drifting", "adjective", "漂泊不定的。"]]]] });
  const parsed = parsePersonalDictionary(source);
  for (const term of ["axes", "drifting"]) {
    await assert.rejects(lookupPersonalDictionary(term, { dictionary: parsed }), error => error.code === "ambiguous_dictionary_match");
  }
  assert.equal((await lookupPersonalDictionary("drift", { dictionary: parsed })).meaning, "大意。");
  source.core.push(["axes", "noun", "n. 测试用的独立原形", []]); source.counts.core++; source.counts.coreInput++;
  assert.equal((await lookupPersonalDictionary("axes", { dictionary: parsePersonalDictionary(source) })).term, "axes");
});

test("general core gloss wins but original forms retain their single actual context", async () => {
  const parsed = parsePersonalDictionary(smallIndex({ core: [["tuck", "verb", "v. 掖好", ["tucked"]]],
    published: [["tuck", "verb", "隐蔽地放置。", [["tucked", "verb", "藏在不显眼的位置。"]]]] }));
  assert.equal((await lookupPersonalDictionary("tuck", { dictionary: parsed })).meaning, "① v. 掖好");
  assert.equal((await lookupPersonalDictionary("tucked", { dictionary: parsed })).meaning, "藏在不显眼的位置。");
});

test("literal public punctuation headwords win over normalized core keys, not vice versa", async () => {
  const parsed = parsePersonalDictionary(smallIndex({ core: [["mar", "verb", "v. 损坏", []]],
    published: [["Mar.", "abbreviation", "三月。", []]] }));
  const abbreviation = await lookupPersonalDictionary("Mar.", { dictionary: parsed });
  assert.equal(abbreviation.term, "Mar."); assert.equal(abbreviation.source, "卓的公开词库");
  const verb = await lookupPersonalDictionary("mar", { dictionary: parsed });
  assert.equal(verb.term, "mar"); assert.equal(verb.source, "ECDICT");
});

test("warmup shares its only download with immediate Enter queries and retries after failure", async () => {
  resetCoreDictionaryCacheForTests(); let calls = 0; let release;
  const fetchImpl = async () => { calls++; await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => memberPayload }; };
  const warmup = preloadPersonalDictionary({ fetchImpl });
  const query = lookupPersonalDictionary("apple", { fetchImpl });
  release(); await warmup; assert.equal((await query).term, "apple"); assert.equal(calls, 1);
  resetCoreDictionaryCacheForTests();
  await assert.rejects(preloadPersonalDictionary({ fetchImpl: async () => ({ ok: false, status: 503 }) }));
  assert.equal((await lookupPersonalDictionary("hip", { fetchImpl: async () => ({ ok: true, json: async () => memberPayload }) })).term, "hip");
  resetCoreDictionaryCacheForTests();
});

test("one cancelled caller does not stop the shared public warmup or another query", async () => {
  resetCoreDictionaryCacheForTests(); const controller = new AbortController(); let release;
  const fetchImpl = async () => { await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => memberPayload }; };
  const warmup = preloadPersonalDictionary({ fetchImpl });
  const first = lookupPersonalDictionary("hip", { signal: controller.signal, fetchImpl });
  const next = lookupPersonalDictionary("apple", { fetchImpl });
  controller.abort(); await assert.rejects(first, /停止/u); release(); await warmup;
  assert.equal((await next).term, "apple"); resetCoreDictionaryCacheForTests();
});

test("index rejects unknown/private fields, oversized glosses, duplicates and wrong counts", () => {
  const source = smallIndex({ core: [["apple", "noun", "n. 苹果", []]] });
  for (const mutate of [value => { value.privateWords = []; }, value => { value.core[0][2] = "中".repeat(2001); },
    value => { value.counts.core++; }, value => { value.core.push(value.core[0]); value.counts.core++; value.counts.coreInput++; },
    value => { value.source.core.license = "unknown"; }]) {
    const modified = structuredClone(source); mutate(modified); assert.throws(() => parsePersonalDictionary(modified));
  }
});

test("Chinese reverse reuses validated public maps and retains the actual matching source, without duplicates", async () => {
  const parsed = parsePersonalDictionary(smallIndex({ core: [["apple", "noun", "n. 苹果", []], ["cross", "noun", "n. 十字架", []]],
    published: [["apple", "noun", "苹果的章节释义。", []], ["cross", "adjective", "生气的。", []]] }));
  const apple = await searchPersonalDictionaryChinese("“苹果”", { dictionary: parsed });
  assert.equal(apple.coverage, "basic"); assert.equal(apple.results.length, 1); assert.equal(apple.results[0].source, "ECDICT");
  const contextual = await searchPersonalDictionaryChinese("生气", { dictionary: parsed });
  assert.equal(contextual.results[0].term, "cross"); assert.equal(contextual.results[0].source, "卓的公开词库"); assert.equal(contextual.results[0].meaning, "生气的。");
  const first = await searchPersonalDictionaryChinese("苹果", { dictionary: memberDictionary, limit: 1 });
  assert.equal(first.results.length, 1); assert.match(first.results[0].meaning, /苹果/u); assert.equal(first.hasMore, true);
});

test("Chinese reverse shares the sole warmup download and one aborted search never stops another caller", async () => {
  resetCoreDictionaryCacheForTests(); let release, calls = 0;
  const fetchImpl = async () => { calls++; await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => memberPayload }; };
  const warm = preloadPersonalDictionary({ fetchImpl }), controller = new AbortController();
  const aborted = searchPersonalDictionaryChinese("苹果", { fetchImpl, signal: controller.signal });
  const healthy = searchPersonalDictionaryChinese("苹果", { fetchImpl });
  controller.abort(); await assert.rejects(aborted, /停止/u); release(); await warm;
  assert.ok((await healthy).results.length); assert.equal(calls, 1); resetCoreDictionaryCacheForTests();
});

test("compact professional reverse lookup uses the same noun and medical evidence rules as full search", async () => {
  const parsed = parsePersonalDictionary(smallIndex({ core: [
    ["doctor", "noun", "n. 医生, 博士", []], ["physician", "noun", "n. 医师", []],
    ["medical", "adjective", "n. 医生\na. 医学的", []], ["healer", "noun", "n. 医生, 治疗物", []],
    ["appointment", "noun", "预约；常指看医生的会面。", []], ["nurse", "noun", "n. 护士", []],
    ["teacher", "noun", "n. 教师, 老师", []], ["pedagogical", "adjective", "a. 教师的, 教学法的", []],
  ] }));
  assert.deepEqual((await searchPersonalDictionaryChinese("医生", { dictionary: parsed })).results.map(row => row.term), ["doctor"]);
  assert.deepEqual((await searchPersonalDictionaryChinese("医师", { dictionary: parsed })).results.map(row => row.term), ["physician"]);
  assert.deepEqual((await searchPersonalDictionaryChinese("教师", { dictionary: parsed })).results.map(row => row.term), ["teacher"]);
  assert.deepEqual((await searchPersonalDictionaryChinese("大夫", { dictionary: parsed })).results, []);
  // Direct English lookup still shows the source row, not a rewritten dictionary.
  assert.ok((await lookupPersonalDictionary("medical", { dictionary: parsed })).meaning.includes("医生"));
});

test("Chinese reverse rejects invalid queries before any download", async () => {
  for (const input of ["", "apple", "苹<script>", "中".repeat(51), "中\u0000文"]) {
    await assert.rejects(searchPersonalDictionaryChinese(input, { fetchImpl: () => { throw new Error("must not fetch"); } }));
  }
});
