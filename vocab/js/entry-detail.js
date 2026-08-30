import { formatMeaningForDisplay } from "./wordbook-schema.js";

const TYPE_LABELS = {
  word: "单词", phrase: "短语", "phrasal-verb": "Phrasal verb", idiom: "Idiom", collocation: "Collocation",
  sentence: "句子", quote: "名言", proverb: "谚语"
};
const ATTRIBUTION_LABELS = { verified: "出处已核验", candidate: "候选出处，尚未核验", unverified: "出处未核验", disputed: "出处存在争议" };
const DIALOG_IDS = [
  "entry-dialog", "dialog-type", "dialog-term", "dialog-speak", "dialog-copy", "dialog-phonetic", "dialog-meaning",
  "dialog-definition-section", "dialog-definition", "dialog-example-section", "dialog-example-en", "dialog-example-zh",
  "dialog-usage-section", "dialog-usage", "dialog-extra-section", "dialog-extra", "dialog-source-section", "dialog-source-status",
  "dialog-source-link", "dialog-source-list", "dialog-tags"
];

function setText(element, value) {
  if (element) element.textContent = value || "";
}

function setMultilineText(element, value) {
  if (!element) return;
  const lines = String(value || "").split("\n");
  element.replaceChildren();
  lines.forEach((line, index) => {
    if (index) element.append(document.createElement("br"));
    element.append(line);
  });
}

function tag(label, className = "") {
  const span = document.createElement("span");
  span.textContent = label;
  if (className) span.className = className;
  return span;
}

function detailField(label, value, { className = "", lang = "" } = {}) {
  const row = document.createElement("div");
  row.className = ["sense-field", className].filter(Boolean).join(" ");
  const fieldLabel = document.createElement("span");
  fieldLabel.className = "sense-field-label";
  fieldLabel.textContent = label;
  const content = document.createElement("p");
  content.textContent = value;
  if (lang) content.lang = lang;
  row.append(fieldLabel, content);
  return row;
}

function renderDetailExtra(refs, entry) {
  const fragment = document.createDocumentFragment();
  const senses = Array.isArray(entry.senses) ? entry.senses : [];
  if (senses.length) {
    const senseList = document.createElement("div");
    senseList.className = "detail-sense-list";
    senses.forEach((sense, senseIndex) => {
      const article = document.createElement("article");
      article.className = "detail-sense";
      const heading = document.createElement("h4");
      heading.className = "sense-heading";
      heading.append(tag(`义项 ${senseIndex + 1}`, "sense-number"));
      if (sense.partOfSpeech) heading.append(tag(sense.partOfSpeech, "sense-part-of-speech"));
      article.append(heading);
      if (sense.meaningZh) article.append(detailField("中文释义", sense.meaningZh, { className: "sense-meaning-zh" }));
      if (sense.definitionEn) article.append(detailField("English definition", sense.definitionEn, { className: "sense-definition-en", lang: "en" }));

      const examples = Array.isArray(sense.examples) ? sense.examples : [];
      if (examples.length) {
        const exampleList = document.createElement("div");
        exampleList.className = "sense-example-list";
        examples.forEach((example, exampleIndex) => {
          if (!example.en && !example.zh) return;
          const pair = document.createElement("div");
          pair.className = "sense-example-pair";
          if (example.en) pair.append(detailField(`例句 ${exampleIndex + 1}`, example.en, { className: "sense-example-en", lang: "en" }));
          if (example.zh) pair.append(detailField("例句翻译", example.zh, { className: "sense-example-zh" }));
          exampleList.append(pair);
        });
        if (exampleList.childElementCount) article.append(exampleList);
      }

      if (sense.usageNotes) article.append(detailField("Usage", sense.usageNotes, { className: "sense-usage", lang: "en" }));
      if (sense.register) article.append(detailField("Register", sense.register, { className: "sense-register", lang: "en" }));
      senseList.append(article);
    });
    fragment.append(senseList);
  }

  const metadata = [
    ["词形", entry.forms, "detail-forms"],
    ["同义词", entry.synonyms, "detail-synonyms"],
    ["易混淆词", entry.confusedWith, "detail-confused"]
  ].filter(([, values]) => Array.isArray(values) && values.length);
  if (metadata.length) {
    const metadataList = document.createElement("div");
    metadataList.className = "detail-meta-list";
    metadata.forEach(([label, values, className]) => {
      metadataList.append(detailField(label, values.join("；"), { className }));
    });
    fragment.append(metadataList);
  }

  refs.dialogExtraSection.hidden = !senses.length && !metadata.length;
  refs.dialogExtra.replaceChildren(fragment);
}

