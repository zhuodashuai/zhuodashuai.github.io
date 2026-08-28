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
  if (["accepted", "suggested", "kept"].includes(entry.correction.status)) {
    values.push(entry.correction.original, entry.correction.suggestion, entry.correction.chosen);
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
    action = "deleted";
  }

  const snapshot = PublicSnapshotSchema.parse({
    schemaVersion: 3,
    exportedAt: now,
    revisionId: crypto.randomUUID(),
    lastMutationId: request.mutationId,
    entries
  });
  return { snapshot, entry, action };
}
