import { PublicEntrySchema, type PublicEntry } from "./schema";
import { ApiError } from "./security";
import { MEMBER_UUID, memberFields, memberText } from "./member-security";

export interface SourceContext {
  key: string; entryId: string; term: string; collectionId: string; chapterId: string;
  bookTitle: string; chapterTitle: string; sourceTitle: string; page: string; originalInput: string;
  meaning: string; definition: string; exampleEn: string; exampleZh: string; partOfSpeech: string; phonetic: string; usage: string;
}
export interface SelectionRequest { entryIds: string[]; collectionId: string; chapterId: string; mutationId: string }
export interface PreparedSelection { request: SelectionRequest; cards: { term: string; contexts: SourceContext[] }[] }
export const SOURCE_LIMITS = Object.freeze({ contexts: 50, entryBytes: 128 * 1024, batchBytes: 1536 * 1024 });
export const SOURCE_FIELD_LIMITS: Record<keyof SourceContext, number> = {
  key: 320, entryId: 180, term: 2000, collectionId: 80, chapterId: 20, bookTitle: 500, chapterTitle: 500, sourceTitle: 500,
  page: 200, originalInput: 2000, meaning: 20000, definition: 12000, exampleEn: 5000, exampleZh: 5000, partOfSpeech: 200, phonetic: 300, usage: 12000
};

export function selectionRequest(body: Record<string, unknown>): SelectionRequest {
  memberFields(body, ["entryIds", "collectionId", "chapterId", "mutationId"]);
  if (!Array.isArray(body.entryIds) || !body.entryIds.length || body.entryIds.length > 100
    || body.entryIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9._:-]{1,180}$/.test(id))
    || typeof body.collectionId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.collectionId) || body.collectionId.length > 80
    || typeof body.chapterId !== "string" || (body.chapterId !== "all" && !/^chapter-[1-9]\d{0,5}$/.test(body.chapterId))
    || (body.collectionId === "main" && body.chapterId !== "all")
    || typeof body.mutationId !== "string" || !MEMBER_UUID.test(body.mutationId)) {
    throw new ApiError(400, "invalid_selection", "请选择 1–100 条公开词，并提供有效的词本、章节和操作标识。");
  }
  return { entryIds: [...new Set(body.entryIds as string[])], collectionId: body.collectionId, chapterId: body.chapterId, mutationId: body.mutationId };
}

function title(slug: string): string { return slug.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" "); }

export function validateSourceContext(candidate: unknown): SourceContext {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new ApiError(503, "invalid_public_source", "公开词条的来源格式不正确。");
  const source = candidate as Record<string, unknown>;
  memberFields(source, Object.keys(SOURCE_FIELD_LIMITS));
  for (const [field, maximum] of Object.entries(SOURCE_FIELD_LIMITS)) memberText(source[field], maximum, `来源 ${field}`);
  if (source.key !== `${source.entryId}:${source.collectionId}:${source.chapterId}`) throw new ApiError(503, "invalid_public_source", "公开词条的来源标识不正确。");
  return source as unknown as SourceContext;
}

/** Only the server resolver supplies snapshot data; clients send IDs and scope. */
export function prepareSelection(request: SelectionRequest, input: unknown): PreparedSelection {
  if (!input || typeof input !== "object" || Array.isArray(input) || (input as { schemaVersion?: number }).schemaVersion !== 3
    || !Array.isArray((input as { entries?: unknown }).entries)) throw new ApiError(503, "public_source_unavailable", "公开词库暂不可读取，请稍后重试。");
  const rows = (input as { entries: unknown[] }).entries;
  if (rows.length > 100_000) throw new ApiError(503, "invalid_public_source", "公开词库超过安全读取范围。");
  const byId = new Map<string, unknown>();
  for (const row of rows) {
    const id = row && typeof row === "object" ? (row as { id?: unknown }).id : undefined;
    if (typeof id !== "string" || byId.has(id)) throw new ApiError(503, "invalid_public_source", "公开词库包含无效或重复标识。");
    byId.set(id, row);
  }
  const cards = request.entryIds.map(id => {
    const result = PublicEntrySchema.safeParse(byId.get(id));
    if (!result.success) throw new ApiError(400, "public_entry_missing", "选择的公开词已经变化或不存在，请刷新后重选。");
    const entry: PublicEntry = result.data;
    if ([...entry.term].length > 200) throw new ApiError(413, "selection_entry_too_large", "该公开词条超过私人词条长度限制，未截断或复制。");
    const memberships = entry.tags.flatMap(tag => {
      const match = /^collection:([a-z0-9]+(?:-[a-z0-9]+)*):(chapter-(\d+))$/.exec(tag);
      return match ? [{ membership: tag, collectionId: match[1], chapterId: match[2], number: Number(match[3]) }] : [];
    });
    const selected = memberships.filter(row => (request.collectionId === "all" || row.collectionId === request.collectionId)
      && (request.chapterId === "all" || row.chapterId === request.chapterId));
    if (!memberships.length && ["all", "main"].includes(request.collectionId) && request.chapterId === "all") selected.push({ membership: "", collectionId: "main", chapterId: "all", number: 0 });
    if (!selected.length || (request.collectionId === "main" && memberships.length)) throw new ApiError(400, "selection_scope_mismatch", "选择的词不属于这个词本或章节，整批没有加入。");
    selected.sort((a, b) => a.collectionId.localeCompare(b.collectionId) || a.number - b.number);
    const contexts = selected.map(row => {
      const context = row.membership ? entry.readingContexts.find(c => c.membership === row.membership) : undefined;
      if (row.membership && !context) throw new ApiError(503, "source_context_unavailable", "这个章节缺少独立来源语境，请先修复公开来源；没有用其他章节的释义代替。");
      return validateSourceContext({ key: `${entry.id}:${row.collectionId}:${row.chapterId}`, entryId: entry.id, term: entry.term,
        collectionId: row.collectionId, chapterId: row.chapterId, bookTitle: row.collectionId === "main" ? "卓的主词本" : context?.sourceWork || entry.sourceWork || title(row.collectionId),
        chapterTitle: row.chapterId === "all" ? "" : `Chapter ${row.number}`, sourceTitle: context?.sourceTitle ?? entry.sourceTitle,
        page: context?.page ?? "", originalInput: context?.originalInput ?? entry.originalInput,
        meaning: context?.meaning ?? entry.meaning, definition: context?.definition ?? entry.definition,
        exampleEn: context?.exampleEn ?? entry.exampleEn, exampleZh: context?.exampleZh ?? entry.exampleZh,
        partOfSpeech: context?.partOfSpeech ?? entry.partOfSpeech, phonetic: entry.phonetic, usage: context?.usage ?? entry.usage });
    });
    return { term: entry.term, contexts: [...new Map(contexts.map(c => [c.key, c])).values()] };
  });
  const prepared = { request, cards };
  if (new TextEncoder().encode(JSON.stringify(prepared)).byteLength > SOURCE_LIMITS.batchBytes) throw new ApiError(413, "selection_too_large", "这批词的完整来源资料过大，请分批选择；内容没有被截断。");
  return prepared;
}
