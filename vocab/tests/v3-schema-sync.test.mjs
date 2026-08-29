import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCompleteAiCandidate,
  buildOwnerEnteredTermAllowlist,
  canonicalPartOfSpeech,
  entryLookupKeys,
  createBlankEntry,
  findDuplicate,
  filterSynonymsToOwnerTerms,
  formatMeaningForDisplay,
  hasChineseHanText,
  isPlausibleChineseMeaning,
  needsAiCompletion,
  parsePublicSnapshot,
  rankExactEntryMatches,
  reconcileLexicalEntryForPublish,
  safeHttpsUrl,
  validatePublicEntry
} from "../js/wordbook-schema.js";
import { classifySyncFailure, mergeAiCandidate, nextRetryAt, rebaseOperation, threeWayMergeEntry } from "../js/sync-logic.js";

function entry(term = "jab at", overrides = {}) {
  const blank = createBlankEntry(term);
  return validatePublicEntry({ ...blank, meaning: "测试释义", ...overrides });
}

function learningSense(partOfSpeech, meaningZh, definitionEn, exampleEn, exampleZh) {
  return {
    partOfSpeech,
    meaningZh,
    definitionEn,
    usageNotes: "",
    register: "neutral",
    collocations: [],
    examples: [{ en: exampleEn, zh: exampleZh }],
    confusables: []
  };
}

test("numbered meanings preserve each sense part of speech without changing stored text", () => {
  const hip = {
    partOfSpeech: "noun · adjective",
    meaning: "noun：髋部;臀部;髋关节\nadjective：时髦的;了解最新潮流的",
    senses: [
      { partOfSpeech: "noun", meaningZh: "旧的髋部释义" },
      { partOfSpeech: "adjective", meaningZh: "旧的时髦释义" }
    ]
  };
  assert.equal(
    formatMeaningForDisplay(hip),
    "① noun: 髋部;臀部;髋关节\n② adjective: 时髦的;了解最新潮流的"
  );
  assert.equal(hip.meaning, "noun：髋部;臀部;髋关节\nadjective：时髦的;了解最新潮流的");

  assert.equal(
    formatMeaningForDisplay({
      partOfSpeech: "noun",
      meaning: "noun：监视, 监督\nnoun：[电] 侦测",
      senses: [
        { partOfSpeech: "noun", meaningZh: "监视, 监督" },
        { partOfSpeech: "noun", meaningZh: "[电] 侦测" }
      ]
    }),
    "① noun: 监视, 监督\n② noun: [电] 侦测"
  );
  assert.equal(
    formatMeaningForDisplay({
      partOfSpeech: "verb phrase · noun collocation",
      meaning: "① 朝某人猛戳；② （言语上）抨击；挖苦",
      senses: []
    }),
    "① 朝某人猛戳\n② （言语上）抨击；挖苦"
  );
  assert.equal(
    formatMeaningForDisplay({
      partOfSpeech: "adjective",
      meaning: "adjective：敏锐的;有洞察力的;目光锐利的",
      senses: [{ partOfSpeech: "adjective", meaningZh: "敏锐的；有洞察力的；目光锐利的" }]
    }),
    "adjective: 敏锐的;有洞察力的;目光锐利的"
  );
});

test("owner numbering styles are normalized while ordinary punctuation is never guessed as sense boundaries", () => {
  assert.equal(
    formatMeaningForDisplay({ meaning: "1. 第一义；内部说明\n2. 第二义", senses: [] }),
    "① 第一义；内部说明\n② 第二义"
  );
  assert.equal(
    formatMeaningForDisplay({ meaning: "1、第一义；内部说明；2、第二义", senses: [] }),
    "① 第一义；内部说明\n② 第二义"
  );
  assert.equal(
    formatMeaningForDisplay({ meaning: "1) first sense; detail\n2）second sense", senses: [] }),
    "① first sense; detail\n② second sense"
  );
  assert.equal(
    formatMeaningForDisplay({ meaning: "1. 第一义 2. 第二义", senses: [] }),
    "① 第一义\n② 第二义"
  );
  assert.equal(formatMeaningForDisplay({ meaning: "1. 仅有一个标记", senses: [] }), "1. 仅有一个标记");
  assert.equal(formatMeaningForDisplay({ meaning: "监视；监督；侦测", senses: [] }), "监视；监督；侦测");
  assert.equal(formatMeaningForDisplay({ meaning: "1.5 倍的增长", senses: [] }), "1.5 倍的增长");
  assert.equal(formatMeaningForDisplay({ meaning: "1. 第一义\n3. 第三义", senses: [] }), "1. 第一义\n3. 第三义");
});

