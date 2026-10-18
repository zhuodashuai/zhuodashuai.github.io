import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportOriginalDictionary } from "../lib/original-dictionary-exports.mjs";

const arg = key => process.argv.slice(2).find(value => value.startsWith(`${key}=`))?.slice(key.length + 1);
try {
  const output = arg("--out");
  if (!output) throw new Error("Use --out=<new directory outside the public repository>. Optional --source=<original pack.json> --candidates=<headword queue.json>.");
  const source = arg("--source") || resolve(import.meta.dirname, "../dictionary/source/original-pilot.json");
  const candidatePath = arg("--candidates");
  const pack = JSON.parse(await readFile(source, "utf8"));
  const candidates = candidatePath ? JSON.parse(await readFile(candidatePath, "utf8")) : null;
  const report = await exportOriginalDictionary(pack, { directory: output, candidates });
  console.log(JSON.stringify({ output: resolve(output), ...report }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
