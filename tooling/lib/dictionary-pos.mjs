import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/u;
const SOURCE_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const CONTROL = /\p{Cc}|\p{Cf}/u;
const HAN = /\p{Script=Han}/u;
const BASE_SOURCES = new Set(["core", "mit", "public", "original", "supplement"]);
const digest = value => createHash("sha256").update(value).digest("hex");

export const DICTIONARY_POS_ID = "pos-completion-2026-10-19";
export const DICTIONARY_POS_SOURCE = Object.freeze({
  name: "原有释义＋词性校订",
  license: "Meanings retain their original licences; POS sources and review methods are listed in the notice",
  url: "https://zhuodashuai.github.io/vocab/dictionary-pos.html"
});

function invalid(message) { throw new Error(`Invalid dictionary POS review: ${message}.`); }
function object(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some(field => {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })) invalid(`${label} fields`);
}
function array(value, maximum, label, minimum = 0) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < minimum || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) invalid(label);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid(label);
  }
}
function text(value, maximum, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()
    || value.length > maximum || CONTROL.test(value)
    || typeof value.isWellFormed === "function" && !value.isWellFormed()) invalid(label);
  return value;
}
function lexical(value) {
  text(value, 200, "term");
  const normalized = value.normalize("NFKC").replace(/[‘’‛ʼ]/gu, "'").replace(/[“”„‟]/gu, '"').replace(/\s+/gu, " ").trim();
  if (normalized !== value || HAN.test(value) || !/[A-Za-z\p{Script=Latin}\d]/u.test(value)
    || /[<>]|javascript\s*:/iu.test(value)) invalid("term");
}
function httpsURL(value) {
  text(value, 2000, "source URL");
  if (/\s/u.test(value)) invalid("source URL");
  let parsed;
  try { parsed = new URL(value); } catch { invalid("source URL"); }
  if (!value.startsWith("https://") || parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname) invalid("source URL");
}

/** Word-level labels only: no English/Chinese sense alignment is implied or generated. */
export function validateDictionaryPos(pack) {
  object(pack, ["schemaVersion", "id", "sources", "entries"], "pack");
  if (pack.schemaVersion !== 1 || pack.id !== DICTIONARY_POS_ID) invalid("identity");
  if (!pack.sources || typeof pack.sources !== "object" || Array.isArray(pack.sources)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(pack.sources))) invalid("sources");
  const sourceIds = Reflect.ownKeys(pack.sources);
  if (!sourceIds.length || sourceIds.length > 32) invalid("source count");
  for (const id of sourceIds) {
    const descriptor = Object.getOwnPropertyDescriptor(pack.sources, id);
    if (typeof id !== "string" || !SOURCE_ID.test(id)
      || !("value" in descriptor) || !descriptor.enumerable) invalid("source key");
    const source = pack.sources[id];
    object(source, ["name", "url", "license", "sha256"], "source");
    text(source.name, 300, "source name");
    httpsURL(source.url);
    text(source.license, 1000, "source licence");
    if (typeof source.sha256 !== "string" || !HASH.test(source.sha256)) invalid("source hash");
  }
  array(pack.entries, 200_000, "entry count", 1);
  const terms = new Set();
  for (const entry of pack.entries) {
    object(entry, ["term", "baseSource", "meaningSha256", "partOfSpeech", "evidence"], "entry");
    lexical(entry.term);
    // Exact normalized spellings are identities. Polish/polish must not share an approval.
    if (terms.has(entry.term)) invalid(`duplicate term ${entry.term}`);
    terms.add(entry.term);
    if (!BASE_SOURCES.has(entry.baseSource)) invalid("base source");
    if (typeof entry.meaningSha256 !== "string" || !HASH.test(entry.meaningSha256)) invalid("meaning hash");
    text(entry.partOfSpeech, 200, "part of speech");
    if (!/^[A-Za-z][A-Za-z ()/·,;.-]*$/u.test(entry.partOfSpeech)) invalid("part of speech notation");
    array(entry.evidence, 32, "evidence", 1);
    const evidence = new Set();
    for (const item of entry.evidence) {
      object(item, ["source", "locator"], "evidence");
      if (typeof item.source !== "string" || !Object.hasOwn(pack.sources, item.source)) invalid("evidence source");
      text(item.locator, 1000, "evidence locator");
      const key = `${item.source}\n${item.locator}`;
      if (evidence.has(key)) invalid("duplicate evidence");
      evidence.add(key);
    }
  }
  return pack;
}

/** Preserve the reviewed JSON value/order rather than normalizing it while signing. */
export function dictionaryPosIntegrity(pack) {
  validateDictionaryPos(pack);
  return { schemaVersion: 1, id: pack.id, rows: pack.entries.length, semanticSha256: digest(JSON.stringify(pack)) };
}

/** Generation cannot approve an updated pack by rewriting its own independent root. */
export function verifyDictionaryPos(pack, integrity) {
  object(integrity, ["schemaVersion", "id", "rows", "semanticSha256"], "integrity");
  const expected = dictionaryPosIntegrity(pack);
  if (Object.entries(expected).some(([key, value]) => integrity[key] !== value)) invalid("independent semantic root mismatch");
  return pack;
}

/** Only an empty primary POS can be filled; immutable source variants are retained. */
export function applyDictionaryPosOverlay(records, pack) {
  validateDictionaryPos(pack);
  const entries = new Map(pack.entries.map(entry => [entry.term, entry]));
  const report = { id: pack.id, reviewedRows: entries.size, applied: 0, alreadyPresent: 0,
    baseMismatch: 0, missingTerms: 0, skipped: [] };
  const result = records.map(record => {
    const entry = entries.get(record.term);
    if (!entry) return record;
    entries.delete(record.term);
    // Later owner publication may make a reviewed label redundant. Never overwrite it.
    if (String(record.partOfSpeech || "").trim()) {
      report.alreadyPresent++;
      report.skipped.push({ term: record.term, reason: "primary-pos-already-present" });
      return record;
    }
    if (record.source !== entry.baseSource || digest(record.meaning) !== entry.meaningSha256) {
      report.baseMismatch++;
      report.skipped.push({ term: record.term, reason: "primary-source-or-meaning-changed" });
      return record;
    }
    const original = { partOfSpeech: record.partOfSpeech, meaning: record.meaning, source: record.source };
    const variants = [original, ...(record.variants || [])];
    if (variants.length > 8) invalid(`too many retained variants for ${record.term}`);
    report.applied++;
    return { ...record, partOfSpeech: entry.partOfSpeech, source: "pos-reviewed", variants };
  });
  for (const term of entries.keys()) {
    report.missingTerms++;
    report.skipped.push({ term, reason: "term-no-longer-present" });
  }
  return { records: result, report };
}
