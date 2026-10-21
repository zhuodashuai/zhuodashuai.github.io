import { searchExpandedDictionary, preloadExpandedDictionary, searchRelatedChineseDictionary } from "./expanded-dictionary.js?v=97";
import { chineseSearchPlan } from "./chinese-search.js?v=95";
import { personalWordbookUrl } from "./runtime-config.js?v=77";

// Queries live in the fragment only. No form control has a name, so even the
// no-JavaScript form fallback cannot put a word into a request's query string.
export function initialDictionaryQuery(hash) {
  if (typeof hash !== "string" || hash.length > 2500) return "";
  const raw = hash.replace(/^#/u, "").split("&").find(item => item.startsWith("q="));
  if (!raw) return "";
  try {
    const query = decodeURIComponent(raw.slice(2).replace(/\+/gu, " "));
    return query.length <= 200 && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(query) ? query : "";
  } catch { return ""; }
}

export function numberedDictionaryMeaning(value) {
  if (!value) return "";
  return /^\s*(?:[①-⑳]|\d+[.、])/u.test(value) ? value : `① ${value}`;
}

// Source newlines are sense boundaries; semicolons may only separate synonyms.
export function dictionaryMeaningLines(value) {
  return numberedDictionaryMeaning(value).split(/\r?\n/u).filter(line => line.trim());
}

export function dictionaryChoicePreview(value) {
  const characters = Array.from(value.replace(/\s+/gu, " ").trim());
  return characters.length > 80 ? `${characters.slice(0, 80).join("")}…` : characters.join("");
}

// A reviewed query sense is a better disambiguation hint than the first of
// several unrelated meanings. This never replaces the complete source card.
export function dictionaryChoiceDescription(entry) {
  return dictionaryChoicePreview(typeof entry?.matchedSense === "string" && entry.matchedSense.trim()
    ? entry.matchedSense : entry?.meaning || "");
}

/** Rank examples for the selected sense without altering their source data. */
export function dictionaryExampleSensePlan(entry, result) {
  const senses = Array.isArray(entry?.senses) ? entry.senses : [];
  const scoped = typeof result?.matchedPartOfSpeech === "string" && Boolean(result.matchedPartOfSpeech.trim())
    && typeof result?.matchedSense === "string" && Boolean(result.matchedSense.trim());
  if (!scoped) return { scoped: false, hasMatch: false,
    items: senses.map((sense, index) => ({ sense, matched: false, open: index === 0, label: "" })) };
  // Shared Chinese wording is not proof of an identical example sense: a
  // building's foundation and an abstract basis can both be called 基础.
  // Only IDs reviewed for this particular head and query sense may open.
  // Bind the complete reviewed content too: a newer example manifest may
  // reuse an ID while an older application graph is still cached offline.
  const reviewedIds = new Set(Array.isArray(result.matchedExampleSenseIds)
    ? result.matchedExampleSenseIds.filter(id => typeof id === "string" && id.trim()) : []);
  const proofs = Array.isArray(result.matchedExampleSenseEvidence) ? result.matchedExampleSenseEvidence : [];
  const validHead = value => typeof value === "string" && value.length <= 200 && Boolean(value.trim())
    && /[\p{Script=Latin}\d]/u.test(value) && !/[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)
    && !/javascript\s*:/iu.test(value);
  const sameHead = validHead(entry?.term) && validHead(result.term) && entry.term === result.term;
  const targetRole = ["noun", "verb", "adjective", "adverb"].includes(result.matchedPartOfSpeech)
    ? result.matchedPartOfSpeech : null;
  const roleOf = value => {
    if (typeof value !== "string" || value.length > 200 || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)) return null;
    const roles = new Set(value.normalize("NFKC").toLowerCase().match(/\b(?:noun|verb|adjective|adverb)\b/gu) || []);
    return roles.size === 1 ? [...roles][0] : null;
  };
  const matchesProof = sense => sameHead && targetRole && roleOf(sense.partOfSpeech) === targetRole
    && reviewedIds.has(sense.id) && proofs.some(proof => proof?.id === sense.id
    && proof.partOfSpeech === sense.partOfSpeech && proof.meaningZh === sense.meaningZh
    && Array.isArray(proof.examples) && Array.isArray(sense.examples) && proof.examples.length === sense.examples.length
    && sense.examples.every((example, index) => typeof example?.en === "string" && typeof example?.zh === "string"
      && example.en === proof.examples[index]?.en && example.zh === proof.examples[index]?.zh));
  const items = senses.map(sense => ({ sense, matched: Boolean(matchesProof(sense)), open: false }));
  // Sorting this new wrapper array preserves every original sense, example,
  // provenance field and relative order within the matching/other partitions.
  items.sort((a, b) => Number(b.matched) - Number(a.matched));
  items.forEach((item, index) => { item.open = index === 0 && item.matched;
    item.label = item.matched ? "本次义项" : "其他义项"; });
  return { scoped: true, hasMatch: items.some(item => item.matched), items };
}

