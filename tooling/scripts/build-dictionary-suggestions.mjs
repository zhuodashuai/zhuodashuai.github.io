/** Optional canonical-head typo candidates. No definitions, aliases or frequency claims. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expandedBucket, expandedKey, expandedSha256, normalizeExpandedTerm } from "./build-expanded-dictionary.mjs";
import { DICTIONARY_SOURCE_REVISION_SOURCE } from "../lib/dictionary-source-revisions.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const HASH = /^[a-f0-9]{64}$/u;
const ELIGIBLE = /^[a-z]+(?:[ '-][a-z]+)*$/u;
const BUCKETS = 128;
const MIN_LENGTH = 2;
const MAX_LENGTH = 64;
const SOURCES = new Set(["core", "mit", "public", "original", "supplement", "pos-reviewed", "grammar-reviewed"]);
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const json = value => `${JSON.stringify(value)}\n`;
const invalid = message => { throw new Error(`Invalid suggestion source: ${message}`); };
const integer = (value, maximum = 30_000_000) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;

/** A source tier is a tie-breaker, not a measured word-frequency estimate. */
export function dictionarySuggestionPriority(record) {
  const sources = [record.source, ...(record.variants || []).map(item => item.source)];
  if (sources.includes("core")) return 0;
  if (sources.some(source => ["original", "public", "supplement"].includes(source))) return 1;
  return 2;
}

function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 2 || !HASH.test(manifest.version)
    || !integer(manifest.counts?.records, 200_000) || !integer(manifest.counts?.englishKeys, 1_000_000)
    || manifest.english?.buckets !== BUCKETS || !Array.isArray(manifest.english.shards)
    || manifest.english.shards.length !== BUCKETS || !manifest.sources || Array.isArray(manifest.sources)) invalid("manifest");
  for (const [source, metadata] of Object.entries(manifest.sources)) {
    if (!SOURCES.has(source) || !metadata || typeof metadata.name !== "string" || !metadata.name.trim()
      || typeof metadata.license !== "string" || !metadata.license.trim() || typeof metadata.url !== "string"
      || !/^https:\/\//u.test(metadata.url)) invalid("provenance table");
    if (source === "grammar-reviewed" && (!HASH.test(metadata.sha256)
      || Object.entries(DICTIONARY_SOURCE_REVISION_SOURCE).some(([key, value]) => metadata[key] !== value))) {
      invalid("grammar revision provenance");
    }
  }
  let totalKeys = 0;
  for (const [bucket, descriptor] of manifest.english.shards.entries()) {
    if (!descriptor || descriptor.bucket !== bucket
      || descriptor.file !== `${manifest.version}/en-${String(bucket).padStart(3, "0")}.json`
      || !HASH.test(descriptor.sha256) || !integer(descriptor.bytes, 8 * 1024 * 1024)
      || !integer(descriptor.count, 200_000)) invalid("English descriptor/path");
    totalKeys += descriptor.count;
  }
  if (totalKeys !== manifest.counts.englishKeys) invalid("English key count");
}

function validateRecord(record, sources) {
  if (!record || !integer(record.id) || typeof record.term !== "string" || record.term.length > 200
    || !record.term.trim() || normalizeExpandedTerm(record.term) !== record.term
    || /[\p{Cc}\p{Cf}<>]|javascript\s*:/iu.test(record.term) || !/[\p{Script=Latin}\d]/u.test(record.term)
    || /\p{Script=Han}/u.test(record.term) || record.id % BUCKETS !== expandedBucket(expandedKey(record.term))
    || typeof record.partOfSpeech !== "string" || record.partOfSpeech.length > 200
    || typeof record.meaning !== "string" || record.meaning.length > 2000 || !/\p{Script=Han}/u.test(record.meaning)
    || !Array.isArray(record.forms) || record.forms.length > 64 || !sources.has(record.source)
    || record.variants !== undefined && (!Array.isArray(record.variants) || record.variants.length > 8)) invalid("record");
  for (const item of record.variants || []) {
    if (!item || !sources.has(item.source) || typeof item.partOfSpeech !== "string" || typeof item.meaning !== "string"
      || !/\p{Script=Han}/u.test(item.meaning)) invalid("variant provenance");
  }
  for (const form of record.forms) {
    if (typeof form !== "string" || !form.trim() || form.length > 200 || /[\p{Cc}\p{Cf}<>]/u.test(form)) invalid("form");
  }
}

