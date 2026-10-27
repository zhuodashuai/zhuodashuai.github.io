import { describe, expect, it } from "vitest";
import { DictionaryCollectionRequestSchema, findCollectedEntry, resolveDictionaryCollection } from "../src/dictionary-collection";
import { validateSnapshot, validateEnglishInput } from "../src/schema";
import { EVERYDAY_LOOKUP_ENTRIES } from "../../vocab/js/everyday-lookup-data.js";

function bucketFor(term: string): number {
  let hash = 2166136261;
  for (const char of term.toLowerCase()) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 128;
}

async function fixture(term = "apple", { kind = "canonical", corrupt = false, duplicate = false, missing = false, meaning = "n. 苹果" } = {}) {
  const bucket = bucketFor(term), version = "a".repeat(64);
  const row = { id: bucket, term, partOfSpeech: "noun", meaning, forms: [], source: "mit" };
  const rows = duplicate ? [row, { ...row, id: bucket + 128 }] : [row];
  const text = JSON.stringify({ schemaVersion: 2, kind: "en", bucket, records: rows,
    keys: missing ? [] : [[term.toLowerCase(), rows.map(value => ({ id: value.id, kind }))]] });
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

  it("collects packaged everyday heads with their own meanings and bilingual examples, without a dictionary or AI request", async () => {
    let requests = 0;
    const assets = { fetch: async () => { requests++; throw new Error("No asset lookup is needed for packaged entries"); } } as Pick<Fetcher, "fetch">;
    expect(EVERYDAY_LOOKUP_ENTRIES.length).toBeGreaterThanOrEqual(40);
    for (const row of EVERYDAY_LOOKUP_ENTRIES) {
      let entry;
      try { entry = await resolveDictionaryCollection(row.term, assets); }
      catch (error) { throw new Error(`Packaged collection failed for ${row.term}`, { cause: error }); }
      expect(entry.term).toBe(row.term); expect(entry.partOfSpeech).toBe(row.partOfSpeech); expect(entry.meaning).toBe(row.meaning);
      expect(entry.exampleEn).toBe(row.en); expect(entry.exampleZh).toBe(row.zh);
      expect(entry.exampleEn.trim().length).toBeGreaterThan(0); expect(entry.exampleZh).toMatch(/\p{Script=Han}/u);
      expect(entry.sourceTitle).toBe(row.dictionarySource || "卓的日常词组"); expect(entry.organizationMethod).toBe("local-dictionary");
      expect(validateSnapshot({ schemaVersion: 3, revisionId: "everyday-collection-revision", lastMutationId: "everyday-test-key", exportedAt: entry.updatedAt, entries: [entry] }).entries).toHaveLength(1);
    }
    expect(requests).toBe(0);
    expect((await resolveDictionaryCollection("LiVe  AgEnT", assets)).term).toBe("live agent");
  });

  it("accepts only declared English spellings and keeps an existing collected everyday card unchanged", async () => {
    const row = EVERYDAY_LOOKUP_ENTRIES.find(item => item.englishForms.some(form => form.toLowerCase() !== item.term.toLowerCase()));
    expect(row).toBeDefined();
    const form = row!.englishForms.find(value => value.toLowerCase() !== row!.term.toLowerCase())!;
    const assets = { fetch: async () => { throw new Error("Packaged forms must not need assets"); } } as Pick<Fetcher, "fetch">;
    const entry = await resolveDictionaryCollection(form, assets);
    expect(entry.term).toBe(row!.term);
    entry.meaning += "\n自己的学习备注。";
    const snapshot = validateSnapshot({ schemaVersion: 3, revisionId: "everyday-collection-revision", lastMutationId: "everyday-test-key", exportedAt: entry.updatedAt, entries: [entry] });
    const before = JSON.stringify(snapshot.entries[0]);
    expect(findCollectedEntry(snapshot, form)).toBe(snapshot.entries[0]);
    expect(findCollectedEntry(snapshot, entry.term.toUpperCase())).toBe(snapshot.entries[0]);
    expect(JSON.stringify(snapshot.entries[0])).toBe(before);
  });

  it("cannot turn Chinese search aliases or browser-supplied everyday definitions into collection authority", async () => {
    for (const fields of [{ meaning: "伪造释义" }, { source: "卓的日常词组" }, { exampleEn: "Forged." }]) {
      expect(DictionaryCollectionRequestSchema.safeParse({ term: "live agent", mutationId: "everyday-test-key", ...fields }).success).toBe(false);
    }
    const { assets, seen } = await fixture();
    for (const term of ["人工客服", "消毒酒精", "<script>live agent</script>"]) {
      await expect(resolveDictionaryCollection(term, assets)).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    }
    expect(seen).toHaveLength(0);
    const unknown = "live agent secret override", missing = await fixture(unknown, { missing: true });
    await expect(resolveDictionaryCollection(unknown, missing.assets)).rejects.toMatchObject({ status: 422, code: "dictionary_term_not_exact" });
  });

  it("saves reviewed supplementary meanings with their own source while preserving an existing user card", async () => {
    const row = EVERYDAY_LOOKUP_ENTRIES.find(item => item.reviewedCanonicalSense === true)!;
    expect(row).toBeDefined();
    const assets = { fetch: async () => { throw new Error("A shipped reviewed source does not need a provider"); } } as Pick<Fetcher, "fetch">;
    const entry = await resolveDictionaryCollection(row.term, assets);
    expect(entry.sourceTitle).toBe("卓式词典·义项补充");
    expect(entry.meaning).toBe(row.meaning); expect(entry.exampleEn).toBe(row.en); expect(entry.exampleZh).toBe(row.zh);
    expect(entry.correction.source).toBe("reviewed-canonical-sense");
    expect(JSON.stringify(entry)).not.toContain("canonicalSourceSha256");
    entry.meaning = "自己保留的阅读语境释义。"; entry.usage = "自己的学习备注。";
    const snapshot = validateSnapshot({ schemaVersion: 3, revisionId: "reviewed-source-existing-card", lastMutationId: "reviewed-source-test", exportedAt: entry.updatedAt, entries: [entry] });
    const before = JSON.stringify(snapshot.entries[0]);
    expect(findCollectedEntry(snapshot, row.term)).toBe(snapshot.entries[0]);
    expect(JSON.stringify(snapshot.entries[0])).toBe(before);
    expect(DictionaryCollectionRequestSchema.safeParse({ term: row.term, mutationId: "reviewed-source-test", dictionarySource: "forged" }).success).toBe(false);
  });
});
