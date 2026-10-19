import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { searchExpandedDictionary, preloadExpandedDictionary, resetExpandedDictionaryCacheForTests } from "../js/expanded-dictionary.js";

const fold = value => value.normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().toLowerCase();
function bucket(value) { let hash = 2166136261; for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; } return hash % 128; }
const sha = value => createHash("sha256").update(value).digest("hex");
const sources = {
  "pos-reviewed": { name: "原有释义＋词性校订", license: "Original meaning licences; see POS notice", url: "https://zhuodashuai.github.io/vocab/dictionary-pos.html" },
  mit: { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT", commit: "a".repeat(40) },
  core: { name: "ECDICT 核心校订", license: "MIT", url: "https://github.com/skywind3000/ECDICT" },
  public: { name: "卓的公开词库", license: "Public wordbook", url: "https://zhuodashuai.github.io/vocab/" },
  original: { name: "卓式原创词典", license: "Original composition", url: "https://zhuodashuai.github.io/vocab/" }
};
const entry = (term, meaning, extra = {}) => ({ term, partOfSpeech: "noun", meaning, forms: [], source: "mit", ...extra });
function fixture(entries = [entry("hip", "① n. 髋部；臀部\n② adj. 时髦的；消息灵通的", { partOfSpeech: "noun · adjective", forms: ["hips"] })], contexts = []) {
  const version = sha(JSON.stringify(entries) + JSON.stringify(contexts));
  const en = Array.from({ length: 128 }, (_, index) => ({ schemaVersion: 2, kind: "en", bucket: index, records: [], keys: [] }));
  const zh = Array.from({ length: 128 }, (_, index) => ({ schemaVersion: 2, kind: "zh", bucket: index, postings: [] }));
  const keyMaps = en.map(() => new Map()), postingMaps = zh.map(() => new Map());
  const rows = entries.map((item, rank) => ({ id: rank * 128 + bucket(fold(item.term)), ...structuredClone(item) }));
  const addKey = (key, ref, row) => {
    key = fold(key); const index = bucket(key), refs = keyMaps[index].get(key) || [];
    refs.push(ref); keyMaps[index].set(key, refs);
    if (!en[index].records.some(item => item.id === row.id)) en[index].records.push(row);
  };
  for (const row of rows) {
    addKey(row.term, { id: row.id, kind: "canonical" }, row);
    for (const form of row.forms) addKey(form, { id: row.id, kind: "form", term: form }, row);
    const tokens = new Set();
    for (const value of [row, ...(row.variants || [])]) {
      for (const run of value.meaning.match(/\p{Script=Han}+/gu) || []) {
        const chars = [...run]; for (let index = 0; index < chars.length; index++) {
          tokens.add(chars[index]); if (index) tokens.add(chars[index - 1] + chars[index]);
        }
      }
    }
    for (const token of tokens) { const map = postingMaps[bucket(token)], ids = map.get(token) || []; ids.push(row.id); map.set(token, ids); }
  }
  for (const context of contexts) {
    const row = rows.find(item => item.term === context.target);
    addKey(context.term, { id: row.id, kind: "context", term: context.term, partOfSpeech: context.partOfSpeech || row.partOfSpeech, meaning: context.meaning }, row);
  }
  en.forEach((payload, index) => { payload.records.sort((a, b) => a.id - b.id); payload.keys = [...keyMaps[index]].sort(([a], [b]) => a.localeCompare(b)); });
  zh.forEach((payload, index) => { payload.postings = [...postingMaps[index]].sort(([a], [b]) => a.localeCompare(b)); payload.postings.forEach(item => item[1].sort((a, b) => a - b)); });
  const files = new Map();
  const descriptors = (payloads, kind) => payloads.map((payload, index) => {
    const file = `${version}/${kind}-${String(index).padStart(3, "0")}.json`, body = JSON.stringify(payload);
    files.set(file, body); return { bucket: index, file, sha256: sha(body), bytes: Buffer.byteLength(body), count: kind === "en" ? payload.keys.length : payload.postings.length };
  });
  const english = { buckets: 128, shards: descriptors(en, "en") }, chinese = { buckets: 128, shards: descriptors(zh, "zh") };
  const manifest = { schemaVersion: 2, version, counts: { records: rows.length,
    englishKeys: english.shards.reduce((n, item) => n + item.count, 0), chineseTokens: chinese.shards.reduce((n, item) => n + item.count, 0) }, sources: structuredClone(sources), english, chinese };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const path = new URL(url).pathname.split("/expanded-dictionary/")[1];
    return path === "manifest.json" ? new Response(JSON.stringify(manifest))
      : files.has(path) ? new Response(files.get(path)) : new Response("missing", { status: 404 });
  };
  function rewrite(kind, index, mutate) {
    const descriptor = manifest[kind === "en" ? "english" : "chinese"].shards[index];
    const payload = JSON.parse(files.get(descriptor.file)); mutate(payload);
    const body = JSON.stringify(payload); files.set(descriptor.file, body); descriptor.bytes = Buffer.byteLength(body); descriptor.sha256 = sha(body);
  }
  return { manifest, en, zh, files, rows, requests, fetchImpl, rewrite };
}

