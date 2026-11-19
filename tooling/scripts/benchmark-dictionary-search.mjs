import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const corpusFile = new URL("../dictionary/search-benchmarks/2026-11-19.json", import.meta.url);
const sha = value => createHash("sha256").update(value).digest("hex");
const folded = value => value.normalize("NFKC").toLocaleLowerCase("en-US");

export function validateSearchBenchmark(value) {
  if (value?.schemaVersion !== 1 || value.id !== "search-experience-2026-11-19" || !Array.isArray(value.queries)
    || value.queries.length !== 235) throw new Error("Expected the finite 235-query benchmark.");
  const ids = new Set(), inputs = new Set();
  for (const row of value.queries) {
    if (!row || typeof row.id !== "string" || ids.has(row.id) || !["en", "zh"].includes(row.language)
      || typeof row.category !== "string" || typeof row.query !== "string" || !row.query || row.query.length > 200 || inputs.has(row.query)
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(row.query)
      || Object.keys(row).some(key => !["id", "language", "category", "query", "expectedHeads", "excludedHeads", "knownPending", "knownIncorrectForm"].includes(key))) throw new Error("Invalid or duplicate benchmark input.");
    for (const key of ["expectedHeads", "excludedHeads"]) if (row[key] !== undefined && (!Array.isArray(row[key]) || !row[key].length
      || row[key].some(head => typeof head !== "string" || !head.trim() || head.length > 200 || /[<>\u0000-\u001f]/u.test(head))
      || new Set(row[key]).size !== row[key].length)) throw new Error("Invalid head expectation.");
    if (row.knownPending !== undefined && (typeof row.knownPending !== "string" || !row.knownPending.trim())) throw new Error("Invalid pending note.");
    if (row.knownIncorrectForm !== undefined && (typeof row.knownIncorrectForm !== "string" || !row.knownIncorrectForm.trim())) throw new Error("Invalid incorrect-form note.");
    ids.add(row.id); inputs.add(row.query);
  }
  if (value.queries.filter(row => row.language === "en").length !== 115 || value.queries.filter(row => row.language === "zh").length !== 120
    || value.queries.filter(row => row.knownPending).length !== 3) throw new Error("Benchmark language/pending counts changed.");
  return value;
}

export function benchmarkHeadEvidence(row, results) {
  const expected = new Set((row.expectedHeads || []).map(folded)), excluded = new Set((row.excludedHeads || []).map(folded));
  const at = results.findIndex(result => expected.has(folded(result.term)));
  return { available: results.length > 0, evaluated: expected.size > 0, expectedHeadFound: expected.size ? at >= 0 : null,
    firstExpectedPosition: at >= 0 ? at + 1 : null, expectedHeadTop1: at === 0, expectedHeadTop5: at >= 0 && at < 5,
    excludedHeadViolations: results.filter(result => excluded.has(folded(result.term))).map(result => result.term) };
}

async function outputOutsideCheckout(destination, report) {
  const absolute = path.resolve(destination), relative = path.relative(root, absolute);
  if (!relative || !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error("Reports must be written outside the checkout.");
  // Resolve the nearest existing ancestor too, so an outside symlink cannot
  // route a report back into source/data or historical fixtures.
  let ancestor = path.dirname(absolute);
  while (true) {
    try { ancestor = await fs.realpath(ancestor); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; const parent = path.dirname(ancestor); if (parent === ancestor) throw error; ancestor = parent; }
  }
  const actual = path.relative(await fs.realpath(root), ancestor);
  if (!actual || !actual.startsWith(`..${path.sep}`) && !path.isAbsolute(actual)) throw new Error("Report ancestor is inside the checkout.");
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, JSON.stringify(report, null, 2) + "\n");
}

