import { buildCollectionCatalog, collectionMemberships, filterEntriesByCollection } from "./collections.js?v=82";
import { contextualizeReadingEntry, normalizePublicSearchQuery, parsePublicSnapshot, publicEntryMatchesQuery } from "./wordbook-schema.js?v=82";

export async function fetchPersonalPublicCatalog({ fetchImpl = globalThis.fetch, signal, timeoutMs = 20_000, apiTimeoutMs = 2_500 } = {}) {
  const controller = new AbortController();
  let rejectInterruption;
  const interruption = new Promise((_, reject) => { rejectInterruption = reject; });
  const stop = () => { controller.abort(); rejectInterruption(new Error("公开词库读取已停止，请重试。")); };
  if (signal?.aborted) stop(); else signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, timeoutMs);
  const read = async (url, readSignal) => {
    if (controller.signal.aborted) throw new Error("公开词库读取已停止。");
    const response = await fetchImpl(url, {
      credentials: "omit", cache: "no-cache", headers: { Accept: "application/json" }, signal: readSignal
    });
    if (!response.ok) throw new Error("公开词库暂时无法读取，请重试。");
    return parsePublicSnapshot(await response.json());
  };
  const operation = async () => {
    const apiController = new AbortController();
    let rejectApiStop;
    const apiStopped = new Promise((_, reject) => { rejectApiStop = reject; });
    const abortApi = () => { apiController.abort(); rejectApiStop(new Error("公开词库读取已停止。")); };
    controller.signal.addEventListener("abort", abortApi, { once: true });
    let apiTimer;
    try {
      const deadline = new Promise((_, reject) => {
        apiTimer = setTimeout(() => { apiController.abort(); reject(new Error("公开实时接口读取超时。")); }, Math.max(1, Math.min(apiTimeoutMs, timeoutMs)));
      });
      return await Promise.race([read("/api/v1/public/wordbook", apiController.signal), deadline, apiStopped]);
    } catch (error) {
      if (controller.signal.aborted) throw error;
      // This is the same public, deployed snapshot, never a private account
      // response. Validate it normally and label its potentially older state.
      const snapshot = await read(new URL("../data/owner-wordbook.json", import.meta.url), controller.signal);
      return { ...snapshot, readSource: "deployed-fallback" };
    } finally {
      clearTimeout(apiTimer);
      controller.signal.removeEventListener("abort", abortApi);
    }
  };
  try { return await Promise.race([operation(), interruption]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); }
}

export function publicSelectionCatalog(entries) { return buildCollectionCatalog(entries); }

export function publicSelectionEntries(entries, collectionId = "all", chapterId = "all", query = "") {
  const wanted = normalizePublicSearchQuery(query);
  return filterEntriesByCollection(entries, collectionId, chapterId)
    .map((entry) => contextualizeReadingEntry(entry, collectionId, chapterId))
    .filter((entry) => !wanted || publicEntryMatchesQuery(entry, wanted));
}

export function publicSelectionKeys(entry, collectionId = "all", chapterId = "all") {
  const memberships = collectionMemberships(entry).filter((membership) => (
    collectionId === "all" || (membership.collectionId === collectionId && (chapterId === "all" || membership.chapterId === chapterId))
  ));
  if (memberships.length) return memberships.map((membership) => `${entry.id}:${membership.collectionId}:${membership.chapterId}`);
  return collectionMemberships(entry).length === 0 && ["all", "main"].includes(collectionId) ? [`${entry.id}:main:all`] : [];
}

export function alreadySelectedSource(privateEntries, publicEntry, collectionId = "all", chapterId = "all", savedKeys = null) {
  const keys = publicSelectionKeys(publicEntry, collectionId, chapterId);
  const saved = savedKeys || new Set(privateEntries.flatMap((entry) => (entry.sourceContexts || []).map((context) => context.key)));
  return keys.length > 0 && keys.every((key) => saved.has(key));
}

export function personalSourceContext(entry, collectionId = "all", chapterId = "all") {
  const contexts = entry.sourceContexts || [];
  return contexts.find((context) => (collectionId === "all" || context.collectionId === collectionId)
    && (chapterId === "all" || context.chapterId === chapterId)) || null;
}

export function contextualizePersonalEntry(entry, collectionId = "all", chapterId = "all") {
  const context = personalSourceContext(entry, collectionId, chapterId);
  if (!context) return { ...entry, selectedSourceContext: null };
  return { ...entry, meaning: entry.meaningEdited ? entry.meaning : context.meaning, selectedSourceContext: context };
}

export function filterPersonalEntries(entries, collectionId = "all", chapterId = "all") {
  return entries.filter((entry) => {
    if (collectionId === "all") return true;
    if (collectionId === "manual") return !(entry.sourceContexts || []).length;
    return Boolean(personalSourceContext(entry, collectionId, chapterId));
  })
    .map((entry) => contextualizePersonalEntry(entry, collectionId, chapterId));
}

export function personalCollectionCatalog(entries) {
  const books = new Map();
  for (const entry of entries) {
    for (const context of entry.sourceContexts || []) {
      if (!books.has(context.collectionId)) books.set(context.collectionId, { id: context.collectionId, title: context.bookTitle || "公开主词本", entries: new Set(), chapters: new Map() });
      const book = books.get(context.collectionId);
      book.entries.add(entry.id);
      if (context.chapterId !== "all") {
        if (!book.chapters.has(context.chapterId)) book.chapters.set(context.chapterId, { id: context.chapterId, title: context.chapterTitle || context.chapterId, entries: new Set() });
        book.chapters.get(context.chapterId).entries.add(entry.id);
      }
    }
  }
  return [
    { id: "all", title: "全部词条", count: entries.length, chapters: [] },
    { id: "manual", title: "自行添加", count: entries.filter((entry) => !(entry.sourceContexts || []).length).length, chapters: [] },
    ...[...books.values()].map((book) => ({ id: book.id, title: book.title, count: book.entries.size, chapters: [...book.chapters.values()]
      .map((chapter) => ({ id: chapter.id, title: chapter.title, count: chapter.entries.size }))
      .sort((a, b) => Number(a.id.slice(8)) - Number(b.id.slice(8))) }))
  ];
}

export function selectionPayload(ids, collectionId, chapterId) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some((id) => typeof id !== "string" || !/^[A-Za-z0-9._:-]{1,180}$/.test(id))
    || new Set(ids).size !== ids.length || !/^(?:all|main|[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(collectionId)
    || !/^(?:all|chapter-\d+)$/.test(chapterId) || (["all", "main"].includes(collectionId) && chapterId !== "all")) throw new Error("每批选择 1–100 条词语，并确认词本与章节范围。");
  return { entryIds: [...ids].sort(), collectionId, chapterId };
}