function renderMeaning(document, target, value) {
  target.replaceChildren();
  dictionaryMeaningLines(value).forEach(line => {
    const paragraph = document.createElement("p"); paragraph.className = "meaning-line";
    paragraph.textContent = line; target.append(paragraph);
  });
}

export function personalDictionaryLink(term, targetLocation = globalThis.location) {
  const target = new URL(personalWordbookUrl(targetLocation));
  target.hash = `lookup=${encodeURIComponent(term)}`;
  return target.href;
}

export function ownerDictionaryLink(term = "", targetLocation = globalThis.location) {
  const target = new URL(personalDictionaryLink(term, targetLocation));
  target.searchParams.set("auth", "owner");
  return target.href;
}

export function createDictionaryCountLoader({ preload = preloadExpandedDictionary, onChange = () => {} } = {}) {
  let pending = null;
  return () => {
    if (pending) return pending;
    pending = Promise.resolve().then(() => preload()).then(manifest => {
      onChange(manifest.counts.records); return true;
    }).catch(() => { onChange(null); return false; }).finally(() => { pending = null; });
    return pending;
  };
}

function queryError(error) {
  if (error?.code === "ambiguous_dictionary_match") return "这个形式对应多个词或语境，请输入英文原形；没有自动选取。";
  if (error?.code === "dictionary_timeout") return "读取词典超时，请重试。";
  if (/^请输入|^中文查询请/u.test(error?.message || "")) return error.message;
  return "暂时无法读取词典，请检查网络后重新查询。";
}

// Optional suggestions are loaded only after an exact, successful miss. They
// never turn an approximate match into a definition or write to a wordbook.
async function defaultDictionarySuggestions(input, { signal } = {}) {
  const module = await import("./dictionary-suggestions.js?v=89");
  const manifest = await preloadExpandedDictionary({ signal, timeoutMs: 3000 });
  return module.suggestDictionaryTerms(input, { signal, timeoutMs: 3000, limit: 5, dictionaryVersion: manifest.version });
}

