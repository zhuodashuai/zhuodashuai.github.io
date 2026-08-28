import { normalizeKey, sanitizeEntries, sanitizeEntry, validateEntryInput } from "./schema.js";

const DB_NAME = "wordbook-db";
const DB_VERSION = 3;
const STORE = "entries";
const META_STORE = "meta";
let databasePromise;

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

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
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
  return requestResult(store.index("normalized").get(normalized));
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