test("exact English cold lookup reads only manifest and one hash-checked small shard, then stays warm", async () => {
  const data = fixture(); const result = await searchExpandedDictionary("ＨＩＰ", data);
  assert.equal(result.query, "hip"); assert.equal(result.results[0].term, "hip");
  assert.equal(result.results[0].partOfSpeech, "noun · adjective");
  assert.match(result.results[0].meaning, /\n② adj\. 时髦的/u);
  assert.equal(result.results[0].license, "MIT"); assert.equal(result.hasMore, false);
  assert.equal(data.requests.length, 2);
  assert.ok(data.requests.every(({ options }) => options.credentials === "omit"));
  assert.ok(data.requests.every(({ url }) => !/hip|api\/|openai|anthropic/iu.test(url)));
  assert.equal(data.requests[0].options.cache, "no-cache"); assert.equal(data.requests[1].options.cache, "force-cache");
  await searchExpandedDictionary("hip", data); assert.equal(data.requests.length, 2);
});

test("preload shares only a manifest with immediate lookup without downloading all shards", async () => {
  const data = fixture(); await Promise.all([preloadExpandedDictionary(data), searchExpandedDictionary("hip", data)]);
  assert.equal(data.requests.filter(item => item.url.endsWith("manifest.json")).length, 1);
  assert.equal(data.requests.length, 2);
});

test("unknown English is an honest empty result, without fuzzy correction or remote AI", async () => {
  const data = fixture(); assert.deepEqual(await searchExpandedDictionary("hippo_unknown", data), { query: "hippo_unknown", results: [], hasMore: false });
  assert.equal(data.requests.length, 2);
});

test("literal punctuation headword is retained and normalized terminal punctuation is a second exact path", async () => {
  const data = fixture([entry("Mar.", "三月", { partOfSpeech: "abbreviation" }), entry("mar", "损坏", { partOfSpeech: "verb" }), entry("hip", "髋部")]);
  assert.equal((await searchExpandedDictionary("Mar.", data)).results[0].partOfSpeech, "abbreviation");
  assert.equal((await searchExpandedDictionary("hip,", data)).results[0].term, "hip");
  assert.equal((await searchExpandedDictionary("mar", data)).results[0].partOfSpeech, "verb");
});

test("exact canonical headword wins over an inflection; true multiple-head aliases never guess", async () => {
  const data = fixture([entry("find", "找到", { forms: ["found"] }), entry("found", "创立"), entry("axe", "斧头", { forms: ["axes"] }), entry("axis", "轴线", { forms: ["axes"] })]);
  assert.equal((await searchExpandedDictionary("found", data)).results[0].term, "found");
  await assert.rejects(searchExpandedDictionary("axes", data), error => error.code === "ambiguous_dictionary_match");
});

test("case-sensitive canonical heads survive folding; ambiguous case is not guessed", async () => {
  const data = fixture([entry("iPhone", "苹果手机"), entry("iphone", "另一条原始词头")]);
  assert.equal((await searchExpandedDictionary("iPhone", data)).results[0].term, "iPhone");
  assert.equal((await searchExpandedDictionary("iphone", data)).results[0].term, "iphone");
  await assert.rejects(searchExpandedDictionary("IPHONE", data), error => error.code === "ambiguous_dictionary_match");
});

test("unique forms and public chapter aliases keep their declared form and actual context", async () => {
  const data = fixture([entry("tuck", "① vt. 塞进；掖好", { forms: ["tucked"] })], [{ target: "tuck", term: "Tucked", partOfSpeech: "verb", meaning: "藏在不显眼的位置" }]);
  const result = (await searchExpandedDictionary("tucked", data)).results[0];
  assert.equal(result.term, "tuck"); assert.equal(result.matchedForm, "Tucked"); assert.equal(result.source, "卓的公开词库");
  assert.equal(result.meaning, "藏在不显眼的位置"); assert.equal(result.alternatives[0].source, "ECDICT");
});

