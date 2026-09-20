import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeEnglish, parsePublicSnapshot } from "../../vocab/js/wordbook-schema.js";

const ROOT = resolve(import.meta.dirname, "../..");
const SNAPSHOT_PATH = resolve(ROOT, "vocab/data/owner-wordbook.json");
const DEFAULT_SOURCE_PATH = resolve(ROOT, "vocab/data/reading-lists/never-let-me-go/chapter-1.json");
const EXPECTED_ITEM_COUNT = 29;

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

function slug(value) {
  return normalizeEnglish(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110);
}

function entryFromItem(item, source, timestamp) {
  const term = String(item.term || "").trim();
  const originalInput = String(item.originalInput || "").trim();
  const exact = normalizeEnglish(term) === normalizeEnglish(originalInput);
  const membership = `collection:${source.collection.id}:${source.chapter.id}`;
  const forms = uniqueText(item.forms);
  if (!exact && !forms.some((form) => normalizeEnglish(form) === normalizeEnglish(originalInput))) forms.unshift(originalInput);
  const tags = uniqueText([membership, "文学阅读", ...item.tags]);
  const definition = String(item.definitionEn || "").trim();
  const meaning = String(item.meaning || "").trim();
  const usage = String(item.usage || "").trim();
  const exampleEn = String(item.exampleEn || "").trim();
  const exampleZh = String(item.exampleZh || "").trim();
  const collocations = uniqueText(item.collocations);
  const partOfSpeech = String(item.partOfSpeech || "").trim();
  const candidate = {
    id: `public-nlmg-c1-${slug(term)}`,
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
      confusables: []
    }],
    collocations,
    synonyms: [],
    exampleEn,
    exampleZh,
    usage,
    register: String(item.register || "neutral"),
    confusedWith: [],
    forms,
    tags,
    author: "",
    sourceTitle: source.sourceTitle,
    sourceWork: source.collection.title,
    sourceDate: "",
    sourceUrl: "",
    attributionStatus: "unverified",
    attributionNote: "由卓提供的 Chapter 1 学习清单整理；章节语境限定于第一章，例句为学习用自拟句，不是小说原文。",
    sources: [],
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
  assert(source.collection?.id === "never-let-me-go", "本次导入必须属于 Never Let Me Go。");
  assert(source.collection?.title === "Never Let Me Go", "词本标题不正确。");
  assert(source.chapter?.id === "chapter-1" && source.chapter?.title === "Chapter 1", "章节必须为 Chapter 1。");
  assert(source.sourceTitle === "Never Let Me Go — Chapter 1", "统一来源标题不正确。");
  assert(Array.isArray(source.items) && source.items.length === EXPECTED_ITEM_COUNT, `阅读清单必须恰好包含 ${EXPECTED_ITEM_COUNT} 条。`);
  const normalized = source.items.map((item) => normalizeEnglish(item.term));
  assert(normalized.every(Boolean), "每条记录都必须有英文词条。");
  assert(new Set(normalized).size === EXPECTED_ITEM_COUNT, "阅读清单含有重复词条。");
  for (const [index, item] of source.items.entries()) {
    for (const field of ["term", "originalInput", "entryType", "partOfSpeech", "meaning", "definitionEn", "usage", "exampleEn", "exampleZh"]) {
      assert(typeof item[field] === "string" && item[field].trim(), `第 ${index + 1} 条缺少 ${field}。`);
    }
    assert(Array.isArray(item.forms) && Array.isArray(item.collocations) && Array.isArray(item.tags), `第 ${index + 1} 条列表字段不完整。`);
    assert(/第一章语境/u.test(item.usage), `第 ${index + 1} 条没有明确标出第一章语境。`);
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
  const requested = new Set(source.items.map((item) => normalizeEnglish(item.term)));
  const byId = new Map(current.entries.map((entry) => [entry.id, entry]));
  const byNormalized = new Map(current.entries.map((entry) => [entry.normalized, entry]));
  let changed = false;

  const replacements = new Map();
  for (const item of source.items) {
    const stableId = `public-nlmg-c1-${slug(item.term)}`;
    const normalized = normalizeEnglish(item.term);
    const byStableId = byId.get(stableId) || null;
    const byTerm = byNormalized.get(normalized) || null;
    if (byStableId && byStableId.normalized !== normalized) {
      throw new Error(`稳定 ID ${stableId} 已属于另一词条；已停止以避免覆盖。`);
    }
    if (byStableId && byTerm && byStableId.id !== byTerm.id) {
      throw new Error(`词条“${item.term}”同时命中不同记录；已停止以避免重复。`);
    }
    const existing = byStableId || byTerm;
    if (existing && !existing.tags.includes(membership)) {
      throw new Error(`词条“${item.term}”已存在于其他词本；已停止以避免覆盖或重复，请先人工合并。`);
    }
    if (existing) {
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
  assert(new Set(allChapterEntries.map((entry) => entry.normalized)).size === allChapterEntries.length, "导入后 Chapter 1 出现重复词条。");
  const chapterEntries = allChapterEntries.filter((entry) => requested.has(entry.normalized));
  assert(chapterEntries.length === EXPECTED_ITEM_COUNT, `导入后清单词条应为 ${EXPECTED_ITEM_COUNT} 条，实际为 ${chapterEntries.length} 条。`);
  assert(new Set(chapterEntries.map((entry) => entry.normalized)).size === EXPECTED_ITEM_COUNT, "导入后的清单词条不唯一。");

  const snapshot = parsePublicSnapshot({
    schemaVersion: 3,
    exportedAt: changed ? timestamp : current.exportedAt,
    revisionId: changed ? crypto.randomUUID() : current.revisionId,
    lastMutationId: changed ? `batch-nlmg-c1-${crypto.randomUUID()}` : current.lastMutationId,
    entries
  }, { allowLegacy: false });
  if (!checkOnly && changed) await writeSnapshotAtomically(snapshotPath, snapshot);
  return { changed, snapshot, chapterEntries, totalChapterEntries: allChapterEntries.length };
}

async function main() {
  const sourcePath = resolve(option("--source", DEFAULT_SOURCE_PATH));
  const timestamp = option("--timestamp", new Date().toISOString());
  const checkOnly = process.argv.includes("--check");
  const { changed, snapshot, chapterEntries } = await importReadingList({ sourcePath, timestamp, checkOnly });
  console.log(JSON.stringify({
    mode: checkOnly ? "check" : "write",
    changed,
    totalEntries: snapshot.entries.length,
    collection: "Never Let Me Go",
    chapter: "Chapter 1",
    importedEntries: chapterEntries.length,
    uniqueTerms: new Set(chapterEntries.map((entry) => entry.normalized)).size,
    sourceTitle: [...new Set(chapterEntries.map((entry) => entry.sourceTitle))]
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
