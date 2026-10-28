import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { boundedSpellingDistance, normalizeSuggestionQuery, rankSpellingSuggestions, parseSuggestionManifest,
  parseSuggestionShard, suggestDictionaryTerms, resetDictionarySuggestionsForTests } from "../js/dictionary-suggestions.js";

const manifest = JSON.parse(await readFile(new URL("../data/dictionary-suggestions/manifest.json", import.meta.url), "utf8"));
const files = new Map(await Promise.all(manifest.shards.map(async shard => [shard.file,
  await readFile(new URL(`../data/dictionary-suggestions/${shard.file}`, import.meta.url), "utf8")])));
const allRows = [...files.values()].flatMap(body => JSON.parse(body).rows);
const sha = value => createHash("sha256").update(value).digest("hex");
function fixture() {
  const directory = structuredClone(manifest), bodies = new Map(files), requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const name = new URL(url).pathname.split("/dictionary-suggestions/")[1];
    return new Response(name === "manifest.json" ? JSON.stringify(directory) : bodies.get(name), { status: name === "manifest.json" || bodies.has(name) ? 200 : 404 });
  };
  return { directory, bodies, requests, fetchImpl, dictionaryVersion: manifest.dictionaryVersion };
}

test("bounded distance counts neighbouring swaps and matches an independent complete OSA matrix", () => {
  function reference(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
    }
    return matrix[a.length][b.length];
  }
  const words = [""]; for (let length = 1; length <= 4; length++) for (const prefix of words.filter(word => word.length === length - 1)) words.push(prefix + "a", prefix + "b");
  for (const a of words) for (const b of words) for (const maximum of [0, 1, 2]) {
    assert.equal(boundedSpellingDistance(a, b, maximum), Math.min(maximum + 1, reference(a, b)), `${a}/${b}/${maximum}`);
  }
  assert.equal(boundedSpellingDistance("recieve", "receive"), 1);
  assert.equal(boundedSpellingDistance("look afetr", "look after"), 1);
});

test("suggestion input normalization is conservative, including quoted pasted punctuation", async () => {
  for (const input of ['"heppy",', '“HEPPY”。', " ＨＥＰＰＹ "]) assert.equal(normalizeSuggestionQuery(input), "heppy");
  for (const input of ["", "xx", "a", "苹果", "24/7", "<script>", "heppy\u202e", "heppy\u0000", "a".repeat(65), "as df gh jk lm np qr st uv wx yz"]) {
    assert.equal(normalizeSuggestionQuery(input), "", input);
    assert.deepEqual(await suggestDictionaryTerms(input, { fetchImpl: () => { throw new Error("must not fetch"); } }), []);
  }
});

test("source tiers are only a ranking tie-breaker, exact terms never become typo choices", () => {
  assert.deepEqual(rankSpellingSuggestions("heppy", [["hempy", 2], ["happy", 0], ["hippy", 2]])[0], { term: "happy", distance: 1 });
  assert.equal(rankSpellingSuggestions("teh", [["tech", 0], ["the", 0]])[0].term, "the");
  assert.deepEqual(rankSpellingSuggestions("happy", [["happy", 0], ["hippy", 2]]), []);
  assert.deepEqual(rankSpellingSuggestions("zzzzzzzzzzzzzzzz", allRows), []);
  assert.ok(rankSpellingSuggestions("heppy", allRows, { limit: 50 }).length <= 5);
});

test("all actual candidate shards validate and bind exactly to the current dictionary", async () => {
  const primary = JSON.parse(await readFile(new URL("../data/expanded-dictionary/manifest.json", import.meta.url), "utf8"));
  assert.equal(parseSuggestionManifest(manifest, primary.version).counts.canonicalHeads, primary.counts.records);
  let total = 0;
  for (const descriptor of manifest.shards) {
    const body = files.get(descriptor.file);
    assert.equal(Buffer.byteLength(body), descriptor.bytes); assert.equal(sha(body), descriptor.sha256);
    total += parseSuggestionShard(JSON.parse(body), descriptor).length;
  }
  assert.equal(total, manifest.counts.eligibleHeads);
  for (const mutate of [m => { m.dictionaryVersion = "a".repeat(64); }, m => { m.counts.eligibleHeads++; },
    m => { m.shards[0].file = "../secret.json"; }, m => { m.private = {}; }, m => { m.shards[0].bytes = 2 ** 30; }]) {
    const malformed = structuredClone(manifest); mutate(malformed);
    assert.throws(() => parseSuggestionManifest(malformed, primary.version), error => error.code === "invalid_dictionary_suggestions");
  }
  assert.throws(() => parseSuggestionShard({ schemaVersion: 1, length: 5, rows: [["happy", 0], ["happy", 0]] }, { length: 5, count: 2 }));
  assert.throws(() => parseSuggestionShard({ schemaVersion: 1, length: 5, rows: [["happy", 3]] }, { length: 5, count: 1 }));
});

