import { ApiError } from "./security";
import {
  hasPlausibleChineseMeaning,
  normalizeEnglish,
  PublicEntrySchema,
  PublicSnapshotSchema,
  type PublicEntry,
  type PublicSnapshot,
  type PublishRequest
} from "./schema";
import { isPlausibleEnglishText } from "./semantic-quality";

const LEXICAL_ENTRY_TYPES = new Set<PublicEntry["entryType"]>([
  "word", "phrase", "phrasal-verb", "idiom", "collocation"
]);
const SUPPORTED_PARTS_OF_SPEECH = new Set([
  "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner",
  "article", "interjection", "auxiliary", "participle", "infinitive", "gerund", "idiom", "phrase", "collocation"
]);
const STRUCTURED_ORGANIZATION_METHODS = new Set<PublicEntry["organizationMethod"]>([
  "ai-cloudflare", "ai-openai", "ai-anthropic", "mixed"
]);

function compact(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function canonicalPartOfSpeech(value: string): string {
  const raw = compact(value).toLocaleLowerCase("en-US").replace(/[._]/g, " ");
  const chinese = new Map<string, string>([
    ["名词", "noun"], ["动词", "verb"], ["形容词", "adjective"], ["副词", "adverb"],
    ["代词", "pronoun"], ["介词", "preposition"], ["连词", "conjunction"], ["限定词", "determiner"],
    ["冠词", "article"], ["感叹词", "interjection"], ["助动词", "auxiliary"], ["短语", "phrase"],
    ["习语", "idiom"], ["搭配", "collocation"], ["短语动词", "verb"], ["动词短语", "verb"],
    ["名词短语", "noun"], ["副词短语", "adverb"], ["介词短语", "preposition"],
    ["及物动词", "verb"], ["不及物动词", "verb"]
  ]);
  if (chinese.has(raw)) return chinese.get(raw)!;
  if (!raw || /[·/、，,&]|\b(?:and|or)\b|[和及]/iu.test(raw)) return "";
  const standaloneModifiers = new Map<string, string>([
    ["countable", "noun"], ["uncountable", "noun"], ["plural", "noun"], ["singular", "noun"], ["proper", "noun"],
    ["transitive", "verb"], ["intransitive", "verb"], ["phrasal", "verb"], ["modal", "auxiliary"],
    ["prepositional", "preposition"], ["adverbial", "adverb"], ["idiomatic", "idiom"], ["expression", "phrase"]
  ]);
  if (standaloneModifiers.has(raw)) return standaloneModifiers.get(raw)!;
  const aliases: Array<[RegExp, string]> = [
    [/\b(phrasal\s+verb|verb\s+phrase|verbs?)\b|^v\b/, "verb"],
    [/\b(nouns?|noun\s+phrase)\b|^n\b/, "noun"],
    [/\b(adjectives?|adj)\b/, "adjective"],
    [/\b(adverbs?|adverbial|adv)\b/, "adverb"],
    [/\b(pronouns?|pron)\b/, "pronoun"],
    [/\b(prepositions?|prepositional|prep)\b/, "preposition"],
    [/\b(conjunctions?|conj)\b/, "conjunction"],
    [/\b(interjections?|interj)\b/, "interjection"],
    [/\b(determiners?|det)\b/, "determiner"],
    [/\b(auxiliary|modal)\b/, "auxiliary"],
    [/\b(idiom|idiomatic)\b/, "idiom"],
    [/\b(phrase|expression)\b/, "phrase"]
  ];
  const canonical = aliases.find(([pattern]) => pattern.test(raw))?.[1] || raw.replace(/\s+/g, " ");
  return SUPPORTED_PARTS_OF_SPEECH.has(canonical) ? canonical : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(compact).filter(Boolean))];
}

function readMeaningLine(line: string, expectedPartOfSpeech: string, requireLabel: boolean): string {
  const cleaned = line
    .replace(/^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)、])\s*/u, "")
    .trim();
  const labelled = cleaned.match(/^([^:：]{1,80})\s*[:：]\s*(.+)$/u);
  if (!labelled) {
    if (requireLabel) {
      throw new ApiError(400, "lexical_meaning_mismatch", "多个义项必须逐行写明词性，例如 noun：中文释义。");
    }
    return cleaned;
  }
  if (canonicalPartOfSpeech(labelled[1]) !== expectedPartOfSpeech) {
    throw new ApiError(400, "lexical_meaning_mismatch", "中文释义的词性与分义项不一致，请重新用 AI 整理后再发布。");
  }
  return labelled[2].trim();
}

