import { recordedReadingSources } from "./reading-card-policy.js";

export const REPEATED_READING_CARDS_KEY = "wordbook:show-repeated-reading-cards:v1";

export function readRepeatedReadingPreference(storage) {
  try { return (storage || globalThis.localStorage)?.getItem(REPEATED_READING_CARDS_KEY) === "true"; }
  catch { return false; }
}

export function saveRepeatedReadingPreference(value, storage) {
  try { (storage || globalThis.localStorage)?.setItem(REPEATED_READING_CARDS_KEY, String(Boolean(value))); }
  catch { /* The choice still applies to this page when storage is unavailable. */ }
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
}

export function parseReadingFrequency(payload) {
  if (!payload || payload.schemaVersion !== 1 || payload.collectionId !== "teamwork"
    || !payload.entries || typeof payload.entries !== "object" || Array.isArray(payload.entries)) {
    throw new Error("阅读频率资料格式不正确。");
  }
  const result = new Map();
  for (const [id, item] of Object.entries(payload.entries)) {
    if (!/^[A-Za-z0-9._:-]{1,180}$/u.test(id) || !item || !count(item.totalOccurrences)
      || !count(item.articleCount) || !Array.isArray(item.articles) || item.articles.length > 1000) {
      throw new Error("阅读频率记录不正确。");
    }
    let total = 0, articles = 0;
    const seen = new Set();
    for (const article of item.articles) {
      if (!article || !/^chapter-\d+$/u.test(article.chapterId) || seen.has(article.chapterId)
        || typeof article.articleTitle !== "string" || article.articleTitle.length > 500
        || !count(article.count) || !Array.isArray(article.pages) || article.pages.length > 10000) {
        throw new Error("阅读频率来源不正确。");
      }
      seen.add(article.chapterId);
      if (article.pages.some(page => !Number.isSafeInteger(page.pdfPage) || page.pdfPage < 1 || !count(page.count))
        || article.pages.reduce((sum, page) => sum + page.count, 0) !== article.count) {
        throw new Error("阅读频率页码统计不一致。");
      }
      total += article.count;
      if (article.count > 0) articles += 1;
    }
    if (total !== item.totalOccurrences || articles !== item.articleCount) throw new Error("阅读频率合计不一致。");
    result.set(id, item);
  }
  return result;
}

/** Optional public metadata must never hold up the wordbook or its study queue. */
export function createReadingFrequencyIndex({ fetcher = globalThis.fetch, onChange = () => {},
  url = "data/reading-lists/teamwork/frequency.json", timeoutMs = 6500 } = {}) {
  let records = new Map(), task = null;
  return {
    get(id) { return records.get(id) || null; },
    load() {
      if (task) return task;
      const controller = new AbortController();
      let timer, finished = false;
      const deadline = new Promise(resolve => {
        timer = setTimeout(() => { finished = true; controller.abort(); resolve(false); }, timeoutMs);
      });
      const request = Promise.resolve().then(async () => {
        const response = await fetcher(url, { cache: "no-cache", credentials: "omit", signal: controller.signal });
        if (!response.ok) return false;
        const parsed = parseReadingFrequency(await response.json());
        if (finished) return false;
        records = parsed;
        onChange();
        return true;
      });
      task = Promise.race([request, deadline]).catch(() => false).finally(() => { finished = true; clearTimeout(timer); });
      return task;
    }
  };
}

export function readingFrequencyText(entry, frequency, { repeatedOnly = false } = {}) {
  const sources = recordedReadingSources(entry);
  if (frequency?.totalOccurrences > 0) {
    if (repeatedOnly && frequency.totalOccurrences < 2 && sources.length < 2) return "";
    return `Teamwork 原文 ${frequency.totalOccurrences} 次 · ${frequency.articleCount} 篇`;
  }
  if (!sources.length || (repeatedOnly && sources.length < 2)) return "";
  return `已记录 ${sources.length} 个来源章节`;
}
