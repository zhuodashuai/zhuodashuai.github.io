import { classifyEntry, normalizeKey, sanitizeEntry, validateEntryInput } from "./schema.js?v=13";

export function qualityStatus(draft) {
  const status = draft?.quality?.status;
  return ["trusted", "machine-candidate", "incomplete"].includes(status) ? status : "incomplete";
}

export function preparePersonalEntry(draft, { now = new Date().toISOString(), existing = null } = {}) {
  const trusted = qualityStatus(draft) === "trusted";
  return sanitizeEntry({
    ...draft,
    id: existing?.id || draft.id,
    term: validateEntryInput(draft.term),
    normalized: normalizeKey(draft.term),
    meaning: draft.meaning || "",
    needsAttention: Boolean(draft.needsAttention) || !trusted || !String(draft.meaning || "").trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    review: existing?.review || {
      level: 0,
      dueAt: now,
      reviewCount: 0,
      lapseCount: 0,
      lastRating: null
    },
    history: existing?.history || []
  }, { existing, preserveId: true, includeReview: true });
}

function safeAutoDraft(draft) {
  if (qualityStatus(draft) === "trusted" && draft?.quality?.autoSave === true) return draft;
  return {
    ...draft,
    meaning: "",
    exampleZh: "",
    needsAttention: true,
    quality: {
      ...(draft.quality || {}),
      status: "incomplete",
      autoSave: false,
      reason: draft.quality?.reason || (qualityStatus(draft) === "trusted"
        ? "该来源未授权自动写入中文释义"
        : "没有达到自动写入中文释义的可信标准")
    }
  };
}

export function invalidateEditingSession(target) {
  if (!target || typeof target !== "object") return false;
  const hadSession = Boolean(target.draft || target.editingId);
  target.draft = null;
  target.editingId = null;
  target.editingBaselineUpdatedAt = null;
  return hadSession;
}

export function invalidateEditorAndRequests(target) {
  if (!target || typeof target !== "object") return false;
  const hadSession = invalidateEditingSession(target);
  target.lookupRequestId = (Number(target.lookupRequestId) || 0) + 1;
  target.attributionLookupId = (Number(target.attributionLookupId) || 0) + 1;
  return hadSession;
}

export function createSyncDirtyTracker() {
  let revision = 0;
  let dirty = false;
  return {
    markDirty() {
      revision += 1;
      dirty = true;
      return revision;
    },
    beginAttempt() {
      return { revision, dirty };
    },
    finishAttempt(attempt, { succeeded }) {
      if (!attempt || typeof attempt.revision !== "number") throw new Error("同步尝试状态不正确。");
      dirty = succeeded ? revision !== attempt.revision : true;
      return dirty;
    },
    clear() {
      dirty = false;
      return dirty;
    },
    get dirty() {
      return dirty;
    },
    get revision() {
      return revision;
    }
  };
}

/**
 * Purely orchestrates the add flow. All side effects are injected so the same
 * rules can be exercised by Node tests and by the browser application.
 */
export async function addTerm({
  rawInput,
  saveMode,
  findExisting,
  resolveSpelling,
  enrichResolved,
  lookupTerm,
  insertEntry,
  skipCorrection = false,
  forceEntryType = "",
  clock = () => new Date().toISOString()
}) {
  const cleaned = validateEntryInput(rawInput);
  const rawNormalized = normalizeKey(cleaned);
  const rawExisting = await findExisting(rawNormalized);
  if (rawExisting) return { status: "duplicate", stage: "raw", entry: rawExisting, networkRequests: 0 };

  const inferredType = forceEntryType || classifyEntry(cleaned);
  let resolution;
  let draft;
  if (["quote", "proverb"].includes(inferredType) && typeof lookupTerm === "function") {
    draft = await lookupTerm(cleaned, { skipCorrection, forceEntryType: inferredType });
    resolution = {
      original: cleaned,
      chosen: draft?.term || cleaned,
      correction: draft?.correction || null,
      routedType: inferredType
    };
    const resolvedTerm = validateEntryInput(draft?.term || cleaned);
    const resolvedExisting = await findExisting(normalizeKey(resolvedTerm));
    if (resolvedExisting) {
      return { status: "duplicate", stage: "resolved", entry: resolvedExisting, resolution };
    }
  } else {
    resolution = await resolveSpelling(cleaned, { skipCorrection, forceEntryType });
    const resolvedTerm = validateEntryInput(resolution?.chosen || resolution?.term || cleaned);
    const resolvedNormalized = normalizeKey(resolvedTerm);
    const correctedExisting = await findExisting(resolvedNormalized);
    if (correctedExisting) {
      return { status: "duplicate", stage: "corrected", entry: correctedExisting, resolution };
    }
    draft = await enrichResolved({ ...resolution, chosen: resolvedTerm }, { forceEntryType });
  }

  if (saveMode === "review") return { status: "review", draft, resolution };

  const entry = preparePersonalEntry(safeAutoDraft(draft), { now: clock() });
  const inserted = await insertEntry(entry);
  if (inserted.status === "duplicate") {
    return { status: "duplicate", stage: "atomic", entry: inserted.entry, resolution };
  }
  return { status: "inserted", entry: inserted.entry || entry, resolution };
}
