import { entryLookupKeys, parsePublicSnapshot } from "./wordbook-schema.js";

const BASE_DB_NAME = "wordbook-db";
export const DB_VERSION = 6;
export const LOCAL_RECORD_SCHEMA_VERSION = 1;
const STORES = Object.freeze({
  entries: "entries",
  meta: "meta",
  drafts: "drafts",
  outbox: "outbox",
  publicCache: "publicCache",
  reviewStates: "reviewStates",
  quarantine: "quarantine"
});
const OUTBOX_STATES = new Set(["pending", "syncing", "retry_wait", "awaiting_auth", "review_required", "conflict", "failed", "published", "cancelled"]);
const REVIEW_REQUIRED_STATES = new Set(["pending", "syncing", "retry_wait", "awaiting_auth"]);
const COMPLETED_OUTBOX_STATES = new Set(["published", "cancelled"]);
let databasePromise;
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("wordbook-v6") : null;

export function resolveDatabaseName(targetLocation = globalThis.location) {
  if (!targetLocation) return BASE_DB_NAME;
  try {
    const parameters = new URLSearchParams(targetLocation.search || "");
    if (["localhost", "127.0.0.1", "[::1]"].includes(targetLocation.hostname) && parameters.get("e2e") === "1") {
      const testRun = String(parameters.get("testRun") || "").toLocaleLowerCase("en-US").replace(/[^a-z0-9-]/g, "").slice(0, 32);
      return `${BASE_DB_NAME}-e2e${testRun ? `-${testRun}` : ""}`;
    }
  } catch {
    // A non-browser location-like object keeps the production database name.
  }
  return BASE_DB_NAME;
}

export const DB_NAME = resolveDatabaseName();

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

function createStores(database) {
  if (!database.objectStoreNames.contains(STORES.drafts)) {
    const store = database.createObjectStore(STORES.drafts, { keyPath: "id" });
    store.createIndex("scope", "scope", { unique: false });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
    store.createIndex("entryId", "entryId", { unique: false });
  }
  if (!database.objectStoreNames.contains(STORES.outbox)) {
    const store = database.createObjectStore(STORES.outbox, { keyPath: "operationId" });
    store.createIndex("status", "status", { unique: false });
    store.createIndex("statusNextAttempt", ["status", "nextAttemptAt"], { unique: false });
    store.createIndex("entryId", "entryId", { unique: false });
    store.createIndex("createdAt", "createdAt", { unique: false });
  }
  if (!database.objectStoreNames.contains(STORES.publicCache)) database.createObjectStore(STORES.publicCache, { keyPath: "key" });
  if (!database.objectStoreNames.contains(STORES.reviewStates)) {
    const store = database.createObjectStore(STORES.reviewStates, { keyPath: "entryId" });
    store.createIndex("dueAt", "dueAt", { unique: false });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
  }
  if (!database.objectStoreNames.contains(STORES.quarantine)) {
    const store = database.createObjectStore(STORES.quarantine, { keyPath: "id" });
    store.createIndex("quarantinedAt", "quarantinedAt", { unique: false });
    store.createIndex("sourceStore", "sourceStore", { unique: false });
  }
}

