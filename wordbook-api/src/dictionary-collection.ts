import { z } from "zod";
import { ApiError } from "./security";
import { classifyInput, hasPlausibleChineseMeaning, normalizeEnglish, PublicEntrySchema, validateEnglishInput, type PublicEntry, type PublicSnapshot } from "./schema";
import { EVERYDAY_LOOKUP_ENTRIES, type EverydayLookupEntry } from "../../vocab/js/everyday-lookup-data.js";

const ROOT = "/data/expanded-dictionary/";
const HASH = /^[a-f0-9]{64}$/;
const MAX_SHARD_BYTES = 8 * 1024 * 1024;
type Assets = Pick<Fetcher, "fetch">;

export const DictionaryCollectionRequestSchema = z.object({
  term: z.string().trim().min(1).max(200),
  mutationId: z.string().trim().min(12).max(180).regex(/^[A-Za-z0-9._:-]+$/)
}).strict();

function unavailable(): ApiError {
  return new ApiError(503, "dictionary_collection_unavailable", "本站词典暂时无法核对；查询结果仍可查看，请稍后重试收录。");
}

function spelling(value: string): string {
  return value.normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim();
}

/** Resolve only packaged English heads/forms, never Chinese search aliases or browser glosses. */
function everydayHead(value: string): EverydayLookupEntry | undefined {
  const exact = spelling(value), key = exact.toLocaleLowerCase("en-US");
  const canonical = EVERYDAY_LOOKUP_ENTRIES.filter(row => spelling(row.term).toLocaleLowerCase("en-US") === key);
  const matches = canonical.length ? canonical : EVERYDAY_LOOKUP_ENTRIES.filter(row =>
    row.englishForms.some(form => spelling(form).toLocaleLowerCase("en-US") === key));
  const precise = matches.filter(row => [row.term, ...row.englishForms].some(form => spelling(form) === exact));
  const choices = precise.length ? precise : matches;
  if (choices.length > 1) throw new ApiError(422, "dictionary_term_not_exact", "请选择明确的英文词条后重试收录。");
  return choices[0];
}

function everydayEntry(row: EverydayLookupEntry): PublicEntry {
  const now = new Date().toISOString();
  const title = "卓的日常词组", url = "https://zhuodashuai.github.io/vocab/";
  try {
    validateEnglishInput(row.term);
    if (!hasPlausibleChineseMeaning(row.meaning)) throw unavailable();
    return PublicEntrySchema.parse({
      id: `public-${crypto.randomUUID()}`, revision: 1, originalInput: row.term, term: row.term,
      normalized: normalizeEnglish(row.term), standardForm: row.term, entryType: classifyInput(row.term),
      correction: { status: "exact", original: row.term, suggestion: "", chosen: row.term, confidence: 1, source: "packaged-everyday-dictionary" },
      phonetic: "", partOfSpeech: row.partOfSpeech, meaning: row.meaning, definition: "", senses: [], synonyms: [],
      collocations: [], exampleEn: row.en, exampleZh: row.zh, usage: "", register: "", confusedWith: [],
      forms: row.englishForms.filter(form => normalizeEnglish(form) !== normalizeEnglish(row.term)), tags: [], author: "",
      sourceTitle: title, sourceWork: "", sourceDate: "", sourceUrl: url, attributionStatus: "unverified", attributionNote: "",
      sources: [{ title, url, kind: "dictionary", retrievedAt: now }],
      readingContexts: [], organizationMethod: "local-dictionary", createdAt: now, updatedAt: now
    });
  } catch { throw unavailable(); }
}

function bucketFor(value: string): number {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 128;
}

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value as Record<string, any>;
}

async function assetBytes(assets: Assets, path: string, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      reject(unavailable());
    }, 15_000);
  });
  const operation = async (): Promise<Uint8Array<ArrayBuffer>> => {
    const response = await assets.fetch(new Request(`https://dictionary.internal${path}`, { redirect: "manual", signal: controller.signal }));
    if (!response.ok || Number(response.headers.get("content-length")) > maximum || !response.body) throw unavailable();
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximum) { await reader.cancel(); throw unavailable(); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    } finally { reader.releaseLock(); reader = null; }
  };
  try {
    return await Promise.race([operation(), limit]);
  } catch { throw unavailable(); }
  finally { clearTimeout(timer!); }
}

