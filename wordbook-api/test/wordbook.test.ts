import { describe, expect, it } from "vitest";
import { ApiError } from "../src/security";
import { applyPublishMutation, canonicalPartOfSpeech, findDuplicate } from "../src/wordbook";
import { entry, snapshot } from "./fixtures";

const SHA = "a".repeat(40);
const V38_PROTOCOL = { clientProtocol: "v38", queueProtocol: "v38" } as const;

describe("publish mutation planning", () => {
  it("synthesizes one structured sense for a complete manual lexical entry", () => {
    const completeManual = entry({
      id: "complete-manual-word",
      term: "handcraft",
      entryType: "word",
      partOfSpeech: "transitive",
      meaning: "手工制作；亲手完成",
      definition: "To make something carefully by hand.",
      exampleEn: "She handcrafted the wooden frame.",
      exampleZh: "她亲手制作了木制相框。",
      senses: [],
      organizationMethod: "manual",
      tags: []
    });
    const result = applyPublishMutation(snapshot([]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-complete-manual-lexical",
      mutation: { type: "add", entry: completeManual }
    });
    expect(result.entry).toMatchObject({
      partOfSpeech: "verb",
      meaning: "verb：手工制作;亲手完成",
      definition: "verb: To make something carefully by hand.",
      senses: [expect.objectContaining({
        partOfSpeech: "verb",
        meaningZh: "手工制作;亲手完成",
        examples: [{ en: "She handcrafted the wooden frame.", zh: "她亲手制作了木制相框。" }]
      })]
    });
  });

  it("rejects incomplete manual and unstructured AI lexical entries", () => {
    const complete = entry({ id: "incomplete-new-word", term: "incomplete", entryType: "word", senses: [], organizationMethod: "manual", tags: [] });
    for (const overrides of [
      { partOfSpeech: "" }, { partOfSpeech: "noun · adjective" }, { definition: "" },
      { exampleEn: "" }, { exampleZh: "" }, { organizationMethod: "ai-cloudflare" as const }
    ]) {
      const incomplete = entry({ ...complete, ...overrides, senses: [] });
      expect(() => applyPublishMutation(snapshot([]), {
        ...V38_PROTOCOL,
        baseSha: SHA,
        mutationId: `mutation-incomplete-${Object.keys(overrides)[0]}`,
        mutation: { type: "add", entry: incomplete }
      })).toThrow(/必须包含结构化义项/);
    }
  });

  it("keeps browser and Worker POS canonicalization on the same table", () => {
    const cases: Array<[string, string]> = [
      ["noun", "noun"], ["n.", "noun"], ["countable", "noun"], ["uncountable", "noun"],
      ["plural", "noun"], ["singular", "noun"], ["proper", "noun"], ["transitive", "verb"],
      ["intransitive", "verb"], ["phrasal", "verb"], ["phrasal verb", "verb"], ["modal", "auxiliary"],
      ["名词", "noun"], ["及物动词", "verb"], ["短语动词", "verb"], ["名词及形容词", ""],
      ["noun · adjective", ""], ["unknown-role", ""]
    ];
    for (const [input, expected] of cases) expect(canonicalPartOfSpeech(input), input).toBe(expected);
  });

  it("reconciles a single edited Chinese meaning into its sense and rebuilds the public summary", () => {
    const candidate = entry({
      id: "structured-observe",
      term: "observe",
      entryType: "word",
      partOfSpeech: "noun",
      meaning: "准确的新中文释义",
      senses: [{
        partOfSpeech: "verb",
        meaningZh: "观察",
        definitionEn: "To watch something carefully.",
        usageNotes: "",
        register: "neutral",
        collocations: [],
        examples: [{ en: "We observed the birds quietly.", zh: "我们安静地观察鸟儿。" }],
        confusables: []
      }],
      organizationMethod: "ai-cloudflare"
    });
    const result = applyPublishMutation(snapshot([]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-reconcile-one-sense",
      mutation: { type: "add", entry: candidate }
    }, "2026-08-28T01:00:00.000Z");
    expect(result.entry).toMatchObject({
      partOfSpeech: "verb",
      meaning: "verb：准确的新中文释义",
      definition: "verb: To watch something carefully.",
      senses: [expect.objectContaining({ partOfSpeech: "verb", meaningZh: "准确的新中文释义" })]
    });
  });

  it("requires multi-sense Chinese lines to retain their matching part-of-speech labels", () => {
    const senses = [
      {
        partOfSpeech: "noun", meaningZh: "髋部", definitionEn: "The joint between the leg and torso.", usageNotes: "", register: "general",
        collocations: [], examples: [{ en: "Her hip was sore.", zh: "她的髋部很痛。" }], confusables: []
      },
      {
        partOfSpeech: "adjective", meaningZh: "时髦的", definitionEn: "Fashionable or aware of current trends.", usageNotes: "", register: "informal",
        collocations: [], examples: [{ en: "That cafe is very hip.", zh: "那家咖啡馆很时髦。" }], confusables: []
      }
    ];
    const good = entry({
      id: "structured-hip", term: "hip", entryType: "word", partOfSpeech: "noun · adjective",
      meaning: "noun：髋部\nadjective：时髦的", senses, organizationMethod: "ai-cloudflare"
    });
    const result = applyPublishMutation(snapshot([]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-two-senses-good",
      mutation: { type: "add", entry: good }
    });
    expect(result.entry).toMatchObject({ partOfSpeech: "noun · adjective", meaning: "noun：髋部\nadjective：时髦的" });

    const mismatched = { ...good, id: "structured-hip-bad", meaning: "髋部；时髦的" };
    expect(() => applyPublishMutation(snapshot([]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-two-senses-bad",
      mutation: { type: "add", entry: mismatched }
    })).toThrow(/一个义项一行/);
  });

  it("rejects numbered pseudo-senses when only one complete sense exists", () => {
    const candidate = entry({
      id: "single-with-fake-numbering",
      term: "singleword",
      entryType: "word",
      meaning: "1. 第一项中文 2. 第二项中文",
      organizationMethod: "ai-cloudflare"
    });
    expect(() => applyPublishMutation(snapshot([]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-fake-numbering",
      mutation: { type: "add", entry: candidate }
    })).toThrow(/不能仅靠编号/);
  });

  it("grandfathers updates to the exact legacy unstructured record", () => {
    const legacy = entry({ senses: [], organizationMethod: "local-dictionary" });
    const changed = entry({ ...legacy, meaning: "① 猛戳；② 挖苦", senses: [], organizationMethod: "local-dictionary" });
    const result = applyPublishMutation(snapshot([legacy]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-update-legacy-shape",
      mutation: { type: "update", entry: changed, expectedUpdatedAt: legacy.updatedAt }
    });
    expect(result.entry).toMatchObject({ meaning: "① 猛戳；② 挖苦", senses: [] });
  });

  it("adds a valid entry and stamps a single idempotency key", () => {
    const receive = entry({ id: "public-receive", term: "receive", normalized: "receive", standardForm: "receive", entryType: "word" });
    const result = applyPublishMutation(snapshot(), { ...V38_PROTOCOL, baseSha: SHA, mutationId: "mutation-add-0001", mutation: { type: "add", entry: receive } }, "2026-08-28T01:00:00.000Z");
    expect(result.action).toBe("added");
    expect(result.snapshot.entries).toHaveLength(2);
    expect(result.snapshot.lastMutationId).toBe("mutation-add-0001");
  });

  it("returns idempotently when the same mutation is retried", () => {
    const remote = { ...snapshot(), lastMutationId: "mutation-repeat-01" };
    const result = applyPublishMutation(remote, { ...V38_PROTOCOL, baseSha: SHA, mutationId: "mutation-repeat-01", mutation: { type: "delete", id: "missing", expectedUpdatedAt: "2026-08-28T00:00:00.000Z" } });
    expect(result.action).toBe("idempotent");
    expect(result.snapshot).toBe(remote);
  });

  it("blocks duplicates across corrected aliases", () => {
    const existing = entry({ id: "receive", term: "receive", normalized: "receive", standardForm: "receive", entryType: "word" });
    const typo = entry({
      id: "recieve", term: "recieve", normalized: "recieve", standardForm: "receive", entryType: "word",
      correction: { status: "suggested", original: "recieve", suggestion: "receive", chosen: "recieve", confidence: .98, source: "ai-openai" }
    });
    expect(findDuplicate([existing], typo)?.id).toBe("receive");
    expect(() => applyPublishMutation(snapshot([existing]), {
      ...V38_PROTOCOL,
      baseSha: SHA, mutationId: "mutation-dupe-001", mutation: { type: "add", entry: typo }
    })).toThrow(ApiError);
  });

  it("does not reserve a spelling suggestion that the owner explicitly rejected", () => {
    const keptOriginal = entry({
      id: "desert", term: "desert", normalized: "desert", standardForm: "desert", entryType: "word",
      correction: { status: "kept", original: "desert", suggestion: "dessert", chosen: "desert", confidence: .6, source: "ai-openai" }
    });
    const legitimateSuggestionWord = entry({ id: "dessert", term: "dessert", normalized: "dessert", standardForm: "dessert", entryType: "word" });
    expect(findDuplicate([keptOriginal], legitimateSuggestionWord)).toBeNull();
  });

  it("does not treat attached synonyms as independent entries or lookup aliases", () => {
    const hip = entry({ id: "hip", term: "hip", entryType: "word", synonyms: ["fashionable", "stylish"] });
    const fashionable = entry({ id: "fashionable", term: "fashionable", entryType: "word" });
    const stylish = entry({ id: "stylish", term: "stylish", entryType: "word" });
    expect(findDuplicate([hip], fashionable)).toBeNull();

    const withHip = applyPublishMutation(snapshot([fashionable, stylish]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-synonym-parent",
      mutation: { type: "add", entry: hip }
    }, "2026-08-28T01:00:00.000Z");
    expect(withHip.snapshot.entries.map((candidate) => candidate.term)).toEqual(["fashionable", "stylish", "hip"]);
  });

  it("allows references to existing terms but rejects unentered synonym targets", () => {
    const alleviate = entry({ id: "alleviate", term: "alleviate", entryType: "word" });
    const ease = entry({ id: "ease", term: "ease", entryType: "word", synonyms: ["alleviate"] });
    const added = applyPublishMutation(snapshot([alleviate]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-valid-synonym-reference",
      mutation: { type: "add", entry: ease }
    }, "2026-08-28T01:00:00.000Z");
    expect(added.snapshot.entries).toHaveLength(2);

    const invented = entry({ id: "invented-ref", term: "help", entryType: "word", synonyms: ["unentered"] });
    expect(() => applyPublishMutation(snapshot([alleviate]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-invalid-synonym-reference",
      mutation: { type: "add", entry: invented }
    }, "2026-08-28T01:01:00.000Z")).toThrow(/已经输入并发布/);
  });

  it("rewrites synonym references on rename and removes them on delete", () => {
    const alleviate = entry({ id: "alleviate", term: "alleviate", entryType: "word" });
    const ease = entry({ id: "ease", term: "ease", entryType: "word", synonyms: ["alleviate"] });
    const renamed = entry({
      ...alleviate,
      term: "mitigate",
      normalized: "mitigate",
      standardForm: "mitigate",
      originalInput: "mitigate",
      correction: { status: "exact", original: "mitigate", suggestion: "", chosen: "mitigate", confidence: 1, source: "manual" }
    });
    const updated = applyPublishMutation(snapshot([alleviate, ease]), {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-rename-synonym-target",
      mutation: { type: "update", entry: renamed, expectedUpdatedAt: alleviate.updatedAt }
    }, "2026-08-28T02:00:00.000Z");
    expect(updated.snapshot.entries.find((candidate) => candidate.id === "ease")).toMatchObject({
      synonyms: ["mitigate"],
      revision: 2,
      updatedAt: "2026-08-28T02:00:00.000Z"
    });

    const target = updated.snapshot.entries.find((candidate) => candidate.id === "alleviate")!;
    const deleted = applyPublishMutation(updated.snapshot, {
      ...V38_PROTOCOL,
      baseSha: SHA,
      mutationId: "mutation-delete-synonym-target",
      mutation: { type: "delete", id: target.id, expectedUpdatedAt: target.updatedAt }
    }, "2026-08-28T03:00:00.000Z");
    expect(deleted.snapshot.entries).toHaveLength(1);
    expect(deleted.snapshot.entries[0]).toMatchObject({
      id: "ease",
      synonyms: [],
      revision: 3,
      updatedAt: "2026-08-28T03:00:00.000Z"
    });
  });

  it("rejects stale edits and stale deletes", () => {
    const original = entry();
    const changed = entry({ ...original, meaning: "本地修改" });
    expect(() => applyPublishMutation(snapshot([original]), {
      ...V38_PROTOCOL,
      baseSha: SHA, mutationId: "mutation-stale-edit", mutation: { type: "update", entry: changed, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }
    })).toThrow(/远端更新/);
    expect(() => applyPublishMutation(snapshot([original]), {
      ...V38_PROTOCOL,
      baseSha: SHA, mutationId: "mutation-stale-delete", mutation: { type: "delete", id: original.id, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }
    })).toThrow(/删除前已被修改/);
  });

  it("increments revision while preserving createdAt on update", () => {
    const original = entry();
    const changed = entry({ ...original, meaning: "更新后的释义" });
    const result = applyPublishMutation(snapshot([original]), {
      ...V38_PROTOCOL,
      baseSha: SHA, mutationId: "mutation-update-01", mutation: { type: "update", entry: changed, expectedUpdatedAt: original.updatedAt }
    }, "2026-08-28T02:00:00.000Z");
    expect(result.entry).toMatchObject({ revision: 2, createdAt: original.createdAt, updatedAt: "2026-08-28T02:00:00.000Z" });
  });

  it("rejects an unlinked attribution candidate before publishing unverifiable author data", () => {
    const quote = entry({
      id: "quote-1", term: "A line without evidence.", normalized: "a line without evidence.", standardForm: "A line without evidence.",
      entryType: "quote", author: "Invented Author", sourceTitle: "Invented Work", attributionStatus: "candidate", attributionNote: "AI memory", sources: []
    });
    expect(() => applyPublishMutation(snapshot([]), {
      ...V38_PROTOCOL,
      baseSha: SHA, mutationId: "mutation-quote-01", mutation: { type: "add", entry: quote }
    })).toThrow(/candidate author requires/);
  });
});
