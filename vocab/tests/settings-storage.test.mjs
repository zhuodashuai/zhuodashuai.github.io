import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  entryMatchesCanonical,
  entryRevisionMatches,
  EntryConflictError,
  legacyEntryRevision
} from "../js/storage.js";
import { inspectSettings, parseSettings } from "../js/settings.js";

test("optimistic updatedAt checks reject stale editor snapshots", () => {
  const current = { updatedAt: "2026-08-27T12:00:01.000Z" };
  assert.equal(entryRevisionMatches(current, "2026-08-27T12:00:01.000Z"), true);
  assert.equal(entryRevisionMatches(current, "2026-08-27T12:00:00.000Z"), false);
  assert.equal(entryRevisionMatches(current, undefined), false, "a missing baseline must never become an unconditional overwrite");
  assert.equal(new EntryConflictError().name, "EntryConflictError");
});

test("legacy records receive a stable revision and corrected spellings become pre-network aliases", () => {
  assert.equal(
    legacyEntryRevision({ createdAt: "2026-08-20T10:00:00.000Z" }, "2026-08-27T12:00:00.000Z"),
    "2026-08-20T10:00:00.000Z"
  );
  const corrected = {
    term: "hello",
    correction: { status: "autocorrected", original: "helllo", chosen: "hello" }
  };
  assert.equal(entryMatchesCanonical(corrected, "helllo"), true);
  assert.equal(entryMatchesCanonical(corrected, "hello"), true);
  assert.equal(entryMatchesCanonical({ ...corrected, correction: { ...corrected.correction, status: "exact" } }, "helllo"), false);
});

test("the IndexedDB v4 migration reads oldVersion from the upgrade event", async () => {
  const source = await readFile(new URL("../js/storage.js", import.meta.url), "utf8");
  assert.match(source, /request\.onupgradeneeded\s*=\s*\(event\)\s*=>/);
  assert.match(source, /event\.oldVersion\s*<\s*4/);
  assert.doesNotMatch(source, /request\.oldVersion/);
});

test("invalid or future settings recover to first-run choice without throwing", () => {
  assert.deepEqual(inspectSettings(null), { settings: null, invalid: false, error: "" });
  assert.equal(inspectSettings({ schemaVersion: 1, saveMode: "invalid" }).invalid, true);
  assert.equal(inspectSettings({ schemaVersion: 2, saveMode: "auto" }).invalid, true);
  assert.equal(inspectSettings("broken").settings, null);
  assert.deepEqual(parseSettings({ schemaVersion: 1, saveMode: "review" }), {
    schemaVersion: 1,
    saveMode: "review"
  });
});
