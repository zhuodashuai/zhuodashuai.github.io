import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadOriginalCatalogue } from "../lib/original-dictionary-catalogue.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const SOURCE = "原创例句·AI复核（精选义项）";
const sha = input => createHash("sha256").update(input).digest("hex");
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const text = (value, maximum, han = false) => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || CONTROL.test(value)
    || han && !/\p{Script=Han}/u.test(value)) throw Error("Invalid example text");
  return value;
};
export function exampleSourceHash(pack) {
  if (!pack || pack.schemaVersion !== 1 || pack.authorship !== "independent-composition" || !Array.isArray(pack.entries)) throw Error("Invalid authored-example source");
  return sha(JSON.stringify({ schemaVersion: pack.schemaVersion, batchId: pack.batchId, authorship: pack.authorship, entries: pack.entries }));
}
export function validateExampleReview(pack, review) {
  if (!review || review.schemaVersion !== 1 || review.sourceSha256 !== exampleSourceHash(pack)
    || !/^AI\/[a-z0-9_-]{1,100}$/u.test(review.reviewer) || review.independentOfAuthor !== true
    || !Array.isArray(review.approvedTerms) || !Array.isArray(review.issues)) throw Error("Missing or stale independent example review");
  const approved = new Set(review.approvedTerms), terms = new Set();
  if (approved.size !== review.approvedTerms.length) throw Error("Duplicate reviewed term");
  for (const row of pack.entries) {
    if (Object.keys(row).sort().join() !== "en,meaningZh,partOfSpeech,term,zh") throw Error("Unexpected authored example field");
    text(row.term, 200); text(row.partOfSpeech, 80); text(row.meaningZh, 2000, true); text(row.en, 1200); text(row.zh, 1200, true);
    if (!/[A-Za-z]/u.test(row.en) || terms.has(row.term)) throw Error("Repeated term or non-English example");
    terms.add(row.term);
  }
  if ([...approved].some(term => !terms.has(term))) throw Error("Review approves an absent term");
  for (const issue of review.issues) if (!terms.has(issue.term)
    || issue.blocking === true && !issue.resolution?.trim() && approved.has(issue.term)) throw Error("Unresolved example issue");
  return pack.entries.filter(row => approved.has(row.term)).map(row => ({ ...row, reviewer: review.reviewer }));
}
function bucket(term) {
  let hash = 2166136261;
  for (const ch of term) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 16;
}
export function buildDictionaryExamples({ originalPack, authored = [], knownTerms }) {
  const allowed = new Set(knownTerms), heads = new Map(), seenSentences = new Map();
  let originalExamples = 0, addedExamples = 0, originalHeads = 0, addedHeads = 0;
  function add(term, sense, origin) {
    if (!allowed.has(term)) throw Error(`Example headword is absent from released dictionary: ${term}`);
    text(term, 200); text(sense.id, 120); text(sense.partOfSpeech, 80); text(sense.meaningZh, 2000, true);
    if (!Array.isArray(sense.examples) || !sense.examples.length || sense.examples.length > 8 || !/^AI\//u.test(sense.reviewer)) throw Error("Example lacks reviewed sense");
    for (const example of sense.examples) {
      text(example.en, 1200); text(example.zh, 1200, true);
      const exact = example.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
      const previous = seenSentences.get(exact);
      if (previous && previous !== term) throw Error(`Repeated sentence across unrelated terms: ${term}`);
      seenSentences.set(exact, term);
    }
    const entry = heads.get(term) || { term, senses: [] };
    if (entry.senses.some(value => value.id === sense.id)) throw Error(`Duplicate example sense: ${term}`);
    entry.senses.push({ ...sense, source: SOURCE });
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
    add(row.term, { id: `example:${row.term}`, partOfSpeech: row.partOfSpeech, meaningZh: row.meaningZh,
      examples: [{ en: row.en, zh: row.zh }], reviewer: row.reviewer }, "added");
  }
  const entries = [...heads.values()].sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
  const version = sha(JSON.stringify(entries));
  const keys = Object.fromEntries(entries.map(row => [row.term, bucket(row.term)]));
  const files = new Map(), shards = [];
  for (let number = 0; number < 16; number++) {
    const file = `${version}/examples-${number}.json`;
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, bucket: number, entries: entries.filter(row => bucket(row.term) === number) }) + "\n");
    if (bytes.length > 1024 * 1024) throw Error("Example shard exceeds client limit");
    files.set(file, bytes); shards.push({ bucket: number, file, bytes: bytes.length, sha256: sha(bytes) });
  }
  const counts = { heads: entries.length, examples: originalExamples + addedExamples };
  const manifest = { schemaVersion: 1, version, counts, shards, keys };
  files.set("manifest.json", Buffer.from(JSON.stringify(manifest) + "\n"));
  files.set("source-audit.json", Buffer.from(JSON.stringify({ schemaVersion: 1, version, counts, originalHeads, originalExamples, addedHeads, addedExamples,
    licensedMeaningsChanged: false, commercialExamplesUsed: false, bookQuotesReusedAsOriginal: false,
    reviewScope: "AI cross-reviewed selected-sense examples, not human certification or complete dictionary coverage" }, null, 2) + "\n"));
  return { entries, manifest, files, originalHeads, originalExamples, addedHeads, addedExamples };
}
export async function loadExampleBuild() {
  const catalogue = await loadOriginalCatalogue();
  const manifest = JSON.parse(await readFile(join(ROOT, "vocab/data/expanded-dictionary/manifest.json"), "utf8"));
  const terms = new Set();
  for (const descriptor of manifest.english.shards) {
    const shard = JSON.parse(await readFile(join(ROOT, "vocab/data/expanded-dictionary", descriptor.file), "utf8"));
    for (const row of shard.records) terms.add(row.term);
  }
  const authored = [];
  for (const name of ["batch-0001-a", "batch-0001-b"]) {
    const pack = JSON.parse(await readFile(join(ROOT, `tooling/dictionary/examples/source/${name}.json`), "utf8"));
    const review = JSON.parse(await readFile(join(ROOT, `tooling/dictionary/examples/reviews/${name}.json`), "utf8"));
    authored.push(...validateExampleReview(pack, review));
  }
  return buildDictionaryExamples({ originalPack: catalogue.pack, authored, knownTerms: terms });
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
