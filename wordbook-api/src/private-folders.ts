import { ApiError, sha256Hex } from "./security";
import { MEMBER_UUID } from "./member-security";

/** Separate tenant-local classification. Entries and learning records are never copied. */
export interface PrivateFolder {
  id: string;
  name: string;
  entryIds: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
}
interface FolderMetadata { revision: number; count: number; folderBytes: number; ledgerBytes: number; ledgerCount: number }
interface FolderMutationRecord { fingerprint: string; folderId: string; expiresAt: number }
export type FolderAction = "create" | "rename" | "delete" | "entries";
interface PreparedFolderMutation {
  action: FolderAction;
  mutationId: string;
  folderId?: string;
  revision?: number;
  name?: string;
  entryIds?: string[];
  mode?: "add" | "remove";
  fingerprint: string;
}
export const FOLDER_LIMITS = Object.freeze({ folders: 50, name: 40, batch: 100, entries: 1000, ledger: 128, bytes: 4 * 1024 * 1024 });
const EMPTY: FolderMetadata = { revision: 0, count: 0, folderBytes: 0, ledgerBytes: 0, ledgerCount: 0 };
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const nameKey = (name: string) => `folder-name:${name.toLowerCase()}`;
export const validFolderId = (value: unknown): value is string => typeof value === "string" && value.startsWith("folder-") && MEMBER_UUID.test(value.slice(7));
const validMemberId = (value: unknown): value is string => typeof value === "string" && value.startsWith("member-") && MEMBER_UUID.test(value.slice(7));

function folderName(value: unknown): string {
  if (typeof value !== "string" || [...value].length > 160) throw new ApiError(400, "invalid_folder", "收藏夹名称须为 1–40 个字符。");
  const raw = value;
  const name = raw.normalize("NFKC").trim();
  if (!name || [...name].length > FOLDER_LIMITS.name || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(raw)) {
    throw new ApiError(400, "invalid_folder", "收藏夹名称须为 1–40 个字符，不能包含控制字符。");
  }
  return name;
}

export async function prepareFolderMutation(body: Record<string, unknown>, action: FolderAction): Promise<PreparedFolderMutation> {
  if (typeof body.mutationId !== "string" || !MEMBER_UUID.test(body.mutationId)) throw new ApiError(400, "invalid_mutation_id", "保存操作需要有效的唯一标识。");
  if (action !== "create" && (!validFolderId(body.folderId) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1)) {
    throw new ApiError(400, "invalid_folder", "收藏夹 ID 或版本不正确。");
  }
  const semantic: Omit<PreparedFolderMutation, "mutationId" | "fingerprint"> = {
    action, ...(action === "create" ? {} : { folderId: body.folderId as string, revision: body.revision as number })
  };
  if (action === "create" || action === "rename") semantic.name = folderName(body.name);
  if (action === "entries") {
    if (!Array.isArray(body.entryIds) || !body.entryIds.length || body.entryIds.length > FOLDER_LIMITS.batch
      || !body.entryIds.every(validMemberId) || new Set(body.entryIds).size !== body.entryIds.length
      || (body.mode !== "add" && body.mode !== "remove")) {
      throw new ApiError(400, "invalid_folder", "每次请选择 1–100 个不重复的个人词条，并指定加入或移出。");
    }
    semantic.entryIds = [...body.entryIds].sort();
    semantic.mode = body.mode;
  }
  return { ...semantic, mutationId: body.mutationId, fingerprint: await sha256Hex(JSON.stringify(semantic)) };
}

/** All callers run inside the existing PersonalWordbook transaction/auth boundary. */
export async function assertFolderMutationUnused(transaction: DurableObjectTransaction, mutationId: unknown): Promise<void> {
  const record = await transaction.get<FolderMutationRecord>(`folder-mutation:${mutationId}`);
  if (record && record.expiresAt > Date.now()) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于收藏夹内容。");
}