test("incompatible context meanings fail closed rather than silently picking a chapter", async () => {
  const data = fixture([entry("drift", "漂移", { forms: ["drifting"] })], [
    { target: "drift", term: "drifting", meaning: "漂移" }, { target: "drift", term: "drifting", meaning: "漂泊不定的", partOfSpeech: "adjective" }
  ]);
  await assert.rejects(searchExpandedDictionary("drifting", data), error => error.code === "ambiguous_dictionary_match");
});

test("Chinese picks the source variant actually containing the query, without erasing the full MIT card", async () => {
  const data = fixture([entry("palatable", "① adj. 可口的\n② adj. 可以接受的", { partOfSpeech: "adjective", variants: [
    { partOfSpeech: "adjective", meaning: "① 美味；适口。", source: "original" }
  ] })]);
  const result = (await searchExpandedDictionary("  美味。 ", data)).results[0];
  assert.equal(result.term, "palatable"); assert.equal(result.source, "卓式原创词典"); assert.equal(result.meaning, "① 美味；适口。");
  assert.equal(result.alternatives[0].meaning, "① adj. 可口的\n② adj. 可以接受的");
  assert.equal((await searchExpandedDictionary("palatable", data)).results[0].source, "ECDICT");
});

test("MIT/core raw labelled lines get consistent numbering and full POS without changing source", async () => {
  const data = fixture([entry("hip", "n. 髋部；臀部\nadj. 时髦的；消息灵通的", { source: "core" })]);
  const result = (await searchExpandedDictionary("髋部", data)).results[0];
  assert.equal(result.meaning, "① n. 髋部；臀部\n② adj. 时髦的；消息灵通的");
  assert.equal(result.partOfSpeech, "noun · adjective"); assert.equal(result.source, "ECDICT 核心校订");
  const long = fixture([entry("long", `n. ${"中".repeat(1997)}`)]);
  assert.equal((await searchExpandedDictionary("long", long)).results[0].meaning.length, 2000);
});

test("POS-reviewed labels retain grammar phrases and do not repeat an identical unlabelled source gloss", async () => {
  const data = fixture([entry("as a rule", "通常；一般来说", { source: "pos-reviewed", partOfSpeech: "adverbial phrase", variants: [
    { source: "mit", partOfSpeech: "", meaning: "通常；一般来说" },
    { source: "original", partOfSpeech: "adverbial phrase", meaning: "通常情况下" }
  ] })]);
  const value = (await searchExpandedDictionary("as a rule", data)).results[0];
  assert.equal(value.partOfSpeech, "adverbial phrase");
  assert.equal(value.meaning, "① 通常；一般来说");
  assert.equal(value.source, "原有释义＋词性校订");
  assert.equal(value.alternatives.length, 1);
  assert.equal(value.alternatives[0].source, "卓式原创词典");
  // Reverse lookup must choose the enriched primary, not its blank duplicate.
  assert.equal((await searchExpandedDictionary("一般来说", data)).results[0].partOfSpeech, "adverbial phrase");
});

test("Chinese bigrams intersect then actual substrings reject cross-variant false positives", async () => {
  const data = fixture([entry("false", "甲乙", { variants: [{ partOfSpeech: "noun", meaning: "乙丙", source: "original" }] }), entry("true", "甲乙丙")]);
  const result = await searchExpandedDictionary("甲乙丙", data);
  assert.deepEqual(result.results.map(item => item.term), ["true"]); assert.equal(result.hasMore, false);
});

test("Chinese results are rank-ordered, deduplicated by canonical ID, limited with hasMore", async () => {
  const data = fixture(Array.from({ length: 30 }, (_, index) => entry(`word${index}`, "美味", { variants: [{ partOfSpeech: "noun", meaning: "美味的东西", source: "original" }] })));
  const result = await searchExpandedDictionary("美味", data);
  assert.equal(result.results.length, 20); assert.equal(new Set(result.results.map(item => item.term)).size, 20);
  assert.deepEqual(result.results.map(item => item.term), Array.from({ length: 20 }, (_, index) => `word${index}`));
  assert.equal(result.hasMore, true); assert.ok(data.requests.length < 35);
});

