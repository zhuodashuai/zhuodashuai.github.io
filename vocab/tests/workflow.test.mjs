import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeKey } from "../js/schema.js";
import { entryMatchesCanonical } from "../js/storage.js";
import {
  addTerm,
  createSyncDirtyTracker,
  invalidateEditorAndRequests,
  invalidateEditingSession
} from "../js/workflow.js";

const datasetUrl = new URL("../quality/datasets/vocab-100.json", import.meta.url);
const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));

function meaningFor(item) {
  return item.requiredMeaningGroups.map((group) => group[0]).join("；");
}

function makeStore() {
  const values = new Map();
  return {
    values,
    find: async (key) => {
      const canonical = normalizeKey(key);
      return values.get(canonical) || [...values.values()].find((entry) => entryMatchesCanonical(entry, canonical));
    },
    insert: async (entry) => {
      const key = normalizeKey(entry.term);
      const existing = values.get(key);
      if (existing) return { status: "duplicate", entry: existing };
      // Yield once to make concurrent callers contend at the insertion point.
      await Promise.resolve();
      const winner = values.get(key);
      if (winner) return { status: "duplicate", entry: winner };
      values.set(key, entry);
      return { status: "inserted", entry };
    }
  };
}

test("100 inputs insert once; the complete repeat pass preserves all records", async () => {
  const store = makeStore();
  const byInput = new Map(dataset.entries.map((item) => [item.input, item]));
  let resolved = 0;
  let enriched = 0;
  const resolveSpelling = async (input) => {
    resolved += 1;
    const item = byInput.get(input);
    assert.ok(item, `missing gold case for ${input}`);
    return {
      original: input,
      chosen: item.canonicalTerm,
      term: item.canonicalTerm,
      correction: {
        status: item.correctionPolicy === "correct" ? "autocorrected" : "exact",
        original: input,
        chosen: item.canonicalTerm,
        candidates: [],
        source: item.correctionPolicy === "correct" ? "local" : "core"
      }
    };
  };
  const enrichResolved = async (resolution) => {
    enriched += 1;
    const item = dataset.entries.find((candidate) => candidate.canonicalTerm === resolution.chosen);
    return {
      rawInput: resolution.original,
      term: resolution.chosen,
      normalized: normalizeKey(resolution.chosen),
      headword: resolution.chosen,
      entryType: item.expectedType,
      correction: resolution.correction,
      meaning: meaningFor(item),
      quality: { status: "trusted", autoSave: true, source: "gold-test" },
      tags: []
    };
  };

  for (const item of dataset.entries) {
    const result = await addTerm({
      rawInput: item.input,
      saveMode: "auto",
      findExisting: store.find,
      resolveSpelling,
      enrichResolved,
      insertEntry: store.insert
    });
    assert.equal(result.status, "inserted", item.input);
  }
  assert.equal(store.values.size, 100);
  assert.equal(enriched, 100);
  const before = new Map([...store.values].map(([key, entry]) => [key, {
    id: entry.id,
    createdAt: entry.createdAt,
    review: structuredClone(entry.review),
    meaning: entry.meaning
  }]));

  const resolvedBeforeRepeat = resolved;
  const enrichedBeforeRepeat = enriched;
  for (const item of dataset.entries) {
    const result = await addTerm({
      rawInput: item.input,
      saveMode: "auto",
      findExisting: store.find,
      resolveSpelling,
      enrichResolved,
      insertEntry: store.insert
    });
    assert.equal(result.status, "duplicate", item.input);
  }
  assert.equal(store.values.size, 100);
  assert.equal(enriched, enrichedBeforeRepeat, "repeat pass must not enrich or call dictionary providers");
  assert.equal(resolved, resolvedBeforeRepeat, "every repeated raw spelling must be stopped before resolution or network access");
  for (const [key, snapshot] of before) {
    const entry = store.values.get(key);
    assert.equal(entry.id, snapshot.id);
    assert.equal(entry.createdAt, snapshot.createdAt);
    assert.deepEqual(entry.review, snapshot.review);
    assert.equal(entry.meaning, snapshot.meaning);
  }
});

