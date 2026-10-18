import { exportPassageFavorites, importPassageFavorites, loadBookPassages, readPassageFavorites, selectBookPassages, setPassageFavorite, sourcePassagesForEntry } from "./book-passages.js?v=76";

function element(root, name, className = "", text = "") {
  const node = root.createElement(name);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function chapterLabel(chapterId) {
  const number = /^chapter-(\d+)$/u.exec(String(chapterId || ""))?.[1];
  return number ? `Chapter ${number}` : "";
}

function sourceLabel(passage, book) {
  const source = passage.source || {};
  const printedPage = source.printedPage ? `书页 ${source.printedPage}` : "";
  const pdfPage = source.pdfPage ? `PDF 第 ${source.pdfPage} 页` : "";
  return [source.title || book?.title, book?.author, chapterLabel(passage.chapterId), source.edition || book?.editionNote, printedPage, pdfPage]
    .filter(Boolean).join(" · ");
}

function renderPassage(root, passage, book, { onFavorite, favorite = false } = {}) {
  const article = element(root, "article", "book-passage");
  article.dataset.passageId = passage.id;
  const quotation = element(root, "blockquote", "book-passage-text", passage.text);
  quotation.lang = "en";
  article.append(quotation);
  if (passage.translation) {
    const translation = element(root, "p", "book-passage-translation");
    translation.append(element(root, "span", "passage-field-label", "参考译意（学习用）"), element(root, "span", "", passage.translation));
    article.append(translation);
  }
  if (passage.note) article.append(element(root, "p", "book-passage-note", passage.note));
  article.append(element(root, "p", "book-passage-source", sourceLabel(passage, book)));
  if (onFavorite) {
    const control = element(root, "button", "passage-favorite", favorite ? "已收藏" : "收藏");
    control.type = "button";
    control.setAttribute("aria-pressed", String(favorite));
    control.setAttribute("aria-label", `${favorite ? "取消收藏" : "收藏"}这句原文`);
    control.addEventListener("click", () => onFavorite(passage, !favorite));
    article.append(control);
  }
  return article;
}

// A separate read-only layer: it never replaces examples stored on the entry,
// edits a word, or participates in quiz/review scheduling.
export function createSourcePassageSection({ root = document, after } = {}) {
  const section = element(root, "section", "detail-section source-passage-section");
  section.id = "dialog-source-examples-section";
  section.hidden = true;
  const heading = element(root, "h3", "", "书中原句");
  const status = element(root, "p", "passages-status");
  status.id = "dialog-source-examples-status";
  status.setAttribute("role", "status");
  const list = element(root, "div", "source-passage-list");
  list.id = "dialog-source-examples";
  const retry = element(root, "button", "quiet-button", "重试原句");
  retry.type = "button";
  retry.hidden = true;
  section.append(heading, status, list, retry);
  after?.after(section);
  let requestToken = 0;
  let selected = null;

  const show = async (entry) => {
    const token = ++requestToken;
    const fromRecall = section.closest(".entry-dialog")?.classList.contains("recall-concealed");
    selected = entry;
    const membership = (entry?.tags || []).find((tag) => /^collection:[a-z0-9-]+:chapter-\d+$/u.test(tag));
    list.replaceChildren();
    retry.hidden = true;
    section.hidden = !membership;
    if (!membership) return;
    status.hidden = false;
    status.textContent = "正在读取书中原句…";
    try {
      const dataset = await loadBookPassages();
      if (token !== requestToken || selected !== entry) return;
      const passages = sourcePassagesForEntry(dataset, entry);
      section.hidden = passages.length === 0;
      status.hidden = true;
      list.replaceChildren(...passages.map((passage) => renderPassage(root, passage, dataset.books.find((book) => book.id === passage.bookId))));
    } catch {
      if (token !== requestToken || selected !== entry) return;
      // Optional source loading must not insert a retry control into the
      // keyboard path between revealing an answer and rating the word.
      if (fromRecall) { section.hidden = true; return; }
      status.textContent = "书中原句暂时读不到，原有例句仍可使用。";
      retry.hidden = false;
    }
  };
  retry.addEventListener("click", () => { if (selected) void show(selected); });
  return {
    show,
    clear() {
      requestToken += 1;
      selected = null;
      section.hidden = true;
      list.replaceChildren();
    }
  };
}

export function createBookPassagesView({ root = document } = {}) {
  const panel = root.getElementById("passages-panel");
  const list = root.getElementById("passages-list");
  const status = root.getElementById("passages-status");
  const retry = root.getElementById("passages-retry");
  const favoritesOnly = root.getElementById("passages-favorites-only");
  const editionNote = root.getElementById("passages-edition-note");
  const spoilerNote = root.getElementById("passages-spoiler-note");
  const backupStatus = root.getElementById("passages-backup-status");
  const exportButton = root.getElementById("passages-export-favorites");
  const importButton = root.getElementById("passages-import-favorites");
  const importFile = root.getElementById("passages-import-file");
  let dataset = null;
  let scope = { bookId: "all", chapterId: "all", query: "", visible: false };
  let requestToken = 0;
  let favorites = new Set();
  let favoriteError = "";

  function readFavorites() {
    try {
      favorites = readPassageFavorites();
      favoriteError = "";
    } catch {
      favoriteError = "本机收藏暂不可用；仍可阅读摘句。";
    }
  }

  const render = () => {
    if (!dataset || !scope.visible) return;
    const books = dataset.books.filter((book) => scope.bookId === "all" || book.id === scope.bookId);
    editionNote.textContent = [...new Set(books.map((book) => book.editionNote).filter(Boolean))].join("\n");
    editionNote.hidden = !editionNote.textContent;
    spoilerNote.hidden = scope.chapterId !== "all" || books.length === 0;
    const passages = selectBookPassages(dataset, {
      bookId: scope.bookId, chapterId: scope.chapterId, query: scope.query,
      favoriteIds: favorites, favoritesOnly: favoritesOnly.checked
    });
    status.textContent = favoriteError || (passages.length
      ? `${passages.length} 句精选 · 按当前词本与章节显示`
      : scope.query.trim() ? "没有符合当前搜索的摘句，可以清空搜索或切换章节。"
        : favoritesOnly.checked ? "当前范围还没有收藏的精选摘句。"
          : "当前章节暂未精选摘句；原文例句可在单词卡中查看。");
    list.replaceChildren(...passages.map((passage) => renderPassage(root, passage,
      dataset.books.find((book) => book.id === passage.bookId), {
        favorite: favorites.has(passage.id),
        onFavorite(item, enabled) {
          try {
            favorites = setPassageFavorite(item.id, enabled);
            favoriteError = "";
          } catch {
            favoriteError = "收藏没有保存成功，请检查浏览器是否允许本机存储后重试。";
          }
          render();
          const refreshed = [...list.querySelectorAll("article[data-passage-id]")]
            .find((article) => article.dataset.passageId === item.id)?.querySelector(".passage-favorite");
          (refreshed || list.querySelector(".passage-favorite") || favoritesOnly).focus({ preventScroll: true });
        }
      })));
    panel.setAttribute("aria-busy", "false");
  };

  const update = async (nextScope = {}) => {
    scope = { ...scope, ...nextScope };
    const token = ++requestToken;
    panel.hidden = !scope.visible;
    if (!scope.visible) return;
    readFavorites();
    if (dataset) { render(); return; }
    panel.setAttribute("aria-busy", "true");
    status.textContent = "正在读取精选摘句…";
    retry.hidden = true;
    list.replaceChildren();
    try {
      const loaded = await loadBookPassages();
      if (token !== requestToken || !scope.visible) return;
      dataset = loaded;
      render();
    } catch {
      if (token !== requestToken || !scope.visible) return;
      panel.setAttribute("aria-busy", "false");
      status.textContent = "暂时读不到摘句，单词卡和学习记录不受影响。";
      retry.hidden = false;
    }
  };

  favoritesOnly.addEventListener("change", render);
  retry.addEventListener("click", () => { void update(); });
  const announceBackup = (message, state = "success") => {
    backupStatus.textContent = message;
    backupStatus.dataset.state = state;
  };
  exportButton.addEventListener("click", () => {
    let objectUrl = "";
    let link;
    try {
      const raw = exportPassageFavorites();
      objectUrl = root.defaultView.URL.createObjectURL(new Blob([raw], { type: "application/json;charset=utf-8" }));
      link = root.createElement("a");
      link.href = objectUrl;
      link.download = `zhuo-passage-favorites-${new Date().toISOString().slice(0, 10)}.json`;
      link.hidden = true;
      root.body.append(link);
      link.click();
      announceBackup("已生成收藏备份，仅包含句子编号。请确认文件已下载并妥善保存。");
    } catch {
      announceBackup("导出失败，未生成备份。请检查本机存储和浏览器下载权限后重试。", "error");
    } finally {
      link?.remove();
      if (objectUrl) root.defaultView.setTimeout(() => root.defaultView.URL.revokeObjectURL(objectUrl), 1000);
    }
  });
  importButton.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    // Reset immediately so selecting the same file again is a real retry even
    // after a read, validation or storage error.
    importFile.value = "";
    if (!file) return;
    importButton.disabled = true;
    exportButton.disabled = true;
    announceBackup("正在读取收藏备份…", "busy");
    try {
      if (file.size > 1_000_000) throw new Error("备份文件超过 1 MB，请选择仅含收藏编号的 JSON 备份。");
      const raw = await file.text();
      // The core validates every field and ID before merging and writing. It
      // reads current storage at commit time, preserving intervening favorites.
      favorites = importPassageFavorites(raw);
      favoriteError = "";
      render();
      announceBackup(`已合并收藏备份，当前共 ${favorites.size} 项收藏；原有收藏已保留。`);
    } catch (error) {
      announceBackup(`导入失败，未覆盖原有收藏：${error?.message || "文件或本机存储暂不可用。"}`, "error");
    } finally {
      importButton.disabled = false;
      exportButton.disabled = false;
    }
  });
  root.defaultView?.addEventListener("storage", () => {
    if (!scope.visible) return;
    readFavorites();
    render();
  });
  return { update };
}
