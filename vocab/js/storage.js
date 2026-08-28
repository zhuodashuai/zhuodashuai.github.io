import { normalizeKey, sanitizeEntries, sanitizeEntry, validateEntryInput } from "./schema.js?v=13";

const BASE_DB_NAME = "wordbook-db";
const DB_VERSION = 4;
const STORE = "entries";
const META_STORE = "meta";
let databasePromise;

export function resolveDatabaseName(targetLocation = globalThis.location) {
  if (!targetLocation) return BASE_DB_NAME;
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  try {
    const parameters = new URLSearchParams(targetLocation.search || "");
    if (localHosts.has(targetLocation.hostname) && parameters.get("e2e") === "1") {
      const testRun = String(parameters.get("testRun") || "").toLocaleLowerCase("en-US").replace(/[^a-z0-9-]/g, "").slice(0, 32);
      return `${BASE_DB_NAME}-e2e${testRun ? `-${testRun}` : ""}`;
    }
  } catch {
    // A non-browser location-like value should never change the production DB name.
  }
  return BASE_DB_NAME;
}

export const DB_NAME = resolveDatabaseName();

export class EntryConflictError extends Error {
  constructor(message = "词条已在另一个页面更新，请重新打开后再编辑。") {
    super(message);
    this.name = "EntryConflictError";
  }
}

export function entryRevisionMatches(entry, expectedUpdatedAt) {
  return typeof expectedUpdatedAt === "string" && entry?.updatedAt === expectedUpdatedAt;
}

export function legacyEntryRevision(entry, fallback = new Date().toISOString()) {
  for (const value of [entry?.updatedAt, entry?.createdAt, fallback]) {
    if (typeof value !== "string") continue;
    const timestamp = new Date(value);
    if (!Number.isNaN(timestamp.getTime())) return timestamp.toISOString();
  }
  return new Date().toISOString();
}

export function entryMatchesCanonical(entry, canonical) {
  const candidates = [entry?.term];
  if (entry?.correction?.status === "autocorrected") candidates.push(entry.correction.original);
  return candidates.some((candidate) => {
    try {
      return typeof candidate === "string" && normalizeKey(candidate) === canonical;
    } catch {
      return false;
    }
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Transaction aborted"));
  });
}

function constraintError(message = "已有相同词条。") {
  if (typeof DOMException === "function") return new DOMException(message, "ConstraintError");
  const error = new Error(message);
  error.name = "ConstraintError";
  return error;
}

function monotonicUpdatedAt(candidate, previous) {
  const candidateTime = new Date(candidate).getTime();
  const previousTime = new Date(previous).getTime();
  if (!Number.isFinite(previousTime)) return candidate;
  if (Number.isFinite(candidateTime) && candidateTime > previousTime) return candidate;
  return new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
}

function findEntryByCanonical(store, canonical, { excludeId = "" } = {}) {
  return new Promise((resolve, reject) => {
    const exactRequest = store.index("normalized").get(canonical);
    exactRequest.onerror = () => reject(exactRequest.error);
    exactRequest.onsuccess = () => {
      const exact = exactRequest.result;
      if (exact && exact.id !== excludeId) {
        resolve(exact);
        return;
      }

      // Entries written by older schema versions can carry a now-obsolete
      // normalized value. A cursor fallback keeps them visible without a
      // destructive migration; the exact unique index remains the fast path.
      const cursorRequest = store.openCursor();
      cursorRequest.onerror = () => reject(cursorRequest.error);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve(undefined);
          return;
        }
        const entry = cursor.value;
        try {
          if (entry?.id !== excludeId && entryMatchesCanonical(entry, canonical)) {
            resolve(entry);
            return;
          }
        } catch {
          // Malformed legacy records are ignored here and remain exportable.
        }
        cursor.continue();
      };
    };
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      const store = database.objectStoreNames.contains(STORE)
        ? transaction.objectStore(STORE)
        : database.createObjectStore(STORE, { keyPath: "id" });
      if (!store.indexNames.contains("normalized")) store.createIndex("normalized", "normalized", { unique: true });
      if (!store.indexNames.contains("dueAt")) store.createIndex("dueAt", "review.dueAt", { unique: false });
      if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt", { unique: false });
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (event.oldVersion < 4) {
        const migratedAt = new Date().toISOString();
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const entry = cursor.value;
          const validRevision = typeof entry?.updatedAt === "string"
            && !Number.isNaN(new Date(entry.updatedAt).getTime());
          if (!validRevision) {
            cursor.update({ ...entry, updatedAt: legacyEntryRevision(entry, migratedAt) });
          }
          cursor.continue();
        };
      }
    };
    request.onblocked = () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("wordbook:storage-blocked"));
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("wordbook:storage-versionchange"));
        }
      };
      database.onclose = () => {
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error);
    };
  });
  return databasePromise;
}

async function storeFor(mode = "readonly") {
  const database = await openDatabase();
  return database.transaction(STORE, mode).objectStore(STORE);
}