test("50 real misspellings recover their existing target in the first five without inventing a head", () => {
  const cases = [
    ["heppy", "happy"], ["recieve", "receive"], ["helllo", "hello"], ["teh", "the"], ["hte", "the"],
    ["definately", "definitely"], ["accomodation", "accommodation"], ["seperate", "separate"], ["goverment", "government"],
    ["enviroment", "environment"], ["neccessary", "necessary"], ["becuase", "because"], ["freind", "friend"], ["beleive", "believe"],
    ["acheive", "achieve"], ["tomorow", "tomorrow"], ["buisness", "business"], ["langauge", "language"], ["knowlege", "knowledge"],
    ["libray", "library"], ["schol", "school"], ["stduent", "student"], ["teahcer", "teacher"], ["univesity", "university"],
    ["exmaple", "example"], ["famliy", "family"], ["beatiful", "beautiful"], ["diferent", "different"], ["diffrent", "different"],
    ["interesing", "interesting"], ["importnat", "important"], ["possable", "possible"], ["probelm", "problem"], ["questoin", "question"],
    ["answr", "answer"], ["remeber", "remember"], ["togther", "together"], ["somehting", "something"], ["everyhting", "everything"],
    ["worng", "wrong"], ["prcatice", "practice"], ["dissapoint", "disappoint"], ["occurence", "occurrence"], ["embarass", "embarrass"],
    ["priviledge", "privilege"], ["maintainance", "maintenance"], ["pronounciation", "pronunciation"], ["succesful", "successful"],
    ["look afetr", "look after"], ["safety orcle", "safety oracle"]
  ];
  for (const [input, target] of cases) {
    const ranked = rankSpellingSuggestions(input, allRows);
    assert.ok(ranked.some(row => row.term === target), `${input}: ${JSON.stringify(ranked)}`);
  }
});

test("runtime reads only relevant lengths, reuses warm data, and never transmits query or credentials", async () => {
  const data = fixture();
  assert.equal((await suggestDictionaryTerms("heppy", data))[0].term, "happy");
  assert.equal(data.requests.length, 4); // manifest + lengths4,5,6, not the entire dictionary
  const calls = data.requests.length;
  assert.equal((await suggestDictionaryTerms("helllo", data))[0].term, "hello");
  assert.ok(data.requests.length <= calls + 2);
  await suggestDictionaryTerms("heppy", data); assert.ok(data.requests.length <= calls + 2);
  for (const { url, options } of data.requests) {
    assert.doesNotMatch(url, /heppy|helllo|q=|query=|api\/|openai|anthropic/iu);
    assert.equal(options.credentials, "omit");
  }
});

test("version mismatch and corrupted optional bytes fail closed but next retry repairs the shard", async () => {
  const mismatch = fixture(); mismatch.dictionaryVersion = "a".repeat(64);
  await assert.rejects(suggestDictionaryTerms("heppy", mismatch), error => error.code === "invalid_dictionary_suggestions");
  const data = fixture(), descriptor = manifest.shards.find(row => row.length === 5);
  data.bodies.set(descriptor.file, data.bodies.get(descriptor.file).replace('"happy"', '"heppy"'));
  await assert.rejects(suggestDictionaryTerms("heppy", data), error => error.code === "invalid_dictionary_suggestions");
  data.bodies.set(descriptor.file, files.get(descriptor.file));
  assert.equal((await suggestDictionaryTerms("heppy", data))[0].term, "happy");
  assert.equal(data.requests.filter(row => row.url.endsWith(descriptor.file)).at(-1).options.cache, "reload");
});

