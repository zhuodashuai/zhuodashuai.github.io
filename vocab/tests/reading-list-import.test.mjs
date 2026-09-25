import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";

const canonicalSnapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);
const chapterTwoUrl = new URL("../data/reading-lists/never-let-me-go/chapter-2.json", import.meta.url);
const chapterThreeUrl = new URL("../data/reading-lists/never-let-me-go/chapter-3.json", import.meta.url);
const chapterFourUrl = new URL("../data/reading-lists/never-let-me-go/chapter-4.json", import.meta.url);
const originalChapterThreeTerms = new Set([
  "eavesdrop", "raggy", "maroon", "brisk", "crouch down", "inkling", "indulgently", "chilly look",
  "snooty", "billiards", "loiter", "rummage", "saunter out", "stiff", "halt", "shriek"
]);
const originalChapterFourTerms = new Set([
  "lark about", "taboo", "tug away at something", "collide with", "strand",
  "shoot daggers at someone", "reminisce", "unfathomable", "uncannily", "rhubarb", "foible"
]);

function firstTwoChapterEntries(snapshot) {
  return snapshot.entries.filter((entry) => entry.tags.some((tag) => /^collection:never-let-me-go:chapter-[12]$/u.test(tag)));
}

test("re-importing Never Let Me Go Chapter 1 is idempotent and remains 29/29", async () => {
  const result = await importReadingList({
    timestamp: "2026-09-20T17:00:00.000Z",
    checkOnly: true
  });
  assert.equal(result.changed, false);
  assert.equal(result.chapterEntries.length, 29);
  assert.equal(new Set(result.chapterEntries.map((entry) => entry.normalized)).size, 29);
  assert.equal(firstTwoChapterEntries(result.snapshot).length, 65);
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
  assert.equal(firstTwoChapterEntries(result.snapshot).length, 65);
  const shared = result.chapterEntries.filter((entry) => entry.tags.includes("collection:never-let-me-go:chapter-1"));
  assert.deepEqual(shared.map((entry) => entry.term).sort(), ["shrug", "tantrum"]);
  assert.ok(shared.every((entry) => entry.readingContexts.some((context) => context.membership === "collection:never-let-me-go:chapter-2")));
});

test("re-importing Never Let Me Go Chapter 3 preserves all 28 photo-reviewed entries and the snapshot", async () => {
  const before = JSON.parse(await readFile(canonicalSnapshotUrl, "utf8"));
  const result = await importReadingList({
    sourcePath: fileURLToPath(chapterThreeUrl),
    timestamp: "2026-09-24T17:00:00.000Z",
    checkOnly: true
  });
  assert.equal(result.changed, false);
  assert.equal(result.chapterEntries.length, 28);
  assert.equal(result.totalChapterEntries, 28);
  assert.equal(new Set(result.chapterEntries.map((entry) => entry.normalized)).size, 28);
  assert.ok(result.chapterEntries.every((entry) => entry.id.startsWith("public-nlmg-c3-")));
  assert.deepEqual(result.snapshot, before);
});

