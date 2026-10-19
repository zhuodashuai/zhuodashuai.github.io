import { describe, expect, it } from "vitest";
import { DictionaryCollectionRequestSchema, findCollectedEntry, resolveDictionaryCollection } from "../src/dictionary-collection";
import { validateSnapshot, validateEnglishInput } from "../src/schema";

function bucketFor(term: string): number {
  let hash = 2166136261;
  for (const char of term.toLowerCase()) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 128;
}

async function fixture(term = "apple", { kind = "canonical", corrupt = false, duplicate = false, meaning = "n. 苹果" } = {}) {
  const bucket = bucketFor(term), version = "a".repeat(64);
  const row = { id: bucket, term, partOfSpeech: "noun", meaning, forms: [], source: "mit" };
  const rows = duplicate ? [row, { ...row, id: bucket + 128 }] : [row];
  const text = JSON.stringify({ schemaVersion: 2, kind: "en", bucket, records: rows,
    keys: [[term.toLowerCase(), rows.map(value => ({ id: value.id, kind }))]] });
  const bytes = new TextEncoder().encode(text);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  const descriptor = { bucket, file: `${version}/en-${String(bucket).padStart(3, "0")}.json`, bytes: bytes.byteLength, sha256: corrupt ? "b".repeat(64) : hash };
  const shards: Array<typeof descriptor | null> = Array.from({ length: 128 }, () => null); shards[bucket] = descriptor;
  const manifest = { schemaVersion: 2, version, english: { buckets: 128, shards },
    sources: { mit: { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT" } } };
  const seen: string[] = [];
  const assets = { fetch: async (input: RequestInfo | URL) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname; seen.push(path);
    return new Response(path.endsWith("manifest.json") ? JSON.stringify(manifest) : text);
  } } as Pick<Fetcher, "fetch">;
  return { assets, seen };
}

describe("verified owner dictionary collection", () => {
  it("accepts only a head and mutation key, never browser definitions or sources", () => {
    expect(DictionaryCollectionRequestSchema.parse({ term: "apple", mutationId: "dictionary-test-key" }).term).toBe("apple");
    expect(DictionaryCollectionRequestSchema.safeParse({ term: "apple", mutationId: "dictionary-test-key", meaning: "伪造" }).success).toBe(false);
  });

  it("reads only first party assets and preserves verified gloss and license without inventing missing content", async () => {
    const { assets, seen } = await fixture();
    const entry = await resolveDictionaryCollection("apple", assets);
    expect(entry.meaning).toBe("n. 苹果"); expect(entry.sourceTitle).toBe("ECDICT");
    expect(entry.sources[0]).toMatchObject({ kind: "dictionary", title: "ECDICT · MIT" });
    expect(entry.organizationMethod).toBe("local-dictionary");
    expect(entry.definition).toBe(""); expect(entry.exampleEn).toBe(""); expect(entry.exampleZh).toBe(""); expect(entry.senses).toEqual([]);
    expect(seen).toHaveLength(2); expect(seen.every(path => path.startsWith("/data/expanded-dictionary/"))).toBe(true);
    expect(validateSnapshot({ schemaVersion: 3, revisionId: "collection-revision-test", lastMutationId: "dictionary-test-key", exportedAt: entry.updatedAt, entries: [entry] }).entries).toHaveLength(1);
  });

  it("fails closed for corrupt assets, form-only references, ambiguity and missing Chinese meaning", async () => {
    for (const options of [{ corrupt: true }, { kind: "form" }, { duplicate: true }, { meaning: "a fruit" }]) {
      const { assets } = await fixture("apple", options);
      await expect(resolveDictionaryCollection("apple", assets)).rejects.toThrow();
    }
  });

  it("cancels an oversized asset stream before buffering the complete response", async () => {
    let cancelled = false;
    const assets = { fetch: async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(300_001)); },
      cancel() { cancelled = true; }
    })) } as Pick<Fetcher, "fetch">;
    await expect(resolveDictionaryCollection("apple", assets)).rejects.toMatchObject({ status: 503, code: "dictionary_collection_unavailable" });
    expect(cancelled).toBe(true);
  });

  it("allows the packaged 24/7 expression but rejects arbitrary number-only or Chinese input before reading", async () => {
    const { assets, seen } = await fixture("24/7", { meaning: "全天候；每周七天" });
    expect((await resolveDictionaryCollection("24/7", assets)).term).toBe("24/7");
    const count = seen.length;
    for (const term of ["1234", "苹果", "<script>bad</script>"]) await expect(resolveDictionaryCollection(term, assets)).rejects.toThrow();
    expect(seen.length).toBe(count); expect(validateEnglishInput("24/7")).toBe("24/7");
  });

  it("deduplicates normalized heads and established correction aliases while returning the existing entry unchanged", async () => {
    const entry = await resolveDictionaryCollection("apple", (await fixture()).assets);
    const snapshot = validateSnapshot({ schemaVersion: 3, revisionId: "collection-revision-test", lastMutationId: "dictionary-test-key", exportedAt: entry.updatedAt, entries: [entry] });
    expect(findCollectedEntry(snapshot, "APPLE!")).toBe(snapshot.entries[0]);
    snapshot.entries[0].correction = { status: "accepted", original: "aple", suggestion: "apple", chosen: "apple", confidence: 1, source: "manual" };
    expect(findCollectedEntry(snapshot, "aple")).toBe(snapshot.entries[0]);
    expect(findCollectedEntry(snapshot, "apples")).toBeUndefined();
  });
});