/** Sequence + abort guards also protect against a late, abort-ignoring loader. */
export function createDictionaryController({ search = searchExpandedDictionary, suggest = defaultDictionarySuggestions,
  relatedSearch = async () => ({ results: [], hasMore: false }), onChange = () => {} } = {}) {
  let sequence = 0, pending = null, suggestionPending = null, relatedPending = null;
  let state = { phase: "idle", input: "", results: [], selectedIndex: 0, hasMore: false, message: "", suggestions: [], suggestionPhase: "idle", relatedPhase: "idle" };
  function publish(next) { state = { ...state, ...next }; onChange(state); return state; }
  function stop() { sequence++; pending?.abort(); pending = null; suggestionPending?.abort(); suggestionPending = null; relatedPending?.abort(); relatedPending = null; }
  function change(input) {
    stop();
    return publish({ input, phase: "idle", results: [], selectedIndex: 0, hasMore: false, message: "", suggestions: [], suggestionPhase: "idle", relatedPhase: "idle" });
  }
  function cancel() {
    stop();
    return publish({ phase: "cancelled", results: [], selectedIndex: 0, hasMore: false, message: "已停止查询。", suggestions: [], suggestionPhase: "idle", relatedPhase: "idle" });
  }
  function startRelated(input, current) {
    if (!chineseSearchPlan(input.normalize("NFKC").replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu, "").trim())) return;
    const controller = new AbortController(); relatedPending = controller;
    publish({ relatedPhase: "loading" });
    // Direct meanings and their save links are ready before optional associations.
    // Late associations append only; they never change a user's selected card.
    void Promise.resolve().then(() => {
      if (current !== sequence || controller.signal.aborted) return { results: [] };
      return relatedSearch(input, { signal: controller.signal, limit: 8, timeoutMs: 5000 });
    }).then(response => {
      if (current !== sequence || controller.signal.aborted) return;
      const seen = new Set(state.results.map(row => row.term));
      const extra = (Array.isArray(response?.results) ? response.results : []).filter(row => {
        if (!row || row.matchType !== "related" || typeof row.term !== "string" || !row.term.trim()
          || typeof row.matchedChinese !== "string" || seen.has(row.term)) return false;
        seen.add(row.term); return true;
      }).slice(0, 8);
      const results = extra.length ? [...state.results, ...extra] : state.results;
      publish({ relatedPhase: "ready", results, hasMore: state.hasMore || Boolean(response?.hasMore),
        ...(extra.length ? { phase: "ready", message: `找到 ${results.length} 项，近义关联已单独标注。` }
          : !results.length && response?.hasMore ? { phase: "refine", message: "相关候选较多，当前范围尚未确认匹配。请用更具体的中文释义继续查。" } : {}) });
    }).catch(() => {
      if (current === sequence && !controller.signal.aborted) publish({ relatedPhase: "error" });
    }).finally(() => { if (current === sequence) relatedPending = null; });
  }
  function startSuggestions(input, current) {
    const controller = new AbortController(); suggestionPending = controller;
    publish({ suggestions: [], suggestionPhase: "loading" });
    // Do not await this sidecar: the input and submit button are already usable,
    // and the successful missing-word query can complete independently.
    void Promise.resolve().then(() => {
      if (current !== sequence || controller.signal.aborted) return [];
      return suggest(input, { signal: controller.signal, limit: 5, timeoutMs: 3000 });
    }).then(candidates => {
      if (current !== sequence || controller.signal.aborted) return;
      const seen = new Set();
      const suggestions = (Array.isArray(candidates) ? candidates : []).filter(candidate => {
        if (typeof candidate?.term !== "string" || !candidate.term.trim() || candidate.term.length > 200
          || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(candidate.term) || seen.has(candidate.term)) return false;
        seen.add(candidate.term); return true;
      }).slice(0, 5);
      publish({ suggestions, suggestionPhase: "ready" });
    }).catch(() => {
      if (current === sequence && !controller.signal.aborted) publish({ suggestions: [], suggestionPhase: "error" });
    }).finally(() => { if (current === sequence) suggestionPending = null; });
  }
  async function submit(input = state.input) {
    if (state.phase === "loading" && input === state.input) return false;
    stop();
    const current = sequence, controller = new AbortController(); pending = controller;
    publish({ input, phase: "loading", results: [], selectedIndex: 0, hasMore: false, message: "正在查询…", suggestions: [], suggestionPhase: "idle", relatedPhase: "idle" });
    try {
      const response = await search(input, { signal: controller.signal, limit: 20 });
      if (current !== sequence || controller.signal.aborted) return false;
      const results = response.results.slice(0, 20), hasMore = response.hasMore || response.results.length > 20;
      publish({ phase: results.length ? "ready" : hasMore ? "refine" : "empty", results, selectedIndex: 0, hasMore,
        message: results.length ? (results.length === 1 ? "已找到词条。" : `找到 ${results.length} 项${hasMore ? "，可换更具体的中文继续查" : "，选择词条查看"}。`)
          : hasMore ? "候选较多，当前范围尚未确认匹配。请用更具体的中文释义继续查。"
            : "没有找到对应词条。请检查拼写，或改用英文原形、较短的中文释义。" });
      if (!results.length && !hasMore) startSuggestions(input, current);
      startRelated(input, current);
      return true;
    } catch (error) {
      if (current !== sequence || controller.signal.aborted) return false;
      publish({ phase: error?.name === "AbortError" ? "cancelled" : "error", results: [], selectedIndex: 0, hasMore: false,
        message: error?.name === "AbortError" ? "已停止查询。" : queryError(error) });
      return false;
    } finally { if (current === sequence) pending = null; }
  }
  function select(index) {
    if (state.phase !== "ready" || !Number.isSafeInteger(index) || index < 0 || index >= state.results.length) return false;
    publish({ selectedIndex: index }); return true;
  }
  return { change, cancel, submit, select, getState: () => state };
}