function migrateLegacyEntries(transaction, oldVersion) {
  if (oldVersion >= 5 || !transaction.db.objectStoreNames.contains(STORES.entries)) return;
  const entries = transaction.objectStore(STORES.entries);
  const reviews = transaction.objectStore(STORES.reviewStates);
  const quarantine = transaction.objectStore(STORES.quarantine);
  const meta = transaction.objectStore(STORES.meta);
  const allRequest = entries.getAll();
  allRequest.onsuccess = () => {
    const now = new Date().toISOString();
    const prepared = [];
    let migrated = 0;
    let quarantined = 0;
    const isolate = (raw, reasonCode, reasonMessage) => {
      quarantine.put({
        id: `entries-${String(raw?.id || "unknown")}-${crypto.randomUUID()}`,
        sourceStore: STORES.entries,
        sourceDbVersion: oldVersion,
        reasonCode,
        reasonMessage,
        raw,
        quarantinedAt: now
      });
      if (raw?.id !== undefined) entries.delete(raw.id);
      quarantined += 1;
    };
    for (const raw of allRequest.result) {
      try {
        if (!raw || typeof raw !== "object" || !raw.id || !raw.term) throw new Error("missing id or term");
        const { review: reviewValue, history: historyValue, ...content } = raw;
        content.lookupKeys = entryLookupKeys({
          term: content.term,
          normalized: content.normalized,
          standardForm: content.headword || content.term,
          correction: content.correction
        });
        if (!content.lookupKeys.length) throw new Error("missing normalized lookup key");
        content.updatedAt = typeof content.updatedAt === "string" ? content.updatedAt : now;
        prepared.push({ raw, content, reviewValue, historyValue });
      } catch (error) {
        isolate(raw, "MIGRATION_INVALID_ENTRY", error?.message || "Legacy entry could not be migrated");
      }
    }
    prepared.sort((left, right) => String(left.content.createdAt || "").localeCompare(String(right.content.createdAt || ""))
      || String(left.content.id).localeCompare(String(right.content.id)));
    const canonicalOwners = new Map();
    const active = [];
    for (const item of prepared) {
      const canonical = entryLookupKeys({ term: item.content.term, normalized: item.content.normalized, standardForm: item.content.term })[0];
      if (!canonical || canonicalOwners.has(canonical)) {
        isolate(item.raw, "MIGRATION_CANONICAL_CONFLICT", `Canonical key conflicts with ${canonicalOwners.get(canonical) || "another entry"}`);
      } else {
        canonicalOwners.set(canonical, item.content.id);
        active.push(item);
      }
    }
    const lookupOwners = new Map(canonicalOwners);
    for (const item of active) {
      const conflict = item.content.lookupKeys.find((key) => lookupOwners.has(key) && lookupOwners.get(key) !== item.content.id);
      if (conflict) {
        isolate(item.raw, "MIGRATION_ALIAS_CONFLICT", `Lookup alias ${conflict} belongs to ${lookupOwners.get(conflict)}`);
        for (const [key, owner] of lookupOwners) if (owner === item.content.id) lookupOwners.delete(key);
        continue;
      }
      for (const key of item.content.lookupKeys) lookupOwners.set(key, item.content.id);
      const review = item.reviewValue && typeof item.reviewValue === "object" ? item.reviewValue : {};
      const history = Array.isArray(item.historyValue) ? item.historyValue : [];
      if (Object.keys(review).length || history.length) {
        reviews.put({
          schemaVersion: LOCAL_RECORD_SCHEMA_VERSION,
          entryId: item.content.id,
          level: Math.min(7, Math.max(0, Number(review.level) || 0)),
          dueAt: typeof review.dueAt === "string" ? review.dueAt : now,
          reviewCount: Math.max(0, Number(review.reviewCount) || 0),
          lapseCount: Math.max(0, Number(review.lapseCount) || 0),
          lastRating: ["again", "hard", "good", "easy"].includes(review.lastRating) ? review.lastRating : null,
          history: history.slice(-100),
          updatedAt: item.content.updatedAt
        });
      }
      entries.put(item.content);
      migrated += 1;
    }
    if (entries.indexNames.contains("dueAt")) entries.deleteIndex("dueAt");
    if (!entries.indexNames.contains("lookupKeys")) entries.createIndex("lookupKeys", "lookupKeys", { unique: true, multiEntry: true });
    if (!entries.indexNames.contains("updatedAt")) entries.createIndex("updatedAt", "updatedAt", { unique: false });
    meta.put({ key: "migrationV5Report", value: { fromVersion: oldVersion, migrated, quarantined, completedAt: now }, updatedAt: now });
    meta.put({ key: "dataSchemaVersion", value: 5, updatedAt: now });
  };
}

