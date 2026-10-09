import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { buildCollectionCatalog, collectionContextForEntry, filterEntriesByCollection } from "../js/collections.js";
import { applyReviewRating, buildDueQueue, buildStudySummary } from "../js/study.js";
import { entrySynonymFingerprint } from "../js/synonym-evidence.js";
import {
  contextualizeReadingEntry, entryLookupKeys, meaningItemsForDisplay, normalizeEnglish,
  parsePublicSnapshot, publicEntryMatchesQuery, reconcileLexicalEntryForPublish
} from "../js/wordbook-schema.js";

const sourceUrl = new URL("../data/reading-lists/never-let-me-go/chapter-5.json", import.meta.url);
const snapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);
const collectionId = "never-let-me-go";
const chapterId = "chapter-5";
const membership = "collection:never-let-me-go:chapter-5";
const timestamp = "2026-09-26T18:00:00.000Z";
// Observed in the published snapshot before the 159-to-18 shortlist migration.
// Retaining this creation time and the original IDs keeps existing review keys.
const retainedCreatedAt = "2026-09-26T12:54:45.873Z";
const markedTerms = ["loom", "pine", "confer furtively", "precarious"];
const formerSharedTerms = ["daft", "eaves", "out of the blue", "pavilion"];

// Independent photo-reviewed transcription for the approved four marked and fourteen
// supplementary items: [original order, page, headword, text form, English
// meaning, Chinese meaning, usage notes]. The gaps in order are intentional.
// The photo-reviewed allude form is "allude darkly", not the Markdown typo.
const expectedRows = [
  [14,"50","loom","looming","appear large or threatening","隐约耸现，令人感到压迫","蓝线标记；loom in the distance"],
  [20,"50","pine","pining to be let back in","long for something with sadness","苦苦盼望、思念","蓝线标记；pine for sb/sth；这里不是松树"],
  [21,"50","ghastly","the ghastly truth","extremely unpleasant or frightening","可怕的、骇人的","ghastly 表示极其可怕或令人不快，如 a ghastly smell；不要与表示幽灵般的 ghostly 混淆。"],
  [29,"51","defiant","a defiant surge of courage","showing resistance or refusal to give in","不服气的、带有反抗意味的","a defiant look / reply 表示带着反抗、不肯屈服意味的眼神或回应；可用于人物态度描写。"],
  [34,"51","keep at bay","keep any immediate danger at bay","prevent something from approaching or causing trouble","使危险暂时无法逼近","keep somebody/something at bay，阻止某人或某事逼近、造成困扰；也可说 keep anxiety at bay。"],
  [36,"51","confer furtively","confer furtively","talk together secretly to avoid notice","悄悄商议；偷偷交换意见","confer with somebody，和某人商议；furtively 表示偷偷地、尽量避人注意地。两词均在照片蓝线范围内。"],
  [40,"51","precarious","precarious","unstable and liable to fail","不稳固的、摇摇欲坠的","蓝线标记；形容幻想赖以成立的基础"],
  [49,"52","allude","allude darkly","refer to something indirectly","隐约提及、暗示","allude to sth；darkly 带神秘或不祥的意味"],
  [53,"52","engross","engrossed myself","absorb someone's attention completely","使全神贯注、完全投入","be/become engrossed in something，全神贯注于某事；engross 是动词原形，原文保留 engrossed myself 这一片段。"],
  [56,"52","corner","cornered her","put someone in a situation they cannot easily avoid","堵住她，使她无法再推脱","此处是动词，不是角落"],
  [72,"54","snub","this snub","a deliberate act of ignoring or rejecting someone","冷落、怠慢","a deliberate snub，有意的冷落；snub 也可作动词，但这张卡以本章的名词用法为主。"],
  [74,"54","acute","acute embarrassment","very intense or severe","强烈的、尖锐的","这里是强烈尴尬，不是医学上的急性"],
  [81,"55","back down","back down easily","stop defending a position in an argument","退让、服软","back down from a position"],
  [102,"56","innocuous","an innocuous sort of response","apparently harmless or unlikely to upset anyone","无害的；不会引起不快的","an innocuous remark / question / response，不会引起不快的话语、问题或回答。"],
  [120,"57","brood over","brooded over things","think unhappily about something for a long time","反复烦恼、耿耿于怀","brood over/on sth"],
  [125,"58","get away with","get away with it","avoid consequences for something wrong","做错事却蒙混过关","get away with something / doing something，做错事却未受到相应责罚或质疑。"],
  [140,"59","bluff","bluff","pretend to know more or have a stronger position than one does","虚张声势、假装掌握证据","这里是假装已查阅记录；不必真的查完"],
  [150,"60","on the verge of","on the verge of tears","very close to a particular state or action","濒于……；眼看就要……","on the verge of doing sth"],
];
// Keep the reviewed narrative qualifications as well as the dictionary usage.
// These distinctions prevent the characters' suspicions becoming story facts.
const expectedContextNotes = new Map([
  ["ghastly", "年长的孩子声称大家迟早会知道关于树林的可怕真相；这是孩子们转述的说法，不是本章已经证实的事实。"],
  ["defiant", "Kathy 有时会涌起一股不服输的勇气，质疑大家为什么相信那些关于树林的故事；defiant 修饰 surge of courage。"],
  ["keep at bay", "孩子们相信搜集证据便足以让眼前的危险无法逼近；这里说明他们的想法，不证明危险确实存在。"],
  ["confer furtively", "孩子们看见 Miss Eileen 和 Mr Roger 凑近交谈，并把这当成证据；不能仅凭这一表达断言两人确实在密谋。"],
  ["engross", "Kathy 希望自己也能像那些下棋的学生一样，沉浸于那些精美棋子和棋局中。这里的 myself 强调她自己也想投入其中。"],
  ["snub", "this snub 回指 Kathy 走近小团体时受到的冷落和排斥，本处是名词。"],
  ["innocuous", "Ruth 的回答表面听起来无害，却因为其中的暗示让 Kathy 很不舒服；注意这是看似无害，不是说回答实际毫无影响。"],
  ["brood over", "Kathy 否认自己小时候常常耿耿于怀，而把反复烦恼的倾向与现在的自己联系起来；不能说她小时候总这样。"],
  ["get away with", "Kathy 决心不让 Ruth 这次再靠那些暗示蒙混过关；不是字面意义的逃离某个地点。"],
  ["bluff", "假装已经查阅过记录、掌握了证据；不代表她真的查完了记录。"],
  ["on the verge of", "on the verge of tears 表示眼看就要哭出来，还没有直接断言已经哭了。"]
]);
const expectedTerms = expectedRows.map((row) => row[2]);
const expectedIds = [
  "public-nlmg-c5-loom", "public-nlmg-c5-pine", "public-nlmg-c5-ghastly",
  "public-nlmg-c5-defiant", "public-nlmg-c5-keep-at-bay", "public-nlmg-c5-confer-furtively",
  "public-nlmg-c5-precarious", "public-nlmg-c5-allude", "public-nlmg-c5-engross",
  "public-nlmg-c5-corner", "public-nlmg-c5-snub", "public-nlmg-c5-acute",
  "public-nlmg-c5-back-down", "public-nlmg-c5-innocuous", "public-nlmg-c5-brood-over",
  "public-nlmg-c5-get-away-with", "public-nlmg-c5-bluff", "public-nlmg-c5-on-the-verge-of"
];
const loadSource = async () => JSON.parse(await readFile(sourceUrl, "utf8"));
const loadSnapshot = async () => JSON.parse(await readFile(snapshotUrl, "utf8"));
const chapterEntries = (entries, number) => filterEntriesByCollection(entries, collectionId, "chapter-" + number);
const selectedCount = 24;
const selectedSource = await loadSource();
const selectedTerms = selectedSource.items.map(item => item.term);
const selectedIds = selectedTerms.map(term => "public-nlmg-c5-" + normalizeEnglish(term).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));

