import { describe, expect, it } from "vitest";
import ledger from "../../tooling/dictionary/source-revisions/semantic-common-five-0001.candidate.json";
import proposal from "../../tooling/dictionary/source-revisions/semantic-common-five-0001.runtime-proposal.json";
import { resolveDictionaryCollection } from "../src/dictionary-collection";

type CorrectedRecord = (typeof ledger.entries)[number]["afterCandidate"];

// Synthetic first-party asset transport with the exact reviewed five records;
// this does not claim a production namespace, account or collection mutation.
async function fixture(row: CorrectedRecord, license = proposal.runtimeDescriptor.license, formOnly = false) {
  const version = "cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644";
  const query = formOnly ? "downloaded" : row.term;
  let hash = 2166136261;
  for (const character of query) { hash ^= character.codePointAt(0)!; hash = Math.imul(hash, 16777619) >>> 0; }
  const bucket = hash % 128;
  const text = JSON.stringify({ schemaVersion: 2, kind: "en", bucket, records: [row],
    keys: [[query, [{ id: row.id, kind: formOnly ? "form" : "canonical", ...(formOnly ? { term: query } : {}) }]]] });
  const bytes = new TextEncoder().encode(text);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  const file = `${version}/en-${String(bucket).padStart(3, "0")}.json`;
  const shards: Array<unknown> = Array.from({ length: 128 }, () => null);
  shards[bucket] = { bucket, file, bytes: bytes.byteLength, sha256: digest };
  const manifest = { schemaVersion: 2, version, english: { buckets: 128, shards },
    sources: { "semantic-editorial": { ...proposal.runtimeDescriptor, license,
      sha256: "802943b0dd8b8c34560e59bd14cbda07a0595bf58ed78e60a3a0a6a7530859a6" } } };
  const seen: Array<{ path: string; method: string }> = [];
  const assets = { fetch: async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    const path = new URL(request.url).pathname; seen.push({ path, method: request.method });
    if (path === "/data/expanded-dictionary/manifest.json") return new Response(JSON.stringify(manifest));
    if (path === `/data/expanded-dictionary/${file}`) return new Response(text);
    throw new Error(`Unexpected asset or external request: ${path}`);
  } } as Pick<Fetcher, "fetch">;
  return { assets, seen, query };
}

describe("five reviewed semantic source records through the existing collection resolver", () => {
  for (const item of ledger.entries) it(`retains ${item.term}'s exact selected meaning and honest short source`, async () => {
    const { assets, seen } = await fixture(item.afterCandidate);
    const entry = await resolveDictionaryCollection(item.term, assets);
    expect(entry.term).toBe(item.term);
    expect(entry.partOfSpeech).toBe(item.afterCandidate.partOfSpeech);
    expect(entry.meaning).toBe(item.afterCandidate.meaning);
    expect(entry.sourceTitle).toBe(proposal.runtimeDescriptor.name);
    expect(entry.sourceUrl).toBe(proposal.runtimeDescriptor.url);
    expect(entry.attributionNote).toContain(proposal.runtimeDescriptor.license);
    expect(entry.attributionNote).not.toContain(ledger.proposedSourceDescriptor.license);
    expect(entry.sources[0].kind).toBe("dictionary");
    expect(entry.definition).toBe(""); expect(entry.exampleEn).toBe(""); expect(entry.exampleZh).toBe("");
    expect(entry.synonyms).toEqual([]); expect(entry.senses).toEqual([]);
    expect(seen).toHaveLength(2);
    expect(seen.every(request => request.method === "GET" && request.path.startsWith("/data/expanded-dictionary/"))).toBe(true);
  });

  it("keeps the existing 200-character licence limit; the old long draft is not a runtime descriptor", async () => {
    expect(proposal.runtimeDescriptor.license.length).toBe(66);
    expect(ledger.proposedSourceDescriptor.license.length).toBeGreaterThan(200);
    const { assets } = await fixture(ledger.entries[0].afterCandidate, ledger.proposedSourceDescriptor.license);
    await expect(resolveDictionaryCollection("affordable", assets)).rejects.toMatchObject({ status: 503, code: "dictionary_collection_unavailable" });
  });

  it("still requires a canonical head instead of silently collecting a form-only reference", async () => {
    const item = ledger.entries.find(row => row.term === "download")!;
    const { assets, query } = await fixture(item.afterCandidate, proposal.runtimeDescriptor.license, true);
    await expect(resolveDictionaryCollection(query, assets)).rejects.toMatchObject({ status: 422, code: "dictionary_term_not_exact" });
  });
});