test("an online-corrected raw spelling becomes a zero-network duplicate alias", async () => {
  const store = makeStore();
  let resolutionCalls = 0;
  const options = {
    rawInput: "helllo",
    saveMode: "auto",
    findExisting: store.find,
    resolveSpelling: async (input) => {
      resolutionCalls += 1;
      return {
        original: input,
        chosen: "hello",
        correction: { status: "autocorrected", original: input, chosen: "hello", source: "LanguageTool + dictionary" }
      };
    },
    enrichResolved: async (resolution) => ({
      rawInput: resolution.original,
      term: resolution.chosen,
      correction: resolution.correction,
      meaning: "你好",
      quality: { status: "trusted", autoSave: true, source: "fixture" }
    }),
    insertEntry: store.insert
  };
  assert.equal((await addTerm(options)).status, "inserted");
  const repeated = await addTerm(options);
  assert.equal(repeated.status, "duplicate");
  assert.equal(repeated.stage, "raw");
  assert.equal(resolutionCalls, 1, "the repeated misspelling must not reach LanguageTool again");
  assert.equal(store.values.size, 1);
});

test("auto mode never writes a machine candidate into the Chinese meaning", async () => {
  const store = makeStore();
  const result = await addTerm({
    rawInput: "hip",
    saveMode: "auto",
    findExisting: store.find,
    resolveSpelling: async (input) => ({ original: input, chosen: input, term: input }),
    enrichResolved: async () => ({
      term: "hip",
      entryType: "word",
      meaning: "kamus在线bm ke bi",
      quality: { status: "machine-candidate", autoSave: false, source: "unsafe-fixture" }
    }),
    insertEntry: store.insert
  });
  assert.equal(result.status, "inserted");
  assert.equal(result.entry.meaning, "");
  assert.equal(result.entry.needsAttention, true);
  assert.equal(result.entry.quality.status, "incomplete");
});

test("trusted content without explicit autoSave permission is not written automatically", async () => {
  const store = makeStore();
  const result = await addTerm({
    rawInput: "cautious",
    saveMode: "auto",
    findExisting: store.find,
    resolveSpelling: async (input) => ({ original: input, chosen: input, term: input }),
    enrichResolved: async () => ({
      term: "cautious",
      entryType: "word",
      meaning: "谨慎的",
      quality: { status: "trusted", autoSave: false, source: "manual-review-only" }
    }),
    insertEntry: store.insert
  });
  assert.equal(result.status, "inserted");
  assert.equal(result.entry.meaning, "");
  assert.equal(result.entry.needsAttention, true);
  assert.equal(result.entry.quality.status, "incomplete");
  assert.equal(result.entry.quality.autoSave, false);
});

test("invalidating an editing session removes every stale write handle", () => {
  const state = {
    draft: { id: "old", term: "hip" },
    editingId: "old",
    editingBaselineUpdatedAt: "2026-08-27T00:00:00.000Z",
    unrelated: true
  };
  assert.equal(invalidateEditingSession(state), true);
  assert.equal(state.draft, null);
  assert.equal(state.editingId, null);
  assert.equal(state.editingBaselineUpdatedAt, null);
  assert.equal(state.unrelated, true);
  assert.equal(invalidateEditingSession(state), false);
});

test("scope invalidation cancels in-flight lookups even before a draft exists", () => {
  const state = {
    draft: null,
    editingId: null,
    editingBaselineUpdatedAt: null,
    lookupRequestId: 7,
    attributionLookupId: 11
  };
  assert.equal(invalidateEditorAndRequests(state), false);
  assert.equal(state.lookupRequestId, 8);
  assert.equal(state.attributionLookupId, 12);
});

