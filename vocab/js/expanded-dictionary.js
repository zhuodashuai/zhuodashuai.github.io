import { canonicalizeLookupInput } from "./wordbook-schema.js?v=82";
import { personalDictionaryResult } from "./personal-dictionary.js?v=97";
import { chineseSearchPlan, chineseSearchHeads, chineseSearchSense, matchesChineseSearchEntry, matchesChineseSearchMeaning } from "./chinese-search.js?v=111";
import { searchEverydayDictionary, isSupersededChineseSenseHead, guardLegacySupplementaryResult,
  isRetainedCanonicalSenseHead, matchesRetainedCanonicalAlternative, sanitizeRetainedCanonicalResult } from "./everyday-lookup.js?v=111";
import { chineseVariantRank, chineseRankingNeedle, parseChineseRanking } from "./chinese-ranking.js?v=111";
import { CHINESE_RANKING_RELEASE } from "./chinese-ranking-release.js?v=111";

// Only versioned, public first-party files are read. No query, cookies, private
// cards or learning records are written to this cache or sent to a provider.
const MANIFEST_URL = new URL("../data/expanded-dictionary/manifest.json", import.meta.url);
const RANKING_ROOT = new URL("../data/chinese-search-ranking/", import.meta.url);
const BUCKETS = 128;
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const BODY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const HAN = /\p{Script=Han}/u;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_SHARD_BYTES = 8 * 1024 * 1024;
const MAX_MEMORY_BYTES = 32 * 1024 * 1024;
const MANIFEST_TTL_MS = 60_000;
let generation = 0;
let clients = new WeakMap();
const activeControllers = new Set();

