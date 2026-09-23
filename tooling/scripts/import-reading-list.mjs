import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeEnglish, parsePublicSnapshot } from "../../vocab/js/wordbook-schema.js";

const ROOT = resolve(import.meta.dirname, "../..");
const SNAPSHOT_PATH = resolve(ROOT, "vocab/data/owner-wordbook.json");
const DEFAULT_SOURCE_PATH = resolve(ROOT, "vocab/data/reading-lists/never-let-me-go/chapter-1.json");

function option(name, fallback = "") {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function uniqueText(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function slug(value) {
  return normalizeEnglish(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110);
}

function chapterNumber(source) {
  return Number(source.chapter?.number || String(source.chapter?.id || "").match(/^chapter-(\d+)$/u)?.[1]);
}

function chineseChapter(number) {
  const labels = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (number <= 10) return labels[number];
  if (number < 20) return `十${labels[number - 10]}`;
  return String(number);
}

function stableId(source, term) {
  const collection = source.collection.id === "never-let-me-go" ? "nlmg" : slug(source.collection.id);
  return `public-${collection}-c${chapterNumber(source)}-${slug(term)}`;
}

function attributionNote(source) {
  if (source.attributionNote !== undefined) return source.attributionNote.trim();
  const chapter = chineseChapter(chapterNumber(source));
  return `由卓提供的 ${source.chapter.title} 学习清单整理；章节语境限定于第${chapter}章，例句为学习用自拟句，不是小说原文。`;
}

function readingContextFromItem(item, source) {
  return {
    membership: `collection:${source.collection.id}:${source.chapter.id}`,
    page: item.page ? `p. ${String(item.page).replace(/^p\.\s*/iu, "")}` : "",
    originalInput: String(item.originalInput || "").trim(),
    entryType: String(item.entryType || "word"),
    partOfSpeech: String(item.partOfSpeech || "").trim(),
    meaning: String(item.meaning || "").trim(),
    definition: String(item.definitionEn || "").trim(),
    usage: String(item.usage || "").trim(),
    register: String(item.register || "neutral"),
    collocations: uniqueText(item.collocations),
    confusedWith: uniqueText(item.confusedWith),
    forms: uniqueText(item.forms),
    exampleEn: String(item.exampleEn || "").trim(),
    exampleZh: String(item.exampleZh || "").trim(),
    sourceTitle: source.sourceTitle,
    sourceWork: source.collection.title,
    sourceDate: item.page ? `p. ${String(item.page).replace(/^p\.\s*/iu, "")}` : "",
    attributionNote: attributionNote(source)
  };
}

function entryFromItem(item, source, timestamp) {
  const term = String(item.term || "").trim();
  const originalInput = String(item.originalInput || "").trim();
  const exact = normalizeEnglish(term) === normalizeEnglish(originalInput);
  const membership = `collection:${source.collection.id}:${source.chapter.id}`;
  const forms = uniqueText(item.forms);
  const tags = uniqueText([membership, "文学阅读", ...item.tags]);
  const definition = String(item.definitionEn || "").trim();
  const meaning = String(item.meaning || "").trim();
  const usage = String(item.usage || "").trim();
  const exampleEn = String(item.exampleEn || "").trim();
  const exampleZh = String(item.exampleZh || "").trim();
  const collocations = uniqueText(item.collocations);
  const confusedWith = uniqueText(item.confusedWith);
  const partOfSpeech = String(item.partOfSpeech || "").trim();
  const readingContext = readingContextFromItem(item, source);
  const candidate = {
    id: stableId(source, term),
    revision: 1,
    originalInput,
    term,
    normalized: normalizeEnglish(term),
    standardForm: term,
    entryType: String(item.entryType || "word"),
    correction: exact
      ? { status: "exact", original: originalInput, suggestion: "", chosen: term, confidence: 1, source: "user-provided" }
      : { status: "accepted", original: originalInput, suggestion: term, chosen: term, confidence: 1, source: "manual-lemma-normalization" },
    phonetic: "",
    partOfSpeech,
    meaning,
    definition,
    senses: [{
      partOfSpeech,
      meaningZh: meaning,
      definitionEn: definition,
      usageNotes: usage,
      register: String(item.register || "neutral"),
      collocations,
      examples: [{ en: exampleEn, zh: exampleZh }],
      confusables: confusedWith
    }],
    collocations,
    synonyms: [],
    exampleEn,
    exampleZh,
    usage,
    register: String(item.register || "neutral"),
    confusedWith,
    forms,
    tags,
    author: "",
    sourceTitle: source.sourceTitle,
    sourceWork: source.collection.title,
    sourceDate: readingContext.sourceDate,
    sourceUrl: "",
    attributionStatus: "unverified",
    attributionNote: readingContext.attributionNote,
    sources: [],
    readingContexts: [readingContext],
    organizationMethod: "manual",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return candidate;
}

async function writeSnapshotAtomically(snapshotPath, snapshot) {
  const temporaryPath = `${snapshotPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, snapshotPath);
  } finally {
    await unlink(temporaryPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

function validateSource(source) {
  assert(source?.schemaVersion === 1, "阅读清单 schemaVersion 必须为 1。");
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(source.collection?.id || ""), "词本 ID 不正确。");
  assert(typeof source.collection?.title === "string" && source.collection.title.trim(), "词本标题不正确。");
  const number = chapterNumber(source);
  assert(Number.isInteger(number) && number > 0, "章节编号不正确。");
  assert(source.chapter?.id === `chapter-${number}` && source.chapter?.title === `Chapter ${number}`, "章节 ID、标题与编号不一致。");
  assert(source.sourceTitle === `${source.collection.title} — ${source.chapter.title}`, "统一来源标题不正确。");
  if (source.attributionNote !== undefined) {
    assert(typeof source.attributionNote === "string" && source.attributionNote.trim() && source.attributionNote.length <= 1500, "阅读清单 attributionNote 必须为不超过 1500 字符的非空文本。");
  }
  assert(Number.isInteger(source.expectedItemCount) && source.expectedItemCount > 0, "阅读清单 expectedItemCount 不正确。");
  assert(Array.isArray(source.items) && source.items.length === source.expectedItemCount, `阅读清单必须恰好包含 ${source.expectedItemCount} 条。`);
  const normalized = source.items.map((item) => normalizeEnglish(item.term));
  assert(normalized.every(Boolean), "每条记录都必须有英文词条。");
  assert(new Set(normalized).size === source.expectedItemCount, "阅读清单含有重复词条。");
  for (const [index, item] of source.items.entries()) {
    for (const field of ["term", "originalInput", "entryType", "partOfSpeech", "meaning", "definitionEn", "usage", "exampleEn", "exampleZh"]) {
      assert(typeof item[field] === "string" && item[field].trim(), `第 ${index + 1} 条缺少 ${field}。`);
    }
    assert(Array.isArray(item.forms) && Array.isArray(item.collocations) && Array.isArray(item.tags), `第 ${index + 1} 条列表字段不完整。`);
    assert(new RegExp(`第${chineseChapter(number)}章语境`, "u").test(item.usage), `第 ${index + 1} 条没有明确标出第${chineseChapter(number)}章语境。`);
    if (item.page !== undefined) assert(/^\d+(?:[-–]\d+)?$/u.test(String(item.page)), `第 ${index + 1} 条页码格式不正确。`);
  }
}

export async function importReadingList({
  sourcePath = DEFAULT_SOURCE_PATH,
  snapshotPath = SNAPSHOT_PATH,
  timestamp = new Date().toISOString(),
  checkOnly = false
} = {}) {
  const [sourceRaw, snapshotRaw] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(snapshotPath, "utf8")
  ]);
  const source = JSON.parse(sourceRaw);
  validateSource(source);
  const current = parsePublicSnapshot(JSON.parse(snapshotRaw), { allowLegacy: false });
  const membership = `collection:${source.collection.id}:${source.chapter.id}`;
  const collectionPrefix = `collection:${source.collection.id}:`;
  const expectedItemCount = source.expectedItemCount;
  const requested = new Set(source.items.map((item) => normalizeEnglish(item.term)));
  const byId = new Map(current.entries.map((entry) => [entry.id, entry]));
  const byNormalized = new Map();
  for (const entry of current.entries) {
    if (!byNormalized.has(entry.normalized)) byNormalized.set(entry.normalized, []);
    byNormalized.get(entry.normalized).push(entry);
  }
  let changed = false;

  const replacements = new Map();
  for (const item of source.items) {
    const requestedStableId = stableId(source, item.term);
    const normalized = normalizeEnglish(item.term);
    const byStableId = byId.get(requestedStableId) || null;
    const sameTerms = byNormalized.get(normalized) || [];
    const sameMembership = sameTerms.find((entry) => entry.tags.includes(membership)) || null;
    if (byStableId && byStableId.normalized !== normalized) {
      throw new Error(`稳定 ID ${requestedStableId} 已属于另一词条；已停止以避免覆盖。`);
    }
    if (byStableId && sameMembership && byStableId.id !== sameMembership.id) {
      throw new Error(`词条“${item.term}”同时命中不同记录；已停止以避免重复。`);
    }
    let existing = byStableId || sameMembership;
    if (!existing && sameTerms.length) {
      const reusable = sameTerms.filter((entry) => entry.sourceWork === source.collection.title
        && entry.tags.some((tag) => tag.startsWith(collectionPrefix)));
      if (reusable.length !== 1 || item.reuseExistingSameSense !== true) {
        throw new Error(`词条“${item.term}”已存在；跨章节复用必须唯一且显式标记 reuseExistingSameSense。`);
      }
      existing = reusable[0];
    }
    if (existing) {
      const contexts = Array.isArray(existing.readingContexts) ? existing.readingContexts : [];
      const nextContext = readingContextFromItem(item, source);
      const contextIndex = contexts.findIndex((context) => context.membership === membership);
      const nextContexts = contextIndex === -1
        ? [...contexts, nextContext]
        : contexts.map((context, index) => index === contextIndex ? nextContext : context);
      const desired = entryFromItem(item, source, timestamp);
      let next = {
        ...existing,
        tags: uniqueText([...existing.tags, membership, "文学阅读", ...item.tags]),
        readingContexts: nextContexts
      };

      // When this chapter owns the stable ID, the reviewed source file is the
      // canonical chapter content. Keep identity, review-safe metadata and
      // owner-only enrichments, but let corrected source fields flow through.
      if (existing.id === requestedStableId) {
        next = {
          ...next,
          originalInput: desired.originalInput,
          standardForm: desired.standardForm,
          entryType: desired.entryType,
          correction: desired.correction,
          partOfSpeech: desired.partOfSpeech,
          meaning: desired.meaning,
          definition: desired.definition,
          senses: desired.senses,
          collocations: desired.collocations,
          exampleEn: desired.exampleEn,
          exampleZh: desired.exampleZh,
          usage: desired.usage,
          register: desired.register,
          confusedWith: desired.confusedWith,
          forms: desired.forms,
          sourceTitle: desired.sourceTitle,
          sourceWork: desired.sourceWork,
          sourceDate: desired.sourceDate,
          attributionNote: desired.attributionNote
        };
      }
      if (sameJson(next, existing)) continue;
      next = {
        ...next,
        revision: existing.revision + 1,
        updatedAt: timestamp
      };
      const validated = parsePublicSnapshot({
        schemaVersion: 3,
        exportedAt: timestamp,
        revisionId: current.revisionId,
        lastMutationId: current.lastMutationId,
        entries: [next]
      }, { allowLegacy: false }).entries[0];
      replacements.set(existing.id, validated);
      changed = true;
      continue;
    }
    const next = entryFromItem(item, source, timestamp);
    const validated = parsePublicSnapshot({
      schemaVersion: 3,
      exportedAt: timestamp,
      revisionId: current.revisionId,
      lastMutationId: current.lastMutationId,
      entries: [next]
    }, { allowLegacy: false }).entries[0];
    replacements.set(next.id, validated);
    changed = true;
  }

  const entries = current.entries.map((entry) => replacements.get(entry.id) || entry);
  for (const entry of replacements.values()) {
    if (!entries.some((candidate) => candidate.id === entry.id)) entries.push(entry);
  }

  const allChapterEntries = entries.filter((entry) => entry.tags.includes(membership));
  assert(new Set(allChapterEntries.map((entry) => entry.normalized)).size === allChapterEntries.length, `导入后 ${source.chapter.title} 出现重复词条。`);
  const chapterEntries = allChapterEntries.filter((entry) => requested.has(entry.normalized));
  assert(chapterEntries.length === expectedItemCount, `导入后清单词条应为 ${expectedItemCount} 条，实际为 ${chapterEntries.length} 条。`);
  assert(new Set(chapterEntries.map((entry) => entry.normalized)).size === expectedItemCount, "导入后的清单词条不唯一。");
  assert(chapterEntries.every((entry) => entry.readingContexts.some((context) => context.membership === membership)), "导入后的词条缺少章节语境。");

  const snapshot = parsePublicSnapshot({
    schemaVersion: 3,
    exportedAt: changed ? timestamp : current.exportedAt,
    revisionId: changed ? crypto.randomUUID() : current.revisionId,
    lastMutationId: changed ? `batch-${slug(source.collection.id)}-${source.chapter.id}-${crypto.randomUUID()}` : current.lastMutationId,
    entries
  }, { allowLegacy: false });
  if (!checkOnly && changed) await writeSnapshotAtomically(snapshotPath, snapshot);
  return { changed, snapshot, chapterEntries, totalChapterEntries: allChapterEntries.length, source };
}

async function main() {
  const sourcePath = resolve(option("--source", DEFAULT_SOURCE_PATH));
  const timestamp = option("--timestamp", new Date().toISOString());
  const checkOnly = process.argv.includes("--check");
  const { changed, snapshot, chapterEntries, source } = await importReadingList({ sourcePath, timestamp, checkOnly });
  console.log(JSON.stringify({
    mode: checkOnly ? "check" : "write",
    changed,
    totalEntries: snapshot.entries.length,
    collection: source.collection.title,
    chapter: source.chapter.title,
    importedEntries: chapterEntries.length,
    uniqueTerms: new Set(chapterEntries.map((entry) => entry.normalized)).size,
    sourceTitle: [...new Set(chapterEntries.map((entry) => (
      entry.readingContexts.find((context) => context.membership === `collection:${source.collection.id}:${source.chapter.id}`)?.sourceTitle
      || entry.sourceTitle
    )))]
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
