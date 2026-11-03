import { buildCollectionCatalog, collectionMemberships, filterEntriesByCollection, MAIN_COLLECTION_ID, MAIN_READING_HOME_TAG } from "./collections.js?v=113";
import { contextualizeReadingEntry, readingContextForMembership } from "./wordbook-schema.js?v=82";
import { readingChapterTitle } from "./reading-source.js";

/** First recorded location, including an earlier book; chapter numbers are not dates. */
export function firstReadingMembership(entry) {
  if (Array.isArray(entry?.tags) && entry.tags.includes(MAIN_READING_HOME_TAG)) return null;
  const memberships = collectionMemberships(entry);
  const known = new Map(memberships.map(membership => [membership.tag, membership]));
  for (const context of Array.isArray(entry?.readingContexts) ? entry.readingContexts : []) {
    if (known.has(context.membership)) return known.get(context.membership);
  }
  return memberships[0] || null;
}

/** A view policy only: the canonical card and every original source stay intact. */
export function filterLearningEntries(entries, collectionId = "all", chapterId = "all", { showRepeated = false } = {}) {
  if (collectionId === MAIN_COLLECTION_ID) {
    return (Array.isArray(entries) ? entries : []).filter(entry => !firstReadingMembership(entry));
  }
  const scoped = filterEntriesByCollection(entries, collectionId, chapterId);
  if (showRepeated || !collectionId || collectionId === "all") return scoped;
  return scoped.filter(entry => {
    const first = firstReadingMembership(entry);
    return first?.collectionId === collectionId && (!chapterId || chapterId === "all" || first.chapterId === chapterId);
  });
}

/** Source membership remains available even when its repeated learning card is hidden. */
export function buildLearningCatalog(entries, { showRepeated = false } = {}) {
  return buildCollectionCatalog(entries).map(collection => {
    const count = filterLearningEntries(entries, collection.id, "all", { showRepeated }).length;
    return {
      ...collection,
      count,
      recordedCount: collection.id === MAIN_COLLECTION_ID ? count : collection.count,
      repeatsHidden: collection.id === MAIN_COLLECTION_ID ? 0 : collection.count - count,
      chapters: collection.chapters.map(chapter => {
        const visibleCount = filterLearningEntries(entries, collection.id, chapter.id, { showRepeated }).length;
        return { ...chapter, count: visibleCount, recordedCount: chapter.count, repeatsHidden: chapter.count - visibleCount };
      })
    };
  });
}

/** These are recorded source locations, not an inferred count of source-text tokens. */
export function recordedReadingSources(entry) {
  const primary = firstReadingMembership(entry);
  const memberships = collectionMemberships(entry);
  const byTag = new Map(memberships.map(membership => [membership.tag, membership]));
  const ordered = [
    ...(Array.isArray(entry?.readingContexts) ? entry.readingContexts.map(context => context.membership) : []),
    ...memberships.map(membership => membership.tag)
  ];
  const seen = new Set();
  return ordered.flatMap(tag => {
    const membership = byTag.get(tag);
    if (!membership || seen.has(tag)) return [];
    seen.add(tag);
    const context = readingContextForMembership(entry, tag);
    const source = context || entry;
    const view = contextualizeReadingEntry(entry, membership.collectionId, membership.chapterId);
    return [{
      ...membership,
      membership: tag,
      isPrimaryCardHome: membership.tag === primary?.tag,
      collectionTitle: String(source?.sourceWork || entry?.sourceWork || membership.collectionId).trim(),
      chapterTitle: readingChapterTitle(source, membership.chapterNumber),
      sourceTitle: String(source?.sourceTitle || "").trim(),
      sourceWork: String(source?.sourceWork || "").trim(),
      page: String(context?.page || source?.sourceDate || "").trim(),
      sourceUrl: String(view?.sourceUrl || "").trim()
    }];
  });
}
