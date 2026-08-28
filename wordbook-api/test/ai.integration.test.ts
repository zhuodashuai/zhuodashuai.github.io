import { afterEach, describe, expect, it, vi } from "vitest";
import { organizeEntry } from "../src/ai";
import type { AppConfig } from "../src/config";

const config: AppConfig = {
  PUBLIC_SITE_URL: "https://zhuodashuai.github.io/vocab/",
  GITHUB_OWNER: "zhuodashuai", GITHUB_OWNER_ID: 156042078, GITHUB_REPOSITORY: "zhuodashuai.github.io", GITHUB_REPOSITORY_ID: 1309360291,
  GITHUB_BRANCH: "main", GITHUB_WORDBOOK_PATH: "vocab/data/owner-wordbook.json", AI_PROVIDER: "openai",
  OPENAI_API_KEY: "sk-test-not-real-000000000000", OPENAI_MODEL: "gpt-5.6-terra"
};

function organized(overrides: Record<string, unknown> = {}) {
  return {
    suggestedTerm: "receive", standardForm: "receive", entryType: "word", phonetic: "/rɪˈsiːv/", partOfSpeech: "verb",
    meaning: "收到；接收", definition: "To get or be given something.", senses: [{
      partOfSpeech: "verb", meaningZh: "收到；接收", definitionEn: "To get or be given something.",
      usageNotes: "Often used for things, messages, or visitors.", register: "neutral", collocations: ["receive a letter"],
      examples: [{ en: "I received the letter.", zh: "我收到了这封信。" }], confusables: ["receipt"]
    }], collocations: ["receive a letter"],
    exampleEn: "I received the letter.", exampleZh: "我收到了这封信。", usage: "Do not confuse it with receipt.", register: "neutral",
    confusedWith: ["receipt"], forms: ["received", "receiving"], tags: ["常用词"], author: "", sourceTitle: "", sourceWork: "",
    sourceDate: "", attributionNote: "", ...overrides
  };
}