test("adversarial Chinese bigram candidates cannot cause a full dictionary download", async () => {
  const data = fixture(Array.from({ length: 800 }, (_, index) => entry(`falseword${index}`, "甲乙；乙丙")));
  const result = await searchExpandedDictionary("甲乙丙", data);
  assert.deepEqual(result.results, []); assert.equal(result.hasMore, true);
  assert.ok(data.requests.filter(item => /\/en-\d{3}\.json$/u.test(item.url)).length <= 32);
});

test("single-character Chinese lookup is supported while empty/unsafe inputs never fetch", async () => {
  const data = fixture([entry("fluke", "侥幸；意外的好运")]);
  assert.equal((await searchExpandedDictionary("幸", data)).results[0].term, "fluke");
  for (const input of ["", "。", "   ", "<script>", "123", "中文abc", "中".repeat(51), "a".repeat(201), "hip\u202e", null]) {
    await assert.rejects(searchExpandedDictionary(input, { fetchImpl: () => { throw new Error("must not fetch"); } }));
  }
});

test("packaged 24/7 is a literal expression, not permission for arbitrary numeric entries", async () => {
  const data = fixture([entry("24/7", "全天候；一周七天每天二十四小时", { partOfSpeech: "adverb" })]);
  assert.equal((await searchExpandedDictionary("24/7", data)).results[0].term, "24/7");
});

test("manifest schema, path traversal, foreign URLs and unbounded counts fail closed", async () => {
  for (const mutate of [
    manifest => { manifest.schemaVersion = 3; },
    manifest => { manifest.english.shards[0].file = "../../private.json"; },
    manifest => { manifest.english.shards[0].file = "https://evil.test/en.json"; },
    manifest => { manifest.counts.records = 1_000_000; },
    manifest => { manifest.sources.mit.url = "javascript:alert(1)"; },
    manifest => { manifest.sources.mit.token = "must-not-accept"; },
    manifest => { manifest.sources.mit.commit = "not-a-commit"; },
    manifest => { manifest.counts.englishKeys++; }
  ]) {
    const data = fixture(); mutate(data.manifest);
    await assert.rejects(searchExpandedDictionary("hip", data), error => error.code === "invalid_dictionary_data");
    assert.equal(data.requests.length, 1);
  }
});

test("shard bytes and SHA are mandatory; malformed source data and private extra fields are rejected", async () => {
  for (const mutate of [
    data => { data.files.set(data.manifest.english.shards[bucket("hip")].file, "{}"); },
    data => data.rewrite("en", bucket("hip"), payload => { payload.records[0].meaning = "no Chinese"; }),
    data => data.rewrite("en", bucket("hip"), payload => { payload.records[0].ownerToken = "private"; }),
    data => data.rewrite("en", bucket("hip"), payload => { payload.records[0].meaning = "中".repeat(2001); }),
    data => data.rewrite("en", bucket("hip"), payload => { payload.records[0].partOfSpeech = "noun\nverb"; }),
    data => data.rewrite("en", bucket("hip"), payload => { payload.records[0].meaning = "髋\u0000部"; }),
    data => data.rewrite("en", bucket("hip"), payload => { payload.keys[0][1][0].id = 999_999; })
  ]) {
    const data = fixture(); mutate(data);
    await assert.rejects(searchExpandedDictionary("hip", data), error => error.code === "invalid_dictionary_data");
  }
});

test("failed shard and manifest requests do not poison the next healthy retry", async () => {
  for (const failAt of [1, 2]) {
    const data = fixture(); let calls = 0;
    const fetchImpl = async (...args) => ++calls === failAt ? new Response("unavailable", { status: 503 }) : data.fetchImpl(...args);
    await assert.rejects(searchExpandedDictionary("hip", { fetchImpl }));
    assert.equal((await searchExpandedDictionary("hip", { fetchImpl })).results[0].term, "hip");
  }
});

test("a hash-failed shard asks for a clean network reload on the next attempt", async () => {
  const data = fixture(), file = data.manifest.english.shards[bucket("hip")].file;
  const original = data.files.get(file); data.files.set(file, "bad cached HTML");
  await assert.rejects(searchExpandedDictionary("hip", data), error => error.code === "invalid_dictionary_data");
  data.files.set(file, original);
  assert.equal((await searchExpandedDictionary("hip", data)).results[0].term, "hip");
  assert.equal(data.requests.at(-1).options.cache, "reload");
});

