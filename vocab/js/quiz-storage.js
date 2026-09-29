import { validateQuizAttempt } from "./chapter-quiz.js";

const BASE_NAME = "wordbook-chapter-quizzes";

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
            const fixed = ["schemaVersion", "id", "bookId", "chapterId", "bookTitle", "chapterTitle", "startedAt", "questions", "omitted"];
            if (fixed.some((key) => JSON.stringify(stored[key]) !== JSON.stringify(incoming[key]))
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
    async close() { if (databasePromise) { (await databasePromise).close(); databasePromise = undefined; } }
  };
}

export const quizStorage = createQuizStorage();
