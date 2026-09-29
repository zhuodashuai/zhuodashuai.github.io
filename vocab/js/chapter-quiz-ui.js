import { createChapterQuiz, applyQuizAnswer, summarizeQuizAttempt } from "./chapter-quiz.js";
import { quizStorage, QuizConflictError } from "./quiz-storage.js";

function element(tag, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function control(label, id, action, className = "") {
  const node = element("button", label, className);
  node.type = "button";
  if (id) node.id = id;
  node.addEventListener("click", action);
  return node;
}

function dateLabel(value) {
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

/** A private, device-local quiz. It never updates cards or the spaced-review schedule. */
export function setupChapterQuiz({ launchButton, dialog, getScope }) {
  // An installed older shell can briefly coexist with revalidated modules.
  // Keep its reader working until the new HTML arrives instead of making the
  // optional quiz a fatal dependency for the whole wordbook.
  if (!launchButton || !dialog) {
    return { updateScope() {}, async flushPendingSave() {} };
  }
  const title = dialog.querySelector("#quiz-title");
  const scopeLabel = dialog.querySelector("#quiz-scope");
  const content = dialog.querySelector("#quiz-content");
  const message = dialog.querySelector("#quiz-message");
  const closeButton = dialog.querySelector("#quiz-close");
  let scope = null;
  let attempt = null;
  let generation = 0;
  let pendingSave = null;
  let saveFailed = false;

  function heading(text, id = "") {
    const node = element("h3", text);
    if (id) node.id = id;
    node.tabIndex = -1;
    return node;
  }

  function replace(...nodes) {
    content.replaceChildren(...nodes);
    message.textContent = "";
    dialog.scrollTop = 0;
    content.querySelector("h3")?.focus({ preventScroll: true });
  }

  function showError(error) {
    message.textContent = error instanceof QuizConflictError
      ? "这次测试已在另一个页面更新，本次没有覆盖它。请返回首页后继续上次测试。"
      : `没有保存成功，请重试。${error?.message || "本机存储暂不可用。"}`;
  }

  function menuButton() {
    return control("返回测试首页", "quiz-menu", () => { void showMenu(); }, "quiet-button");
  }

  // Freeze the attempt at start: background wordbook refreshes must not change
  // questions, answer keys, score denominators or the chapter being tested.
  async function saveWork(task) {
    if (pendingSave) return;
    const token = generation;
    content.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    message.textContent = "正在保存…";
    pendingSave = (async () => {
      try {
        await task(token);
        saveFailed = false;
      } catch (error) {
        saveFailed = token === generation && dialog.open;
        if (token === generation && dialog.open) {
          showError(error);
          content.querySelectorAll("button").forEach((button) => { button.disabled = false; });
        }
      }
    })();
    await pendingSave;
    pendingSave = null;
  }

  async function start() {
    await saveWork(async (token) => {
      const next = createChapterQuiz(scope.entries, scope);
      if (!next.questions.length) throw new Error("本章暂时凑不出四个可区分的中文选项，请先使用学习 / 复习。 ");
      await quizStorage.createAttempt(next);
      attempt = next;
      if (token === generation && dialog.open) showQuestion();
    });
  }

  async function showMenu() {
    if (pendingSave) await pendingSave;
    const token = ++generation;
    title.textContent = "开篇测试";
    replace(heading("先测一测，看看记住了多少"), element("p", "英文 → 四选一中文 · 题目与选项每轮随机", "quiz-muted"));
    try {
      const records = await quizStorage.listAttempts(scope);
      if (token !== generation || !dialog.open) return;
      saveFailed = false;
      const unfinished = records.find((record) => !record.completedAt);
      const actions = element("div", "", "quiz-actions");
      if (unfinished) {
        actions.append(control(`继续上次测试（${unfinished.answers.length}/${unfinished.questions.length}）`, "quiz-resume", () => {
          attempt = unfinished;
          showQuestion();
        }, "primary-button"));
      }
      actions.append(control(unfinished ? "开始新一轮" : "开始测试", "quiz-start", () => { void start(); }, unfinished ? "" : "primary-button"));
      actions.append(control(`测试记录（${records.length}）`, "quiz-history", () => { void showHistory(); }));
      const detail = element("p", `范围：本章 ${scope.entries.length} 个词条，不受搜索或类型筛选影响。`, "quiz-muted");
      const note = element("p", "每题自动保存，可中途退出。成绩仅存本机，不改原有复习进度。", "quiz-muted quiz-small");
      content.append(detail, actions, note);
    } catch (error) {
      if (token !== generation || !dialog.open) return;
      message.textContent = `暂时无法读取本机测试记录，未开始测试。${error?.message || ""}`;
      content.append(control("重试读取", "quiz-retry", () => { void showMenu(); }));
    }
  }

  async function answer(question, optionId) {
    await saveWork(async (token) => {
      const next = applyQuizAnswer(attempt, question.id, optionId);
      await quizStorage.saveAttempt(next, { expectedRevision: attempt.revision });
      attempt = next;
      if (token === generation && dialog.open) showQuestion(question);
    });
  }

  function showQuestion(answeredQuestion = null) {
    const question = answeredQuestion || attempt.questions[attempt.answers.length];
    if (!question) return showResults(attempt);
    const index = attempt.questions.findIndex((item) => item.id === question.id);
    const progress = element("p", `${index + 1} / ${attempt.questions.length}`, "quiz-muted");
    progress.id = "quiz-progress";
    const term = heading(question.term, "quiz-term");
    term.lang = "en";
    const prompt = element("p", "选择它在本章中的中文意思", "quiz-muted");
    const options = element("div", "", "quiz-options");
    options.id = "quiz-options";
    options.setAttribute("role", "group");
    options.setAttribute("aria-labelledby", "quiz-term");
    const recorded = attempt.answers.find((item) => item.questionId === question.id);
    question.options.forEach((option, optionIndex) => {
      const button = control("", "", () => { void answer(question, option.id); }, "quiz-option");
      button.dataset.optionId = option.id;
      button.append(element("span", String.fromCharCode(65 + optionIndex), "quiz-option-letter"), element("span", option.meaning));
      if (recorded) {
        button.disabled = true;
        if (option.id === question.correctOptionId) button.classList.add("is-correct");
        else if (option.id === recorded.optionId) button.classList.add("is-wrong");
      }
      options.append(button);
    });
    const footer = element("div", "", "quiz-actions");
    if (recorded) {
      const correct = recorded.optionId === question.correctOptionId;
      const feedback = element("p", correct ? "答对了 ✓ · 本题已保存" : `这题再记一下：${question.meaning} · 本题已保存`, correct ? "quiz-feedback is-correct" : "quiz-feedback is-wrong");
      feedback.id = "quiz-feedback";
      feedback.tabIndex = -1;
      feedback.setAttribute("role", "status");
      footer.append(control(attempt.completedAt ? "查看成绩" : "下一题", "quiz-next", () => showQuestion(), "primary-button"));
      footer.append(menuButton());
      replace(progress, term, prompt, options, feedback, footer);
      feedback.focus({ preventScroll: true });
    } else {
      footer.append(menuButton());
      replace(progress, term, prompt, options, footer);
    }
  }

  function omissions(record) {
    if (!record.omitted.length) return element("span");
    const details = element("details", "", "quiz-omissions");
    details.append(element("summary", `${record.omitted.length} 项暂未出题（选项不足或释义待完善）`));
    const list = element("ul");
    const reasons = { "missing-meaning": "中文释义待完善", "ambiguous-headword": "相同词形对应多个义项", "insufficient-distinct-options": "可区分的选项不足四个" };
    for (const item of record.omitted) list.append(element("li", `${item.term}：${reasons[item.reason] || "暂不适合出题"}`));
    details.append(list);
    return details;
  }

  function showResults(record) {
    const summary = summarizeQuizAttempt(record);
    const label = heading(record.completedAt ? "本轮成绩" : "本轮进度");
    const score = element("p", summary.accuracy === null ? "尚未作答" : `${summary.accuracy}%`, "quiz-score");
    score.id = "quiz-result-accuracy";
    const count = element("p", `已答 ${summary.answered}/${summary.total} · 答对 ${summary.correct} · 错词 ${summary.wrongWords.length}`, "quiz-muted");
    const date = element("p", `${dateLabel(record.startedAt)} 开始 · ${record.completedAt ? "已完成" : "未完成，正确率仅按已答题计算"}`, "quiz-muted quiz-small");
    const wrongList = element("ul", "", "quiz-wrong-list");
    wrongList.id = "quiz-wrong-list";
    for (const item of summary.wrongWords) {
      const row = element("li");
      const word = element("strong", item.term);
      word.lang = "en";
      row.append(word, element("p", `正确：${item.meaning}`), element("p", `你选了：${item.selectedMeaning}`, "quiz-muted"));
      wrongList.append(row);
    }
    const actions = element("div", "", "quiz-actions");
    if (!record.completedAt) actions.append(control("继续这次测试", "quiz-resume", () => { attempt = record; showQuestion(); }, "primary-button"));
    actions.append(control("再测一次", "quiz-restart", () => { void start(); }, record.completedAt ? "primary-button" : ""), control("测试记录", "quiz-history", () => { void showHistory(); }), menuButton());
    replace(label, score, count, date, actions, element("h4", summary.wrongWords.length ? "下次先复习这些词" : summary.answered ? "目前没有错词，继续保持。" : "完成答题后，这里会整理错词。"), wrongList, omissions(record));
  }

  async function showHistory() {
    if (pendingSave) await pendingSave;
    const token = ++generation;
    replace(heading("本章测试记录"), element("p", "正在读取…", "quiz-muted"));
    try {
      const records = await quizStorage.listAttempts(scope);
      if (token !== generation || !dialog.open) return;
      saveFailed = false;
      const list = element("ul", "", "quiz-history-list");
      list.id = "quiz-history-list";
      for (const record of records) {
        const summary = summarizeQuizAttempt(record);
        const score = summary.accuracy === null ? "未作答" : `${summary.accuracy}%`;
        const open = control("", "", () => showResults(record), "quiz-history-open");
        open.dataset.attemptId = record.id;
        open.append(element("strong", `${score} · ${record.completedAt ? "已完成" : "进行中"}`), element("span", `${dateLabel(record.startedAt)} · ${summary.answered}/${summary.total} 题 · ${summary.wrongWords.length} 个错词`));
        const row = element("li");
        row.append(open);
        list.append(row);
      }
      const actions = element("div", "", "quiz-actions");
      actions.append(menuButton());
      if (records.length) actions.append(control("导出本章测试记录", "quiz-export", () => {
        const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), attempts: records }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `chapter-quiz-${scope.bookId}-${scope.chapterId}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }));
      replace(heading("本章测试记录"), element("p", records.length ? "点开一轮，查看正确率和错词。" : "还没有记录，开始第一轮吧。", "quiz-muted"), list, actions);
    } catch (error) {
      if (token !== generation || !dialog.open) return;
      message.textContent = `读取记录失败。${error?.message || ""}`;
      content.append(menuButton());
    }
  }

  function updateScope() {
    const current = getScope();
    launchButton.hidden = !current;
    document.body.classList.toggle("has-chapter-quiz", Boolean(current));
    if (current) launchButton.title = `${current.chapterTitle} · 随机四选一与测试记录`;
  }

  launchButton.addEventListener("click", () => {
    const current = getScope();
    if (!current) return;
    scope = structuredClone(current);
    scopeLabel.textContent = `${scope.bookTitle} · ${scope.chapterTitle}`;
    dialog.showModal();
    void showMenu();
  });
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    generation += 1;
    // Closing acknowledges any failed answer; resume always reads the durable
    // progress, rather than treating a rejected answer as an unsaved draft.
    saveFailed = false;
    launchButton.focus({ preventScroll: true });
  });
  updateScope();
  return {
    updateScope,
    async flushPendingSave() {
      if (pendingSave) await pendingSave;
      if (saveFailed) throw new Error("测试记录尚未保存，请重试后更新。");
    }
  };
}
