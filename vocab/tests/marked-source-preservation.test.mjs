import assert from "node:assert/strict";
import test from "node:test";

globalThis.BroadcastChannel = undefined;
const { preserveMarkedDraftSource } = await import("../js/marked-import.js");
const { createBlankEntry } = await import("../js/wordbook-schema.js?v=78");
const { mergeAiCandidate } = await import("../js/sync-logic.js?v=78");

const captureBase = () => ({ captureSources: [{ text: "rummaged", context: "She rummaged in the bag.", fileName: "private-camera-page.png", fileHash: "a".repeat(64) }] });
const currentEntry = () => ({
  ...createBlankEntry("rummage"), originalInput: "rummaged", exampleEn: "She rummaged in the bag.", exampleZh: "",
  author: "Kazuo Ishiguro", sourceWork: "Never Let Me Go", sourceTitle: "Never Let Me Go — Chapter 11", sourceDate: "",
  sourceUrl: "", sources: [], attributionStatus: "unverified", attributionNote: "用户选中的上传页原文，待复核。"
});
const aiEntry = () => ({
  ...createBlankEntry("rummage"), originalInput: "rummage", meaning: "翻找；搜寻", definition: "To search through things.",
  phonetic: "/ˈrʌmɪdʒ/", partOfSpeech: "verb", exampleEn: "He rummaged through a drawer.", exampleZh: "他在抽屉里翻找。",
  author: "Unrelated author", sourceWork: "Unrelated book", sourceTitle: "Generated source", sourceDate: "2020",
  sourceUrl: "https://example.com/unrelated", sources: [{ title: "Other source", url: "https://example.com/unrelated", kind: "dictionary", retrievedAt: "2026-10-18T00:00:00.000Z" }],
  attributionStatus: "candidate", attributionNote: "Unrelated generated attribution."
});

test("AI reorganization enriches definitions without replacing uploaded example and attribution", () => {
  const current = currentEntry(), ai = aiEntry(), base = captureBase();
  const beforeCurrent = structuredClone(current), beforeAi = structuredClone(ai), beforeBase = structuredClone(base);
  const genericMerge = mergeAiCandidate(current, current, ai).merged;
  assert.equal(genericMerge.exampleEn, ai.exampleEn, "regression must exercise a generic AI overwrite before source protection");
  const preserved = preserveMarkedDraftSource(genericMerge, current, base);
  for (const field of ["originalInput", "exampleEn", "exampleZh", "author", "sourceWork", "sourceTitle", "sourceDate", "sourceUrl", "sources", "attributionStatus", "attributionNote"]) {
    assert.deepEqual(preserved[field], current[field], field);
  }
  assert.equal(preserved.meaning, ai.meaning); assert.equal(preserved.definition, ai.definition);
  assert.equal(preserved.phonetic, ai.phonetic); assert.equal(preserved.partOfSpeech, ai.partOfSpeech);
  assert.deepEqual(current, beforeCurrent); assert.deepEqual(ai, beforeAi); assert.deepEqual(base, beforeBase);
});

test("manually cleared source fields remain cleared, including both English and Chinese examples", () => {
  const current = currentEntry();
  for (const field of ["originalInput", "exampleEn", "exampleZh", "author", "sourceWork", "sourceTitle", "sourceDate", "sourceUrl", "attributionNote"]) current[field] = "";
  const merged = preserveMarkedDraftSource(aiEntry(), current, captureBase());
  for (const field of ["originalInput", "exampleEn", "exampleZh", "author", "sourceWork", "sourceTitle", "sourceDate", "sourceUrl", "attributionNote"]) assert.equal(merged[field], "", field);
  assert.deepEqual(merged.sources, []); assert.equal(merged.meaning, "翻找；搜寻");
});

test("never attaches a generated Chinese translation to a different retained original sentence", () => {
  const current = currentEntry();
  const merged = preserveMarkedDraftSource(aiEntry(), current, captureBase());
  assert.equal(merged.exampleEn, "She rummaged in the bag."); assert.equal(merged.exampleZh, "");
  current.exampleZh = "她在包里翻找。";
  assert.equal(preserveMarkedDraftSource(aiEntry(), current, captureBase()).exampleZh, "她在包里翻找。");
});

test("noncapture drafts retain ordinary AI merge behavior", () => {
  for (const base of [undefined, {}, { captureSources: [] }, { captureSources: "not-a-capture" }]) {
    const ai = aiEntry(); assert.deepEqual(preserveMarkedDraftSource(ai, currentEntry(), base), ai);
  }
});

test("private upload provenance never leaks into the public entry, and returned arrays are separately owned", () => {
  const current = currentEntry();
  current.sources = [{ title: "Existing selected source", url: "https://example.com/selected", kind: "dictionary", retrievedAt: "2026-10-18T00:00:00.000Z" }];
  const ai = aiEntry(), base = captureBase();
  const output = preserveMarkedDraftSource(ai, current, base);
  assert.doesNotMatch(JSON.stringify(output), /private-camera-page|fileHash|captureSources/u);
  output.sources[0].title = "Changed after merge";
  assert.equal(current.sources[0].title, "Existing selected source");
  assert.equal(ai.sources[0].title, "Other source"); assert.equal(base.captureSources[0].fileName, "private-camera-page.png");
});