function invalid(message = "本站扩展词典格式不正确，请刷新后重试。") {
  const error = new Error(message); error.code = "invalid_dictionary_data"; return error;
}
function stopped() { const error = new Error("查词已停止。"); error.name = "AbortError"; return error; }
function timedOut() { const error = new Error("本站扩展词典读取超时，请重试。"); error.code = "dictionary_timeout"; return error; }
function keys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw invalid();
}
function text(value, maximum, { empty = false, chinese = false, multiline = false } = {}) {
  if (typeof value !== "string" || value.length > maximum || (multiline ? BODY_CONTROL : CONTROL).test(value)
    || (!empty && !value.trim()) || (chinese && !HAN.test(value))) throw invalid();
  return value;
}
function array(value, maximum) { if (!Array.isArray(value) || value.length > maximum) throw invalid(); return value; }
function integer(value, maximum = 30_000_000) { if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw invalid(); return value; }
function lexical(value) {
  text(value, 200);
  if (!/[\p{Script=Latin}\d]/u.test(value) || HAN.test(value) || /[<>]|javascript\s*:/iu.test(value)) throw invalid();
  return value;
}
function spelling(value) {
  return value.normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"')
    .replace(/\s+/gu, " ").trim();
}
const fold = value => spelling(value).toLocaleLowerCase("en-US");
function bucketFor(value) {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % BUCKETS;
}
function chineseTokens(query) {
  const tokens = new Set();
  for (const run of query.match(/\p{Script=Han}+/gu) || []) {
    const chars = [...run];
    if (chars.length === 1) tokens.add(chars[0]);
    else for (let index = 1; index < chars.length; index++) tokens.add(chars[index - 1] + chars[index]);
  }
  return [...tokens];
}
function sourceTable(value) {
  keys(value, [], Object.keys(value));
  if (!Object.keys(value).length || Object.keys(value).length > 16) throw invalid();
  const sources = new Map();
  for (const [key, source] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]{0,31}$/u.test(key)) throw invalid();
    keys(source, ["name", "license", "url"], ["commit", "sha256"]);
    text(source.name, 100); text(source.license, 200);
    const url = text(source.url, 500);
    if (!/^https:\/\//u.test(url)) throw invalid();
    try { const parsed = new URL(url); if (parsed.username || parsed.password) throw invalid(); } catch { throw invalid(); }
    if (source.commit !== undefined && !/^[a-f0-9]{7,64}$/u.test(source.commit)) throw invalid();
    if (source.sha256 !== undefined && !HASH.test(source.sha256)) throw invalid();
    sources.set(key, Object.freeze({ name: source.name, license: source.license, url }));
  }
  return sources;
}
function parseManifest(payload, integritySha256) {
  keys(payload, ["schemaVersion", "version", "counts", "sources", "english", "chinese"]);
  if (payload.schemaVersion !== 2 || !HASH.test(payload.version)) throw invalid();
  keys(payload.counts, ["records", "englishKeys", "chineseTokens"]);
  integer(payload.counts.records, 200_000); integer(payload.counts.englishKeys, 1_000_000); integer(payload.counts.chineseTokens, 200_000);
  const sources = sourceTable(payload.sources);
  for (const [kind, data] of [["en", payload.english], ["zh", payload.chinese]]) {
    keys(data, ["buckets", "shards"]);
    if (data.buckets !== BUCKETS || array(data.shards, BUCKETS).length !== BUCKETS) throw invalid();
    let count = 0;
    data.shards.forEach((shard, index) => {
      keys(shard, ["bucket", "file", "sha256", "bytes", "count"]);
      if (shard.bucket !== index || shard.file !== `${payload.version}/${kind}-${String(index).padStart(3, "0")}.json`
        || !HASH.test(shard.sha256)) throw invalid();
      integer(shard.bytes, MAX_SHARD_BYTES); integer(shard.count, 200_000); count += shard.count;
    });
    if (count !== payload.counts[kind === "en" ? "englishKeys" : "chineseTokens"]) throw invalid();
  }
  return Object.freeze({ ...payload, sources, integritySha256 });
}
function variant(value, sources) {
  keys(value, ["partOfSpeech", "meaning", "source"]);
  text(value.partOfSpeech, 200, { empty: true }); text(value.meaning, 2000, { chinese: true, multiline: true });
  if (!sources.has(value.source)) throw invalid();
  return Object.freeze({ ...value });
}
function parseEnglish(payload, manifest, descriptor) {
  keys(payload, ["schemaVersion", "kind", "bucket", "records", "keys"]);
  if (payload.schemaVersion !== 2 || payload.kind !== "en" || payload.bucket !== descriptor.bucket) throw invalid();
  const records = new Map();
  for (const row of array(payload.records, 30_000)) {
    keys(row, ["id", "term", "partOfSpeech", "meaning", "forms", "source"], ["variants", "workbook", "seed"]);
    integer(row.id); lexical(row.term);
    if (row.id % BUCKETS !== bucketFor(fold(row.term)) || records.has(row.id)) throw invalid();
    text(row.partOfSpeech, 200, { empty: true }); text(row.meaning, 2000, { chinese: true, multiline: true });
    if (!manifest.sources.has(row.source)) throw invalid();
    array(row.forms, 64).forEach(lexical);
    const variants = (row.variants === undefined ? [] : array(row.variants, 8)).map(item => variant(item, manifest.sources));
    if (row.workbook !== undefined && typeof row.workbook !== "boolean") throw invalid();
    if (row.seed !== undefined) {
      keys(row.seed, ["rank", "forms", "workbook"]); integer(row.seed.rank, 200_000);
      array(row.seed.forms, 64).forEach(lexical);
      if (typeof row.seed.workbook !== "boolean") throw invalid();
    }
    records.set(row.id, Object.freeze({ id: row.id, term: row.term, partOfSpeech: row.partOfSpeech,
      meaning: row.meaning, forms: Object.freeze([...row.forms]), source: row.source, variants: Object.freeze(variants) }));
  }
  const lookup = new Map();
  for (const item of array(payload.keys, 40_000)) {
    if (!Array.isArray(item) || item.length !== 2) throw invalid();
    const [key, refs] = item; lexical(key);
    if (fold(key) !== key || bucketFor(key) !== descriptor.bucket || lookup.has(key) || !array(refs, 100).length) throw invalid();
    const parsed = refs.map(ref => {
      keys(ref, ["id", "kind"], ["term", "partOfSpeech", "meaning"]);
      if (!records.has(ref.id) || !["canonical", "form", "context"].includes(ref.kind)) throw invalid();
      const target = records.get(ref.id);
      if (ref.kind === "canonical" && fold(target.term) !== key) throw invalid();
      if (ref.kind === "form" && !target.forms.some(form => fold(form) === key)) throw invalid();
      if (ref.term !== undefined && fold(lexical(ref.term)) !== key) throw invalid();
      if (ref.kind === "context") {
        text(ref.partOfSpeech, 200, { empty: true }); text(ref.meaning, 2000, { chinese: true, multiline: true });
        if (!manifest.sources.has("public")) throw invalid();
      } else if (ref.partOfSpeech !== undefined || ref.meaning !== undefined) throw invalid();
      return Object.freeze({ ...ref });
    });
    lookup.set(key, Object.freeze(parsed));
  }
  if (lookup.size !== descriptor.count) throw invalid();
  return { records, lookup };
}
function parseChinese(payload, manifest, descriptor) {
  keys(payload, ["schemaVersion", "kind", "bucket", "postings"]);
  if (payload.schemaVersion !== 2 || payload.kind !== "zh" || payload.bucket !== descriptor.bucket) throw invalid();
  const postings = new Map();
  for (const item of array(payload.postings, 100_000)) {
    if (!Array.isArray(item) || item.length !== 2) throw invalid();
    const [token, ids] = item;
    if (typeof token !== "string" || !/^\p{Script=Han}{1,2}$/u.test(token) || bucketFor(token) !== descriptor.bucket || postings.has(token)) throw invalid();
    let previous = -1;
    for (const id of array(ids, manifest.counts.records)) { integer(id); if (id <= previous) throw invalid(); previous = id; }
    postings.set(token, ids);
  }
  if (postings.size !== descriptor.count) throw invalid();
  return postings;
}
function clientFor(fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("当前环境无法读取本站词典。");
  let client = clients.get(fetchImpl);
  if (!client) { client = { manifest: null, manifestAt: 0, manifestLoad: null, shards: new Map(), pending: new Map(), failed: new Set(), bytes: 0 }; clients.set(fetchImpl, client); }
  return client;
}
function deadline(operation, timeoutMs, controller) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(timedOut()); }, timeoutMs); });
  return Promise.race([operation, limit]).finally(() => clearTimeout(timer));
}
async function readBytes(response, maximum) {
  if (Number(response.headers?.get?.("content-length")) > maximum) throw invalid();
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const chunks = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.byteLength; if (total > maximum) { await reader.cancel(); throw invalid(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const result = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }
  const result = new TextEncoder().encode(await response.text());
  if (result.byteLength > maximum) throw invalid();
  return result;
}
async function getJSON(url, { fetchImpl, timeoutMs, descriptor, reload = false, onIntegrity }) {
  const controller = new AbortController(); activeControllers.add(controller);
  const operation = (async () => {
    const response = await fetchImpl(url, { cache: descriptor ? (reload ? "reload" : "force-cache") : "no-cache", credentials: "omit", signal: controller.signal });
    if (!response?.ok) { const error = new Error(`本站扩展词典暂时读取失败（${response?.status || "network"}），请重试。`); error.code = "dictionary_network"; throw error; }
    const bytes = await readBytes(response, descriptor ? descriptor.bytes : 256 * 1024);
    if (descriptor || onIntegrity) {
      if (descriptor && bytes.byteLength !== descriptor.bytes || !globalThis.crypto?.subtle) throw invalid();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
      if (descriptor && digest !== descriptor.sha256) throw invalid("本站扩展词典校验失败，请刷新后重试。");
      onIntegrity?.(digest);
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw invalid(); }
  })();
  try { return await deadline(operation, timeoutMs, controller); }
  finally { activeControllers.delete(controller); }
}
async function manifestFor(client, fetchImpl, timeoutMs) {
  if (client.manifest && Date.now() - client.manifestAt < MANIFEST_TTL_MS) return client.manifest;
  if (client.manifestLoad) return client.manifestLoad;
  const startGeneration = generation;
  const loading = (async () => {
    try {
      let integritySha256;
      const payload = await getJSON(MANIFEST_URL, { fetchImpl, timeoutMs: Math.min(timeoutMs, 2500), onIntegrity: digest => { integritySha256 = digest; } });
      const parsed = parseManifest(payload, integritySha256);
      if (generation === startGeneration) { client.manifest = parsed; client.manifestAt = Date.now(); }
      return parsed;
    } catch (error) {
      // A malformed new manifest must fail closed, not silently hide corruption.
      if (error.code !== "invalid_dictionary_data" && client.manifest) return client.manifest;
      throw error;
    } finally { if (client.manifestLoad === loading) client.manifestLoad = null; }
  })();
  client.manifestLoad = loading; return loading;
}
async function shardFor(kind, bucket, manifest, client, fetchImpl, timeoutMs) {
  const descriptor = manifest[kind === "en" ? "english" : "chinese"].shards[bucket];
  const cacheKey = `${manifest.version}:${kind}:${descriptor.sha256}`;
  if (client.shards.has(cacheKey)) {
    const cached = client.shards.get(cacheKey); client.shards.delete(cacheKey); client.shards.set(cacheKey, cached); return cached.value;
  }
  if (client.pending.has(cacheKey)) return client.pending.get(cacheKey);
  const startGeneration = generation;
  const loading = (async () => {
    const payload = await getJSON(new URL(descriptor.file, MANIFEST_URL), { fetchImpl, timeoutMs, descriptor, reload: client.failed.has(cacheKey) });
    const value = kind === "en" ? parseEnglish(payload, manifest, descriptor) : parseChinese(payload, manifest, descriptor);
    if (generation === startGeneration) {
      while (client.bytes + descriptor.bytes > MAX_MEMORY_BYTES && client.shards.size) {
        const key = client.shards.keys().next().value; client.bytes -= client.shards.get(key).bytes; client.shards.delete(key);
      }
      client.shards.set(cacheKey, { value, bytes: descriptor.bytes }); client.bytes += descriptor.bytes;
      client.failed.delete(cacheKey);
    }
    return value;
  })().catch(error => {
    if (generation === startGeneration) {
      client.failed.add(cacheKey);
      if (client.failed.size > 256) client.failed.delete(client.failed.values().next().value);
    }
    throw error;
  }).finally(() => { if (client.pending.get(cacheKey) === loading) client.pending.delete(cacheKey); });
  client.pending.set(cacheKey, loading); return loading;
}
function waitFor(promise, signal, timeoutMs) {
  if (signal?.aborted) return Promise.reject(stopped());
  let rejectStop;
  const cancelled = new Promise((_, reject) => { rejectStop = reject; });
  const stop = () => rejectStop(stopped()); signal?.addEventListener("abort", stop, { once: true });
  return deadline(Promise.race([promise, cancelled]), timeoutMs).then(value => {
    if (signal?.aborted) throw stopped(); return value;
  }).finally(() => signal?.removeEventListener("abort", stop));
}
function readable(record, selected) {
  // MIT definitions use compact POS-labelled lines. Reuse the existing display
  // formatter, but never relabel provenance or number an already numbered card.
  if (!["mit", "core", "pos-reviewed", "grammar-reviewed", "pos-notation-reviewed"].includes(selected.source) || /^\s*(?:[①-⑳]|\d+[.、])/u.test(selected.meaning)) return selected;
  const formatted = personalDictionaryResult({ word: record.term, partOfSpeech: selected.partOfSpeech, meaning: selected.meaning });
  return formatted ? { ...selected, partOfSpeech: formatted.partOfSpeech || selected.partOfSpeech,
    meaning: formatted.meaning.length <= 2000 ? formatted.meaning : selected.meaning } : selected;
}
function display(record, selected, manifest, matchedForm) {
  const source = manifest.sources.get(selected.source);
  const formatted = readable(record, selected);
  const result = { term: record.term, partOfSpeech: formatted.partOfSpeech, meaning: formatted.meaning,
    source: source.name, license: source.license, url: source.url };
  if (matchedForm) result.matchedForm = matchedForm;
  const alternatives = [record, ...record.variants].filter(item =>
    (item.source !== selected.source || item.meaning !== selected.meaning || item.partOfSpeech !== selected.partOfSpeech)
    // The immutable source row remains in the data for attribution/rebuilds.
    // Repeating its identical gloss with an empty label is not another sense.
    && !((selected.source === "pos-reviewed" || selected.source === "grammar-reviewed" && item.source === "mit")
      && item.meaning === selected.meaning && !item.partOfSpeech.trim()))
    .map(item => { const provenance = manifest.sources.get(item.source), formatted = readable(record, item); return { partOfSpeech: formatted.partOfSpeech, meaning: formatted.meaning,
      source: provenance.name, license: provenance.license, url: provenance.url }; });
  if (alternatives.length) result.alternatives = alternatives;
  // An unapproved primary can still be rejected by the English-form guard.
  // Chinese candidates are restricted before matching below. Never expose an
  // unapproved side alternative alongside an approved retained primary.
  return sanitizeRetainedCanonicalResult(result) || result;
}
function ambiguous() {
  const error = new Error("这个形式对应多个词或语境，请输入英文原形；本次没有自动选取。");
  error.code = "ambiguous_dictionary_match"; return error;
}
async function englishSearch(query, context) {
  const { manifest, client, fetchImpl, timeoutMs, exactQuery } = context;
  // Preserve literal dotted abbreviations before trying pasted sentence-edge
  // punctuation. The schema's editor normalizer intentionally treats phrases
  // more narrowly; dictionary search can ignore a final comma without changing
  // the saved headword, internal apostrophes, hyphens, plus signs or slashes.
  const literal = fold(query), unwrapped = query.replace(/^["']+|["',.!?;:，。！？；：]+$/gu, "").trim();
  const canonical = fold(canonicalizeLookupInput(unwrapped || query));
  const wanted = [...new Set([literal, canonical])];
  const rows = [];
  for (let index = 0; index < wanted.length; index++) {
    // A true literal head needs no normalized alternative. Loading that shard
    // first would let an unrelated failure or timeout hide a healthy exact hit.
    // Keep a literal form/context pending until the normalized canonical check.
    const key = wanted[index], shard = await shardFor("en", bucketFor(key), manifest, client, fetchImpl, timeoutMs);
    const row = { refs: shard.lookup.get(key) || [], shard }; rows.push(row);
    const canonicalRefs = row.refs.filter(ref => ref.kind === "canonical");
    if (canonicalRefs.length) {
      const exactSpelling = index === 0 ? exactQuery : canonicalizeLookupInput(exactQuery.replace(/^["']+|["',.!?;:，。！？；：]+$/gu, "").trim());
      const precise = canonicalRefs.filter(ref => spelling(row.shard.records.get(ref.id).term) === exactSpelling);
      const options = precise.length ? precise : canonicalRefs;
      if (new Set(options.map(ref => ref.id)).size > 1) throw ambiguous();
      const record = row.shard.records.get(options[0].id);
      return { query, results: [display(record, record, manifest)], hasMore: false };
    }
  }
  const row = rows.find(item => item.refs.length);
  if (!row) return { query, results: [], hasMore: false };
  if (new Set(row.refs.map(ref => ref.id)).size > 1) throw ambiguous();
  const contexts = row.refs.filter(ref => ref.kind === "context");
  if (new Set(contexts.map(ref => `${ref.partOfSpeech}\n${ref.meaning}`)).size > 1) throw ambiguous();
  const ref = contexts[0] || row.refs[0], record = row.shard.records.get(ref.id);
  const selected = ref.kind === "context" ? { partOfSpeech: ref.partOfSpeech, meaning: ref.meaning, source: "public" } : record;
  return { query, results: [display(record, selected, manifest, ref.term || query)], hasMore: false };
}
async function parallel(items, concurrency, callback) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const item = items[cursor++]; await callback(item); }
  }));
}
async function rankingFor(manifest, client, fetchImpl, timeoutMs) {
  if (manifest.version !== CHINESE_RANKING_RELEASE.dictionaryVersion) return null;
  if (manifest.integritySha256 !== CHINESE_RANKING_RELEASE.sourceManifestSha256
    || manifest.counts.records !== CHINESE_RANKING_RELEASE.records) throw invalid("中文检索索引与当前词典不一致，请更新后重试。");
  if (client.ranking) return client.ranking;
  if (client.rankingLoad) return client.rankingLoad;
  const startGeneration = generation;
  const controller = new AbortController(); activeControllers.add(controller);
  const operation = (async () => {
    const descriptor = CHINESE_RANKING_RELEASE;
    const response = await fetchImpl(new URL(descriptor.file, RANKING_ROOT), {
      cache: client.rankingFailed ? "reload" : "force-cache", credentials: "omit", signal: controller.signal,
    });
    if (!response?.ok) { const error = new Error("中文完整检索索引暂时读取失败，请重试。"); error.code = "dictionary_network"; throw error; }
    const bytes = await readBytes(response, descriptor.bytes);
    if (bytes.byteLength !== descriptor.bytes || !globalThis.crypto?.subtle) throw invalid();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    if (digest !== descriptor.sha256) throw invalid("中文检索索引校验失败，请刷新后重试。");
    if (typeof DecompressionStream !== "function") throw new Error("当前浏览器不支持完整中文检索，请更新浏览器后重试。");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const unpacked = await readBytes(new Response(stream), descriptor.uncompressedBytes);
    if (unpacked.byteLength !== descriptor.uncompressedBytes) throw invalid();
    let payload;
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(unpacked)); } catch { throw invalid(); }
    const value = { records: parseChineseRanking(payload, manifest) };
    if (generation === startGeneration) { client.ranking = value; client.rankingFailed = false; }
    return value;
  })();
  const loading = deadline(operation, timeoutMs, controller).catch(error => { if (generation === startGeneration) client.rankingFailed = true; throw error; })
    .finally(() => { activeControllers.delete(controller); if (client.rankingLoad === loading) client.rankingLoad = null; });
  client.rankingLoad = loading;
  return client.rankingLoad;
}

