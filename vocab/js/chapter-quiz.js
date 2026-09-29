import { canonicalPartOfSpeech, isPlausibleChineseMeaning, meaningItemsForDisplay, normalizeEnglish } from "./wordbook-schema.js";
import { buildSynonymGroups } from "./synonym-groups.js";

export const QUIZ_SCHEMA_VERSION = 1;

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}不能为空。`);
  return value.trim();
}

function isoTime(value) {
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) throw new Error("测试时间无效。");
  return time.toISOString();
}

export function shuffleQuizItems(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error("随机数必须位于 0（含）到 1（不含）之间。");
    const target = Math.floor(sample * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function definitionText(entry) {
  return meaningItemsForDisplay(entry).map((item) => String(item)
    .replace(/^(?:[①-⑳]|\d+[.、)）])\s*/u, "")
    .replace(/^(?:(?:countable|uncountable|plural)\s+)?(?:noun|verb|adjective|adverb|phrasal verb|verb phrase|idiom|phrase|n\.|v\.|adj\.|adv\.)\s*[:：·]\s*/iu, "")
    .trim()).filter(Boolean).join("；");
}

function meaningParts(value) {
  return String(value).normalize("NFKC").split(/[；;、,，。.!！?？\n]/u)
    .map((part) => part.replace(/\([^)]*\)|（[^）]*）/gu, "").replace(/[^\p{Script=Han}]/gu, "").replace(/[的地得了着]+$/u, ""))
    .filter((part) => part.length >= 2);
}

/** Conservative lexical collision check, not a claim to semantic equivalence. */
export function quizMeaningsOverlap(left, right) {
  const a = meaningParts(left);
  const b = meaningParts(right);
  for (const first of a) {
    for (const second of b) {
      if (first.includes(second) || second.includes(first)) return true;
      // A shared two-character content fragment is enough to avoid using a
      // potentially equivalent translation as a wrong answer.
      for (let index = 0; index < first.length - 1; index += 1) {
        if (second.includes(first.slice(index, index + 2))) return true;
      }
    }
  }
  return false;
}

function pairKey(first, second) { return [first, second].sort().join("\u0000"); }

export function createChapterQuiz(entries, {
  bookId, chapterId, bookTitle = bookId, chapterTitle = chapterId,
  now = new Date(), random = Math.random, id = globalThis.crypto?.randomUUID?.()
} = {}) {
  if (!Array.isArray(entries)) throw new Error("章节词条必须是数组。");
  const startedAt = isoTime(now);
  const attempt = {
    schemaVersion: QUIZ_SCHEMA_VERSION,
    id: requiredText(id, "测试 ID"), revision: 0,
    bookId: requiredText(bookId, "单词本"), chapterId: requiredText(chapterId, "章节"),
    bookTitle: requiredText(bookTitle, "单词本名称"), chapterTitle: requiredText(chapterTitle, "章节名称"),
    startedAt, updatedAt: startedAt, completedAt: null,
    questions: [], omitted: [], answers: []
  };
  const seenIds = new Set();
  const normalizedCounts = new Map();
  for (const entry of entries) {
    const key = normalizeEnglish(entry?.term);
    if (!normalizedCounts.has(key)) normalizedCounts.set(key, new Set());
    normalizedCounts.get(key).add(entry?.id);
  }
  const candidates = [];
  for (const entry of entries) {
    const entryId = requiredText(entry?.id, "词条 ID");
    if (seenIds.has(entryId)) continue;
    seenIds.add(entryId);
    const term = requiredText(entry.term, "英文词条");
    const meaning = definitionText(entry);
    if (!isPlausibleChineseMeaning(meaning, term)) {
      attempt.omitted.push({ entryId, term, reason: "missing-meaning" });
    } else if (normalizedCounts.get(normalizeEnglish(term)).size > 1) {
      attempt.omitted.push({ entryId, term, reason: "ambiguous-headword" });
    } else {
      candidates.push({ entry, entryId, term, meaning, partOfSpeech: String(entry.partOfSpeech || ""), pos: canonicalPartOfSpeech(entry.partOfSpeech) });
    }
  }
  const synonymPairs = new Set();
  for (const group of buildSynonymGroups(candidates.map(({ entry }) => entry))) {
    for (const left of group.members) for (const right of group.members) {
      if (left.entry.id !== right.entry.id) synonymPairs.add(pairKey(left.entry.id, right.entry.id));
    }
  }
  const conflicts = (left, right) => left.entryId === right.entryId
    || normalizeEnglish(left.term) === normalizeEnglish(right.term)
    || synonymPairs.has(pairKey(left.entryId, right.entryId))
    || quizMeaningsOverlap(left.meaning, right.meaning);
  for (const target of shuffleQuizItems(candidates, random)) {
    const pool = shuffleQuizItems(candidates.filter((candidate) => !conflicts(target, candidate)), random);
    pool.sort((left, right) => Number(right.pos === target.pos && Boolean(target.pos)) - Number(left.pos === target.pos && Boolean(target.pos)));
    const selected = [];
    for (const candidate of pool) {
      if (!selected.some((previous) => conflicts(previous, candidate))) selected.push(candidate);
      if (selected.length === 3) break;
    }
    if (selected.length !== 3) {
      attempt.omitted.push({ entryId: target.entryId, term: target.term, reason: "insufficient-distinct-options" });
      continue;
    }
    // Options use independent identifiers, never a correct-answer index.
    const options = shuffleQuizItems([target, ...selected], random).map((candidate, index) => ({
      id: `${target.entryId}:option-${index + 1}`, meaning: candidate.meaning,
      sourceEntryId: candidate.entryId
    }));
    attempt.questions.push({
      id: target.entryId, entryId: target.entryId, term: target.term,
      meaning: target.meaning, partOfSpeech: target.partOfSpeech,
      options, correctOptionId: options.find((option) => option.sourceEntryId === target.entryId).id
    });
  }
  return attempt;
}

export function validateQuizAttempt(attempt, { allowEmpty = false } = {}) {
  if (!attempt || attempt.schemaVersion !== QUIZ_SCHEMA_VERSION) throw new Error("不支持的测试记录格式。");
  for (const key of ["id", "bookId", "chapterId", "bookTitle", "chapterTitle"]) requiredText(attempt[key], key);
  if (!Array.isArray(attempt.questions) || (!allowEmpty && !attempt.questions.length) || attempt.questions.length > 10000) throw new Error("测试题目无效。");
  if (!Array.isArray(attempt.omitted) || !Array.isArray(attempt.answers) || attempt.answers.length > attempt.questions.length
    || !Number.isSafeInteger(attempt.revision) || attempt.revision !== attempt.answers.length) throw new Error("测试答题进度无效。");
  const started = Date.parse(isoTime(attempt.startedAt));
  const updated = Date.parse(isoTime(attempt.updatedAt));
  if (updated < started) throw new Error("测试时间顺序无效。");
  const seen = new Set();
  for (const question of attempt.questions) {
    requiredText(question.id, "题目 ID");
    if (seen.has(question.id)) throw new Error("测试题目重复。");
    seen.add(question.id);
    for (const key of ["entryId", "term", "meaning", "correctOptionId"]) requiredText(question[key], key);
    if (!Array.isArray(question.options) || question.options.length !== 4 || new Set(question.options.map(({ id }) => id)).size !== 4
      || new Set(question.options.map(({ meaning }) => meaning)).size !== 4) throw new Error("每题必须有四个不同的选项。");
    for (const option of question.options) {
      requiredText(option.id, "选项 ID"); requiredText(option.meaning, "选项释义");
    }
    if (question.options.find((option) => option.id === question.correctOptionId)?.meaning !== question.meaning) throw new Error("正确答案与题目释义不匹配。");
  }
  let lastTime = started;
  for (const [index, answer] of attempt.answers.entries()) {
    const question = attempt.questions[index];
    const time = Date.parse(isoTime(answer.at));
    if (answer.questionId !== question.id || !question.options.some((option) => option.id === answer.optionId)
      || answer.correct !== (answer.optionId === question.correctOptionId) || time < lastTime || time > updated) throw new Error("测试答案无效。");
    lastTime = time;
  }
  const isCompleted = attempt.questions.length > 0 && attempt.answers.length === attempt.questions.length;
  if (isCompleted ? attempt.completedAt !== attempt.updatedAt : attempt.completedAt !== null) throw new Error("测试完成状态无效。");
  return attempt;
}

export function applyQuizAnswer(attempt, questionId, optionId, now = new Date()) {
  validateQuizAttempt(attempt);
  const question = attempt.questions[attempt.answers.length];
  if (!question || question.id !== questionId) throw new Error("请回答当前题目；已提交的答案不能重复或修改。");
  if (!question.options.some((option) => option.id === optionId)) throw new Error("请选择本题的有效选项。");
  const at = new Date(Math.max(Date.parse(isoTime(now)), Date.parse(attempt.updatedAt))).toISOString();
  const next = structuredClone(attempt);
  next.answers.push({ questionId, optionId, correct: optionId === question.correctOptionId, at });
  next.revision += 1;
  next.updatedAt = at;
  if (next.answers.length === next.questions.length) next.completedAt = at;
  return next;
}

export function summarizeQuizAttempt(attempt) {
  validateQuizAttempt(attempt, { allowEmpty: true });
  const correct = attempt.answers.filter((answer) => answer.correct).length;
  const wrongWords = attempt.answers.flatMap((answer, index) => {
    if (answer.correct) return [];
    const question = attempt.questions[index];
    return [{ entryId: question.entryId, questionId: question.id, term: question.term, meaning: question.meaning,
      selectedMeaning: question.options.find((option) => option.id === answer.optionId).meaning, at: answer.at }];
  });
  return { total: attempt.questions.length, answered: attempt.answers.length, correct, wrong: wrongWords.length,
    accuracy: attempt.answers.length ? Math.round(correct / attempt.answers.length * 1000) / 10 : null,
    wrongWords, completed: Boolean(attempt.completedAt) };
}
