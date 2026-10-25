import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadOriginalCatalogue } from "../lib/original-dictionary-catalogue.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const SOURCE = "原创例句·AI复核（精选义项）";
const SELF_CHECK_SOURCE = "原创例句·作者自查（精选义项）";
const sha = input => createHash("sha256").update(input).digest("hex");
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const text = (value, maximum, han = false) => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || CONTROL.test(value)
    || han && !/\p{Script=Han}/u.test(value)) throw Error("Invalid example text");
  return value;
};
export function exampleSourceHash(pack) {
  if (!pack || pack.schemaVersion !== 1 || pack.authorship !== "independent-composition" || !Array.isArray(pack.entries)) throw Error("Invalid authored-example source");
  if (Object.hasOwn(pack, "author") && !/^AI\/[a-z0-9_-]{1,100}$/u.test(pack.author)) throw Error("Invalid example author");
  return sha(JSON.stringify({ schemaVersion: pack.schemaVersion, batchId: pack.batchId, authorship: pack.authorship, entries: pack.entries,
    ...(Object.hasOwn(pack, "author") ? { author: pack.author } : {}) }));
}
export function validateExampleReview(pack, review) {
  const selfCheck = review?.mode === "author-selfcheck";
  const selectedTerms = selfCheck ? review.checkedTerms : review?.approvedTerms;
  if (!review || review.schemaVersion !== 1 || review.sourceSha256 !== exampleSourceHash(pack)
    || !/^AI\/[a-z0-9_-]{1,100}$/u.test(review.reviewer)
    || (selfCheck ? review.independentOfAuthor !== false || !pack.author || review.reviewer !== pack.author || Object.hasOwn(review, "approvedTerms")
      : review.mode !== undefined || review.independentOfAuthor !== true || Object.hasOwn(review, "checkedTerms") || pack.author === review.reviewer)
    || !Array.isArray(selectedTerms) || !Array.isArray(review.issues)) throw Error("Missing or stale example review or explicit author self-check");
  const approved = new Set(selectedTerms), terms = new Set();
  if (approved.size !== selectedTerms.length) throw Error("Duplicate selected example term");
  for (const row of pack.entries) {
    if (Object.keys(row).sort().join() !== "en,meaningZh,partOfSpeech,term,zh") throw Error("Unexpected authored example field");
    text(row.term, 200); text(row.partOfSpeech, 80); text(row.meaningZh, 2000, true); text(row.en, 1200); text(row.zh, 1200, true);
    if (!/[A-Za-z]/u.test(row.en) || terms.has(row.term)) throw Error("Repeated term or non-English example");
    terms.add(row.term);
  }
  if ([...approved].some(term => !terms.has(term))) throw Error("Review approves an absent term");
  for (const issue of review.issues) if (!terms.has(issue.term)
    || issue.blocking === true && !issue.resolution?.trim() && approved.has(issue.term)) throw Error("Unresolved example issue");
  return pack.entries.filter(row => approved.has(row.term)).map(row => ({ ...row, reviewer: review.reviewer,
    ...(selfCheck ? { source: SELF_CHECK_SOURCE } : {}) }));
}
export function exampleReviewAudit(entries) {
  const modes = { independentlyReviewed: { senses: 0, examples: 0 }, authorSelfcheck: { senses: 0, examples: 0 } };
  for (const entry of entries) for (const sense of entry.senses) {
    const mode = sense.source === SELF_CHECK_SOURCE ? modes.authorSelfcheck : modes.independentlyReviewed;
    mode.senses++; mode.examples += sense.examples.length;
  }
  if (!modes.authorSelfcheck.senses) return { reviewScope: "AI cross-reviewed selected-sense examples, not human certification or complete dictionary coverage" };
  return { reviewScope: "Selected-sense original examples with separately recorded independent AI review and author self-check; not human certification or complete dictionary coverage",
    reviewModes: modes };
}
export function validateExampleSourceIndex(index) {
  if (!index || typeof index !== "object" || Object.keys(index).sort().join() !== "schemaVersion,sourceFiles"
    || index.schemaVersion !== 1 || !Array.isArray(index.sourceFiles) || !index.sourceFiles.length || index.sourceFiles.length > 1000
    || new Set(index.sourceFiles).size !== index.sourceFiles.length
    || index.sourceFiles.some(file => typeof file !== "string" || !/^batch-\d{4}-[a-z0-9-]+\.json$/u.test(file))) throw Error("Invalid example source index");
  return [...index.sourceFiles];
}
function bucket(term) {
  let hash = 2166136261;
  for (const ch of term) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 256;
}
export function buildDictionaryExamples({ originalPack, authored = [], knownTerms }) {
  const allowed = new Set(knownTerms), heads = new Map(), seenSentences = new Map();
  let originalExamples = 0, addedExamples = 0, originalHeads = 0, addedHeads = 0;
  function add(term, sense, origin, source = SOURCE) {
    if (!allowed.has(term)) throw Error(`Example headword is absent from released dictionary: ${term}`);
    text(term, 200); text(sense.id, 120); text(sense.partOfSpeech, 80); text(sense.meaningZh, 2000, true);
    if (!Array.isArray(sense.examples) || !sense.examples.length || sense.examples.length > 8 || !/^AI\//u.test(sense.reviewer)) throw Error("Example lacks reviewed sense");
    if (source !== SOURCE && source !== SELF_CHECK_SOURCE) throw Error("Invalid example review source");
    for (const example of sense.examples) {
      text(example.en, 1200); text(example.zh, 1200, true);
      const exact = example.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
      const previous = seenSentences.get(exact);
      if (previous && previous !== term) throw Error(`Repeated sentence across unrelated terms: ${term}`);
      seenSentences.set(exact, term);
    }
    const entry = heads.get(term) || { term, senses: [] };
    if (entry.senses.some(value => value.id === sense.id)) throw Error(`Duplicate example sense: ${term}`);
    entry.senses.push({ ...sense, source });
    heads.set(term, entry);
    if (origin === "original") originalExamples += sense.examples.length; else addedExamples += sense.examples.length;
  }
  for (const entry of originalPack.entries) {
    if (entry.review.status !== "checked" || !entry.review.reviewer) continue;
    originalHeads++;
    for (const sense of entry.senses) add(entry.headword, { id: sense.id, partOfSpeech: sense.partOfSpeech,
      meaningZh: sense.definitionZh, examples: sense.examples.map(({ en, zh }) => ({ en, zh })), reviewer: entry.review.reviewer }, "original");
  }
  for (const row of authored) {
    if (heads.has(row.term)) throw Error(`New example must not overwrite existing reviewed head: ${row.term}`);
    addedHeads++;
    const senseKey = /^[a-zA-Z0-9:_-]+$/u.test(row.term) && row.term.length <= 100 ? row.term : sha(row.term).slice(0, 24);
    add(row.term, { id: `example:${senseKey}`, partOfSpeech: row.partOfSpeech, meaningZh: row.meaningZh,
      examples: [{ en: row.en, zh: row.zh }], reviewer: row.reviewer }, "added", row.source ?? SOURCE);
  }
  const entries = [...heads.values()].sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
  // Include the format in the namespace: never overwrite a legacy immutable
  // 16-bucket asset with different bytes at the same versioned URL.
  const version = sha(JSON.stringify({ schemaVersion: 2, bucketCount: 256, entries }));
  const files = new Map(), shards = [];
  const buckets = Array.from({ length: 256 }, () => []);
  for (const row of entries) buckets[bucket(row.term)].push(row);
  for (let number = 0; number < 256; number++) {
    const file = `${version}/examples-${number}.json`;
    const subset = buckets[number];
    const exampleCount = subset.reduce((sum, row) => sum + row.senses.reduce((n, sense) => n + sense.examples.length, 0), 0);
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 2, bucket: number, entries: subset }) + "\n");
    if (bytes.length > 1024 * 1024) throw Error("Example shard exceeds client limit");
    files.set(file, bytes); shards.push({ bucket: number, file, bytes: bytes.length, sha256: sha(bytes), heads: subset.length, examples: exampleCount });
  }
  const counts = { heads: entries.length, examples: originalExamples + addedExamples };
  // The old manifest stays intact for already-open v81 clients. New clients
  // use a constant-size directory and compute one bucket locally.
  const manifest = { schemaVersion: 2, version, counts, bucketCount: 256, hash: "fnv1a-codepoints-v1", shards };
  files.set("manifest-v2.json", Buffer.from(JSON.stringify(manifest) + "\n"));
  files.set("source-audit-v2.json", Buffer.from(JSON.stringify({ schemaVersion: 2, version, counts, originalHeads, originalExamples, addedHeads, addedExamples,
    licensedMeaningsChanged: false, commercialExamplesUsed: false, bookQuotesReusedAsOriginal: false,
    ...exampleReviewAudit(entries) }, null, 2) + "\n"));
  return { entries, manifest, files, originalHeads, originalExamples, addedHeads, addedExamples };
}
export async function loadExampleBuild({ additionalAuthored = [] } = {}) {
  const catalogue = await loadOriginalCatalogue();
  const manifest = JSON.parse(await readFile(join(ROOT, "vocab/data/expanded-dictionary/manifest.json"), "utf8"));
  const terms = new Set();
  for (const descriptor of manifest.english.shards) {
    const shard = JSON.parse(await readFile(join(ROOT, "vocab/data/expanded-dictionary", descriptor.file), "utf8"));
    for (const row of shard.records) terms.add(row.term);
  }
  const authored = [];
  const sourceFiles = validateExampleSourceIndex(JSON.parse(await readFile(join(ROOT, "tooling/dictionary/examples/index.json"), "utf8")));
  for (const file of sourceFiles) {
    const pack = JSON.parse(await readFile(join(ROOT, `tooling/dictionary/examples/source/${file}`), "utf8"));
    const review = JSON.parse(await readFile(join(ROOT, `tooling/dictionary/examples/reviews/${file}`), "utf8"));
    authored.push(...validateExampleReview(pack, review));
  }
  return buildDictionaryExamples({ originalPack: catalogue.pack, authored: [...authored, ...additionalAuthored], knownTerms: terms });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const build = await loadExampleBuild();
  const directory = join(ROOT, "vocab/data/dictionary-examples");
  const checking = process.argv.includes("--check");
  for (const [file, bytes] of build.files) {
    const path = join(directory, file);
    if (checking) {
      if (!(await readFile(path)).equals(bytes)) throw Error(`Stale example asset: ${file}`);
    } else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); }
  }
  console.log(JSON.stringify({ ...build.manifest.counts, version: build.manifest.version,
    originalHeads: build.originalHeads, originalExamples: build.originalExamples,
    addedHeads: build.addedHeads, addedExamples: build.addedExamples, checked: checking }, null, 2));
}
