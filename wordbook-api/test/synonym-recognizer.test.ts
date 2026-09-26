import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config";
import type { PublicEntry } from "../src/schema";
import { recognizeSynonyms, type SynonymScan } from "../src/synonym-recognizer";
import { candidateSynonymFingerprint, entrySynonymFingerprint } from "../../vocab/js/synonym-evidence.js";
import { entry } from "./fixtures";

const NOW = "2026-09-26T12:00:00.000Z";
function lexical(term: string, overrides: Partial<PublicEntry> = {}): PublicEntry {
  return entry({ id: `word-${term.replace(/\W/g, "-")}`, term, entryType: "word", partOfSpeech: "adjective", meaning: "可口的；味道好的", definition: "Pleasant to taste.", forms: [], confusedWith: [], ...overrides });
}

function fakeConfig(run: ReturnType<typeof vi.fn>): AppConfig {
  return { AI: { run }, AI_PROVIDER: "cloudflare", CLOUDFLARE_AI_MODEL: "@cf/zai-org/glm-4.7-flash" } as unknown as AppConfig;
}

function requestData(call: unknown[]) {
  const input = call[1] as { messages: Array<{ role: string; content: string }> };
  return JSON.parse(input.messages.find((message) => message.role === "user")!.content) as { source: PublicEntry; candidates: PublicEntry[] };
}

const note = "这里均指食物味道好；语气和程度不同，并非所有语境都可互换。";
const options = () => ({ consumeBudget: vi.fn(async () => undefined), now: NOW });

afterEach(() => vi.useRealTimers());

