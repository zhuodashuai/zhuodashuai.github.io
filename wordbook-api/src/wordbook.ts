import { ApiError } from "./security";
import {
  normalizeEnglish,
  PublicEntrySchema,
  PublicSnapshotSchema,
  type PublicEntry,
  type PublicSnapshot,
  type PublishRequest
} from "./schema";

function lookupKeys(entry: PublicEntry): string[] {
  const values = [entry.term, entry.normalized, entry.standardForm];
  if (["accepted", "suggested"].includes(entry.correction.status)) {
    values.push(entry.correction.original, entry.correction.suggestion, entry.correction.chosen);
  } else if (entry.correction.status === "kept") {
    // The owner explicitly rejected the suggestion. It must remain available
    // as a separate legitimate headword rather than becoming an alias here.
    values.push(entry.correction.original, entry.correction.chosen);
  }
  return [...new Set(values.map((value) => normalizeEnglish(value)).filter(Boolean))];
}

export function findDuplicate(entries: PublicEntry[], candidate: PublicEntry, excludeId = ""): PublicEntry | null {
  const wanted = new Set(lookupKeys(candidate));
  return entries.find((entry) => entry.id !== excludeId && lookupKeys(entry).some((key) => wanted.has(key))) || null;
}

function prepareEntry(candidate: PublicEntry, existing: PublicEntry | null, now: string): PublicEntry {
  const entry = PublicEntrySchema.parse({
    ...candidate,
    id: existing?.id || candidate.id,
    revision: existing ? existing.revision + 1 : 1,
    createdAt: existing?.createdAt || candidate.createdAt || now,
    updatedAt: now,
    normalized: normalizeEnglish(candidate.term)
  });
  if (entry.attributionStatus === "candidate"
    && !entry.sourceUrl
    && !entry.sources.some((source) => source.kind === "candidate" && source.url)) {
    return PublicEntrySchema.parse({
      ...entry,
      author: "",
      sourceTitle: "",
      sourceWork: "",
      sourceDate: "",
      attributionStatus: "unverified",
      attributionNote: entry.attributionNote || "出处未核验；未找到可供访客复查的候选链接。"
    });
  }
  return entry;
}

function rewriteSynonymReferences(
  entries: PublicEntry[],
  oldTerm: string,
  replacement: string,
  excludeId: string,
  now: string
): void {
  const oldKey = normalizeEnglish(oldTerm);
  if (!oldKey) return;
  for (let index = 0; index < entries.length; index += 1) {
    const candidate = entries[index];
    if (candidate.id === excludeId || !candidate.synonyms.some((synonym) => normalizeEnglish(synonym) === oldKey)) continue;
    const selfKeys = new Set([
      candidate.term,
      candidate.standardForm,
      candidate.correction.original,
      candidate.correction.suggestion,
      candidate.correction.chosen,
      ...candidate.forms,
      ...candidate.confusedWith
    ].map((value) => normalizeEnglish(value)).filter(Boolean));
    const seen = new Set<string>();
    const synonyms: string[] = [];
    for (const synonym of candidate.synonyms) {
      const rewritten = normalizeEnglish(synonym) === oldKey ? replacement : synonym;
      const key = normalizeEnglish(rewritten);
      if (!key || selfKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      synonyms.push(rewritten);
    }
    entries[index] = PublicEntrySchema.parse({
      ...candidate,
      synonyms,
      revision: candidate.revision + 1,
      updatedAt: now
    });
  }
}

export interface MutationResult {
  snapshot: PublicSnapshot;
  entry: PublicEntry | null;
  action: "added" | "updated" | "deleted" | "idempotent";
}

export function applyPublishMutation(
  remote: PublicSnapshot,
  request: PublishRequest,
  now = new Date().toISOString()
): MutationResult {
  if (remote.lastMutationId && remote.lastMutationId === request.mutationId) {
    const entryId = request.mutation.type === "delete" ? request.mutation.id : request.mutation.entry.id;
    return {
      snapshot: remote,
      entry: remote.entries.find((entry) => entry.id === entryId) || null,
      action: "idempotent"
    };
  }

  const entries = [...remote.entries];
  const mutation = request.mutation;
  let entry: PublicEntry | null = null;
  let action: MutationResult["action"];
  if (mutation.type === "add") {
    const candidateEntry = mutation.entry;
    if (entries.some((candidate) => candidate.id === candidateEntry.id)) {
      throw new ApiError(409, "duplicate_id", "远端已有相同词条编号，请刷新并合并。", { entryId: candidateEntry.id });
    }
    entry = prepareEntry(candidateEntry, null, now);
    const duplicate = findDuplicate(entries, entry);
    if (duplicate) {
      throw new ApiError(409, "duplicate_term", `“${entry.term}” 已经存在，请合并信息而不是重复添加。`, { duplicate });
    }
    entries.push(entry);
    action = "added";
  } else if (mutation.type === "update") {
    const candidateEntry = mutation.entry;
    const index = entries.findIndex((candidate) => candidate.id === candidateEntry.id);
    if (index < 0) throw new ApiError(409, "entry_missing", "这条词已经被远端删除，请刷新后决定是否重新添加。");
    const existing = entries[index];
    if (existing.updatedAt !== mutation.expectedUpdatedAt) {
      throw new ApiError(409, "entry_changed", "这条词已在远端更新，草稿没有覆盖它。", { remote: existing });
    }
    entry = prepareEntry(candidateEntry, existing, now);
    const duplicate = findDuplicate(entries, entry, existing.id);
    if (duplicate) {
      throw new ApiError(409, "duplicate_term", `“${entry.term}” 与已有词条冲突，请合并信息。`, { duplicate });
    }
    entries[index] = entry;
    if (existing.term !== entry.term) rewriteSynonymReferences(entries, existing.term, entry.term, entry.id, now);
    action = "updated";
  } else {
    const index = entries.findIndex((candidate) => candidate.id === mutation.id);
    if (index < 0) {
      const snapshot = PublicSnapshotSchema.parse({
        ...remote,
        exportedAt: now,
        revisionId: crypto.randomUUID(),
        lastMutationId: request.mutationId
      });
      return { snapshot, entry: null, action: "idempotent" };
    }
    const existing = entries[index];
    if (existing.updatedAt !== mutation.expectedUpdatedAt) {
      throw new ApiError(409, "entry_changed", "远端词条在删除前已被修改，已停止删除。", { remote: existing });
    }
    entry = existing;
    entries.splice(index, 1);
    rewriteSynonymReferences(entries, existing.term, "", existing.id, now);
    action = "deleted";
  }

  const parsedSnapshot = PublicSnapshotSchema.safeParse({
    schemaVersion: 3,
    exportedAt: now,
    revisionId: crypto.randomUUID(),
    lastMutationId: request.mutationId,
    entries
  });
  if (!parsedSnapshot.success) {
    const danglingSynonyms = parsedSnapshot.error.issues.filter((issue) => issue.message === "synonym must reference another published entry term");
    if (danglingSynonyms.length) {
      throw new ApiError(
        400,
        "invalid_synonym_reference",
        "同义词只能引用卓已经输入并发布的其他词条；请先发布目标词条或移除该同义词。",
        danglingSynonyms
      );
    }
    throw new ApiError(400, "invalid_snapshot", "本次修改后的公开词库没有通过完整性校验。", parsedSnapshot.error.issues);
  }
  return { snapshot: parsedSnapshot.data, entry, action };
}