/**
 * New lexical entries must have one authoritative structured representation.
 * The owner may still edit the top Chinese field, but the edit is reconciled
 * into senses before the public summary is rebuilt. Old unstructured entries
 * are grandfathered only when updating that exact legacy record.
 */
function prepareLexicalEntry(candidate: PublicEntry, requireStructured: boolean, allowManualSynthesis: boolean): PublicEntry {
  if (!hasPlausibleChineseMeaning(candidate.meaning)) {
    throw new ApiError(400, "invalid_chinese_meaning", "中文释义为空、像英文回声或包含可疑机器翻译垃圾，不能发布。");
  }
  if (!LEXICAL_ENTRY_TYPES.has(candidate.entryType) || !requireStructured) return candidate;
  let prepared = candidate;
  if (!prepared.senses.length) {
    const position = canonicalPartOfSpeech(prepared.partOfSpeech);
    const completeManualSingleSense = allowManualSynthesis
      && prepared.organizationMethod === "manual"
      && Boolean(position)
      && isPlausibleEnglishText(prepared.definition)
      && isPlausibleEnglishText(prepared.exampleEn)
      && hasPlausibleChineseMeaning(prepared.exampleZh);
    if (!completeManualSingleSense) {
      throw new ApiError(400, "incomplete_lexical_entry", "新词汇必须包含结构化义项；若不用 AI，请完整填写单一词性、可信的中英文释义及一组双语例句。");
    }
    prepared = {
      ...prepared,
      senses: [{
        partOfSpeech: position,
        meaningZh: prepared.meaning,
        definitionEn: prepared.definition,
        usageNotes: prepared.usage,
        register: prepared.register || "neutral",
        collocations: prepared.collocations,
        examples: [{ en: prepared.exampleEn, zh: prepared.exampleZh }],
        confusables: prepared.confusedWith
      }]
    };
  }

  const lines = prepared.meaning.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (prepared.senses.length > 1 && lines.length !== prepared.senses.length) {
    throw new ApiError(400, "lexical_meaning_mismatch", "中文释义与分义项数量不一致；请按一个义项一行后再发布。");
  }
  if (prepared.senses.length === 1 && lines.length !== 1) {
    throw new ApiError(400, "lexical_meaning_mismatch", "单义项词条的中文释义应保持为一行。");
  }
  if (prepared.senses.length === 1
    && /(?:^|[\s；;])(?:[②-⑳]|(?:[2-9]|1\d|20)(?:\.(?!\d)|[、)）]))\s*/u.test(prepared.meaning)) {
    throw new ApiError(400, "lexical_meaning_mismatch", "当前只有一个完整义项，不能仅靠编号添加缺少英文释义和双语例句的新义项。");
  }

  const senses = prepared.senses.map((sense, index) => {
    const position = canonicalPartOfSpeech(sense.partOfSpeech);
    if (!SUPPORTED_PARTS_OF_SPEECH.has(position)) {
      throw new ApiError(400, "incomplete_lexical_entry", `第 ${index + 1} 个义项缺少受支持的词性。`);
    }
    const meaningZh = readMeaningLine(lines[index], position, prepared.senses.length > 1);
    if (!hasPlausibleChineseMeaning(meaningZh)) {
      throw new ApiError(400, "invalid_chinese_meaning", `第 ${index + 1} 个义项的中文释义不可信，不能发布。`);
    }
    if (!isPlausibleEnglishText(sense.definitionEn)) {
      throw new ApiError(400, "incomplete_lexical_entry", `第 ${index + 1} 个义项缺少可靠的英文释义。`);
    }
    if (!sense.examples.length || sense.examples.some((example) => (
      !isPlausibleEnglishText(example.en) || !hasPlausibleChineseMeaning(example.zh)
    ))) {
      throw new ApiError(400, "incomplete_lexical_entry", `第 ${index + 1} 个义项必须至少有一组完整、可信的双语例句。`);
    }
    return { ...sense, partOfSpeech: position, meaningZh: compact(meaningZh), definitionEn: compact(sense.definitionEn) };
  });
  const positions = unique(senses.map((sense) => sense.partOfSpeech));
  return {
    ...prepared,
    senses,
    partOfSpeech: positions.join(" · "),
    meaning: senses.map((sense) => `${sense.partOfSpeech}：${sense.meaningZh}`).join("\n"),
    definition: senses.map((sense) => `${sense.partOfSpeech}: ${sense.definitionEn}`).join("\n")
  };
}

