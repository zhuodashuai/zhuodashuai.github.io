import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFreeAttribution, lookupFreeAttribution, mayNeedFreeAttributionLookup, type FreeAttributionEvidence } from "../src/attribution";
import { organizeEntry } from "../src/ai";
import type { AppConfig } from "../src/config";
import type { AiOrganized } from "../src/schema";
import { entry } from "./fixtures";

const QUOTE = "This above all: to thine own self be true.";
const MATCHED_SNIPPET = 'friend. <span class="searchmatch">This</span> <span class="searchmatch">above</span> <span class="searchmatch">all</span>: <span class="searchmatch">to</span> <span class="searchmatch">thine</span> <span class="searchmatch">own</span> <span class="searchmatch">self</span> <span class="searchmatch">be</span> <span class="searchmatch">true</span>;';

function wikimediaFetch({ primary = true, quoteHits = true } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    expect(headers.get("user-agent")).toContain("ZhuoWordbook/");
    expect(headers.get("api-user-agent")).toContain("ZhuoWordbook/");
    const url = new URL(String(input));
    const action = url.searchParams.get("action");
    if (url.hostname === "en.wikiquote.org" && action === "query" && url.searchParams.get("list") === "search") {
      return Response.json({ query: { search: quoteHits ? [
        { ns: 0, title: "Self", snippet: MATCHED_SNIPPET },
        { ns: 0, title: "Hamlet", snippet: MATCHED_SNIPPET }
      ] : [] } });
    }
    if (url.hostname === "en.wikisource.org" && action === "query") {
      return Response.json({ query: { search: quoteHits ? [
        { ns: 0, title: "Poems That Every Child Should Know/Polonius' Advice", snippet: MATCHED_SNIPPET },
        ...(primary ? [
          { ns: 0, title: "Hamlet (1917) Yale/Text/Act I", snippet: MATCHED_SNIPPET },
          { ns: 104, title: "Page:Hamlet - The Arden Shakespeare - 1899.djvu/66", snippet: MATCHED_SNIPPET }
        ] : [])
      ] : [] } });
    }
    if (url.hostname === "en.wikiquote.org" && url.searchParams.get("prop") === "info|pageprops") {
      return Response.json({ query: { pages: [
        { title: "Self", fullurl: "https://en.wikiquote.org/wiki/Self", pageprops: { wikibase_item: "Q164777" } },
        { title: "Hamlet", fullurl: "https://en.wikiquote.org/wiki/Hamlet", pageprops: { wikibase_item: "Q41567" } }
      ] } });
    }
    if (url.hostname === "www.wikidata.org" && url.searchParams.get("ids")?.includes("Q41567")) {
      return Response.json({ entities: {
        Q164777: { id: "Q164777", labels: { en: { value: "self" } }, claims: {} },
        Q41567: {
          id: "Q41567",
          labels: { en: { value: "Hamlet" } },
          claims: {
            P50: [{ rank: "normal", mainsnak: { datavalue: { value: { id: "Q692" } } } }],
            P577: [
              { rank: "normal", mainsnak: { datavalue: { value: { time: "+1602-00-00T00:00:00Z" } } } },
              { rank: "normal", mainsnak: { datavalue: { value: { time: "+1623-00-00T00:00:00Z" } } } }
            ]
          }
        }
      } });
    }
    if (url.hostname === "www.wikidata.org" && url.searchParams.get("ids") === "Q692") {
      return Response.json({ entities: { Q692: { id: "Q692", labels: { en: { value: "William Shakespeare" } } } } });
    }
    throw new Error(`Unexpected Wikimedia request: ${url.href}`);
  });
}

function quoteOrganized(): AiOrganized {
  return {
    suggestedTerm: QUOTE,
    standardForm: QUOTE,
    entryType: "quote",
    phonetic: "",
    partOfSpeech: "sentence",
    meaning: "最重要的是，要忠于自己。",
    definition: "Advice to remain true to one's own character and values.",
    senses: [],
    synonyms: [],
    collocations: [],
    exampleEn: QUOTE,
    exampleZh: "最重要的是，要忠于自己。",
    usage: "A literary maxim about integrity.",
    register: "literary",
    confusedWith: [],
    forms: [],
    tags: ["quotation"],
    author: "",
    sourceTitle: "",
    sourceWork: "",
    sourceDate: "",
    attributionNote: ""
  };
}

