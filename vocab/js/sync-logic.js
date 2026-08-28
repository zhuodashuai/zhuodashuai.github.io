import { findDuplicate, normalizeEnglish } from "./wordbook-schema.js";

const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function blankDraftValue(value) {
  return value == null
    || (typeof value === "string" && !value.trim())
    || (Array.isArray(value) && value.length === 0);
}

export function mergeAiCandidate(baseline, current, candidate, { fillMissingOnly = false } = {}) {
  const merged = structuredClone(current);
  let preservedManualChanges = false;
  for (const [key, candidateValue] of Object.entries(candidate)) {
    // AI may suggest content, but it never owns the identity or concurrency
    // metadata of either a new local draft or an existing GitHub entry.
    if (["id", "revision", "normalized", "originalInput", "createdAt", "updatedAt"].includes(key)) continue;
    const unchanged = equal(current[key], baseline[key]);
    // Older local drafts can represent one empty field as undefined while a
    // fresh schema-normalized save represents it as "" or []. Treat those as
    // the same empty baseline, but never overwrite a field the owner cleared
    // after starting the AI request.
    const equivalentEmptyBaseline = blankDraftValue(current[key]) && blankDraftValue(baseline[key]);
    if (fillMissingOnly) {
      if (key === "organizationMethod") continue;
      if (key === "correction") {
        const ownerDecided = ["accepted", "kept"].includes(current.correction?.status);
        if (!ownerDecided && unchanged) merged[key] = structuredClone(candidateValue);
        else if (!equal(current[key], candidateValue)) preservedManualChanges = true;
        continue;
      }
      if (equivalentEmptyBaseline) merged[key] = structuredClone(candidateValue);
      else if (!equal(current[key], candidateValue)) preservedManualChanges = true;
    } else if (unchanged || equivalentEmptyBaseline) merged[key] = structuredClone(candidateValue);
    else preservedManualChanges = true;
  }
  if (fillMissingOnly) merged.organizationMethod = preservedManualChanges ? "mixed" : candidate.organizationMethod;
  return { merged, preservedManualChanges };
}

export function threeWayMergeEntry(base, local, remote) {
  if (!base || !local || !remote) return { merged: local, conflicts: [{ path: "$", base, local, remote }] };
  const immutable = new Set(["id", "createdAt", "updatedAt", "revision", "normalized"]);
  const merged = { ...remote };
  const conflicts = [];
  for (const key of Object.keys(local)) {
    if (immutable.has(key)) continue;
    const baseValue = base[key];
    const localValue = local[key];
    const remoteValue = remote[key];
    if (equal(localValue, baseValue)) merged[key] = structuredClone(remoteValue);
    else if (equal(remoteValue, baseValue) || equal(localValue, remoteValue)) merged[key] = structuredClone(localValue);
    else {
      merged[key] = structuredClone(localValue);
      conflicts.push({ path: key, base: baseValue, local: localValue, remote: remoteValue });
    }
  }
  merged.id = remote.id;
  merged.createdAt = remote.createdAt;
  merged.updatedAt = remote.updatedAt;
  merged.revision = remote.revision;
  merged.normalized = normalizeEnglish(merged.term);
  return { merged, conflicts };
}

export function rebaseOperation(operation, remoteSnapshot, remoteSha) {
  const request = structuredClone(operation.request);
  const originalMutation = structuredClone(request.mutation);
  request.baseSha = remoteSha;
  const mutation = request.mutation;
  const rebased = (remote) => {
    // The server binds an idempotency key to the semantic mutation before it
    // checks the Git blob SHA. If a three-way rebase changes the mutation
    // itself, retrying with the old key must fail closed as key reuse. Give the
    // newly reviewed/merged intent a fresh remote mutation ID instead.
    if (!equal(mutation, originalMutation)) request.mutationId = crypto.randomUUID();
    return { status: "rebased", conflicts: [], remote, request };
  };
  if (mutation.type === "add") {
    const duplicate = findDuplicate(remoteSnapshot.entries, mutation.entry);
    if (duplicate) return { status: "conflict", conflicts: [{ path: "term", base: null, local: mutation.entry, remote: duplicate }], remote: duplicate, request };
    return rebased(null);
  }
  const remote = remoteSnapshot.entries.find((entry) => entry.id === operation.entryId) || null;
  if (mutation.type === "delete") {
    if (!remote) return { status: "idempotent", conflicts: [], remote: null, request };
    if (equal(remote, operation.baseEntry)) {
      mutation.expectedUpdatedAt = remote.updatedAt;
      return rebased(remote);
    }
    return { status: "conflict", conflicts: [{ path: "$delete", base: operation.baseEntry, local: null, remote }], remote, request };
  }
  if (!remote) return { status: "conflict", conflicts: [{ path: "$missing", base: operation.baseEntry, local: mutation.entry, remote: null }], remote: null, request };
  const result = threeWayMergeEntry(operation.baseEntry, mutation.entry, remote);
  mutation.entry = result.merged;
  mutation.expectedUpdatedAt = remote.updatedAt;
  return result.conflicts.length
    ? { status: "conflict", conflicts: result.conflicts, remote, request }
    : rebased(remote);
}

export function classifySyncFailure(error) {
  const status = Number(error?.status || 0);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline || error?.code === "network_error" || [408, 425, 429].includes(status) || status >= 500) {
    return { state: "retry_wait", retryable: true };
  }
  if ([401, 403].includes(status)) return { state: "awaiting_auth", retryable: false };
  if ([409, 412].includes(status)) return { state: "conflict", retryable: false };
  return { state: "failed", retryable: false };
}

export function nextRetryAt(attemptCount, retryAfterSeconds = 0, now = Date.now(), random = Math.random) {
  const delay = retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : RETRY_DELAYS_MS[Math.min(Math.max(0, attemptCount - 1), RETRY_DELAYS_MS.length - 1)];
  const jitter = Math.floor(delay * .2 * random());
  return new Date(now + delay + jitter).toISOString();
}
