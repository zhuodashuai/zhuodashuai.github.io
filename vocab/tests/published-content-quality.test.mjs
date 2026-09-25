import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contextualizeReadingEntry, normalizeEnglish, parsePublicSnapshot } from "../js/wordbook-schema.js";

const snapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);
const neverLetMeGoUrl = new URL("../data/reading-lists/never-let-me-go/chapter-1.json", import.meta.url);
const neverLetMeGoChapterTwoUrl = new URL("../data/reading-lists/never-let-me-go/chapter-2.json", import.meta.url);
const neverLetMeGoChapterThreeUrl = new URL("../data/reading-lists/never-let-me-go/chapter-3.json", import.meta.url);
const neverLetMeGoChapterFourUrl = new URL("../data/reading-lists/never-let-me-go/chapter-4.json", import.meta.url);

const chapterFourRequested = [
  ["lark about", "37", "larking about", "/lɑːk əˈbaʊt/"],
  ["taboo", "37", "taboo", "/təˈbuː/"],
  ["tug away at something", "37", "tugging away at my memory", "/tʌɡ/"],
  ["collide with", "39", "collided with", "/kəˈlaɪd wɪð/"],
  ["strand", "39", "strands", "/strænd/"],
  ["shoot daggers at someone", "40", "shot daggers at Polly", "/ʃuːt ˈdæɡəz æt/"],
  ["reminisce", "43", "reminiscing", "/ˌremɪˈnɪs/"],
  ["unfathomable", "43", "unfathomable", "/ʌnˈfæðəməbl/"],
  ["uncannily", "43", "uncannily", "/ʌnˈkænɪli/"],
  ["rhubarb", "44", "rhubarb", "/ˈruːbɑːb/"],
  ["foible", "47", "foibles", "/ˈfɔɪbl/"]
];

const chapterFourApprovedAdditions = [
  "coerce", "crop up", "acquisitive", "ambivalent", "be preoccupied with something", "nostalgic",
  "have a keen eye for something", "come to a head", "beneath someone's contempt", "telling-off",
  "go down well with someone", "rumble on", "wisecrack", "out of the blue", "be for it", "dodgy",
  "get worked up", "bumper crop", "set one's heart on something", "rowdy", "steely", "drift", "thwart",
  "bewildered", "take offence", "potty", "nook", "detention", "redeem yourself", "be in hot water",
  "out of bounds", "under one's breath", "make a show of doing something", "weigh somebody up",
  "reel off", "crop", "rein", "canter", "gallop", "cross"
];

const chapterThreeRequested = [
  ["eavesdrop", "25", "eavesdrop"],
  ["raggy", "25", "raggy"],
  ["maroon", "25", "maroon"],
  ["brisk", "26", "brisk"],
  ["crouch down", "27", "crouched down"],
  ["inkling", "27", "inkling"],
  ["indulgently", "32", "indulgently"],
  ["chilly look", "32", "chilly look"],
  ["snooty", "33", "snooty"],
  ["billiards", "33", "billiards"],
  ["loiter", "34", "loitered"],
  ["rummage", "35", "rummaging"],
  ["saunter out", "35", "sauntered out"],
  ["stiff", "35", "stiff"],
  ["halt", "35", "halt"],
  ["shriek", "35", "shriek"]
];

async function publishedEntries() {
  const raw = JSON.parse(await readFile(snapshotUrl, "utf8"));
  return parsePublicSnapshot(raw).entries;
}

test("published hip uses real hip collocations and never substitutes a phrase without hip", async () => {
  const hip = (await publishedEntries()).find((entry) => entry.term === "hip");
  assert.ok(hip);
  const content = JSON.stringify(hip);
  assert.doesNotMatch(content, /keep up with the times/i);
  assert.ok(hip.collocations.includes("be hip to something"));
  assert.ok(hip.collocations.includes("get hip to something"));
  assert.deepEqual(hip.synonyms, []);
});