test("one cancelled caller cannot abort another caller sharing the public manifest", async () => {
  const data = fixture(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const fetchImpl = async (...args) => { await gate; return data.fetchImpl(...args); };
  const controller = new AbortController();
  const first = suggestDictionaryTerms("heppy", { ...data, fetchImpl, signal: controller.signal });
  const second = suggestDictionaryTerms("heppy", { ...data, fetchImpl });
  controller.abort(); await assert.rejects(first, error => error.name === "AbortError");
  release(); assert.equal((await second)[0].term, "happy");
  assert.equal(data.requests.filter(row => row.url.endsWith("manifest.json")).length, 1);
});

test("hanging headers or bodies have a bounded optional deadline and are retryable", async () => {
  const dictionaryVersion = manifest.dictionaryVersion;
  for (const fetchImpl of [() => new Promise(() => {}), async () => ({ ok: true, text: () => new Promise(() => {}) })]) {
    await assert.rejects(suggestDictionaryTerms("heppy", { dictionaryVersion, timeoutMs: 5, fetchImpl }), error => error.code === "dictionary_suggestions_timeout");
  }
  resetDictionarySuggestionsForTests();
  assert.equal((await suggestDictionaryTerms("heppy", fixture()))[0].term, "happy");
});

function smallFixture() {
  const version = "a".repeat(64), dictionaryVersion = "b".repeat(64), bodies = new Map();
  const shards = Array.from({ length: 63 }, (_, index) => {
    const length = index + 2, rows = length === 5 ? [["happy", 0], ["hippy", 2], ["hoppy", 2]] : [];
    const body = JSON.stringify({ schemaVersion: 1, length, rows }), file = `${version}/length-${String(length).padStart(2, "0")}.json`;
    bodies.set(file, body); return { length, file, sha256: sha(body), bytes: Buffer.byteLength(body), count: rows.length };
  });
  const directory = { schemaVersion: 1, dictionaryVersion, version,
    counts: { canonicalHeads: 3, eligibleHeads: 3, excludedHeads: 0 }, minLength: 2, maxLength: 64, shards };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const name = new URL(url).pathname.split("/dictionary-suggestions/")[1];
    return new Response(name === "manifest.json" ? JSON.stringify(directory) : bodies.get(name));
  };
  return { dictionaryVersion, fetchImpl, requests };
}
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("individually healthy manifest and shard waits do not lose a candidate to an expired whole-pipeline timer", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => { t.mock.timers.reset(); resetDictionarySuggestionsForTests(); });
  const data = smallFixture(), manifestSeen = gate(), shardsSeen = gate(), manifestGate = gate(), shardGate = gate(); let shardCount = 0;
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith("manifest.json")) { manifestSeen.resolve(); await manifestGate.promise; }
    else { if (++shardCount === 3) shardsSeen.resolve(); await shardGate.promise; }
    return data.fetchImpl(url, options);
  };
  const observed = suggestDictionaryTerms("heppy", { dictionaryVersion: data.dictionaryVersion, fetchImpl, timeoutMs: 100 })
    .then(value => ({ value }), error => ({ error }));
  await manifestSeen.promise; t.mock.timers.tick(80); manifestGate.resolve();
  await shardsSeen.promise; t.mock.timers.tick(80); shardGate.resolve();
  const result = await observed;
  assert.ifError(result.error); assert.equal(result.value[0].term, "happy");
  assert.equal(data.requests.length, 4);
});

test("a short caller's resource deadline does not abort a longer caller sharing the same download", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => { t.mock.timers.reset(); resetDictionarySuggestionsForTests(); });
  const data = smallFixture(), seen = gate(), manifestGate = gate(); let downloadSignal;
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith("manifest.json")) { downloadSignal = options.signal; seen.resolve(); await manifestGate.promise; }
    return data.fetchImpl(url, options);
  };
  const longer = suggestDictionaryTerms("heppy", { dictionaryVersion: data.dictionaryVersion, fetchImpl, timeoutMs: 100 });
  await seen.promise;
  const shorter = suggestDictionaryTerms("heppy", { dictionaryVersion: data.dictionaryVersion, fetchImpl, timeoutMs: 10 })
    .then(value => ({ value }), error => ({ error }));
  t.mock.timers.tick(11); const early = await shorter;
  assert.equal(early.error?.code, "dictionary_suggestions_timeout"); assert.equal(downloadSignal.aborted, false);
  manifestGate.resolve(); assert.equal((await longer)[0].term, "happy");
  assert.equal(data.requests.filter(item => item.url.endsWith("manifest.json")).length, 1);
});

test("a short first caller does not impose its wait budget on a later longer caller", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => { t.mock.timers.reset(); resetDictionarySuggestionsForTests(); });
  const data = smallFixture(), seen = gate(), manifestGate = gate(); let downloadSignal;
  const fetchImpl = async (url, options) => {
    if (String(url).endsWith("manifest.json")) { downloadSignal = options.signal; seen.resolve(); await manifestGate.promise; }
    return data.fetchImpl(url, options);
  };
  const shorter = suggestDictionaryTerms("heppy", { dictionaryVersion: data.dictionaryVersion, fetchImpl, timeoutMs: 10 })
    .then(value => ({ value }), error => ({ error }));
  await seen.promise;
  const longer = suggestDictionaryTerms("heppy", { dictionaryVersion: data.dictionaryVersion, fetchImpl, timeoutMs: 100 });
  t.mock.timers.tick(11); const early = await shorter;
  assert.equal(early.error?.code, "dictionary_suggestions_timeout"); assert.equal(downloadSignal.aborted, false);
  t.mock.timers.tick(25); manifestGate.resolve(); assert.equal((await longer)[0].term, "happy");
  assert.equal(data.requests.filter(item => item.url.endsWith("manifest.json")).length, 1);
});
