import { canonicalizeLookupInput, normalizeEnglish } from "./wordbook-schema.js?v=82";
import { isReviewedCoreDictionaryResult } from "./personal-dictionary.js?v=97";
import { searchEverydayDictionary, isReviewedCanonicalSenseHead, isSupersededChineseSenseHead, guardLegacySupplementaryResult,
  isRetainedCanonicalSenseHead, sanitizeRetainedCanonicalResult } from "./everyday-lookup.js?v=112";
import { chineseSearchPlan } from './chinese-search.js?v=112';
import { hasSelectedCommonSensePlan } from './selected-common-sense.js';

const abortError = () => new DOMException("查词已停止。", "AbortError");
const settled = operation => Promise.resolve().then(operation).then(value => ({ value }), error => ({ error }));
const failedClosed = error => ["ambiguous_dictionary_match", "invalid_dictionary_data", "unreviewed_dictionary_form"].includes(error?.code);
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
  // Reviewed MIT-only words still need the old lemma grace. Only the static
  // core projection's complete matching tuple can bypass it, without folding
  // away distinctions between proper names and ordinary words.
  const reviewedCore = canonicalizeLookupInput(input) === value.term && isReviewedCoreDictionaryResult(value);
  return (sameSource || reviewedCore) && !value.matchedForm && normalizeEnglish(value.term) === normalizeEnglish(input);
}

/** Keep a unified ranked page in server order; legacy sidecars stay last. */
export function mergePersonalDictionaryPage(current, page, { relatedIntegrated = false } = {}) {
  const integrated = relatedIntegrated || page.relatedIntegrated === true;
  const ordered = integrated ? [...current, ...page.results] : [
    ...current.filter(row => row.matchType !== "related"), ...page.results,
    ...current.filter(row => row.matchType === "related")
  ];
  const seen = new Set();
  return ordered.filter(row => {
    const key = normalizeEnglish(row.term);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** Race public sources only; a slow shared warmup cannot hold up another caller. */
export async function lookupPersonalDictionaryFast(input, { signal, hotLookup, hotReverse, fullSearch,
  full = false, preferCompleteChinese = false, hotGraceMs = 750, chineseDelayMs = 1000, formWaitMs = 1500 } = {}) {
  if (signal?.aborted) throw abortError();
  const chinese = /\p{Script=Han}/u.test(input);
  const everyday = searchEverydayDictionary(input);
  const literalFirst = !everyday && searchEverydayDictionary(input, { allowDottedFallback: true });
  const groupPlan = typeof input === 'string' && /\p{Script=Han}/u.test(input)
    ? chineseSearchPlan(input.normalize('NFKC').replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu,'').trim()) : null;
  const completeSelectedGroup = groupPlan && hasSelectedCommonSensePlan(groupPlan.term);
  // A known Chinese alias is evidence for one source, not a complete search.
  // English literal heads retain their existing exact, offline shortcut.
  if (everyday && !chinese && !completeSelectedGroup) return everyday;
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
  const fullLookup = async () => {
    const value = await fullSearch(input, { signal: fullController.signal });
    return /\p{Script=Han}/u.test(input) ? value : guardLegacySupplementaryResult(value);
  };
  try {
    // A compact old row cannot prove the new selected primary or complete its
    // existing group. Only the finitely bound group uses this verified route.
    if (full || completeSelectedGroup || literalFirst) return await race([Promise.resolve().then(fullLookup)]);
    if (/\p{Script=Han}/u.test(input)) {
      const hot = settled(async () => {
        if (everyday) return { result: everyday, retainedMismatch: false };
        const found = await hotReverse(input, { signal: hotController.signal });
        let retainedMismatch = false;
        const results = found.results.map(item => {
          const clean = sanitizeRetainedCanonicalResult(item);
          if (!clean && isRetainedCanonicalSenseHead(item?.term)) retainedMismatch = true;
          return clean;
        }).filter(row => row && !isSupersededChineseSenseHead(row.term));
        return { result: { ...found, results }, retainedMismatch };
      });
      const basic = value => ({ ...value.result, coverage: "basic",
        ...(everyday ? { relatedIntegrated: true, hasMore: false, nextOffset: null, offset: 0 } : {}) });
      const retainedFull = async (expanded, hotValue) => {
        // A compact projection with different provenance cannot authorize an
        // old retained sense. Even alongside ordinary hits, try the verified
        // source once; retain only ordinary basic hits if it is unavailable.
        const outcome = await bounded(expanded, 15_000);
        if (outcome.pending || outcome.error) {
          if (outcome.error?.name === "AbortError") throw outcome.error;
          if (hotValue.result.results.length) return basic(hotValue);
          if (outcome.error) throw outcome.error;
          throw new Error("完整词典读取超时，请重试。");
        }
        const verified = outcome.value, results = verified.results.slice(0, 20);
        const seen = new Set(verified.results.map(item => normalizeEnglish(item.term)));
        let appendedHot = false, truncated = verified.results.length > results.length;
        // The complete index can lag a newer safe public hot head. Its own
        // matching rows win, but a successful empty search must not erase a
        // known ordinary hit. Only already-sanitized hot rows reach this merge.
        for (const item of hotValue.result.results) {
          const key = normalizeEnglish(item.term);
          if (seen.has(key)) continue;
          seen.add(key);
          if (results.length < 20) { results.push(item); appendedHot = true; }
          else truncated = true;
        }
        return { ...verified, results,
          hasMore: Boolean(verified.hasMore || hotValue.result.hasMore || truncated),
          ...(appendedHot ? { coverage: "basic" } : {}) };
      };
      // The current Chinese UI uses the complete ranked index. Keep the small
      // source only as a verified, explicitly partial offline fallback. Legacy
      // callers may still opt into their original compact-first behavior.
      const ranked = preferCompleteChinese || everyday ? settled(fullLookup) : null;
      if (ranked) {
        const complete = await bounded(ranked, 15_000);
        // The same verified query must have the same ranking/count regardless
        // of which cache was quicker. Compact-only cards are an offline
        // fallback, never silently appended to an otherwise complete page.
        if (complete.value) return complete.value;
        if (complete.error?.name === "AbortError") throw complete.error;
        const fallback = await bounded(hot, chineseDelayMs);
        if (fallback.value?.result.results.length) return basic(fallback.value);
        if (complete.error) throw complete.error;
        throw new Error("完整词典读取超时，请重试。");
      }
      const initial = await bounded(hot, chineseDelayMs);
      if (initial.value?.result.results.length && !initial.value.retainedMismatch) return basic(initial.value);
      const expanded = settled(fullLookup);
      if (initial.value?.retainedMismatch) return await retainedFull(expanded, initial.value);
      if (!initial.pending) return take(await race([expanded]));
      const first = await race([hot.then(outcome => ({ hot: outcome })), expanded.then(outcome => ({ expanded: outcome }))]);
      if (first.hot?.value?.retainedMismatch) return await retainedFull(expanded, first.hot.value);
      if (first.hot?.value?.result.results.length) return basic(first.hot.value);
      if (first.expanded) return take(first.expanded);
      return take(await race([expanded]));
    }
    const hot = settled(async () => {
      const value = await hotLookup(input, { signal: hotController.signal });
      return isReviewedCanonicalSenseHead(value?.term) ? null : value;
    });
    const expanded = settled(fullLookup);
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
