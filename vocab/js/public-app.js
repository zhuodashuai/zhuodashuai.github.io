import { getPublicCache, putPublicCache } from "./owner-storage.js";
import { ownerAdminUrl } from "./runtime-config.js";
import { parsePublicSnapshot } from "./wordbook-schema.js";
import { setupPwa } from "./pwa.js";

const refs = Object.fromEntries([
  "owner-link", "library-search", "filter-row", "entry-grid", "entry-count", "data-status", "load-error",
  "load-error-message", "retry-load", "empty-message", "export-public", "entry-dialog", "dialog-type", "dialog-term",
  "dialog-speak", "dialog-copy", "dialog-phonetic", "dialog-meaning", "dialog-definition-section", "dialog-definition", "dialog-example-section",
  "dialog-example-en", "dialog-example-zh", "dialog-usage-section", "dialog-usage", "dialog-extra-section", "dialog-extra", "dialog-source-section", "dialog-source-status",
  "dialog-source-link", "dialog-source-list", "dialog-tags", "install-button", "update-banner", "apply-update"
].map((id) => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), document.getElementById(id)]));

const state = { snapshot: null, filter: "all", query: "", selected: null };
const TYPE_LABELS = {
  word: "单词", phrase: "短语", "phrasal-verb": "Phrasal verb", idiom: "Idiom", collocation: "Collocation",
  sentence: "句子", quote: "名言", proverb: "谚语"
};
const ATTRIBUTION_LABELS = { verified: "出处已核验", candidate: "候选出处，尚未核验", unverified: "出处未核验", disputed: "出处存在争议" };

function setText(element, value) {
  if (element) element.textContent = value || "";
}

function normalizedSearch(entry) {
  return [entry.term, entry.standardForm, entry.meaning, entry.definition, entry.author, entry.sourceTitle, ...entry.tags, ...entry.collocations]
    .join(" ").toLocaleLowerCase("zh-CN");
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  speechSynthesis.speak(utterance);
}

function tag(label, className = "") {
  const span = document.createElement("span");
  span.textContent = label;
  if (className) span.className = className;
  return span;
}

function showDetails(entry) {
  state.selected = entry;
  setText(refs.dialogType, TYPE_LABELS[entry.entryType] || entry.entryType);
  setText(refs.dialogTerm, entry.term);
  setText(refs.dialogPhonetic, [entry.phonetic, entry.partOfSpeech].filter(Boolean).join(" · "));
  setText(refs.dialogMeaning, entry.meaning || "中文释义尚待完善");
  refs.dialogDefinitionSection.hidden = !entry.definition;
  setText(refs.dialogDefinition, entry.definition);
  refs.dialogExampleSection.hidden = !entry.exampleEn && !entry.exampleZh;
  setText(refs.dialogExampleEn, entry.exampleEn);
  setText(refs.dialogExampleZh, entry.exampleZh);
  const usage = [entry.usage, entry.register ? `Register: ${entry.register}` : "", entry.collocations.length ? `常见搭配：${entry.collocations.join("；")}` : ""].filter(Boolean).join("\n");
  refs.dialogUsageSection.hidden = !usage;
  setText(refs.dialogUsage, usage);
  const extra = [
    ...(entry.senses || []).map((sense, index) => `${index + 1}. ${[sense.partOfSpeech, sense.meaningZh, sense.definitionEn].filter(Boolean).join(" · ")}`),
    entry.forms.length ? `词形：${entry.forms.join("；")}` : "",
    entry.confusedWith.length ? `易混淆：${entry.confusedWith.join("；")}` : ""
  ].filter(Boolean).join("\n");
  refs.dialogExtraSection.hidden = !extra;
  setText(refs.dialogExtra, extra);
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
}

