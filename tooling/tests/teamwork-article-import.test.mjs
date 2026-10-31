import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createBlankEntry, contextualizeReadingEntry, entryLookupKeys, parsePublicSnapshot } from "../../vocab/js/wordbook-schema.js";
import { buildCollectionCatalog } from "../../vocab/js/collections.js";
import { entrySynonymFingerprint, pendingSynonymScan } from "../../vocab/js/synonym-evidence.js";
import { importTeamworkArticle, planTeamworkArticleImport, serializeTeamworkSnapshot,
  teamworkArticleEntryId } from "../scripts/import-teamwork-article.mjs";

const oldDate = "2026-10-01T12:00:00.000Z", now = "2026-10-31T12:00:00.000Z";
const sha = value => createHash("sha256").update(value).digest("hex");
function fixture() {
  const existing = { ...createBlankEntry("bandwidth"), id: "public-existing-bandwidth", revision: 3,
    partOfSpeech: "noun", meaning: "带宽；通信信道能够传输的数据量", definition: "The amount of data a communication channel can carry.",
    exampleEn: "Video calls require enough bandwidth.", exampleZh: "视频通话需要足够的带宽。",
    usage: "原有技术义。", register: "technical", author: "Earlier author", sourceTitle: "Earlier book — Chapter 1",
    sourceWork: "Earlier book", sourceUrl: "https://example.org/earlier", sourceDate: "2010",
    attributionStatus: "verified", attributionNote: "原有出处与例句。", createdAt: oldDate, updatedAt: oldDate };
  existing.senses = [{ partOfSpeech: "noun", meaningZh: existing.meaning, definitionEn: existing.definition,
    usageNotes: existing.usage, register: "technical", collocations: ["network bandwidth"],
    examples: [{ en: existing.exampleEn, zh: existing.exampleZh }], confusables: [] }];
  existing.sources = [{ title: "Earlier book", url: existing.sourceUrl, kind: "primary", retrievedAt: oldDate }];
  existing.tags = ["collection:earlier-book:chapter-1", "技术"];
  existing.readingContexts = [{ membership: existing.tags[0], order: 1, page: "p. 2", originalInput: "bandwidth",
    entryType: "word", partOfSpeech: "noun", meaning: existing.meaning, definition: existing.definition,
    usage: existing.usage, register: "technical", collocations: [], confusedWith: [], forms: [],
    exampleEn: existing.exampleEn, exampleZh: existing.exampleZh, sourceTitle: existing.sourceTitle,
    sourceWork: existing.sourceWork, sourceDate: "p. 2", attributionNote: existing.attributionNote }];
  const untouched = { ...createBlankEntry("quorum"), id: "public-untouched-quorum", createdAt: oldDate, updatedAt: oldDate };
  const snapshot = { schemaVersion: 3, revisionId: "fixture-before", lastMutationId: "fixture-mutation", exportedAt: oldDate,
    entries: [untouched, existing] };
  const item = { term: "bandwidth", originalInput: "bandwidth", entryType: "word", partOfSpeech: "noun",
    meaning: "可用的时间、精力或处理能力", definitionEn: "The time and mental capacity available for additional work.",
    usage: "本文为工作承受能力的比喻义。", exampleEn: "The team has no bandwidth for another project.",
    exampleZh: "团队没有余力再接一个项目。", forms: [], collocations: ["mental bandwidth"], tags: ["资源与能力"],
    pdfPage: 3, printedPage: 4, category: "资源与能力", order: 1,
    reuseExistingEntryId: existing.id, duplicateDecision: { action: "reuse-distinct-context", reason: "保留既有技术义，仅增加本文的精力义语境。" } };
  const fresh = { ...structuredClone(item), term: "compelling direction", originalInput: "compelling direction",
    entryType: "phrase", partOfSpeech: "noun phrase", meaning: "有吸引力且能激发投入的方向", definitionEn: "A clear and worthwhile direction that motivates a team to act.",
    usage: "本文指能激励成员投入的共同方向。", exampleEn: "A compelling direction gave the team a shared purpose.",
    exampleZh: "一个鼓舞人心的方向使团队有了共同目标。", collocations: ["set a compelling direction"], order: 2,
    reuseExistingEntryId: teamworkArticleEntryId(4, "compelling direction"),
    duplicateDecision: { action: "new-card", reason: "基线没有这一完整表达。" } };
  const source = { schemaVersion: 1, format: "reviewed-article-collection-contexts", collection: { id: "teamwork", title: "Teamwork" },
    chapter: { id: "chapter-4", number: 4, title: "The Secrets of Great Teamwork" },
    sourceTitle: "Teamwork — The Secrets of Great Teamwork", articleTitle: "The Secrets of Great Teamwork",
    authors: "Martine Haas; Mark Mortensen", issue: "June 2016", sourceUrl: "https://hbr.org/2016/06/the-secrets-of-great-teamwork",
    sourcePdfSha256: "a".repeat(64), expectedItemCount: 2,
    curation: { difficulty: "moderate", originalItemCount: 3, excludedItems: [{ term: "team", reason: "基础词。" }] }, items: [item, fresh] };
  return { source, snapshot, existing, untouched };
}

