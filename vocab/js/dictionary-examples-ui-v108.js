import { learningExampleSourceLabel } from "./example-source-label.js";

function element(root, name, className = "", text = "") {
  const node = root.createElement(name);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Read-only material for an opened card. No list warmup, saved-card mutation,
// account request or review scheduling belongs to this optional layer.
export function createDictionaryExamplesSection({ root = document, after, before,
  loadModule = () => import("./dictionary-examples-current-v4.js") } = {}) {
  const section = element(root, "section", "detail-section dictionary-learning-examples");
  section.hidden = true;
  const heading = element(root, "h3", "", "词典学习例句");
  const source = element(root, "p", "dictionary-learning-source");
  const note = element(root, "p", "dictionary-learning-note", "以下为独立学习例句，按各自词性和义项阅读，不是书中原句。");
  const status = element(root, "p", "dictionary-learning-status");
  status.setAttribute("role", "status");
  const content = element(root, "div", "dictionary-learning-content");
  const retry = element(root, "button", "quiet-button", "重试学习例句");
  retry.type = "button";
  retry.hidden = true;
  section.append(heading, source, note, status, content, retry);
  if (before) before.before(section);
  else after?.after(section);

  let sequence = 0, selected = null, controller = null, pendingModule = null;
  function render(state) {
    section.hidden = state.phase === "idle" || state.phase === "missing";
    section.setAttribute("aria-busy", String(state.phase === "loading"));
    status.textContent = state.message;
    retry.hidden = state.phase !== "error";
    source.hidden = note.hidden = state.phase !== "ready";
    content.replaceChildren();
    if (state.phase !== "ready") return;
    source.textContent = [...new Set(state.entry.senses.map(sense => learningExampleSourceLabel(sense.source)))].join("；");
    for (const sense of state.entry.senses) {
      const article = element(root, "article", "dictionary-learning-sense");
      const label = element(root, "h4", "", `${sense.partOfSpeech} · ${sense.meaningZh}`);
      article.append(label);
      for (const example of sense.examples) {
        const pair = element(root, "div", "dictionary-learning-pair");
        const en = element(root, "p", "", example.en), zh = element(root, "p", "", example.zh);
        en.lang = "en"; zh.lang = "zh-CN";
        pair.append(en, zh); article.append(pair);
      }
      content.append(article);
    }
  }
  function clear() {
    sequence++; selected = null; controller?.clear();
    delete section.dataset.term;
    render({ phase: "idle", message: "" });
  }
  async function show(entry, { enabled = true } = {}) {
    clear();
    if (!enabled || !entry || typeof entry.term !== "string" || !entry.term.trim()
      || entry.entryType && !["word", "phrase", "phrasal-verb", "idiom", "collocation"].includes(entry.entryType)) return false;
    selected = entry;
    section.dataset.term = entry.term;
    const current = sequence;
    render({ phase: "loading", message: "正在读取学习例句…" });
    try {
      pendingModule ||= loadModule();
      const module = await pendingModule;
      if (current !== sequence || selected !== entry) return false;
      controller ||= module.createDictionaryExamplesController({ onChange: render });
      return await controller.show(entry.term, { savedEntry: entry });
    } catch {
      pendingModule = null;
      if (current === sequence && selected === entry) render({ phase: "error", message: "学习例句暂不可用，原有内容仍可阅读。" });
      return false;
    }
  }
  retry.addEventListener("click", () => { if (selected) void show(selected); });
  return { show, clear, section };
}
