const BASE_NAME = "wordbook-quick-notes";
const FORMAT = "zhuo-quick-notes";
const NOTE_FIELDS = ["schemaVersion", "id", "text", "createdAt", "updatedAt", "revision"];

/** Text length uses UTF-16 code units, matching textarea.maxLength; backup size uses UTF-8 bytes. */
export const QUICK_NOTES_LIMITS = Object.freeze({ maxTextLength: 50000, maxNotes: 100, maxBackupBytes: 10 * 1024 * 1024 });

function fields(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== expected.length
    || expected.some((key) => !Object.prototype.hasOwnProperty.call(value, key)
      || !Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), "value"))) {
    throw new Error("随手记字段不正确，不接受额外数据或登录信息。");
  }
}

function validateText(text) {
  if (typeof text !== "string" || text.length > QUICK_NOTES_LIMITS.maxTextLength) throw new Error("每页随手记最多可保存 50,000 个字符。");
  return text;
}
function validateId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,179}$/u.test(id)) throw new Error("随手记 ID 不正确。");
}
function validateTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("随手记必须使用标准 ISO 时间。");
  return value;
}
function byteLength(text) { return new TextEncoder().encode(text).byteLength; }

export function validateQuickNote(value) {
  fields(value, NOTE_FIELDS);
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("随手记版本不受支持。");
  validateId(value.id); validateText(value.text); validateTime(value.createdAt); validateTime(value.updatedAt);
  if (value.updatedAt < value.createdAt) throw new Error("随手记更新时间不能早于创建时间。");
  return { schemaVersion: 1, id: value.id, text: value.text, createdAt: value.createdAt, updatedAt: value.updatedAt, revision: value.revision };
}

