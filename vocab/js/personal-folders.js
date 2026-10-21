const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const FOLDER_ID = new RegExp(`^folder-${UUID}$`, "u");
const ENTRY_ID = new RegExp(`^member-${UUID}$`, "u");
const USER_ID = new RegExp(`^${UUID}$`, "u");
const clone = value => structuredClone(value);
const revision = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function validateOperation(operation) {
  if (!USER_ID.test(operation?.userId) || !["member", "github-owner"].includes(operation.authType)
    || !["create", "rename", "delete", "entries"].includes(operation.kind) || !operation.body || typeof operation.body !== "object"
    || operation.kind !== "create" && !FOLDER_ID.test(operation.folderId)) throw new Error("分类操作或当前账号格式不正确。");
  if (operation.kind !== "create" && (!revision(operation.body.revision) || operation.body.revision < 1)) throw new Error("请先刷新收藏夹版本。");
  if (["create", "rename"].includes(operation.kind)) validatePersonalFolderName(operation.body.name);
  if (operation.kind === "entries" && (!Array.isArray(operation.body.entryIds) || operation.body.entryIds.length < 1 || operation.body.entryIds.length > 100
    || new Set(operation.body.entryIds).size !== operation.body.entryIds.length || operation.body.entryIds.some(id => !ENTRY_ID.test(id))
    || !["add", "remove"].includes(operation.body.mode))) throw new Error("每次归类需选择1–100个有效词条。");
}

export function validatePersonalFolderName(value) {
  if (typeof value !== "string" || [...value].length > 160 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error("收藏夹名称不能包含控制字符或无效字符。");
  const name = value.normalize("NFKC").trim();
  if (!name || [...name].length > 40) throw new Error("收藏夹名称需为1–40个字符，不能包含控制字符。");
  return name;
}

export function validatePersonalFolder(value) {
  if (!value || !FOLDER_ID.test(value.id) || !revision(value.revision) || value.revision < 1
    || !Array.isArray(value.entryIds) || value.entryIds.length > 1000
    || value.entryIds.some(id => typeof id !== "string" || !ENTRY_ID.test(id))
    || new Set(value.entryIds).size !== value.entryIds.length
    || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || value.updatedAt < value.createdAt
    || validatePersonalFolderName(value.name) !== value.name) throw new Error("收藏夹数据格式不正确，请刷新核对。");
  return { id: value.id, name: value.name, entryIds: [...value.entryIds], createdAt: value.createdAt, updatedAt: value.updatedAt, revision: value.revision };
}

export function validatePersonalFolders(value) {
  if (!value || !revision(value.revision) || !Array.isArray(value.folders) || value.folders.length > 50) throw new Error("收藏夹列表格式不正确，请重试。");
  const folders = value.folders.map(validatePersonalFolder);
  if (new Set(folders.map(folder => folder.id)).size !== folders.length
    || new Set(folders.map(folder => folder.name.toLowerCase())).size !== folders.length) throw new Error("收藏夹列表包含重复分类。");
  return { revision: value.revision, folders };
}

export function validatePersonalFolderResult(value, folderId = null) {
  if (!value || !revision(value.revision) || !["created", "updated", "deleted", "idempotent"].includes(value.action)
    || !Object.hasOwn(value, "folder")) throw new Error("收藏夹操作结果尚未完整确认，请保留本次操作后重试。");
  const folder = value.folder === null ? null : validatePersonalFolder(value.folder);
  if (folder && folderId && folder.id !== folderId) throw new Error("返回的收藏夹与本次操作不一致。");
  if (value.action === "created" && !folder || value.action === "deleted" && folder) throw new Error("收藏夹操作结果不一致。");
  return { revision: value.revision, action: value.action, folder };
}

/** Categorisation is an ID-only view: never duplicate entries or study records. */
export function filterPersonalFolderEntries(entries, folders, selected = "all") {
  if (selected === "all") return [...entries];
  const ids = selected === "unfiled"
    ? new Set(folders.flatMap(folder => folder.entryIds))
    : new Set(folders.find(folder => folder.id === selected)?.entryIds || []);
  return entries.filter(entry => selected === "unfiled" ? !ids.has(entry.id) : ids.has(entry.id));
}

/** Export adds folders without dropping the existing entries or learning data. */
export function serializePersonalFolderExport(existingExport, folders, folderRevision = 0) {
  const backup = JSON.parse(existingExport);
  if (backup?.format !== "zhuo-private-wordbook" || !Array.isArray(backup.entries)) throw new Error("词本备份格式不正确。");
  const validated = validatePersonalFolders({ revision: folderRevision, folders });
  const ids = new Set(backup.entries.map(entry => entry.id));
  if (validated.folders.some(folder => folder.entryIds.some(id => !ids.has(id)))) throw new Error("收藏夹与当前词条快照不一致，请刷新词本和分类后重新导出。");
  return JSON.stringify({ ...backup, folders: validated.folders, foldersRevision: validated.revision }, null, 2);
}

/** One uncertain operation is retained verbatim, only in the active page's memory. */
export function createPersonalFolderMutation({ newId = () => globalThis.crypto.randomUUID() } = {}) {
  let pending = null;
  let fingerprint = null;
  const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  return {
    begin(operation) {
      validateOperation(operation);
      const input = clone(operation);
      if (pending) {
        if (fingerprint !== stable(input)) throw new Error("还有一次收藏夹操作尚未确认，请先重试或核对。");
        return clone(pending);
      }
      fingerprint = stable(input);
      pending = { ...input, body: { ...input.body, mutationId: newId() } };
      return clone(pending);
    },
    snapshot(userId) { return pending?.userId === userId ? clone(pending) : null; },
    restore(operation) {
      validateOperation(operation);
      if (!USER_ID.test(operation.body?.mutationId) || pending) throw new Error("无法恢复这次分类操作。");
      const { mutationId, ...body } = operation.body;
      fingerprint = stable({ ...operation, body });
      pending = clone(operation);
    },
    hasPending() { return pending !== null; },
    clear() { pending = null; fingerprint = null; }
  };
}