test("article plans preserve canonical senses, prior contexts and global order while sharing exact chapter provenance", () => {
  const { source, snapshot, existing, untouched } = fixture(), before = structuredClone({ source, snapshot });
  const result = planTeamworkArticleImport({ source, snapshot, timestamp: now });
  assert.equal(result.changed, true); assert.equal(result.report.newCards, 1); assert.equal(result.report.reusedCardsChanged, 1);
  assert.deepEqual(result.snapshot.entries.map(row => row.id), [untouched.id, existing.id, source.items[1].reuseExistingEntryId]);
  assert.deepEqual(result.snapshot.entries[0], untouched);
  const reused = result.snapshot.entries[1];
  for (const field of Object.keys(existing).filter(key => !["tags", "readingContexts", "sources", "revision", "updatedAt"].includes(key))) assert.deepEqual(reused[field], existing[field], field);
  assert.deepEqual(reused.readingContexts[0], existing.readingContexts[0]); assert.deepEqual(reused.sources[0], existing.sources[0]);
  assert.equal(reused.revision, existing.revision + 1); assert.equal(reused.updatedAt, now);
  const view = contextualizeReadingEntry(reused, "teamwork", "chapter-4");
  assert.equal(view.meaning, source.items[0].meaning); assert.equal(view.exampleEn, source.items[0].exampleEn);
  assert.equal(view.sourceUrl, source.sourceUrl); assert.equal(view.sourceWork, "Teamwork"); assert.equal(view.author, "");
  assert.equal(view.sourceDate, "PDF p. 3"); assert.equal(reused.readingContexts[1].page, "PDF p. 3 · print p. 4");
  assert.match(view.attributionNote, /例句为自拟/u); assert.doesNotMatch(view.attributionNote, /AI复核|作者自查/u);
  const catalog = buildCollectionCatalog(result.snapshot.entries).find(row => row.id === "teamwork");
  assert.equal(catalog.chapters[0].title, source.articleTitle); assert.equal(catalog.count, 2);
  assert.doesNotThrow(() => parsePublicSnapshot(result.snapshot, { allowLegacy: false }));
  assert.deepEqual({ source, snapshot }, before, "planning must not mutate either caller input");
});

test("repeated import is an exact no-op despite a later requested timestamp", () => {
  const { source, snapshot } = fixture(), first = planTeamworkArticleImport({ source, snapshot, timestamp: now });
  const repeat = planTeamworkArticleImport({ source, snapshot: first.snapshot, timestamp: "2026-11-01T12:00:00Z" });
  assert.equal(repeat.changed, false); assert.equal(repeat.report.newCards, 0); assert.equal(repeat.report.reusedCardsChanged, 0);
  assert.deepEqual(repeat.snapshot, first.snapshot);
});