function render() {
  const entries = state.snapshot?.entries || [];
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  const filtered = entries.filter((entry) => (state.filter === "all" || entry.entryType === state.filter)
    && (!query || normalizedSearch(entry).includes(query)));
  const cards = filtered.map((entry) => {
    const article = document.createElement("article");
    article.className = "word-card";
    const kicker = document.createElement("div");
    kicker.className = "card-kicker";
    kicker.append(tag(TYPE_LABELS[entry.entryType] || entry.entryType), tag(entry.partOfSpeech || ""));
    const title = document.createElement("h3");
    title.lang = "en";
    title.textContent = entry.term;
    const phonetic = document.createElement("p");
    phonetic.className = "phonetic";
    phonetic.textContent = entry.phonetic;
    const meaning = document.createElement("p");
    meaning.className = "card-meaning";
    meaning.textContent = entry.meaning || "释义待完善";
    const tags = document.createElement("div");
    tags.className = "tag-list";
    const shownTags = entry.tags.slice(0, 3);
    if (["quote", "proverb"].includes(entry.entryType)) shownTags.unshift(ATTRIBUTION_LABELS[entry.attributionStatus]);
    tags.append(...shownTags.filter(Boolean).map((value, index) => tag(value, index === 0 && ["quote", "proverb"].includes(entry.entryType) ? `attribution-chip ${entry.attributionStatus}` : "")));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-open";
    button.setAttribute("aria-label", `查看 ${entry.term} 的完整词条`);
    button.addEventListener("click", () => showDetails(entry));
    article.append(kicker, title, phonetic, meaning, tags, button);
    return article;
  });
  refs.entryGrid.replaceChildren(...cards);
  refs.entryGrid.setAttribute("aria-busy", "false");
  refs.entryCount.textContent = String(entries.length);
  refs.emptyMessage.hidden = filtered.length > 0 || entries.length === 0;
}

async function loadWordbook() {
  refs.entryGrid.setAttribute("aria-busy", "true");
  refs.loadError.hidden = true;
  try {
    const response = await fetch("data/owner-wordbook.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = parsePublicSnapshot(await response.json());
    state.snapshot = snapshot;
    await putPublicCache(snapshot, "", response.url, { etag: response.headers.get("etag") || "" });
    refs.dataStatus.textContent = `已验证 GitHub 公开快照 · 更新于 ${new Date(snapshot.exportedAt).toLocaleString("zh-CN")}`;
    refs.exportPublic.disabled = false;
    render();
  } catch (networkError) {
    try {
      const cache = await getPublicCache();
      if (!cache?.snapshot) throw new Error("No validated cache");
      state.snapshot = parsePublicSnapshot(cache.snapshot);
      refs.dataStatus.textContent = `当前离线，显示 ${new Date(cache.fetchedAt).toLocaleString("zh-CN")} 保存的已验证缓存。`;
      refs.exportPublic.disabled = false;
      render();
    } catch {
      state.snapshot = null;
      refs.entryGrid.replaceChildren();
      refs.entryGrid.setAttribute("aria-busy", "false");
      refs.dataStatus.textContent = "没有可验证的公开词库数据。";
      refs.loadErrorMessage.textContent = `读取失败：${networkError?.message || "未知错误"}。本页没有生成假词条。`;
      refs.loadError.hidden = false;
      refs.exportPublic.disabled = true;
    }
  }
}

refs.filterRow.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  refs.filterRow.querySelectorAll("button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
  render();
});
refs.librarySearch.addEventListener("input", () => { state.query = refs.librarySearch.value; render(); });
refs.retryLoad.addEventListener("click", loadWordbook);
refs.dialogSpeak.addEventListener("click", () => speak(state.selected?.term));
refs.dialogCopy.addEventListener("click", async () => {
  if (!state.selected) return;
  const entry = state.selected;
  const text = [entry.term, entry.phonetic, entry.meaning, entry.definition, entry.exampleEn, entry.exampleZh, entry.usage]
    .filter(Boolean).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    refs.dialogCopy.textContent = "已复制";
  } catch {
    refs.dialogCopy.textContent = "复制失败";
  }
  window.setTimeout(() => { refs.dialogCopy.textContent = "复制词条"; }, 1600);
});
refs.exportPublic.addEventListener("click", () => {
  if (!state.snapshot) return;
  const blob = new Blob([`${JSON.stringify(state.snapshot, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zhuo-public-wordbook-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

const adminUrl = ownerAdminUrl();
if (adminUrl) refs.ownerLink.href = adminUrl;
else {
  refs.ownerLink.href = "owner.html";
  refs.ownerLink.title = "管理后端完成一次性部署后，这里会连接到安全管理域名";
}
setupPwa({ installButton: refs.installButton, updateBanner: refs.updateBanner, applyUpdateButton: refs.applyUpdate });
window.addEventListener("online", () => { if (!state.snapshot) loadWordbook(); });
loadWordbook();