function lookupKeys(entry: PublicEntry): string[] {
  const values = [entry.term, entry.normalized, entry.standardForm];
  if (["accepted", "suggested"].includes(entry.correction.status)) {
    values.push(entry.correction.original, entry.correction.suggestion, entry.correction.chosen);
  } else if (entry.correction.status === "kept") {
    // The owner explicitly rejected the suggestion. It must remain available
    // as a separate legitimate headword rather than becoming an alias here.
    values.push(entry.correction.original, entry.correction.chosen);
  }
  return [...new Set(values.map((value) => normalizeEnglish(value)).filter(Boolean))];
}

export function findDuplicate(entries: PublicEntry[], candidate: PublicEntry, excludeId = ""): PublicEntry | null {
  const wanted = new Set(lookupKeys(candidate));
  return entries.find((entry) => entry.id !== excludeId && lookupKeys(entry).some((key) => wanted.has(key))) || null;
}

function prepareEntry(
  candidate: PublicEntry,
  existing: PublicEntry | null,
  now: string,
  requireStructured: boolean,
  allowManualSynthesis: boolean
): PublicEntry {
  const lexical = prepareLexicalEntry(candidate, requireStructured, allowManualSynthesis);
  const entry = PublicEntrySchema.parse({
    ...lexical,
    id: existing?.id || lexical.id,
    revision: existing ? existing.revision + 1 : 1,
    createdAt: existing?.createdAt || lexical.createdAt || now,
    updatedAt: now,
    normalized: normalizeEnglish(lexical.term)
  });
  if (entry.attributionStatus === "candidate"
    && !entry.sourceUrl
    && !entry.sources.some((source) => source.kind === "candidate" && source.url)) {
    return PublicEntrySchema.parse({
      ...entry,
      author: "",
      sourceTitle: "",
      sourceWork: "",
      sourceDate: "",
      attributionStatus: "unverified",
      attributionNote: entry.attributionNote || "出处未核验；未找到可供访客复查的候选链接。"
    });
  }
  return entry;
}