test("published surveillance is one ordinary uncountable sense without a made-up plural or electrical subsense", async () => {
  const surveillance = (await publishedEntries()).find((entry) => entry.term === "surveillance");
  assert.ok(surveillance);
  assert.equal(surveillance.senses.length, 1);
  assert.match(surveillance.meaning, /不可数/);
  assert.doesNotMatch(JSON.stringify(surveillance), /\[电\]|侦测|surveillances/i);
  assert.deepEqual(surveillance.forms, []);
  assert.ok(surveillance.sources.some((source) => source.kind === "authoritative" && /oxfordlearnersdictionaries\.com/i.test(source.url)));
  assert.deepEqual(surveillance.synonyms, []);
});

test("published perspicacious keeps only the modern mental-discernment sense and cites Collins", async () => {
  const perspicacious = (await publishedEntries()).find((entry) => entry.term === "perspicacious");
  assert.ok(perspicacious);
  assert.doesNotMatch(JSON.stringify(perspicacious), /目光锐利|keen eyesight|keen vision/i);
  assert.deepEqual(perspicacious.confusedWith, []);
  assert.deepEqual(perspicacious.senses.flatMap((sense) => sense.confusables), []);
  assert.deepEqual(perspicacious.synonyms, []);
  assert.ok(perspicacious.sources.some((source) => source.kind === "authoritative" && /collinsdictionary\.com/i.test(source.url)));
});

test("Never Let Me Go Chapter 1 contains exactly the 29 requested, editable learning entries", async () => {
  const [entries, source] = await Promise.all([
    publishedEntries(),
    readFile(neverLetMeGoUrl, "utf8").then(JSON.parse)
  ]);
  const membership = "collection:never-let-me-go:chapter-1";
  const chapterEntries = entries.filter((entry) => entry.tags.includes(membership));
  assert.equal(source.items.length, 29);
  assert.equal(chapterEntries.length, 29);
  assert.deepEqual(
    chapterEntries.map((entry) => entry.term).sort(),
    source.items.map((entry) => entry.term).sort()
  );
  const requestedOriginals = new Map(source.items.map((item) => [item.term, item.originalInput]));
  for (const entry of chapterEntries) {
    assert.equal(entry.originalInput, requestedOriginals.get(entry.term));
    assert.equal(entry.sourceTitle, "Never Let Me Go — Chapter 1");
    assert.equal(entry.sourceWork, "Never Let Me Go");
    assert.equal(entry.senses.length, 1);
    assert.equal(entry.senses[0].meaningZh, entry.meaning);
    assert.equal(entry.senses[0].definitionEn, entry.definition);
    assert.ok(entry.senses[0].examples.length >= 1);
    assert.match(entry.usage, /第一章语境/u);
    assert.doesNotMatch(entry.attributionNote, /小说原文摘录/u);
  }
  assert.equal(new Set(chapterEntries.map((entry) => entry.id)).size, 29);
  assert.equal(new Set(chapterEntries.map((entry) => entry.normalized)).size, 29);
});

