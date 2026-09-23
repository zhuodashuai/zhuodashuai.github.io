import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";

const canonicalSnapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);
const chapterTwoUrl = new URL("../data/reading-lists/never-let-me-go/chapter-2.json", import.meta.url);

test("re-importing Never Let Me Go Chapter 1 is idempotent and remains 29/29", async () => {
  const result = await importReadingList({
    timestamp: "2026-09-20T17:00:00.000Z",
    checkOnly: true
  });
  assert.equal(result.changed, false);
  assert.equal(result.chapterEntries.length, 29);
  assert.equal(new Set(result.chapterEntries.map((entry) => entry.normalized)).size, 29);
  assert.equal(result.snapshot.entries.length, 72);
});

test("re-importing Never Let Me Go Chapter 2 is idempotent and remains 38/38", async () => {
  const result = await importReadingList({
    sourcePath: fileURLToPath(chapterTwoUrl),
    timestamp: "2026-09-23T17:00:00.000Z",
    checkOnly: true
  });
  assert.equal(result.changed, false);
  assert.equal(result.chapterEntries.length, 38);
  assert.equal(new Set(result.chapterEntries.map((entry) => entry.normalized)).size, 38);
  assert.equal(result.snapshot.entries.length, 72);
  const shared = result.chapterEntries.filter((entry) => entry.tags.includes("collection:never-let-me-go:chapter-1"));
  assert.deepEqual(shared.map((entry) => entry.term).sort(), ["shrug", "tantrum"]);
  assert.ok(shared.every((entry) => entry.readingContexts.some((context) => context.membership === "collection:never-let-me-go:chapter-2")));
});

test("a corrected chapter source updates its existing context and is then idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-update-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const sourcePath = join(directory, "chapter-2.json");
  try {
    const [snapshot, source] = await Promise.all([
      readFile(canonicalSnapshotUrl, "utf8").then(JSON.parse),
      readFile(chapterTwoUrl, "utf8").then(JSON.parse)
    ]);
    const revised = source.items.find((item) => item.term === "concussion");
    revised.meaning = "脑震荡；测试用修订释义。";
    revised.definitionEn = "A revised test definition for an existing chapter context.";
    await Promise.all([
      writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8"),
      writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`, "utf8")
    ]);

    const updated = await importReadingList({
      sourcePath,
      snapshotPath,
      timestamp: "2026-09-23T18:00:00.000Z"
    });
    assert.equal(updated.changed, true);
    const entry = updated.chapterEntries.find((candidate) => candidate.term === "concussion");
    const context = entry.readingContexts.find((candidate) => candidate.membership === "collection:never-let-me-go:chapter-2");
    assert.equal(context.meaning, revised.meaning);
    assert.equal(context.definition, revised.definitionEn);
    assert.equal(entry.meaning, revised.meaning);
    assert.equal(entry.definition, revised.definitionEn);

    const repeated = await importReadingList({
      sourcePath,
      snapshotPath,
      timestamp: "2026-09-23T19:00:00.000Z",
      checkOnly: true
    });
    assert.equal(repeated.changed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a repeat import only adds missing requested terms and preserves owner edits and extra chapter entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-list-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  try {
    const snapshot = JSON.parse(await readFile(canonicalSnapshotUrl, "utf8"));
    const agitated = snapshot.entries.find((entry) => entry.term === "agitated");
    agitated.phonetic = "/owner-edited/";
    agitated.synonyms = ["owner-synonym"];
    agitated.tags.push("owner-tag", "collection:another-book:chapter-2");
    const extra = structuredClone(snapshot.entries.find((entry) => entry.term === "shrug"));
    extra.id = "owner-extra-chapter-entry";
    extra.originalInput = "owner extra";
    extra.term = "owner extra";
    extra.normalized = "owner extra";
    extra.standardForm = "owner extra";
    extra.correction = { status: "exact", original: "owner extra", suggestion: "", chosen: "owner extra", confidence: 1, source: "manual" };
    snapshot.entries = snapshot.entries.filter((entry) => entry.term !== "pipe down");
    snapshot.entries.push(extra);
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

    const result = await importReadingList({
      snapshotPath,
      timestamp: "2026-09-20T18:00:00.000Z"
    });
    assert.equal(result.changed, true);
    assert.equal(result.chapterEntries.length, 29);
    assert.equal(result.totalChapterEntries, 30);
    const written = JSON.parse(await readFile(snapshotPath, "utf8"));
    const preserved = written.entries.find((entry) => entry.id === agitated.id);
    assert.equal(preserved.phonetic, "/owner-edited/");
    assert.deepEqual(preserved.synonyms, ["owner-synonym"]);
    assert.equal(preserved.tags.includes("owner-tag"), true);
    assert.equal(preserved.tags.includes("collection:another-book:chapter-2"), true);
    assert.equal(written.entries.some((entry) => entry.id === extra.id), true);
    assert.equal(written.entries.filter((entry) => entry.term === "pipe down").length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