function globallyRankedChinese(query, ids, ranking, manifest, plan, sense, limit, offset) {
  const matches = [];
  for (const id of ids) {
    const record = ranking.records.get(id);
    if (!record) throw invalid("中文候选与词典记录不一致，请刷新后重试。");
    if (isSupersededChineseSenseHead(record.term)) continue;
    const variants = [record, ...record.variants].filter(item => !isRetainedCanonicalSenseHead(record.term)
      || matchesRetainedCanonicalAlternative(record.term, display(record, item, manifest)));
    let selected = null, score = Infinity;
    for (const item of variants) {
      const rank = plan ? matchesChineseSearchEntry(record.term, item.meaning, plan.term, item.partOfSpeech, item.source) ? 0 : null
        : chineseVariantRank(item.meaning, query);
      if (rank !== null && rank < score) { selected = item; score = rank; }
    }
    if (selected) matches.push({ record, selected, score });
  }
  matches.sort((a, b) => a.score - b.score || a.record.id - b.record.id);
  const page = matches.slice(offset, offset + limit), nextOffset = offset + page.length;
  return { query, results: page.map(({ record, selected }) => ({ ...display(record, selected, manifest),
    ...(sense ? { matchedPartOfSpeech: sense.pos, matchedSense: sense.sense,
      matchedExampleSenseIds: (sense.exampleSenses?.[fold(record.term)] || []).map(item => item.id),
      matchedExampleSenseEvidence: sense.exampleSenses?.[fold(record.term)] || [] } : {}) })),
    hasMore: nextOffset < matches.length, nextOffset, offset, total: matches.length, ranking: "global" };
}

