import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReviewRating,
  buildDueQueue,
  buildStudySummary,
  createInitialReviewState
} from "../js/study.js";

const NOW = new Date("2026-09-20T12:00:00.000Z");

function reviewState(entryId, overrides = {}) {
  return {
    schemaVersion: 1,
    entryId,
    level: 1,
    dueAt: "2026-09-20T11:00:00.000Z",
    reviewCount: 1,
    lapseCount: 0,
    lastRating: "good",
    history: [{ at: "2026-09-17T12:00:00.000Z", rating: "good", fromLevel: 0, toLevel: 1 }],
    updatedAt: "2026-09-17T12:00:00.000Z",
    ...overrides
  };
}

test("due queue is scoped to the entries supplied for the current chapter", () => {
  const chapterEntries = [
    { id: "chapter-1-agitated", term: "agitated" },
    { id: "chapter-1-shrug", term: "shrug" },
    { id: "chapter-1-snap-out", term: "snap out of it" }
  ];
  const states = [
    reviewState("chapter-1-agitated"),
    reviewState("chapter-1-shrug", { dueAt: "2026-09-21T12:00:00.000Z", reviewCount: 2 }),
    reviewState("another-book-due")
  ];

  const queue = buildDueQueue(chapterEntries, states, NOW);
  assert.deepEqual(queue.map((item) => item.entry.id), ["chapter-1-agitated", "chapter-1-snap-out"]);
  assert.deepEqual(queue.map((item) => item.status), ["review", "new"]);
  assert.equal(queue.some((item) => item.entry.id === "another-book-due"), false);
  assert.equal(queue[1].reviewState.entryId, "chapter-1-snap-out");

  assert.deepEqual(buildStudySummary(chapterEntries, states, NOW), {
    totalEntries: 3,
    dueCount: 2,
    newCount: 1,
    dueReviewCount: 1,
    scheduledCount: 1,
    reviewedCount: 2
  });
});

test("initial state and rating helpers reuse the separated review scheduler", () => {
  const initial = createInitialReviewState("chapter-1-carer", NOW);
  assert.deepEqual(initial, {
    schemaVersion: 1,
    entryId: "chapter-1-carer",
    level: 0,
    dueAt: NOW.toISOString(),
    reviewCount: 0,
    lapseCount: 0,
    lastRating: null,
    history: [],
    updatedAt: NOW.toISOString()
  });

  const rated = applyReviewRating("chapter-1-carer", null, "good", NOW);
  assert.equal(rated.entryId, "chapter-1-carer");
  assert.equal(rated.level, 1);
  assert.equal(rated.reviewCount, 1);
  assert.equal(rated.dueAt, "2026-09-23T12:00:00.000Z");
  assert.equal(rated.history[0].rating, "good");
});

test("study helpers reject ambiguous IDs instead of mixing review histories", () => {
  const entry = { id: "chapter-1-eaves", term: "eaves" };
  assert.throws(() => buildDueQueue([entry, { ...entry }], [], NOW), /重复词条/);
  assert.throws(() => buildDueQueue([entry], [reviewState(entry.id), reviewState(entry.id)], NOW), /重复的复习状态/);
  assert.throws(() => applyReviewRating(entry.id, reviewState("another-entry"), "good", NOW), /不匹配/);
});