function rewriteSynonymReferences(
  entries: PublicEntry[],
  oldTerm: string,
  replacement: string,
  excludeId: string,
  now: string
): void {
  const oldKey = normalizeEnglish(oldTerm);
  if (!oldKey) return;
  for (let index = 0; index < entries.length; index += 1) {
    const candidate = entries[index];
    if (candidate.id === excludeId || !candidate.synonyms.some((synonym) => normalizeEnglish(synonym) === oldKey)) continue;
    const selfKeys = new Set([
      candidate.term,
      candidate.standardForm,
      candidate.correction.original,
      candidate.correction.suggestion,
      candidate.correction.chosen,
      ...candidate.forms,
      ...candidate.confusedWith
    ].map((value) => normalizeEnglish(value)).filter(Boolean));
    const seen = new Set<string>();
    const synonyms: string[] = [];
    for (const synonym of candidate.synonyms) {
      const rewritten = normalizeEnglish(synonym) === oldKey ? replacement : synonym;
      const key = normalizeEnglish(rewritten);
      if (!key || selfKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      synonyms.push(rewritten);
    }
    entries[index] = PublicEntrySchema.parse({
      ...candidate,
      synonyms,
      revision: candidate.revision + 1,
      updatedAt: now
    });
  }
}

export interface MutationResult {
  snapshot: PublicSnapshot;
  entry: PublicEntry | null;
  action: "added" | "updated" | "deleted" | "idempotent";
}

export function applyPublishMutation(
  remote: PublicSnapshot,
  request: PublishRequest,
  now = new Date().toISOString()
): MutationResult {
  if (remote.lastMutationId && remote.lastMutationId === request.mutationId) {
    const entryId = request.mutation.type === "delete" ? request.mutation.id : request.mutation.entry.id;
    return {
      snapshot: remote,
      entry: remote.entries.find((entry) => entry.id === entryId) || null,
      action: "idempotent"
    };
  }

  const entries = [...remote.entries];
  const mutation = request.mutation;
  let entry: PublicEntry | null = null;
  let action: MutationResult["action"];
  if (mutation.type === "add") {
    const candidateEntry = mutation.entry;
    if (entries.some((candidate) => candidate.id === candidateEntry.id)) {
      throw new ApiError(409, "duplicate_id", "远端已有相同词条编号，请刷新并合并。", { entryId: candidateEntry.id });
    }
    entry = prepareEntry(candidateEntry, null, now, LEXICAL_ENTRY_TYPES.has(candidateEntry.entryType), true);
    const duplicate = findDuplicate(entries, entry);
    if (duplicate) {
      throw new ApiError(409, "duplicate_term", `“${entry.term}” 已经存在，请合并信息而不是重复添加。`, { duplicate });
    }
    entries.push(entry);
    action = "added";
  } else if (mutation.type === "update") {
    const candidateEntry = mutation.entry;
    const index = entries.findIndex((candidate) => candidate.id === candidateEntry.id);
    if (index < 0) throw new ApiError(409, "entry_missing", "这条词已经被远端删除，请刷新后决定是否重新添加。");
    const existing = entries[index];
    if (existing.updatedAt !== mutation.expectedUpdatedAt) {
      throw new ApiError(409, "entry_changed", "这条词已在远端更新，草稿没有覆盖它。", { remote: existing });
    }
    const requireStructured = LEXICAL_ENTRY_TYPES.has(candidateEntry.entryType)
      && (existing.senses.length > 0
        || candidateEntry.senses.length > 0
        || STRUCTURED_ORGANIZATION_METHODS.has(existing.organizationMethod)
        || STRUCTURED_ORGANIZATION_METHODS.has(candidateEntry.organizationMethod));
    entry = prepareEntry(candidateEntry, existing, now, requireStructured, !STRUCTURED_ORGANIZATION_METHODS.has(existing.organizationMethod));
    const duplicate = findDuplicate(entries, entry, existing.id);
    if (duplicate) {
      throw new ApiError(409, "duplicate_term", `“${entry.term}” 与已有词条冲突，请合并信息。`, { duplicate });
    }
    entries[index] = entry;
    if (existing.term !== entry.term) rewriteSynonymReferences(entries, existing.term, entry.term, entry.id, now);
    action = "updated";
  } else {
    const index = entries.findIndex((candidate) => candidate.id === mutation.id);
    if (index < 0) {
      const snapshot = PublicSnapshotSchema.parse({
        ...remote,
        exportedAt: now,
        revisionId: crypto.randomUUID(),
        lastMutationId: request.mutationId
      });
      return { snapshot, entry: null, action: "idempotent" };
    }
    const existing = entries[index];
    if (existing.updatedAt !== mutation.expectedUpdatedAt) {
      throw new ApiError(409, "entry_changed", "远端词条在删除前已被修改，已停止删除。", { remote: existing });
    }
    entry = existing;
    entries.splice(index, 1);
    rewriteSynonymReferences(entries, existing.term, "", existing.id, now);
    action = "deleted";
  }

  const parsedSnapshot = PublicSnapshotSchema.safeParse({
    schemaVersion: 3,
    exportedAt: now,
    revisionId: crypto.randomUUID(),
    lastMutationId: request.mutationId,
    entries
  });
  if (!parsedSnapshot.success) {
    const danglingSynonyms = parsedSnapshot.error.issues.filter((issue) => issue.message === "synonym must reference another published entry term");
    if (danglingSynonyms.length) {
      throw new ApiError(
        400,
        "invalid_synonym_reference",
        "同义词只能引用卓已经输入并发布的其他词条；请先发布目标词条或移除该同义词。",
        danglingSynonyms
      );
    }
    throw new ApiError(400, "invalid_snapshot", "本次修改后的公开词库没有通过完整性校验。", parsedSnapshot.error.issues);
  }
  return { snapshot: parsedSnapshot.data, entry, action };
}
