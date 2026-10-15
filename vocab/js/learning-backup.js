import { listReviewStates, mergeReviewStates, planReviewStatesMerge } from "./owner-storage.js?v=69";
import { quizStorage, planQuizAttemptsMerge } from "./quiz-storage.js?v=69";

export const LEARNING_BACKUP_MAX_BYTES = 10_000_000;
export const LEARNING_BACKUP_MAX_REVIEWS = 10000;
export const LEARNING_BACKUP_MAX_ATTEMPTS = 2000;
export const LEARNING_BACKUP_FORMAT = "zhuo-wordbook-learning";

const defaults = { reviews: { listReviewStates, mergeReviewStates }, quizzes: quizStorage };
const bytes = (text) => new TextEncoder().encode(text).byteLength;
const withoutChanges = ({ changes, ...summary }) => summary;

export function validateLearningBackup(value) {
  const keys = ["format", "backupVersion", "exportedAt", "reviewStates", "quizAttempts"];
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
    || value.format !== LEARNING_BACKUP_FORMAT || value.backupVersion !== 1) throw new Error("这不是受支持的学习记录备份；不会导入词库、草稿或登录信息。");
  if (typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))
    || new Date(value.exportedAt).toISOString() !== value.exportedAt) throw new Error("备份导出时间不正确。");
  if (!Array.isArray(value.reviewStates) || value.reviewStates.length > LEARNING_BACKUP_MAX_REVIEWS
    || !Array.isArray(value.quizAttempts) || value.quizAttempts.length > LEARNING_BACKUP_MAX_ATTEMPTS) throw new Error("备份记录数量超过限制，或记录格式不正确。");
  // Both arrays are completely validated before any restore operation can run.
  const reviewStates = planReviewStatesMerge([], value.reviewStates).changes;
  const quizAttempts = planQuizAttemptsMerge([], value.quizAttempts).changes;
  const backup = { format: value.format, backupVersion: 1, exportedAt: value.exportedAt, reviewStates, quizAttempts };
  if (bytes(JSON.stringify(backup)) > LEARNING_BACKUP_MAX_BYTES) throw new Error("学习记录备份超过 10 MB，无法处理。");
  return backup;
}

export function parseLearningBackupText(text) {
  if (typeof text !== "string") throw new Error("备份文件不是有效文本。");
  if (bytes(text) > LEARNING_BACKUP_MAX_BYTES) throw new Error("学习记录备份超过 10 MB，已拒绝读取。");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("备份文件不是有效的 JSON，请重新选择导出的学习记录文件。"); }
  // Previous versions already exported chapter quizzes. Those exact files can
  // recover their attempts too, without granting access to owner backup fields.
  if (value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 3 && Object.prototype.hasOwnProperty.call(value, "schemaVersion")
    && Object.prototype.hasOwnProperty.call(value, "exportedAt") && Object.prototype.hasOwnProperty.call(value, "attempts")
    && value.schemaVersion === 1) {
    value = { format: LEARNING_BACKUP_FORMAT, backupVersion: 1, exportedAt: value.exportedAt, reviewStates: [], quizAttempts: value.attempts };
  }
  return validateLearningBackup(value);
}

export async function readLearningBackupFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.text !== "function") throw new Error("请选择有效的学习记录备份文件。");
  if (file.size > LEARNING_BACKUP_MAX_BYTES) throw new Error("学习记录备份超过 10 MB，已拒绝读取。");
  return parseLearningBackupText(await file.text());
}

export function createLearningBackupBlob({ reviewStates, quizAttempts, exportedAt = new Date().toISOString() }) {
  const backup = validateLearningBackup({ format: LEARNING_BACKUP_FORMAT, backupVersion: 1, exportedAt, reviewStates, quizAttempts });
  const blob = new Blob([`${JSON.stringify(backup)}\n`], { type: "application/json" });
  if (blob.size > LEARNING_BACKUP_MAX_BYTES) throw new Error("学习记录备份超过 10 MB，无法导出。");
  return blob;
}

export function planLearningRestore(value, { reviewStates = [], quizAttempts = [] } = {}) {
  const backup = validateLearningBackup(value);
  return {
    exportedAt: backup.exportedAt,
    totals: { reviews: backup.reviewStates.length, quizzes: backup.quizAttempts.length },
    reviews: withoutChanges(planReviewStatesMerge(reviewStates, backup.reviewStates)),
    quizzes: withoutChanges(planQuizAttemptsMerge(quizAttempts, backup.quizAttempts))
  };
}

export async function exportLearningBackup({ reviews = defaults.reviews, quizzes = defaults.quizzes } = {}) {
  const [reviewStates, quizAttempts] = await Promise.all([reviews.listReviewStates(), quizzes.listAttempts()]);
  return createLearningBackupBlob({ reviewStates, quizAttempts });
}

export async function previewLearningRestore(value, { reviews = defaults.reviews, quizzes = defaults.quizzes } = {}) {
  const backup = validateLearningBackup(value);
  const [reviewStates, quizAttempts] = await Promise.all([reviews.listReviewStates(), quizzes.listAttempts()]);
  return planLearningRestore(backup, { reviewStates, quizAttempts });
}

/** Separate databases cannot share one transaction. Each store is atomic and retries are idempotent. */
export async function restoreLearningBackup(value, { reviews = defaults.reviews, quizzes = defaults.quizzes } = {}) {
  const backup = validateLearningBackup(value);
  const stores = {};
  for (const [name, operation] of [
    ["reviews", () => reviews.mergeReviewStates(backup.reviewStates)],
    ["quizzes", () => quizzes.mergeAttempts(backup.quizAttempts)]
  ]) {
    try { stores[name] = { status: "merged", ...await operation() }; }
    catch { stores[name] = { status: "failed", retryable: true }; }
  }
  const successes = Object.values(stores).filter(({ status }) => status === "merged").length;
  return { ok: successes === 2, partial: successes === 1, retryable: successes !== 2, stores };
}

export function learningRestoreMessage(result) {
  const merged = Object.values(result.stores).filter(({ status }) => status === "merged");
  const count = (key) => merged.reduce((sum, store) => sum + store[key], 0);
  const prefix = result.ok ? "合并完成" : result.partial ? "部分记录已合并" : "本次没有合并成功";
  let message = `${prefix}：新增 ${count("added")}，更新 ${count("updated")}，相同 ${count("unchanged")}，保留本机较新 ${count("keptLocal")}，保留冲突 ${count("conflicts")}。`;
  if (result.retryable) {
    const failed = Object.entries(result.stores).filter(([, store]) => store.status === "failed").map(([name]) => name === "reviews" ? "复习记录" : "测试记录").join("、");
    message += `${failed}未合并，原记录仍保留。可重试，已合并的记录不会重复添加。`;
  }
  return message;
}
