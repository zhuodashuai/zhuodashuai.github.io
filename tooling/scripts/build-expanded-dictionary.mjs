/** Licensed/public Chinese glosses, deterministic search shards, no online lookup. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOriginalCatalogue } from "../lib/original-dictionary-catalogue.mjs";
import { parseOriginalDictionary } from "../lib/original-dictionary.mjs";
import { parsePublicSnapshot } from "../../vocab/js/wordbook-schema.js";
import { personalDictionaryResult } from "../../vocab/js/personal-dictionary.js";

const ROOT = resolve(import.meta.dirname, "../..");
const BUCKETS = 128;
const SOURCE_URL = "https://github.com/skywind3000/ECDICT";
const PUBLIC_URL = "https://zhuodashuai.github.io/vocab/";
const HASH = /^[a-f0-9]{64}$/u;
const FORBIDDEN = /[^\P{Cc}\n\t]|\p{Cf}/u;
const HAN = /\p{Script=Han}/u;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const expandedSha256 = value => createHash("sha256").update(value).digest("hex");
const json = value => `${JSON.stringify(value)}\n`;

export function normalizeExpandedTerm(value) {
  return value.normalize("NFKC").replace(/[‘’‛ʼ]/gu, "'").replace(/[“”„‟]/gu, '"').replace(/\s+/gu, " ").trim();
}
export const expandedKey = value => normalizeExpandedTerm(value).toLocaleLowerCase("en-US");
export function expandedBucket(value) {
  let hash = 2166136261;
  for (const character of value) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % BUCKETS;
}
export function expandedChineseTokens(value) {
  const tokens = new Set();
  for (const run of normalizeExpandedTerm(value).match(/\p{Script=Han}+/gu) || []) {
    const characters = [...run];
    for (let index = 0; index < characters.length; index++) {
      tokens.add(characters[index]);
      if (index + 1 < characters.length) tokens.add(characters[index] + characters[index + 1]);
    }
  }
  return [...tokens].sort(cmp);
}
function text(value, maximum, label, { empty = false, chinese = false } = {}) {
  if (typeof value !== "string" || value.length > maximum || FORBIDDEN.test(value)
    || typeof value.isWellFormed === "function" && !value.isWellFormed()
    || !empty && !value.trim() || chinese && !HAN.test(value)) throw new Error(`Invalid expanded ${label}; no text is truncated.`);
  return value.trim();
}
function term(value, label = "term") {
  const result = normalizeExpandedTerm(text(value, 200, label));
  if (!result || HAN.test(result) || !/[A-Za-z\p{Script=Latin}\d]/u.test(result) || /[<>]|javascript\s*:/iu.test(result)) throw new Error(`Invalid expanded English ${label}.`);
  return result;
}
function forms(value, label) {
  if (!Array.isArray(value) || value.length > 64) throw new Error(`Invalid expanded forms: ${label}.`);
  return [...new Set(value.map(item => term(item, `${label} form`)))].sort(cmp);
}
function row(value, label) {
  return { term: term(value.term, label), partOfSpeech: text(value.partOfSpeech, 200, `${label} POS`, { empty: true }),
    meaning: text(value.meaning, 2000, `${label} meaning`, { chinese: true }), forms: forms(value.forms, label) };
}
function validateSource(value) {
  if (!value || value.name !== "ECDICT" || value.license !== "MIT" || value.url?.replace(/\/$/u, "") !== SOURCE_URL
    || !/^[a-f0-9]{40}$/u.test(value.commit) || !HASH.test(value.sha256)) throw new Error("A pinned, licensed ECDICT source is required.");
  return { name: "ECDICT", license: "MIT", url: SOURCE_URL, commit: value.commit, sha256: value.sha256 };
}
export function normalizeExpandedSeed(prepared) {
  if (!prepared || prepared.schemaVersion !== 1 || !Array.isArray(prepared.rows)) throw new Error("Invalid prepared expanded source.");
  const source = validateSource(prepared.source);
  const rows = [], seen = new Set();
  for (const raw of prepared.rows) {
    // Existing editorial rows are read independently from the tracked core.
    if (raw.source === "core") continue;
    if (raw.source !== undefined && raw.source !== "mit") throw new Error("Unknown prepared source label.");
    const parsed = row(raw, "MIT row");
    if (seen.has(parsed.term) || !Number.isSafeInteger(raw.rank) || raw.rank < 0 || typeof raw.workbook !== "boolean") throw new Error(`Duplicate or invalid MIT seed: ${parsed.term}.`);
    seen.add(parsed.term); rows.push({ ...parsed, rank: raw.rank, workbook: raw.workbook });
  }
  rows.sort((a, b) => a.rank - b.rank || cmp(a.term, b.term));
  return { schemaVersion: 1, source, rows };
}
export function expandedSeedIntegrity(prepared) {
  const seed = normalizeExpandedSeed(prepared);
  const audit = prepared.audit || {};
  const headlistSha256 = prepared.headlistSha256 || audit.headlistSha256 || audit.candidateHeadwordsSha256 || null;
  const workbookHeadsSha256 = prepared.workbookHeadsSha256 || audit.workbookHeadsSha256 || null;
  if (headlistSha256 !== null && !HASH.test(headlistSha256) || workbookHeadsSha256 !== null && !HASH.test(workbookHeadsSha256)) throw new Error("Invalid headword-list digest.");
  return { schemaVersion: 1, source: seed.source, rows: seed.rows.length,
    semanticSha256: expandedSha256(JSON.stringify(seed.rows)), headlistSha256, workbookHeadsSha256 };
}
function coreRows(payload) {
  if (payload?.schemaVersion !== 1 || payload.source?.name !== "ECDICT" || payload.source?.license !== "MIT"
    || !Array.isArray(payload.columns) || !Array.isArray(payload.entries)) throw new Error("Invalid tracked core.");
  const index = Object.fromEntries(["word", "partOfSpeech", "meaning", "forms"].map(name => [name, payload.columns.indexOf(name)]));
  if (Object.values(index).some(value => value < 0)) throw new Error("Missing tracked core columns.");
  const omittedWithoutChinese = payload.entries.filter(raw => typeof raw[index.meaning] === "string" && !HAN.test(raw[index.meaning])).map(raw => raw[index.word]);
  const rows = payload.entries.filter(raw => !omittedWithoutChinese.includes(raw[index.word])).map(raw => {
    // The metadata column can contain only the first POS. Reuse the shipped
    // member result's labelled-gloss coverage, but keep the original gloss text.
    const projected = personalDictionaryResult({ word: raw[index.word], partOfSpeech: raw[index.partOfSpeech], meaning: raw[index.meaning] });
    return row({ term: raw[index.word], partOfSpeech: projected.partOfSpeech, meaning: raw[index.meaning], forms: raw[index.forms] }, "core");
  });
  return { rows, omittedWithoutChinese };
}
function originalRows(pack) {
  const parsed = parseOriginalDictionary(pack);
  return parsed.entries.filter(entry => entry.review.status === "checked").map(entry => ({ term: entry.headword,
    partOfSpeech: [...new Set(entry.senses.map(sense => sense.partOfSpeech))].join(" · "),
    meaning: entry.senses.map((sense, index) => `${index + 1}. ${sense.partOfSpeech}：${sense.definitionZh}`).join("\n"),
    forms: [...entry.forms] }));
}

/** The caller supplies a hash-verified catalogue; authors cannot self-sign via CLI. */
export function buildExpandedDictionary({ prepared, corePayload, publicPayload, originalPack }) {
  const seed = normalizeExpandedSeed(prepared);
  const snapshot = parsePublicSnapshot(publicPayload, { allowLegacy: false });
  const sources = {
    core: { name: "ECDICT · 已上线核心整理", license: "MIT and project editorial additions", url: SOURCE_URL,
      sha256: expandedSha256(JSON.stringify(corePayload)) },
    mit: seed.source,
    public: { name: "卓的公开词库", license: "Public project content; not relabelled as ECDICT", url: PUBLIC_URL,
      sha256: expandedSha256(JSON.stringify(publicPayload)) },
    original: { name: "卓式原创释义（AI复核，精选义项）", license: "Project original content; AI-reviewed, not human-certified", url: PUBLIC_URL,
      sha256: expandedSha256(JSON.stringify(originalPack)) }
  };
  const cards = new Map();
  function add(source, raw) {
    const parsed = row(raw, source);
    let card = cards.get(parsed.term);
    if (!card) { card = { term: parsed.term, forms: new Set(), variants: new Map(), contexts: [] }; cards.set(parsed.term, card); }
    if (card.variants.has(source)) throw new Error(`Repeated ${source} canonical row: ${parsed.term}.`);
    const variant = { partOfSpeech: parsed.partOfSpeech, meaning: parsed.meaning, source };
    card.variants.set(source, variant);
    for (const form of parsed.forms) if (form !== parsed.term) card.forms.add(form);
    return card;
  }
  // Existing editorial fixes stay primary. The richer licensed row remains a
  // separate variant, so a selected original sense never erases other POS.
  const acceptedCore = coreRows(corePayload);
  for (const item of acceptedCore.rows) add("core", item);
  for (const item of seed.rows) {
    const card = add("mit", item);
    card.seed = { rank: item.rank, forms: item.forms, workbook: item.workbook };
  }
  const omittedPublic = [], omittedPublicAliases = [];
  const publicAliasesInput = snapshot.entries.reduce((total, entry) => total + entry.readingContexts.filter(context => expandedKey(context.originalInput) !== expandedKey(entry.term)).length, 0);
  for (const entry of snapshot.entries) {
    let card;
    try { card = add("public", { term: entry.term, partOfSpeech: entry.partOfSpeech, meaning: entry.meaning, forms: entry.forms || [] }); }
    catch (error) {
      if (!error.message.startsWith("Invalid expanded")) throw error;
      omittedPublic.push({ term: entry.term, reason: "Outside member term/POS/Chinese-gloss limits; retained unchanged in the public wordbook." });
      omittedPublicAliases.push(...entry.readingContexts.filter(context => expandedKey(context.originalInput) !== expandedKey(entry.term)).map(context => context.originalInput)); continue;
    }
    for (const context of entry.readingContexts) {
      try {
        const alias = term(context.originalInput, "public reading alias");
        if (expandedKey(alias) === expandedKey(entry.term)) continue;
        card.contexts.push({ key: expandedKey(alias), term: alias,
          partOfSpeech: text(context.partOfSpeech, 200, "context POS", { empty: true }),
          meaning: text(context.meaning, 2000, "context meaning", { chinese: true }) });
      } catch { omittedPublicAliases.push(context.originalInput); }
    }
  }
  const reviewed = originalRows(originalPack);
  for (const item of reviewed) add("original", item);
  const priority = new Map(seed.rows.map((item, index) => [item.term, index]));
  const sorted = [...cards.values()].sort((a, b) => (priority.get(a.term) ?? Number.MAX_SAFE_INTEGER) - (priority.get(b.term) ?? Number.MAX_SAFE_INTEGER) || cmp(a.term, b.term));
  const records = [], references = new Map();
  function reference(key, ref) {
    const existing = references.get(key) || [];
    if (!existing.some(value => JSON.stringify(value) === JSON.stringify(ref))) existing.push(ref);
    references.set(key, existing);
  }
  for (const [index, card] of sorted.entries()) {
    if (card.forms.size > 64) throw new Error(`Too many combined forms: ${card.term}.`);
    const ordered = ["core", "mit", "public", "original"].flatMap(source => card.variants.has(source) ? [card.variants.get(source)] : []);
    const primary = ordered[0];
    const id = index * BUCKETS + expandedBucket(expandedKey(card.term));
    const record = { id, term: card.term, partOfSpeech: primary.partOfSpeech, meaning: primary.meaning,
      forms: [...card.forms].sort(cmp), source: primary.source,
      ...(ordered.length > 1 ? { variants: ordered.slice(1) } : {}), ...(card.seed ? { seed: card.seed } : {}) };
    records.push(record);
    reference(expandedKey(card.term), { id, kind: "canonical" });
    for (const form of record.forms) reference(expandedKey(form), { id, kind: "form", term: form });
    for (const context of card.contexts) reference(context.key, { id, kind: "context", term: context.term, partOfSpeech: context.partOfSpeech, meaning: context.meaning });
  }
  const chinese = new Map();
  for (const record of records) {
    const tokens = new Set([record, ...(record.variants || [])].flatMap(variant => expandedChineseTokens(variant.meaning)));
    for (const token of tokens) {
      const ids = chinese.get(token) || []; ids.push(record.id); chinese.set(token, ids);
    }
  }
  const keyRows = [...references].sort(([a], [b]) => cmp(a, b)).map(([key, refs]) => [key, refs.sort((a, b) => a.id - b.id || cmp(a.kind, b.kind) || cmp(JSON.stringify(a), JSON.stringify(b)))]);
  const tokenRows = [...chinese].sort(([a], [b]) => cmp(a, b));
  const counts = { records: records.length, englishKeys: keyRows.length, chineseTokens: tokenRows.length };
  const version = expandedSha256(JSON.stringify({ records, keyRows, tokenRows, sources, counts }));
  const english = { buckets: BUCKETS, shards: [] }, chineseManifest = { buckets: BUCKETS, shards: [] };
  const files = new Map();
  const byId = new Map(records.map(record => [record.id, record]));
  for (let bucket = 0; bucket < BUCKETS; bucket++) {
    const keys = keyRows.filter(([key]) => expandedBucket(key) === bucket);
    const ids = new Set(keys.flatMap(([, refs]) => refs.map(ref => ref.id)));
    const enRecords = [...ids].sort((a, b) => a - b).map(id => byId.get(id));
    const postings = tokenRows.filter(([token]) => expandedBucket(token) === bucket);
    for (const [kind, payload, manifestPart, count] of [
      ["en", { schemaVersion: 2, kind: "en", bucket, records: enRecords, keys }, english, keys.length],
      ["zh", { schemaVersion: 2, kind: "zh", bucket, postings }, chineseManifest, postings.length]
    ]) {
      const file = `${version}/${kind}-${String(bucket).padStart(3, "0")}.json`;
      const bytes = json(payload); files.set(file, bytes);
      manifestPart.shards.push({ bucket, file, sha256: expandedSha256(bytes), bytes: Buffer.byteLength(bytes), count });
    }
  }
  const manifest = { schemaVersion: 2, version, counts, sources, english, chinese: chineseManifest };
  const report = { schemaVersion: 1, version, counts, mitRows: seed.rows.length,
    workbookMitRows: seed.rows.filter(item => item.workbook).length, coreRowsInput: corePayload.entries.length,
    coreRows: acceptedCore.rows.length, coreOmittedWithoutChinese: acceptedCore.omittedWithoutChinese,
    publicRowsInput: snapshot.entries.length, publicRows: snapshot.entries.length - omittedPublic.length,
    omittedPublic, publicAliasesInput,
    publicAliases: [...cards.values()].reduce((total, card) => total + card.contexts.length, 0),
    omittedPublicAliases, originalCheckedRows: reviewed.length,
    canonicalCasefoldCollisions: [...references.values()].filter(refs => refs.filter(ref => ref.kind === "canonical").length > 1).length,
    ambiguousAliasKeys: [...references.values()].filter(refs => !refs.some(ref => ref.kind === "canonical") && new Set(refs.map(ref => ref.id)).size > 1).length,
    totalShardBytes: [...files.values()].reduce((total, bytes) => total + Buffer.byteLength(bytes), 0),
    commercialDefinitionsUsed: false, sourcePolicy: "Licensed MIT meanings plus tracked editorial/public and hash-reviewed original variants; no publisher dictionary text." };
  return { manifest, files, report, records, seed };
}

