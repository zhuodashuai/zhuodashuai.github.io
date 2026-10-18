import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { csvCell, encodeCsv, exportOriginalDictionary, searchOriginalDatabase } from "../lib/original-dictionary-exports.mjs";

function entry(id = "zhuo:hip", headword = "hip", forms = ["hips"]) {
  return { id, headword, kind: "word", forms,
    senses: [{ id: `${id}:noun:1`, partOfSpeech: "noun", definitionZh: "身体侧面连接腿部的髋部。", definitionEn: "The part of the body where the upper leg joins the trunk.", examples: [{ en: "Her hip hurt after the long walk.", zh: "长距离步行后，她的髋部疼痛。" }] }],
    authorship: { method: "independent-composition", agent: "AI-assisted draft", referenceUse: "headwords-only" },
    review: { status: "draft", reviewer: "", note: "Test-only original draft." } };
}
const pack = entries => ({ schemaVersion: 1, name: "卓式词典", entries });
const queue = () => ({ schemaVersion: 1, purpose: "headword-candidate-queue-only", status: "unreviewed", sixPdfCoverageComplete: false, reviewedHeadwordCount: 0, originalDefinitionCount: 0, selectedCandidateCount: 1, eligibleCandidateCount: 1, targetHeadwordCount: 70000, coverageNote: "Test-only queue; not a completed dictionary.",
  source: { name: "ECDICT headwords and lexical ranking metadata only", license: "MIT", commit: "a".repeat(40), sha256: "b".repeat(64), url: `https://github.com/skywind3000/ECDICT/blob/${"a".repeat(40)}/ecdict.csv` },
  statistics: { sourceRows: 1, shapeRejected: 0, knownErrorsRejected: 0, explicitInflectionRowsExcluded: 0, caseDuplicatesMerged: 0 },
  headwords: [{ headword: "headword", observedSpellings: ["headword"], status: "candidate", definitionStatus: "not-authored" }] });

test("CSV values are quoted, formulas inert, and Excel sees UTF-8 Chinese", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  for (const value of ["=SUM(A1)", "+cmd", "-cmd", "@cmd", "  =cmd", "\tcmd"]) assert.ok(csvCell(value).startsWith('"\''));
  assert.ok(encodeCsv([["中文", "line\nbreak"]]).startsWith("\uFEFF"));
});

test("local bundle has a real indexed SQLite DB, editable CSV and an empty checked export for drafts", async t => {
  const parent = await mkdtemp(resolve(tmpdir(), "zhuo-original-export-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const directory = resolve(parent, "bundle");
  const report = await exportOriginalDictionary(pack([entry()]), { directory, candidates: queue() });
  assert.equal(report.independentlyWrittenEntries, 1);
  assert.equal(report.checkedEntriesEligibleForExport, 0);
  assert.equal(report.sixPdfCoverageComplete, false);
  const ready = JSON.parse(await readFile(resolve(directory, "public-ready.json"), "utf8"));
  assert.deepEqual(ready.entries, []);
  const db = new DatabaseSync(resolve(directory, "zhuo-dictionary-draft.sqlite"), { readOnly: true });
  try {
    assert.equal(searchOriginalDatabase(db, "hips").status, "missing");
    assert.equal(searchOriginalDatabase(db, "hips", { includeDrafts: true }).entries[0].headword, "hip");
    assert.equal(searchOriginalDatabase(db, "headword").status, "candidate-only");
    assert.equal(searchOriginalDatabase(db, "totally absent").status, "missing");
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(db.prepare("SELECT count(*) AS n FROM senses").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM examples").get().n, 1);
  } finally { db.close(); }
  assert.match(await readFile(resolve(directory, "original-entries.csv"), "utf8"), /身体侧面/u);
  assert.match(await readFile(resolve(directory, "ECDICT-HEADWORDS-LICENSE.txt"), "utf8"), /MIT License/u);
  await assert.rejects(exportOriginalDictionary(pack([entry()]), { directory }), /exist/i);
});

test("only checked AND named-reviewer records reach the publishable file or default database view", async t => {
  const parent = await mkdtemp(resolve(tmpdir(), "zhuo-original-publish-gate-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const checked = entry(); checked.review = { status: "checked", reviewer: "test-reviewer", note: "test" };
  const unnamed = entry("zhuo:body", "body", []); unnamed.review.status = "checked";
  const directory = resolve(parent, "bundle");
  const report = await exportOriginalDictionary(pack([checked, unnamed]), { directory });
  assert.equal(report.checkedEntriesEligibleForExport, 1);
  assert.equal(report.fullTargetChecked, false);
  assert.equal(report.publicReadyEntries, 0);
  assert.equal(JSON.parse(await readFile(resolve(directory, "checked-content.json"), "utf8")).entries.length, 1);
  assert.equal(JSON.parse(await readFile(resolve(directory, "public-ready.json"), "utf8")).entries.length, 0);
  const db = new DatabaseSync(resolve(directory, "zhuo-dictionary-draft.sqlite"), { readOnly: true });
  try { assert.equal(searchOriginalDatabase(db, "hips").status, "found"); assert.equal(searchOriginalDatabase(db, "body").status, "missing"); }
  finally { db.close(); }
});

test("SQLite lookup preserves literal headwords and reports colliding forms instead of silently selecting", async t => {
  const parent = await mkdtemp(resolve(tmpdir(), "zhuo-original-ambiguity-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const entries = [entry("zhuo:axes", "axes", []), entry("zhuo:axe", "axe", ["axes"]), entry("zhuo:axis", "axis", ["axes"])];
  const directory = resolve(parent, "bundle");
  await exportOriginalDictionary(pack(entries), { directory });
  const db = new DatabaseSync(resolve(directory, "zhuo-dictionary-draft.sqlite"), { readOnly: true });
  try {
    assert.equal(searchOriginalDatabase(db, "axes", { includeDrafts: true }).entries[0].headword, "axes");
    const result = searchOriginalDatabase(db, "AXES", { includeDrafts: true });
    assert.equal(result.status, "ambiguous"); assert.equal(result.entries.length, 3);
  } finally { db.close(); }
});

test("public repo destinations and contaminated headword-only queues are rejected", async () => {
  await assert.rejects(exportOriginalDictionary(pack([entry()]), { directory: resolve(import.meta.dirname, "../draft-output") }), /outside the public repository/u);
  const candidates = queue(); candidates.headwords[0].definition = "unexpected source copy";
  await assert.rejects(exportOriginalDictionary(pack([entry()]), { directory: resolve(tmpdir(), "should-not-be-created"), candidates }), /headwords only/u);
  const duplicate = queue(); duplicate.headwords.push({ ...duplicate.headwords[0] }); duplicate.selectedCandidateCount = 2; duplicate.eligibleCandidateCount = 2; duplicate.statistics.sourceRows = 2;
  await assert.rejects(exportOriginalDictionary(pack([entry()]), { directory: resolve(tmpdir(), "should-not-be-created"), candidates: duplicate }), /Duplicate/u);
});

test("candidate metadata cannot smuggle source definitions or falsify coverage counts into exported reports", async () => {
  for (const alter of [value => { value.source.definition = "do not copy"; }, value => { value.definition = "do not copy"; },
    value => { value.selectedCandidateCount = 70000; }, value => { value.source.license = "permission-claimed-without-evidence"; },
    value => { value.sixPdfCoverageComplete = true; }]) {
    const candidates = queue(); alter(candidates);
    await assert.rejects(exportOriginalDictionary(pack([entry()]), { directory: resolve(tmpdir(), "should-not-be-created"), candidates }));
  }
});