test("a cancelled caller cannot resurrect results or cancel another public caller", async () => {
  const data = fixture(); const controller = new AbortController();
  const first = searchExpandedDictionary("hip", { ...data, signal: controller.signal });
  const second = searchExpandedDictionary("hip", data); controller.abort();
  await assert.rejects(first, error => error.name === "AbortError"); assert.equal((await second).results[0].term, "hip");
  assert.equal(data.requests.length, 2);
});

test("an aborted initial request does not fetch anything", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchExpandedDictionary("hip", { signal: controller.signal, fetchImpl: () => { throw new Error("must not fetch"); } }), error => error.name === "AbortError");
});

test("timeout covers headers and body, then a fresh request succeeds", async () => {
  for (const body of [false, true]) {
    const data = fixture(); let healthy = false;
    const fetchImpl = (...args) => healthy ? data.fetchImpl(...args) : body
      ? Promise.resolve({ ok: true, text: () => new Promise(() => {}) }) : new Promise(() => {});
    await assert.rejects(searchExpandedDictionary("hip", { fetchImpl, timeoutMs: 5 }), /超时/u);
    healthy = true;
    assert.equal((await searchExpandedDictionary("hip", { fetchImpl, timeoutMs: 200 })).results[0].term, "hip");
  }
});

test("optional seed metadata stays public, bounded and is not returned to the UI", async () => {
  const data = fixture([entry("seed", "种子", { workbook: true, seed: { rank: 2, forms: ["seeds"], workbook: true } })]);
  const result = (await searchExpandedDictionary("seed", data)).results[0];
  assert.equal(result.seed, undefined); assert.equal(result.workbook, undefined);
  data.rewrite("en", bucket("seed"), payload => { payload.records[0].seed.privateUser = "x"; });
  resetExpandedDictionaryCacheForTests();
  await assert.rejects(searchExpandedDictionary("seed", data), error => error.code === "invalid_dictionary_data");
});

test("a stale public manifest can fall back on network failure but not malformed fresh metadata", async t => {
  const data = fixture(); let now = 10_000, mode = "healthy";
  t.mock.method(Date, "now", () => now);
  const fetchImpl = (...args) => {
    if (String(args[0]).endsWith("manifest.json") && mode === "offline") return Promise.reject(new Error("offline"));
    if (String(args[0]).endsWith("manifest.json") && mode === "invalid") return Promise.resolve(new Response('{"schemaVersion":3}'));
    return data.fetchImpl(...args);
  };
  await searchExpandedDictionary("hip", { fetchImpl });
  now += 61_000; mode = "offline";
  assert.equal((await searchExpandedDictionary("hip", { fetchImpl })).results[0].term, "hip");
  mode = "invalid";
  await assert.rejects(searchExpandedDictionary("hip", { fetchImpl }), error => error.code === "invalid_dictionary_data");
});

test("every generated English and Chinese shard is compatible with the browser's strict parser", async () => {
  const root = new URL("../data/expanded-dictionary/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const requests = [];
  const fetchImpl = async url => { requests.push(String(url)); return new Response(await readFile(new URL(url))); };
  for (const descriptor of manifest.english.shards) {
    const payload = JSON.parse(await readFile(new URL(descriptor.file, root), "utf8"));
    const canonical = payload.records.find(row => row.id % 128 === descriptor.bucket);
    assert.ok(canonical, `missing canonical bucket ${descriptor.bucket}`);
    const result = await searchExpandedDictionary(canonical.term, { fetchImpl });
    assert.equal(result.results[0].term, canonical.term, `English bucket ${descriptor.bucket}`);
  }
  // Find an unused Han character in each token bucket: this exercises every
  // posting parser without downloading English shards for broad known queries.
  for (const descriptor of manifest.chinese.shards) {
    const payload = JSON.parse(await readFile(new URL(descriptor.file, root), "utf8"));
    const present = new Set(payload.postings.map(item => item[0]));
    let query;
    for (let point = 0x20000; point < 0x2a6df; point++) {
      const char = String.fromCodePoint(point);
      if (bucket(char) === descriptor.bucket && !present.has(char)) { query = char; break; }
    }
    assert.ok(query);
    assert.deepEqual((await searchExpandedDictionary(query, { fetchImpl })).results, [], `Chinese bucket ${descriptor.bucket}`);
  }
  assert.equal(requests.filter(url => url.endsWith("manifest.json")).length, 1);
  assert.equal(requests.filter(url => /\/(?:en|zh)-\d{3}\.json$/u.test(url)).length, 256);
});