/** Exhaustively validate canonical/alias references and every Han posting. */
export function validateExpandedBuild(build) {
  const { manifest, files, records } = build;
  const byId = new Map(records.map(record => [record.id, record]));
  const parsedEnglish = manifest.english.shards.map(descriptor => JSON.parse(files.get(descriptor.file)));
  const englishKeys = parsedEnglish.map(shard => new Map(shard.keys));
  const actualTokens = new Map(); let canonicalCount = 0, keys = 0, tokens = 0;
  for (const descriptor of manifest.english.shards) {
    const content = files.get(descriptor.file);
    if (expandedSha256(content) !== descriptor.sha256 || Buffer.byteLength(content) !== descriptor.bytes) throw new Error("English shard integrity failure.");
    const shard = parsedEnglish[descriptor.bucket]; const available = new Map(shard.records.map(record => [record.id, record]));
    keys += shard.keys.length;
    for (const record of shard.records) {
      if (JSON.stringify(record) !== JSON.stringify(byId.get(record.id))) throw new Error("Cross-shard record mismatch.");
      if (record.id % BUCKETS === descriptor.bucket) canonicalCount++;
    }
    for (const [key, refs] of shard.keys) {
      if (expandedBucket(key) !== descriptor.bucket || !refs.length) throw new Error("Invalid English key bucket.");
      for (const ref of refs) if (!available.has(ref.id)) throw new Error("Alias would require a second English shard.");
    }
  }
  for (const record of records) {
    const canonicalRefs = englishKeys[record.id % BUCKETS].get(expandedKey(record.term));
    if (!canonicalRefs?.some(ref => ref.id === record.id && ref.kind === "canonical")) throw new Error(`Missing canonical: ${record.term}.`);
    for (const variant of [record, ...(record.variants || [])]) for (const token of expandedChineseTokens(variant.meaning)) {
      const ids = actualTokens.get(token) || new Set(); ids.add(record.id); actualTokens.set(token, ids);
    }
    for (const form of record.forms) {
      const key = expandedKey(form); const refs = englishKeys[expandedBucket(key)].get(key);
      if (!refs?.some(ref => ref.id === record.id)) throw new Error(`Missing explicit form: ${form}.`);
    }
  }
  for (const descriptor of manifest.chinese.shards) {
    const content = files.get(descriptor.file);
    if (expandedSha256(content) !== descriptor.sha256 || Buffer.byteLength(content) !== descriptor.bytes) throw new Error("Chinese shard integrity failure.");
    const shard = JSON.parse(content); tokens += shard.postings.length;
    for (const [token, ids] of shard.postings) {
      if (expandedBucket(token) !== descriptor.bucket || JSON.stringify(ids) !== JSON.stringify([...(actualTokens.get(token) || [])].sort((a, b) => a - b))) throw new Error(`Incorrect Han posting: ${token}.`);
      actualTokens.delete(token);
    }
  }
  if (canonicalCount !== records.length || keys !== manifest.counts.englishKeys || tokens !== manifest.counts.chineseTokens || actualTokens.size) throw new Error("Expanded full coverage counts disagree.");
  return { canonicalRecords: canonicalCount, englishKeys: keys, chineseTokens: tokens, allReferencesVerified: true, allHanPostingsVerified: true };
}

