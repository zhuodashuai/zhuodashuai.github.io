import { normalizeEnglish, validateEnglishInput } from "./wordbook-schema.js?v=73";

const ENTRY_FIELDS = ["id", "revision", "term", "normalized", "meaning", "note", "createdAt", "updatedAt"];
const EDIT_FIELDS = ["term", "meaning", "note"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const copy = (value) => structuredClone(value);
const userKey = (value) => {
  if (typeof value !== "string" || !value || value.length > 180) throw new Error("尚未确认当前账号。");
  return value;
};
const text = (value, maximum, label) => {
  if (typeof value !== "string" || [...value].length > maximum || /[^\P{Cc}\n\t]|\p{Cf}/u.test(value)) throw new Error(`${label}格式不正确或过长。`);
  return value;
};
const time = (value) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("个人词条时间格式不正确。");
  return value;
};

export function validatePersonalUsername(value) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(value)) throw new Error("用户名需以英文字母开头，共 3–24 位字母、数字或下划线。");
  return value.toLowerCase();
}

export function validatePersonalPassword(value) {
  if (typeof value !== "string" || [...value].length < 15 || [...value].length > 128 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("密码需为 15–128 个字符，不能包含控制字符；空格会原样保留。");
  return value;
}

export function validatePersonalSession(value, now = Date.now()) {
  if (value?.authenticated !== true || typeof value.user?.id !== "string" || !UUID.test(value.user.id)
    || typeof value.user.username !== "string" || !/^[a-z][a-z0-9_]{2,23}$/.test(value.user.username)
    || typeof value.csrfToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.csrfToken)
    || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now) throw new Error("登录结果不完整或已过期，请重新登录。");
  return { authenticated: true, user: { id: value.user.id, username: value.user.username }, csrfToken: value.csrfToken, expiresAt: value.expiresAt };
}

export function validatePersonalInput(value) {
  const term = validateEnglishInput(text(value?.term, 200, "英文"));
  return { term, meaning: text(value?.meaning, 2000, "中文释义"), note: text(value?.note, 1000, "备注") };
}

export function validatePersonalEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== ENTRY_FIELDS.length || ENTRY_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(value, field))
    || typeof value.id !== "string" || !value.id.startsWith("member-") || !UUID.test(value.id.slice(7))
    || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("个人词条格式不正确。");
  const input = validatePersonalInput(value);
  if (value.normalized !== normalizeEnglish(input.term)) throw new Error("个人词条的英文索引不一致。");
  const createdAt = time(value.createdAt);
  const updatedAt = time(value.updatedAt);
  if (updatedAt < createdAt) throw new Error("个人词条时间顺序不正确。");
  return { id: value.id, revision: value.revision, ...input, normalized: value.normalized, createdAt, updatedAt };
}

export function validatePersonalList(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.entries) || value.entries.length > 1000) throw new Error("个人词本列表格式不正确。");
  const entries = value.entries.map(validatePersonalEntry);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length
    || new Set(entries.map((entry) => entry.normalized)).size !== entries.length) throw new Error("个人词本列表含重复词条。");
  return { entries, revision: value.revision };
}

export function personalDraft(entry = null) {
  const fields = Object.fromEntries(EDIT_FIELDS.map((key) => [key, entry?.[key] || ""]));
  return { id: entry?.id || null, revision: entry?.revision || null, ...fields, baseline: copy(fields) };
}

export function isPersonalDraftDirty(draft) {
  return Boolean(draft && EDIT_FIELDS.some((field) => draft[field] !== draft.baseline[field]));
}

