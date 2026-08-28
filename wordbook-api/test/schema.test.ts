import { describe, expect, it } from "vitest";
import {
  AiOrganizedSchema,
  PublicEntrySchema,
  classifyInput,
  makeEntryFromAi,
  normalizeEnglish,
  safeHttpsUrl,
  validateSnapshot
} from "../src/schema";
import { entry, snapshot } from "./fixtures";

describe("wordbook schema", () => {
  it("normalizes smart punctuation and whitespace without destroying the phrase", () => {
    expect(normalizeEnglish("  Jab   at  ")).toBe("jab at");
    expect(normalizeEnglish("Don’t—panic")).toBe("don't-panic");
  });

  it("classifies jab at as a whole phrase", () => {
    expect(classifyInput("jab at")).toBe("phrase");
  });

  it("keeps a spelling suggestion separate from the original input", () => {
    const organized = AiOrganizedSchema.parse({
      suggestedTerm: "receive", standardForm: "receive", entryType: "word", phonetic: "/rɪˈsiːv/", partOfSpeech: "verb",
      meaning: "收到；接收", definition: "To get or be given something.", senses: [], collocations: [], exampleEn: "I received the letter.",
      exampleZh: "我收到了信。", usage: "", register: "neutral", confusedWith: ["receipt"], forms: ["received", "receiving"],
      tags: ["常用词"], author: "", sourceTitle: "", sourceWork: "", sourceDate: "", attributionNote: ""
    });
    const result = makeEntryFromAi("recieve", organized, "openai", []);
    expect(result.term).toBe("recieve");
    expect(result.originalInput).toBe("recieve");
    expect(result.correction).toMatchObject({ status: "suggested", original: "recieve", suggestion: "receive", chosen: "recieve" });
  });

  it("rejects private-network and javascript source URLs", () => {
    expect(() => safeHttpsUrl("javascript:alert(1)")).toThrow();
    expect(() => safeHttpsUrl("https://127.0.0.1/source")).toThrow();
    expect(safeHttpsUrl("https://example.edu/source#section")).toBe("https://example.edu/source");
  });

  it("strictly rejects unknown entry fields", () => {
    expect(() => PublicEntrySchema.parse({ ...entry(), html: "<img onerror=alert(1)>" })).toThrow();
  });

  it("requires non-Wikiquote evidence before marking attribution verified", () => {
    const base = entry({
      entryType: "quote", term: "Knowledge is power.", normalized: "knowledge is power.", standardForm: "Knowledge is power.",
      sourceTitle: "Wikiquote", sourceUrl: "https://en.wikiquote.org/wiki/Francis_Bacon", attributionStatus: "verified", attributionNote: "checked"
    });
    expect(() => PublicEntrySchema.parse(base)).toThrow(/Wikiquote/);
  });

  it("migrates a legacy v2 snapshot without splitting jab at", () => {
    const migrated = validateSnapshot({
      schemaVersion: 2,
      updatedAt: "2026-08-27T00:00:00.000Z",
      entries: [{
        id: "public-jab-at", term: "jab at", normalized: "jab at", headword: "jab", entryType: "phrase",
        meaning: "猛戳；挖苦", definition: "To jab toward.", forms: [], tags: [], sources: [],
        createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z"
      }]
    });
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.entries[0]).toMatchObject({ term: "jab at", standardForm: "jab at", entryType: "phrase" });
  });

  it("rejects schema version zero and future versions", () => {
    expect(() => validateSnapshot({ schemaVersion: 0, entries: [] })).toThrow();
    expect(() => validateSnapshot({ schemaVersion: 99, entries: [] })).toThrow();
  });

  it("rejects duplicate spelling aliases", () => {
    const receive = entry({ id: "receive", term: "receive", normalized: "receive", standardForm: "receive" });
    const typo = entry({
      id: "typo", originalInput: "recieve", term: "receive", normalized: "receive", standardForm: "receive",
      correction: { status: "accepted", original: "recieve", suggestion: "receive", chosen: "receive", confidence: .99, source: "test" }
    });
    expect(() => validateSnapshot(snapshot([receive, typo]))).toThrow(/重复词条/);
  });

  it("does not treat empty correction aliases as duplicate terms", () => {
    const alpha = entry({
      id: "alpha", term: "alpha", entryType: "word",
      correction: { status: "kept", original: "alpha", suggestion: "", chosen: "alpha", confidence: 1, source: "manual" }
    });
    const beta = entry({
      id: "beta", term: "beta", entryType: "word",
      correction: { status: "kept", original: "beta", suggestion: "", chosen: "beta", confidence: 1, source: "manual" }
    });
    expect(validateSnapshot(snapshot([alpha, beta])).entries).toHaveLength(2);
  });

  it("rejects contradictory correction decisions", () => {
    expect(() => PublicEntrySchema.parse(entry({
      correction: { status: "exact", original: "jab at", suggestion: "jab", chosen: "jab at", confidence: 1, source: "test" }
    }))).toThrow(/exact correction/);
    expect(() => PublicEntrySchema.parse(entry({
      correction: { status: "suggested", original: "recieve", suggestion: "receive", chosen: "receive", confidence: .9, source: "test" }
    }))).toThrow(/suggested correction/);
    expect(() => PublicEntrySchema.parse(entry({
      term: "recieve", correction: { status: "accepted", original: "recieve", suggestion: "receive", chosen: "recieve", confidence: .9, source: "test" }
    }))).toThrow(/accepted correction/);
  });

  it("rejects a candidate author without a reviewable citation", () => {
    expect(() => PublicEntrySchema.parse(entry({
      entryType: "quote", author: "Unverified Person", attributionStatus: "candidate", sources: [], sourceUrl: ""
    }))).toThrow(/candidate author requires/);
  });
});
