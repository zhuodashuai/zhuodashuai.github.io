import { exportLearningBackup, learningRestoreMessage, previewLearningRestore, readLearningBackupFile, restoreLearningBackup } from "./learning-backup.js?v=70";

export function setupLearningBackup({ container, onRestored = () => {}, services } = {}) {
  if (!container) return { async flushPendingSave() {} };
  const root = container.ownerDocument;
  const element = (tag, text, className) => {
    const node = root.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const details = element("details", "", "learning-backup-panel");
  const summary = element("summary", "学习记录备份");
  const description = element("p", "记录仅存本机；导出后可带到其他设备。选择文件后先预览，再合并。", "learning-backup-note");
  const actions = element("div", "", "learning-backup-actions");
  const exportButton = element("button", "导出学习记录");
  const chooseButton = element("button", "选择备份文件");
  const applyButton = element("button", "合并这些记录");
  exportButton.type = chooseButton.type = applyButton.type = "button";
  exportButton.id = "learning-backup-export";
  chooseButton.id = "learning-backup-choose";
  applyButton.id = "learning-backup-apply";
  const fileInput = element("input");
  fileInput.type = "file"; fileInput.accept = ".json,application/json"; fileInput.hidden = true;
  fileInput.id = "learning-backup-file";
  fileInput.setAttribute("aria-label", "选择学习记录备份文件");
  const preview = element("p", "", "learning-backup-preview");
  preview.id = "learning-backup-preview";
  const status = element("p", "", "learning-backup-status");
  status.id = "learning-backup-status";
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  applyButton.hidden = true; applyButton.disabled = true;
  actions.append(exportButton, chooseButton, applyButton, fileInput);
  details.append(summary, description, actions, preview, status);
  container.replaceChildren(details);
  let selected = null;
  let generation = 0;
  let pendingSave = null;
  const setBusy = (busy) => {
    exportButton.disabled = chooseButton.disabled = fileInput.disabled = busy;
    applyButton.disabled = busy || !selected;
  };
  chooseButton.addEventListener("click", () => fileInput.click());
  exportButton.addEventListener("click", async () => {
    setBusy(true); status.textContent = "正在导出…";
    try {
      const blob = await exportLearningBackup(services);
      const url = URL.createObjectURL(blob);
      const link = element("a"); link.href = url;
      link.download = `zhuo-learning-${new Date().toISOString().slice(0, 10)}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "已导出复习和测试记录。备份含个人学习记录，请妥善保存。";
    } catch (error) { status.textContent = `导出失败：${error?.message || "请稍后重试。"}`; }
    finally { setBusy(false); }
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    const token = ++generation;
    selected = null; preview.textContent = ""; applyButton.hidden = true;
    if (!file) { setBusy(false); return; }
    setBusy(true); status.textContent = "正在核对备份…";
    try {
      const backup = await readLearningBackupFile(file);
      const plan = await previewLearningRestore(backup, services);
      if (token !== generation) return;
      selected = backup;
      const combined = (key) => plan.reviews[key] + plan.quizzes[key];
      preview.textContent = `复习 ${plan.totals.reviews} 条 · 测试 ${plan.totals.quizzes} 轮；预计新增 ${combined("added")}、更新 ${combined("updated")}、相同 ${combined("unchanged")}、保留本机较新 ${combined("keptLocal")}、保留冲突 ${combined("conflicts")}。`;
      status.textContent = "尚未写入。点击合并后再次核对，本机较新记录和冲突记录都会保留。";
      applyButton.hidden = false; applyButton.textContent = "合并这些记录";
    } catch (error) {
      if (token === generation) status.textContent = `没有导入任何记录：${error?.message || "请重新选择备份文件。"}`;
    } finally {
      if (token === generation) { fileInput.value = ""; setBusy(false); }
    }
  });
  applyButton.addEventListener("click", () => {
    if (!selected || pendingSave) return;
    setBusy(true); status.textContent = "正在合并学习记录…";
    pendingSave = (async () => {
      try {
        const result = await restoreLearningBackup(selected, services);
        status.textContent = learningRestoreMessage(result);
        if (result.ok) { selected = null; applyButton.hidden = true; }
        else applyButton.textContent = "重试合并";
        try { await onRestored(result); }
        catch { status.textContent += " 请刷新页面查看最新记录。"; }
      } catch (error) { status.textContent = `没有导入任何记录：${error?.message || "请重试。"}`; }
      finally { pendingSave = null; setBusy(false); }
    })();
  });
  return { async flushPendingSave() { if (pendingSave) await pendingSave; } };
}
