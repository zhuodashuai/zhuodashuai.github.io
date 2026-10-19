import { collectionContextForEntry } from "./collections.js?v=82";

const DATA_URL = new URL("../data/book-passages.json", import.meta.url);
const FAVORITES_KEY = "zhuo-vocab:book-passage-favorites:v1";
const MAX_PASSAGES = 2000;
const MAX_DOWNLOAD_BYTES = 16_000_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const BOOK_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CHAPTER_PATTERN = /^chapter-([1-9]|1[0-9]|2[0-3])$/u;
let cachedLoad = null;
let cancelLoad = null;

function record(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label}格式不正确。`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error(`${label}包含缺失或未知字段。`);
  return value;
}

function text(value, label, maximum, required = false) {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label}必须是有效文本，且不超过 ${maximum} 个字符。`);
  }
  const result = value.trim();
  if (required && !result) throw new Error(`${label}不能为空。`);
  return result;
}

function id(value, label = "标识") {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label}格式不正确。`);
  return value;
}

function list(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label}数量不正确。`);
  return value;
}

function unique(value, set, label) {
  if (set.has(value)) throw new Error(`${label}不能重复。`);
  set.add(value);
  return value;
}

export function parseBookPassages(raw) {
  record(raw, ["schemaVersion", "books", "passages"], "原文资料");
  if (raw.schemaVersion !== 1) throw new Error("原文资料版本不受支持，请刷新页面后重试。");
  const bookIds = new Set();
  const books = list(raw.books, 100, "书籍").map((book) => {
    record(book, ["id", "title", "author", "editionNote"], "书籍");
    const bookId = id(book.id, "书籍标识");
    if (!BOOK_PATTERN.test(bookId)) throw new Error("书籍标识格式不正确。");
    unique(bookId, bookIds, "书籍标识");
    return Object.freeze({ id: bookId, title: text(book.title, "书名", 500, true), author: text(book.author, "作者", 300, true), editionNote: text(book.editionNote, "版本说明", 1000) });
  });
  const passageIds = new Set();
  const passages = list(raw.passages, MAX_PASSAGES, "原文").map((passage) => {
    record(passage, ["id", "bookId", "chapterId", "text", "translation", "note", "source", "featured", "links"], "原文");
    const passageId = unique(id(passage.id, "原文标识"), passageIds, "原文标识");
    if (!bookIds.has(passage.bookId)) throw new Error("原文对应的书籍不存在。");
    if (typeof passage.chapterId !== "string" || !CHAPTER_PATTERN.test(passage.chapterId)) throw new Error("原文章节格式不正确。");
    if (typeof passage.featured !== "boolean") throw new Error("精选标记必须是布尔值。");
    const source = record(passage.source, ["title", "edition", "pdfPage", "printedPage"], "原文出处");
    if (!Number.isSafeInteger(source.pdfPage) || source.pdfPage < 1 || source.pdfPage > 10000) throw new Error("PDF 页码必须是有效的正整数。");
    const printedPage = Number.isSafeInteger(source.printedPage) && source.printedPage > 0
      ? String(source.printedPage) : text(source.printedPage, "印刷页码", 80);
    const linkKeys = new Set();
    const membership = `collection:${passage.bookId}:${passage.chapterId}`;
    const links = list(passage.links, 100, "关联词条").map((link) => {
      record(link, ["entryId", "membership"], "关联词条");
      const entryId = id(link.entryId, "词条标识");
      if (link.membership !== membership) throw new Error("关联词条的书籍和章节必须与原文相同。");
      unique(`${entryId}\n${membership}`, linkKeys, "关联词条");
      return Object.freeze({ entryId, membership });
    });
    return Object.freeze({
      id: passageId,
      bookId: passage.bookId,
      chapterId: passage.chapterId,
      text: text(passage.text, "原句", 2000, true),
      translation: text(passage.translation, "译文", 2000),
      note: text(passage.note, "阅读提示", 2000),
      source: Object.freeze({ title: text(source.title, "来源书名", 500, true), edition: text(source.edition, "来源版本", 500, true), pdfPage: source.pdfPage, printedPage }),
      featured: passage.featured,
      links: Object.freeze(links)
    });
  });
  return Object.freeze({ schemaVersion: 1, books: Object.freeze(books), passages: Object.freeze(passages) });
}

async function responsePayload(response, signal) {
  const advertisedSize = response.headers?.get?.("content-length");
  if (advertisedSize && Number(advertisedSize) > MAX_DOWNLOAD_BYTES) throw new Error("原文资料过大，无法读取。");
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const cancelReader = () => { Promise.resolve(reader.cancel()).catch(() => {}); };
    signal?.addEventListener("abort", cancelReader, { once: true });
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_DOWNLOAD_BYTES) throw new Error("原文资料过大，无法读取。");
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
      // Cancellation must not wait forever on a broken response stream.
      cancelReader();
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancelReader);
      reader.releaseLock();
    }
  }
  if (typeof response.text === "function") {
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_DOWNLOAD_BYTES) throw new Error("原文资料过大，无法读取。");
    return JSON.parse(body);
  }
  // Test/embedded fetch implementations may expose only json(). The same strict
  // passage/field limits still apply after decoding, inside the shared deadline.
  if (typeof response.json === "function") return response.json();
  throw new Error("原文资料响应格式不正确。");
}