test("Never Let Me Go Chapter 3 adds 12 approved entries while preserving its original 16 and other chapters", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-chapter-three-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const membership = "collection:never-let-me-go:chapter-3";
  try {
    const before = JSON.parse(await readFile(canonicalSnapshotUrl, "utf8"));
    const priorEntries = before.entries.filter((entry) => !entry.tags.includes(membership) || originalChapterThreeTerms.has(entry.term));
    const priorIds = new Set(priorEntries.map((entry) => entry.id));
    assert.equal(priorEntries.filter((entry) => entry.tags.includes(membership)).length, 16);
    await writeFile(snapshotPath, JSON.stringify({ ...before, entries: priorEntries }), "utf8");
    const result = await importReadingList({
      sourcePath: fileURLToPath(chapterThreeUrl),
      snapshotPath,
      timestamp: "2026-09-25T20:00:00.000Z"
    });
    assert.equal(result.changed, true);
    assert.equal(result.snapshot.entries.length, priorEntries.length + 12);
    assert.equal(result.chapterEntries.length, 28);
    assert.equal(result.totalChapterEntries, 28);
    assert.equal(new Set(result.chapterEntries.map((entry) => entry.normalized)).size, 28);
    assert.deepEqual(result.snapshot.entries.filter((entry) => priorIds.has(entry.id)), priorEntries);
    for (const item of result.source.items) {
      const entry = result.chapterEntries.find((candidate) => candidate.term === item.term);
      assert.equal(entry.originalInput, item.originalInput);
      assert.equal(entry.sourceDate, `p. ${item.page}`);
    }

    const written = await readFile(snapshotPath, "utf8");
    const repeated = await importReadingList({
      sourcePath: fileURLToPath(chapterThreeUrl),
      snapshotPath,
      timestamp: "2026-09-25T21:00:00.000Z"
    });
    assert.equal(repeated.changed, false);
    assert.equal(await readFile(snapshotPath, "utf8"), written);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Never Let Me Go Chapter 4 adds the 40 approved entries to its original 11 and is idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-chapter-four-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const membership = "collection:never-let-me-go:chapter-4";
  try {
    const before = JSON.parse(await readFile(canonicalSnapshotUrl, "utf8"));
    const priorEntries = before.entries.filter((entry) => !entry.tags.includes(membership) || originalChapterFourTerms.has(entry.term));
    const priorIds = new Set(priorEntries.map((entry) => entry.id));
    assert.equal(priorEntries.filter((entry) => entry.tags.includes(membership)).length, 11);
    await writeFile(snapshotPath, JSON.stringify({ ...before, entries: priorEntries }), "utf8");
    const result = await importReadingList({
      sourcePath: fileURLToPath(chapterFourUrl),
      snapshotPath,
      timestamp: "2026-09-25T17:00:00.000Z"
    });
    assert.equal(result.changed, true);
    assert.equal(result.snapshot.entries.length, priorEntries.length + 40);
    assert.equal(result.chapterEntries.length, 51);
    assert.equal(result.totalChapterEntries, 51);
    assert.equal(new Set(result.chapterEntries.map((entry) => entry.normalized)).size, 51);
    assert.ok(result.chapterEntries.every((entry) => entry.id.startsWith("public-nlmg-c4-")));
    assert.deepEqual(result.snapshot.entries.filter((entry) => priorIds.has(entry.id)), priorEntries);
    for (const item of result.source.items) {
      const entry = result.chapterEntries.find((candidate) => candidate.term === item.term);
      assert.equal(entry.phonetic, item.phonetic ?? "");
      assert.equal(entry.originalInput, item.originalInput);
      assert.equal(entry.sourceDate, `p. ${item.page}`);
    }

    const written = await readFile(snapshotPath, "utf8");
    const repeated = await importReadingList({
      sourcePath: fileURLToPath(chapterFourUrl),
      snapshotPath,
      timestamp: "2026-09-25T18:00:00.000Z"
    });
    assert.equal(repeated.changed, false);
    assert.equal(await readFile(snapshotPath, "utf8"), written);

    const canonical = await importReadingList({ sourcePath: fileURLToPath(chapterFourUrl), checkOnly: true });
    assert.equal(canonical.changed, false);
    assert.deepEqual(canonical.snapshot, before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("chapter pages preserve nonconsecutive pages and ranges and reject malformed values before writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-pages-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const sourcePath = join(directory, "chapter-4.json");
  const membership = "collection:never-let-me-go:chapter-4";
  try {
    const [snapshotRaw, source] = await Promise.all([
      readFile(canonicalSnapshotUrl, "utf8"),
      readFile(chapterFourUrl, "utf8").then(JSON.parse)
    ]);
    await writeFile(snapshotPath, snapshotRaw, "utf8");
    for (const page of ["40", "40, 45", "40,45", "41–42", "41-42", "40, 45–46"]) {
      source.items[0].page = page;
      await writeFile(sourcePath, JSON.stringify(source), "utf8");
      const result = await importReadingList({ sourcePath, snapshotPath, checkOnly: true });
      const entry = result.chapterEntries.find((candidate) => candidate.term === source.items[0].term);
      const context = entry.readingContexts.find((candidate) => candidate.membership === membership);
      assert.equal(entry.sourceDate, `p. ${page}`);
      assert.equal(context.sourceDate, `p. ${page}`);
      assert.equal(context.page, `p. ${page}`);
    }

    for (const page of [
      "", null, false, {}, [], "40,", ",40", "40,,45", "40, ,45", "40;45", "40，45",
      "40–", "–42", "40, <script>alert(1)</script>", "40, 45\" onload=\"alert(1)",
      "0", "0–1", "42–41", "45, 40", "40, 40", "40–42, 42", "40–45, 43–46",
      "1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23"
    ]) {
      source.items[0].page = page;
      await writeFile(sourcePath, JSON.stringify(source), "utf8");
      await assert.rejects(importReadingList({ sourcePath, snapshotPath }), /页码/u);
      assert.equal(await readFile(snapshotPath, "utf8"), snapshotRaw);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("optional source phonetic trims strings up to 300 characters and rejects invalid values before writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-phonetic-validation-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const sourcePath = join(directory, "chapter-4.json");
  try {
    const [snapshotRaw, source] = await Promise.all([
      readFile(canonicalSnapshotUrl, "utf8"),
      readFile(chapterFourUrl, "utf8").then(JSON.parse)
    ]);
    await writeFile(snapshotPath, snapshotRaw, "utf8");
    for (const phonetic of ["  /lɑːk əˈbaʊt/  ", "", "ə".repeat(300)]) {
      source.items[0].phonetic = phonetic;
      await writeFile(sourcePath, JSON.stringify(source), "utf8");
      const result = await importReadingList({ sourcePath, snapshotPath, checkOnly: true });
      assert.equal(result.chapterEntries.find((entry) => entry.term === source.items[0].term).phonetic, phonetic.trim());
    }
    for (const phonetic of [null, 0, false, {}, [], "ə".repeat(301)]) {
      source.items[0].phonetic = phonetic;
      await writeFile(sourcePath, JSON.stringify(source), "utf8");
      await assert.rejects(importReadingList({ sourcePath, snapshotPath }), /phonetic/u);
      assert.equal(await readFile(snapshotPath, "utf8"), snapshotRaw);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("omitted source phonetic preserves an existing owner's value, defaults new entries to empty, and explicit updates are idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-phonetic-update-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const sourcePath = join(directory, "chapter-4.json");
  try {
    const [snapshot, source] = await Promise.all([
      readFile(canonicalSnapshotUrl, "utf8").then(JSON.parse),
      readFile(chapterFourUrl, "utf8").then(JSON.parse)
    ]);
    const existingItem = source.items[0];
    const newItem = source.items[1];
    const existingEntry = snapshot.entries.find((entry) => entry.term === existingItem.term);
    existingEntry.phonetic = "/owner-edited/";
    snapshot.entries = snapshot.entries.filter((entry) => entry.term !== newItem.term);
    delete existingItem.phonetic;
    delete newItem.phonetic;
    await Promise.all([
      writeFile(snapshotPath, JSON.stringify(snapshot), "utf8"),
      writeFile(sourcePath, JSON.stringify(source), "utf8")
    ]);
    const imported = await importReadingList({ sourcePath, snapshotPath });
    assert.equal(imported.chapterEntries.find((entry) => entry.term === existingItem.term).phonetic, "/owner-edited/");
    assert.equal(imported.chapterEntries.find((entry) => entry.term === newItem.term).phonetic, "");

    existingItem.phonetic = "/lɑːk əˈbaʊt/";
    await writeFile(sourcePath, JSON.stringify(source), "utf8");
    const updated = await importReadingList({ sourcePath, snapshotPath, timestamp: "2026-09-25T19:00:00.000Z" });
    assert.equal(updated.changed, true);
    const updatedEntry = updated.chapterEntries.find((entry) => entry.term === existingItem.term);
    assert.equal(updatedEntry.id, existingEntry.id);
    assert.equal(updatedEntry.phonetic, existingItem.phonetic);
    assert.equal(updatedEntry.revision, existingEntry.revision + 1);
    const repeated = await importReadingList({ sourcePath, snapshotPath, checkOnly: true });
    assert.equal(repeated.changed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a reused chapter headword keeps the original chapter owner's phonetic", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-shared-phonetic-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const sourcePath = join(directory, "chapter-2.json");
  try {
    const [snapshot, source] = await Promise.all([
      readFile(canonicalSnapshotUrl, "utf8").then(JSON.parse),
      readFile(chapterTwoUrl, "utf8").then(JSON.parse)
    ]);
    const sharedEntry = snapshot.entries.find((entry) => entry.term === "shrug");
    sharedEntry.phonetic = "/owner-edited/";
    source.items.find((item) => item.term === "shrug").phonetic = "/ʃrʌɡ/";
    await Promise.all([
      writeFile(snapshotPath, JSON.stringify(snapshot), "utf8"),
      writeFile(sourcePath, JSON.stringify(source), "utf8")
    ]);
    const result = await importReadingList({ sourcePath, snapshotPath, checkOnly: true });
    assert.equal(result.changed, false);
    assert.equal(result.chapterEntries.find((entry) => entry.term === "shrug").phonetic, "/owner-edited/");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("source attributionNote is optional, trims valid text, and rejects invalid values before writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-attribution-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const sourcePath = join(directory, "chapter-3.json");
  try {
    const [snapshotRaw, source] = await Promise.all([
      readFile(canonicalSnapshotUrl, "utf8"),
      readFile(chapterThreeUrl, "utf8").then(JSON.parse)
    ]);
    await writeFile(snapshotPath, snapshotRaw, "utf8");
    const membership = "collection:never-let-me-go:chapter-3";
    for (const note of ["  根据照片人工校读；例句为学习用自拟句，不是小说原文。  ", "校".repeat(1500)]) {
      await writeFile(sourcePath, JSON.stringify({ ...source, attributionNote: note }), "utf8");
      const result = await importReadingList({ sourcePath, snapshotPath, checkOnly: true });
      for (const entry of result.chapterEntries) {
        assert.equal(entry.attributionNote, note.trim());
        assert.equal(entry.readingContexts.find((context) => context.membership === membership).attributionNote, note.trim());
      }
    }

    const withoutNote = { ...source };
    delete withoutNote.attributionNote;
    await writeFile(sourcePath, JSON.stringify(withoutNote), "utf8");
    const fallback = await importReadingList({ sourcePath, snapshotPath, checkOnly: true });
    assert.equal(fallback.chapterEntries[0].attributionNote,
      "由卓提供的 Chapter 3 学习清单整理；章节语境限定于第三章，例句为学习用自拟句，不是小说原文。");

    for (const note of [null, 0, false, {}, [], "", " \t\n ", "校".repeat(1501)]) {
      await writeFile(sourcePath, JSON.stringify({ ...source, attributionNote: note }), "utf8");
      await assert.rejects(importReadingList({ sourcePath, snapshotPath }), /attributionNote/u);
      assert.equal(await readFile(snapshotPath, "utf8"), snapshotRaw);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