export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      if (!database.objectStoreNames.contains(STORES.entries)) {
        const entries = database.createObjectStore(STORES.entries, { keyPath: "id" });
        entries.createIndex("normalized", "normalized", { unique: true });
        entries.createIndex("lookupKeys", "lookupKeys", { unique: true, multiEntry: true });
        entries.createIndex("createdAt", "createdAt", { unique: false });
        entries.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.meta)) database.createObjectStore(STORES.meta, { keyPath: "key" });
      createStores(database);
      migrateLegacyEntries(transaction, event.oldVersion);
    };
    request.onblocked = () => globalThis.dispatchEvent?.(new CustomEvent("wordbook:storage-blocked"));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
        globalThis.dispatchEvent?.(new CustomEvent("wordbook:storage-upgrade-needed"));
      };
      resolve(database);
    };
  });
  return databasePromise;
}

async function bumpRevision(transaction, stores, ids) {
  const meta = transaction.objectStore(STORES.meta);
  const current = await requestValue(meta.get("changeRevision"));
  const revision = Number(current?.value || 0) + 1;
  meta.put({ key: "changeRevision", value: revision, updatedAt: new Date().toISOString() });
  transaction.addEventListener("complete", () => channel?.postMessage({ revision, stores, ids }));
  return revision;
}

function rejectSecrets(value, path = "record") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|secret|authorization|api.?key|cookie|oauth.?code)/i.test(key)) throw new Error(`${path}.${key} 不允许写入浏览器数据库。`);
    rejectSecrets(child, `${path}.${key}`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function semanticEntryValue(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const value = structuredClone(entry);
  delete value.createdAt;
  delete value.updatedAt;
  delete value.revision;
  return canonicalize(value);
}

function sameSemanticEntry(left, right) {
  return JSON.stringify(semanticEntryValue(left)) === JSON.stringify(semanticEntryValue(right));
}

function remoteMatchesOperation(operation, snapshot) {
  const remoteEntry = operation.entryId
    ? snapshot.entries.find((entry) => entry.id === operation.entryId) || null
    : null;
  return operation.kind === "delete"
    ? remoteEntry === null
    : Boolean(remoteEntry && sameSemanticEntry(remoteEntry, operation.desiredEntry));
}

function draftRecord(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("草稿格式不正确。");
  rejectSecrets(candidate);
  const now = new Date().toISOString();
  return {
    schemaVersion: LOCAL_RECORD_SCHEMA_VERSION,
    id: String(candidate.id || crypto.randomUUID()).slice(0, 180),
    scope: candidate.scope === "owner-public" ? "owner-public" : "personal",
    mode: candidate.mode === "edit" ? "edit" : "create",
    entryId: candidate.entryId ? String(candidate.entryId).slice(0, 180) : null,
    value: structuredClone(candidate.value || {}),
    base: structuredClone(candidate.base || { entry: null, entryUpdatedAt: null, remoteSha: null }),
    localState: ["local_saved", "queued", "conflict", "published"].includes(candidate.localState) ? candidate.localState : "local_saved",
    createdAt: candidate.createdAt || now,
    updatedAt: now,
    publishedAt: candidate.publishedAt || null,
    lastOperationId: candidate.lastOperationId || null,
    contentRevision: Math.max(0, Number(candidate.contentRevision) || 0)
  };
}

export async function saveDraft(candidate) {
  const draft = draftRecord(candidate);
  const database = await openDatabase();
  const transaction = database.transaction([STORES.drafts, STORES.meta], "readwrite");
  const store = transaction.objectStore(STORES.drafts);
  const current = await requestValue(store.get(draft.id));
  if (current && Number(draft.contentRevision || 0) !== Number(current.contentRevision || 0)) {
    transaction.abort();
    const error = new Error("这份草稿已在另一个页面更新；当前页面没有覆盖它，请重新打开后合并。");
    error.code = "DRAFT_CONFLICT";
    throw error;
  }
  draft.contentRevision = Number(current?.contentRevision || 0) + 1;
  store.put(draft);
  await bumpRevision(transaction, [STORES.drafts], [draft.id]);
  await transactionDone(transaction);
  return draft;
}

export async function getDraft(id) {
  const database = await openDatabase();
  return requestValue(database.transaction(STORES.drafts, "readonly").objectStore(STORES.drafts).get(id));
}

export async function listDrafts(scope = "owner-public") {
  const database = await openDatabase();
  const store = database.transaction(STORES.drafts, "readonly").objectStore(STORES.drafts);
  const values = await requestValue(store.index("scope").getAll(scope));
  return values.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export async function importDrafts(candidates) {
  if (!Array.isArray(candidates) || candidates.length > 1000) throw new Error("导入草稿数量不正确。");
  const drafts = candidates.map((candidate) => draftRecord(candidate));
  if (new Set(drafts.map((draft) => draft.id)).size !== drafts.length) throw new Error("导入草稿 ID 重复。");
  const database = await openDatabase();
  const transaction = database.transaction([STORES.drafts, STORES.meta], "readwrite");
  const store = transaction.objectStore(STORES.drafts);
  for (const draft of drafts) store.put(draft);
  if (drafts.length) await bumpRevision(transaction, [STORES.drafts], drafts.map((draft) => draft.id));
  await transactionDone(transaction);
  return drafts;
}

export async function deleteDraftAndCancelOutbox(id) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.drafts, STORES.outbox, STORES.meta], "readwrite");
  const drafts = transaction.objectStore(STORES.drafts);
  const outbox = transaction.objectStore(STORES.outbox);
  const [draft, operations] = await Promise.all([
    requestValue(drafts.get(id)),
    requestValue(outbox.getAll())
  ]);
  const now = new Date().toISOString();
  const cancelledOperationIds = [];
  for (const operation of operations) {
    if (operation.draftId !== id || COMPLETED_OUTBOX_STATES.has(operation.status)) continue;
    cancelledOperationIds.push(operation.operationId);
    outbox.put({
      ...operation,
      status: "cancelled",
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
      completedAt: now,
      cancellationReason: "draft_deleted"
    });
  }
  drafts.delete(id);
  await bumpRevision(transaction, [STORES.drafts, STORES.outbox], [id, ...cancelledOperationIds]);
  await transactionDone(transaction);
  return { draftDeleted: Boolean(draft), cancelledOperationIds };
}

