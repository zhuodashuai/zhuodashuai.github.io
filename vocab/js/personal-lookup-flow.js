import { normalizeEnglish } from "./wordbook-schema.js?v=77";

const abortError = () => new DOMException("查词已停止。", "AbortError");
const settled = operation => Promise.resolve().then(operation).then(value => ({ value }), error => ({ error }));
const failedClosed = error => ["ambiguous_dictionary_match", "invalid_dictionary_data"].includes(error?.code);
function knownExact(input, result) {
  if (!result || result.hasMore || result.results.length !== 1) return false;
  const value = result.results[0];
  // These two projections come from the same tracked core/public source as the
  // compact builder. Plain MIT and original variants are NOT equivalent: their
  // exact spelling may be an independent adjective/noun instead of a lemma.
  const sameSource = value.source === "ECDICT · 已上线核心整理"
    && value.license === "MIT and project editorial additions" && value.url === "https://github.com/skywind3000/ECDICT"
    || value.source === "卓的公开词库" && value.license === "Public project content; not relabelled as ECDICT"
      && value.url === "https://zhuodashuai.github.io/vocab/";
  return sameSource && !value.matchedForm && normalizeEnglish(value.term) === normalizeEnglish(input);
}

/** Race public sources only; a slow shared warmup cannot hold up another caller. */
export async function lookupPersonalDictionaryFast(input, { signal, hotLookup, hotReverse, fullSearch,
  full = false, hotGraceMs = 750, chineseDelayMs = 1000, formWaitMs = 1500 } = {}) {
  if (signal?.aborted) throw abortError();
  const hotController = new AbortController(), fullController = new AbortController();
  const timers = new Set();
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const stop = () => { hotController.abort(); fullController.abort(); rejectAbort(abortError()); };
  signal?.addEventListener("abort", stop, { once: true });
  const wait = ms => new Promise(resolve => { const timer = setTimeout(() => { timers.delete(timer); resolve({ pending: true }); }, ms); timers.add(timer); });
  const race = values => Promise.race([...values, aborted]);
  const bounded = (operation, ms) => race([operation, wait(ms)]);
  const take = outcome => { if (outcome.error) throw outcome.error; return outcome.value; };
  try {
    if (full) return await race([Promise.resolve().then(() => fullSearch(input, { signal: fullController.signal }))]);
    if (/\p{Script=Han}/u.test(input)) {
      const hot = settled(() => hotReverse(input, { signal: hotController.signal }));
      // Give the already-prewarmed small index a brief chance before starting a
      // much larger reverse search. Misses immediately use the complete index.
      const initial = await bounded(hot, chineseDelayMs);
      if (initial.value?.results.length) return { ...initial.value, coverage: "basic" };
      const expanded = settled(() => fullSearch(input, { signal: fullController.signal }));
      if (!initial.pending) return take(await race([expanded]));
      const first = await race([hot.then(outcome => ({ hot: outcome })), expanded.then(outcome => ({ expanded: outcome }))]);
      if (first.hot?.value?.results.length) return { ...first.hot.value, coverage: "basic" };
      if (first.expanded) return take(first.expanded);
      return take(await race([expanded]));
    }
    const hot = settled(() => hotLookup(input, { signal: hotController.signal }));
    const expanded = settled(() => fullSearch(input, { signal: fullController.signal }));
    const first = await race([hot.then(outcome => ({ hot: outcome })), expanded.then(outcome => ({ expanded: outcome }))]);
    if (first.expanded?.value && knownExact(input, first.expanded.value)) return first.expanded.value;
    let hotResult = first.hot;
    if (!hotResult) hotResult = await bounded(hot, Math.min(750, Math.max(0, hotGraceMs)));
    // The compact index can know several lemmas for the same form. A verified
    // complete exact record (lives/leaves) can resolve that old ambiguity; only
    // ambiguity/corruption in the complete source must prevent that result.
    const value = hotResult.value;
    if (value && !value.matchedForm) return { results: [value], hasMore: false };
    const fullResult = first.expanded || await bounded(expanded, value ? formWaitMs : 15_000);
    if (fullResult.pending) {
      if (value) return { results: [{ ...value, warning: "扩展词条暂未加载；先显示已收录的词形释义。" }], hasMore: false };
      throw new Error("完整词典读取超时，请重试。");
    }
    if (fullResult.error) {
      if (failedClosed(fullResult.error)) throw fullResult.error;
      if (value) return { results: [{ ...value, warning: "扩展词条暂未加载；先显示已收录的词形释义。" }], hasMore: false };
      throw hotResult.error || fullResult.error;
    }
    if (value) {
      const extra = fullResult.value.results.filter(item => normalizeEnglish(item.term) !== normalizeEnglish(value.term));
      return { ...fullResult.value, results: [value, ...extra] };
    }
    if (!fullResult.value.results.length && hotResult.error) throw hotResult.error;
    if (hotResult.pending && fullResult.value.results.length) return { ...fullResult.value, results: fullResult.value.results.map(item => ({ ...item,
      warning: "基础词形索引仍在加载；先显示完整词典中已核对的匹配项，请确认原形和语境。" })) };
    return fullResult.value;
  } finally {
    signal?.removeEventListener("abort", stop);
    hotController.abort(); fullController.abort();
    for (const timer of timers) clearTimeout(timer);
  }
}