/** Deliberately memory-only: no private words, credentials or recovery codes in browser storage. */
export function createPersonalDraftStore() {
  const drafts = new Map();
  return {
    read(uid) { const value = drafts.get(userKey(uid)); return value ? copy(value) : null; },
    write(uid, value) {
      const allowed = ["id", "revision", ...EDIT_FIELDS, "baseline"];
      if (!value || Object.keys(value).length !== allowed.length || allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
        || !value.baseline || Object.keys(value.baseline).length !== 3 || EDIT_FIELDS.some((key) => typeof value.baseline[key] !== "string")) throw new Error("当前页面草稿格式不正确。");
      // An unfinished textarea may temporarily exceed its Unicode-point limit
      // or contain an invalid paste. Preserve it in memory, but validate the
      // complete entry before any network write instead of throwing on input.
      for (const [field, maximum] of [["term", 400], ["meaning", 4000], ["note", 2000]]) {
        if (typeof value[field] !== "string" || value[field].length > maximum) throw new Error("当前页面草稿过长。");
      }
      drafts.set(userKey(uid), copy(value));
    },
    clear(uid) { if (uid === undefined) drafts.clear(); else drafts.delete(userKey(uid)); },
    hasUnsaved() { return [...drafts.values()].some(isPersonalDraftDirty); },
    retainOnly(uid) { for (const key of drafts.keys()) if (key !== userKey(uid)) drafts.delete(key); }
  };
}

/** Same uncertain mutation gets the same ID; any changed payload gets a fresh ID. */
export function createPersonalMutationTracker({ newId = () => globalThis.crypto.randomUUID() } = {}) {
  const records = new Map();
  return {
    idFor(uid, slot, payload) {
      const key = JSON.stringify([userKey(uid), slot]);
      const fingerprint = JSON.stringify(payload);
      const existing = records.get(key);
      if (existing?.fingerprint === fingerprint) return existing.id;
      const id = newId();
      records.set(key, { uid, fingerprint, id });
      return id;
    },
    clear(uid, slot) {
      if (uid === undefined) records.clear();
      else if (slot !== undefined) records.delete(JSON.stringify([userKey(uid), slot]));
      else for (const [key, record] of records) if (record.uid === userKey(uid)) records.delete(key);
    },
    retainOnly(uid) { for (const [key, record] of records) if (record.uid !== userKey(uid)) records.delete(key); }
  };
}

/** A response from an older login or page lifecycle can never regain authority. */
export function createPersonalSessionScope() {
  let generation = 0;
  let uid = null;
  const controllers = new Set();
  const current = (token) => token.generation === generation && token.uid === uid;
  return {
    advance(userId = null) {
      if (userId !== null) userKey(userId);
      generation += 1;
      uid = userId;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
    capture() { return { generation, uid }; },
    current,
    request() {
      const token = { generation, uid };
      const controller = new AbortController();
      controllers.add(controller);
      return { signal: controller.signal, current: () => !controller.signal.aborted && current(token), release: () => controllers.delete(controller) };
    }
  };
}

/** Wall-clock expiry also applies while a reader stays on the same focused page. */
export function createPersonalExpiryTimer({ now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, maximumDelay = 2_147_483_647 } = {}) {
  let timer = null;
  let generation = 0;
  const clear = () => {
    generation += 1;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  return {
    clear,
    schedule({ expiresAt, isCurrent, onExpire }) {
      clear();
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error("登录到期时间不正确。");
      const activeGeneration = generation;
      const check = () => {
        if (activeGeneration !== generation || !isCurrent()) return;
        timer = null;
        const remaining = expiresAt - now();
        if (remaining <= 0) { onExpire(); return; }
        // setTimeout overflows beyond ~24.8 days. Recheck the wall clock rather
        // than allowing a long session to expire immediately or drift forever.
        timer = setTimer(check, Math.min(remaining, maximumDelay));
      };
      check();
    }
  };
}

export function serializePersonalExport(entries, username, exportedAt = new Date().toISOString()) {
  if (typeof username !== "string" || !/^[a-z][a-z0-9_]{2,23}$/.test(username)) throw new Error("账号名称不正确。");
  const validated = validatePersonalList({ entries, revision: 0 });
  return JSON.stringify({ format: "zhuo-private-wordbook", version: 1, exportedAt: time(exportedAt), username, entries: validated.entries }, null, 2);
}