function sourceLine(document, result) {
  const line = document.createElement("p"); line.className = "source";
  line.append("来源：");
  let url;
  try { url = new URL(result.url); } catch { /* No untrusted URL is rendered. */ }
  if (url?.protocol === "https:" && !url.username && !url.password) {
    const link = document.createElement("a"); link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.textContent = result.source; line.append(link);
  } else line.append(result.source);
  if (result.license) line.append(` · ${result.license}`);
  return line;
}

export function mountDictionaryPage(document, window) {
  const get = id => document.getElementById(id);
  const form = get("dictionary-form"), input = get("dictionary-query"), submit = get("dictionary-submit"), cancel = get("dictionary-cancel");
  const status = get("dictionary-status"), result = get("dictionary-result"), choices = get("dictionary-choices");
  const suggestionPanel = get("dictionary-suggestion-panel"), suggestionStatus = get("dictionary-suggestion-status");
  const suggestionList = get("dictionary-suggestions");
  const count = get("dictionary-count"), resultsRegion = get("dictionary-results"), heading = get("dictionary-term");
  const choiceDisclosure = get("dictionary-choice-disclosure");
  const compactChoices = window.matchMedia?.("(max-width: 860px)");
  let lastChoiceQuery = null;
  function resetChoiceDisclosure() {
    const open = !compactChoices?.matches;
    const hidesFocus = !open && choices.contains(document.activeElement);
    choiceDisclosure.open = open;
    if (hidesFocus) heading.focus({ preventScroll: true });
  }
  compactChoices?.addEventListener?.("change", resetChoiceDisclosure);
  resetChoiceDisclosure();
  let lastResults = null, lastSelected = null;
  const examplePanel = get("dictionary-example-panel"), exampleStatus = get("dictionary-example-status");
  const exampleContent = get("dictionary-example-content"), exampleRetry = get("dictionary-example-retry");
  let exampleSequence = 0, exampleController = null, exampleModule = null;
  function renderExamples(state) {
    examplePanel.hidden = state.phase === "idle" || state.phase === "missing";
    examplePanel.setAttribute("aria-busy", String(state.phase === "loading"));
    exampleStatus.textContent = state.message; exampleRetry.hidden = state.phase !== "error";
    exampleContent.replaceChildren();
    if (state.phase !== "ready") return;
    const plan = dictionaryExampleSensePlan(state.entry, lastSelected);
    if (plan.scoped && !plan.hasMatch) exampleStatus.textContent = "当前义项暂无匹配例句，以下为其他词义例句。";
    plan.items.forEach(({ sense, open, label }, index) => {
      const details = document.createElement("details"); details.className = "example-sense"; details.open = open;
      const summary = document.createElement("summary"); summary.textContent = `${index + 1}. ${label ? `${label}：` : ""}${sense.partOfSpeech} · ${sense.meaningZh}`;
      const list = document.createElement("ol");
      sense.examples.forEach(example => {
        const item = document.createElement("li"), en = document.createElement("p"), zh = document.createElement("p");
        en.lang = "en"; en.textContent = example.en; zh.lang = "zh-CN"; zh.textContent = example.zh;
        item.append(en, zh); list.append(item);
      });
      details.append(summary, list); exampleContent.append(details);
    });
  }
  function clearExamples() {
    exampleSequence++; exampleController?.clear();
    renderExamples({ phase: "idle", message: "" });
  }
  function showExamples(term) {
    clearExamples(); const current = exampleSequence;
    renderExamples({ phase: "loading", message: "正在读取学习例句…" });
    // Do not add a JS/data dependency to the critical meaning/CTA path. A late
    // import/download is guarded separately from the primary query controller.
    exampleModule ||= import("./dictionary-examples.js?v=96");
    void exampleModule.then(module => {
      if (current !== exampleSequence || lastSelected?.term !== term) return;
      exampleController ||= module.createDictionaryExamplesController({ onChange: renderExamples });
      void exampleController.show(term);
    }).catch(() => {
      exampleModule = null;
      if (current === exampleSequence && lastSelected?.term === term) renderExamples({ phase: "error", message: "例句暂不可用，词义查询不受影响。" });
    });
  }
  exampleRetry.addEventListener("click", () => { if (lastSelected) showExamples(lastSelected.term); });
  get("dictionary-personal-link").href = personalWordbookUrl(window.location);
  const refreshCount = createDictionaryCountLoader({ onChange(total) {
    count.textContent = total === null ? "词条数量暂不可用，仍可重试查词" : `${new Intl.NumberFormat("zh-CN").format(total)} 个词条`;
  } });

  const controller = createDictionaryController({ relatedSearch: searchRelatedChineseDictionary, onChange(state) {
    if (state.input !== lastChoiceQuery) { lastChoiceQuery = state.input; resetChoiceDisclosure(); }
    const busy = state.phase === "loading";
    submit.disabled = busy; submit.textContent = busy ? "查询中…" : "查词";
    cancel.hidden = !busy; resultsRegion.setAttribute("aria-busy", String(busy));
    status.textContent = state.message; status.dataset.phase = state.phase;
    const relatedStatus = get("dictionary-related-status");
    relatedStatus.textContent = state.relatedPhase === "loading" ? "正在补充近义关联，不影响查看已有释义…"
      : state.relatedPhase === "error" ? "近义关联暂不可用；已有释义仍可使用。"
        : state.results.some(row => row.matchType === "related") ? "近义关联仅供找词，具体含义和用法请看原释义。" : "";
    relatedStatus.hidden = !relatedStatus.textContent;
    suggestionPanel.hidden = state.suggestionPhase === "idle" || (state.suggestionPhase === "ready" && !state.suggestions.length);
    suggestionPanel.setAttribute("aria-busy", String(state.suggestionPhase === "loading"));
    suggestionStatus.textContent = state.suggestionPhase === "loading" ? "正在查找相近拼写…"
      : state.suggestionPhase === "error" ? "拼写建议暂不可用；可修改输入后重试。"
        : state.suggestions.length ? `找到 ${state.suggestions.length} 个拼写建议。` : "";
    suggestionList.replaceChildren();
    state.suggestions.forEach(candidate => {
      const item = document.createElement("li"), button = document.createElement("button");
      button.type = "button"; button.lang = "en"; button.textContent = candidate.term;
      button.dataset.dictionarySuggestion = candidate.term;
      button.addEventListener("click", () => {
        input.value = candidate.term; controller.change(candidate.term); void run();
      });
      item.append(button); suggestionList.append(item);
    });
    get("dictionary-owner-link").href = ownerDictionaryLink(state.input, window.location);
    result.hidden = state.phase !== "ready";
    // Reserve the compact switcher while related results are pending, rather
    // than inserting a large list above a definition the reader has started.
    get("dictionary-choice-panel").hidden = state.phase !== "ready"
      || state.results.length < 2 && state.relatedPhase !== "loading";
    if (state.results !== lastResults) {
      lastResults = state.results; choices.replaceChildren();
      state.results.forEach((entry, index) => {
        const item = document.createElement("li"), button = document.createElement("button"); button.type = "button";
        button.dataset.dictionaryTerm = entry.term; button.setAttribute("aria-controls", "dictionary-result");
        const term = document.createElement("strong"); term.textContent = entry.term; term.lang = "en"; button.append(term);
        const pos = document.createElement("span"); pos.className = "choice-pos";
        pos.textContent = entry.matchedPartOfSpeech || entry.partOfSpeech || "词性未标注"; button.append(pos);
        const meaning = document.createElement("span"); meaning.className = "choice-meaning";
        meaning.textContent = dictionaryChoiceDescription(entry); button.append(meaning);
        if (entry.matchType === "related") {
          const badge = document.createElement("span"); badge.className = "related-badge";
          badge.textContent = `近义关联：${entry.matchedChinese}`; button.append(badge);
        }
        button.addEventListener("click", () => {
          controller.select(index);
          if (compactChoices?.matches) choiceDisclosure.open = false;
          heading.focus({ preventScroll: true });
          heading.scrollIntoView({ block: "nearest" });
        });
        item.append(button); choices.append(item);
      });
    }
    [...choices.querySelectorAll("button")].forEach((button, index) => button.setAttribute("aria-pressed", String(index === state.selectedIndex)));
    // hasMore can mean an unexamined posting, not a confirmed extra match.
    get("dictionary-choice-count").textContent = state.results.length ? `${state.results.length} 项` : "";
    get("dictionary-more").hidden = !state.hasMore;
    const selected = state.phase === "ready" ? state.results[state.selectedIndex] : null;
    if (!selected) {
      clearExamples();
      heading.textContent = ""; get("dictionary-pos").textContent = ""; get("dictionary-meaning").textContent = "";
      get("dictionary-source").replaceChildren(); get("dictionary-variants").replaceChildren();
      get("dictionary-add").removeAttribute("href"); lastSelected = null; return;
    }
    if (selected === lastSelected) return;
    lastSelected = selected;
    heading.textContent = selected.term; get("dictionary-pos").textContent = selected.partOfSpeech || "词性未标注";
    renderMeaning(document, get("dictionary-meaning"), selected.meaning);
    const relatedMatch = get("dictionary-related-match");
    relatedMatch.hidden = selected.matchType !== "related" && !selected.matchedSense;
    relatedMatch.textContent = selected.matchedSense
      ? `${selected.matchType === "related" ? `近义关联：${selected.matchedChinese} · ` : "本次匹配："}${selected.matchedPartOfSpeech} · ${selected.matchedSense}（限此义项）`
      : selected.matchType === "related" ? `近义关联：${selected.matchedChinese}（不代表可直接互换）` : "";
    const matched = get("dictionary-matched-form"); matched.hidden = !selected.matchedForm;
    matched.textContent = selected.matchedForm ? `查询形式：${selected.matchedForm}` : "";
    const provenance = sourceLine(document, selected); get("dictionary-source").replaceChildren(...provenance.childNodes);
    get("dictionary-add").href = personalDictionaryLink(selected.term, window.location);
    const variants = get("dictionary-variants"); variants.replaceChildren();
    const alternatives = selected.alternatives || [], panel = get("dictionary-variant-panel");
    panel.hidden = alternatives.length === 0; panel.open = false;
    get("dictionary-variant-summary").textContent = `其他来源释义（${alternatives.length}）`;
    alternatives.forEach((alternative, index) => {
      const section = document.createElement("section"); section.className = "variant";
      const title = document.createElement("h3"); title.textContent = alternative.source || `来源 ${index + 1}`;
      const pos = document.createElement("p"); pos.className = "part-of-speech"; pos.textContent = alternative.partOfSpeech || "词性未标注";
      const meaning = document.createElement("div"); meaning.className = "meaning"; renderMeaning(document, meaning, alternative.meaning);
      section.append(title, pos, meaning, sourceLine(document, alternative)); variants.append(section);
    });
    showExamples(selected.term);
  } });

  async function run() {
    const query = input.value;
    const completed = await controller.submit(query);
    if (!completed || controller.getState().input !== query) return;
    // A successful retry may have repaired an initially unavailable manifest.
    // Reusing its cache restores the count without blocking the result or input.
    void refreshCount();
    try { window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#q=${encodeURIComponent(query)}`); } catch { /* Lookup still works without history access. */ }
    if (controller.getState().phase === "ready") {
      // Present multiple matches before their auto-preview; a single match can
      // take the reader directly to the definition, even above a phone keyboard.
      const target = controller.getState().results.length > 1 && choiceDisclosure.open ? choices.querySelector("button") : heading;
      target.focus({ preventScroll: true }); target.scrollIntoView({ block: "nearest" });
    }
  }
  form.addEventListener("submit", event => { event.preventDefault(); if (!submit.disabled) void run(); });
  input.addEventListener("input", () => controller.change(input.value));
  cancel.addEventListener("click", () => { controller.cancel(); input.focus(); });
  window.addEventListener("pagehide", () => controller.cancel());
  window.addEventListener("hashchange", () => {
    const query = initialDictionaryQuery(window.location.hash);
    input.value = query; controller.change(query); if (query) void run();
  });

  // Manifest warming is deliberately independent of form readiness. It never
  // reads an account, downloads every shard, or holds the input disabled.
  void refreshCount();
  const initial = initialDictionaryQuery(window.location.hash);
  if (initial) { input.value = initial; controller.change(initial); void run(); }
  return controller;
}

if (typeof document !== "undefined" && typeof window !== "undefined") mountDictionaryPage(document, window);