async function pruneLedger(transaction: DurableObjectTransaction, metadata: FolderMetadata, force = false): Promise<void> {
  const expiry = await transaction.list<{ key: string }>({ prefix: "folder-expiry:", limit: force ? 1 : 16 });
  for (const [expiryKey, value] of expiry) {
    if (!force && Number(expiryKey.split(":")[1]) > Date.now()) break;
    const old = await transaction.get<FolderMutationRecord>(value.key);
    if (old) {
      metadata.ledgerBytes = Math.max(0, metadata.ledgerBytes - byteLength(old));
      metadata.ledgerCount = Math.max(0, metadata.ledgerCount - 1);
      await transaction.delete(value.key);
    }
    await transaction.delete(expiryKey);
  }
}

export async function listPrivateFolders(transaction: DurableObjectTransaction): Promise<{ revision: number; folders: PrivateFolder[] }> {
  if (await transaction.get("deleted")) throw new ApiError(410, "account_deleted", "这个个人词库已删除。");
  const metadata = await transaction.get<FolderMetadata>("folders-meta");
  const rows = await transaction.list<PrivateFolder>({ prefix: "folder:", limit: FOLDER_LIMITS.folders + 1 });
  if (rows.size > FOLDER_LIMITS.folders) throw new ApiError(503, "personal_storage_invalid", "收藏夹需要安全检查，请稍后重试。");
  return { revision: metadata?.revision || 0, folders: [...rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) };
}

