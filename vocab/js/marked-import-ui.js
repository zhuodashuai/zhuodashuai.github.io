import { getOwnerWordbook, getSession, ownerLoginUrl } from "./owner-api.js?v=78";
import { buildCollectionCatalog } from "./collections.js?v=78";
import { parsePublicSnapshot } from "./wordbook-schema.js?v=78";
import { importMarkedCandidates } from "./marked-import.js?v=78";
import { markedAbortError, openMarkedFile, parseMarkedPageSelection } from "./marked-files.js?v=78";
import { createMarkedPageRecognizer } from "./marked-local-recognition.js?v=78";

const ids = ["auth-gate", "auth-message", "login-link", "auth-retry", "workspace", "owner-identity", "choose-file", "camera-button", "file", "camera", "file-name", "book", "chapter", "source-title", "status", "document-area", "page-count", "pdf-controls", "pages", "preview-page", "previous-page", "next-page", "toggle-page", "preview-canvas", "overlay-canvas", "preview-caption", "start", "cancel", "progress", "candidate-count", "warnings", "empty", "candidate-list", "import", "clear-selection", "open-drafts", "import-status"];
const refs = Object.fromEntries(ids.map((id) => [id.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase()), document.getElementById(`capture-${id}`)]));
const MARK_LABELS = { underline: "彩色下划线" };
const state = {
  owner: null, csrfToken: "", snapshot: null, catalog: [], document: null,
  documentEpoch: 0, workEpoch: 0, previewEpoch: 0, authEpoch: 0,
  operationController: null, previewController: null, busy: "", previewPage: 1,
  candidates: [], candidateSerial: 0, warnings: [], activeCandidateId: "", sourceEdited: false,
  recognizer: null, closed: false
};

function say(element, message, kind = "") {
  element.textContent = message;
  element.dataset.state = kind;
}

function ownSession(session) {
  return session?.authenticated === true && session.user?.login === "zhuodashuai"
    && Number(session.user?.id) === 156042078 && typeof session.csrfToken === "string" && session.csrfToken.length >= 16;
}

function selectedCandidates() { return state.candidates.filter((candidate) => candidate.selected && !candidate.saved); }

async function terminateRecognizer(recognizer) {
  try { await recognizer?.terminate(); } catch { /* cleanup cannot turn completed/cancelled OCR into an unhandled UI error */ }
}

function collectedLiteralTerms() {
  const values = (state.snapshot?.entries || []).flatMap((entry) => [
    entry.term, entry.originalInput, ...(entry.forms || []),
    ...(entry.readingContexts || []).flatMap((context) => [context.originalInput, context.originalForm, ...(context.forms || [])])
  ]);
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() && value.length <= 120
    && /[A-Za-z]/u.test(value) && !/[\u0000-\u001f]/u.test(value)).map((value) => value.trim()))];
}

function setBusy(kind = "") {
  state.busy = kind;
  const busy = Boolean(kind), importing = kind === "import";
  refs.chooseFile.disabled = importing;
  refs.cameraButton.disabled = importing;
  refs.file.disabled = importing;
  refs.camera.disabled = importing;
  refs.start.disabled = busy || !state.owner || !state.document || navigator.onLine === false;
  refs.cancel.hidden = !busy || importing;
  refs.cancel.textContent = kind === "scan" ? "停止识别" : "停止处理";
  refs.previousPage.disabled = busy || !state.document || state.previewPage <= 1;
  refs.nextPage.disabled = busy || !state.document || state.previewPage >= state.document.pageCount;
  refs.previewPage.disabled = busy;
  refs.pages.disabled = busy;
  refs.togglePage.disabled = busy;
  refs.book.disabled = importing;
  refs.chapter.disabled = importing || !refs.book.value;
  refs.sourceTitle.disabled = importing;
  refs.candidateList.querySelectorAll("input, textarea, button").forEach((control) => {
    const candidate = state.candidates.find((item) => item.id === control.closest(".capture-candidate")?.dataset.candidateId);
    control.disabled = busy || Boolean(candidate?.saved && !control.matches("button"));
  });
  const count = selectedCandidates().length;
  refs.import.disabled = busy || !state.owner || !state.snapshot || count < 1 || count > 60;
  refs.import.textContent = count ? `保存所选 ${count} 条为本地草稿` : "保存所选为本地草稿";
  refs.clearSelection.disabled = busy || count === 0;
  if (count > 60) say(refs.importStatus, "一次最多保存 60 条，请减少勾选后再试。", "error");
}