test("adding a reading context invalidates only the touched card's old synonym scan", () => {
  const input = fixture();
  input.existing.synonymScan = pendingSynonymScan(input.existing, input.snapshot.entries, oldDate, "prior_scan");
  const result = planTeamworkArticleImport({ ...input, timestamp: now });
  const updated = result.snapshot.entries.find(row => row.id === input.existing.id);
  assert.equal(updated.synonymScan.status, "pending");
  assert.equal(updated.synonymScan.sourceFingerprint, entrySynonymFingerprint(updated));
  assert.notEqual(updated.synonymScan.sourceFingerprint, input.existing.synonymScan.sourceFingerprint);
  assert.equal(input.existing.synonymScan.reason, "prior_scan");
  assert.deepEqual(result.snapshot.entries[0], input.untouched);
});

test("source excerpts remain context instead of canonical spelling aliases or word authorship", () => {
  const input = fixture(); input.source.originalInputKind = "excerpt";
  input.source.items[1].originalInput = "a compelling direction for the entire organization";
  const result = planTeamworkArticleImport({ ...input, timestamp: now });
  const fresh = result.snapshot.entries.at(-1);
  assert.equal(fresh.originalInput, input.source.items[1].originalInput);
  assert.equal(fresh.readingContexts[0].originalInput, input.source.items[1].originalInput);
  assert.equal(fresh.correction.status, "exact"); assert.equal(fresh.correction.original, fresh.term);
  assert.deepEqual(entryLookupKeys(fresh), [fresh.normalized]);
  assert.equal(fresh.author, ""); assert.match(fresh.attributionNote, /Martine Haas; Mark Mortensen/u);
  assert.equal(fresh.sources[0].url, input.source.sourceUrl);
  assert.equal(planTeamworkArticleImport({ source: input.source, snapshot: result.snapshot, timestamp: now }).changed, false);
});

test("article confusables survive on canonical new senses and on reused chapter views", () => {
  const input = fixture(); input.source.items[0].confusedWith = ["capacity", "network bandwidth"];
  input.source.items[1].confusedWith = ["compulsory direction"];
  const result = planTeamworkArticleImport({ ...input, timestamp: now });
  const fresh = result.snapshot.entries.at(-1), reused = result.snapshot.entries[1];
  assert.deepEqual(fresh.confusedWith, input.source.items[1].confusedWith);
  assert.deepEqual(fresh.senses[0].confusables, input.source.items[1].confusedWith);
  assert.deepEqual(fresh.readingContexts[0].confusedWith, input.source.items[1].confusedWith);
  assert.deepEqual(reused.confusedWith, input.existing.confusedWith, "old canonical confusables stay unchanged");
  assert.deepEqual(contextualizeReadingEntry(reused, "teamwork", "chapter-4").confusedWith, input.source.items[0].confusedWith);
  input.source.items[0].confusedWith = "capacity";
  assert.throws(() => planTeamworkArticleImport({ ...input, timestamp: now }), /confusedWith/u);
});

for (const [name, mutate] of [
  ["missing explicit decision", ({ source }) => { delete source.items[0].duplicateDecision; }],
  ["new-card decision on an existing canonical record", ({ source }) => { source.items[0].duplicateDecision.action = "new-card"; }],
  ["reuse decision for a missing record", ({ source }) => { source.items[1].duplicateDecision.action = "reuse-same-sense"; }],
  ["wrong canonical ID", ({ source }) => { source.items[0].reuseExistingEntryId = "public-untouched-quorum"; }],
  ["implicit duplicate canonical term", ({ source }) => { source.items[0].reuseExistingEntryId = "public-missing-bandwidth"; }],
  ["duplicate source term", ({ source }) => { source.items[1].term = "BANDWIDTH"; }],
  ["duplicate target ID", ({ source }) => { source.items[1].reuseExistingEntryId = source.items[0].reuseExistingEntryId; }],
  ["duplicate article order", ({ source }) => { source.items[1].order = 1; }],
  ["unaccounted excluded items", ({ source }) => { source.curation.originalItemCount++; }],
  ["missing source hash", ({ source }) => { delete source.sourcePdfSha256; }],
  ["non-HTTPS article source", ({ source }) => { source.sourceUrl = "http://hbr.org/source"; }],
  ["incomplete lexical example", ({ source }) => { source.items[0].exampleZh = ""; }],
]) test(`article import rejects ${name} before any mutation`, () => {
  const input = fixture(); mutate(input); const before = structuredClone(input);
  assert.throws(() => planTeamworkArticleImport({ ...input, timestamp: now })); assert.deepEqual(input, before);
});

