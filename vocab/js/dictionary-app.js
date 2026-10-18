import { searchExpandedDictionary, preloadExpandedDictionary } from "./expanded-dictionary.js?v=79";
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

export function personalDictionaryLink(term, targetLocation = globalThis.location) {
  const target = new URL(personalWordbookUrl(targetLocation));
  target.hash = `lookup=${encodeURIComponent(term)}`;
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

/** Sequence + abort guards also protect against a late, abort-ignoring loader. */
export function createDictionaryController({ search = searchExpandedDictionary, onChange = () => {} } = {}) {
  let sequence = 0, pending = null;
  let state = { phase: "idle", input: "", results: [], selectedIndex: 0, hasMore: false, message: "" };
  function publish(next) { state = { ...state, ...next }; onChange(state); return state; }
  function stop() { sequence++; pending?.abort(); pending = null; }
  function change(input) {
    stop();
    return publish({ input, phase: "idle", results: [], selectedIndex: 0, hasMore: false, message: "" });
  }
  function cancel() {
    stop();
    return publish({ phase: "cancelled", results: [], selectedIndex: 0, hasMore: false, message: "已停止查询。" });
  }
  async function submit(input = state.input) {
    if (state.phase === "loading" && input === state.input) return false;
    stop();
    const current = sequence, controller = new AbortController(); pending = controller;
    publish({ input, phase: "loading", results: [], selectedIndex: 0, hasMore: false, message: "正在查询…" });
    try {
      const response = await search(input, { signal: controller.signal, limit: 20 });
      if (current !== sequence || controller.signal.aborted) return false;
      const results = response.results.slice(0, 20), hasMore = response.hasMore || response.results.length > 20;
      publish({ phase: results.length ? "ready" : hasMore ? "refine" : "empty", results, selectedIndex: 0, hasMore,
        message: results.length ? (results.length === 1 ? "已找到词条。" : `找到 ${results.length} 项${hasMore ? "，可换更具体的中文继续查" : "，选择词条查看"}。`)
          : hasMore ? "候选较多，当前范围尚未确认匹配。请用更具体的中文释义继续查。"
            : "没有找到对应词条。请检查拼写，或改用英文原形、较短的中文释义。" });
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
  const count = get("dictionary-count"), resultsRegion = get("dictionary-results"), heading = get("dictionary-term");
  let lastResults = null, lastSelected = null;
  get("dictionary-personal-link").href = personalWordbookUrl(window.location);
  const refreshCount = createDictionaryCountLoader({ onChange(total) {
    count.textContent = total === null ? "词条数量暂不可用，仍可重试查词" : `${new Intl.NumberFormat("zh-CN").format(total)} 个词条`;
  } });

  const controller = createDictionaryController({ onChange(state) {
    const busy = state.phase === "loading";
    submit.disabled = busy; submit.textContent = busy ? "查询中…" : "查词";
    cancel.hidden = !busy; resultsRegion.setAttribute("aria-busy", String(busy));
    status.textContent = state.message; status.dataset.phase = state.phase;
    result.hidden = state.phase !== "ready";
    get("dictionary-choice-panel").hidden = state.phase !== "ready" || state.results.length < 2;
    if (state.results !== lastResults) {
      lastResults = state.results; choices.replaceChildren();
      state.results.forEach((entry, index) => {
        const item = document.createElement("li"), button = document.createElement("button"); button.type = "button";
        button.dataset.dictionaryTerm = entry.term; button.setAttribute("aria-controls", "dictionary-result");
        const term = document.createElement("strong"); term.textContent = entry.term; term.lang = "en"; button.append(term);
        const pos = document.createElement("span"); pos.textContent = entry.partOfSpeech || "词性未标注"; button.append(pos);
        button.addEventListener("click", () => { controller.select(index); heading.focus({ preventScroll: true }); });
        item.append(button); choices.append(item);
      });
    }
    [...choices.querySelectorAll("button")].forEach((button, index) => button.setAttribute("aria-pressed", String(index === state.selectedIndex)));
    const selected = state.phase === "ready" ? state.results[state.selectedIndex] : null;
    if (!selected) {
      heading.textContent = ""; get("dictionary-pos").textContent = ""; get("dictionary-meaning").textContent = "";
      get("dictionary-source").replaceChildren(); get("dictionary-variants").replaceChildren();
      get("dictionary-add").removeAttribute("href"); lastSelected = null; return;
    }
    if (selected === lastSelected) return;
    lastSelected = selected;
    heading.textContent = selected.term; get("dictionary-pos").textContent = selected.partOfSpeech || "词性未标注";
    get("dictionary-meaning").textContent = numberedDictionaryMeaning(selected.meaning);
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
      const meaning = document.createElement("div"); meaning.className = "meaning"; meaning.textContent = numberedDictionaryMeaning(alternative.meaning);
      section.append(title, pos, meaning, sourceLine(document, alternative)); variants.append(section);
    });
  } });

  async function run() {
    const query = input.value;
    const completed = await controller.submit(query);
    if (!completed || controller.getState().input !== query) return;
    // A successful retry may have repaired an initially unavailable manifest.
    // Reusing its cache restores the count without blocking the result or input.
    void refreshCount();
    try { window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#q=${encodeURIComponent(query)}`); } catch { /* Lookup still works without history access. */ }
    if (controller.getState().phase === "ready") heading.focus({ preventScroll: true });
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