function validateNotes(notes) {
  if (!Array.isArray(notes) || notes.length > QUICK_NOTES_LIMITS.maxNotes
    || Object.getPrototypeOf(notes) !== Array.prototype || Reflect.ownKeys(notes).length !== notes.length + 1
    || Array.from({ length: notes.length }, (_, index) => Object.getOwnPropertyDescriptor(notes, String(index))).some((descriptor) => !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value"))) throw new Error("随手记最多保存 100 页，备份列表格式必须正确。");
  const result = notes.map(validateQuickNote);
  if (new Set(result.map(({ id }) => id)).size !== result.length) throw new Error("随手记备份包含重复 ID。");
  return result;
}

export function buildQuickNotesBackup(notes, exportedAt = new Date().toISOString()) {
  validateTime(exportedAt);
  const document = { format: FORMAT, schemaVersion: 1, exportedAt, notes: validateNotes(notes) };
  if (byteLength(JSON.stringify(document)) > QUICK_NOTES_LIMITS.maxBackupBytes) throw new Error("随手记备份不能超过 10 MB，请先复制较早的内容到安全位置。");
  return document;
}

/** Strict, local-only backup boundary. Text is preserved literally; it is never interpreted as HTML. */
export function parseQuickNotesBackup(candidate) {
  let document = candidate;
  if (typeof document === "string") {
    if (byteLength(document) > QUICK_NOTES_LIMITS.maxBackupBytes) throw new Error("随手记备份不能超过 10 MB。");
    try { document = JSON.parse(document); } catch { throw new Error("随手记备份不是有效 JSON。"); }
  }
  fields(document, ["format", "schemaVersion", "exportedAt", "notes"]);
  if (document.format !== FORMAT || document.schemaVersion !== 1) throw new Error("这不是受支持的随手记备份。");
  return buildQuickNotesBackup(document.notes, document.exportedAt);
}

export function resolveQuickNotesDatabaseName(location = globalThis.location) {
  if (location && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
    const parameters = new URLSearchParams(location.search || "");
    if (parameters.get("e2e") === "1") {
      const run = String(parameters.get("testRun") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
      return `${BASE_NAME}-e2e${run ? `-${run}` : ""}`;
    }
  }
  return BASE_NAME;
}

/** Separate from vocabulary, drafts, quizzes, and review scheduling. No network or fallback storage. */
export function createQuickNotesStorage({ indexedDB: factory, name = resolveQuickNotesDatabaseName(), now = () => new Date().toISOString(), newId = () => globalThis.crypto.randomUUID(), openTimeoutMs = 3000, BroadcastChannel: Channel = typeof window !== "undefined" ? globalThis.BroadcastChannel : undefined } = {}) {
  if (!Number.isSafeInteger(openTimeoutMs) || openTimeoutMs < 1) throw new TypeError("随手记打开超时必须为正整数。");
  let databasePromise;
  let channel;
  const listeners = new Set();
  const timestamp = () => validateTime(now());
  const notify = (external = false) => {
    for (const listener of listeners) {
      try { listener({ type: "change", external }); } catch { /* A view must not invalidate a committed write. */ }
    }
    if (!external && channel) { try { channel.postMessage({ type: "change" }); } catch { /* Notification is not the source of truth. */ } }
  };
  function connectChannel() {
    if (channel || !Channel) return;
    try {
      channel = new Channel(`${name}-changes`);
      channel.onmessage = (event) => { if (event.data?.type === "change") notify(true); };
    } catch { channel = undefined; }
  }
  function open() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const implementation = factory || globalThis.indexedDB;
      if (!implementation) { reject(new Error("浏览器未提供本地存储，不能保存随手记。请先复制输入内容。")); return; }
      let request;
      try { request = implementation.open(name, 1); } catch (error) { reject(error); return; }
      let failed = false;
      const timer = setTimeout(() => { failed = true; reject(new Error("打开随手记超时，输入内容尚未保存。请先复制内容后重试。")); }, openTimeoutMs);
      const fail = (error) => { failed = true; clearTimeout(timer); reject(error); };
      request.onupgradeneeded = () => {
        if (failed) { request.transaction.abort(); return; }
        request.result.createObjectStore("notes", { keyPath: "id" });
      };
      request.onerror = () => fail(request.error || new Error("无法打开随手记，请先复制输入内容后重试。"));
      request.onblocked = () => fail(new Error("随手记被旧页面占用，请关闭旧页面后重试。输入内容尚未保存。"));
      request.onsuccess = () => {
        clearTimeout(timer);
        const database = request.result;
        if (failed) { database.close(); return; }
        database.onversionchange = () => { database.close(); databasePromise = undefined; };
        resolve(database);
      };
    }).catch((error) => { databasePromise = undefined; throw error; });
    return databasePromise;
  }
  async function read(action) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("notes", "readonly");
      const request = action(transaction.objectStore("notes"));
      let value;
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || request.error || new Error("无法读取随手记，请重试。"));
    });
  }
  function freshId(existing) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const id = newId(); validateId(id);
      if (!existing.has(id)) return id;
    }
    throw new Error("无法生成新的随手记 ID，请重试；原内容未被覆盖。");
  }
  async function change(operation) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("notes", "readwrite");
      const store = transaction.objectStore("notes");
      const request = store.getAll();
      let result;
      let failure;
      let changed = false;
      transaction.oncomplete = () => { if (changed) { connectChannel(); notify(); } resolve(result); };
      transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || new Error("随手记保存失败，请保留输入并重试。"));
      request.onsuccess = () => {
        try {
          const existing = new Map(validateNotes(request.result).map((note) => [note.id, note]));
          const plan = operation(existing);
          buildQuickNotesBackup([...plan.notes.values()], timestamp());
          for (const note of plan.changes) store.put(note);
          changed = plan.changes.length > 0;
          result = plan.result;
        } catch (error) { failure = error; transaction.abort(); }
      };
    });
  }
  return {
    async listQuickNotes() {
      return validateNotes(await read((store) => store.getAll())).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    },
    async getQuickNote(id) {
      validateId(id);
      const note = await read((store) => store.get(id));
      return note === undefined ? null : validateQuickNote(note);
    },
    async createQuickNote(text = "") {
      validateText(text);
      return change((notes) => {
        const at = timestamp();
        const note = validateQuickNote({ schemaVersion: 1, id: freshId(notes), text, createdAt: at, updatedAt: at, revision: 0 });
        notes.set(note.id, note);
        return { notes, changes: [note], result: note };
      });
    },
    async saveQuickNote(candidate) {
      fields(candidate, ["id", "text", "expectedRevision"]);
      const { id, text, expectedRevision } = candidate;
      validateId(id); validateText(text);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("保存随手记需要明确的版本号。");
      return change((notes) => {
        const current = notes.get(id);
        if (current?.text === text) return { notes, changes: [], result: { note: current, conflictCopy: false, unchanged: true } };
        const conflictCopy = !current || current.revision !== expectedRevision;
        const at = timestamp();
        const note = conflictCopy
          ? { schemaVersion: 1, id: freshId(notes), text, createdAt: at, updatedAt: at, revision: 0 }
          : { ...current, text, updatedAt: at < current.updatedAt ? current.updatedAt : at, revision: current.revision + 1 };
        validateQuickNote(note);
        notes.set(note.id, note);
        return { notes, changes: [note], result: { note, conflictCopy, unchanged: false } };
      });
    },
    async exportQuickNotesBackup() { return buildQuickNotesBackup(await this.listQuickNotes(), timestamp()); },
    async importQuickNotesBackup(candidate) {
      const incoming = parseQuickNotesBackup(candidate).notes;
      return change((notes) => {
        const changes = [];
        const result = { added: 0, unchanged: 0, conflictCopies: 0 };
        for (const original of incoming) {
          // A restored note must never overwrite newer input. Reimporting the same text is idempotent.
          const conflict = notes.has(original.id);
          if (conflict && [...notes.values()].some((note) => note.text === original.text)) { result.unchanged += 1; continue; }
          const note = conflict ? { ...original, id: freshId(notes) } : original;
          notes.set(note.id, note); changes.push(note);
          result.added += 1;
          if (conflict) result.conflictCopies += 1;
        }
        return { notes, changes, result };
      });
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("随手记订阅者必须是函数。");
      listeners.add(listener); connectChannel();
      return () => { listeners.delete(listener); if (!listeners.size && channel) { channel.close(); channel = undefined; } };
    },
    async close() {
      if (channel) { channel.close(); channel = undefined; }
      listeners.clear();
      const pending = databasePromise; databasePromise = undefined;
      if (pending) (await pending).close();
    }
  };
}

export const quickNotesStorage = createQuickNotesStorage();
