import { normalizeEnglish, validatePublicEntry } from "./wordbook-schema.js?v=82";

export function automaticDictionaryCollection(query, response) {
  if (typeof query !== "string" || /\p{Script=Han}/u.test(query) || !response || response.hasMore || response.results?.length !== 1) return false;
  const result = response.results[0];
  return !result.matchedForm && normalizeEnglish(query) === normalizeEnglish(result.term);
}

/** Mutation keys stay in this page/account only; a retry keeps the same key. */
export function createDictionaryCollector({ collect, onChange = () => {}, newId = () => crypto.randomUUID() } = {}) {
  const mutations = new Map();
  let generation = 0, controller = null;
  function cancel() { generation++; controller?.abort(); controller = null; }
  async function save(term, { userId, csrfToken, isCurrent = () => true } = {}) {
    cancel();
    const current = generation, abort = new AbortController(); controller = abort;
    const key = `${userId}:${normalizeEnglish(term)}`;
    if (!mutations.has(key)) mutations.set(key, newId());
    const body = { term, mutationId: mutations.get(key) };
    const active = () => current === generation && !abort.signal.aborted && isCurrent();
    if (!active()) return false;
    onChange({ phase: "saving", term, message: "正在收录到公开词库…" });
    try {
      const value = await collect(body, { signal: abort.signal, csrfToken });
      if (!active()) return false;
      const entry = validatePublicEntry(value.entry);
      const aliases = [entry.term, entry.standardForm, entry.correction.chosen];
      if (["suggested", "accepted", "kept"].includes(entry.correction.status)) aliases.push(entry.correction.original);
      if (["suggested", "accepted"].includes(entry.correction.status)) aliases.push(entry.correction.suggestion);
      if (typeof value.added !== "boolean" || !/^[a-f0-9]{40}$/i.test(value.sha || "")
        || !aliases.some(alias => normalizeEnglish(alias) === normalizeEnglish(term))) throw new Error("公开收录结果尚未完整确认，请重试核对。");
      mutations.delete(key);
      onChange({ phase: "saved", term, entry, message: value.added ? "已收录到卓的公开词库。" : "公开词库已经收录；原有内容已保留。" });
      return true;
    } catch (error) {
      if (active()) onChange({ phase: "error", term, message: `公开收录尚未确认：${error.message || "请稍后重试。"}`, error });
      return false;
    } finally { if (current === generation) controller = null; }
  }
  function clear() { cancel(); mutations.clear(); }
  return { save, cancel, clear };
}
