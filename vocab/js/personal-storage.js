import { normalizeEnglish, validateEnglishInput } from "./wordbook-schema.js?v=77";
import { validatePersonalLearning } from "./personal-study.js?v=77";

const ENTRY_FIELDS = ["id", "revision", "term", "normalized", "meaning", "note", "createdAt", "updatedAt"];
const EDIT_FIELDS = ["term", "partOfSpeech", "meaning", "note"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OWNER_UID = "15604207-8000-4000-8000-000000000001";
const CONTEXT_LIMITS = { key: 320, entryId: 180, term: 2000, collectionId: 100, chapterId: 100, bookTitle: 500, chapterTitle: 500, sourceTitle: 500, page: 200, originalInput: 2000, meaning: 20000, definition: 12000, exampleEn: 5000, exampleZh: 5000, partOfSpeech: 200, phonetic: 300, usage: 12000 };
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
  const authType = value?.authType ?? "member";
  if (value?.authenticated !== true || typeof value.user?.id !== "string" || !UUID.test(value.user.id)
    || typeof value.user.username !== "string" || !/^[a-z][a-z0-9_]{2,23}$/.test(value.user.username)
    || !["member", "github-owner"].includes(authType)
    || (authType === "github-owner" && (value.user.id !== OWNER_UID || value.user.username !== "zhuodashuai"))
    || typeof value.csrfToken !== "string" || !(authType === "member" ? /^[A-Za-z0-9_-]{43}$/ : /^[A-Za-z0-9_-]{32,200}$/).test(value.csrfToken)
    || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now) throw new Error("登录结果不完整或已过期，请重新登录。");
  return { authenticated: true, user: { id: value.user.id, username: value.user.username }, csrfToken: value.csrfToken, expiresAt: value.expiresAt, ...(value.authType === undefined ? {} : { authType }) };
}

export function validatePersonalInput(value, { imported = false } = {}) {
  const raw = text(value?.term, imported ? 2000 : 200, "英文");
  // The already-packaged English expression is the only alphabet-free
  // exception; arbitrary numbers and non-English strings remain invalid.
  const term = raw.trim() === "24/7" ? "24/7" : validateEnglishInput(raw);
  return { term,
    ...(Object.prototype.hasOwnProperty.call(value || {}, "partOfSpeech") ? { partOfSpeech: text(value.partOfSpeech, 200, "词性") } : {}),
    meaning: text(value?.meaning, imported ? 20000 : 2000, "中文释义"), note: text(value?.note, 1000, "备注") };
}

export function validatePersonalSourceContext(value) {
  const fields = Object.keys(CONTEXT_LIMITS);
  if (!value || Object.keys(value).length !== fields.length || fields.some((field) => !Object.prototype.hasOwnProperty.call(value, field))) throw new Error("词条来源语境格式不正确。");
  const result = Object.fromEntries(fields.map((field) => [field, text(value[field], CONTEXT_LIMITS[field], "来源语境")]));
  if (!/^[A-Za-z0-9._:-]{1,180}$/.test(result.entryId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.collectionId)
    || !/^(?:all|chapter-\d+)$/.test(result.chapterId) || result.key !== `${result.entryId}:${result.collectionId}:${result.chapterId}`) throw new Error("词条来源章节索引不正确。");
  return result;
}

export function validatePersonalEntry(value) {
  const optional = ["partOfSpeech", "sourceContexts", "meaningEdited"].filter((field) => Object.prototype.hasOwnProperty.call(value || {}, field));
  const fields = [...ENTRY_FIELDS, ...optional];
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some((field) => !Object.prototype.hasOwnProperty.call(value, field))
    || typeof value.id !== "string" || !value.id.startsWith("member-") || !UUID.test(value.id.slice(7))
    || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("个人词条格式不正确。");
  if (value.sourceContexts !== undefined && (!Array.isArray(value.sourceContexts) || value.sourceContexts.length > 50)) throw new Error("词条来源语境过多或格式不正确。");
  const contexts = value.sourceContexts?.map(validatePersonalSourceContext);
  if (contexts && new Set(contexts.map((context) => context.key)).size !== contexts.length) throw new Error("词条来源语境重复。");
  if (value.meaningEdited !== undefined && typeof value.meaningEdited !== "boolean") throw new Error("自定义释义标记不正确。");
  const input = validatePersonalInput(value, { imported: Boolean(contexts?.length) });
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 128 * 1024) throw new Error("完整个人词条超过安全大小限制。");
  if (value.normalized !== normalizeEnglish(input.term)) throw new Error("个人词条的英文索引不一致。");
  const createdAt = time(value.createdAt);
  const updatedAt = time(value.updatedAt);
  if (updatedAt < createdAt) throw new Error("个人词条时间顺序不正确。");
  return { id: value.id, revision: value.revision, ...input, normalized: value.normalized, createdAt, updatedAt,
    ...(contexts === undefined ? {} : { sourceContexts: contexts }), ...(value.meaningEdited === undefined ? {} : { meaningEdited: value.meaningEdited }) };
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
  fields.partOfSpeech = entry?.partOfSpeech ?? entry?.selectedSourceContext?.partOfSpeech ?? entry?.sourceContexts?.[0]?.partOfSpeech ?? "";
  return { id: entry?.id || null, revision: entry?.revision || null, ...fields, baseline: copy(fields),
    ...(entry?.sourceContexts ? { sourceContexts: copy(entry.sourceContexts) } : {}), ...(typeof entry?.meaningEdited === "boolean" ? { meaningEdited: entry.meaningEdited } : {}) };
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
      const allowed = ["id", "revision", ...EDIT_FIELDS, "baseline", ...["sourceContexts", "meaningEdited"].filter((field) => Object.prototype.hasOwnProperty.call(value || {}, field))];
      if (!value || Object.keys(value).length !== allowed.length || allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
        || !value.baseline || Object.keys(value.baseline).length !== EDIT_FIELDS.length || EDIT_FIELDS.some((key) => typeof value.baseline[key] !== "string")) throw new Error("当前页面草稿格式不正确。");
      // An unfinished textarea may temporarily exceed its Unicode-point limit
      // or contain an invalid paste. Preserve it in memory, but validate the
      // complete entry before any network write instead of throwing on input.
      for (const [field, maximum] of [["term", value.sourceContexts?.length ? 4000 : 400], ["partOfSpeech", 400], ["meaning", value.sourceContexts?.length ? 40000 : 4000], ["note", 2000]]) {
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

export function serializePersonalExport(entries, username, exportedAt = new Date().toISOString(), reviews) {
  if (typeof username !== "string" || !/^[a-z][a-z0-9_]{2,23}$/.test(username)) throw new Error("账号名称不正确。");
  const validated = validatePersonalList({ entries, revision: 0 });
  const learning = reviews === undefined ? null : validatePersonalLearning({ revision: 0, reviews });
  const ids = new Set(validated.entries.map((entry) => entry.id));
  if (learning?.reviews.some((review) => !ids.has(review.entryId))) throw new Error("学习备份含不属于当前词本的记录。");
  return JSON.stringify({ format: "zhuo-private-wordbook", version: learning ? 2 : 1, exportedAt: time(exportedAt), username, entries: validated.entries,
    ...(learning ? { reviews: learning.reviews } : {}) }, null, 2);
}