export async function deleteDraft(id) {
  await deleteDraftAndCancelOutbox(id);
}

export async function enqueuePublish(candidateDraft, request, { authorizedRunId = "" } = {}) {
  const draft = draftRecord({ ...candidateDraft, localState: "queued" });
  rejectSecrets(request);
  const now = new Date().toISOString();
  const operationId = String(request.mutationId || crypto.randomUUID());
  const mutation = request.mutation || {};
  const operation = {
    schemaVersion: LOCAL_RECORD_SCHEMA_VERSION,
    operationId,
    idempotencyKey: operationId,
    // A queued mutation is authorized only for the exact page run in which the
    // owner clicked Publish. Another tab or a post-reload page must never claim
    // it; startup recovery will instead convert it to explicit review.
    authorizedRunId: String(authorizedRunId || ""),
    draftId: draft.id,
    entryId: mutation.type === "delete" ? mutation.id : mutation.entry?.id || draft.entryId,
    kind: mutation.type,
    request: structuredClone(request),
    baseRemoteSha: request.baseSha,
    baseEntry: structuredClone(draft.base?.entry || null),
    desiredEntry: mutation.type === "delete" ? null : structuredClone(mutation.entry),
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    publishedSha: null
  };
  draft.lastOperationId = operationId;
  const database = await openDatabase();
  const transaction = database.transaction([STORES.drafts, STORES.outbox, STORES.meta], "readwrite");
  transaction.objectStore(STORES.drafts).put(draft);
  transaction.objectStore(STORES.outbox).add(operation);
  await bumpRevision(transaction, [STORES.drafts, STORES.outbox], [draft.id, operationId]);
  await transactionDone(transaction);
  return { draft, operation };
}

export async function listOutbox({ includeCompleted = false } = {}) {
  const database = await openDatabase();
  const values = await requestValue(database.transaction(STORES.outbox, "readonly").objectStore(STORES.outbox).getAll());
  return values
    .filter((operation) => includeCompleted || !["published", "cancelled"].includes(operation.status))
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
}