export async function applyPrivateFolderMutation(transaction: DurableObjectTransaction, request: PreparedFolderMutation) {
  if (await transaction.get("deleted")) throw new ApiError(410, "account_deleted", "这个个人词库已删除。");
  const metadata = { ...EMPTY, ...await transaction.get<FolderMetadata>("folders-meta") };
  // Independent ledgers must nevertheless reject active IDs from either other mutation type.
  for (const prefix of ["mutation:", "review-mutation:"]) {
    const other = await transaction.get<{ expiresAt: number }>(`${prefix}${request.mutationId}`);
    if (other && other.expiresAt > Date.now()) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于其他内容。");
  }
  const key = `folder-mutation:${request.mutationId}`;
  const known = await transaction.get<FolderMutationRecord>(key);
  if (known && known.expiresAt > Date.now()) {
    if (known.fingerprint !== request.fingerprint) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于其他内容。");
    // Read the current value, never resurrect a deleted folder or old membership on retry.
    return { folder: await transaction.get<PrivateFolder>(`folder:${known.folderId}`) || null, revision: metadata.revision, action: "idempotent" };
  }
  if (known) {
    await transaction.delete(key);
    await transaction.delete(`folder-expiry:${String(known.expiresAt).padStart(13, "0")}:${request.mutationId}`);
    metadata.ledgerBytes = Math.max(0, metadata.ledgerBytes - byteLength(known));
    metadata.ledgerCount = Math.max(0, metadata.ledgerCount - 1);
  }
  await pruneLedger(transaction, metadata);
  if (metadata.ledgerCount >= FOLDER_LIMITS.ledger) await pruneLedger(transaction, metadata, true);
  const previous = request.action === "create" ? undefined : await transaction.get<PrivateFolder>(`folder:${request.folderId}`);
  if (request.action !== "create") {
    if (!previous) throw new ApiError(404, "folder_missing", "收藏夹不存在，请刷新自己的收藏夹。");
    if (previous.revision !== request.revision) throw new ApiError(409, "revision_conflict", "收藏夹已在其他设备更新，当前操作没有覆盖它。", { existing: previous, revision: metadata.revision });
  }
  if (request.name !== undefined) {
    const owner = await transaction.get<string>(nameKey(request.name));
    if (owner && owner !== previous?.id) throw new ApiError(409, "duplicate_folder", "已经有同名收藏夹，请选择其他名称。");
  }
  if (request.action === "create" && metadata.count >= FOLDER_LIMITS.folders) throw new ApiError(413, "personal_folder_limit", "最多可创建 50 个收藏夹。");
  const members = new Set(previous?.entryIds || []);
  for (const id of request.entryIds || []) {
    // Never resolve another tenant or accept a syntactically valid but nonexistent ID.
    if (!await transaction.get(`entry:${id}`)) throw new ApiError(404, "entry_missing", "所选词条不在自己的词库中，请刷新后重试。");
    if (request.mode === "add") members.add(id); else members.delete(id);
  }
  if (members.size > FOLDER_LIMITS.entries) throw new ApiError(413, "folder_entry_limit", "收藏夹词条数量超过安全上限。");
  const now = new Date().toISOString();
  const folder: PrivateFolder | null = request.action === "delete" ? null : {
    id: previous?.id || `folder-${crypto.randomUUID()}`, name: request.name ?? previous!.name,
    entryIds: [...members].sort(), createdAt: previous?.createdAt || now, updatedAt: now, revision: (previous?.revision || 0) + 1
  };
  const folderId = folder?.id || previous!.id;
  const record: FolderMutationRecord = { fingerprint: request.fingerprint, folderId, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 };
  metadata.folderBytes += (folder ? byteLength(folder) : 0) - (previous ? byteLength(previous) : 0);
  metadata.ledgerBytes += byteLength(record); metadata.ledgerCount++;
  metadata.count += request.action === "create" ? 1 : request.action === "delete" ? -1 : 0;
  const size = () => metadata.folderBytes + metadata.ledgerBytes + metadata.count * 512 + metadata.ledgerCount * 300 + 4096;
  while (size() > FOLDER_LIMITS.bytes && metadata.ledgerCount > 1) {
    const before = metadata.ledgerCount; await pruneLedger(transaction, metadata, true); if (before === metadata.ledgerCount) break;
  }
  if (request.action !== "delete" && size() > FOLDER_LIMITS.bytes) throw new ApiError(413, "personal_folder_storage_limit", "收藏夹已达到安全存储上限，旧词条没有改变。");
  if (previous && previous.name !== folder?.name) await transaction.delete(nameKey(previous.name));
  if (folder) {
    await transaction.put(`folder:${folder.id}`, folder);
    await transaction.put(nameKey(folder.name), folder.id);
  } else await transaction.delete(`folder:${folderId}`);
  metadata.revision++;
  await transaction.put({ "folders-meta": metadata, [key]: record,
    [`folder-expiry:${String(record.expiresAt).padStart(13, "0")}:${request.mutationId}`]: { key } });
  return { folder, revision: metadata.revision, action: request.action === "create" ? "created" : request.action === "delete" ? "deleted" : "updated" };
}

/** Entry deletion and membership cleanup are one atomic commit; no ghost IDs remain. */
export async function removeEntryFromPrivateFolders(transaction: DurableObjectTransaction, entryId: string): Promise<void> {
  const rows = await transaction.list<PrivateFolder>({ prefix: "folder:", limit: FOLDER_LIMITS.folders + 1 });
  if (rows.size > FOLDER_LIMITS.folders) throw new ApiError(503, "personal_storage_invalid", "收藏夹需要安全检查，请稍后重试。");
  const metadata = { ...EMPTY, ...await transaction.get<FolderMetadata>("folders-meta") };
  let changed = false;
  for (const previous of rows.values()) {
    if (!previous.entryIds.includes(entryId)) continue;
    const folder = { ...previous, entryIds: previous.entryIds.filter(id => id !== entryId), updatedAt: new Date().toISOString(), revision: previous.revision + 1 };
    metadata.folderBytes += byteLength(folder) - byteLength(previous);
    await transaction.put(`folder:${folder.id}`, folder);
    changed = true;
  }
  if (changed) { metadata.revision++; await transaction.put("folders-meta", metadata); }
}