async function withFreshImport(run) {
  const current = await loadSnapshot();
  // Remove only this chapter's context; shared cards retain their other chapters
  // and identities, as they would when importing a new chapter membership.
  const prior = { ...current, entries: current.entries.flatMap(entry => {
    if (!entry.tags.includes(membership)) return [entry];
    const contexts = entry.readingContexts.filter(context => context.membership !== membership);
    return contexts.length ? [{ ...entry, tags: entry.tags.filter(tag => tag !== membership), readingContexts: contexts }] : [];
  }) };
  const directory = await mkdtemp(join(tmpdir(), "wordbook-chapter-five-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  try {
    await writeFile(snapshotPath, JSON.stringify(prior), "utf8");
    const result = await importReadingList({
      sourcePath: fileURLToPath(sourceUrl), snapshotPath, timestamp
    });
    await run({ prior, result, snapshotPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// Feature regressions must not require removed study cards to stay published.
// Import synthetic reading sources into an isolated empty snapshot instead.
async function withReadingFixture(items, run) {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-fixture-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const fixtureSourcePath = join(directory, "chapter-5.json");
  const fixture = {
    schemaVersion: 1,
    collection: { id: "reading-fixture", title: "Reading Fixture" },
    chapter: { id: chapterId, title: "Chapter 5", number: 5 },
    sourceTitle: "Reading Fixture — Chapter 5",
    originalInputKind: "excerpt",
    expectedItemCount: items.length,
    items: items.map((item, index) => ({ order: index + 1, ...item }))
  };
  try {
    await writeFile(snapshotPath, JSON.stringify({
      schemaVersion: 3, exportedAt: timestamp, revisionId: "reading-fixture",
      lastMutationId: "", entries: []
    }), "utf8");
    await writeFile(fixtureSourcePath, JSON.stringify(fixture), "utf8");
    const result = await importReadingList({ sourcePath: fixtureSourcePath, snapshotPath, timestamp });
    await run({ result, snapshotPath, sourcePath: fixtureSourcePath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function fixtureItem(overrides) {
  return {
    page: "51", entryType: "word", partOfSpeech: "adjective",
    usage: "第五章语境：此条仅用于独立导入回归测试。",
    forms: [], collocations: [], confusedWith: [], register: "neutral", tags: [],
    ...overrides
  };
}

function fixtureSense(partOfSpeech, meaningZh, definitionEn, exampleEn, exampleZh) {
  return {
    partOfSpeech, meaningZh, definitionEn,
    usageNotes: "Each part of this comparison has its own grammatical role.",
    register: "neutral", collocations: [],
    examples: [{ en: exampleEn, zh: exampleZh }], confusables: []
  };
}

function comparisonFixture(term, originalInput, senses) {
  return fixtureItem({
    term, originalInput, entryType: "phrase",
    partOfSpeech: senses.map((sense) => sense.partOfSpeech).join(" · "),
    meaning: senses.map((sense, index) => String.fromCodePoint(0x2460 + index) + " " + sense.partOfSpeech + "：" + sense.meaningZh).join("\n"),
    definitionEn: senses.map((sense) => sense.definitionEn).join("\n"),
    exampleEn: senses[0].examples[0].en, exampleZh: senses[0].examples[0].zh,
    senses
  });
}

test("Chapter 5 retains the original shortlist and supplements it to 24 in reading order", async () => {
  const source = await loadSource();
  assert.equal(source.expectedItemCount, selectedCount);
  assert.equal(source.items.length, selectedCount);
  assert.deepEqual(source.collection, { id: collectionId, title: "Never Let Me Go" });
  assert.deepEqual(source.chapter, { id: chapterId, title: "Chapter 5", number: 5 });
  assert.equal(source.sourceTitle, "Never Let Me Go — Chapter 5");
  assert.equal(new Set(source.items.map((item) => normalizeEnglish(item.term))).size, selectedCount);
  assert.deepEqual(
    source.items.filter(item => expectedTerms.includes(item.term)).map((item) => [item.order, String(item.page), item.term, item.originalInput]),
    expectedRows.map((row) => row.slice(0, 4))
  );
  assert.deepEqual(source.items.filter((item) => item.tags.includes("蓝线标记")).map((item) => item.term), markedTerms);
  assert.equal(source.items.filter((item) => !item.tags.includes("蓝线标记")).length, selectedCount - 4);
  assert.equal(source.items.some((item) => item.reuseExistingSameSense), false);

  for (const [index, item] of source.items.filter(item => expectedTerms.includes(item.term)).entries()) {
    const [, , term, , definition, meaning, notes] = expectedRows[index];
    assert.equal(item.definitionEn, definition, term + ": preserve supplied English meaning");
    assert.equal(item.meaning, "① " + meaning + "。", term + ": retain the reviewed numbered meaning");
    assert.equal(item.usage.split(/\r?\n/u).find((line) => line.startsWith("用法：")), "用法：" + notes,
      term + ": retain the reviewed usage notes");
    if (expectedContextNotes.has(term)) {
      assert.equal(item.usage.split(/\r?\n/u)[0], "第五章语境：" + expectedContextNotes.get(term),
        term + ": retain the photo-reviewed narrative context");
    }
    assert.match(item.usage, /第五章语境/u, term);
    assert.ok(item.usage.split(/\r?\n/u).filter((line) => line.trim()).length >= 2, term + ": readable usage lines");
    assert.ok(item.partOfSpeech.trim(), term + ": part of speech");
    assert.ok(item.exampleEn.trim() && item.exampleZh.trim(), term + ": bilingual practice example");
  }
  assert.equal(source.items.find((item) => item.term === "allude").originalInput, "allude darkly");
});

test("the published shortlist retains all eighteen original IDs and creation times without residual Chapter 5 memberships", async () => {
  const snapshot = await loadSnapshot();
  assert.equal(new Set(snapshot.entries.map((entry) => entry.normalized)).size, snapshot.entries.length);
  const cards = chapterEntries(snapshot.entries, 5);
  assert.deepEqual(cards.map((entry) => entry.term), selectedTerms);
  assert.deepEqual(cards.map((entry) => entry.id), selectedIds);
  const retained = cards.filter(entry => expectedIds.includes(entry.id));
  assert.deepEqual(retained.map(entry => entry.id), expectedIds);
  assert.ok(retained.every((entry) => entry.createdAt === retainedCreatedAt));
  assert.equal(snapshot.entries.filter((entry) => entry.id.startsWith("public-nlmg-c5-")).length, selectedCount);
  for (const term of formerSharedTerms) {
    const card = snapshot.entries.find((entry) => entry.term === term);
    assert.ok(card, term + ": old chapter card remains");
    assert.equal(card.tags.includes(membership), false, term + ": removed from the Chapter 5 scope");
    assert.equal(card.readingContexts.some((context) => context.membership === membership), false);
    assert.ok(card.tags.some((tag) => /^collection:never-let-me-go:chapter-[1-4]$/u.test(tag)));
  }
  const wanted = new Set(selectedIds);
  assert.deepEqual(snapshot.entries.filter((entry) => entry.readingContexts.some((context) => context.membership === membership))
    .map((entry) => entry.id).sort(), [...wanted].sort());
});

test("importing the supplemented shortlist preserves all unrelated cards and previous chapter contexts", async () => {
  await withFreshImport(async ({ prior, result }) => {
    assert.equal(result.changed, true);
    assert.equal(result.chapterEntries.length, selectedCount);
    assert.equal(result.totalChapterEntries, selectedCount);
    const reusedIds = new Set(prior.entries.filter(entry => selectedIds.includes(entry.id)).map(entry => entry.id));
    assert.equal(result.snapshot.entries.length, prior.entries.length + selectedCount - reusedIds.size);
    assert.equal(new Set(result.snapshot.entries.map((entry) => entry.normalized)).size, result.snapshot.entries.length);
    const priorIds = new Set(prior.entries.map((entry) => entry.id));
    assert.deepEqual(result.snapshot.entries.filter((entry) => priorIds.has(entry.id) && !reusedIds.has(entry.id)), prior.entries.filter(entry => !reusedIds.has(entry.id)));
    for (const old of prior.entries.filter(entry => reusedIds.has(entry.id))) {
      const next = result.snapshot.entries.find(entry => entry.id === old.id);
      assert.equal(next.createdAt, old.createdAt);
      assert.deepEqual(next.readingContexts.filter(context => context.membership !== membership), old.readingContexts);
    }
    assert.deepEqual(chapterEntries(result.snapshot.entries, 5).map((entry) => entry.id), selectedIds);

    for (const [index, count] of [29, 38, 28, 51].entries()) {
      const number = index + 1;
      const before = chapterEntries(prior.entries, number);
      const after = chapterEntries(result.snapshot.entries, number);
      assert.equal(after.length, count);
      assert.deepEqual(after, before);
      assert.deepEqual(
        after.map((entry) => contextualizeReadingEntry(entry, collectionId, "chapter-" + number)),
        before.map((entry) => contextualizeReadingEntry(entry, collectionId, "chapter-" + number))
      );
    }
    assert.deepEqual(filterEntriesByCollection(result.snapshot.entries, "main"), filterEntriesByCollection(prior.entries, "main"));
    for (const entry of result.chapterEntries) {
      assert.equal(entry.synonymScan.status, "pending", entry.term);
      assert.equal(entry.synonymScan.reason, "import_pending", entry.term);
      assert.equal(entry.synonymScan.sourceFingerprint, entrySynonymFingerprint(entry), entry.term);
      assert.deepEqual(entry.synonymScan.matches, []);
      assert.deepEqual(entry.synonyms, [], entry.term + ": do not invent synonym evidence");
    }
  });
});

test("each selected reading card projects its own page, meaning and example while preserving source order gaps", async () => {
  await withFreshImport(async ({ result }) => {
    const views = chapterEntries(result.snapshot.entries, 5)
      .map((entry) => contextualizeReadingEntry(entry, collectionId, chapterId));
    assert.deepEqual(views.map((entry) => entry.term), selectedTerms);
    for (const [index, view] of views.entries()) {
      const item = result.source.items[index];
      assert.equal(view.id, selectedIds[index]);
      assert.equal(view.readingContexts.find((context) => context.membership === membership).order, item.order);
      for (const field of ["originalInput", "entryType", "partOfSpeech", "meaning", "usage", "exampleEn", "exampleZh"]) {
        assert.equal(view[field], item[field], item.term + ": " + field);
      }
      assert.equal(view.definition, item.definitionEn, item.term);
      assert.equal(view.sourceTitle, "Never Let Me Go — Chapter 5");
      assert.equal(view.sourceDate, "p. " + item.page);
      assert.equal(collectionContextForEntry(view, collectionId, chapterId).page, "p. " + item.page);
      assert.deepEqual(view.forms, item.forms);
      assert.ok(publicEntryMatchesQuery(view, item.originalInput), item.term + ": source form remains searchable");
      assert.equal(view.senses[0].meaningZh, item.meaning);
      assert.equal(view.senses[0].usageNotes, item.usage);
      assert.deepEqual(view.senses[0].examples, [{ en: item.exampleEn, zh: item.exampleZh }]);
    }
    const book = buildCollectionCatalog(result.snapshot.entries).find((item) => item.id === collectionId);
    assert.deepEqual(book.chapters.map(({ id, count }) => [id, count]), [
      ["chapter-1", 29], ["chapter-2", 38], ["chapter-3", 28], ["chapter-4", 51], ["chapter-5", 24],
      ["chapter-6", 24], ["chapter-7", 30], ["chapter-8", 25], ["chapter-9", 24]
    ]);
  });
});

test("the shortlist reuses existing review IDs and excludes other chapters and removed cards without mutating their histories", async () => {
  const snapshot = await loadSnapshot();
  const now = new Date(timestamp);
  const views = chapterEntries(snapshot.entries, 5).map((entry) => contextualizeReadingEntry(entry, collectionId, chapterId));
  assert.equal(buildDueQueue(views, [], now).length, selectedCount);
  const savedReview = applyReviewRating("public-nlmg-c5-loom", null, "good", now);
  const unrelatedReview = applyReviewRating("public-nlmg-c1-agitated", null, "again", new Date("2026-09-25T18:00:00.000Z"));
  const removedReview = applyReviewRating("public-nlmg-c5-carry-on", null, "again", new Date("2026-09-25T18:00:00.000Z"));
  const histories = [savedReview, unrelatedReview, removedReview];
  const before = structuredClone(histories);
  const queue = buildDueQueue(views, histories, now);
  assert.equal(queue.length, selectedCount - 1);
  assert.equal(queue.some(({ entry }) => histories.some((state) => state.entryId === entry.id)), false);
  assert.deepEqual(buildStudySummary(views, histories, now), {
    totalEntries: selectedCount, dueCount: selectedCount - 1, newCount: selectedCount - 1,
    dueReviewCount: 0, scheduledCount: 1, reviewedCount: 1
  });
  const later = buildDueQueue(views, histories, new Date(savedReview.dueAt));
  const reviewed = later.find(({ entry }) => entry.id === savedReview.entryId);
  assert.equal(reviewed.status, "review");
  assert.deepEqual(reviewed.reviewState, savedReview);
  assert.equal(reviewed.entry.term, "loom");
  assert.equal(reviewed.entry.sourceDate, "p. 50");
  assert.deepEqual(histories, before, "filtering review scopes must not delete or reset stored history");
  const oldChapterQueue = buildDueQueue(chapterEntries(snapshot.entries, 1), histories, now);
  assert.deepEqual(oldChapterQueue.find(({ entry }) => entry.id === unrelatedReview.entryId).reviewState, unrelatedReview);
});

test("re-importing the shortlist is byte-stable and preserves the existing snapshot and identities", async () => {
  await withFreshImport(async ({ result, snapshotPath }) => {
    const written = await readFile(snapshotPath, "utf8");
    const repeated = await importReadingList({
      sourcePath: fileURLToPath(sourceUrl), snapshotPath,
      timestamp: "2026-09-27T18:00:00.000Z"
    });
    assert.equal(repeated.changed, false);
    assert.equal(repeated.totalChapterEntries, selectedCount);
    assert.deepEqual(repeated.snapshot, result.snapshot);
    assert.equal(await readFile(snapshotPath, "utf8"), written);
  });
  const before = await readFile(snapshotUrl, "utf8");
  const canonical = await importReadingList({ sourcePath: fileURLToPath(sourceUrl), timestamp, checkOnly: true });
  assert.equal(canonical.changed, false, "the checked-in shortlist must already be current");
  assert.equal(canonical.totalChapterEntries, selectedCount);
  assert.deepEqual(canonical.snapshot, JSON.parse(before));
  assert.equal(await readFile(snapshotUrl, "utf8"), before);
});

test("all supplemented canonical and projected Chapter 5 cards pass the unchanged lexical publish gate", async () => {
  const snapshot = parsePublicSnapshot(await loadSnapshot(), { allowLegacy: false });
  const cards = chapterEntries(snapshot.entries, 5);
  assert.equal(cards.length, selectedCount);
  const failures = [];
  for (const card of cards) {
    for (const [label, view] of [
      ["canonical", card], ["Chapter 5", contextualizeReadingEntry(card, collectionId, chapterId)]
    ]) {
      const before = structuredClone(view);
      try {
        assert.equal(reconcileLexicalEntryForPublish(view).senses.length, view.senses.length);
        assert.deepEqual(view, before, "publish validation must not mutate the displayed card");
      } catch (error) {
        failures.push(card.term + " (" + label + "): " + error.message);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("isolated comparison cards preserve two complete senses without creating standalone aliases", async () => {
  const items = [
    comparisonFixture("kidnap / abduction", "kidnap; abduction", [
      fixtureSense("verb", "绑架（kidnap）。", "take someone away by force", "The gang planned to kidnap the banker.", "那伙人计划绑架银行家。"),
      fixtureSense("noun", "绑架行为（abduction）。", "the act of taking someone away by force", "The police prevented the abduction.", "警方阻止了这起绑架。")
    ]),
    comparisonFixture("explicitly / imply", "explicitly claimed; implied", [
      fixtureSense("adverb", "明确地（explicitly）。", "in a clear and direct way", "She did not explicitly agree.", "她没有明确表示同意。"),
      fixtureSense("verb", "暗示（imply）。", "suggest something indirectly", "Her nod seemed to imply approval.", "她点头的动作似乎暗示了赞同。")
    ])
  ];
  await withReadingFixture(items, async ({ result, sourcePath, snapshotPath }) => {
    assert.equal(result.snapshot.entries.length, 2);
    assert.deepEqual(result.chapterEntries.map((entry) => entry.term), items.map((item) => item.term));
    for (const [index, card] of result.chapterEntries.entries()) {
      const context = card.readingContexts[0];
      const projected = contextualizeReadingEntry(card, "reading-fixture", chapterId);
      assert.deepEqual(card.senses, items[index].senses);
      assert.deepEqual(context.senses, card.senses);
      assert.deepEqual(projected.senses, card.senses);
      assert.notEqual(projected.senses, context.senses, "projected sense edits cannot mutate stored contexts");
      assert.equal(meaningItemsForDisplay(projected).length, 2);
      assert.equal(reconcileLexicalEntryForPublish(card).senses.length, 2);
      assert.equal(reconcileLexicalEntryForPublish(projected).senses.length, 2);
      const incomplete = { ...projected, senses: [projected.senses[0]] };
      assert.throws(() => reconcileLexicalEntryForPublish(incomplete), /单义项/u);
      for (const alias of card.term.split(" / ")) {
        assert.equal(result.snapshot.entries.some((entry) => entry.term === alias), false);
        assert.equal(entryLookupKeys(card).includes(alias), false);
      }
    }
    const written = await readFile(snapshotPath, "utf8");
    const repeated = await importReadingList({ sourcePath, snapshotPath, timestamp: "2026-09-27T18:00:00.000Z" });
    assert.equal(repeated.changed, false);
    assert.equal(await readFile(snapshotPath, "utf8"), written);
  });
});

test("isolated source excerpts can belong to different headwords without duplicate aliases", async () => {
  const items = [
    fixtureItem({ term: "defiant", originalInput: "a defiant surge of courage", meaning: "① 不服气的。", definitionEn: "showing resistance",
      exampleEn: "She gave a defiant reply.", exampleZh: "她作出了不服气的回答。" }),
    fixtureItem({ term: "surge", originalInput: "a defiant surge of courage", partOfSpeech: "noun", meaning: "① 突然涌起的一股情绪。", definitionEn: "a sudden strong increase in a feeling",
      exampleEn: "I felt a surge of relief.", exampleZh: "我突然感到一阵宽慰。" }),
    fixtureItem({ term: "utterly", originalInput: "utterly baffling", partOfSpeech: "adverb", meaning: "① 完全地。", definitionEn: "completely",
      exampleEn: "The broken lock was utterly useless.", exampleZh: "那把坏锁完全不能用了。" }),
    fixtureItem({ term: "baffling", originalInput: "utterly baffling", meaning: "① 令人困惑的。", definitionEn: "very difficult to understand",
      exampleEn: "The instructions were baffling.", exampleZh: "说明书令人困惑。" })
  ];
  await withReadingFixture(items, async ({ result }) => {
    assert.equal(result.snapshot.entries.length, 4);
    const byTerm = new Map(result.chapterEntries.map((entry) => [entry.term, entry]));
    for (const [leftTerm, rightTerm] of [["defiant", "surge"], ["utterly", "baffling"]]) {
      const left = byTerm.get(leftTerm), right = byTerm.get(rightTerm);
      assert.notEqual(left.id, right.id);
      assert.equal(left.originalInput, right.originalInput);
      const rightKeys = new Set(entryLookupKeys(right));
      assert.deepEqual(entryLookupKeys(left).filter((key) => rightKeys.has(key)), []);
      for (const card of [left, right]) {
        assert.ok(publicEntryMatchesQuery(card, card.originalInput), card.term + ": excerpt is searchable");
        assert.equal(card.correction.original, card.term, "excerpts are not spelling aliases");
      }
    }
  });
});