export function entryTextForCopy(entry) {
  return [
    entry.term,
    entry.phonetic,
    entry.partOfSpeech ? `词性：${entry.partOfSpeech}` : "",
    formatMeaningForDisplay(entry),
    entry.definition,
    entry.synonyms.length ? `同义词：${entry.synonyms.join("；")}` : "",
    entry.exampleEn,
    entry.exampleZh,
    entry.usage
  ].filter(Boolean).join("\n");
}

export function createEntryDetailController({ root = document } = {}) {
  const refs = Object.fromEntries(DIALOG_IDS.map((id) => [
    id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
    root.getElementById(id)
  ]));
  if (!refs.entryDialog) throw new Error("暂时无法打开词条详情，请刷新页面重试。");
  let selected = null;
  let returnFocus = null;
  let copyResetTimer = null;

  const show = (entry, { invoker = root.activeElement } = {}) => {
    selected = entry;
    returnFocus = invoker && typeof invoker.focus === "function" ? invoker : null;
    setText(refs.dialogType, TYPE_LABELS[entry.entryType] || entry.entryType);
    setText(refs.dialogTerm, entry.term);
    setText(refs.dialogPhonetic, [entry.phonetic, entry.partOfSpeech].filter(Boolean).join(" · "));
    setMultilineText(refs.dialogMeaning, formatMeaningForDisplay(entry) || "中文释义尚待完善");
    refs.dialogDefinitionSection.hidden = !entry.definition;
    setText(refs.dialogDefinition, entry.definition);
    refs.dialogExampleSection.hidden = !entry.exampleEn && !entry.exampleZh;
    setText(refs.dialogExampleEn, entry.exampleEn);
    setText(refs.dialogExampleZh, entry.exampleZh);
    const usage = [
      entry.usage,
      entry.register ? `Register: ${entry.register}` : "",
      entry.collocations.length ? `常见搭配：${entry.collocations.join("；")}` : ""
    ].filter(Boolean).join("\n");
    refs.dialogUsageSection.hidden = !usage;
    setMultilineText(refs.dialogUsage, usage);
    renderDetailExtra(refs, entry);

    const quoteLike = ["quote", "proverb"].includes(entry.entryType);
    refs.dialogSourceSection.hidden = !quoteLike && !entry.sourceUrl && !entry.sources.length;
    const attributionDetails = [entry.author, entry.sourceTitle, entry.sourceWork, entry.sourceDate].filter(Boolean).join(" · ");
    setText(refs.dialogSourceStatus, quoteLike
      ? `${ATTRIBUTION_LABELS[entry.attributionStatus] || entry.attributionStatus}${attributionDetails ? ` · ${attributionDetails}` : ""}${entry.attributionNote ? `：${entry.attributionNote}` : ""}`
      : (entry.attributionNote || "词典与整理来源"));
    refs.dialogSourceLink.hidden = !entry.sourceUrl;
    if (entry.sourceUrl) {
      refs.dialogSourceLink.href = entry.sourceUrl;
      refs.dialogSourceLink.textContent = entry.sourceTitle || new URL(entry.sourceUrl).hostname;
    } else {
      refs.dialogSourceLink.removeAttribute("href");
      refs.dialogSourceLink.textContent = "";
    }
    refs.dialogSourceList.replaceChildren(...entry.sources.map((source) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${source.title || new URL(source.url).hostname} · ${source.kind}`;
      item.append(link);
      return item;
    }));
    const tags = [...entry.tags];
    if (quoteLike) tags.unshift(ATTRIBUTION_LABELS[entry.attributionStatus] || entry.attributionStatus);
    refs.dialogTags.replaceChildren(...tags.map((value) => tag(value, quoteLike && value === tags[0] ? `attribution-chip ${entry.attributionStatus}` : "")));
    refs.entryDialog.showModal();
  };

  refs.dialogSpeak?.addEventListener("click", () => {
    const speech = root.defaultView?.speechSynthesis;
    const Speech = root.defaultView?.SpeechSynthesisUtterance;
    if (!speech || !Speech || !selected?.term) return;
    speech.cancel();
    const utterance = new Speech(selected.term);
    utterance.lang = "en-US";
    speech.speak(utterance);
  });
  refs.dialogCopy?.addEventListener("click", async () => {
    if (!selected) return;
    try {
      await root.defaultView.navigator.clipboard.writeText(entryTextForCopy(selected));
      refs.dialogCopy.textContent = "已复制";
    } catch {
      refs.dialogCopy.textContent = "复制失败";
    }
    root.defaultView.clearTimeout(copyResetTimer);
    copyResetTimer = root.defaultView.setTimeout(() => { refs.dialogCopy.textContent = "复制词条"; }, 1600);
  });
  refs.entryDialog.addEventListener("close", () => {
    selected = null;
    const target = returnFocus;
    returnFocus = null;
    target?.focus({ preventScroll: true });
  });

  return {
    show,
    close() { if (refs.entryDialog.open) refs.entryDialog.close(); }
  };
}