export async function getAllEntries() {
  const store = await storeFor();
  const entries = await requestResult(store.getAll());
  return entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getEntryByNormalized(normalized) {
  const store = await storeFor();
  return findEntryByCanonical(store, normalizeKey(normalized));
}

export async function insertEntryIfAbsent(entry) {
  const clean = sanitizeEntry(entry, { existing: null, preserveId: true, includeReview: true });
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  const completion = transactionResult(transaction);

  try {
    const existing = await findEntryByCanonical(store, clean.normalized);
    if (existing) {
      await completion;
      return { status: "duplicate", entry: existing };
    }
    await requestResult(store.add(clean));
    await completion;
    return { status: "inserted", entry: clean };
  } catch (error) {
    await completion.catch(() => {});
    if (error?.name === "ConstraintError") {
      const winner = await getEntryByNormalized(clean.normalized).catch(() => undefined);
      if (winner) return { status: "duplicate", entry: winner };
    }
    throw error;
  }
}

export async function updateEntry(entry, { expectedUpdatedAt } = {}) {
  const id = typeof entry?.id === "string" ? entry.id.trim() : "";
  if (!id) throw new Error("更新词条时缺少有效 id。");
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  const completion = transactionResult(transaction);

  try {
    const existing = await requestResult(store.get(id));
    if (!existing) throw new Error("要更新的词条不存在，可能已在另一个页面被删除。");
    if (!entryRevisionMatches(existing, expectedUpdatedAt)) {
      throw new EntryConflictError();
    }
    const merged = {
      ...existing,
      ...entry,
      id: existing.id,
      review: entry.review && typeof entry.review === "object"
        ? { ...existing.review, ...entry.review }
        : existing.review,
      history: Array.isArray(entry.history) ? entry.history : existing.history
    };
    const clean = sanitizeEntry(merged, { existing, preserveId: true, includeReview: true });
    clean.updatedAt = monotonicUpdatedAt(clean.updatedAt, existing.updatedAt);
    const canonicalChanged = clean.normalized !== existing.normalized
      || normalizeKey(existing.term) !== clean.normalized;
    if (canonicalChanged) {
      const conflict = await findEntryByCanonical(store, clean.normalized, { excludeId: existing.id });
      if (conflict) throw constraintError(`“${clean.term}” 已在词库中，未覆盖现有词条。`);
    }
    await requestResult(store.put(clean));
    await completion;
    return clean;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already be inactive or aborted by IndexedDB.
    }
    await completion.catch(() => {});
    throw error;
  }
}

export async function saveEntry(entry) {
  const clean = sanitizeEntry(entry, { existing: null, preserveId: true, includeReview: true });
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).put(clean);
  await transactionResult(transaction);
  return clean;
}

export async function deleteEntry(id) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).delete(id);
  await transactionResult(transaction);
}

export async function importEntries(entries) {
  if (!Array.isArray(entries)) throw new Error("词库数据必须是数组。");
  const candidatesByTerm = new Map();
  for (const candidate of entries.slice(0, 10000)) {
    try {
      const normalized = normalizeKey(validateEntryInput(candidate?.term));
      candidatesByTerm.set(normalized, candidate);
    } catch {
      // Invalid items are counted by the caller and skipped here.
    }
  }
  const prepared = [];
  for (const [normalized, candidate] of candidatesByTerm) {
    const existing = await getEntryByNormalized(normalized);
    const merged = existing
      ? {
          ...existing,
          ...candidate,
          id: existing.id,
          review: candidate.review && typeof candidate.review === "object"
            ? { ...existing.review, ...candidate.review }
            : existing.review,
          history: Array.isArray(candidate.history) ? candidate.history : existing.history
        }
      : candidate;
    prepared.push(sanitizeEntry(merged, { existing, preserveId: false, includeReview: true }));
  }

  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  const completion = transactionResult(transaction);
  try {
    prepared.forEach((entry) => store.put(entry));
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already be inactive; completion still reports its final state.
    }
    await completion.catch(() => {});
    throw error;
  }
  await completion;
  return prepared.length;
}

export async function replaceEntries(entries) {
  const prepared = sanitizeEntries(entries, { preserveIds: true, includeReview: true });
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  const completion = transactionResult(transaction);
  try {
    store.clear();
    prepared.forEach((entry) => store.put(entry));
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The completion promise below still settles with the transaction state.
    }
    await completion.catch(() => {});
    throw error;
  }
  await completion;
  return prepared.length;
}

export async function getMeta(key) {
  const database = await openDatabase();
  const store = database.transaction(META_STORE, "readonly").objectStore(META_STORE);
  return (await requestResult(store.get(key)))?.value ?? null;
}

export async function setMeta(key, value) {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, "readwrite");
  transaction.objectStore(META_STORE).put({ key, value, updatedAt: new Date().toISOString() });
  await transactionResult(transaction);
  return value;
}