test("new correction aliases cannot take another canonical card's lookup identity", () => {
  const input = fixture(); input.source.items[1].originalInput = "quorum";
  assert.throws(() => planTeamworkArticleImport({ ...input, timestamp: now }), /alias collides/u);
});

test("an existing chapter context cannot be silently changed by a later source replay", () => {
  const input = fixture(), first = planTeamworkArticleImport({ ...input, timestamp: now });
  input.source.items[0].exampleZh = "这是一句不同的翻译。";
  assert.throws(() => planTeamworkArticleImport({ source: input.source, snapshot: first.snapshot, timestamp: now }), /context differs/u);
});

test("compact serialization enforces the actual production byte boundary", () => {
  assert.throws(() => serializeTeamworkSnapshot({ large: "中".repeat(1_700_000) }), /5,000,000-byte/u);
});

test("file import defaults to dry-run, refuses a stale baseline, and writes atomically only with both baseline pins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "teamwork-article-")), input = fixture();
  const sourcePath = join(directory, "chapter-4.json"), snapshotPath = join(directory, "snapshot.json");
  const bytes = `${JSON.stringify(input.snapshot, null, 2)}\n`;
  try {
    await writeFile(sourcePath, JSON.stringify(input.source)); await writeFile(snapshotPath, bytes);
    const dry = await importTeamworkArticle({ sourcePath, snapshotPath, timestamp: now });
    assert.equal(dry.report.mode, "dry-run"); assert.equal(await readFile(snapshotPath, "utf8"), bytes);
    const cli = fileURLToPath(new URL("../scripts/import-teamwork-article.mjs", import.meta.url));
    const output = JSON.parse(execFileSync(process.execPath, [cli, `--source=${sourcePath}`, `--snapshot=${snapshotPath}`, `--timestamp=${now}`], { encoding: "utf8" }));
    assert.equal(output.mode, "dry-run"); assert.equal(output.baselineSha256, sha(bytes));
    assert.equal(await readFile(snapshotPath, "utf8"), bytes, "the real CLI default cannot write");
    await assert.rejects(importTeamworkArticle({ sourcePath, snapshotPath, timestamp: now, write: true }), /expected revision/u);
    await assert.rejects(importTeamworkArticle({ sourcePath, snapshotPath, timestamp: now, write: true,
      expectedRevision: "wrong", expectedSha256: sha(bytes) }), /revision changed/u);
    await assert.rejects(importTeamworkArticle({ sourcePath, snapshotPath, timestamp: now, write: true,
      expectedRevision: input.snapshot.revisionId, expectedSha256: "0".repeat(64) }), /byte hash changed/u);
    assert.equal(await readFile(snapshotPath, "utf8"), bytes);
    const result = await importTeamworkArticle({ sourcePath, snapshotPath, timestamp: now, write: true,
      expectedRevision: input.snapshot.revisionId, expectedSha256: sha(bytes) });
    assert.deepEqual(JSON.parse(await readFile(snapshotPath, "utf8")), result.snapshot);
    assert.deepEqual((await readdir(directory)).sort(), ["chapter-4.json", "snapshot.json"]);
  } finally {
    const relativePath = relative(tmpdir(), directory); assert(relativePath && !relativePath.startsWith(".."));
    await rm(directory, { recursive: true });
  }
});