test("structured senses only replace an empty or provably equivalent aggregate meaning", () => {
  const senses = [{ meaningZh: "减轻；缓和" }, { meaningZh: "使容易" }];
  assert.equal(formatMeaningForDisplay({ meaning: "", senses }), "① 减轻；缓和\n② 使容易");
  assert.equal(formatMeaningForDisplay({ meaning: "减轻,缓和;使容易", senses }), "① 减轻；缓和\n② 使容易");
  assert.equal(formatMeaningForDisplay({ meaning: "卓手工改写后的准确释义", senses }), "卓手工改写后的准确释义");
  assert.equal(formatMeaningForDisplay({ meaning: "卓手工单义项", senses: [{ meaningZh: "旧义项" }] }), "卓手工单义项");
});

test("v3 browser schema keeps jab at whole and rejects unknown fields", () => {
  const value = entry("jab at");
  assert.equal(value.entryType, "phrase");
  assert.equal(value.standardForm, "jab at");
  assert.deepEqual(value.synonyms, []);
  assert.throws(() => validatePublicEntry({ ...value, html: "<img onerror=alert(1)>" }), /未知字段/);
});

test("v3 browser schema defaults old entries to an empty synonym list without weakening exact keys", () => {
  const current = entry("alleviate", { synonyms: ["ease", "lessen", "ease"] });
  assert.deepEqual(current.synonyms, ["ease", "lessen"]);
  const { synonyms: _omitted, ...oldV3Entry } = current;
  const migrated = parsePublicSnapshot({
    schemaVersion: 3,
    exportedAt: current.updatedAt,
    revisionId: "old-v3-before-synonyms",
    lastMutationId: "",
    entries: [oldV3Entry]
  });
  assert.deepEqual(migrated.entries[0].synonyms, []);
  assert.throws(() => validatePublicEntry({ ...oldV3Entry, unexpected: [] }), /未知字段/);
});

test("synonyms stay metadata and never reserve another headword", () => {
  const alleviate = entry("alleviate", { id: "alleviate", synonyms: ["ease", "lessen"] });
  assert.deepEqual(entryLookupKeys(alleviate), ["alleviate"]);
  assert.equal(findDuplicate([alleviate], entry("ease", { id: "ease" })), null);
});

test("owner synonym allowlists contain only independently entered current terms", () => {
  const alleviate = entry("alleviate", { id: "alleviate", updatedAt: "2027-08-27T01:00:00.000Z" });
  const ease = entry("ease", { id: "ease", updatedAt: "2027-08-28T01:00:00.000Z" });
  const quote = entry("Knowledge is power.", { id: "quote", entryType: "quote", updatedAt: "2027-08-29T01:00:00.000Z" });
  const drafts = [
    { updatedAt: ease.updatedAt, value: ease },
    { updatedAt: quote.updatedAt, value: quote }
  ];
  assert.deepEqual(buildOwnerEnteredTermAllowlist(drafts, [alleviate], { excludeTerm: "ease", limit: 200 }), ["alleviate"]);
  assert.deepEqual(
    filterSynonymsToOwnerTerms(["Alleviate", "mitigate", "alleviate"], ["alleviate", "ease"], "ease"),
    ["alleviate"]
  );
  const many = Array.from({ length: 205 }, (_, index) => ({
    updatedAt: new Date(1_800_000_000_000 - index).toISOString(),
    value: entry(`term ${index}`, { id: `term-${index}` })
  }));
  assert.equal(buildOwnerEnteredTermAllowlist(many, [], { limit: 200 }).length, 200);
});

