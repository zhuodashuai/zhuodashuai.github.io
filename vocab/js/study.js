import { scheduleReview } from "./review.js";

function dateValue(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label}不是有效时间。`);
  return date;
}

function entryIdOf(value, label = "词条") {
  const entryId = typeof value === "string" ? value : value?.entryId ?? value?.id;
  if (typeof entryId !== "string" || !entryId.trim()) throw new Error(`${label}缺少有效 ID。`);
  return entryId;
}

function reviewStateMap(reviewStates) {
  if (!Array.isArray(reviewStates)) throw new Error("复习状态必须是数组。");
  const states = new Map();
  for (const state of reviewStates) {
    const entryId = entryIdOf(state, "复习状态");
    if (states.has(entryId)) throw new Error(`词条 ${entryId} 存在重复的复习状态。`);
    dateValue(state.dueAt, `词条 ${entryId} 的到期时间`);
    states.set(entryId, state);
  }
  return states;
}

function scopedEntries(entries) {
  if (!Array.isArray(entries)) throw new Error("学习词条必须是数组。");
  const seen = new Set();
  return entries.map((entry, index) => {
    const entryId = entryIdOf(entry);
    if (seen.has(entryId)) throw new Error(`学习范围中存在重复词条 ${entryId}。`);
    seen.add(entryId);
    return { entry, entryId, index };
  });
}

export function createInitialReviewState(entryId, now = new Date()) {
  const id = entryIdOf(entryId, "复习状态");
  const at = dateValue(now, "当前时间").toISOString();
  return {
    schemaVersion: 1,
    entryId: id,
    level: 0,
    dueAt: at,
    reviewCount: 0,
    lapseCount: 0,
    lastRating: null,
    history: [],
    updatedAt: at
  };
}

/**
 * Build a due queue for exactly the entries supplied by the caller. This is
 * the collection/chapter boundary: review states belonging to any other
 * collection or chapter are deliberately ignored.
 */
export function buildDueQueue(entries, reviewStates, now = new Date()) {
  const current = dateValue(now, "当前时间");
  const currentMs = current.getTime();
  const states = reviewStateMap(reviewStates);
  return scopedEntries(entries)
    .map(({ entry, entryId, index }) => {
      const storedState = states.get(entryId);
      const reviewState = storedState || createInitialReviewState(entryId, current);
      const isNew = !storedState || Number(storedState.reviewCount) === 0;
      return {
        entry,
        reviewState,
        status: isNew ? "new" : "review",
        dueAt: reviewState.dueAt,
        _index: index
      };
    })
    .filter((item) => dateValue(item.dueAt, `词条 ${item.reviewState.entryId} 的到期时间`).getTime() <= currentMs)
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt) || left._index - right._index)
    .map(({ _index, ...item }) => item);
}

export function buildStudySummary(entries, reviewStates, now = new Date()) {
  const current = dateValue(now, "当前时间");
  const scoped = scopedEntries(entries);
  const states = reviewStateMap(reviewStates);
  const queue = buildDueQueue(entries, reviewStates, current);
  let newCount = 0;
  let reviewedCount = 0;
  let scheduledCount = 0;
  for (const { entryId } of scoped) {
    const state = states.get(entryId);
    if (!state || Number(state.reviewCount) === 0) newCount += 1;
    else reviewedCount += 1;
    if (state && Date.parse(state.dueAt) > current.getTime()) scheduledCount += 1;
  }
  const dueReviewCount = queue.filter((item) => item.status === "review").length;
  return {
    totalEntries: scoped.length,
    dueCount: queue.length,
    newCount,
    dueReviewCount,
    scheduledCount,
    reviewedCount
  };
}

export function applyReviewRating(entryId, currentState, rating, now = new Date()) {
  const id = entryIdOf(entryId, "复习状态");
  if (currentState && entryIdOf(currentState, "复习状态") !== id) throw new Error("复习状态与当前词条不匹配。");
  const current = dateValue(now, "当前时间");
  return scheduleReview(currentState || createInitialReviewState(id, current), rating, current);
}