export async function claimNextOperation({ tabId, authorizedRunId = "", now = new Date() }) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.outbox, STORES.meta], "readwrite");
  const store = transaction.objectStore(STORES.outbox);
  const operations = await requestValue(store.getAll());
  const nowMs = now.getTime();
  const candidate = operations
    .filter((operation) => {
      if (String(operation.authorizedRunId || "") !== String(authorizedRunId || "")) return false;
      if (["pending", "retry_wait"].includes(operation.status)) return new Date(operation.nextAttemptAt).getTime() <= nowMs;
      return operation.status === "syncing" && new Date(operation.leaseExpiresAt || 0).getTime() <= nowMs;
    })
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))[0];
  if (!candidate) {
    await transactionDone(transaction);
    return null;
  }
  const claimed = {
    ...candidate,
    status: "syncing",
    attemptCount: Number(candidate.attemptCount || 0) + 1,
    leaseOwner: tabId,
    leaseExpiresAt: new Date(nowMs + 60_000).toISOString(),
    updatedAt: now.toISOString()
  };
  store.put(claimed);
  await bumpRevision(transaction, [STORES.outbox], [claimed.operationId]);
  await transactionDone(transaction);
  return claimed;
}

export async function markOperation(operationId, status, patch = {}, { leaseOwner = "" } = {}) {
  if (!OUTBOX_STATES.has(status)) throw new Error("同步状态不受支持。");
  rejectSecrets(patch);
  const database = await openDatabase();
  const transaction = database.transaction([STORES.outbox, STORES.drafts, STORES.meta], "readwrite");
  const store = transaction.objectStore(STORES.outbox);
  const current = await requestValue(store.get(operationId));
  if (!current) throw new Error("同步任务不存在。");
  if (leaseOwner && current.leaseOwner !== leaseOwner) throw new Error("同步任务已由另一个页面接管。");
  const updated = {
    ...current,
    ...structuredClone(patch),
    status,
    updatedAt: new Date().toISOString(),
    ...(["syncing"].includes(status) ? {} : { leaseOwner: null, leaseExpiresAt: null })
  };
  store.put(updated);
  const draft = await requestValue(transaction.objectStore(STORES.drafts).get(current.draftId));
  if (draft) {
    const localState = status === "published" ? "published" : status === "conflict" ? "conflict" : "queued";
    transaction.objectStore(STORES.drafts).put({
      ...draft,
      localState,
      updatedAt: new Date().toISOString(),
      ...(status === "published" ? { publishedAt: new Date().toISOString() } : {})
    });
  }
  await bumpRevision(transaction, [STORES.outbox, STORES.drafts], [operationId, current.draftId]);
  await transactionDone(transaction);
  return updated;
}

export async function completeOperation(operationId, { tabId, sha, snapshot }) {
  const validated = parsePublicSnapshot(snapshot, { allowLegacy: false });
  const database = await openDatabase();
  const transaction = database.transaction([STORES.outbox, STORES.drafts, STORES.publicCache, STORES.meta], "readwrite");
  const outbox = transaction.objectStore(STORES.outbox);
  const operation = await requestValue(outbox.get(operationId));
  if (!operation || operation.leaseOwner !== tabId) throw new Error("同步任务的页面租约已失效。");
  const now = new Date().toISOString();
  outbox.put({ ...operation, status: "published", publishedSha: sha, completedAt: now, updatedAt: now, leaseOwner: null, leaseExpiresAt: null, lastError: null });
  const drafts = transaction.objectStore(STORES.drafts);
  const draft = await requestValue(drafts.get(operation.draftId));
  let superseded = !draft;
  if (draft) {
    const expectedEntry = operation.kind === "delete" ? operation.baseEntry : operation.desiredEntry;
    const contentStillMatches = sameSemanticEntry(draft.value, expectedEntry);
    const remoteMatchesIntent = remoteMatchesOperation(operation, validated);
    const operationStillOwnsDraft = !draft.lastOperationId || draft.lastOperationId === operationId;
    superseded = !contentStillMatches || !operationStillOwnsDraft || !remoteMatchesIntent;
    if (!superseded) {
      drafts.put({ ...draft, localState: "published", publishedAt: now, updatedAt: now });
    } else if (operationStillOwnsDraft) {
      drafts.put({ ...draft, localState: "local_saved", lastOperationId: null, publishedAt: null, updatedAt: now });
    }
  }
  transaction.objectStore(STORES.publicCache).put({
    schemaVersion: LOCAL_RECORD_SCHEMA_VERSION,
    key: "owner",
    snapshot: validated,
    sha,
    etag: "",
    sourceUrl: "api-owner-publish",
    fetchedAt: now,
    validatedAt: now
  });
  transaction.objectStore(STORES.meta).put({ key: "lastSuccessfulPublicSyncAt", value: now, updatedAt: now });
  await bumpRevision(transaction, [STORES.outbox, STORES.drafts, STORES.publicCache], [operationId, operation.draftId, "owner"]);
  await transactionDone(transaction);
  return { superseded };
}

