import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { loadExampleBuild } from "./build-dictionary-examples.mjs";

// A resumable authoring queue, not an example generator. No provider calls.
const root = resolve(import.meta.dirname, "../..");
const [outputPath, countText = "2400", batch = "0003"] = process.argv.slice(2);
const count = Number(countText);
if (!outputPath || !Number.isSafeInteger(count) || count < 1 || count > 10000 || !/^\d{4}$/u.test(batch)) {
  throw Error("Usage: prepare-dictionary-example-batch.mjs ABSOLUTE_OUTPUT_DIR COUNT BATCH_NUMBER");
}
const output = resolve(outputPath);
const manifest = JSON.parse(await readFile(join(root, "vocab/data/expanded-dictionary/manifest.json"), "utf8"));
const build = await loadExampleBuild();
const covered = new Set(build.entries.map(row => row.term));
const records = new Map();
for (const descriptor of manifest.english.shards) {
  const payload = JSON.parse(await readFile(join(root, "vocab/data/expanded-dictionary", descriptor.file), "utf8"));
  for (const row of payload.records) records.set(row.term, row);
}
if (records.size !== manifest.counts.records) throw Error("Dictionary count mismatch");
const pending = [...records.values()].filter(row => !covered.has(row.term));
const eligible = pending.filter(row => row.partOfSpeech
  && /^[a-z]+(?:[-'][a-z]+)*$/u.test(row.term));
eligible.sort((a, b) => (a.seed?.rank || Number.MAX_SAFE_INTEGER) - (b.seed?.rank || Number.MAX_SAFE_INTEGER)
  || a.term.localeCompare(b.term, "en"));
const selected = eligible.slice(0, count);
if (selected.length !== count) throw Error("Insufficient uncovered source records");
await mkdir(output, { recursive: true });
await writeFile(join(output, "pending-headwords.json"), JSON.stringify({ schemaVersion: 1,
  dictionaryVersion: manifest.version, currentExampleVersion: build.manifest.version,
  status: "not-yet-authored", entries: pending.map(row => ({ term: row.term, partOfSpeech: row.partOfSpeech,
    meaning: row.meaning, rank: row.seed?.rank ?? null })) }) + "\n");
const queues = [];
for (let start = 0, index = 0; start < selected.length; start += 200, index++) {
  const suffix = index < 26 ? String.fromCharCode(97 + index) : String(index);
  const file = `batch-${batch}-${suffix}.json`;
  const entries = selected.slice(start, start + 200).map(row => ({ term: row.term,
    partOfSpeech: row.partOfSpeech, meaning: row.meaning, rank: row.seed?.rank ?? null }));
  queues.push({ file, count: entries.length, first: entries[0].term, last: entries.at(-1).term });
  await writeFile(join(output, file), JSON.stringify({ schemaVersion: 1, sourceDictionaryVersion: manifest.version,
    authorship: "not-authored-input-queue", entries }, null, 2) + "\n");
}
const report = { schemaVersion: 1, dictionaryHeads: records.size, previouslyCoveredHeads: covered.size,
  uncoveredHeads: records.size - covered.size, batchHeads: selected.length, queues,
  selection: "Uncovered canonical terms with a nonempty published POS label, ordered by existing seed frequency rank; source labels still require semantic review, and remaining terms are not discarded" };
await writeFile(join(output, "queue-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
