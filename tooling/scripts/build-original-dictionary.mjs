import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportOriginalDictionary } from "../lib/original-dictionary-exports.mjs";
import { loadOriginalCatalogue } from "../lib/original-dictionary-catalogue.mjs";

const arg = key => process.argv.slice(2).find(value => value.startsWith(`${key}=`))?.slice(key.length + 1);
try {
  const output = arg("--out");
  if (!output) throw new Error("Use --out=<new directory outside the public repository>. Optional --source=<original pack.json> --candidates=<headword queue.json>.");
  const source = arg("--source");
  const candidatePath = arg("--candidates");
  const catalogue = source ? null : await loadOriginalCatalogue(arg("--reviews") ? { reviewDirectory: arg("--reviews") } : {});
  const pack = source ? JSON.parse(await readFile(source, "utf8")) : catalogue.pack;
  if (source && pack.entries.some(entry => entry.review?.status === "checked")) throw new Error("Standalone source files must remain drafts. Use the catalogue and hash-bound independent reviews for checked exports.");
  const candidates = candidatePath ? JSON.parse(await readFile(candidatePath, "utf8")) : null;
  const report = await exportOriginalDictionary(pack, { directory: output, candidates });
  console.log(JSON.stringify({ output: resolve(output), ...report, reviews: catalogue?.reviewSummary ?? [] }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