export async function reconcileCommittedOperations(snapshot, sha) {
  const validated = parsePublicSnapshot(snapshot, { allowLegacy: false });
  const publishedSha = String(sha || "");
  if (!/^[0-9a-f]{40}$/i.test(publishedSha)) throw new Error("远端 Git SHA 格式不正确，不能核对遗留任务。");
  if (!validated.lastMutationId) return [];

  const database = await openDatabase();
  const transaction = database.transaction([STORES.outbox, STORES.drafts, STORES.meta], "readwrite");
  const outbox = transaction.objectStore(STORES.outbox);
  const operations = await requestValue(outbox.getAll());
  const operation = operations.find((candidate) => candidate.status === "review_required"
    && candidate.request?.mutationId === validated.lastMutationId);
  if (!operation || !remoteMatchesOperation(operation, validated)) {
    await transactionDone(transaction);
    return [];
  }

  const now = new Date().toISOString();
  outbox.put({
    ...operation,
    status: "published",
    publishedSha,
    completedAt: now,
    updatedAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    recoveredFromRemote: true
  });
  const drafts = transaction.objectStore(STORES.drafts);
  const draft = await requestValue(drafts.get(operation.draftId));
  let superseded = !draft;
  if (draft) {
    const expectedEntry = operation.kind === "delete" ? operation.baseEntry : operation.desiredEntry;
    const contentStillMatches = sameSemanticEntry(draft.value, expectedEntry);
    const operationStillOwnsDraft = !draft.lastOperationId || draft.lastOperationId === operation.operationId;
    superseded = !contentStillMatches || !operationStillOwnsDraft;
    if (!superseded) {
      drafts.put({ ...draft, localState: "published", publishedAt: now, updatedAt: now });
    } else if (operationStillOwnsDraft) {
      drafts.put({ ...draft, localState: "local_saved", lastOperationId: null, publishedAt: null, updatedAt: now });
    }
  }
  await bumpRevision(transaction, [STORES.outbox, STORES.drafts], [operation.operationId, operation.draftId]);
  await transactionDone(transaction);
  return [{ operationId: operation.operationId, superseded }];
}

export async function requireReviewForStoredOperations({ activeRunIds = [] } = {}) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.outbox, STORES.meta], "readwrite");
  const store = transaction.objectStore(STORES.outbox);
  const operations = await requestValue(store.getAll());
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const nowMs = nowDate.getTime();
  const liveRuns = new Set(Array.from(activeRunIds || [], (runId) => String(runId || "")).filter(Boolean));
  const operationIds = [];
  for (const operation of operations) {
    if (!REVIEW_REQUIRED_STATES.has(operation.status)) continue;
    // A second page may initialize while the page that received the explicit
    // owner click is still completing its request. Do not cancel that live,
    // leased request. Expired/crashed requests are isolated for review below.
    if (operation.status === "syncing"
      && operation.leaseOwner
      && liveRuns.has(String(operation.leaseOwner))
      && new Date(operation.leaseExpiresAt || 0).getTime() > nowMs) continue;
    operationIds.push(operation.operationId);
    store.put({
      ...operation,
      status: "review_required",
      leaseOwner: null,
      leaseExpiresAt: null,
      reviewRequiredAt: now,
      updatedAt: now
    });
  }
  if (operationIds.length) await bumpRevision(transaction, [STORES.outbox], operationIds);
  await transactionDone(transaction);
  return operationIds;
}

