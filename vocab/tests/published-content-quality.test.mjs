import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parsePublicSnapshot } from "../js/wordbook-schema.js";

const snapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);

async function publishedEntries() {
  const raw = JSON.parse(await readFile(snapshotUrl, "utf8"));
  return parsePublicSnapshot(raw).entries;
}

test("published hip uses real hip collocations and never substitutes a phrase without hip", async () => {
  const hip = (await publishedEntries()).find((entry) => entry.term === "hip");
  assert.ok(hip);
  const content = JSON.stringify(hip);
  assert.doesNotMatch(content, /keep up with the times/i);
  assert.ok(hip.collocations.includes("be hip to something"));
  assert.ok(hip.collocations.includes("get hip to something"));
  assert.deepEqual(hip.synonyms, []);
});

test("published surveillance is one ordinary uncountable sense without a made-up plural or electrical subsense", async () => {
  const surveillance = (await publishedEntries()).find((entry) => entry.term === "surveillance");
  assert.ok(surveillance);
  assert.equal(surveillance.senses.length, 1);
  assert.match(surveillance.meaning, /不可数/);
  assert.doesNotMatch(JSON.stringify(surveillance), /\[电\]|侦测|surveillances/i);
  assert.deepEqual(surveillance.forms, []);
  assert.ok(surveillance.sources.some((source) => source.kind === "authoritative" && /oxfordlearnersdictionaries\.com/i.test(source.url)));
  assert.deepEqual(surveillance.synonyms, []);
});

test("published perspicacious keeps only the modern mental-discernment sense and cites Collins", async () => {
  const perspicacious = (await publishedEntries()).find((entry) => entry.term === "perspicacious");
  assert.ok(perspicacious);
  assert.doesNotMatch(JSON.stringify(perspicacious), /目光锐利|keen eyesight|keen vision/i);
  assert.deepEqual(perspicacious.confusedWith, []);
  assert.deepEqual(perspicacious.senses.flatMap((sense) => sense.confusables), []);
  assert.deepEqual(perspicacious.synonyms, []);
  assert.ok(perspicacious.sources.some((source) => source.kind === "authoritative" && /collinsdictionary\.com/i.test(source.url)));
});