async function chineseSearch(query, limit, context, relatedPlan = null, offset = 0) {
  const { manifest, client, fetchImpl, timeoutMs, signal } = context;
  const plan = relatedPlan || chineseSearchPlan(query);
  const sense = plan ? chineseSearchSense(plan.term) : null;
  const terms = relatedPlan ? plan.aliases : [plan?.term || query];
  const candidates = new Map(), loaded = new Map(), heads = chineseSearchHeads(plan?.term || query);
  if (signal?.aborted) throw stopped();
  // Finite reviewed head sets can be verified completely from their few
  // existing English shards. They do not need the broad-query catalogue.
  const ranking = relatedPlan || heads ? null : await rankingFor(manifest, client, fetchImpl, timeoutMs);
  if (signal?.aborted) throw stopped();
  if (heads) {
    // A reviewed lexical shortlist avoids spending the bounded reverse scan on
    // hundreds of compounds such as "外科医生" before reaching "医师". Resolve
    // canonical heads through the same hash-checked English index; neither the
    // shortlist nor a source label substitutes for actual meaning evidence.
    await parallel([...new Set(heads.map(head => bucketFor(fold(head))))], 6, async bucket => {
      if (signal?.aborted) throw stopped();
      loaded.set(bucket, await shardFor("en", bucket, manifest, client, fetchImpl, timeoutMs));
    });
    if (signal?.aborted) throw stopped();
    for (const head of heads) {
      const shard = loaded.get(bucketFor(fold(head)));
      for (const ref of shard.lookup.get(fold(head)) || []) if (ref.kind === "canonical") candidates.set(ref.id, 0);
    }
  } else {
    const tokenPlans = terms.map(term => chineseTokens(ranking ? chineseRankingNeedle(term) : term));
    const tokens = [...new Set(tokenPlans.flat())], tokenShards = new Map();
    await parallel([...new Set(tokens.map(bucketFor))], 6, async bucket => {
      if (signal?.aborted) throw stopped();
      tokenShards.set(bucket, await shardFor("zh", bucket, manifest, client, fetchImpl, timeoutMs));
    });
    if (signal?.aborted) throw stopped();
    for (const [priority, wanted] of tokenPlans.entries()) {
      const lists = wanted.map(token => tokenShards.get(bucketFor(token)).get(token) || []).sort((a, b) => a.length - b.length);
      if (!lists.length || !lists[0].length) continue;
      const other = lists.slice(1).map(list => new Set(list));
      for (const id of lists[0]) if (!candidates.has(id) && other.every(set => set.has(id))) candidates.set(id, priority);
    }
  }
  // All aliases share one bounded scan and download budget, not one per alias.
  const ids = [...candidates.keys()].sort((a, b) => candidates.get(a) - candidates.get(b) || a - b);
  if (ranking) return globallyRankedChinese(query, ids, ranking, manifest, plan, sense, limit, offset);
  if (!relatedPlan && heads) {
    const records = new Map(ids.map(id => [id, loaded.get(id % BUCKETS)?.records.get(id)]));
    if ([...records.values()].some(record => !record)) throw invalid();
    return globallyRankedChinese(query, ids, { records }, manifest, plan, sense, limit, offset);
  }
  const results = [], resultIds = new Map(), wholeMeaningResults = new Set(); let examined = 0;
  const windowLimit = relatedPlan ? limit : offset + limit;
  const relatedOrder = (a, b) => terms.indexOf(a.matchedChinese) - terms.indexOf(b.matchedChinese)
    || resultIds.get(a) - resultIds.get(b);
  const freeOrder = (a, b) => Number(wholeMeaningResults.has(b)) - Number(wholeMeaningResults.has(a))
    || resultIds.get(a) - resultIds.get(b);
  // A posting's priority is only a lower bound: its earlier alias can be a
  // compound/mention while a later alias is the actual definition atom. Keep
  // looking until later candidates cannot improve the retained top results.
  const cannotImprove = id => relatedPlan && results.length > limit
    && candidates.get(id) > terms.indexOf(results.at(-1).matchedChinese);
  while (examined < ids.length && examined < 512 && (relatedPlan || results.length <= windowLimit)) {
    if (signal?.aborted) throw stopped();
    if (cannotImprove(ids[examined])) break;
    const next = [], prospective = new Set(loaded.keys());
    for (const id of ids.slice(examined, Math.min(examined + 24, 512))) {
      if (cannotImprove(id)) break;
      prospective.add(id % BUCKETS);
      if (prospective.size > 32) break;
      next.push(id);
    }
    if (!next.length) break;
    const buckets = [...new Set(next.map(id => id % BUCKETS))];
    await parallel(buckets, 6, async bucket => {
      if (signal?.aborted) throw stopped();
      if (!loaded.has(bucket)) loaded.set(bucket, await shardFor("en", bucket, manifest, client, fetchImpl, timeoutMs));
    });
    if (signal?.aborted) throw stopped();
    for (const id of next) {
      if (cannotImprove(id)) break;
      examined++;
      const record = loaded.get(id % BUCKETS).records.get(id);
      if (!record || id % BUCKETS !== bucketFor(fold(record.term))) throw invalid();
      // Reviewed replacement senses use their explicit local Chinese aliases.
      // Their stale legacy reverse postings must not keep teaching the old error.
      if (isSupersededChineseSenseHead(record.term)) continue;
      const variants = [record, ...record.variants].filter(item => !isRetainedCanonicalSenseHead(record.term)
        || matchesRetainedCanonicalAlternative(record.term, display(record, item, manifest)));
      // A related result must not repeat a direct sense, even when that direct
      // head falls beyond the visible direct-results limit.
      if (relatedPlan && variants.some(item => matchesChineseSearchEntry(record.term, item.meaning, plan.term, item.partOfSpeech, item.source))) continue;
      let selected, matched, wholeMeaning = false;
      for (const term of terms) {
        const whole = !plan ? variants.find(item => matchesChineseSearchMeaning(item.meaning, term)) : null;
        selected = whole || variants.find(item => plan ? matchesChineseSearchEntry(record.term, item.meaning, term, item.partOfSpeech, item.source) : fold(item.meaning).includes(term));
        if (selected) { matched = term; wholeMeaning = Boolean(whole); break; }
      }
      if (selected) {
        const result = { ...display(record, selected, manifest),
          ...(sense ? { matchedPartOfSpeech: sense.pos, matchedSense: sense.sense,
            matchedExampleSenseIds: (sense.exampleSenses?.[fold(record.term)] || []).map(item => item.id),
            matchedExampleSenseEvidence: sense.exampleSenses?.[fold(record.term)] || [] } : {}),
          ...(relatedPlan ? { matchType: "related", matchedChinese: matched } : {}) };
        results.push(result);
        if (relatedPlan) {
          resultIds.set(result, id); results.sort(relatedOrder);
          if (results.length > limit + 1) resultIds.delete(results.pop());
        } else if (!plan) {
          resultIds.set(result, id);
          if (wholeMeaning) wholeMeaningResults.add(result);
        }
      }
      if (plan && !relatedPlan && results.length > windowLimit) break;
    }
    // Free substring queries may already have downloaded a whole-meaning hit
    // later in this window. Rank all its candidates before truncating, without
    // fetching another window for a better global rank or changing reviewed plans.
    if (!plan) results.sort(freeOrder);
  }
  const page = results.slice(offset, offset + limit), nextOffset = offset + page.length;
  return { query, results: page, hasMore: (relatedPlan || page.length > 0) && (results.length > nextOffset || examined < ids.length),
    ...(relatedPlan ? {} : { nextOffset, offset, coverage: "limited", ranking: "limited" }) };
}