/** Build from all hash-validated English source bytes; only canonical references become candidates. */
export function buildDictionarySuggestions({ manifest, shards }) {
  validateManifest(manifest);
  if (!(shards instanceof Map) || shards.size !== BUCKETS) invalid("all 128 English shards are required");
  const sourceNames = new Set(Object.keys(manifest.sources));
  const allRecords = new Map(), canonical = new Map(), canonicalIds = new Set();
  for (const descriptor of manifest.english.shards) {
    const bytes = shards.get(descriptor.file);
    if (!(typeof bytes === "string" || Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)
      || Buffer.byteLength(bytes) !== descriptor.bytes || expandedSha256(bytes) !== descriptor.sha256) invalid("shard bytes/hash");
    let payload;
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(bytes))); } catch { invalid("shard JSON"); }
    if (payload?.schemaVersion !== 2 || payload.kind !== "en" || payload.bucket !== descriptor.bucket
      || !Array.isArray(payload.records) || payload.records.length > 30_000
      || !Array.isArray(payload.keys) || payload.keys.length !== descriptor.count) invalid("shard header");
    const records = new Map(), keySet = new Set(), referenced = new Set();
    for (const record of payload.records) {
      validateRecord(record, sourceNames);
      if (records.has(record.id)) invalid("duplicate shard record id");
      const semantic = JSON.stringify(record);
      if (allRecords.has(record.id) && allRecords.get(record.id) !== semantic) invalid("conflicting duplicate record");
      allRecords.set(record.id, semantic); records.set(record.id, record);
    }
    for (const item of payload.keys) {
      if (!Array.isArray(item) || item.length !== 2) invalid("key row");
      const [key, refs] = item;
      if (typeof key !== "string" || expandedKey(key) !== key || expandedBucket(key) !== descriptor.bucket
        || keySet.has(key) || !Array.isArray(refs) || !refs.length || refs.length > 100) invalid("key");
      keySet.add(key); const refSet = new Set();
      for (const ref of refs) {
        if (!ref || !integer(ref.id) || !records.has(ref.id) || !["canonical", "form", "context"].includes(ref.kind)) invalid("reference");
        const identity = JSON.stringify(ref);
        if (refSet.has(identity)) invalid("duplicate reference");
        refSet.add(identity); referenced.add(ref.id);
        const record = records.get(ref.id);
        if (ref.kind === "canonical") {
          if (expandedKey(record.term) !== key || canonical.has(record.term) || canonicalIds.has(record.id)) invalid("duplicate/incorrect canonical reference");
          canonical.set(record.term, record); canonicalIds.add(record.id);
        } else if (ref.kind === "form" && !record.forms.some(form => expandedKey(form) === key)) invalid("incorrect form reference");
        if (ref.term !== undefined && (typeof ref.term !== "string" || expandedKey(ref.term) !== key)) invalid("reference spelling");
        if (ref.kind === "context" && (!sourceNames.has("public") || typeof ref.meaning !== "string"
          || !/\p{Script=Han}/u.test(ref.meaning) || typeof ref.partOfSpeech !== "string")) invalid("context provenance");
      }
    }
    if (referenced.size !== records.size) invalid("unreferenced record");
  }
  if (canonical.size !== manifest.counts.records || canonicalIds.size !== allRecords.size) invalid("canonical coverage");
  const rows = [...canonical.values()].filter(record => {
    const key = expandedKey(record.term);
    return key.length >= MIN_LENGTH && key.length <= MAX_LENGTH && ELIGIBLE.test(key);
  }).sort((a, b) => cmp(expandedKey(a.term), expandedKey(b.term)) || cmp(a.term, b.term))
    .map(record => [record.term, dictionarySuggestionPriority(record)]);
  const version = expandedSha256(JSON.stringify({ schemaVersion: 1, dictionaryVersion: manifest.version,
    minLength: MIN_LENGTH, maxLength: MAX_LENGTH, rows }));
  const files = new Map(), descriptors = [];
  for (let length = MIN_LENGTH; length <= MAX_LENGTH; length++) {
    const subset = rows.filter(([term]) => expandedKey(term).length === length);
    const file = `${version}/length-${String(length).padStart(2, "0")}.json`;
    const bytes = Buffer.from(json({ schemaVersion: 1, length, rows: subset }));
    files.set(file, bytes);
    descriptors.push({ length, file, sha256: expandedSha256(bytes), bytes: bytes.length, count: subset.length });
  }
  const counts = { canonicalHeads: canonical.size, eligibleHeads: rows.length, excludedHeads: canonical.size - rows.length };
  const outputManifest = { schemaVersion: 1, dictionaryVersion: manifest.version, version, counts,
    minLength: MIN_LENGTH, maxLength: MAX_LENGTH, shards: descriptors };
  files.set("manifest.json", Buffer.from(json(outputManifest)));
  return { manifest: outputManifest, files, rows,
    totalShardBytes: descriptors.reduce((sum, descriptor) => sum + descriptor.bytes, 0) };
}

export async function loadDictionarySuggestionBuild({ directory = join(ROOT, "vocab/data/expanded-dictionary") } = {}) {
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  validateManifest(manifest); // Validate paths before touching the filesystem.
  const shards = new Map(await Promise.all(manifest.english.shards.map(async descriptor =>
    [descriptor.file, await readFile(join(directory, descriptor.file))])));
  return buildDictionarySuggestions({ manifest, shards });
}

export async function generateDictionarySuggestions({ root = ROOT, check = false } = {}) {
  const build = await loadDictionarySuggestionBuild({ directory: join(root, "vocab/data/expanded-dictionary") });
  const directory = join(root, "vocab/data/dictionary-suggestions");
  // Verify immutable existing namespace before writing anything, including its manifest pointer.
  for (const [file, bytes] of build.files) {
    let existing;
    try { existing = await readFile(join(directory, file)); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (check && (!existing || !existing.equals(bytes))) throw new Error(`Stale dictionary suggestion asset: ${file}`);
    if (!check && file !== "manifest.json" && existing && !existing.equals(bytes)) throw new Error(`Refusing to overwrite immutable suggestion asset: ${file}`);
  }
  if (!check) {
    for (const [file, bytes] of build.files) {
      const path = join(directory, file);
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
    }
  }
  return build;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(argument => argument !== "--check")) throw new Error("Usage: node build-dictionary-suggestions.mjs [--check]");
  const checking = process.argv.includes("--check");
  const build = await generateDictionarySuggestions({ check: checking });
  console.log(JSON.stringify({ ...build.manifest.counts, version: build.manifest.version,
    dictionaryVersion: build.manifest.dictionaryVersion, shards: build.manifest.shards.length,
    totalShardBytes: build.totalShardBytes, checked: checking }, null, 2));
}
