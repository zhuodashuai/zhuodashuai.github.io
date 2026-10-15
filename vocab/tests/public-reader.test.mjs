import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fetchPublicSnapshot, readPublicCacheWithDeadline } from "../js/public-snapshot.js";
import { additionalDetailSenses } from "../js/entry-detail.js";
import { parsePublicSnapshot } from "../js/wordbook-schema.js";

const fixture = JSON.parse(readFileSync(new URL("../data/owner-wordbook.json", import.meta.url), "utf8"));
fixture.entries = fixture.entries.slice(0, 1);
const candidates = [{ url: "https://example.test/live", source: "live" }, { url: "https://example.test/static", source: "pages" }];

test("a blocked cache cannot prevent online loading, and a late valid cache can still be offered", async () => {
  let release;
  let received = null;
  const pending = new Promise((resolve) => { release = resolve; });
  const result = await readPublicCacheWithDeadline(() => pending, (cache) => { received = cache; }, 10);
  assert.equal(result, null);
  assert.equal(received, null);
  release({ snapshot: fixture });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received.snapshot.entries[0].id, fixture.entries[0].id);
  let invalidWasOffered = false;
  assert.equal(await readPublicCacheWithDeadline(async () => ({ snapshot: { entries: [] } }), () => { invalidWasOffered = true; }), null);
  assert.equal(invalidWasOffered, false);
});

test("a hung provider is aborted and cannot block the validated static fallback", async () => {
  const calls = [];
  const result = await fetchPublicSnapshot({ candidates, timeoutMs: 10, fetcher: (url, options) => {
    calls.push({ url, ...options });
    return calls.length === 1 ? new Promise(() => {}) : Promise.resolve(Response.json(fixture));
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(result.source, "pages");
  assert.equal(result.snapshot.entries[0].id, fixture.entries[0].id);
});

test("a stalled response body is also bounded, rather than only the response headers", async () => {
  let count = 0;
  const result = await fetchPublicSnapshot({ candidates, timeoutMs: 10, fetcher: async () => ++count === 1
    ? { ok: true, status: 200, json: () => new Promise(() => {}) }
    : Response.json(fixture) });
  assert.equal(count, 2);
  assert.equal(result.source, "pages");
});

test("invalid provider data cannot replace the snapshot and falls back to valid data", async () => {
  let count = 0;
  const result = await fetchPublicSnapshot({ candidates, fetcher: async () => Response.json(++count === 1 ? { entries: [] } : fixture) });
  assert.equal(count, 2);
  assert.equal(result.source, "pages");
});

test("304 reuses a validated snapshot with the live etag, not an uninitialized reader", async () => {
  const snapshot = parsePublicSnapshot(fixture);
  let headers;
  const result = await fetchPublicSnapshot({ candidates, snapshot, etag: 'W/"current"', fetcher: async (_, options) => {
    headers = options.headers;
    return new Response(null, { status: 304 });
  } });
  assert.equal(result.snapshot, snapshot);
  assert.equal(headers["If-None-Match"], 'W/"current"');
  let count = 0;
  const cold = await fetchPublicSnapshot({ candidates, etag: "stale", fetcher: async (_, options) => {
    assert.equal(options.headers["If-None-Match"], undefined);
    return ++count === 1 ? new Response(null, { status: 304 }) : Response.json(fixture);
  } });
  assert.equal(cold.source, "pages");
});

test("failed sources reject without modifying the last known valid data", async () => {
  const snapshot = parsePublicSnapshot(fixture);
  const before = structuredClone(snapshot);
  await assert.rejects(fetchPublicSnapshot({ candidates, snapshot, fetcher: async () => new Response("Unavailable", { status: 503 }) }), /HTTP 503/);
  assert.deepEqual(snapshot, before);
});

function entryWithSense() {
  return { meaning: "① 心怀敬畏的", definition: "filled with wonder", exampleEn: "We were awestruck.", exampleZh: "我们惊叹不已。",
    usage: "be awestruck by", register: "neutral", partOfSpeech: "adjective", collocations: ["an awestruck expression"], confusedWith: [],
    senses: [{ meaningZh: "心怀敬畏的", definitionEn: "filled with wonder", examples: [{ en: "We were awestruck.", zh: "我们惊叹不已。" }],
      usageNotes: "be awestruck by", register: "neutral", partOfSpeech: "adjective", collocations: ["an awestruck expression"], confusables: [] }] };
}

test("identical single-sense content displays once without rewriting stored card data", () => {
  const entry = entryWithSense();
  const before = structuredClone(entry);
  assert.deepEqual(additionalDetailSenses(entry), []);
  assert.deepEqual(entry, before);
});

test("single-sense deduplication retains additional examples, usage, collocations and different translations", () => {
  const entry = entryWithSense();
  entry.senses[0].examples.push({ en: "A different example.", zh: "另一个例句。" });
  entry.senses[0].collocations.push("be awestruck at");
  entry.senses[0].usageNotes = "An additional distinction.";
  const [extra] = additionalDetailSenses(entry);
  assert.equal(extra.definitionEn, "");
  assert.equal(extra.examples.length, 1);
  assert.deepEqual(extra.collocations, ["be awestruck at"]);
  assert.equal(extra.usageNotes, "An additional distinction.");
  entry.senses[0].examples[0].zh = "一条不同的译文。";
  assert.equal(additionalDetailSenses(entry)[0].examples.length, 2);
});

test("multiple senses retain all their original distinctions and examples", () => {
  const entry = entryWithSense();
  entry.senses.push({ ...entry.senses[0], meaningZh: "另一义项" });
  assert.deepEqual(additionalDetailSenses(entry), entry.senses);
});
