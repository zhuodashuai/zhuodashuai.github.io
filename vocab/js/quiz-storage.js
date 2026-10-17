import { validateQuizAttempt } from "./chapter-quiz.js?v=72";

const BASE_NAME = "wordbook-chapter-quizzes";
const FIXED_ATTEMPT_FIELDS = ["schemaVersion", "id", "bookId", "chapterId", "bookTitle", "chapterTitle", "startedAt", "questions", "omitted", "kind", "practiceSourceAttemptId"];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function fields(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
    || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) throw new Error("测试备份记录的字段不正确，不接受登录信息或额外数据。");
}
function text(value, maximum = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new Error("测试备份记录的文本不正确或过长。");
}
function time(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("测试备份记录必须使用标准 ISO 时间。");
}

/** Strict backup boundary; ordinary quiz writes retain their existing schema. */
export function validateQuizBackupAttempt(candidate) {
  fields(candidate, ["schemaVersion", "id", "revision", "bookId", "chapterId", "bookTitle", "chapterTitle", "startedAt", "updatedAt", "completedAt", "questions", "omitted", "answers"], ["kind", "practiceSourceAttemptId"]);
  for (const key of ["id", "bookId", "chapterId"]) text(candidate[key], 180);
  for (const key of ["bookTitle", "chapterTitle"]) text(candidate[key], 500);
  if (candidate.kind !== undefined && candidate.kind !== "mistakes") throw new Error("测试备份记录的类型不受支持。");
  if (candidate.practiceSourceAttemptId !== undefined) {
    text(candidate.practiceSourceAttemptId, 180);
    if (candidate.kind !== "mistakes") throw new Error("错词练习来源与测试类型不匹配。");
  }
  time(candidate.startedAt); time(candidate.updatedAt);
  if (candidate.completedAt !== null) time(candidate.completedAt);
  if (!Array.isArray(candidate.questions) || !Array.isArray(candidate.omitted) || !Array.isArray(candidate.answers)
    || candidate.questions.length > 10000 || candidate.omitted.length > 10000 || candidate.answers.length > 10000) throw new Error("测试备份记录的题目或答案数量不正确。");
  for (const question of candidate.questions) {
    fields(question, ["id", "entryId", "term", "meaning", "partOfSpeech", "options", "correctOptionId"]);
    text(question.id, 180); text(question.entryId, 180); text(question.term, 2000); text(question.meaning, 20000); text(question.correctOptionId, 400);
    if (typeof question.partOfSpeech !== "string" || question.partOfSpeech.length > 200) throw new Error("测试备份记录的词性不正确。");
    if (!Array.isArray(question.options) || question.options.length !== 4) throw new Error("每题必须有四个不同的选项。");
    for (const option of question.options) {
      fields(option, ["id", "meaning", "sourceEntryId"]);
      text(option.id, 400); text(option.meaning, 20000); text(option.sourceEntryId, 180);
    }
  }
  for (const omitted of candidate.omitted) {
    fields(omitted, ["entryId", "term", "reason"]);
    text(omitted.entryId, 180); text(omitted.term, 2000);
    if (!["missing-meaning", "ambiguous-headword", "insufficient-distinct-options", "missing-entry"].includes(omitted.reason)) throw new Error("测试备份记录的未出题原因不正确。");
  }
  for (const answer of candidate.answers) {
    fields(answer, ["questionId", "optionId", "correct", "at"]);
    text(answer.questionId, 180); text(answer.optionId, 400); time(answer.at);
    if (typeof answer.correct !== "boolean") throw new Error("测试备份记录的答案格式不正确。");
  }
  return structuredClone(validateQuizAttempt(candidate));
}

export function planQuizAttemptMerge(current, candidate) {
  const incoming = validateQuizBackupAttempt(candidate);
  if (!current) return { action: "add", value: incoming };
  const local = validateQuizBackupAttempt(current);
  if (local.id !== incoming.id) throw new Error("测试记录 ID 不一致。");
  if (same(local, incoming)) return { action: "unchanged" };
  if (FIXED_ATTEMPT_FIELDS.some((key) => !same(local[key], incoming[key]))) return { action: "conflict" };
  if (local.revision > incoming.revision || Date.parse(local.updatedAt) > Date.parse(incoming.updatedAt)) return { action: "keep-local" };
  if (local.revision === incoming.revision || !same(local.answers, incoming.answers.slice(0, local.answers.length))) return { action: "conflict" };
  return { action: "update", value: incoming };
}

export function planQuizAttemptsMerge(currentAttempts, candidates) {
  if (!Array.isArray(currentAttempts) || !Array.isArray(candidates) || candidates.length > 2000) throw new Error("测试记录数量或格式不正确。");
  const local = new Map();
  for (const candidate of currentAttempts) {
    const attempt = validateQuizBackupAttempt(candidate);
    if (local.has(attempt.id)) throw new Error("本机测试记录包含重复的 ID。");
    local.set(attempt.id, attempt);
  }
  const incoming = candidates.map(validateQuizBackupAttempt);
  if (new Set(incoming.map(({ id }) => id)).size !== incoming.length) throw new Error("备份测试记录包含重复的 ID。");
  const result = { added: 0, updated: 0, unchanged: 0, keptLocal: 0, conflicts: 0, changes: [] };
  const counts = { add: "added", update: "updated", unchanged: "unchanged", "keep-local": "keptLocal", conflict: "conflicts" };
  for (const candidate of incoming) {
    const decision = planQuizAttemptMerge(local.get(candidate.id), candidate);
    result[counts[decision.action]] += 1;
    if (decision.value) result.changes.push(decision.value);
  }
  return result;
}

