import assert from "node:assert/strict";
import test from "node:test";
import { scheduleReview } from "../js/review.js";

test("review scheduling updates only the separated review state", () => {
  const now = new Date("2026-08-28T00:00:00.000Z");
  const result = scheduleReview({ entryId: "receive", level: 2, reviewCount: 4, lapseCount: 1, history: [] }, "good", now);
  assert.equal(result.entryId, "receive");
  assert.equal(result.level, 3);
  assert.equal(result.reviewCount, 5);
  assert.equal(result.dueAt, "2026-09-11T00:00:00.000Z");
  assert.equal(result.history[0].rating, "good");
  assert.equal("term" in result, false);
});

test("again is due in ten minutes and increments lapse without going negative", () => {
  const result = scheduleReview({ entryId: "receive", level: 4, reviewCount: 0, lapseCount: 0, history: [] }, "again", new Date("2026-08-28T00:00:00.000Z"));
  assert.equal(result.level, 0);
  assert.equal(result.lapseCount, 1);
  assert.equal(result.dueAt, "2026-08-28T00:10:00.000Z");
});
