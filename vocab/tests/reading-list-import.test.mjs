import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";

const canonicalSnapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);

test("re-importing Never Let Me Go Chapter 1 is idempotent and remains 29/29", async () => {
  const result = await importReadingList({
    timestamp: "2026-09-20T17:00:00.000Z",
    checkOnly: true
  });
  assert.equal(result.changed, false);
  assert.equal(result.chapterEntries.length, 29);
  assert.equal(new Set(result.chapterEntries.map((entry) => entry.normalized)).size, 29);
  assert.equal(result.snapshot.entries.length, 36);
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
