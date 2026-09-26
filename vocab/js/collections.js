import { readingContextForMembership } from "./wordbook-schema.js";

export const COLLECTION_TAG_PREFIX = "collection:";
export const MAIN_COLLECTION_ID = "main";

const MEMBERSHIP_PATTERN = /^collection:([a-z0-9]+(?:-[a-z0-9]+)*):(chapter-(\d+))$/u;

function titleFromSlug(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function collectionMemberships(entry) {
  const memberships = [];
  for (const tag of Array.isArray(entry?.tags) ? entry.tags : []) {
    const match = String(tag).match(MEMBERSHIP_PATTERN);
    if (!match) continue;
    memberships.push({
      tag,
      collectionId: match[1],
      chapterId: match[2],
      chapterNumber: Number(match[3])
    });
  }
  return memberships;
}

export function visibleEntryTags(entry) {
  return (Array.isArray(entry?.tags) ? entry.tags : []).filter((tag) => !String(tag).startsWith(COLLECTION_TAG_PREFIX));
}

export function splitChineseMeaningPoints(value) {
  return String(value || "")
    .split(/[；\n]+/u)
    .map((point) => point.trim().replace(/。$/u, ""))
    .filter(Boolean);
}

export function preserveCollectionTags(ownerTags, replacementTags, maximum = 30) {
  const preserved = (Array.isArray(ownerTags) ? ownerTags : []).filter((tag) => String(tag).startsWith(COLLECTION_TAG_PREFIX));
  return [...new Set([...preserved, ...(Array.isArray(replacementTags) ? replacementTags : [])])].slice(0, maximum);
}

export function buildCollectionCatalog(entries) {
  const catalog = new Map();
  let mainCount = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const memberships = collectionMemberships(entry);
    if (!memberships.length) {
      mainCount += 1;
      continue;
    }
    const countedCollections = new Set();
    for (const membership of memberships) {
      if (!catalog.has(membership.collectionId)) {
        catalog.set(membership.collectionId, {
          id: membership.collectionId,
          title: String(entry.sourceWork || "").trim() || titleFromSlug(membership.collectionId),
          count: 0,
          chapters: new Map()
        });
      }
      const collection = catalog.get(membership.collectionId);
      if (!countedCollections.has(membership.collectionId)) {
        collection.count += 1;
        countedCollections.add(membership.collectionId);
      }
      if (!collection.chapters.has(membership.chapterId)) {
        const readingContext = readingContextForMembership(entry, membership.tag);
        collection.chapters.set(membership.chapterId, {
          id: membership.chapterId,
          title: `Chapter ${membership.chapterNumber}`,
          number: membership.chapterNumber,
          count: 0,
          sourceTitle: String(readingContext?.sourceTitle || entry.sourceTitle || "").trim()
        });
      }
      collection.chapters.get(membership.chapterId).count += 1;
    }
  }
  const collections = [...catalog.values()]
    .map((collection) => ({
      ...collection,
      chapters: [...collection.chapters.values()].sort((left, right) => left.number - right.number || left.title.localeCompare(right.title, "en"))
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "en"));
  return [
    { id: MAIN_COLLECTION_ID, title: "卓的主词本", count: mainCount, chapters: [] },
    ...collections
  ];
}

export function filterEntriesByCollection(entries, collectionId = "all", chapterId = "all") {
  const source = Array.isArray(entries) ? entries : [];
  if (!collectionId || collectionId === "all") return [...source];
  if (collectionId === MAIN_COLLECTION_ID) return source.filter((entry) => collectionMemberships(entry).length === 0);
  const filtered = source.filter((entry) => collectionMemberships(entry).some((membership) => (
    membership.collectionId === collectionId
    && (!chapterId || chapterId === "all" || membership.chapterId === chapterId)
  )));
  if (!chapterId || chapterId === "all") return filtered;
  const membership = `collection:${collectionId}:${chapterId}`;
  return filtered
    .map((entry, index) => {
      const order = readingContextForMembership(entry, membership)?.order;
      return { entry, index, order: Number.isSafeInteger(order) && order > 0 && order <= 100_000 ? order : Infinity };
    })
    .sort((left, right) => left.order === right.order ? left.index - right.index : left.order - right.order)
    .map(({ entry }) => entry);
}

export function collectionContextForEntry(entry, collectionId = "", chapterId = "") {
  const memberships = collectionMemberships(entry);
  const membership = memberships.find((candidate) => (
    (!collectionId || collectionId === "all" || candidate.collectionId === collectionId)
    && (!chapterId || chapterId === "all" || candidate.chapterId === chapterId)
  )) || memberships[0];
  if (!membership) return null;
  const readingContext = readingContextForMembership(entry, membership.tag);
  return {
    ...membership,
    collectionTitle: String(entry.sourceWork || "").trim() || titleFromSlug(membership.collectionId),
    chapterTitle: `Chapter ${membership.chapterNumber}`,
    sourceTitle: String(readingContext?.sourceTitle || entry.sourceTitle || "").trim(),
    page: String(readingContext?.page || "").trim()
  };
}