test("Never Let Me Go Chapter 2 contains all 38 requested contexts while shared words remain canonical", async () => {
  const [entries, source] = await Promise.all([
    publishedEntries(),
    readFile(neverLetMeGoChapterTwoUrl, "utf8").then(JSON.parse)
  ]);
  const membership = "collection:never-let-me-go:chapter-2";
  const chapterEntries = entries.filter((entry) => entry.tags.includes(membership));
  assert.equal(source.items.length, 38);
  assert.equal(chapterEntries.length, 38);
  assert.equal(new Set(chapterEntries.map((entry) => entry.normalized)).size, 38);
  assert.deepEqual(
    chapterEntries.map((entry) => entry.term).sort(),
    source.items.map((entry) => entry.term).sort()
  );
  const sourceItems = new Map(source.items.map((item) => [item.term, item]));
  for (const entry of chapterEntries) {
    const item = sourceItems.get(entry.term);
    const contextual = contextualizeReadingEntry(entry, "never-let-me-go", "chapter-2");
    assert.equal(contextual.originalInput, item.originalInput);
    assert.equal(contextual.partOfSpeech, item.partOfSpeech);
    assert.equal(contextual.meaning, item.meaning);
    assert.equal(contextual.definition, item.definitionEn);
    assert.equal(contextual.usage, item.usage);
    assert.deepEqual(contextual.collocations, item.collocations);
    assert.equal(contextual.sourceTitle, "Never Let Me Go — Chapter 2");
    assert.equal(contextual.sourceWork, "Never Let Me Go");
    assert.equal(contextual.sourceDate, `p. ${item.page}`);
    assert.match(contextual.usage, /第二章语境/u);
    assert.equal(contextual.senses[0].meaningZh, contextual.meaning);
    assert.ok(contextual.senses[0].examples.length >= 1);
  }
  const bookEntries = entries.filter((entry) => entry.tags.some((tag) => /^collection:never-let-me-go:chapter-[12]$/u.test(tag)));
  assert.equal(bookEntries.length, 65);
  for (const term of ["shrug", "tantrum"]) {
    const matches = entries.filter((entry) => entry.term === term);
    assert.equal(matches.length, 1);
    assert.ok(matches[0].tags.includes("collection:never-let-me-go:chapter-1"));
    assert.ok(matches[0].tags.includes("collection:never-let-me-go:chapter-2"));
    for (const chapter of [1, 2]) {
      assert.ok(matches[0].readingContexts.some((context) => context.membership === `collection:never-let-me-go:chapter-${chapter}`));
    }
  }
});

test("Never Let Me Go Chapter 3 contains exactly the 16 photo-reviewed terms, original forms and pages", async () => {
  const [entries, source] = await Promise.all([
    publishedEntries(),
    readFile(neverLetMeGoChapterThreeUrl, "utf8").then(JSON.parse)
  ]);
  const membership = "collection:never-let-me-go:chapter-3";
  const chapterEntries = entries.filter((entry) => entry.tags.includes(membership));
  assert.equal(source.expectedItemCount, 16);
  assert.deepEqual(source.items.map((item) => [item.term, String(item.page), item.originalInput]), chapterThreeRequested);
  assert.deepEqual(chapterEntries.map((entry) => entry.term).sort(), chapterThreeRequested.map(([term]) => term).sort());
  assert.equal(new Set(chapterEntries.map((entry) => entry.id)).size, 16);
  assert.equal(new Set(chapterEntries.map((entry) => entry.normalized)).size, 16);
  assert.match(source.attributionNote, /照片/u);
  assert.match(source.attributionNote, /人工校读/u);
  assert.match(source.attributionNote, /例句为学习用自拟句，不是小说原文/u);

  for (const item of source.items) {
    const entry = chapterEntries.find((candidate) => candidate.term === item.term);
    const context = entry.readingContexts.find((candidate) => candidate.membership === membership);
    const contextual = contextualizeReadingEntry(entry, "never-let-me-go", "chapter-3");
    assert.ok(context, `${item.term} must retain its Chapter 3 context`);
    assert.equal(entries.filter((candidate) => candidate.normalized === entry.normalized).length, 1);
    assert.equal(entry.standardForm, item.term);
    assert.equal(entry.correction.original, item.originalInput);
    assert.equal(entry.correction.chosen, item.term);
    assert.equal(entry.correction.status, item.term === item.originalInput ? "exact" : "accepted");
    assert.equal(context.page, `p. ${item.page}`);
    for (const version of [entry, context, contextual]) {
      for (const field of ["originalInput", "partOfSpeech", "meaning", "usage", "exampleEn", "exampleZh"]) {
        assert.equal(version[field], item[field], `${item.term}: ${field}`);
      }
      assert.equal(version.definition, item.definitionEn);
      assert.deepEqual(version.forms, item.forms);
      assert.deepEqual(version.collocations, item.collocations);
      assert.equal(version.sourceTitle, "Never Let Me Go — Chapter 3");
      assert.equal(version.sourceWork, "Never Let Me Go");
      assert.equal(version.sourceDate, `p. ${item.page}`);
      assert.equal(version.attributionNote, source.attributionNote);
      assert.match(version.usage, /第三章语境/u);
    }
    assert.equal(contextual.senses[0].meaningZh, item.meaning);
    assert.equal(contextual.senses[0].definitionEn, item.definitionEn);
    assert.equal(contextual.senses[0].usageNotes, item.usage);
    assert.deepEqual(contextual.senses[0].examples, [{ en: item.exampleEn, zh: item.exampleZh }]);
  }

  const firstThreeChapters = entries.filter((entry) => entry.tags.some((tag) => /^collection:never-let-me-go:chapter-[123]$/u.test(tag)));
  assert.equal(firstThreeChapters.length, 81);
});