test("an independently published synonym ranks before entries that only mention it", () => {
  const alleviate = entry("alleviate", { id: "alleviate", synonyms: ["ease", "lessen"] });
  const mitigate = entry("mitigate", { id: "mitigate", synonyms: ["ease"] });
  const ease = entry("ease", { id: "ease" });
  assert.deepEqual(
    rankExactEntryMatches([alleviate, mitigate, ease], "ease").map((candidate) => candidate.term),
    ["ease", "alleviate", "mitigate"]
  );
  assert.deepEqual(
    rankExactEntryMatches([alleviate, mitigate, ease], "unknown").map((candidate) => candidate.term),
    ["alleviate", "mitigate", "ease"]
  );
});

test("browser synonym validation mirrors publish boundaries", () => {
  assert.throws(() => entry("hip", { synonyms: ["HIP"] }), /不能重复当前词条/);
  assert.throws(() => entry("hip", { synonyms: ["Stylish", "stylish"] }), /不能重复/);
  assert.throws(() => entry("hip", { synonyms: ["<b>stylish<\/b>"] }), /安全的英文/);
  assert.throws(() => entry("jab at", { synonyms: ["jabbed at"], forms: ["jabbed at"] }), /词形或易混词/);
  assert.throws(() => entry("hip", { synonyms: Array.from({ length: 21 }, (_, index) => `alternative ${index}`) }), /格式不正确/);
  assert.throws(() => entry("Knowledge is power.", { entryType: "quote", synonyms: ["wisdom grants strength"] }), /只有单词、短语/);
});

test("v3 browser schema accepts a Cloudflare-organized draft", () => {
  const value = entry("hip", { organizationMethod: "ai-cloudflare" });
  assert.equal(value.organizationMethod, "ai-cloudflare");
});

test("Chinese meaning quality rejects empty, English and known translation garbage", () => {
  for (const candidate of ["", "hip", "English definition only", "kamus在线bm ke bi", "MYMEMORY translation warning 中文"]) {
    assert.equal(isPlausibleChineseMeaning(candidate, "hip"), false, candidate);
  }
  assert.equal(isPlausibleChineseMeaning("髋部；臀部；髋关节", "hip"), true);
  assert.equal(isPlausibleChineseMeaning("noun：髋部；臀部", "hip"), true);
});

test("browser POS canonicalization matches the publish allowlist", () => {
  const cases = [
    ["noun", "noun"], ["n.", "noun"], ["countable", "noun"], ["uncountable", "noun"],
    ["plural", "noun"], ["singular", "noun"], ["proper", "noun"], ["transitive", "verb"],
    ["intransitive", "verb"], ["phrasal", "verb"], ["phrasal verb", "verb"], ["modal", "auxiliary"],
    ["名词", "noun"], ["及物动词", "verb"], ["短语动词", "verb"], ["名词及形容词", ""],
    ["noun · adjective", ""], ["unknown-role", ""]
  ];
  for (const [input, expected] of cases) assert.equal(canonicalPartOfSpeech(input), expected, input);
});

test("single-sense publication syncs an owner Chinese edit and rebuilds the summaries", () => {
  const original = entry("perspicacious", {
    partOfSpeech: "adj.",
    meaning: "敏锐且有洞察力的",
    definition: "owner-edited stale summary",
    senses: [learningSense(
      "adjective",
      "敏锐的",
      "Having keen insight and good judgment.",
      "Her perspicacious analysis found the flaw.",
      "她敏锐的分析发现了这个缺陷。"
    )]
  });
  const reconciled = reconcileLexicalEntryForPublish(original);
  assert.equal(reconciled.partOfSpeech, "adjective");
  assert.equal(reconciled.meaning, "adjective：敏锐且有洞察力的");
  assert.equal(reconciled.definition, "adjective: Having keen insight and good judgment.");
  assert.equal(reconciled.senses[0].meaningZh, "敏锐且有洞察力的");
  assert.equal(original.senses[0].meaningZh, "敏锐的", "reconciliation must not mutate the draft object");
  assert.deepEqual(validatePublicEntry(reconciled), reconciled);
  assert.throws(
    () => reconcileLexicalEntryForPublish({ ...original, meaning: "1. 第一项中文 2. 第二项中文" }),
    /不能仅靠编号/
  );
  assert.throws(
    () => reconcileLexicalEntryForPublish({ ...original, meaning: "not-a-pos：中文释义" }),
    /词性.*不受支持/
  );
});