function json(bytes: Uint8Array): Record<string, any> {
  try { return object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch { throw unavailable(); }
}

/** Only canonical heads and explicitly packaged everyday forms qualify; browser definitions never do. */
export async function resolveDictionaryCollection(term: string, assets: Assets): Promise<PublicEntry> {
  validateEnglishInput(term);
  if (term.length > 200) throw new ApiError(400, "invalid_dictionary_term", "词条过长，不能自动收录。");
  const everyday = everydayHead(term);
  if (everyday) return everydayEntry(everyday);
  const exact = spelling(term), key = exact.toLocaleLowerCase("en-US"), bucket = bucketFor(key);
  const manifest = json(await assetBytes(assets, `${ROOT}manifest.json`, 300_000));
  const english = object(manifest.english);
  if (manifest.schemaVersion !== 2 || !HASH.test(manifest.version) || english.buckets !== 128 || !Array.isArray(english.shards)) throw unavailable();
  const descriptor = object(english.shards[bucket]);
  const expectedFile = `${manifest.version}/en-${String(bucket).padStart(3, "0")}.json`;
  if (descriptor.bucket !== bucket || descriptor.file !== expectedFile || !HASH.test(descriptor.sha256)
    || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > MAX_SHARD_BYTES) throw unavailable();
  const bytes = await assetBytes(assets, `${ROOT}${expectedFile}`, MAX_SHARD_BYTES);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== descriptor.bytes || digest !== descriptor.sha256) throw unavailable();
  const shard = json(bytes);
  if (shard.schemaVersion !== 2 || shard.kind !== "en" || shard.bucket !== bucket || !Array.isArray(shard.records) || !Array.isArray(shard.keys)) throw unavailable();
  const keys = shard.keys.filter((item: unknown) => Array.isArray(item) && item[0] === key);
  if (keys.length !== 1 || !Array.isArray(keys[0][1])) throw new ApiError(422, "dictionary_term_not_exact", "请明确选择词典中已经核对的英文原形后收录。");
  const refs = keys[0][1].filter((ref: unknown) => object(ref).kind === "canonical");
  const records = refs.map((ref: Record<string, unknown>) => {
    const matches = shard.records.filter((row: unknown) => object(row).id === ref.id);
    if (matches.length !== 1) throw unavailable();
    return object(matches[0]);
  }).filter((row: Record<string, unknown>) => typeof row.term === "string" && spelling(row.term as string).toLocaleLowerCase("en-US") === key);
  const precise = records.filter((row: Record<string, string>) => spelling(row.term) === exact);
  const choices = precise.length ? precise : records;
  if (choices.length !== 1) throw new ApiError(422, "dictionary_term_not_exact", "这个词条未能唯一核对；请选择明确的英文词条后重试。");
  const row = choices[0], source = object(object(manifest.sources)[row.source]);
  if (typeof row.meaning !== "string" || !hasPlausibleChineseMeaning(row.meaning)) throw unavailable();
  if (typeof source.name !== "string" || !source.name.trim() || source.name.length > 200
    || typeof source.license !== "string" || source.license.length > 200 || typeof source.url !== "string") throw unavailable();
  const now = new Date().toISOString();
  try {
    validateEnglishInput(row.term);
    return PublicEntrySchema.parse({
      id: `public-${crypto.randomUUID()}`, revision: 1, originalInput: row.term, term: row.term,
      normalized: normalizeEnglish(row.term), standardForm: row.term, entryType: classifyInput(row.term),
      correction: { status: "exact", original: row.term, suggestion: "", chosen: row.term, confidence: 1, source: "verified-local-dictionary" },
      phonetic: "", partOfSpeech: row.partOfSpeech, meaning: row.meaning, definition: "", senses: [], synonyms: [],
      collocations: [], exampleEn: "", exampleZh: "", usage: "", register: "", confusedWith: [], forms: [], tags: [], author: "",
      sourceTitle: source.name, sourceWork: "", sourceDate: "", sourceUrl: source.url, attributionStatus: "unverified",
      attributionNote: `词典来源：${source.name}；许可：${source.license}。仅保留已核对的词性和中文释义，未补写英文定义或例句。`,
      sources: [{ title: `${source.name} · ${source.license}`.slice(0, 300), url: source.url, kind: "dictionary", retrievedAt: now }],
      readingContexts: [], organizationMethod: "local-dictionary", createdAt: now, updatedAt: now
    });
  } catch { throw unavailable(); }
}

/** Match existing heads/corrections first, then packaged everyday forms, without overwriting. */
export function findCollectedEntry(snapshot: PublicSnapshot, term: string): PublicEntry | undefined {
  const key = normalizeEnglish(term);
  const matches = (entry: PublicEntry, wanted: string): boolean => {
    const aliases = [entry.term, entry.normalized, entry.standardForm, entry.correction.chosen];
    if (["suggested", "accepted", "kept"].includes(entry.correction.status)) aliases.push(entry.correction.original);
    if (["suggested", "accepted"].includes(entry.correction.status)) aliases.push(entry.correction.suggestion);
    return aliases.some(alias => normalizeEnglish(alias) === wanted);
  };
  const existing = snapshot.entries.find(entry => matches(entry, key));
  if (existing) return existing;
  const everyday = everydayHead(term);
  return everyday && normalizeEnglish(everyday.term) !== key
    ? snapshot.entries.find(entry => matches(entry, normalizeEnglish(everyday.term))) : undefined;
}
