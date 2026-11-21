function titleWithinWork(source) {
  const work = String(source?.sourceWork || "").trim();
  const title = String(source?.sourceTitle || "").trim();
  const prefix = `${work} — `;
  return work && title.startsWith(prefix) ? title.slice(prefix.length).trim() : "";
}

export function readingChapterTitle(source, chapterNumber) {
  return titleWithinWork(source) || `Chapter ${chapterNumber}`;
}

export function namedReadingSourceTitle(source) {
  const title = titleWithinWork(source);
  return /^Chapter\s+\d+(?:\s|$)/iu.test(title) ? "" : title;
}
