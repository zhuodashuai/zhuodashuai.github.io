import { findDuplicate, normalizeEnglish } from "./wordbook-schema.js";

const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  request.baseSha = remoteSha;
  const mutation = request.mutation;
  if (mutation.type === "add") {
    const duplicate = findDuplicate(remoteSnapshot.entries, mutation.entry);
    if (duplicate) return { status: "conflict", conflicts: [{ path: "term", base: null, local: mutation.entry, remote: duplicate }], remote: duplicate, request };
    return { status: "rebased", conflicts: [], remote: null, request };
  }
  const remote = remoteSnapshot.entries.find((entry) => entry.id === operation.entryId) || null;
  if (mutation.type === "delete") {
    if (!remote) return { status: "idempotent", conflicts: [], remote: null, request };
    if (equal(remote, operation.baseEntry)) {
      mutation.expectedUpdatedAt = remote.updatedAt;
      return { status: "rebased", conflicts: [], remote, request };
    }
    return { status: "conflict", conflicts: [{ path: "$delete", base: operation.baseEntry, local: null, remote }], remote, request };
  }
  if (!remote) return { status: "conflict", conflicts: [{ path: "$missing", base: operation.baseEntry, local: mutation.entry, remote: null }], remote: null, request };
  const result = threeWayMergeEntry(operation.baseEntry, mutation.entry, remote);
  mutation.entry = result.merged;
  mutation.expectedUpdatedAt = remote.updatedAt;
  return { status: result.conflicts.length ? "conflict" : "rebased", conflicts: result.conflicts, remote, request };
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
