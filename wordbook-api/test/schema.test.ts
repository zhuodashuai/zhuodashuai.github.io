import { describe, expect, it } from "vitest";
import {
  AI_JSON_SCHEMA,
  AiOrganizedSchema,
  PublishRequestSchema,
  PublicEntrySchema,
  classifyInput,
  makeEntryFromAi,
  normalizeEnglish,
  safeHttpsUrl,
  validateAllowedSynonyms,
  validateEnglishInput,
  validateSnapshot
} from "../src/schema";
import { entry, snapshot } from "./fixtures";

describe("wordbook schema", () => {
  it("normalizes smart punctuation and whitespace without destroying the phrase", () => {
    expect(normalizeEnglish("  Jab   at  ")).toBe("jab at");
    expect(normalizeEnglish("Don’t—panic")).toBe("don't-panic");
  });

  it("deduplicates case and ordinary punctuation variants of one lexical item", () => {
    for (const value of ["hip", " Hip ", "HIP", "hip!", '"hip"', "“hip”"]) {
      expect(normalizeEnglish(value)).toBe("hip");
      expect(classifyInput(value)).toBe("word");
    }
    expect(normalizeEnglish("Knowledge is power.")).toBe("knowledge is power.");
    expect(classifyInput("Knowledge is power.")).toBe("quote");
  });

  it("rejects mixed-language markup and JavaScript-like organizer input before AI", () => {
    for (const value of ["hello世界", "<script>alert(1)</script>", "<b>hip</b>", "javascript:alert(1)"]) {
      expect(() => validateEnglishInput(value)).toThrow();
    }
    expect(validateEnglishInput("a")).toBe("a");
    expect(validateEnglishInput("a".repeat(2000))).toHaveLength(2000);
    expect(() => validateEnglishInput("a".repeat(2001))).toThrow();
  });

  it("classifies jab at as a whole phrase", () => {
    expect(classifyInput("jab at")).toBe("phrase");
  });

  it("keeps a spelling suggestion separate from the original input", () => {
    const organized = AiOrganizedSchema.parse({
      suggestedTerm: "receive", standardForm: "receive", entryType: "word", phonetic: "/rɪˈsiːv/", partOfSpeech: "verb",
      meaning: "收到；接收", definition: "To get or be given something.", senses: [], synonyms: ["get", "obtain"], collocations: [], exampleEn: "I received the letter.",
      exampleZh: "我收到了信。", usage: "", register: "neutral", confusedWith: ["receipt"], forms: ["received", "receiving"],
      tags: ["常用词"], author: "", sourceTitle: "", sourceWork: "", sourceDate: "", attributionNote: ""
    });
    const result = makeEntryFromAi("recieve", organized, "openai", []);
    expect(result.term).toBe("recieve");
    expect(result.originalInput).toBe("recieve");
    expect(result.correction).toMatchObject({ status: "suggested", original: "recieve", suggestion: "receive", chosen: "recieve" });
    expect(result.synonyms).toEqual(["get", "obtain"]);
  });

  it("normalizes, bounds and deduplicates the owner-entered synonym allowlist", () => {
    expect(validateAllowedSynonyms(undefined)).toEqual([]);
    expect(validateAllowedSynonyms([" Stylish ", "stylish", "look  after", "Knowledge is power."])).toEqual([
      "Stylish",
      "look after"
    ]);
    expect(() => validateAllowedSynonyms("stylish")).toThrow(/最多 200 项/);
    expect(() => validateAllowedSynonyms(Array.from({ length: 201 }, (_, index) => `word${index}`))).toThrow(/最多 200 项/);
    expect(() => validateAllowedSynonyms(["a".repeat(201)])).toThrow(/超过 200/);
    expect(() => validateAllowedSynonyms(["<b>stylish<\/b>"])).toThrow(/安全的英文内容/);
  });

  it("requires synonyms in strict AI output while defaulting old public entries safely", () => {
    expect(AI_JSON_SCHEMA.required).toContain("synonyms");
    expect(AI_JSON_SCHEMA.properties.synonyms).toMatchObject({ type: "array", maxItems: 20 });
    const organizedBase = {
      suggestedTerm: "receive", standardForm: "receive", entryType: "word" as const, phonetic: "/rɪˈsiːv/", partOfSpeech: "verb",
      meaning: "收到；接收", definition: "To get or be given something.", senses: [], collocations: [], exampleEn: "I received the letter.",
      exampleZh: "我收到了信。", usage: "", register: "neutral", confusedWith: [], forms: [], tags: [], author: "", sourceTitle: "",
      sourceWork: "", sourceDate: "", attributionNote: ""
    };
    expect(AiOrganizedSchema.parse({
      ...organizedBase,
      synonyms: Array.from({ length: 20 }, (_, index) => `synonym-${index + 1}`)
    }).synonyms).toHaveLength(20);
    expect(() => AiOrganizedSchema.parse({
      ...organizedBase,
      synonyms: Array.from({ length: 21 }, (_, index) => `synonym-${index + 1}`)
    })).toThrow();
    const legacyShapedPublicEntry = { ...entry() } as Record<string, unknown>;
    delete legacyShapedPublicEntry.synonyms;
    expect(PublicEntrySchema.parse(legacyShapedPublicEntry).synonyms).toEqual([]);
  });

  it("rejects private-network and javascript source URLs", () => {
    expect(() => safeHttpsUrl("javascript:alert(1)")).toThrow();
    expect(() => safeHttpsUrl("https://127.0.0.1/source")).toThrow();
    expect(safeHttpsUrl("https://example.edu/source#section")).toBe("https://example.edu/source");
  });

  it("strictly rejects unknown entry fields", () => {
    expect(() => PublicEntrySchema.parse({ ...entry(), html: "<img onerror=alert(1)>" })).toThrow();
  });

  it("rejects unsafe, self-repeating, duplicate and misclassified public synonyms", () => {
    expect(() => PublicEntrySchema.parse(entry({ term: "hip", entryType: "word", synonyms: ["HIP"] }))).toThrow(/canonical form/);
    expect(() => PublicEntrySchema.parse(entry({ synonyms: ["Stylish", "stylish"] }))).toThrow(/unique/);
    expect(() => PublicEntrySchema.parse(entry({ synonyms: ["<b>stylish<\/b>"] }))).toThrow(/safe English/);
    expect(() => PublicEntrySchema.parse(entry({ synonyms: ["jabbed at"], forms: ["jabbed at"] }))).toThrow(/form or confused word/);
  });

  it("rejects synonyms on non-lexical writes without affecting deletes", () => {
    const quote = entry({
      id: "quote-with-synonym",
      term: "Knowledge is power.",
      entryType: "quote",
      synonyms: ["Wisdom gives strength"]
    });
    expect(() => PublicEntrySchema.parse(quote)).toThrow(/non-lexical entries/);

    const requestBase = {
      clientProtocol: "v38",
      queueProtocol: "v38",
      baseSha: "a".repeat(40),
      mutationId: "non-lexical-synonym-guard"
    } as const;
    expect(PublishRequestSchema.safeParse({
      ...requestBase,
      mutation: { type: "add", entry: quote }
    }).success).toBe(false);
    expect(PublishRequestSchema.safeParse({
      ...requestBase,
      mutation: { type: "update", entry: quote, expectedUpdatedAt: quote.updatedAt }
    }).success).toBe(false);
    expect(PublishRequestSchema.safeParse({
      ...requestBase,
      mutation: { type: "delete", id: quote.id, expectedUpdatedAt: quote.updatedAt }
    }).success).toBe(true);
  });

  it("requires the v38 client and run-bound queue protocols for every publish", () => {
    const valid = {
      clientProtocol: "v38",
      queueProtocol: "v38",
      baseSha: "a".repeat(40),
      mutationId: "mutation-protocol-v38",
      mutation: { type: "add", entry: entry({ id: "protocol-v38", term: "protocolword", entryType: "word" }) }
    };
    expect(PublishRequestSchema.safeParse(valid).success).toBe(true);
    expect(PublishRequestSchema.safeParse({ ...valid, clientProtocol: "v37" }).success).toBe(false);
    const { queueProtocol: _queueProtocol, ...missingQueueProtocol } = valid;
    expect(PublishRequestSchema.safeParse(missingQueueProtocol).success).toBe(false);
  });

  it("rejects empty, English-echo, Han-free, and suspicious garbage Chinese meanings", () => {
    const request = (meaning: string) => ({
      clientProtocol: "v38",
      queueProtocol: "v38",
      baseSha: "a".repeat(40),
      mutationId: `meaning-guard-${crypto.randomUUID()}`,
      mutation: { type: "add", entry: entry({ id: "meaning-guard", term: "meaningguard", entryType: "word", meaning }) }
    });
    for (const meaning of ["", "   ", "\u200b\u2060", "meaningguard", "English only", "kamus在线bm ke bi"]) {
      expect(PublishRequestSchema.safeParse(request(meaning)).success, JSON.stringify(meaning)).toBe(false);
    }
    expect(PublishRequestSchema.safeParse(request("准确的中文释义")).success).toBe(true);
  });

  it("rejects every review-required publish even when senses are present", () => {
    const candidate = entry({
      id: "review-required",
      tags: ["待复核"],
      senses: [{
        partOfSpeech: "verb",
        meaningZh: "测试",
        definitionEn: "To test something.",
        usageNotes: "",
        register: "neutral",
        collocations: [],
        examples: [{ en: "We test it.", zh: "我们测试它。" }],
        confusables: []
      }]
    });
    const request = {
      clientProtocol: "v38",
      queueProtocol: "v38",
      baseSha: "a".repeat(40),
      mutationId: "review-required-with-sense",
      mutation: { type: "add", entry: candidate }
    };
    expect(PublishRequestSchema.safeParse(request).success).toBe(false);
    expect(PublishRequestSchema.safeParse({
      ...request,
      mutation: { ...request.mutation, entry: { ...candidate, tags: [] } }
    }).success).toBe(true);
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
    expect(migrated.entries[0]).toMatchObject({ term: "jab at", standardForm: "jab at", entryType: "phrase", synonyms: [] });
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

  it("requires every published synonym to reference another real entry term", () => {
    const alleviate = entry({ id: "alleviate", term: "alleviate", entryType: "word" });
    const ease = entry({ id: "ease", term: "ease", entryType: "word", synonyms: ["alleviate"] });
    expect(validateSnapshot(snapshot([alleviate, ease])).entries[1].synonyms).toEqual(["alleviate"]);
    expect(() => validateSnapshot(snapshot([ease]))).toThrow(/尚未发布的同义词引用/);
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
