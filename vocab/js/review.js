const RATINGS = new Set(["again", "hard", "good", "easy"]);
const LEVEL_DELAYS_DAYS = [1, 3, 7, 14, 30, 60, 120, 240];

export function scheduleReview(current, rating, now = new Date()) {
  if (!RATINGS.has(rating)) throw new Error("复习评分不受支持。");
  const previous = current && typeof current === "object" ? current : {};
  const fromLevel = Math.min(7, Math.max(0, Number(previous.level) || 0));
  let toLevel = fromLevel;
  let delayMs;
  if (rating === "again") {
    toLevel = 0;
    delayMs = 10 * 60 * 1000;
  } else if (rating === "hard") {
    toLevel = Math.max(0, fromLevel - 1);
    delayMs = 12 * 60 * 60 * 1000;
  } else if (rating === "good") {
    toLevel = Math.min(7, fromLevel + 1);
    delayMs = LEVEL_DELAYS_DAYS[toLevel] * 24 * 60 * 60 * 1000;
  } else {
    toLevel = Math.min(7, fromLevel + 2);
    delayMs = LEVEL_DELAYS_DAYS[toLevel] * 24 * 60 * 60 * 1000;
  }
  const at = new Date(now).toISOString();
  return {
    schemaVersion: 1,
    entryId: previous.entryId,
    level: toLevel,
    dueAt: new Date(new Date(now).getTime() + delayMs).toISOString(),
    reviewCount: Math.max(0, Number(previous.reviewCount) || 0) + 1,
    lapseCount: Math.max(0, Number(previous.lapseCount) || 0) + (rating === "again" ? 1 : 0),
    lastRating: rating,
    history: [...(Array.isArray(previous.history) ? previous.history : []), { at, rating, fromLevel, toLevel }].slice(-100),
    updatedAt: at
  };
}
