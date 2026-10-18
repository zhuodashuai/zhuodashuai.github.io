import { buildDueQueue, buildStudySummary } from "./study.js?v=78";

const RATINGS = new Set(["again", "hard", "good", "easy"]);
const FIELDS = ["schemaVersion", "entryId", "level", "dueAt", "reviewCount", "lapseCount", "lastRating", "history", "updatedAt", "revision"];
const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function validatePersonalReview(value) {
  if (!value || Object.keys(value).length !== FIELDS.length || FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(value, field))
    || value.schemaVersion !== 1 || typeof value.entryId !== "string" || !/^member-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.entryId)
    || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isInteger(value.level) || value.level < 0 || value.level > 7
    || !Number.isSafeInteger(value.reviewCount) || value.reviewCount < 1 || !Number.isSafeInteger(value.lapseCount) || value.lapseCount < 0 || value.lapseCount > value.reviewCount
    || !RATINGS.has(value.lastRating) || !validTime(value.dueAt) || !validTime(value.updatedAt)
    || !Array.isArray(value.history) || value.history.length < 1 || value.history.length > 100 || value.history.length > value.reviewCount) throw new Error("云端学习记录格式不正确。");
  let previous = "";
  for (const row of value.history) {
    if (!row || Object.keys(row).sort().join() !== ["at", "rating", "fromLevel", "toLevel"].sort().join()
      || !validTime(row.at) || row.at < previous || !RATINGS.has(row.rating)
      || !Number.isInteger(row.fromLevel) || row.fromLevel < 0 || row.fromLevel > 7
      || !Number.isInteger(row.toLevel) || row.toLevel < 0 || row.toLevel > 7) throw new Error("云端学习历史不完整。");
    previous = row.at;
  }
  if (previous !== value.updatedAt || value.history.at(-1).rating !== value.lastRating || value.history.at(-1).toLevel !== value.level) throw new Error("云端学习记录与历史不一致。");
  return structuredClone(value);
}

export function validatePersonalLearning(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.reviews) || value.reviews.length > 1000) throw new Error("云端学习列表格式不正确。");
  const reviews = value.reviews.map(validatePersonalReview);
  if (new Set(reviews.map((row) => row.entryId)).size !== reviews.length) throw new Error("云端学习列表含重复记录。");
  return { revision: value.revision, reviews };
}

export function eligiblePersonalWords(entries) { return entries.filter((entry) => /\p{Script=Han}/u.test(entry.meaning || "")); }

export function personalStudySummary(entries, reviews, now = new Date()) {
  const eligible = eligiblePersonalWords(entries);
  return { ...buildStudySummary(eligible, reviews, now), omitted: entries.length - eligible.length };
}

export function personalStudyQueue(entries, reviews, { mode = "all", now = new Date(), random = Math.random } = {}) {
  const eligible = eligiblePersonalWords(entries);
  const queue = mode === "due" ? buildDueQueue(eligible, reviews, now).map((item) => item.entry) : [...eligible];
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.max(0, Math.min(0.999999999, random())) * (index + 1));
    [queue[index], queue[other]] = [queue[other], queue[index]];
  }
  return structuredClone(queue);
}

export function personalRecentHistory(entries, reviews, maximum = 8) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return reviews.flatMap((review) => byId.has(review.entryId) ? review.history.map((row) => ({ ...row, entryId: review.entryId, term: byId.get(review.entryId).term })) : [])
    .sort((a, b) => b.at.localeCompare(a.at) || a.entryId.localeCompare(b.entryId)).slice(0, maximum);
}