test("multi-sense publication requires matching POS lines and rebuilds one canonical representation", () => {
  const hip = entry("hip", {
    partOfSpeech: "stale",
    meaning: "noun：髋部；臀部\nadjective：时髦的",
    definition: "stale summary",
    senses: [
      learningSense("noun", "旧的髋部释义", "The side of the body below the waist.", "She hurt her hip.", "她伤到了髋部。"),
      learningSense("adj.", "旧的时髦释义", "Aware of the latest styles and ideas.", "That cafe is very hip.", "那家咖啡馆很时髦。")
    ]
  });
  const reconciled = reconcileLexicalEntryForPublish(hip);
  assert.equal(reconciled.partOfSpeech, "noun · adjective");
  assert.equal(reconciled.meaning, "noun：髋部；臀部\nadjective：时髦的");
  assert.equal(reconciled.definition, "noun: The side of the body below the waist.\nadjective: Aware of the latest styles and ideas.");
  assert.deepEqual(reconciled.senses.map((sense) => sense.meaningZh), ["髋部；臀部", "时髦的"]);

  assert.throws(
    () => reconcileLexicalEntryForPublish({ ...hip, meaning: "髋部；臀部\n时髦的" }),
    /多义词必须按 2 行/
  );
  assert.throws(
    () => reconcileLexicalEntryForPublish({ ...hip, meaning: "adjective：髋部；臀部\nnoun：时髦的" }),
    /词性.*不一致/
  );
  assert.throws(
    () => reconcileLexicalEntryForPublish({
      ...hip,
      senses: [{ ...hip.senses[0], examples: [] }, hip.senses[1]]
    }),
    /完整、可信的双语例句/
  );
});

test("new lexical entries require senses while exact legacy updates remain grandfathered", () => {
  const legacy = entry("jab at", {
    partOfSpeech: "verb phrase",
    meaning: "猛戳；言语上抨击",
    definition: "To make a quick thrust or verbal attack.",
    senses: []
  });
  assert.throws(() => reconcileLexicalEntryForPublish(legacy), /必须包含结构化义项/);
  assert.deepEqual(reconcileLexicalEntryForPublish(legacy, { allowLegacyWithoutSenses: true }), legacy);
  assert.throws(
    () => reconcileLexicalEntryForPublish({ ...legacy, meaning: "kamus在线bm ke bi" }, { allowLegacyWithoutSenses: true }),
    /不是可信的中文内容/
  );
});

test("a complete manual lexical draft safely synthesizes exactly one sense", () => {
  const manual = entry("handcraft", {
    partOfSpeech: "transitive",
    meaning: "手工制作；亲手完成",
    definition: "To make or complete something carefully by hand.",
    exampleEn: "She handcrafted the wooden frame.",
    exampleZh: "她亲手制作了木制相框。",
    usage: "常用于强调人工制作。",
    register: "neutral",
    senses: [],
    organizationMethod: "manual"
  });
  const reconciled = reconcileLexicalEntryForPublish(manual);
  assert.equal(reconciled.partOfSpeech, "verb");
  assert.equal(reconciled.meaning, "verb：手工制作；亲手完成");
  assert.equal(reconciled.definition, "verb: To make or complete something carefully by hand.");
  assert.equal(reconciled.senses.length, 1);
  assert.deepEqual(reconciled.senses[0], {
    partOfSpeech: "verb",
    meaningZh: "手工制作；亲手完成",
    definitionEn: "To make or complete something carefully by hand.",
    usageNotes: "常用于强调人工制作。",
    register: "neutral",
    collocations: [],
    examples: [{ en: "She handcrafted the wooden frame.", zh: "她亲手制作了木制相框。" }],
    confusables: []
  });

  for (const overrides of [
    { partOfSpeech: "" }, { partOfSpeech: "noun · verb" }, { definition: "" },
    { exampleEn: "" }, { exampleZh: "" }, { exampleZh: "English only" },
    { organizationMethod: "ai-cloudflare" }
  ]) {
    assert.throws(
      () => reconcileLexicalEntryForPublish({ ...manual, ...overrides }),
      /必须包含结构化义项/
    );
  }
});

