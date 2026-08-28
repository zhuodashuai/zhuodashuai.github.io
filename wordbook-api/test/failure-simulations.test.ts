import { afterEach, describe, expect, it, vi } from "vitest";
import { organizeEntry } from "../src/ai";
import type { AppConfig } from "../src/config";
import { readRemoteWordbook, verifyOwnerAndRepository } from "../src/github";

const config: AppConfig = {
  PUBLIC_SITE_URL: "https://zhuodashuai.github.io/vocab/",
  GITHUB_OWNER: "zhuodashuai",
  GITHUB_OWNER_ID: 156042078,
  GITHUB_REPOSITORY: "zhuodashuai.github.io",
  GITHUB_REPOSITORY_ID: 1309360291,
  GITHUB_BRANCH: "main",
  GITHUB_WORDBOOK_PATH: "vocab/data/owner-wordbook.json",
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "sk-test-not-real-000000000000",
  OPENAI_MODEL: "gpt-5.6-terra"
};

function organized(overrides: Record<string, unknown> = {}) {
  return {
    suggestedTerm: "receive",
    standardForm: "receive",
    entryType: "word",
    phonetic: "/rɪˈsiːv/",
    partOfSpeech: "verb",
    meaning: "收到；接收",
    definition: "To get or be given something.",
    senses: [{
      partOfSpeech: "verb",
      meaningZh: "收到；接收",
      definitionEn: "To get or be given something.",
      usageNotes: "Often used for things, messages, or visitors.",
      register: "neutral",
      collocations: ["receive a letter"],
      examples: [{ en: "I received the letter.", zh: "我收到了这封信。" }],
      confusables: ["receipt"]
    }],
    collocations: ["receive a letter"],
    exampleEn: "I received the letter.",
    exampleZh: "我收到了这封信。",
    usage: "Do not confuse it with receipt.",
    register: "neutral",
    confusedWith: ["receipt"],
    forms: ["received", "receiving"],
    tags: ["常用词"],
    author: "",
    sourceTitle: "",
    sourceWork: "",
    sourceDate: "",
    attributionNote: "",
    ...overrides
  };
}

