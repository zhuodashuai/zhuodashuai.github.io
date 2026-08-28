import { normalizeKey, sanitizeEntry, toPublicEntry, validateEntryInput } from "./schema.js?v=13";

export class PublicEntryConflictError extends Error {
  constructor(message = "这条公开词条已经变化，请刷新远端后重新编辑。") {
    super(message);
    this.name = "PublicEntryConflictError";
  }
}

export function findPublicEntryByNormalized(entries, value) {
  const canonical = normalizeKey(value);
  return entries.find((entry) => {
    if (normalizeKey(entry.normalized || entry.term) === canonical) return true;
    const correction = entry.correction;
    return correction?.status === "autocorrected"
      && [correction.original, correction.chosen].some((alias) => normalizeKey(alias) === canonical);
  }) || null;
}

export function planPublicEntrySave(entries, candidate, {
  editingId = "",
  expectedUpdatedAt,
  now = new Date().toISOString()
} = {}) {
  if (!Array.isArray(entries)) throw new Error("公开词库状态不正确。");
  const existing = editingId ? entries.find((entry) => entry.id === editingId) || null : null;
  if (editingId && !existing) throw new PublicEntryConflictError("这条公开词条已不存在，请刷新远端后重试。");
  if (existing && expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
    throw new PublicEntryConflictError();
  }

  const term = validateEntryInput(candidate?.term);
  const prepared = toPublicEntry(sanitizeEntry({
    ...candidate,
    id: existing?.id || candidate?.id,
    term,
    normalized: normalizeKey(term),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }, { existing, preserveId: true, includeReview: false }));
  const duplicate = findPublicEntryByNormalized(entries, prepared.normalized);
  if (duplicate && duplicate.id !== existing?.id) {
    return { status: "duplicate", entry: duplicate, entries };
  }

  const nextEntries = existing
    ? entries.map((entry) => entry.id === existing.id ? prepared : entry)
    : [...entries, prepared];
  return {
    status: existing ? "updated" : "inserted",
    entry: prepared,
    entries: nextEntries
  };
}

export function planPublicEntryDelete(entries, id, { expectedUpdatedAt } = {}) {
  if (!Array.isArray(entries)) throw new Error("公开词库状态不正确。");
  const existing = entries.find((entry) => entry.id === id) || null;
  if (!existing) throw new PublicEntryConflictError("这条公开词条已不存在，请刷新远端后重试。");
  if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
    throw new PublicEntryConflictError();
  }
  return {
    status: "deleted",
    entry: existing,
    entries: entries.filter((entry) => entry.id !== id)
  };
}