test("browser rejects structurally valid AI candidates with blank bilingual semantics", () => {
  const complete = entry("hip", {
    meaning: "髋部",
    definition: "The side of the body below the waist.",
    senses: [{
      partOfSpeech: "noun", meaningZh: "髋部", definitionEn: "The side of the body below the waist.",
      usageNotes: "", register: "neutral", collocations: [],
      examples: [{ en: "She hurt her hip.", zh: "她伤到了髋部。" }], confusables: []
    }],
    organizationMethod: "ai-cloudflare"
  });
  assert.equal(assertCompleteAiCandidate(complete), complete);
  assert.equal(hasChineseHanText("\u200b"), false);
  assert.throws(() => assertCompleteAiCandidate({ ...complete, meaning: "\u200b" }), /中文释义不是可信中文/);
  assert.throws(() => assertCompleteAiCandidate({ ...complete, meaning: "kamus在线bm ke bi" }), /中文释义不是可信中文/);
  assert.throws(() => assertCompleteAiCandidate({ ...complete, definition: "" }), /英文释义为空/);
  assert.throws(() => assertCompleteAiCandidate({ ...complete, senses: [] }), /没有分义项/);
  assert.throws(() => assertCompleteAiCandidate({
    ...complete,
    senses: [{ ...complete.senses[0], meaningZh: "kamus在线bm ke bi" }]
  }), /缺少可信中文/);
  assert.throws(() => assertCompleteAiCandidate({
    ...complete,
    senses: [{ ...complete.senses[0], examples: [{ en: "She hurt her hip.", zh: "" }] }]
  }), /不完整的双语例句/);
});

test("AI completion detection retries incomplete words but preserves complete duplicates", () => {
  const blankHip = createBlankEntry("hip");
  assert.equal(needsAiCompletion(blankHip), true);
  const completeHip = entry("hip", {
    phonetic: "/hɪp/",
    definition: "The side of the body below the waist.",
    senses: [{
      partOfSpeech: "noun", meaningZh: "髋部", definitionEn: "The side of the body below the waist.",
      usageNotes: "", register: "neutral", collocations: [],
      examples: [{ en: "She hurt her hip.", zh: "她伤到了髋部。" }], confusables: []
    }]
  });
  assert.equal(needsAiCompletion(completeHip), false);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "\u200b" }), true);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "/\u200b/" }), true);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "hip" }), true);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "", organizationMethod: "ai-cloudflare" }), false);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "", organizationMethod: "mixed" }), false);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "", organizationMethod: "manual" }), true);
  for (const entryType of ["quote", "proverb", "sentence"]) {
    const completeNonLexical = entry("Knowledge is power.", {
      entryType,
      definition: "A complete non-lexical learning entry.",
      senses: [],
      phonetic: ""
    });
    assert.equal(needsAiCompletion(completeNonLexical), false, `${entryType} does not require lexical senses`);
  }
  assert.equal(needsAiCompletion({ ...completeHip, entryType: "phrase", senses: [] }), true);
});

test("AI fills schema-equivalent blank legacy fields without overwriting edits made in flight", () => {
  const baseline = { id: "stable-id", revision: 4, phonetic: undefined, meaning: "old", collocations: [], organizationMethod: "manual" };
  const current = { id: "stable-id", revision: 4, phonetic: "", meaning: "owner edit", collocations: [], organizationMethod: "manual" };
  const candidate = {
    id: "ai-generated-id", revision: 1, phonetic: "/hɪp/", meaning: "AI replacement", collocations: ["hip joint"],
    organizationMethod: "ai-cloudflare"
  };
  const result = mergeAiCandidate(baseline, current, candidate);
  assert.equal(result.merged.id, "stable-id");
  assert.equal(result.merged.revision, 4);
  assert.equal(result.merged.phonetic, "/hɪp/");
  assert.equal(result.merged.meaning, "owner edit");
  assert.deepEqual(result.merged.collocations, ["hip joint"]);
  assert.equal(result.preservedManualChanges, true);
  assert.equal(result.merged.organizationMethod, "mixed");
});