function response(output: Record<string, unknown>, annotations: unknown[] = []) {
  return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output), annotations }] }] });
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("AI organizer", () => {
  it("enables English web search for a single word so dictionary evidence can be cross-checked", async () => {
    const mock = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.tools).toEqual([{ type: "web_search", filters: { allowed_domains: [
        "dictionary.cambridge.org",
        "www.oxfordlearnersdictionaries.com",
        "www.merriam-webster.com",
        "www.collinsdictionary.com"
      ] } }]);
      expect(body.tool_choice).toBe("required");
      expect(body.max_tool_calls).toBe(4);
      expect(body.include).toEqual(["web_search_call.action.sources"]);
      expect(body.instructions).toMatch(/at least two independent authoritative English dictionaries/i);
      return response(organized());
    });
    vi.stubGlobal("fetch", mock);
    const result = await organizeEntry("receive", config);
    expect(result.entry.term).toBe("receive");
    expect(mock).toHaveBeenCalledOnce();
  });

  it("returns recieve as an explicit suggestion without overwriting the original", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(organized())));
    const result = await organizeEntry("recieve", config);
    expect(result.entry).toMatchObject({ term: "recieve", originalInput: "recieve", standardForm: "receive" });
    expect(result.entry.correction).toMatchObject({ status: "suggested", suggestion: "receive", chosen: "recieve" });
  });

  it("forces jab at to remain a whole phrase even when the provider mislabels it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(organized({ suggestedTerm: "jab", standardForm: "jab", entryType: "word", meaning: "猛戳；挖苦" }))));
    const result = await organizeEntry("jab at", config);
    expect(result.entry).toMatchObject({ term: "jab at", standardForm: "jab at", entryType: "phrase" });
    expect(result.entry.correction).toMatchObject({ status: "exact", suggestion: "", chosen: "jab at" });
  });

  it("prevents any multiword expression from collapsing to one headword", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(organized({ suggestedTerm: "look", standardForm: "look", entryType: "word" }))));
    const result = await organizeEntry("look after", config);
    expect(result.entry).toMatchObject({ term: "look after", standardForm: "look after", entryType: "phrase" });
    expect(result.entry.correction).toMatchObject({ status: "exact", suggestion: "", chosen: "look after" });
  });

  it("retries one malformed JSON result and validates the repaired object", async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(Response.json({ output: [{ content: [{ text: "not-json", annotations: [] }] }] }))
      .mockResolvedValueOnce(response(organized()));
    vi.stubGlobal("fetch", mock);
    const result = await organizeEntry("receive", config);
    expect(result.entry.meaning).toContain("收到");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("fails safely when the provider is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "server_error" } }, { status: 500 })));
    await expect(organizeEntry("receive", config)).rejects.toMatchObject({ status: 503, code: "ai_error" });
  });

  it("falls back from OpenAI to Claude and gives Claude the same structured schema contract", async () => {
    const fallbackConfig: AppConfig = {
      ...config,
      AI_FALLBACK_PROVIDER: "anthropic",
      ALLOW_PAID_AI_FALLBACK: "true",
      ANTHROPIC_API_KEY: "test-anthropic-key-not-real-000000000000",
      ANTHROPIC_MODEL: "claude-test-model"
    };
    const mock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes("api.openai.com")) {
        return Response.json({ error: { code: "server_error" } }, { status: 500 });
      }
      expect(url).toContain("api.anthropic.com/v1/messages");
      const body = JSON.parse(String(init?.body));
      expect(body.output_config.format.type).toBe("json_schema");
      expect(body.output_config.format.schema.required).toContain("senses");
      expect(JSON.stringify(body.output_config.format.schema)).not.toContain("maxLength");
      return Response.json({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(organized()) }]
      });
    });
    vi.stubGlobal("fetch", mock);

    const result = await organizeEntry("receive", fallbackConfig);
    expect(result.provider).toBe("anthropic");
    expect(result.entry.organizationMethod).toBe("ai-anthropic");
    expect(result.warnings.join(" ")).toMatch(/OpenAI.*Claude.*备用引擎/);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("uses the configured Claude fallback when the OpenAI secret is not present", async () => {
    const fallbackOnly: AppConfig = {
      ...config,
      OPENAI_API_KEY: undefined,
      AI_FALLBACK_PROVIDER: "anthropic",
      ALLOW_PAID_AI_FALLBACK: "true",
      ANTHROPIC_API_KEY: "test-anthropic-key-not-real-000000000000",
      ANTHROPIC_MODEL: "claude-test-model"
    };
    const mock = vi.fn(async (input) => {
      expect(String(input)).toContain("api.anthropic.com/v1/messages");
      return Response.json({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(organized()) }]
      });
    });
    vi.stubGlobal("fetch", mock);

    const result = await organizeEntry("receive", fallbackOnly);
    expect(result.provider).toBe("anthropic");
    expect(mock).toHaveBeenCalledOnce();
  });

  it("does not publish remembered quote attribution without a web citation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(organized({
      suggestedTerm: "Knowledge is power.", standardForm: "Knowledge is power.", entryType: "quote", meaning: "知识就是力量。",
      author: "Francis Bacon", sourceTitle: "Meditationes Sacrae", sourceWork: "Essay", sourceDate: "1597", attributionNote: "from memory"
    }))));
    const result = await organizeEntry("Knowledge is power.", config);
    expect(result.entry).toMatchObject({ attributionStatus: "unverified", author: "", sourceTitle: "", sourceUrl: "" });
    expect(result.warnings.join(" ")).toContain("未找到可核验出处");
  });

  it("uses English web search citations only as candidate evidence", async () => {
    const mock = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.tools).toEqual([{ type: "web_search" }]);
      expect(body.tool_choice).toBe("required");
      return response(organized({
        suggestedTerm: "Knowledge is power.", standardForm: "Knowledge is power.", entryType: "quote", meaning: "知识就是力量。",
        author: "Francis Bacon", sourceTitle: "Meditationes Sacrae", sourceWork: "Meditationes Sacrae", sourceDate: "1597", attributionNote: "candidate found"
      }), [{ type: "url_citation", title: "Authoritative archive", url: "https://example.edu/bacon" }]);
    });
    vi.stubGlobal("fetch", mock);
    const result = await organizeEntry("Knowledge is power.", config);
    expect(result.entry).toMatchObject({ attributionStatus: "candidate", author: "Francis Bacon", sourceUrl: "https://example.edu/bacon" });
    expect(result.entry.sources[0]).toMatchObject({ kind: "candidate", url: "https://example.edu/bacon" });
  });

  it("enables web search for a short unpunctuated quotation or proverb", async () => {
    const mock = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.tools).toEqual([{ type: "web_search" }]);
      expect(body.tool_choice).toBe("required");
      return response(organized({
        suggestedTerm: "Knowledge is power", standardForm: "Knowledge is power", entryType: "quote", meaning: "知识就是力量。"
      }));
    });
    vi.stubGlobal("fetch", mock);
    const result = await organizeEntry("Knowledge is power", config);
    expect(result.entry.entryType).toBe("quote");
    expect(mock).toHaveBeenCalledOnce();
  });

  it("records sources returned by the web-search action even when the text annotation omits them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      output: [
        { type: "web_search_call", action: { type: "search", sources: [
          { title: "Cambridge Dictionary", url: "https://dictionary.cambridge.org/dictionary/english/receive" },
          { title: "Merriam-Webster", url: "https://www.merriam-webster.com/dictionary/receive" }
        ] } },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify(organized()), annotations: [] }] }
      ]
    })));
    const result = await organizeEntry("receive", config);
    expect(result.entry.sources).toHaveLength(2);
    expect(result.warnings.join(" ")).not.toContain("不足 2 个");
  });
});