export async function requeueOperationForReview(operationId, { authorizedRunId = "" } = {}) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.outbox, STORES.drafts, STORES.meta], "readwrite");
  const outbox = transaction.objectStore(STORES.outbox);
  const operation = await requestValue(outbox.get(operationId));
  if (!operation) throw new Error("同步任务不存在。");
  if (operation.status !== "review_required") throw new Error("只有经过卓本人复核的待确认任务可以重新排队。");
  const draft = await requestValue(transaction.objectStore(STORES.drafts).get(operation.draftId));
  if (!draft) throw new Error("同步任务对应的草稿不存在，不能重新排队。");
  const now = new Date().toISOString();
  const updated = {
    ...operation,
    status: "pending",
    attemptCount: 0,
    authorizedRunId: String(authorizedRunId || ""),
    nextAttemptAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    reviewConfirmedAt: now,
    updatedAt: now
  };
  outbox.put(updated);
  transaction.objectStore(STORES.drafts).put({
    ...draft,
    localState: "queued",
    lastOperationId: operationId,
    updatedAt: now
  });
  await bumpRevision(transaction, [STORES.outbox, STORES.drafts], [operationId, operation.draftId]);
  await transactionDone(transaction);
  return updated;
}

export async function requeueAwaitingAuth({ authorizedRunId = "" } = {}) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.outbox, STORES.meta], "readwrite");
  const store = transaction.objectStore(STORES.outbox);
  const operations = (await requestValue(store.index("status").getAll("awaiting_auth")))
    .filter((operation) => String(operation.authorizedRunId || "") === String(authorizedRunId || ""));
  const now = new Date().toISOString();
  for (const operation of operations) store.put({ ...operation, status: "pending", nextAttemptAt: now, updatedAt: now, lastError: null });
  if (operations.length) await bumpRevision(transaction, [STORES.outbox], operations.map((item) => item.operationId));
  await transactionDone(transaction);
  return operations.length;
}

export async function putPublicCache(snapshot, sha = "", sourceUrl = "", { etag = "" } = {}) {
  const validated = parsePublicSnapshot(snapshot);
  const database = await openDatabase();
  const transaction = database.transaction([STORES.publicCache, STORES.meta], "readwrite");
  const now = new Date().toISOString();
  const store = transaction.objectStore(STORES.publicCache);
  const existing = await requestValue(store.get("owner"));
  const gitSha = /^[0-9a-f]{40}$/i.test(String(sha || "")) ? String(sha) : "";
  const httpEtag = String(etag || (!gitSha ? sha : "") || existing?.etag || "");
  store.put({
    schemaVersion: LOCAL_RECORD_SCHEMA_VERSION,
    key: "owner",
    snapshot: validated,
    sha: gitSha || existing?.sha || "",
    etag: httpEtag,
    sourceUrl,
    fetchedAt: now,
    validatedAt: now
  });
  await bumpRevision(transaction, [STORES.publicCache], ["owner"]);
  await transactionDone(transaction);
  return validated;
}

export async function getPublicCache() {
  const database = await openDatabase();
  return requestValue(database.transaction(STORES.publicCache, "readonly").objectStore(STORES.publicCache).get("owner"));
}

export async function getQuarantineCount() {
  const database = await openDatabase();
  return requestValue(database.transaction(STORES.quarantine, "readonly").objectStore(STORES.quarantine).count());
}

export function subscribeStorageChanges(listener) {
  if (!channel) return () => {};
  const handler = (event) => listener(event.data);
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}

export async function closeDatabaseForTests() {
  if (!databasePromise) return;
  const database = await databasePromise;
  database.close();
  databasePromise = null;
}
