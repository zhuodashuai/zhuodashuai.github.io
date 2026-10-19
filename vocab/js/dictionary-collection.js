import { normalizeEnglish, validateEnglishInput, validatePublicEntry } from "./wordbook-schema.js?v=82";

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

/** Account-scoped, memory-only FIFO. Moving to another lookup never cancels a write. */
export function createDictionaryCollectionQueue({ collect, onChange = () => {}, newId = () => crypto.randomUUID() } = {}) {
  const items = new Map();
  const maximum = 100;
  let userId = null, generation = 0, runner = null, paused = false;
  const pending = item => item.phase === "queued" || item.phase === "saving";
  function snapshot() {
    const rows = [...items.values()].map(({ term, phase, message }) => ({ term, phase, message }));
    return { userId, items: rows, pendingCount: rows.filter(pending).length,
      failedCount: rows.filter(item => item.phase === "error").length };
  }
  function publish(item, entry, authenticationRequired = false) {
    const state = snapshot();
    // The observer gets public confirmation only, never a transport error, CSRF
    // token, idempotency key, account callback or AbortController.
    try { onChange({ term: item?.term || "", phase: item?.phase || "idle", message: item?.message || "",
      ...(entry ? { entry } : {}), ...(authenticationRequired ? { authenticationRequired: true } : {}), ...state }); } catch { /* Observers cannot change write authority. */ }
  }
  function current(options) {
    try { return typeof options?.isCurrent === "function" && options.isCurrent() === true; }
    catch { return false; }
  }
  function validOptions(options) {
    return typeof options?.userId === "string" && options.userId.length > 0 && options.userId.length <= 180
      && typeof options.csrfToken === "string" && options.csrfToken.length > 0 && options.csrfToken.length <= 500
      && current(options) && (userId === null || userId === options.userId);
  }
  function forgetCredentials(item) { item.options = null; item.controller = null; }
  function finish(item, value) { const resolve = item.resolve; item.resolve = null; resolve?.(value); }
  function makeAttempt(item, options) {
    item.options = { userId: options.userId, csrfToken: options.csrfToken, isCurrent: options.isCurrent };
    item.promise = new Promise(resolve => { item.resolve = resolve; });
    item.phase = "queued"; item.message = "已加入公开收录队列。";
    publish(item);
  }
  function stop(message, { authenticationRequired = false } = {}) {
    generation++;
    paused = [...items.values()].some(item => item.phase !== "saved");
    const changed = [];
    for (const item of items.values()) {
      if (!pending(item)) continue;
      item.controller?.abort();
      item.phase = "error"; item.message = message;
      forgetCredentials(item); finish(item, false);
      changed.push(item);
    }
    changed.forEach((item, index) => publish(item, undefined, index === 0 && authenticationRequired));
  }
  function pause() { stop("登录重新确认后可重试，结果尚未确认。"); }
  function confirmation(value, term) {
    const entry = validatePublicEntry(value?.entry);
    const aliases = [entry.term, entry.standardForm, entry.correction.chosen];
    if (["suggested", "accepted", "kept"].includes(entry.correction.status)) aliases.push(entry.correction.original);
    if (["suggested", "accepted"].includes(entry.correction.status)) aliases.push(entry.correction.suggestion);
    if (typeof value.added !== "boolean" || !/^[a-f0-9]{40}$/i.test(value.sha || "")
      || !aliases.some(alias => normalizeEnglish(alias) === normalizeEnglish(term))) throw new Error("Unconfirmed collection");
    return entry;
  }
  async function drain() {
    if (paused || runner?.generation === generation) return;
    const activeRunner = { generation }; runner = activeRunner;
    try {
      while (!paused && activeRunner.generation === generation) {
        const item = [...items.values()].find(value => value.phase === "queued");
        if (!item) return;
        const options = item.options;
        if (!options || userId !== options.userId || !current(options)) {
          stop("登录重新确认后可重试，结果尚未确认。"); return;
        }
        const controller = new AbortController(); item.controller = controller;
        const active = () => activeRunner.generation === generation && !controller.signal.aborted
          && userId === options.userId && current(options) && items.get(item.key) === item;
        item.phase = "saving"; item.message = "正在收录到公开词库…"; publish(item);
        try {
          if (!active()) return;
          const value = await collect({ term: item.term, mutationId: item.mutationId },
            { signal: controller.signal, csrfToken: options.csrfToken });
          if (!active()) {
            if (activeRunner.generation === generation) stop("登录重新确认后可重试，结果尚未确认。");
            return;
          }
          const entry = confirmation(value, item.term);
          item.phase = "saved"; item.message = value.added ? "已收录到卓的公开词库。" : "公开词库已经收录；原有内容已保留。";
          forgetCredentials(item); finish(item, true); publish(item, entry);
        } catch (error) {
          if (!active()) {
            if (activeRunner.generation === generation) stop("登录重新确认后可重试，结果尚未确认。");
            return;
          }
          if (error?.status === 429 || error?.status === 401) {
            stop(error.status === 429 ? "操作过于频繁，已暂停队列；请稍后手动重试。" : "登录重新确认后可重试，结果尚未确认。",
              { authenticationRequired: error.status === 401 });
            return;
          }
          item.phase = "error"; item.message = "公开收录尚未确认，请重试核对。";
          forgetCredentials(item); finish(item, false); publish(item);
        }
      }
    } finally { if (runner === activeRunner) runner = null; }
  }
  function enqueue(input, options = {}) {
    if (!validOptions(options)) return Promise.resolve(false);
    let term;
    try { term = validateEnglishInput(input); } catch { return Promise.resolve(false); }
    const key = `${options.userId}:${normalizeEnglish(term)}`;
    const existing = items.get(key);
    if (existing && existing.phase !== "saved") return existing.promise;
    if (existing) items.delete(key);
    // Settled confirmations may be evicted; failed/uncertain writes never are.
    if (items.size >= maximum) {
      const saved = [...items.values()].find(item => item.phase === "saved");
      if (saved) items.delete(saved.key);
    }
    if (items.size >= maximum) {
      publish({ term, phase: "error", message: "收录队列已满（100 项）；请先重试未确认的词。" });
      return Promise.resolve(false);
    }
    let mutationId;
    try { mutationId = newId(); } catch { return Promise.resolve(false); }
    if (typeof mutationId !== "string" || mutationId.length < 12 || mutationId.length > 180 || !/^[A-Za-z0-9._:-]+$/u.test(mutationId)) return Promise.resolve(false);
    userId = options.userId;
    const item = { key, term, mutationId, phase: "queued", message: "", options: null, controller: null, promise: null, resolve: null };
    items.set(key, item);
    if (paused) {
      makeAttempt(item, options); item.phase = "error"; item.message = "队列已暂停，请手动重试。";
      forgetCredentials(item); finish(item, false); publish(item);
    } else { makeAttempt(item, options); void drain(); }
    return item.promise;
  }
  function retry(options = {}) {
    if (!validOptions(options)) return Promise.resolve(false);
    const failed = [...items.values()].filter(item => item.phase === "error");
    paused = false;
    if (!failed.length) return Promise.resolve(true);
    for (const item of failed) makeAttempt(item, options);
    const attempts = failed.map(item => item.promise);
    void drain();
    return Promise.all(attempts).then(values => values.every(Boolean));
  }
  function clear() {
    generation++;
    for (const item of items.values()) { item.controller?.abort(); forgetCredentials(item); finish(item, false); }
    items.clear(); userId = null; paused = false; publish(null);
  }
  return { enqueue, retry, snapshot, pause, clear,
    hasUnsettled: () => [...items.values()].some(item => item.phase !== "saved") };
}