test("Chapter 3 shriek preserves Madame's absence of a scream or gasp in every displayed context", async () => {
  const [entries, source] = await Promise.all([
    publishedEntries(),
    readFile(neverLetMeGoChapterThreeUrl, "utf8").then(JSON.parse)
  ]);
  const item = source.items.find((candidate) => candidate.term === "shriek");
  const entry = entries.find((candidate) => candidate.term === "shriek");
  assert.ok(item);
  assert.ok(entry);
  const context = entry.readingContexts.find((candidate) => candidate.membership === "collection:never-let-me-go:chapter-3");
  const contextual = contextualizeReadingEntry(entry, "never-let-me-go", "chapter-3");
  assert.match(item.usage, /没有尖叫，也没有倒抽一口气/u);
  assert.match(item.usage, /只是僵住等他们走过/u);
  for (const usage of [entry.usage, entry.senses[0].usageNotes, context.usage, contextual.usage, contextual.senses[0].usageNotes]) {
    assert.equal(usage, item.usage);
  }
  assert.equal(contextual.sourceDate, "p. 35");
});

test("Never Let Me Go Chapter 4 preserves the original 11 and all 40 approved additions with complete learning contexts", async () => {
  const [entries, source] = await Promise.all([
    publishedEntries(),
    readFile(neverLetMeGoChapterFourUrl, "utf8").then(JSON.parse)
  ]);
  const membership = "collection:never-let-me-go:chapter-4";
  const chapterEntries = entries.filter((entry) => entry.tags.includes(membership));
  const requestedTerms = [...chapterFourRequested.map(([term]) => term), ...chapterFourApprovedAdditions];
  assert.equal(source.expectedItemCount, 51);
  assert.equal(source.items.length, 51);
  assert.equal(chapterFourApprovedAdditions.length, 40);
  assert.equal(new Set(requestedTerms).size, 51);
  assert.deepEqual(source.items.map((item) => item.term).sort(), [...requestedTerms].sort());
  assert.deepEqual(chapterFourRequested.map(([term]) => {
    const item = source.items.find((candidate) => candidate.term === term);
    return [item.term, String(item.page), item.originalInput, item.phonetic];
  }), chapterFourRequested);
  assert.equal(chapterEntries.length, 51);
  assert.deepEqual(chapterEntries.map((entry) => entry.term).sort(), [...requestedTerms].sort());
  assert.equal(new Set(chapterEntries.map((entry) => entry.id)).size, 51);
  assert.equal(new Set(chapterEntries.map((entry) => entry.normalized)).size, 51);
  assert.match(source.attributionNote, /照片/u);
  assert.match(source.attributionNote, /人工校读/u);
  assert.match(source.attributionNote, /例句为学习用自拟句，不是小说原文/u);

  for (const item of source.items) {
    for (const field of ["term", "originalInput", "partOfSpeech", "meaning", "definitionEn", "usage", "exampleEn", "exampleZh"]) {
      assert.equal(typeof item[field], "string", `${item.term}: ${field} must be text`);
      assert.ok(item[field].trim(), `${item.term}: ${field} must be complete`);
    }
    assert.match(String(item.page), /^\d+(?:[-–]\d+)?(?:,\s*\d+(?:[-–]\d+)?)*$/u);
    assert.ok(Array.isArray(item.forms), `${item.term}: forms must be present`);
    assert.ok(Array.isArray(item.collocations) && item.collocations.length > 0, `${item.term}: collocations must be complete`);
    const entry = chapterEntries.find((candidate) => candidate.term === item.term);
    const context = entry.readingContexts.find((candidate) => candidate.membership === membership);
    const contextual = contextualizeReadingEntry(entry, "never-let-me-go", "chapter-4");
    assert.ok(context, `${item.term} must retain its Chapter 4 context`);
    assert.equal(entries.filter((candidate) => candidate.normalized === entry.normalized).length, 1);
    assert.equal(entry.standardForm, item.term);
    assert.equal(entry.correction.original, item.originalInput);
    assert.equal(entry.correction.chosen, item.term);
    assert.equal(entry.correction.status, normalizeEnglish(item.term) === normalizeEnglish(item.originalInput) ? "exact" : "accepted");
    assert.equal(context.page, `p. ${item.page}`);
    assert.equal(entry.phonetic, item.phonetic ?? "");
    assert.equal(contextual.phonetic, item.phonetic ?? "");
    for (const version of [entry, context, contextual]) {
      for (const field of ["originalInput", "partOfSpeech", "meaning", "usage", "exampleEn", "exampleZh"]) {
        assert.equal(version[field], item[field], `${item.term}: ${field}`);
      }
      assert.equal(version.definition, item.definitionEn);
      assert.deepEqual(version.forms, item.forms);
      assert.deepEqual(version.collocations, item.collocations);
      assert.equal(version.sourceTitle, "Never Let Me Go — Chapter 4");
      assert.equal(version.sourceWork, "Never Let Me Go");
      assert.equal(version.sourceDate, `p. ${item.page}`);
      assert.equal(version.attributionNote, source.attributionNote);
      assert.match(version.usage, /第四章语境/u);
    }
    assert.equal(contextual.senses[0].meaningZh, item.meaning);
    assert.equal(contextual.senses[0].definitionEn, item.definitionEn);
    assert.equal(contextual.senses[0].usageNotes, item.usage);
    assert.deepEqual(contextual.senses[0].examples, [{ en: item.exampleEn, zh: item.exampleZh }]);
  }

  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.normalized)).size, entries.length);
  assert.deepEqual([1, 2, 3, 4].map((chapter) => entries.filter((entry) => entry.tags.includes(`collection:never-let-me-go:chapter-${chapter}`)).length), [29, 38, 16, 51]);
});