test("automatic AI completion fills blanks without replacing earlier manual content", () => {
  const baseline = {
    id: "stable-id", revision: 4, meaning: "卓手工释义", definition: "", phonetic: "", senses: [], synonyms: [],
    correction: { status: "exact" }, organizationMethod: "manual"
  };
  const candidate = {
    id: "ai-id", revision: 1, meaning: "AI释义", definition: "AI definition", phonetic: "/hɪp/",
    senses: [{ partOfSpeech: "noun", meaningZh: "髋部" }], synonyms: ["pelvis"], correction: { status: "exact", source: "ai" },
    organizationMethod: "ai-cloudflare"
  };
  const result = mergeAiCandidate(baseline, structuredClone(baseline), candidate, { fillMissingOnly: true });
  assert.equal(result.merged.id, "stable-id");
  assert.equal(result.merged.meaning, "卓手工释义");
  assert.equal(result.merged.definition, "AI definition");
  assert.equal(result.merged.phonetic, "/hɪp/");
  assert.equal(result.merged.senses.length, 1);
  assert.deepEqual(result.merged.synonyms, ["pelvis"]);
  assert.equal(result.merged.organizationMethod, "mixed");
  assert.equal(result.preservedManualChanges, true);
});

test("v3 browser schema migrates the real legacy shape without accepting schema zero", () => {
  const migrated = parsePublicSnapshot({ schemaVersion: 2, updatedAt: "2026-08-27T00:00:00.000Z", entries: [{
    id: "public-jab-at", term: "jab at", normalized: "jab at", headword: "jab", entryType: "phrase", meaning: "猛戳",
    definition: "To jab toward.", forms: [], tags: [], sources: [], createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z"
  }] });
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.entries[0].standardForm, "jab at");
  assert.deepEqual(migrated.entries[0].synonyms, []);
  assert.throws(() => parsePublicSnapshot({ schemaVersion: 0, entries: [] }), /不支持/);
});

test("legacy v1 backups migrate with an empty synonym list", () => {
  const migrated = parsePublicSnapshot({ schemaVersion: 1, updatedAt: "2026-08-27T00:00:00.000Z", entries: [{
    id: "public-legacy-ease", term: "ease", entryType: "word", meaning: "减轻",
    createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z"
  }] });
  assert.deepEqual(migrated.entries[0].synonyms, []);
});

test("duplicate detection covers correction and standard-form aliases", () => {
  const correct = entry("receive", { id: "receive", entryType: "word" });
  const typo = entry("recieve", {
    id: "recieve", entryType: "word", standardForm: "receive",
    correction: { status: "suggested", original: "recieve", suggestion: "receive", chosen: "recieve", confidence: .98, source: "test" }
  });
  assert.equal(findDuplicate([correct], typo).id, "receive");
});

test("a rejected spelling suggestion is not reserved as an alias", () => {
  const keptOriginal = entry("desert", {
    id: "desert", entryType: "word", standardForm: "desert",
    correction: { status: "kept", original: "desert", suggestion: "dessert", chosen: "desert", confidence: .6, source: "test" }
  });
  assert.deepEqual(entryLookupKeys(keptOriginal), ["desert"]);
  assert.equal(findDuplicate([keptOriginal], entry("dessert", { id: "dessert", entryType: "word" })), null);
});

test("source URLs reject scripts, credentials and private networks", () => {
  assert.throws(() => safeHttpsUrl("javascript:alert(1)"));
  assert.throws(() => safeHttpsUrl("https://name:pass@example.com/source"));
  assert.throws(() => safeHttpsUrl("https://192.168.1.2/source"));
  assert.equal(safeHttpsUrl("https://example.edu/source#quote"), "https://example.edu/source");
});