function cancelCurrent(message = "已停止处理；已得到的候选仍保留。") {
  state.workEpoch += 1;
  state.operationController?.abort();
  state.operationController = null;
  state.previewController?.abort();
  state.previewController = null;
  const recognizer = state.recognizer; state.recognizer = null;
  if (recognizer) void terminateRecognizer(recognizer);
  setBusy();
  say(refs.status, message);
  refs.progress.textContent = "";
}

async function destroyDocument() {
  state.documentEpoch += 1;
  state.previewEpoch += 1;
  const previous = state.document;
  state.document = null;
  state.activeCandidateId = "";
  refs.documentArea.hidden = true;
  refs.previewCanvas.width = refs.overlayCanvas.width = 1;
  refs.previewCanvas.height = refs.overlayCanvas.height = 1;
  await previous?.destroy().catch(() => {});
}

function lockOwner(message) {
  state.owner = null;
  state.csrfToken = "";
  state.snapshot = null;
  cancelCurrent(message);
  void destroyDocument();
  state.candidates = [];
  state.warnings = [];
  refs.workspace.hidden = true;
  refs.workspace.inert = true;
  refs.authGate.hidden = false;
  refs.loginLink.hidden = false;
  refs.authRetry.hidden = false;
  say(refs.authMessage, message, "error");
}

async function requireOwnerNow(signal) {
  const session = await getSession({ signal });
  if (!ownSession(session)) {
    lockOwner("管理区已锁定；此功能仅向卓原来的 GitHub 账号开放，请重新验证。");
    throw new Error("登录验证已失效，没有识别新的词或保存草稿。");
  }
  state.owner = session.user;
  state.csrfToken = session.csrfToken;
  return session;
}

function updateChapterOptions() {
  const book = state.catalog.find((item) => item.id === refs.book.value);
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = book ? "选择章节" : "先选择词本";
  refs.chapter.replaceChildren(placeholder, ...(book?.chapters || []).map((chapter) => {
    const option = document.createElement("option"); option.value = chapter.id; option.textContent = chapter.title; return option;
  }));
  refs.chapter.disabled = !book;
  updateSourceTitle();
}

function updateSourceTitle() {
  if (state.sourceEdited) return;
  const book = state.catalog.find((item) => item.id === refs.book.value);
  const chapter = book?.chapters.find((item) => item.id === refs.chapter.value);
  refs.sourceTitle.value = book ? [book.title, chapter?.title].filter(Boolean).join(" — ").slice(0, 160) : "";
}

function updateCatalog(snapshot) {
  state.catalog = buildCollectionCatalog(snapshot.entries).filter((book) => book.id !== "main");
  const previousBook = refs.book.value, previousChapter = refs.chapter.value;
  const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "不分类，先保存草稿";
  refs.book.replaceChildren(placeholder, ...state.catalog.map((book) => {
    const option = document.createElement("option"); option.value = book.id; option.textContent = book.title; return option;
  }));
  if (state.catalog.some((book) => book.id === previousBook)) refs.book.value = previousBook;
  updateChapterOptions();
  if ([...refs.chapter.options].some((option) => option.value === previousChapter)) refs.chapter.value = previousChapter;
  updateSourceTitle();
}

async function initialize() {
  const epoch = ++state.authEpoch;
  refs.authRetry.disabled = true;
  say(refs.authMessage, "正在检查登录状态…");
  try {
    await requireOwnerNow();
    const remote = await getOwnerWordbook();
    if (epoch !== state.authEpoch || state.closed) return;
    state.snapshot = parsePublicSnapshot(remote.snapshot, { allowLegacy: false });
    updateCatalog(state.snapshot);
    refs.ownerIdentity.textContent = "@zhuodashuai";
    refs.workspace.hidden = false; refs.workspace.inert = false; refs.authGate.hidden = true;
    setBusy();
  } catch (error) {
    if (epoch !== state.authEpoch || state.closed) return;
    lockOwner(error.message || "暂时无法验证登录，尚未读取或上传任何文件。");
  } finally { if (epoch === state.authEpoch) refs.authRetry.disabled = false; }
}