export async function recoverExpandedSeed(directory, integrity) {
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 2 || !HASH.test(manifest.version)) throw new Error("Invalid existing expanded manifest.");
  const rows = [];
  for (const descriptor of manifest.english.shards) {
    if (!new RegExp(`^${manifest.version}/en-[0-9]{3}\\.json$`, "u").test(descriptor.file)) throw new Error("Unsafe existing shard path.");
    const bytes = await readFile(resolve(directory, descriptor.file));
    if (expandedSha256(bytes) !== descriptor.sha256 || bytes.length !== descriptor.bytes) throw new Error("Existing shard has changed.");
    for (const record of JSON.parse(bytes).records) {
      if (record.id % BUCKETS !== descriptor.bucket || !record.seed) continue;
      const mit = [record, ...(record.variants || [])].find(item => item.source === "mit");
      if (!mit) throw new Error("Missing MIT variant for immutable source seed.");
      rows.push({ term: record.term, partOfSpeech: mit.partOfSpeech, meaning: mit.meaning, ...record.seed });
    }
  }
  const prepared = { schemaVersion: 1, source: integrity.source, rows,
    headlistSha256: integrity.headlistSha256, workbookHeadsSha256: integrity.workbookHeadsSha256 };
  if (JSON.stringify(expandedSeedIntegrity(prepared)) !== JSON.stringify(integrity)) throw new Error("MIT semantic root mismatch; neither regenerated shard hashes nor a rewritten manifest can approve changed definitions.");
  return prepared;
}
export async function generateExpandedDictionary({ root = ROOT, preparedPath, check = false } = {}) {
  const directory = resolve(root, "vocab/data/expanded-dictionary");
  const integrityPath = resolve(root, "tooling/dictionary/expanded-source-integrity.json");
  let integrity;
  try { integrity = JSON.parse(await readFile(integrityPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  let prepared;
  if (preparedPath) {
    prepared = JSON.parse(await readFile(preparedPath, "utf8"));
    const candidate = expandedSeedIntegrity(prepared);
    if (integrity && JSON.stringify(candidate) !== JSON.stringify(integrity)) throw new Error("Prepared source does not match the reviewed MIT semantic root.");
    if (!integrity) {
      if (check) throw new Error("Missing reviewed source integrity root.");
      integrity = candidate; await mkdir(resolve(root, "tooling/dictionary"), { recursive: true });
      await writeFile(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`);
    }
  } else {
    if (!integrity) throw new Error("First bootstrap requires --prepared=<private prepared-input.json>; subsequent builds use tracked shards and the independent integrity root.");
    prepared = await recoverExpandedSeed(directory, integrity);
  }
  const [coreBytes, publicBytes, catalogue, license] = await Promise.all([
    readFile(resolve(root, "vocab/data/ecdict-core.json")), readFile(resolve(root, "vocab/data/owner-wordbook.json")),
    loadOriginalCatalogue({ indexPath: resolve(root, "tooling/dictionary/source/index.json"), reviewDirectory: resolve(root, "tooling/dictionary/reviews") }),
    readFile(resolve(root, "vocab/data/ECDICT-LICENSE.txt"), "utf8")
  ]);
  const build = buildExpandedDictionary({ prepared, corePayload: JSON.parse(coreBytes), publicPayload: JSON.parse(publicBytes), originalPack: catalogue.pack });
  const verification = validateExpandedBuild(build);
  const manifestBytes = json(build.manifest);
  if (check) {
    if (await readFile(resolve(directory, "manifest.json"), "utf8") !== manifestBytes) throw new Error("Expanded manifest is stale.");
    if (await readFile(resolve(directory, "ECDICT-LICENSE.txt"), "utf8") !== license) throw new Error("Expanded MIT license notice is missing or changed.");
    for (const [file, bytes] of build.files) if (await readFile(resolve(directory, file), "utf8") !== bytes) throw new Error(`Expanded shard is stale: ${file}.`);
  } else {
    await mkdir(resolve(directory, build.manifest.version), { recursive: true });
    for (const [file, bytes] of build.files) await writeFile(resolve(directory, file), bytes);
    await writeFile(resolve(directory, "manifest.json"), manifestBytes);
    await writeFile(resolve(directory, "ECDICT-LICENSE.txt"), license);
    await writeFile(resolve(directory, "source-audit.json"), `${JSON.stringify({ ...build.report, integrity, verification }, null, 2)}\n`);
  }
  return { ...build.report, verification };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv.find(argument => argument.startsWith("--prepared="))?.slice("--prepared=".length);
  generateExpandedDictionary({ preparedPath: input, check: process.argv.includes("--check") })
    .then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