export class QuizConflictError extends Error {
  constructor() {
    super("这次测试已在另一页面更新，请载入最新进度后继续。");
    this.name = "QuizConflictError";
  }
}

export function resolveQuizDatabaseName(location = globalThis.location) {
  if (location && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
    const parameters = new URLSearchParams(location.search || "");
    if (parameters.get("e2e") === "1") {
      const run = String(parameters.get("testRun") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
      return `${BASE_NAME}-e2e${run ? `-${run}` : ""}`;
    }
  }
  return BASE_NAME;
}

/** A separate local-only database: quiz writes cannot alter cards or review scheduling. */
export function createQuizStorage({ indexedDB: factory, name = resolveQuizDatabaseName() } = {}) {
  let databasePromise;
  function open() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const implementation = factory || globalThis.indexedDB;
      if (!implementation) { reject(new Error("浏览器未提供本地存储，不能保存测试记录。")); return; }
      let request;
      try { request = implementation.open(name, 1); } catch (error) { reject(error); return; }
      let failed = false;
      request.onupgradeneeded = () => request.result.createObjectStore("attempts", { keyPath: "id" });
      request.onerror = () => reject(request.error || new Error("无法打开测试记录。"));
      request.onblocked = () => { failed = true; reject(new Error("测试记录被其他页面占用，请关闭旧页面后重试。")); };
      request.onsuccess = () => {
        const db = request.result;
        if (failed) { db.close(); return; }
        db.onversionchange = () => { db.close(); databasePromise = undefined; };
        resolve(db);
      };
    }).catch((error) => { databasePromise = undefined; throw error; });
    return databasePromise;
  }

  async function read(action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("attempts", "readonly");
      let value;
      const request = action(transaction.objectStore("attempts"));
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || request.error || new Error("无法读取测试记录。"));
    });
  }

  async function write(attempt, expectedRevision, isCreate) {
    const incoming = structuredClone(validateQuizAttempt(attempt));
    if (isCreate && incoming.revision !== 0) throw new Error("新测试不能包含已有答案。");
    if (!isCreate && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || incoming.revision !== expectedRevision + 1)) throw new Error("测试记录版本无效。");
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("attempts", "readwrite");
      const store = transaction.objectStore("attempts");
      const request = store.get(incoming.id);
      let failure;
      transaction.oncomplete = () => resolve(structuredClone(incoming));
      transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || new Error("保存测试记录失败，请重试。"));
      request.onsuccess = () => {
        try {
          const stored = request.result;
          if (isCreate) {
            if (stored) throw new QuizConflictError();
            store.add(incoming);
          } else {
            if (!stored || stored.revision !== expectedRevision) throw new QuizConflictError();
            validateQuizAttempt(stored);
            if (FIXED_ATTEMPT_FIELDS.some((key) => JSON.stringify(stored[key]) !== JSON.stringify(incoming[key]))
              || JSON.stringify(stored.answers) !== JSON.stringify(incoming.answers.slice(0, -1))) throw new Error("测试题目和已经提交的答案不能改写。");
            store.put(incoming);
          }
        } catch (error) { failure = error; transaction.abort(); }
      };
    });
  }

  return {
    createAttempt: (attempt) => write(attempt, null, true),
    saveAttempt: (attempt, { expectedRevision } = {}) => write(attempt, expectedRevision, false),
    async getAttempt(id) {
      const attempt = await read((store) => store.get(id));
      return attempt ? validateQuizAttempt(attempt) : null;
    },
    async listAttempts({ bookId, chapterId } = {}) {
      const attempts = await read((store) => store.getAll());
      return attempts.filter((attempt) => (!bookId || attempt.bookId === bookId) && (!chapterId || attempt.chapterId === chapterId))
        .map((attempt) => validateQuizAttempt(attempt))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
    },
    async mergeAttempts(candidates) {
      const incoming = planQuizAttemptsMerge([], candidates).changes;
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("attempts", "readwrite");
        const store = transaction.objectStore("attempts");
        const request = store.getAll();
        let result;
        let failure;
        transaction.oncomplete = () => { const { changes, ...summary } = result; resolve(summary); };
        transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || new Error("测试记录合并失败，请重试。"));
        request.onsuccess = () => {
          try {
            result = planQuizAttemptsMerge(request.result, incoming);
            for (const attempt of result.changes) store.put(attempt);
          } catch (error) { failure = error; transaction.abort(); }
        };
      });
    },
    async close() { if (databasePromise) { (await databasePromise).close(); databasePromise = undefined; } }
  };
}

export const quizStorage = createQuizStorage();