function displayCanvas(canvas, pageNumber) {
  refs.previewCanvas.width = canvas.width; refs.previewCanvas.height = canvas.height;
  const context = refs.previewCanvas.getContext("2d");
  if (!context) throw new Error("浏览器无法显示预览。");
  context.drawImage(canvas, 0, 0);
  refs.overlayCanvas.width = canvas.width; refs.overlayCanvas.height = canvas.height;
  state.previewPage = pageNumber;
  refs.previewPage.value = String(pageNumber);
  refs.previewCaption.textContent = state.document?.kind === "pdf" ? `本地预览 · 第 ${pageNumber} 页` : "本地照片预览";
  updateTogglePage();
}

function drawCandidateRegion(candidate) {
  const context = refs.overlayCanvas.getContext("2d");
  context.clearRect(0, 0, refs.overlayCanvas.width, refs.overlayCanvas.height);
  if (!candidate || candidate.pageNumber !== state.previewPage) return;
  const [x, y, width, height] = candidate.region;
  context.strokeStyle = candidate.certainty === "uncertain" ? "#a15b16" : "#1d6d50";
  context.lineWidth = Math.max(3, refs.overlayCanvas.width / 220);
  context.strokeRect(x * refs.overlayCanvas.width, y * refs.overlayCanvas.height, width * refs.overlayCanvas.width, height * refs.overlayCanvas.height);
  refs.previewCaption.textContent = `第 ${candidate.pageNumber} 页 · 标记位置：${candidate.text}（位置也需对照原图核对）`;
}

function updateTogglePage() {
  try {
    const pages = parseMarkedPageSelection(refs.pages.value, state.document?.pageCount || 1);
    refs.togglePage.textContent = pages.includes(state.previewPage) ? "移出本批" : "加入本批";
  } catch { refs.togglePage.textContent = "加入本批"; }
}

async function renderPreview(pageNumber) {
  const current = state.document, documentEpoch = state.documentEpoch;
  if (!current) return;
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > current.pageCount) throw new Error(`预览页码须在 1–${current.pageCount} 之间。`);
  const epoch = ++state.previewEpoch;
  state.previewController?.abort();
  const controller = new AbortController(); state.previewController = controller;
  refs.previewCaption.textContent = `正在本地显示第 ${pageNumber} 页…`;
  try {
    const canvas = await current.renderPage(pageNumber, { signal: controller.signal });
    try {
      if (epoch !== state.previewEpoch || documentEpoch !== state.documentEpoch || controller.signal.aborted) return;
      displayCanvas(canvas, pageNumber);
      drawCandidateRegion(state.candidates.find((candidate) => candidate.id === state.activeCandidateId));
      setBusy(state.busy);
    } finally { canvas.width = canvas.height = 1; }
  } finally { if (state.previewController === controller) state.previewController = null; }
}

async function chooseFile(file) {
  if (!file || !state.owner || state.busy === "import") return;
  if (state.candidates.some((candidate) => !candidate.saved)
    && !window.confirm("选择新文件会清除当前尚未保存的候选，已保存草稿不受影响。继续吗？")) return;
  cancelCurrent("正在本地检查文件…");
  const selectionEpoch = state.workEpoch;
  await destroyDocument();
  if (selectionEpoch !== state.workEpoch || state.closed) return;
  state.candidates = []; state.warnings = []; state.candidateSerial = 0;
  renderCandidates();
  refs.fileName.textContent = String(file.name || "相机照片");
  refs.importStatus.textContent = ""; refs.openDrafts.hidden = true;
  const epoch = ++state.workEpoch, documentEpoch = state.documentEpoch;
  const controller = new AbortController(); state.operationController = controller;
  setBusy("file");
  let opened;
  try {
    opened = await openMarkedFile(file, { signal: controller.signal, onProgress: (message) => {
      if (epoch === state.workEpoch) say(refs.status, message);
    } });
    if (epoch !== state.workEpoch || documentEpoch !== state.documentEpoch || controller.signal.aborted) { await opened.destroy(); return; }
    state.document = opened;
    state.previewPage = 1; refs.pages.value = "1";
    refs.previewPage.max = String(opened.pageCount);
    refs.pageCount.textContent = opened.kind === "pdf" ? `PDF · 共 ${opened.pageCount} 页` : "照片 · 1 页";
    refs.pdfControls.hidden = opened.kind !== "pdf";
    refs.documentArea.hidden = false;
    await renderPreview(1);
    if (epoch !== state.workEpoch || controller.signal.aborted) return;
    say(refs.status, "文件已在本地打开。确认预览清晰后，再点击“识别所选页”。");
  } catch (error) {
    if (epoch !== state.workEpoch) return;
    if (error.name !== "AbortError") say(refs.status, error.message || "文件无法打开，请换用 JPG/PNG 页面照片。", "error");
    if (state.document === opened) await destroyDocument();
  } finally {
    if (epoch === state.workEpoch) { state.operationController = null; setBusy(); }
  }
}