/** Optional, non-transitive Chinese meaning associations; never writes cards. */
export async function searchRelatedChineseDictionary(input, { signal, fetchImpl = globalThis.fetch, timeoutMs = 5000, limit = 8 } = {}) {
  if (typeof input !== "string" || input.length > 200 || CONTROL.test(input)) return { results: [], hasMore: false };
  const query = fold(input).replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu, "").trim();
  const plan = chineseSearchPlan(query);
  if (!plan) return { query, results: [], hasMore: false };
  if (signal?.aborted) throw stopped();
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 15_000) : 5000;
  const count = Math.max(1, Math.min(8, Number.isSafeInteger(limit) ? limit : 8));
  const client = clientFor(fetchImpl);
  const controller = new AbortController();
  const stop = () => controller.abort(); signal?.addEventListener("abort", stop, { once: true });
  const work = (async () => {
    const manifest = await manifestFor(client, fetchImpl, duration);
    if (controller.signal.aborted) throw stopped();
    return chineseSearch(query, count, { manifest, client, fetchImpl, timeoutMs: duration, signal: controller.signal }, plan);
  })();
  try { return await waitFor(work, signal, duration); }
  finally { controller.abort(); signal?.removeEventListener("abort", stop); }
}

/** Warm just the small public manifest; no full dictionary is loaded at login. */
export async function preloadExpandedDictionary({ signal, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  if (signal?.aborted) throw stopped();
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000;
  const client = clientFor(fetchImpl);
  const manifest = await waitFor(manifestFor(client, fetchImpl, duration), signal, duration);
  // Do not expose mutable manifest descriptors or cache internals to UI callers.
  return Object.freeze({ schemaVersion: manifest.schemaVersion, version: manifest.version, counts: Object.freeze({ ...manifest.counts }) });
}

/** Exact English/form lookup or ranked Chinese substring search, with no AI. */
export async function searchExpandedDictionary(input, { signal, fetchImpl = globalThis.fetch, timeoutMs = 15_000, limit = 20, offset } = {}) {
  if (typeof input !== "string" || input.length > 200 || CONTROL.test(input)) throw new Error("请输入不超过 200 个字符的英文或中文释义。");
  const exactQuery = spelling(input).replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim();
  let query = fold(exactQuery);
  if (HAN.test(query)) query = query.replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu, "").trim();
  if (!query || /[<>]|javascript\s*:/iu.test(query) || !/[\p{Script=Latin}\p{Script=Han}\d]/u.test(query)) throw new Error("请输入要查询的英文或中文释义。");
  if (signal?.aborted) throw stopped();
  // Common phrase aliases are indexed as complete, sense-specific queries.
  // They can answer immediately, without broadening or downloading the core.
  const everyday = searchEverydayDictionary(input, { limit, ...(offset === undefined ? {} : { offset }) });
  if (everyday) return everyday;
  const chinese = HAN.test(query);
  if (chinese && (!/^[\p{Script=Han}\s]+$/u.test(query) || [...query].length > 50)) throw new Error("中文查询请只输入不超过 50 个字的中文释义。");
  if (!chinese && !/[\p{Script=Latin}]/u.test(query) && query !== "24/7") throw new Error("请输入英文词或短语。");
  if (signal?.aborted) throw stopped();
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000;
  const count = Math.max(1, Math.min(50, Number.isSafeInteger(limit) ? limit : 20));
  const start = Number.isSafeInteger(offset) && offset >= 0 ? Math.min(offset, 200_000) : 0;
  const client = clientFor(fetchImpl);
  const work = (async () => {
    const manifest = await manifestFor(client, fetchImpl, duration);
    if (signal?.aborted) throw stopped();
    const context = { manifest, client, fetchImpl, timeoutMs: duration, signal, exactQuery };
    return chinese ? chineseSearch(query, count, context, null, start) : guardLegacySupplementaryResult(await englishSearch(query, context));
  })();
  return waitFor(work, signal, duration);
}

export function resetExpandedDictionaryCacheForTests() {
  generation++; for (const controller of activeControllers) controller.abort(); activeControllers.clear(); clients = new WeakMap();
}