function cloudflareConfig(run: (model: string, input: Record<string, unknown>) => Promise<unknown>): AppConfig {
  return {
    AI: { run } as unknown as Ai,
    PUBLIC_SITE_URL: "https://zhuodashuai.github.io/vocab/",
    GITHUB_OWNER: "zhuodashuai",
    GITHUB_OWNER_ID: 156042078,
    GITHUB_REPOSITORY: "zhuodashuai.github.io",
    GITHUB_REPOSITORY_ID: 1309360291,
    GITHUB_BRANCH: "main",
    GITHUB_WORDBOOK_PATH: "vocab/data/owner-wordbook.json",
    AI_PROVIDER: "cloudflare",
    ENABLE_FREE_ATTRIBUTION_LOOKUP: "true"
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("free Wikimedia attribution evidence", () => {
  it("returns a cross-checked Shakespeare candidate after Wikiquote, Wikidata and Wikisource agree", async () => {
    const result = await lookupFreeAttribution(QUOTE, wikimediaFetch() as unknown as typeof fetch);
    expect(result).toMatchObject({
      status: "candidate",
      author: "William Shakespeare",
      sourceWork: "Hamlet",
      sourceDate: "",
      sourceUrl: "https://en.wikisource.org/wiki/Page%3AHamlet_-_The_Arden_Shakespeare_-_1899.djvu/66"
    });
    expect(result?.sources.map((source) => source.kind)).toEqual(["primary", "candidate", "secondary"]);
  });

  it("keeps a Wikiquote and Wikidata-only match at candidate", async () => {
    const result = await lookupFreeAttribution(QUOTE, wikimediaFetch({ primary: false }) as unknown as typeof fetch);
    expect(result).toMatchObject({
      status: "candidate",
      author: "William Shakespeare",
      sourceWork: "Hamlet",
      sourceUrl: "https://en.wikiquote.org/wiki/Hamlet"
    });
    expect(result?.sources.some((source) => source.kind === "primary")).toBe(false);
  });

  it("returns no attribution when the quoted words do not have an exact Wikiquote hit", async () => {
    await expect(lookupFreeAttribution(QUOTE, wikimediaFetch({ quoteHits: false }) as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("checks every word of a long quotation so a genuine prefix cannot hide a fabricated tail", async () => {
    const genuinePrefix = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen";
    const alteredInput = `${genuinePrefix} fabricated ending.`;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("list") === "search") {
        return Response.json({ query: { search: [{ ns: 0, title: "Example", snippet: genuinePrefix }] } });
      }
      throw new Error(`A prefix-only result must not progress past search: ${url.href}`);
    });
    await expect(lookupFreeAttribution(alteredInput, fetcher as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never turns an ordinary phrase into a quotation because it appears on Wikiquote", () => {
    expect(mayNeedFreeAttributionLookup("keep up with the times")).toBe(false);
    const phrase = entry({ term: "keep up with the times", standardForm: "keep up with the times", entryType: "phrase" });
    const evidence: FreeAttributionEvidence = {
      status: "candidate",
      author: "Unrelated Person",
      sourceTitle: "Wikiquote: Unrelated Person",
      sourceWork: "",
      sourceDate: "",
      sourceUrl: "https://en.wikiquote.org/wiki/Unrelated_Person",
      attributionNote: "candidate",
      sources: []
    };
    const result = applyFreeAttribution(phrase, evidence);
    expect(result.entryType).toBe("phrase");
    expect(result.author).toBe("");
    expect(result.sourceUrl).toBe("");
  });

  it("derives quote summaries from a complete aligned sense instead of rejecting a stronger model's blank aggregates", async () => {
    const response = quoteOrganized();
    response.meaning = "";
    response.definition = "";
    response.senses = [{
      partOfSpeech: "quote",
      meaningZh: "最重要的是，要忠于自己。",
      definitionEn: "Advice to remain honest with oneself and one's values.",
      usageNotes: "A literary maxim about personal integrity.",
      register: "literary",
      collocations: [],
      examples: [{ en: QUOTE, zh: "最重要的是，要忠于自己。" }],
      confusables: []
    }];
    const run = vi.fn(async (_model: string, _request: Record<string, unknown>) => ({ response }));
    const result = await organizeEntry(QUOTE, { ...cloudflareConfig(run), ENABLE_FREE_ATTRIBUTION_LOOKUP: undefined });
    expect(result.entry.meaning).toContain("忠于自己");
    expect(result.entry.definition).toContain("honest with oneself");
    expect(run).toHaveBeenCalledOnce();
  });

  it("fills the default Cloudflare organizer result without trusting model memory", async () => {
    vi.stubGlobal("fetch", wikimediaFetch());
    const run = vi.fn(async (_model: string, _request: Record<string, unknown>) => ({ response: {
      ...quoteOrganized(),
      author: "Wrong remembered author",
      sourceTitle: "Invented source",
      sourceWork: "Invented work",
      attributionNote: "from model memory"
    } }));
    const result = await organizeEntry(QUOTE, cloudflareConfig(run));
    expect(run.mock.calls[0]?.[0]).toBe("@cf/zai-org/glm-4.7-flash");
    const request = run.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(request.max_completion_tokens).toBe(1800);
    expect(result.entry).toMatchObject({
      entryType: "quote",
      standardForm: QUOTE,
      correction: { status: "exact", suggestion: "" },
      attributionStatus: "candidate",
      author: "William Shakespeare",
      sourceWork: "Hamlet",
      sourceUrl: "https://en.wikisource.org/wiki/Page%3AHamlet_-_The_Arden_Shakespeare_-_1899.djvu/66"
    });
    expect(result.entry.sourceTitle).toContain("Wikisource: Page:Hamlet");
    expect(result.entry.attributionNote).not.toContain("model memory");
    expect(result.warnings.join(" ")).toContain("自动结果仍为候选");
  });

  it("fails closed on Wikimedia downtime and leaves remembered attribution blank", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network unavailable"); }));
    const run = vi.fn(async () => ({ response: {
      ...quoteOrganized(),
      author: "Wrong remembered author",
      sourceTitle: "Invented source",
      sourceWork: "Invented work"
    } }));
    const result = await organizeEntry(QUOTE, cloudflareConfig(run));
    expect(result.entry).toMatchObject({
      attributionStatus: "unverified",
      author: "",
      sourceTitle: "",
      sourceWork: "",
      sourceUrl: ""
    });
    expect(result.warnings.join(" ")).toContain("Wikimedia 出处检索暂时不可用");
  });
});