test("sync dirty tracking preserves changes made during an in-flight push", () => {
  const tracker = createSyncDirtyTracker();
  tracker.markDirty();
  const firstAttempt = tracker.beginAttempt();
  tracker.markDirty();
  assert.equal(tracker.finishAttempt(firstAttempt, { succeeded: true }), true);

  const followUp = tracker.beginAttempt();
  assert.equal(tracker.finishAttempt(followUp, { succeeded: true }), false);

  const failedAttempt = tracker.beginAttempt();
  assert.equal(tracker.finishAttempt(failedAttempt, { succeeded: false }), true);
  assert.equal(tracker.clear(), false);
});

test("review mode returns a draft and performs no write", async () => {
  const store = makeStore();
  const result = await addTerm({
    rawInput: "apple",
    saveMode: "review",
    findExisting: store.find,
    resolveSpelling: async (input) => ({ original: input, chosen: input, term: input }),
    enrichResolved: async () => ({ term: "apple", entryType: "word", meaning: "苹果", quality: { status: "trusted" } }),
    insertEntry: store.insert
  });
  assert.equal(result.status, "review");
  assert.equal(store.values.size, 0);
});

test("the main add flow routes quotations through full translation and attribution lookup", async () => {
  const store = makeStore();
  const quote = "The only way to do great work is to love what you do.";
  let lookupCalls = 0;
  const result = await addTerm({
    rawInput: quote,
    saveMode: "review",
    findExisting: store.find,
    resolveSpelling: async () => {
      throw new Error("quote must not enter the word spelling path");
    },
    enrichResolved: async () => {
      throw new Error("quote must not enter word enrichment");
    },
    lookupTerm: async (input, options) => {
      lookupCalls += 1;
      assert.equal(input, quote);
      assert.equal(options.forceEntryType, "quote");
      return {
        rawInput: input,
        term: input,
        entryType: "quote",
        correction: { status: "unchecked", original: input, chosen: input },
        meaning: "成就伟大工作的唯一方法，是热爱你所做的事。",
        attributionStatus: "candidate",
        attributionCandidates: [{ title: "Candidate source", url: "https://en.wikiquote.org/wiki/Candidate" }],
        quality: { status: "machine-candidate", autoSave: false, source: "quote-test" }
      };
    },
    insertEntry: store.insert
  });
  assert.equal(lookupCalls, 1);
  assert.equal(result.status, "review");
  assert.equal(result.draft.entryType, "quote");
  assert.equal(result.draft.attributionStatus, "candidate");
  assert.equal(store.values.size, 0);
});

test("an explicitly selected proverb uses the same attribution-safe route", async () => {
  const store = makeStore();
  const proverb = "A stitch in time saves nine.";
  const result = await addTerm({
    rawInput: proverb,
    saveMode: "review",
    forceEntryType: "proverb",
    findExisting: store.find,
    resolveSpelling: async () => { throw new Error("proverb spelling path must not run"); },
    enrichResolved: async () => { throw new Error("proverb word enrichment must not run"); },
    lookupTerm: async (input, options) => ({
      term: input,
      entryType: options.forceEntryType,
      meaning: "",
      attributionStatus: "unverified",
      quality: { status: "incomplete", autoSave: false }
    }),
    insertEntry: store.insert
  });
  assert.equal(result.status, "review");
  assert.equal(result.draft.entryType, "proverb");
});

test("20 concurrent additions converge on one entry without an exception", async () => {
  const store = makeStore();
  const results = await Promise.all(Array.from({ length: 20 }, () => addTerm({
    rawInput: "hip",
    saveMode: "auto",
    findExisting: store.find,
    resolveSpelling: async (input) => ({ original: input, chosen: input, term: input }),
    enrichResolved: async () => ({ term: "hip", entryType: "word", meaning: "髋；臀部", quality: { status: "trusted", source: "fixture" } }),
    insertEntry: store.insert
  })));
  assert.equal(results.filter((result) => result.status === "inserted").length, 1);
  assert.equal(results.filter((result) => result.status === "duplicate").length, 19);
  assert.equal(store.values.size, 1);
});