function decodedCandidates(response, pageNumber, fileHash) {
  if (!response || !Array.isArray(response.candidates) || response.candidates.length > 60) throw new Error("本地识别没有返回有效候选，未把任何整页文字加入词本。");
  return response.candidates.flatMap((raw) => {
    const region = raw?.region;
    if (!raw || typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 120
      || typeof raw.context !== "string" || raw.context.length > 600 || !MARK_LABELS[raw.markType]
      || !["clear", "uncertain"].includes(raw.certainty) || !Array.isArray(region) || region.length !== 4
      || region.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      || region[2] <= 0 || region[3] <= 0 || region[0] + region[2] > 1.001 || region[1] + region[3] > 1.001) return [];
    const originalText = typeof raw.originalText === "string" && raw.originalText.trim() && raw.originalText.length <= 120 ? raw.originalText.trim() : raw.text.trim();
    const alternatives = [...new Set((Array.isArray(raw.alternatives) ? raw.alternatives : []).filter((value) => typeof value === "string" && value.trim() && value.length <= 120).map((value) => value.trim()))].slice(0, 5);
    return [{ id: `capture-candidate-${++state.candidateSerial}`, text: raw.text.trim(), originalText, recognizedText: originalText,
      context: raw.context.trim(), markType: raw.markType, certainty: raw.certainty, region: [...region], pageNumber,
      sourceId: `${fileHash}:${pageNumber}:${region.map((value) => Math.round(value * 10000)).join(":")}`,
      alternatives, selected: false, saved: false }];
  });
}

function renderWarnings() {
  refs.warnings.replaceChildren(...state.warnings.map((warning) => {
    const item = document.createElement("li"); item.textContent = warning; return item;
  }));
  refs.warnings.hidden = state.warnings.length === 0;
}