test("Chapter 2 acoustics preserves the quiet-conversation context in every displayed field", async () => {
  const [entries, source] = await Promise.all([
    publishedEntries(),
    readFile(neverLetMeGoChapterTwoUrl, "utf8").then(JSON.parse)
  ]);
  const item = source.items.find((entry) => entry.term === "acoustics");
  const entry = entries.find((entry) => entry.term === "acoustics");
  assert.ok(item);
  assert.ok(entry);
  const contextual = contextualizeReadingEntry(entry, "never-let-me-go", "chapter-2");
  const context = entry.readingContexts.find((context) => context.membership === "collection:never-let-me-go:chapter-2");
  const expectedUsage = "这里不是泛指“声学”这门学科。第二章语境：大厅的声音传播特点，加上嘈杂的人声，使压低声音的近距离交谈较不容易被旁人听见，因此午餐队伍反而适合私下谈话。";
  for (const usage of [item.usage, entry.usage, entry.senses[0].usageNotes, context.usage, contextual.usage, contextual.senses[0].usageNotes]) {
    assert.equal(usage, expectedUsage);
  }
  for (const example of [item.exampleEn, entry.exampleEn, entry.senses[0].examples[0].en, context.exampleEn, contextual.exampleEn]) {
    assert.match(example, /quiet conversation harder to overhear/u);
  }
  assert.equal(contextual.sourceDate, "p. 22");
  assert.equal(contextual.partOfSpeech, "plural noun");
  assert.match(contextual.attributionNote, /例句为学习用自拟句，不是小说原文/u);
  assert.doesNotMatch(JSON.stringify([item, entry]), /使附近的人可能听到谈话|carried their voices across the room|传到了房间另一边/u);
});