export async function runSearchBenchmark({ output } = {}) {
  const runnerSha256 = sha(await fs.readFile(new URL(import.meta.url)));
  const raw = await fs.readFile(corpusFile), corpus = validateSearchBenchmark(JSON.parse(raw));
  const manifestBytes = await fs.readFile(new URL("../../vocab/data/expanded-dictionary/manifest.json", import.meta.url));
  const manifest = JSON.parse(manifestBytes), head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
  const dirtyWorkingTree = Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root }).toString().trim());
  const moduleHashes = {};
  for (const file of (await fs.readdir(new URL("../../vocab/js/", import.meta.url))).filter(name => name.endsWith(".js")).sort()) {
    moduleHashes[`vocab/js/${file}`] = sha(await fs.readFile(new URL(`../../vocab/js/${file}`, import.meta.url)));
  }
  const { searchExpandedDictionary } = await import(new URL("../../vocab/js/expanded-dictionary.js", import.meta.url));
  const { suggestDictionaryTerms } = await import(new URL("../../vocab/js/dictionary-suggestions.js", import.meta.url));
  const staticReads = [], dataRoot = path.resolve(root, "vocab/data");
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url), file = fileURLToPath(parsed), relative = path.relative(dataRoot, file);
    if (parsed.protocol !== "file:" || options?.credentials !== "omit" || !relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Only authenticated local static reads are permitted.");
    const bytes = await fs.readFile(file);
    staticReads.push({ file: path.relative(root, file).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha(bytes) });
    return new Response(bytes);
  };
  const rows = [];
  for (const item of corpus.queries) {
    const started = performance.now(), before = staticReads.length, results = []; let pages = 0, offset = 0, coverage = "full", advertisedTotal = null, error;
    try {
      const seen = new Set();
      while (true) {
        const page = await searchExpandedDictionary(item.query, { fetchImpl, limit: 50, offset }); pages++;
        if (["limited", "basic"].includes(page.coverage)) coverage = page.coverage;
        if (item.language === "zh" && (coverage !== "full" || page.ranking !== "global" || page.relatedIntegrated !== true
          || !Number.isSafeInteger(page.total) || page.total < 0)) throw new Error("Complete globally ranked Chinese stream is unavailable.");
        if (Number.isSafeInteger(page.total)) { if (advertisedTotal !== null && advertisedTotal !== page.total) throw new Error("Page total changed."); advertisedTotal = page.total; }
        for (const row of page.results) { if (seen.has(row.term)) throw new Error("Duplicate head across pages."); seen.add(row.term); results.push(row); }
        if (!page.hasMore) break;
        if (item.language !== "zh" || coverage !== "full" || !Number.isSafeInteger(page.nextOffset) || page.nextOffset <= offset) throw new Error("Incomplete or non-progressing result stream.");
        offset = page.nextOffset;
      }
      if (advertisedTotal !== null && coverage === "full" && advertisedTotal !== results.length) throw new Error("Full stream does not match total.");
    } catch (failure) { error = { code: failure.code || failure.name, message: failure.message }; }
    const evidence = benchmarkHeadEvidence(item, results), row = { ...item, ...evidence, coverage, pages,
      searchMs: +(performance.now() - started).toFixed(2), staticReads: staticReads.length - before, results, ...(error ? { error } : {}) };
    if (item.category === "typo" && !error) {
      const started = performance.now();
      try {
        const suggestions = await suggestDictionaryTerms(item.query, { fetchImpl, dictionaryVersion: manifest.version });
        row.spellingProbe = { independentHelperProbe: true, uiWouldRequestOnConfirmedMiss: results.length === 0 && coverage === "full",
          ms: +(performance.now() - started).toFixed(2), suggestions,
          expectedHeadFound: suggestions.some(candidate => (item.expectedHeads || []).some(term => folded(term) === folded(candidate.term))) };
      } catch (failure) { row.spellingProbe = { error: { code: failure.code || failure.name, message: failure.message } }; }
    }
    rows.push(row);
  }
  if (execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim() !== head) throw new Error("Git HEAD moved during the benchmark.");
  if (sha(await fs.readFile(new URL(import.meta.url))) !== runnerSha256) throw new Error("Benchmark runner changed during execution.");
  const expected = rows.filter(row => row.evaluated), typos = rows.filter(row => row.category === "typo");
  const report = { schemaVersion: 1, atUTC: new Date().toISOString(), benchmarkId: corpus.id, gitHead: head, dirtyWorkingTree,
    benchmarkSha256: sha(raw), runnerSha256, manifestVersion: manifest.version, manifestSha256: sha(manifestBytes), moduleHashes,
    scope: "235 finite inputs; actual complete Chinese streams. Availability and expected-head accuracy are separate. Timings use local disk and a sequential warm cache, not browser/internet latency or competitor performance.",
    summary: { inputs: rows.length, distinctInputs: new Set(rows.map(row => row.query)).size, available: rows.filter(row => row.available).length,
      unavailable: rows.filter(row => !row.available).map(row => row.query), searchErrors: rows.filter(row => row.error).length,
      headExpectations: expected.length, expectedHeadFound: expected.filter(row => row.expectedHeadFound).length,
      expectedHeadTop1: expected.filter(row => row.expectedHeadTop1).length, expectedHeadTop5: expected.filter(row => row.expectedHeadTop5).length,
      headMisses: expected.filter(row => !row.expectedHeadFound).map(row => row.query), exclusions: rows.filter(row => row.excludedHeads).length,
      excludedHeadViolations: rows.filter(row => row.excludedHeadViolations.length).map(row => ({ query: row.query, terms: row.excludedHeadViolations })),
      typoCases: typos.length, independentSpellingHeadFound: typos.filter(row => row.spellingProbe?.expectedHeadFound).length,
      typoUiEligible: typos.filter(row => row.spellingProbe?.uiWouldRequestOnConfirmedMiss).length, knownPending: rows.filter(row => row.knownPending).map(row => row.query),
      knownIncorrectForms: rows.filter(row => row.knownIncorrectForm).map(row => ({ query: row.query, issue: row.knownIncorrectForm })),
      resultPositions: rows.reduce((sum, row) => sum + row.results.length, 0), staticReads: staticReads.length,
      allChinesePagesValidated: rows.filter(row => row.language === "zh").every(row => !row.error && row.coverage === "full"),
      staticBytes: staticReads.reduce((sum, read) => sum + read.bytes, 0), externalNetworkCalls: 0, accountWrites: 0 }, rows, staticReads };
  if (output) await outputOutsideCheckout(output, report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--output" || !args[1])) throw new Error("Usage: node tooling/scripts/benchmark-dictionary-search.mjs [--output OUTSIDE_CHECKOUT.json]");
  const report = await runSearchBenchmark({ output: args[1] });
  console.log(JSON.stringify({ gitHead: report.gitHead, dirtyWorkingTree: report.dirtyWorkingTree, ...report.summary }, null, 2));
  if (report.summary.searchErrors || report.summary.excludedHeadViolations.length) process.exitCode = 1;
}