function renderCandidates() {
  const rows = state.candidates.map((candidate) => {
    const row = document.createElement("article"); row.className = "capture-candidate";
    row.classList.toggle("is-selected", candidate.selected); row.classList.toggle("is-saved", candidate.saved);
    row.dataset.candidateId = candidate.id;
    const top = document.createElement("div"); top.className = "capture-candidate-top";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox";
    checkbox.checked = candidate.selected; checkbox.setAttribute("aria-label", `选择 ${candidate.text}`);
    const term = document.createElement("input"); term.type = "text"; term.lang = "en";
    term.className = "capture-candidate-term"; term.maxLength = 120; term.value = candidate.text;
    term.setAttribute("aria-label", `核对词语 ${candidate.originalText}`);
    checkbox.addEventListener("change", () => { candidate.selected = checkbox.checked; row.classList.toggle("is-selected", candidate.selected); setBusy(state.busy); });
    term.addEventListener("input", () => { candidate.text = term.value; checkbox.setAttribute("aria-label", `选择 ${candidate.text}`); });
    top.append(checkbox, term);
    const metadata = document.createElement("div"); metadata.className = "capture-candidate-meta";
    const label = document.createElement("span");
    label.textContent = candidate.saved ? "已处理 · 到管理页查看草稿" : `第 ${candidate.pageNumber} 页 · ${MARK_LABELS[candidate.markType]} · ${candidate.certainty === "uncertain" ? "待核对" : "文字读法较一致，仍需核对"}`;
    if (candidate.certainty === "uncertain") label.className = "capture-certainty";
    const view = document.createElement("button"); view.type = "button"; view.textContent = "查看标记";
    view.addEventListener("click", async () => {
      if (state.busy) return;
      const current = state.document;
      state.activeCandidateId = candidate.id;
      try {
        await renderPreview(candidate.pageNumber);
        if (current !== state.document || state.activeCandidateId !== candidate.id || state.closed) return;
        refs.previewCanvas.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        refs.previewCaption.focus({ preventScroll: true });
      }
      catch (error) { if (error.name !== "AbortError") say(refs.status, error.message, "error"); }
    });
    metadata.append(label, view);
    const details = document.createElement("details");
    const summary = document.createElement("summary"); summary.textContent = "核对原文形式与片段（可修改）";
    const originalLabel = document.createElement("label"); originalLabel.className = "capture-original-label";
    originalLabel.append(document.createTextNode("原文形式（可校正识别）"));
    const original = document.createElement("input"); original.type = "text"; original.lang = "en"; original.maxLength = 120;
    original.className = "capture-original-text"; original.value = candidate.originalText;
    original.addEventListener("input", () => { candidate.originalText = original.value; term.setAttribute("aria-label", `核对词语 ${candidate.originalText}`); });
    originalLabel.append(original);
    const raw = document.createElement("small"); raw.className = "capture-raw-reading"; raw.textContent = `初次识别：${candidate.recognizedText}`;
    const context = document.createElement("textarea"); context.rows = 2; context.maxLength = 600; context.lang = "en";
    context.value = candidate.context; context.setAttribute("aria-label", `${candidate.originalText} 的原文片段`);
    context.addEventListener("input", () => { candidate.context = context.value; });
    details.append(summary, originalLabel, raw, context); row.append(top, metadata);
    if (candidate.alternatives.length) {
      const alternatives = document.createElement("p"); alternatives.className = "capture-alternatives";
      alternatives.textContent = `存在不同读法，请核对：${[...new Set([candidate.recognizedText, ...candidate.alternatives])].join(" / ")}`; row.append(alternatives);
    }
    row.append(details); return row;
  });
  refs.candidateList.replaceChildren(...rows);
  refs.candidateCount.textContent = `${state.candidates.length} 条候选`;
  refs.empty.hidden = rows.length > 0;
  refs.empty.textContent = state.document ? "未找到可收录的蓝／红色下划线词时，请换用清晰照片；黑色划线、圈画和高亮暂不支持。不会把整页英文作为生词导入。" : "本地识别后，候选会出现在这里。不收录整页未标记的单词。";
  renderWarnings(); setBusy(state.busy);
}

