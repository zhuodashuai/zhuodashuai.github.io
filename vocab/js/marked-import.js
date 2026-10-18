import { createBlankEntry, isPlausibleChineseMeaning, normalizeEnglish, parsePublicSnapshot, validateEnglishInput, validatePublicEntry } from "./wordbook-schema.js?v=78";
import { insertMarkedDrafts } from "./owner-storage.js?v=78";
import { lookupCoreEntry } from "./core-dictionary.js?v=78";
import { buildCollectionCatalog } from "./collections.js?v=78";

const MARKS = new Set(["underline", "highlight", "circle"]);
const CAPTURE_SOURCE_FIELDS = Object.freeze([
  "originalInput", "exampleEn", "exampleZh", "author", "sourceWork", "sourceTitle", "sourceDate", "sourceUrl",
  "sources", "attributionStatus", "attributionNote"
]);

// AI can enrich a captured word's definition, but it does not own the uploaded
// transcription or source attribution. Empty owner-edited fields are decisions,
// not an invitation to attach a generated example or an unrelated translation.
export function preserveMarkedDraftSource(mergedEntry, currentEntry, base) {
  const result = structuredClone(mergedEntry);
  if (!Array.isArray(base?.captureSources) || !base.captureSources.length) return result;
  for (const field of CAPTURE_SOURCE_FIELDS) result[field] = structuredClone(currentEntry[field]);
  return result;
}

function text(value, maximum) {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new Error("摘录内容格式不正确。");
  return value.trim();
}
export function validateMarkedCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("摘录词格式不正确。");
  const term = validateEnglishInput(text(value.text, 120));
  if ((term.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/gu) || []).length > 10) throw new Error("整句或整段划线不能拆成生词导入；请先缩小为需要学习的词或短语。");
  if (!MARKS.has(value.markType) || !["clear", "uncertain"].includes(value.certainty)) throw new Error("缺少可核对的勾画类型。");
  const region = value.region;
  if (!Array.isArray(region) || region.length !== 4 || region.some(number => !Number.isFinite(number) || number < 0 || number > 1)
    || region[2] <= 0 || region[3] <= 0 || region[0] + region[2] > 1.001 || region[1] + region[3] > 1.001) throw new Error("勾画位置不正确，请重新识别。");
  const pageNumber = value.pageNumber ?? 1;
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 10000) throw new Error("摘录页序号不正确。");
  return { text: term, originalText: validateEnglishInput(text(value.originalText || term, 120)),
    recognizedText: validateEnglishInput(text(value.recognizedText || value.originalText || term, 120)),
    context: text(value.context || "", 600), markType: value.markType, certainty: value.certainty,
    region: [...region], pageNumber, sourceId: text(value.sourceId || "", 200) };
}

export async function importMarkedCandidates(candidates, options = {}) {
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 60) throw new Error("请先勾选 1–60 个需要保存的词。");
  // Validate the entire selection before fetching definitions or writing any data.
  const selected = candidates.map(validateMarkedCandidate);
  const snapshot = parsePublicSnapshot(options.snapshot);
  const catalog = buildCollectionCatalog(snapshot.entries);
  const bookId = options.bookId && !["all", "main"].includes(options.bookId) ? String(options.bookId) : "";
  const book = bookId ? catalog.find(item => item.id === bookId) : null;
  const chapterId = bookId ? String(options.chapterId || "") : "";
  if (bookId && (!book || !book.chapters.some(chapter => chapter.id === chapterId))) throw new Error("请选择已有词本及章节，或先保存到主词本。");
  const sourceTitle = text(options.sourceTitle || "", 160);
  // A private filename stays only in local draft provenance, not public fields.
  const fileName = text(options.fileName || "上传文件", 240).split(/[\\/]/u).at(-1);
  const fileHash = text(options.fileHash || "", 64);
  if (fileHash && !/^[0-9a-f]{64}$/iu.test(fileHash)) throw new Error("文件校验信息不正确。");
  const now = new Date().toISOString();
  const prepared = [], duplicates = [], selectedKeys = new Set();
  const dictionaryLookup = options.lookup || lookupCoreEntry;
  let dictionaryUnavailable = false;
  for (const candidate of selected) {
    const key = normalizeEnglish(candidate.text);
    if (selectedKeys.has(key)) { duplicates.push({ term: candidate.text, kind: "selection" }); continue; }
    selectedKeys.add(key);
    const entry = createBlankEntry(candidate.text);
    entry.originalInput = candidate.originalText;
    let dictionary = null;
    try {
      if (!dictionaryUnavailable) dictionary = await dictionaryLookup(candidate.text);
    } catch {
      // One failed shared dictionary download must not be retried for every
      // selected word, potentially turning an offline import into 60 timeouts.
      dictionaryUnavailable = true;
    }
    if (dictionary && isPlausibleChineseMeaning(dictionary.meaning, candidate.text)) {
      entry.meaning = dictionary.meaning || "";
      entry.definition = dictionary.definition || "";
      entry.partOfSpeech = dictionary.partOfSpeech || "";
      entry.phonetic = dictionary.phonetic || "";
      // Raw dictionary senses are not promoted to chapter-specific verified senses.
    }
    entry.exampleEn = candidate.context;
    entry.tags = ["勾画摘录", "待复核", ...(bookId ? [`collection:${bookId}:${chapterId}`] : [])];
    entry.sourceWork = book?.title || "";
    entry.sourceTitle = sourceTitle || (book ? `${book.title} — ${chapterId.replace("chapter-", "Chapter ")}` : "上传页勾画摘录");
    entry.attributionNote = "来自用户上传页的识别候选，原文和词义仍需对照核对；没有自动发布。";
    const value = validatePublicEntry(entry);
    prepared.push({ id: crypto.randomUUID(), scope: "owner-public", mode: "create", entryId: value.id, value,
      base: { entry: null, entryUpdatedAt: null, remoteSha: null,
        captureSources: [{ ...candidate, fileName, fileHash, confirmedAt: now }],
        captureCollection: book ? { bookId, chapterId, title: book.title } : null },
      localState: "local_saved", createdAt: now, updatedAt: now, publishedAt: null, lastOperationId: null });
  }
  const result = await insertMarkedDrafts(prepared, snapshot.entries);
  return { ...result, duplicates: [...duplicates, ...result.duplicates] };
}
