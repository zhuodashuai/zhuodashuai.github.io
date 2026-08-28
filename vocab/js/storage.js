import { createSeedEntry } from "./data.js";

const DB_NAME = "wordbook-db";
const DB_VERSION = 2;
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
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("normalized", "normalized", { unique: true });
        store.createIndex("dueAt", "review.dueAt", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function storeFor(mode = "readonly") {
  const database = await openDatabase();
  return database.transaction(STORE, mode).objectStore(STORE);
}

export async function ensureSeed() {
  const database = await openDatabase();
  const metaStore = database.transaction(META_STORE, "readonly").objectStore(META_STORE);
  const seeded = await requestResult(metaStore.get("seeded"));
  if (seeded?.value) return;
  const existing = await getEntryByNormalized("jab at");
  if (!existing) await saveEntry(createSeedEntry());
  const writeMeta = database.transaction(META_STORE, "readwrite").objectStore(META_STORE);
  await requestResult(writeMeta.put({ key: "seeded", value: true, at: new Date().toISOString() }));
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
  const store = await storeFor("readwrite");
  await requestResult(store.put(entry));
  return entry;
}

export async function deleteEntry(id) {
  const store = await storeFor("readwrite");
  await requestResult(store.delete(id));
}

export async function importEntries(entries) {
  const candidatesByTerm = new Map();
  for (const candidate of entries) {
    if (!candidate || typeof candidate.term !== "string") continue;
    const normalized = candidate.term
      .trim()
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (!normalized || normalized.length > 80 || !/^[a-z][a-z' -]*$/.test(normalized)) continue;
    candidatesByTerm.set(normalized, candidate);
  }

  const prepared = [];
  for (const [normalized, candidate] of candidatesByTerm) {
    const existing = await getEntryByNormalized(normalized);
    const now = new Date().toISOString();
    const candidateReview = candidate.review && typeof candidate.review === "object" ? candidate.review : {};
    const existingReview = existing?.review || {};
    const levelNumber = Number(candidateReview.level ?? existingReview.level ?? 0);
    const level = Number.isFinite(levelNumber) ? Math.min(7, Math.max(0, Math.trunc(levelNumber))) : 0;
    const validDate = (value, fallback) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
    };
    const nonNegativeInteger = (value, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
    };
    const entry = {
      ...(existing || {}),
      ...candidate,
      id: existing?.id || crypto.randomUUID(),
      normalized,
      term: normalized,
      tags: Array.isArray(candidate.tags) ? candidate.tags.map(String).filter(Boolean) : (existing?.tags || []),
      forms: Array.isArray(candidate.forms) ? candidate.forms.map(String).filter(Boolean) : (existing?.forms || []),
      history: Array.isArray(candidate.history) ? candidate.history.slice(-60) : (existing?.history || []),
      createdAt: validDate(existing?.createdAt || candidate.createdAt, now),
      updatedAt: now,
      review: {
        ...existingReview,
        ...candidateReview,
        level,
        dueAt: validDate(candidateReview.dueAt || existingReview.dueAt, now),
        reviewCount: nonNegativeInteger(candidateReview.reviewCount, existingReview.reviewCount || 0),
        lapseCount: nonNegativeInteger(candidateReview.lapseCount, existingReview.lapseCount || 0),
        lastRating: ["again", "hard", "good", "easy", null].includes(candidateReview.lastRating)
          ? candidateReview.lastRating
          : (existingReview.lastRating || null)
      }
    };
    prepared.push(entry);
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