async function startRecognition() {
  if (state.busy || !state.document || !state.owner) return;
  let pages;
  try { pages = state.document.kind === "pdf" ? parseMarkedPageSelection(refs.pages.value, state.document.pageCount) : [1]; }
  catch (error) { say(refs.status, error.message, "error"); return; }
  if (state.candidates.some((candidate) => pages.includes(candidate.pageNumber) && !candidate.saved)
    && !window.confirm("重新识别这些页会替换它们尚未保存的候选。已保存草稿不受影响，继续吗？")) return;
  state.previewController?.abort();
  const epoch = ++state.workEpoch, documentEpoch = state.documentEpoch, current = state.document;
  const controller = new AbortController(); state.operationController = controller;
  setBusy("scan"); refs.importStatus.textContent = "";
  state.activeCandidateId = ""; state.warnings = [];
  let completed = 0, recognizer = null, activePage = pages[0];
  const stillCurrent = () => epoch === state.workEpoch && documentEpoch === state.documentEpoch && state.document === current && !controller.signal.aborted;
  const updateProgress = (update) => {
    if (!stillCurrent()) return;
    const labels = { load: "加载本地识别引擎", loadLanguage: "读取英语字库", initialize: "准备识别引擎", recognize: "在本机辨认划线词" };
    const message = typeof update === "string" ? update : update?.message || labels[update?.action] || "在本机辨认划线词";
    const progress = Number(update?.progress);
    refs.progress.textContent = `第 ${activePage} 页：${String(message).slice(0, 120)}${Number.isFinite(progress) ? ` ${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` : ""}；图片不会上传。`;
  };
  try {
    await requireOwnerNow(controller.signal);
    recognizer = await createMarkedPageRecognizer({ signal: controller.signal, knownTerms: collectedLiteralTerms(), onProgress: updateProgress });
    if (!stillCurrent()) { await terminateRecognizer(recognizer); throw markedAbortError(); }
    state.recognizer = recognizer;
    for (const pageNumber of pages) {
      if (!stillCurrent()) throw markedAbortError();
      activePage = pageNumber;
      say(refs.status, `正在识别第 ${completed + 1}/${pages.length} 页；只处理你选中的页。`);
      refs.progress.textContent = `第 ${pageNumber} 页：正在本地读取彩色划线…`;
      const canvas = await current.renderPage(pageNumber, { signal: controller.signal });
      let response;
      try {
        if (!stillCurrent()) throw markedAbortError();
        displayCanvas(canvas, pageNumber);
        response = await recognizer.recognizePage(canvas, { signal: controller.signal, onProgress: updateProgress });
      } finally { canvas.width = canvas.height = 1; }
      if (!stillCurrent()) throw markedAbortError();
      const candidates = decodedCandidates(response, pageNumber, current.fileHash);
      state.candidates = state.candidates.filter((candidate) => candidate.pageNumber !== pageNumber || candidate.saved).concat(candidates);
      const warnings = Array.isArray(response.warnings) ? response.warnings.filter((warning) => typeof warning === "string").slice(0, 8) : [];
      if (!candidates.length) warnings.push("没有找到可确认的蓝／红色下划线词，不收录整页英文。");
      state.warnings.push(...warnings.map((warning) => `第 ${pageNumber} 页：${warning.slice(0, 400)}`));
      state.warnings = state.warnings.slice(-40);
      completed += 1; renderCandidates();
    }
    if (!stillCurrent()) return;
    say(refs.status, `已完成 ${completed} 页识别。请核对并勾选需要的词，候选尚未写入草稿。`);
    refs.progress.textContent = "已在本机完成；没有上传图片，也没有自动发布。";
  } catch (error) {
    if (epoch !== state.workEpoch || documentEpoch !== state.documentEpoch) return;
    if ([401, 403].includes(error.status)) { lockOwner("验证已失效；未开始识别后续页，请重新使用原来的 GitHub 登录。"); return; }
    if (error.name === "AbortError" || controller.signal.aborted) say(refs.status, "已停止本地识别；已得到的候选仍保留。");
    else say(refs.status, `本地识别未完成：${error.message || "引擎暂不可用"}。已完成 ${completed} 页的候选保留，没有自动重试或入库。`, "error");
    refs.progress.textContent = "可检查照片清晰度或稍后手动重试；不会改为收录整页文字。";
  } finally {
    if (recognizer) await terminateRecognizer(recognizer);
    if (state.recognizer === recognizer) state.recognizer = null;
    if (epoch === state.workEpoch) { state.operationController = null; setBusy(); }
  }
}

async function saveSelected() {
  const selected = selectedCandidates();
  if (state.busy || !state.document || !selected.length || selected.length > 60) return;
  if (refs.book.value && !refs.chapter.value) { say(refs.importStatus, "请选择所属章节，或切回“不分类，先保存草稿”。", "error"); return; }
  const epoch = ++state.workEpoch, current = state.document;
  const controller = new AbortController(); state.operationController = controller;
  setBusy("import"); say(refs.importStatus, "正在核对已有词条并保存本地草稿；不会发布…");
  try {
    await requireOwnerNow(controller.signal);
    const remote = await getOwnerWordbook({ signal: controller.signal });
    if (epoch !== state.workEpoch || controller.signal.aborted) return;
    const snapshot = parsePublicSnapshot(remote.snapshot, { allowLegacy: false });
    state.snapshot = snapshot;
    const result = await importMarkedCandidates(selected.map((candidate) => ({
      text: candidate.text, originalText: candidate.originalText, recognizedText: candidate.recognizedText, context: candidate.context,
      markType: candidate.markType, certainty: candidate.certainty, region: [...candidate.region],
      pageNumber: candidate.pageNumber, sourceId: candidate.sourceId
    })), { snapshot, bookId: refs.book.value, chapterId: refs.chapter.value,
      sourceTitle: refs.sourceTitle.value.trim(), fileName: current.fileName.slice(0, 240), fileHash: current.fileHash });
    if (epoch !== state.workEpoch || state.document !== current) return;
    for (const candidate of selected) { candidate.saved = true; candidate.selected = false; }
    renderCandidates(); refs.openDrafts.hidden = false;
    say(refs.importStatus, `已保存 ${result.added.length} 份本地草稿；${result.duplicates.length} 项已经存在或与本批重复，未重复创建。请到管理页核对释义后再发布。`, "success");
    say(refs.status, "所选词已处理，未勾选的候选仍留在当前页；没有自动发布。");
  } catch (error) {
    if (epoch !== state.workEpoch) return;
    if ([401, 403].includes(error.status)) { lockOwner("验证已失效，没有保存新的草稿，请重新验证。"); return; }
    say(refs.importStatus, `没有完成保存：${error.message || "本机存储暂不可用"}。勾选和修改仍保留，请处理后重试。`, "error");
  } finally { if (epoch === state.workEpoch) { state.operationController = null; setBusy(); } }
}

refs.loginLink.href = ownerLoginUrl();
refs.authRetry.addEventListener("click", initialize);
refs.chooseFile.addEventListener("click", () => refs.file.click());
refs.cameraButton.addEventListener("click", () => refs.camera.click());
for (const input of [refs.file, refs.camera]) input.addEventListener("change", () => {
  const file = input.files?.[0]; input.value = ""; void chooseFile(file);
});
refs.book.addEventListener("change", updateChapterOptions);
refs.chapter.addEventListener("change", updateSourceTitle);
refs.sourceTitle.addEventListener("input", () => { state.sourceEdited = true; });
refs.pages.addEventListener("input", updateTogglePage);
refs.previewPage.addEventListener("change", () => { if (!state.busy) void renderPreview(Number(refs.previewPage.value)).catch((error) => { if (error.name !== "AbortError") say(refs.status, error.message, "error"); }); });
for (const [button, step] of [[refs.previousPage, -1], [refs.nextPage, 1]]) button.addEventListener("click", () => {
  if (!state.busy) void renderPreview(state.previewPage + step).catch((error) => { if (error.name !== "AbortError") say(refs.status, error.message, "error"); });
});
refs.togglePage.addEventListener("click", () => {
  if (!state.document || state.busy) return;
  try {
    const pages = new Set(refs.pages.value.trim() ? parseMarkedPageSelection(refs.pages.value, state.document.pageCount) : []);
    if (pages.has(state.previewPage)) pages.delete(state.previewPage); else pages.add(state.previewPage);
    if (pages.size > 5) throw new Error("每批最多 5 页，请先移出其他页。");
    refs.pages.value = [...pages].sort((left, right) => left - right).join(","); updateTogglePage();
  } catch (error) { say(refs.status, error.message, "error"); }
});
refs.start.addEventListener("click", startRecognition);
refs.cancel.addEventListener("click", () => cancelCurrent());
refs.import.addEventListener("click", saveSelected);
refs.clearSelection.addEventListener("click", () => { for (const candidate of state.candidates) candidate.selected = false; renderCandidates(); });
window.addEventListener("offline", () => { if (!state.busy) say(refs.status, "图片只在本机处理；首次下载引擎、验证登录和保存草稿前的词库核对仍需联网。"); setBusy(state.busy); });
window.addEventListener("online", () => setBusy(state.busy));
window.addEventListener("beforeunload", (event) => {
  if (state.busy === "scan" || selectedCandidates().length) { event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("pagehide", () => {
  state.closed = true; state.authEpoch += 1; cancelCurrent(); void destroyDocument();
  state.candidates = []; state.warnings = [];
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  state.closed = false; say(refs.status, "页面已恢复；原文件没有保存，请重新选择。已保存的本地草稿仍保留。");
  void initialize();
});
void initialize();