test("three-way merge keeps one-sided changes and reports same-field conflicts", () => {
  const base = entry("receive", { id: "receive", entryType: "word", meaning: "收到", usage: "base" });
  const local = { ...base, meaning: "收到；接收" };
  const remote = { ...base, usage: "remote usage", updatedAt: "2026-08-28T01:00:00.000Z", revision: 2 };
  const clean = threeWayMergeEntry(base, local, remote);
  assert.equal(clean.conflicts.length, 0);
  assert.equal(clean.merged.meaning, "收到；接收");
  assert.equal(clean.merged.usage, "remote usage");
  const conflicted = threeWayMergeEntry(base, { ...base, meaning: "本地" }, { ...remote, meaning: "远端" });
  assert.deepEqual(conflicted.conflicts.map((item) => item.path), ["meaning"]);
  assert.equal(conflicted.merged.meaning, "本地");
});

test("three-way merge treats synonym edits as one field and reports real conflicts", () => {
  const base = entry("alleviate", { id: "alleviate", synonyms: ["ease"] });
  const local = { ...base, synonyms: ["ease", "lessen"] };
  const remote = { ...base, synonyms: ["mitigate"], updatedAt: "2026-08-28T01:00:00.000Z", revision: 2 };
  const result = threeWayMergeEntry(base, local, remote);
  assert.deepEqual(result.conflicts.map((item) => item.path), ["synonyms"]);
  assert.deepEqual(result.merged.synonyms, ["ease", "lessen"]);
});

test("operation rebasing never overwrites a remotely changed delete", () => {
  const base = entry("receive", { id: "receive", entryType: "word" });
  const remote = { ...base, meaning: "远端刚修改", updatedAt: "2026-08-28T01:00:00.000Z", revision: 2 };
  const result = rebaseOperation({
    entryId: "receive", baseEntry: base,
    request: { clientProtocol: "v38", queueProtocol: "v38", baseSha: "a".repeat(40), mutationId: "mutation-delete-1", mutation: { type: "delete", id: "receive", expectedUpdatedAt: base.updatedAt } }
  }, { entries: [remote] }, "b".repeat(40));
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].path, "$delete");
});

test("a semantic rebase rotates the remote mutation id instead of reusing a bound idempotency key", () => {
  const base = entry("receive", { id: "receive", entryType: "word", meaning: "收到", usage: "base" });
  const local = { ...base, meaning: "收到；接收" };
  const remote = { ...base, usage: "remote usage", updatedAt: "2026-08-28T01:00:00.000Z", revision: 2 };
  const originalMutationId = "mutation-update-bound-1";
  const result = rebaseOperation({
    entryId: "receive",
    baseEntry: base,
    request: {
      clientProtocol: "v38",
      queueProtocol: "v38",
      baseSha: "a".repeat(40),
      mutationId: originalMutationId,
      mutation: { type: "update", entry: local, expectedUpdatedAt: base.updatedAt }
    }
  }, { entries: [remote] }, "b".repeat(40));

  assert.equal(result.status, "rebased");
  assert.equal(result.request.baseSha, "b".repeat(40));
  assert.equal(result.request.clientProtocol, "v38");
  assert.equal(result.request.queueProtocol, "v38");
  assert.equal(result.request.mutation.entry.meaning, "收到；接收");
  assert.equal(result.request.mutation.entry.usage, "remote usage");
  assert.notEqual(result.request.mutationId, originalMutationId);
  assert.match(result.request.mutationId, /^[0-9a-f-]{36}$/i);
});

test("retry classification and backoff distinguish conflicts and transient failures", () => {
  assert.deepEqual(classifySyncFailure({ status: 409 }), { state: "conflict", retryable: false });
  assert.deepEqual(classifySyncFailure({ status: 503 }), { state: "retry_wait", retryable: true });
  assert.equal(nextRetryAt(1, 0, 0, () => 0), "1970-01-01T00:00:05.000Z");
  assert.equal(nextRetryAt(8, 30, 0, () => 0), "1970-01-01T00:00:30.000Z");
});