function deadlineMs(value) { return Number.isFinite(value) && value > 0 ? Math.min(value, 60000) : 10000; }

function abortError() { return new Error("原文资料读取已停止，请重试。"); }

function forCaller(promise, signal, timeoutMs) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(abortError()); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("原文资料读取超时，请重试。")); }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

export function loadBookPassages({ fetchImpl = globalThis.fetch, timeoutMs = 10000, signal } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  const timeout = deadlineMs(timeoutMs);
  if (!cachedLoad) {
    const controller = new AbortController();
    let rejectDeadline;
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
    const cancel = () => { controller.abort(); rejectDeadline(abortError()); };
    const timer = setTimeout(() => { controller.abort(); rejectDeadline(new Error("原文资料读取超时，请重试。")); }, timeout);
    const download = (async () => {
      if (typeof fetchImpl !== "function") throw new Error("当前环境无法读取原文资料。");
      const response = await fetchImpl(DATA_URL, { credentials: "omit", cache: "no-cache", redirect: "error", mode: "same-origin", signal: controller.signal });
      if (!response?.ok) throw new Error(`原文资料读取失败：${response?.status || "network"}`);
      if (response.url && new URL(response.url, DATA_URL).origin !== DATA_URL.origin) throw new Error("原文资料只能从本站读取。");
      return parseBookPassages(await responsePayload(response, controller.signal));
    })();
    const loading = Promise.race([download, deadline]).catch((error) => {
      if (cachedLoad === loading) cachedLoad = null;
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      if (cancelLoad === cancel) cancelLoad = null;
    });
    cachedLoad = loading;
    cancelLoad = cancel;
  }
  return forCaller(cachedLoad, signal, timeout);
}

export function resetBookPassagesCache() {
  cancelLoad?.();
  cancelLoad = null;
  cachedLoad = null;
}

export function sourcePassagesForEntry(data, entry) {
  const context = collectionContextForEntry(entry);
  if (!context || !entry?.id || !Array.isArray(data?.passages)) return [];
  return data.passages.filter((passage) => passage.bookId === context.collectionId
    && passage.chapterId === context.chapterId
    && passage.links.some((link) => link.entryId === entry.id && link.membership === context.tag));
}

function searchKey(value) {
  return String(value || "").normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

export function selectBookPassages(data, { bookId = "all", chapterId = "all", query = "", favoriteIds = null, favoritesOnly = false } = {}) {
  const wanted = searchKey(query);
  const favorites = favoriteIds instanceof Set ? favoriteIds : new Set(Array.isArray(favoriteIds) ? favoriteIds : []);
  const books = new Map((data?.books || []).map((book) => [book.id, book]));
  return (data?.passages || []).filter((passage) => {
    if (!passage.featured || (bookId && bookId !== "all" && passage.bookId !== bookId)
      || (chapterId && chapterId !== "all" && passage.chapterId !== chapterId)
      || (favoritesOnly && !favorites.has(passage.id))) return false;
    const book = books.get(passage.bookId);
    return !wanted || searchKey([passage.text, passage.translation, passage.note, book?.title, book?.author].join(" ")).includes(wanted);
  });
}

function favoriteDocument(raw) {
  record(raw, ["schemaVersion", "ids"], "佳句收藏");
  if (raw.schemaVersion !== 1) throw new Error("佳句收藏版本不受支持。");
  const ids = new Set();
  for (const value of list(raw.ids, MAX_PASSAGES, "佳句收藏")) unique(id(value, "收藏标识"), ids, "收藏标识");
  return ids;
}

function storageRequired(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") throw new Error("当前浏览器无法保存佳句收藏。");
  return storage;
}

export function readPassageFavorites(storage = globalThis.localStorage) {
  const saved = storageRequired(storage).getItem(FAVORITES_KEY);
  if (saved === null) return new Set();
  if (typeof saved !== "string" || saved.length > 1_000_000) throw new Error("佳句收藏数据格式不正确。");
  try { return favoriteDocument(JSON.parse(saved)); } catch (error) { throw new Error(`佳句收藏读取失败：${error.message}`); }
}

function saveFavorites(ids, storage) {
  if (ids.size > MAX_PASSAGES) throw new Error("佳句收藏最多保存 2000 项。");
  storageRequired(storage).setItem(FAVORITES_KEY, JSON.stringify({ schemaVersion: 1, ids: [...ids] }));
  return ids;
}

export function setPassageFavorite(passageId, enabled, storage = globalThis.localStorage) {
  id(passageId, "收藏标识");
  if (typeof enabled !== "boolean") throw new Error("收藏状态必须是布尔值。");
  const ids = readPassageFavorites(storage);
  if (enabled) ids.add(passageId); else ids.delete(passageId);
  return saveFavorites(ids, storage);
}

export function exportPassageFavorites(storage = globalThis.localStorage) {
  return JSON.stringify({ schemaVersion: 1, ids: [...readPassageFavorites(storage)] }, null, 2);
}

export function importPassageFavorites(raw, storage = globalThis.localStorage) {
  if (typeof raw === "string") {
    if (raw.length > 1_000_000) throw new Error("佳句收藏备份过大。");
    try { raw = JSON.parse(raw); } catch { throw new Error("佳句收藏备份不是有效的 JSON。"); }
  }
  const incoming = favoriteDocument(raw);
  const merged = new Set([...readPassageFavorites(storage), ...incoming]);
  return saveFavorites(merged, storage);
}
