import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  foldOriginalHeadword, normalizeOriginalHeadword, parseOriginalDictionary,
  selectPublishableOriginalEntries
} from "./original-dictionary.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const columns = ["entry_id", "headword", "kind", "part_of_speech", "sense_number", "meaning_zh", "definition_en", "example_en", "example_zh", "review_status", "reviewer", "authorship_method"];

/** CSV is an Excel editing view, never executable formula content. */
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/u.test(text) || /^[\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function encodeCsv(rows) {
  return `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function childOf(root, path) {
  const part = relative(root, path);
  return !part || (!part.startsWith("..") && !isAbsolute(part));
}

function validateCandidates(payload) {
  if (!payload) return null;
  const topFields = ["schemaVersion", "purpose", "status", "targetHeadwordCount", "selectedCandidateCount", "eligibleCandidateCount", "reviewedHeadwordCount", "originalDefinitionCount", "sixPdfCoverageComplete", "coverageNote", "source", "statistics", "headwords"];
  const sourceFields = ["name", "license", "url", "commit", "sha256"];
  const statFields = ["sourceRows", "shapeRejected", "knownErrorsRejected", "explicitInflectionRowsExcluded", "caseDuplicatesMerged"];
  const keysExactly = (object, fields) => object && typeof object === "object" && !Array.isArray(object)
    && Object.keys(object).length === fields.length && Object.keys(object).every(key => fields.includes(key));
  if (!keysExactly(payload, topFields) || !keysExactly(payload.source, sourceFields) || !keysExactly(payload.statistics, statFields)) throw new Error("Unexpected candidate metadata fields.");
  const source = payload.source;
  if (source.name !== "ECDICT headwords and lexical ranking metadata only" || source.license !== "MIT"
    || !/^[0-9a-f]{40}$/u.test(source.commit) || !/^[0-9a-f]{64}$/u.test(source.sha256)
    || source.url !== `https://github.com/skywind3000/ECDICT/blob/${source.commit}/ecdict.csv`) throw new Error("Invalid pinned headword source metadata.");
  if ([payload.targetHeadwordCount, payload.selectedCandidateCount, payload.eligibleCandidateCount, ...statFields.map(key => payload.statistics[key])].some(value => !Number.isSafeInteger(value) || value < 0)
    || payload.targetHeadwordCount < 1 || payload.targetHeadwordCount > 500000
    || payload.selectedCandidateCount !== Math.min(payload.targetHeadwordCount, payload.eligibleCandidateCount)
    || payload.statistics.sourceRows - statFields.slice(1).reduce((sum, key) => sum + payload.statistics[key], 0) !== payload.eligibleCandidateCount
    || typeof payload.coverageNote !== "string" || payload.coverageNote.length > 1000) throw new Error("Invalid candidate coverage counts.");
  if (payload.schemaVersion !== 1 || payload.purpose !== "headword-candidate-queue-only"
    || payload.status !== "unreviewed" || payload.sixPdfCoverageComplete !== false
    || payload.reviewedHeadwordCount !== 0 || payload.originalDefinitionCount !== 0
    || !Array.isArray(payload.headwords) || payload.headwords.length !== payload.selectedCandidateCount
    || payload.headwords.length > 500000) throw new Error("Invalid unreviewed headword queue.");
  const keys = new Set();
  for (const row of payload.headwords) {
    if (!row || Object.keys(row).some(key => !["headword", "observedSpellings", "status", "definitionStatus"].includes(key))
      || typeof row.headword !== "string" || !/^[A-Za-z]+(?:['-][A-Za-z]+)*$/u.test(row.headword)
      || row.headword.length > 100 || row.status !== "candidate" || row.definitionStatus !== "not-authored"
      || !Array.isArray(row.observedSpellings) || !row.observedSpellings.length
      || row.observedSpellings.some(value => typeof value !== "string" || foldOriginalHeadword(value) !== foldOriginalHeadword(row.headword))) {
      throw new Error("Candidate rows must contain headwords only, with no definitions or examples.");
    }
    const key = foldOriginalHeadword(row.headword);
    if (keys.has(key)) throw new Error(`Duplicate candidate headword: ${row.headword}`);
    keys.add(key);
  }
  return payload;
}

/** Deliberately local-only: outputs cannot go into the Pages repository. */
export async function exportOriginalDictionary(pack, { directory, candidates = null } = {}) {
  const parsed = parseOriginalDictionary(pack);
  validateCandidates(candidates);
  if (!directory) throw new Error("An explicit new output directory is required.");
  const target = resolve(directory);
  // Requiring an existing parent also makes realpath resolve symlink escapes.
  const parent = await realpath(dirname(target));
  const canonicalTarget = resolve(parent, basename(target));
  const actualRepo = await realpath(REPO);
  if (childOf(actualRepo, canonicalTarget)) throw new Error("Keep draft outputs outside the public repository.");
  await mkdir(canonicalTarget); // Exclusive: never overwrite an existing bundle.

  const ready = selectPublishableOriginalEntries(parsed);
  const readyIds = new Set(ready.map(entry => entry.id));
  const authoredKeys = new Set(parsed.entries.map(entry => foldOriginalHeadword(entry.headword)));
  const reviewedKeys = new Set(ready.map(entry => foldOriginalHeadword(entry.headword)));
  const candidatesWithWriting = candidates?.headwords.filter(row => authoredKeys.has(foldOriginalHeadword(row.headword))).length ?? 0;
  const candidatesWithReview = candidates?.headwords.filter(row => reviewedKeys.has(foldOriginalHeadword(row.headword))).length ?? 0;
  const fullTargetChecked = Boolean(candidates && candidates.targetHeadwordCount >= 70000
    && candidates.selectedCandidateCount === candidates.targetHeadwordCount
    && candidatesWithReview === candidates.targetHeadwordCount);
  const report = {
    schemaVersion: 1, name: parsed.name, status: "local-draft-only",
    targetHeadwords: candidates?.targetHeadwordCount ?? 70000,
    headwordCandidates: candidates?.selectedCandidateCount ?? 0,
    reviewedHeadwordCandidates: 0,
    independentlyWrittenEntries: parsed.entries.length,
    independentlyWrittenWordEntries: parsed.entries.filter(entry => entry.kind === "word").length,
    independentlyWrittenPhraseEntries: parsed.entries.filter(entry => entry.kind === "phrase").length,
    candidateHeadwordsWithWriting: candidatesWithWriting,
    candidateHeadwordsWithoutWriting: (candidates?.selectedCandidateCount ?? 0) - candidatesWithWriting,
    candidateHeadwordsWithRecordedReview: candidatesWithReview,
    independentlyWrittenSenses: parsed.entries.reduce((sum, entry) => sum + entry.senses.length, 0),
    originalBilingualExamples: parsed.entries.reduce((sum, entry) => sum + entry.senses.reduce((count, sense) => count + sense.examples.length, 0), 0),
    checkedEntriesEligibleForExport: ready.length,
    checkedByAiEntries: ready.filter(entry => entry.review.reviewer.startsWith("AI/")).length,
    otherNamedReviewEntries: ready.filter(entry => !entry.review.reviewer.startsWith("AI/")).length,
    exhaustiveSenseCoverageVerified: false,
    releasePolicy: "all-70000-target-headwords-complete-before-production-upload",
    fullTargetChecked,
    publicReadyEntries: fullTargetChecked ? ready.length : 0,
    allHeadwordsHaveDefinitions: false, sixPdfCoverageComplete: false,
    productionIntegrated: false,
    note: "Headword candidates are not completed dictionary entries. Draft content is excluded from public-ready.json. No six-PDF completeness or legal-clearance claim is made.",
    candidateSource: candidates ? {
      name: candidates.source.name, license: candidates.source.license, url: candidates.source.url,
      commit: candidates.source.commit, sha256: candidates.source.sha256
    } : null
  };
  const table = [columns];
  const forms = [["entry_id", "headword", "form"]];
  const database = new DatabaseSync(resolve(canonicalTarget, "zhuo-dictionary-draft.sqlite"));
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE build_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE entries(id TEXT PRIMARY KEY, headword TEXT NOT NULL, kind TEXT NOT NULL, publishable INTEGER NOT NULL CHECK(publishable IN(0,1)), payload TEXT NOT NULL);
      CREATE TABLE aliases(exact TEXT NOT NULL, folded TEXT NOT NULL, entry_id TEXT NOT NULL REFERENCES entries(id), kind TEXT NOT NULL, PRIMARY KEY(exact,entry_id,kind));
      CREATE INDEX aliases_folded ON aliases(folded);
      CREATE INDEX aliases_exact ON aliases(exact,kind);
      CREATE TABLE senses(id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id), part_of_speech TEXT NOT NULL, definition_zh TEXT NOT NULL, definition_en TEXT NOT NULL);
      CREATE TABLE examples(sense_id TEXT NOT NULL REFERENCES senses(id), example_number INTEGER NOT NULL, en TEXT NOT NULL, zh TEXT NOT NULL, PRIMARY KEY(sense_id,example_number));
      CREATE TABLE headword_candidates(folded TEXT PRIMARY KEY, headword TEXT NOT NULL, observed_spellings TEXT NOT NULL, status TEXT NOT NULL CHECK(status='candidate'));
      BEGIN;
    `);
    database.prepare("INSERT INTO build_metadata VALUES(?,?)").run("report", JSON.stringify(report));
    const addEntry = database.prepare("INSERT INTO entries VALUES(?,?,?,?,?)");
    const addAlias = database.prepare("INSERT OR IGNORE INTO aliases VALUES(?,?,?,?)");
    const addSense = database.prepare("INSERT INTO senses VALUES(?,?,?,?,?)");
    const addExample = database.prepare("INSERT INTO examples VALUES(?,?,?,?)");
    for (const entry of parsed.entries) {
      addEntry.run(entry.id, entry.headword, entry.kind, Number(readyIds.has(entry.id)), JSON.stringify(entry));
      const exact = normalizeOriginalHeadword(entry.headword);
      addAlias.run(exact, foldOriginalHeadword(exact), entry.id, "headword");
      for (const form of entry.forms) {
        const normalized = normalizeOriginalHeadword(form);
        addAlias.run(normalized, foldOriginalHeadword(normalized), entry.id, "form");
        forms.push([entry.id, entry.headword, form]);
      }
      entry.senses.forEach((sense, senseIndex) => {
        addSense.run(sense.id, entry.id, sense.partOfSpeech, sense.definitionZh, sense.definitionEn);
        sense.examples.forEach((example, exampleIndex) => {
          addExample.run(sense.id, exampleIndex + 1, example.en, example.zh);
          table.push([entry.id, entry.headword, entry.kind, sense.partOfSpeech, senseIndex + 1, sense.definitionZh,
            sense.definitionEn, example.en, example.zh, entry.review.status, entry.review.reviewer, entry.authorship.method]);
        });
      });
    }
    const insertCandidate = database.prepare("INSERT INTO headword_candidates VALUES(?,?,?,'candidate')");
    for (const row of candidates?.headwords ?? []) {
      insertCandidate.run(foldOriginalHeadword(row.headword), row.headword, JSON.stringify(row.observedSpellings));
    }
    database.exec("COMMIT;");
    if (database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("SQLite integrity check failed.");
    if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error("SQLite references are inconsistent.");
  } finally { database.close(); }

  const write = (name, text) => writeFile(resolve(canonicalTarget, name), text, { encoding: "utf8", flag: "wx" });
  await write("dictionary-draft.json", JSON.stringify(parsed, null, 2) + "\n");
  await write("checked-content.json", JSON.stringify({ schemaVersion: 1, name: parsed.name, entries: ready }, null, 2) + "\n");
  await write("public-ready.json", JSON.stringify({ schemaVersion: 1, name: parsed.name, entries: fullTargetChecked ? ready : [] }, null, 2) + "\n");
  await write("original-entries.csv", encodeCsv(table));
  await write("forms.csv", encodeCsv(forms));
  if (candidates) {
    await write("headword-candidates.csv", encodeCsv([
      ["headword", "observed_spellings", "status", "definition_status", "source"],
      ...candidates.headwords.map(row => [row.headword, row.observedSpellings.join(" | "), row.status, row.definitionStatus, "ECDICT headwords only; MIT"])
    ]));
    await write("ECDICT-HEADWORDS-LICENSE.txt", await readFile(resolve(REPO, "vocab/data/ECDICT-LICENSE.txt"), "utf8"));
  }
  await write("build-report.json", JSON.stringify(report, null, 2) + "\n");
  return report;
}

/** Indexed literal lookup, not a call to an AI or translation provider. */
export function searchOriginalDatabase(database, query, { includeDrafts = false } = {}) {
  if (typeof query !== "string" || query.length > 200 || !query.trim()) throw new Error("Enter an English headword or phrase of at most 200 characters.");
  const exact = normalizeOriginalHeadword(query);
  const folded = foldOriginalHeadword(query);
  const visibility = includeDrafts ? "" : " AND e.publishable=1";
  let rows = database.prepare(`SELECT DISTINCT e.id,e.payload FROM aliases a JOIN entries e ON e.id=a.entry_id WHERE a.exact=? AND a.kind='headword'${visibility} ORDER BY e.id`).all(exact);
  if (!rows.length) rows = database.prepare(`SELECT DISTINCT e.id,e.payload FROM aliases a JOIN entries e ON e.id=a.entry_id WHERE a.folded=?${visibility} ORDER BY e.id`).all(folded);
  if (rows.length) return { status: rows.length === 1 ? "found" : "ambiguous", draftMode: includeDrafts, entries: rows.map(row => JSON.parse(row.payload)) };
  // Registration of a headword is not a usable meaning. Keep that distinction visible.
  const candidate = database.prepare("SELECT headword FROM headword_candidates WHERE folded=?").get(folded);
  return { status: candidate ? "candidate-only" : "missing", draftMode: includeDrafts, entries: [],
    ...(candidate ? { headword: candidate.headword, message: "词头已登记，原创释义尚未完成或尚未通过发布审核。" } : {}) };
}
