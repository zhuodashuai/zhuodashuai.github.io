import assert from "node:assert/strict";
import test from "node:test";

import {
  PublicEntryConflictError,
  findPublicEntryByNormalized,
  planPublicEntryDelete,
  planPublicEntrySave
} from "../js/public-owner.js";

const firstAt = "2026-08-27T00:00:00.000Z";
const secondAt = "2026-08-27T01:00:00.000Z";

function candidate(overrides = {}) {
  return {
    term: "accommodate",
    meaning: "容纳；为……提供住宿；适应",
    definition: "To provide room for or adapt to.",
    entryType: "word",
    partOfSpeech: "verb",
    correction: {
      status: "autocorrected",
      original: "accomodate",
      chosen: "accommodate",
      confidence: 1,
      candidates: ["accommodate"],
      source: "ECDICT"
    },
    quality: { status: "trusted", autoSave: false, source: "卓同学确认" },
    rawInput: "accomodate",
    note: "private note",
    history: [{ at: firstAt, rating: "good", fromLevel: 0, toLevel: 1 }],
    review: { level: 1, dueAt: secondAt, reviewCount: 1, lapseCount: 0, lastRating: "good" },
    ...overrides
  };
}

test("owner insertion publishes a safe card and keeps only the correction alias needed for zero-network dedupe", () => {
  const plan = planPublicEntrySave([], candidate(), { now: firstAt });
  assert.equal(plan.status, "inserted");
  assert.match(plan.entry.id, /^public-/);
  assert.equal(plan.entry.createdAt, firstAt);
  assert.equal(plan.entry.updatedAt, firstAt);
  assert.equal(plan.entry.rawInput, undefined);
  assert.equal(plan.entry.note, undefined);
  assert.equal(plan.entry.history, undefined);
  assert.equal(plan.entry.review, undefined);
  assert.deepEqual(plan.entry.correction, {
    status: "autocorrected",
    original: "accomodate",
    chosen: "accommodate",
    confidence: 1,
    source: "ECDICT"
  });
  assert.equal(findPublicEntryByNormalized(plan.entries, "accomodate")?.id, plan.entry.id);
  assert.equal(findPublicEntryByNormalized(plan.entries, "accommodate")?.id, plan.entry.id);

  const repeat = planPublicEntrySave(plan.entries, candidate(), { now: secondAt });
  assert.equal(repeat.status, "duplicate");
  assert.equal(repeat.entry.id, plan.entry.id);
  assert.strictEqual(repeat.entries, plan.entries);
});

test("owner edit preserves identity and rejects a stale editor", () => {
  const inserted = planPublicEntrySave([], candidate(), { now: firstAt });
  const edited = planPublicEntrySave(inserted.entries, candidate({ meaning: "容纳；使适应" }), {
    editingId: inserted.entry.id,
    expectedUpdatedAt: firstAt,
    now: secondAt
  });
  assert.equal(edited.status, "updated");
  assert.equal(edited.entry.id, inserted.entry.id);
  assert.equal(edited.entry.createdAt, firstAt);
  assert.equal(edited.entry.updatedAt, secondAt);
  assert.equal(edited.entry.meaning, "容纳；使适应");
  assert.throws(() => planPublicEntrySave(edited.entries, candidate(), {
    editingId: edited.entry.id,
    expectedUpdatedAt: firstAt,
    now: "2026-08-27T02:00:00.000Z"
  }), PublicEntryConflictError);
});

test("owner deletion is planned without mutating the current public array", () => {
  const inserted = planPublicEntrySave([], candidate(), { now: firstAt });
  const before = structuredClone(inserted.entries);
  const deletion = planPublicEntryDelete(inserted.entries, inserted.entry.id, { expectedUpdatedAt: firstAt });
  assert.equal(deletion.status, "deleted");
  assert.equal(deletion.entries.length, 0);
  assert.deepEqual(inserted.entries, before);
  assert.throws(() => planPublicEntryDelete(inserted.entries, "missing"), PublicEntryConflictError);
});
