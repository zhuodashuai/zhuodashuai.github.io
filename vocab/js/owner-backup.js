import { parsePublicSnapshot, validatePublicEntry } from "./wordbook-schema.js";

// Decimal MB, measured as UTF-8 bytes rather than JavaScript string length.
// Import and export share this bound so the app does not create an oversized
// backup that its own importer cannot read. Draft/entry schema limits still apply.
export const OWNER_BACKUP_MAX_BYTES = 10_000_000;
export const OWNER_BACKUP_MAX_DRAFTS = 1000;
const BACKUP_SIZE_LABEL = `${OWNER_BACKUP_MAX_BYTES / 1_000_000} MB`;

function validateBackupDocument(documentValue) {
  if (!documentValue || documentValue.backupVersion !== 1 || documentValue.owner !== "zhuodashuai" || !Array.isArray(documentValue.drafts)) {
    throw new Error("备份文件格式不正确。");
  }
  if (documentValue.drafts.length > OWNER_BACKUP_MAX_DRAFTS) throw new Error("备份中的草稿数量过多。");
  if (documentValue.publicSnapshot) parsePublicSnapshot(documentValue.publicSnapshot);
  return documentValue.drafts.map(draft => {
    if (!draft || typeof draft !== "object" || Array.isArray(draft) || !draft.value || typeof draft.value !== "object" || Array.isArray(draft.value)) {
      throw new Error("备份包含格式不正确的草稿。");
    }
    // Keep an unfinished source URL as draft text, just as the editor does.
    // It is not trusted as a published link; publication validates it separately.
    const draftSourceUrl = typeof draft.value.sourceUrl === "string" ? draft.value.sourceUrl.slice(0, 2000) : "";
    const value = validatePublicEntry({ ...draft.value, sourceUrl: "" });
    return { ...draft, value: { ...value, sourceUrl: draftSourceUrl } };
  });
}

export function createOwnerBackupBlob({ drafts, publicSnapshot, exportedAt = new Date().toISOString() }) {
  const backup = { backupVersion: 1, exportedAt, owner: "zhuodashuai", drafts, publicSnapshot };
  validateBackupDocument(backup);
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" });
  if (blob.size > OWNER_BACKUP_MAX_BYTES) {
    throw new Error(`备份文件超过 ${BACKUP_SIZE_LABEL}，无法导出；请先减少本地草稿后重试。`);
  }
  return blob;
}

export async function readOwnerBackupFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.text !== "function") {
    throw new Error("备份文件格式不正确。");
  }
  // Reject before reading, not after loading an arbitrarily large file to memory.
  if (file.size > OWNER_BACKUP_MAX_BYTES) throw new Error(`备份文件超过 ${BACKUP_SIZE_LABEL}，已拒绝读取。`);
  const text = await file.text();
  if (new TextEncoder().encode(text).byteLength > OWNER_BACKUP_MAX_BYTES) {
    throw new Error(`备份文件超过 ${BACKUP_SIZE_LABEL}，已拒绝解析。`);
  }
  const documentValue = JSON.parse(text);
  const safeDrafts = validateBackupDocument(documentValue);
  return {
    ...documentValue,
    drafts: safeDrafts.map(draft => ({
      ...draft,
      id: crypto.randomUUID(),
      localState: "local_saved",
      lastOperationId: null
    }))
  };
}