function providerResponse(output: unknown): Response {
  return Response.json({
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }]
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AI provider failure simulations", () => {
  it("maps a timeout/network rejection to a retryable safe failure without a second request", async () => {
    const mock = vi.fn(async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", mock);

    await expect(organizeEntry("receive", config)).rejects.toMatchObject({
      status: 503,
      code: "ai_unreachable"
    });
    expect(mock).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 401, expectedStatus: 503, code: "ai_error" },
    { status: 429, expectedStatus: 429, code: "ai_rate_limited" },
    { status: 500, expectedStatus: 503, code: "ai_error" }
  ])("maps HTTP $status without accepting an error body as an entry", async ({ status, expectedStatus, code }) => {
    const mock = vi.fn(async () => new Response("provider error", {
      status,
      headers: { "Content-Type": "text/plain" }
    }));
    vi.stubGlobal("fetch", mock);

    await expect(organizeEntry("receive", config)).rejects.toMatchObject({
      status: expectedStatus,
      code
    });
    expect(mock).toHaveBeenCalledOnce();
  });

  it("rejects two consecutive non-JSON success responses after one repair attempt", async () => {
    const mock = vi.fn(async () => Response.json({
      output: [{ type: "message", content: [{ type: "output_text", text: "not JSON", annotations: [] }] }]
    }));
    vi.stubGlobal("fetch", mock);

    await expect(organizeEntry("receive", config)).rejects.toMatchObject({
      status: 502,
      code: "ai_invalid_output"
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing a required field", (() => {
      const value = organized();
      delete (value as Record<string, unknown>).meaning;
      return value;
    })()],
    ["returning a wrong field type", organized({ senses: "not-an-array" })]
  ])("rejects provider output %s instead of creating a partial entry", async (_label, invalid) => {
    const mock = vi.fn(async () => providerResponse(invalid));
    vi.stubGlobal("fetch", mock);

    await expect(organizeEntry("receive", config)).rejects.toMatchObject({
      status: 502,
      code: "ai_invalid_output"
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate senses instead of publishing repeated content", async () => {
    const duplicateSense = {
      partOfSpeech: "noun",
      meaningZh: "髋部；髋关节",
      definitionEn: "The joint or side of the body between the waist and upper leg.",
      usageNotes: "Common anatomical meaning.",
      register: "neutral",
      collocations: ["hip joint"],
      examples: [{ en: "She injured her hip while running.", zh: "她跑步时伤了髋部。" }],
      confusables: []
    };
    const mock = vi.fn(async () => providerResponse(organized({
      suggestedTerm: "hip",
      standardForm: "hip",
      phonetic: "/hɪp/",
      senses: [duplicateSense, structuredClone(duplicateSense)]
    })));
    vi.stubGlobal("fetch", mock);

    await expect(organizeEntry("hip", config)).rejects.toMatchObject({
      status: 502,
      code: "ai_invalid_output"
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("rejects Latin-dominant garbage in a Chinese sense or example instead of repeating the old translation bug", async () => {
    const baseSense = (organized().senses as Array<Record<string, unknown>>)[0];
    const contaminated = [
      organized({ senses: [{ ...baseSense, meaningZh: "kamus在线bm ke bi" }] }),
      organized({ senses: [{ ...baseSense, examples: [{ en: "I received the letter.", zh: "machine translation output" }] }] })
    ];
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);

    for (const candidate of contaminated) {
      mock.mockReset();
      mock.mockResolvedValue(providerResponse(candidate));
      await expect(organizeEntry("receive", config)).rejects.toMatchObject({ status: 502, code: "ai_invalid_output" });
      expect(mock).toHaveBeenCalledTimes(2);
    }
  });

  it("rejects an obviously invalid IPA field and a lexical sense without paired examples", async () => {
    const withoutExamples = {
      partOfSpeech: "noun",
      meaningZh: "髋部；髋关节",
      definitionEn: "The joint or side of the body between the waist and upper leg.",
      usageNotes: "Common anatomical meaning.",
      register: "neutral",
      collocations: ["hip joint"],
      examples: [],
      confusables: []
    };
    const invalidValues = [
      organized({ suggestedTerm: "hip", standardForm: "hip", phonetic: "hip" }),
      organized({ suggestedTerm: "hip", standardForm: "hip", phonetic: "/hɪp/", senses: [withoutExamples] })
    ];
    const mock = vi.fn()
      .mockResolvedValueOnce(providerResponse(invalidValues[0]))
      .mockResolvedValueOnce(providerResponse(invalidValues[0]));
    vi.stubGlobal("fetch", mock);
    await expect(organizeEntry("hip", config)).rejects.toMatchObject({ status: 502, code: "ai_invalid_output" });

    mock.mockReset();
    mock.mockResolvedValue(providerResponse(invalidValues[1]));
    await expect(organizeEntry("hip", config)).rejects.toMatchObject({ status: 502, code: "ai_invalid_output" });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("locks the complete hip regression: correct IPA, noun first, adjective separated, and bilingual examples", async () => {
    const nounSense = {
      partOfSpeech: "noun",
      meaningZh: "髋部；髋关节；臀部两侧",
      definitionEn: "Either side of the body below the waist, including the joint connecting the leg and pelvis.",
      usageNotes: "The common anatomical meaning comes first.",
      register: "neutral",
      collocations: ["hip joint"],
      examples: [{ en: "She injured her hip while running.", zh: "她跑步时伤了髋部。" }],
      confusables: []
    };
    const adjectiveSense = {
      partOfSpeech: "adjective",
      meaningZh: "时髦的；了解最新潮流的",
      definitionEn: "Fashionable or aware of the newest ideas and trends.",
      usageNotes: "Informal.",
      register: "informal",
      collocations: ["hip café"],
      examples: [{ en: "The neighbourhood is full of hip cafés.", zh: "这个街区到处都是时髦的咖啡馆。" }],
      confusables: []
    };
    const mock = vi.fn(async () => providerResponse(organized({
      suggestedTerm: "hip",
      standardForm: "hip",
      entryType: "word",
      phonetic: "/hɪp/",
      partOfSpeech: "verb",
      meaning: "kamus在线bm ke bi",
      definition: "To bump with one's hips.",
      senses: [nounSense, adjectiveSense],
      exampleEn: "",
      exampleZh: ""
    })));
    vi.stubGlobal("fetch", mock);

    const result = await organizeEntry("hip", config);
    expect(result.entry).toMatchObject({
      term: "hip",
      originalInput: "hip",
      phonetic: "/hɪp/",
      partOfSpeech: "noun · adjective"
    });
    expect(result.entry.correction).toMatchObject({ status: "exact", suggestion: "", chosen: "hip" });
    expect(result.entry.meaning).toMatch(/noun：.*髋部/);
    expect(result.entry.meaning).toMatch(/adjective：.*时髦/);
    expect(result.entry.meaning).not.toMatch(/kamus|ke bi/i);
    expect(result.entry.definition).not.toMatch(/bump with one's hips/i);
    expect(result.entry.senses).toHaveLength(2);
    expect(result.entry.senses[0]).toMatchObject({ partOfSpeech: "noun", examples: [nounSense.examples[0]] });
    expect(result.entry.senses[1]).toMatchObject({ partOfSpeech: "adjective", register: "informal", examples: [adjectiveSense.examples[0]] });
    expect(result.entry.senses.every((sense) => sense.examples.every((example) => example.en && example.zh))).toBe(true);
    expect(mock).toHaveBeenCalledOnce();
  });
});

describe("GitHub transport failure simulations", () => {
  it("maps a GitHub timeout to github_unreachable before parsing or publishing", async () => {
    const mock = vi.fn(async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", mock);

    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({
      status: 502,
      code: "github_unreachable"
    });
    expect(mock).toHaveBeenCalledOnce();
  });

  it("classifies GitHub 500 as retry-later and never treats its body as identity data", async () => {
    const mock = vi.fn(async () => Response.json({ message: "temporary outage" }, { status: 500 }));
    vi.stubGlobal("fetch", mock);

    await expect(verifyOwnerAndRepository("test-token", config)).rejects.toMatchObject({
      status: 503,
      code: "github_retry_later"
    });
    expect(mock).toHaveBeenCalledOnce();
  });

  it("stops on malformed remote JSON rather than replacing it with a fresh snapshot", async () => {
    const content = btoa("{ definitely not valid JSON");
    const mock = vi.fn(async () => Response.json({
      type: "file",
      sha: "a".repeat(40),
      html_url: "https://github.com/zhuodashuai/zhuodashuai.github.io/blob/main/vocab/data/owner-wordbook.json",
      content
    }));
    vi.stubGlobal("fetch", mock);

    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({
      status: 409,
      code: "invalid_remote_snapshot"
    });
  });
});