describe("automatic collected-word synonym recognition", () => {
  it.each([
    ["delicious", ["yummy", "palatable"]],
    ["yummy", ["delicious", "palatable"]],
    ["palatable", ["yummy", "delicious"]]
  ])("matches each newly added food word %s against already collected words", async (term, collected) => {
    const source = lexical(term as string);
    const candidates = (collected as string[]).map((word) => lexical(word));
    const original = JSON.stringify([source, ...candidates]);
    const run = vi.fn(async (_model: string, input: { messages: Array<{ content: string }> }) => {
      const request = JSON.parse(input.messages[1].content);
      return { response: JSON.stringify({ matches: request.candidates.map((candidate: PublicEntry) => ({ targetId: candidate.id, note })) }) };
    });
    const opts = options();
    const result = await recognizeSynonyms(source, [source, ...candidates], fakeConfig(run), opts);
    expect(result).toMatchObject({ status: "complete", version: 1, checkedAt: NOW, candidateCount: 2 });
    expect(result.matches.map((match) => match.targetId).sort()).toEqual(candidates.map((candidate) => candidate.id).sort());
    expect(result.sourceFingerprint).toBe(entrySynonymFingerprint(source));
    expect(result.candidatesFingerprint).toBe(candidateSynonymFingerprint(candidates));
    expect(result.matches[0].targetFingerprint).toBe(entrySynonymFingerprint(candidates.find((candidate) => candidate.id === result.matches[0].targetId)!));
    expect(opts.consumeBudget).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([source, ...candidates])).toBe(original);
    expect(run.mock.calls[0][0]).toBe("@cf/zai-org/glm-4.7-flash");
  });

  it("scans all candidates including matches after the old 200-word limit", async () => {
    const candidates = Array.from({ length: 241 }, (_, index) => lexical(`candidate-${index.toString().padStart(3, "0")}`));
    candidates[240] = lexical("yummy", { id: "z-final-yummy" });
    const run = vi.fn(async (_model: string, input: { messages: Array<{ content: string }> }) => {
      const data = JSON.parse(input.messages[1].content);
      return { matches: data.candidates.filter((candidate: PublicEntry) => candidate.term === "yummy").map((candidate: PublicEntry) => ({ targetId: candidate.id, note })) };
    });
    const opts = options();
    const result = await recognizeSynonyms(lexical("delicious"), candidates, fakeConfig(run), opts);
    expect(result.status).toBe("complete");
    expect(result.candidateCount).toBe(241);
    expect(result.matches.map((match) => match.targetId)).toEqual(["z-final-yummy"]);
    expect(run).toHaveBeenCalledTimes(5);
    expect(opts.consumeBudget).toHaveBeenCalledTimes(5);
    expect(run.mock.calls.flatMap((call) => requestData(call).candidates)).toHaveLength(241);
    expect(run.mock.calls.every((call) => requestData(call).candidates.length <= 60)).toBe(true);
  });

  it("sends actual collected senses and chapter contexts instead of only a term allowlist", async () => {
    const source = lexical("cross", { partOfSpeech: "noun", meaning: "十字形", definition: "A cross-shaped mark.", readingContexts: [{
      membership: "collection:book:chapter-1", page: "1", originalInput: "a cross", entryType: "word", partOfSpeech: "noun", meaning: "十字形记号", definition: "A mark shaped like a cross.", usage: "Only the mark sense is collected.", register: "neutral", collocations: [], confusedWith: [], forms: [], exampleEn: "", exampleZh: "", sourceTitle: "Book — Chapter 1", sourceWork: "Book", sourceDate: "", attributionNote: ""
    }] });
    const mark = lexical("mark", { partOfSpeech: "noun", meaning: "记号", definition: "A visible sign." });
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({ matches: [] }));
    const result = await recognizeSynonyms(source, [mark], fakeConfig(run), options());
    expect(result.status).toBe("complete");
    expect(result.matches).toEqual([]);
    const request = requestData(run.mock.calls[0]);
    expect(request.source).toMatchObject({ partOfSpeech: "noun", meaning: "十字形", senses: [{ partOfSpeech: "noun", meaningZh: "十字形" }], readingContexts: [{ membership: "collection:book:chapter-1", originalInput: "a cross", partOfSpeech: "noun", meaning: "十字形记号", usage: "Only the mark sense is collected." }] });
    const system = (run.mock.calls[0][1] as { messages: Array<{ content: string }> }).messages[0].content;
    expect(system).toContain("Do not invent an uncollected dictionary sense");
    expect(system).toContain("Exclude antonyms");
  });

  it("excludes incompatible actual parts of speech before spending an AI request", async () => {
    const source = lexical("cross", { partOfSpeech: "noun", meaning: "十字形", definition: "A cross-shaped mark." });
    const target = lexical("angry", { meaning: "生气的" });
    const run = vi.fn(async () => ({ matches: [{ targetId: target.id, note: "都是愤怒的意思。" }] }));
    const result = await recognizeSynonyms(source, [target], fakeConfig(run), options());
    expect(result.status).toBe("complete");
    expect(result.matches).toEqual([]);
    expect(result.reason).toContain("词性");
    expect(result.candidateCount).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it.each(["form", "confusable", "context-form", "same-term"])("rejects %s relations even if the model returns them", async (relation) => {
    const target = lexical("yummy");
    const source = lexical("delicious", relation === "form" ? { forms: ["yummy"] }
      : relation === "confusable" ? { confusedWith: ["yummy"] }
        : relation === "same-term" ? { standardForm: "yummy" }
          : { senses: [{ partOfSpeech: "adjective", meaningZh: "可口的", definitionEn: "Pleasant to taste.", usageNotes: "", register: "", collocations: [], examples: [], confusables: ["yummy"] }] });
    const run = vi.fn(async () => ({ matches: [{ targetId: target.id, note }] }));
    expect(await recognizeSynonyms(source, [target], fakeConfig(run), options())).toMatchObject({ status: "complete", matches: [], candidateCount: 1 });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    { matches: [{ targetId: "uncollected", note }] },
    { matches: [{ targetId: "word-yummy", note }, { targetId: "word-yummy", note }] },
    { matches: [{ targetId: "word-yummy", note: "" }] },
    { matches: [{ targetId: "word-yummy", note: "They are related." }] },
    { matches: [{ targetId: "word-yummy", note, invented: true }] },
    { matches: null },
    { matches: [], ignored: "missing candidates" },
    { response: "```json\n{\"matches\":[]}\n```" },
    { success: false, response: { matches: [] } },
    { errors: [{ message: "failure" }], response: { matches: [] } }
  ])("does not treat invalid or uncollected results as a completed empty scan %#", async (payload) => {
    const run = vi.fn(async () => payload);
    const result = await recognizeSynonyms(lexical("delicious"), [lexical("yummy")], fakeConfig(run), options());
    expect(result.status).toBe("pending");
    expect(result.matches).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    { matches: [] },
    { response: { matches: [] } },
    { response: '{"matches":[]}' },
    { success: true, result: { response: '{"matches":[]}' } },
    { choices: [{ message: { content: '{"matches":[]}' } }] }
  ])("accepts valid structured Cloudflare envelopes %#", async (payload) => {
    const run = vi.fn(async () => payload);
    expect(await recognizeSynonyms(lexical("delicious"), [lexical("angry")], fakeConfig(run), options())).toMatchObject({ status: "complete", matches: [] });
  });

  it("marks budget exhaustion pending without requesting a model or paid fallback", async () => {
    const run = vi.fn();
    const opts = { ...options(), consumeBudget: vi.fn(async () => { throw new Error("ai_daily_limit"); }) };
    const result = await recognizeSynonyms(lexical("delicious"), [lexical("yummy")], fakeConfig(run), opts);
    expect(result.status).toBe("pending");
    expect(result.reason).toContain("额度");
    expect(run).not.toHaveBeenCalled();
  });

  it("discards a partial first-batch success when a later batch fails", async () => {
    const candidates = Array.from({ length: 61 }, (_, index) => lexical(`candidate${index}`));
    const run = vi.fn().mockImplementationOnce(async (_model: string, input: { messages: Array<{ content: string }> }) => ({
      matches: [{ targetId: JSON.parse(input.messages[1].content).candidates[0].id, note }]
    })).mockRejectedValueOnce(new Error("provider outage"));
    const result = await recognizeSynonyms(lexical("delicious"), candidates, fakeConfig(run), options());
    expect(result).toMatchObject({ status: "pending", matches: [], candidateCount: 61 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("returns explicit pending rather than silently truncating more than 20 matches", async () => {
    const candidates = Array.from({ length: 21 }, (_, index) => lexical(`candidate${index}`));
    const run = vi.fn(async () => ({ matches: candidates.map((candidate) => ({ targetId: candidate.id, note })) }));
    const result = await recognizeSynonyms(lexical("delicious"), candidates, fakeConfig(run), options());
    expect(result).toMatchObject({ status: "pending", matches: [] });
    expect(result.reason).toContain("超过 20 项");
  });

  it("retains every candidate's actual POS and collected sense during same-POS comparison", async () => {
    const source = lexical("drift", { partOfSpeech: "noun", meaning: "漂流", definition: "Slow movement carried by wind or water." });
    const target = lexical("gist", { partOfSpeech: "noun", meaning: "大意", definition: "The central meaning of what someone says." });
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({ matches: [] }));
    const result = await recognizeSynonyms(source, [target], fakeConfig(run), options());
    expect(result).toMatchObject({ status: "complete", matches: [] });
    const request = requestData(run.mock.calls[0]);
    expect(request.source.meaning).toBe("漂流");
    expect(request.candidates[0]).toMatchObject({ partOfSpeech: "noun", meaning: "大意", senses: [{ partOfSpeech: "noun", meaningZh: "大意", definitionEn: target.definition }] });
    expect(request.candidates[0].senses[0]).not.toHaveProperty("examples");
  });

  it("recognizes a novel non-food pair with multiple sense-aware candidates and arbitrary IDs", async () => {
    const source = lexical("mystified", { id: "reading-entry-57", meaning: "迷惑不解的", definition: "Unable to understand something puzzling." });
    const target = lexical("bewildered", { id: "chapter-4-entry-8", meaning: "困惑不解的", definition: "Very confused by what is happening." });
    const unrelated = lexical("nostalgic", { meaning: "怀旧的", definition: "Feeling fondly about the past." });
    const incompatible = lexical("bewilderment", { partOfSpeech: "noun", meaning: "困惑", definition: "A state of confusion." });
    const run = vi.fn(async (_model: string, input: { messages: Array<{ content: string }> }) => {
      const request = JSON.parse(input.messages[1].content);
      expect(request.source.term).toBe("mystified");
      expect(request.candidates).toHaveLength(2);
      expect(request.candidates.some((candidate: PublicEntry) => candidate.term === "bewilderment")).toBe(false);
      return { response: { matches: [{ targetId: "chapter-4-entry-8", note: "两词都指困惑不解；mystified 偏重不知原因，bewildered 更强调茫然。" }] } };
    });
    const result = await recognizeSynonyms(source, [target, unrelated, incompatible], fakeConfig(run), options());
    expect(result).toMatchObject({ status: "complete", candidateCount: 3, matches: [{ targetId: target.id }] });
  });

  it("completes without a request when no other lexical candidates exist", async () => {
    const source = lexical("delicious");
    const run = vi.fn();
    const opts = options();
    const result = await recognizeSynonyms(source, [source, lexical("A quote", { entryType: "quote" })], fakeConfig(run), opts);
    expect(result).toMatchObject({ status: "complete", matches: [], candidateCount: 0 });
    expect(run).not.toHaveBeenCalled();
    expect(opts.consumeBudget).not.toHaveBeenCalled();
  });

  it("returns pending when the Cloudflare binding is not configured", async () => {
    const result = await recognizeSynonyms(lexical("delicious"), [lexical("yummy")], { AI_PROVIDER: "openai", OPENAI_API_KEY: "unused" } as AppConfig, options());
    expect(result).toMatchObject({ status: "pending", matches: [] });
    expect(result.reason).toContain("尚未接通");
  });

  it("ignores late model results and never starts a subsequent batch after timeout", async () => {
    vi.useFakeTimers();
    let finish: ((value: unknown) => void) | undefined;
    const run = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const candidates = Array.from({ length: 61 }, (_, index) => lexical(`candidate${index}`));
    const opts = { ...options(), timeoutMs: 50 };
    const task = recognizeSynonyms(lexical("delicious"), candidates, fakeConfig(run), opts);
    await vi.advanceTimersByTimeAsync(51);
    const result = await task;
    expect(result.status).toBe("pending");
    expect(result.reason).toContain("超时");
    finish!({ matches: [{ targetId: candidates[0].id, note }] });
    await vi.advanceTimersByTimeAsync(10);
    expect(result.matches).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(opts.consumeBudget).toHaveBeenCalledTimes(1);
  });

  it("limits a single batch to 12 seconds even when the caller asks for more", async () => {
    vi.useFakeTimers();
    const run = vi.fn(() => new Promise(() => undefined));
    const task = recognizeSynonyms(lexical("delicious"), [lexical("yummy")], fakeConfig(run), { ...options(), timeoutMs: 100_000 });
    await vi.advanceTimersByTimeAsync(12_001);
    expect(await task).toMatchObject({ status: "pending", matches: [] });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("applies one shared 25-second deadline across sequential batches", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const run = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({ matches: [] }), 10_000)));
    const candidates = Array.from({ length: 181 }, (_, index) => lexical(`candidate${index}`));
    const opts = { ...options(), timeoutMs: 100_000 };
    const task = recognizeSynonyms(lexical("delicious"), candidates, fakeConfig(run), opts);
    await vi.advanceTimersByTimeAsync(25_001);
    const result = await task;
    expect(result).toMatchObject({ status: "pending", matches: [], candidateCount: 181 });
    expect(Date.now() - start).toBe(25_001);
    expect(run).toHaveBeenCalledTimes(3);
    expect(opts.consumeBudget).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not launch a model after a timed-out budget allocation later resolves", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const run = vi.fn();
    const task = recognizeSynonyms(lexical("delicious"), [lexical("yummy")], fakeConfig(run), {
      timeoutMs: 30, consumeBudget: () => new Promise<void>((resolve) => { finish = resolve; })
    });
    await vi.advanceTimersByTimeAsync(31);
    expect(await task).toMatchObject({ status: "pending", matches: [] });
    finish!();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("resumes after a later-batch timeout without rechecking or charging for the completed first batch", async () => {
    vi.useFakeTimers();
    const source = lexical("delicious");
    const candidates = Array.from({ length: 61 }, (_, index) => lexical(`candidate-${index.toString().padStart(3, "0")}`));
    const cache = new Map<string, SynonymScan["matches"]>();
    const successful = async (_model: string, input: { messages: Array<{ content: string }> }) => ({
      matches: [{ targetId: JSON.parse(input.messages[1].content).candidates[0].id, note }]
    });
    const run = vi.fn().mockImplementationOnce(successful)
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementationOnce(successful);
    const opts = {
      ...options(),
      readBatchCache: vi.fn(async (key: string) => cache.get(key) ?? null),
      writeBatchCache: vi.fn(async (key: string, matches: SynonymScan["matches"]) => { cache.set(key, matches); })
    };
    const firstTask = recognizeSynonyms(source, candidates, fakeConfig(run), opts);
    await vi.advanceTimersByTimeAsync(12_001);
    expect(await firstTask).toMatchObject({ status: "pending", matches: [] });
    expect(cache.size).toBe(1);
    expect(opts.consumeBudget).toHaveBeenCalledTimes(2);
    const firstKey = [...cache.keys()][0];
    expect(firstKey).toBe(`synonym-batch:v1:@cf/zai-org/glm-4.7-flash:${entrySynonymFingerprint(source)}:${candidateSynonymFingerprint(candidates.slice(0, 60))}`);
    const result = await recognizeSynonyms(source, [...candidates].reverse(), fakeConfig(run), opts);
    expect(result.status).toBe("complete");
    expect(result.matches.map((match) => match.targetId)).toEqual([candidates[0].id, candidates[60].id]);
    expect(run).toHaveBeenCalledTimes(3);
    expect(opts.consumeBudget).toHaveBeenCalledTimes(3);
    expect(cache.size).toBe(2);
  });

  it("reuses a completed empty batch without an AI binding or any budget allocation", async () => {
    const opts = { ...options(), readBatchCache: vi.fn(async () => []), writeBatchCache: vi.fn(async () => undefined) };
    const result = await recognizeSynonyms(lexical("delicious"), [lexical("yummy")], { AI_PROVIDER: "cloudflare" } as AppConfig, opts);
    expect(result).toMatchObject({ status: "complete", matches: [] });
    expect(opts.consumeBudget).not.toHaveBeenCalled();
    expect(opts.writeBatchCache).not.toHaveBeenCalled();
  });

  it("accepts a validated cached positive relation without changing its saved objects", async () => {
    const target = lexical("yummy");
    const cached = [{ targetId: target.id, targetFingerprint: entrySynonymFingerprint(target), note }];
    Object.freeze(cached[0]);
    Object.freeze(cached);
    const run = vi.fn();
    const opts = { ...options(), readBatchCache: async () => cached };
    const result = await recognizeSynonyms(lexical("delicious"), [target], fakeConfig(run), opts);
    expect(result).toMatchObject({ status: "complete", matches: cached });
    expect(result.matches).not.toBe(cached);
    expect(result.matches[0]).not.toBe(cached[0]);
    expect(run).not.toHaveBeenCalled();
    expect(opts.consumeBudget).not.toHaveBeenCalled();
  });

  it.each([
    { invalid: [{ targetId: "uncollected", targetFingerprint: "s1:00000000", note }] },
    { invalid: [{ targetId: "word-yummy", targetFingerprint: "s1:00000000", note }] },
    { invalid: [{ targetId: "word-yummy", targetFingerprint: entrySynonymFingerprint(lexical("yummy")), note: "not a Chinese sense note" }] },
    { invalid: [{ targetId: "word-yummy", targetFingerprint: entrySynonymFingerprint(lexical("yummy")), note: "<script>中文</script>" }] },
    { invalid: [{ targetId: "word-yummy", targetFingerprint: entrySynonymFingerprint(lexical("yummy")), note, extra: true }] },
    { invalid: Array.from({ length: 2 }, () => ({ targetId: "word-yummy", targetFingerprint: entrySynonymFingerprint(lexical("yummy")), note })) },
    { invalid: { matches: [] } }
  ])("treats invalid, stale or unknown cached results as a miss %#", async ({ invalid }) => {
    const run = vi.fn(async () => ({ matches: [] }));
    const opts = { ...options(), readBatchCache: async () => invalid as SynonymScan["matches"] };
    const result = await recognizeSynonyms(lexical("delicious"), [lexical("yummy")], fakeConfig(run), opts);
    expect(result).toMatchObject({ status: "complete", matches: [] });
    expect(run).toHaveBeenCalledTimes(1);
    expect(opts.consumeBudget).toHaveBeenCalledTimes(1);
  });

  it("ignores cache read/write outages and preserves a valid model answer", async () => {
    const target = lexical("yummy");
    const run = vi.fn(async () => ({ matches: [{ targetId: target.id, note }] }));
    const opts = {
      ...options(),
      readBatchCache: async () => { throw new Error("storage unavailable"); },
      writeBatchCache: async () => { throw new Error("storage unavailable"); }
    };
    const result = await recognizeSynonyms(lexical("delicious"), [target], fakeConfig(run), opts);
    expect(result).toMatchObject({ status: "complete", matches: [{ targetId: target.id }] });
    expect(opts.consumeBudget).toHaveBeenCalledTimes(1);
  });

  it("changes the private cache key when source or candidate semantics change", async () => {
    const source = lexical("delicious");
    const target = lexical("palatable");
    const run = vi.fn(async () => ({ matches: [] }));
    const read = vi.fn(async (_key: string) => null);
    const opts = { ...options(), readBatchCache: read };
    await recognizeSynonyms(source, [target], fakeConfig(run), opts);
    await recognizeSynonyms({ ...source, meaning: "令人愉快的" }, [target], fakeConfig(run), opts);
    await recognizeSynonyms(source, [{ ...target, meaning: "可接受的；令人能接受的" }], fakeConfig(run), opts);
    expect(new Set(read.mock.calls.map(([key]) => key)).size).toBe(3);
  });
});
