import { normalizeEnglish, validateEnglishInput } from "./schema";
import { ApiError, jsonResponse, sha256Hex } from "./security";
import { MEMBER_UUID, memberAuthStub, memberError, memberFields, memberInternalCall, memberText, readMemberJson, type MemberEnv } from "./member-security";

export interface PersonalEntry {
  id: string;
  revision: number;
  term: string;
  normalized: string;
  meaning: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}
interface Metadata { revision: number; count: number; entryBytes: number; ledgerBytes: number; ledgerCount: number }
interface MutationRecord { fingerprint: string; entryId: string; action: string; expiresAt: number }
const EMPTY: Metadata = { revision: 0, count: 0, entryBytes: 0, ledgerBytes: 0, ledgerCount: 0 };
export const PERSONAL_LIMITS = Object.freeze({ entries: 1000, bytes: 2 * 1024 * 1024, ledger: 512 });
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const validEntryId = (value: unknown): value is string => typeof value === "string" && value.startsWith("member-") && MEMBER_UUID.test(value.slice(7));

/** Private tenant vault. It deliberately has no GitHub/AI/public-cache imports. */
export class PersonalWordbook implements DurableObject {
  constructor(private readonly ctx: DurableObjectState, private readonly env: MemberEnv) {}

  private assertBinding(userId: unknown): asserts userId is string {
    if (typeof userId !== "string" || !MEMBER_UUID.test(userId)
      || this.ctx.id.toString() !== this.env.PERSONAL_WORDBOOK.idFromName(`user:${userId}`).toString()) {
      throw new ApiError(403, "tenant_forbidden", "个人词库身份不匹配。");
    }
  }

  private async authenticate(body: Record<string, unknown>, writing: boolean): Promise<void> {
    this.assertBinding(body.userId);
    if (typeof body.sessionHash !== "string" || !/^[0-9a-f]{64}$/.test(body.sessionHash)
      || (writing && (typeof body.csrfToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.csrfToken)))) {
      throw new ApiError(401, "member_authentication_required", "请先登录自己的账号。");
    }
    const auth = await memberInternalCall(memberAuthStub(this.env), "/session/assert", {
      sessionHash: body.sessionHash, ...(writing ? { csrfToken: body.csrfToken } : {})
    });
    if ((auth.user as { id?: string } | undefined)?.id !== body.userId) throw new ApiError(403, "tenant_forbidden", "个人词库身份不匹配。");
    if (await this.ctx.storage.get("deleted")) throw new ApiError(410, "account_deleted", "这个个人词库已删除。");
  }

  private async list(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["userId", "sessionHash"]);
    await this.authenticate(body, false);
    const { metadata, rows } = await this.ctx.storage.transaction(async (transaction) => ({
      metadata: await transaction.get<Metadata>("meta"),
      rows: await transaction.list<PersonalEntry>({ prefix: "entry:", limit: PERSONAL_LIMITS.entries + 1 })
    }));
    if (rows.size > PERSONAL_LIMITS.entries) throw new ApiError(503, "personal_storage_invalid", "词库需要安全检查，请稍后重试。");
    return jsonResponse({ revision: metadata?.revision || 0,
      entries: [...rows.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), limit: PERSONAL_LIMITS.entries });
  }

  private content(body: Record<string, unknown>): Pick<PersonalEntry, "term" | "normalized" | "meaning" | "note"> {
    const raw = memberText(body.term, 200, "英文词条");
    const term = validateEnglishInput(raw);
    if ([...term].length > 200) throw new ApiError(400, "invalid_entry", "英文词条不能超过 200 个字符。");
    return { term, normalized: normalizeEnglish(term), meaning: memberText(body.meaning ?? "", 2000, "释义"), note: memberText(body.note ?? "", 1000, "笔记") };
  }

  private async applyWriteRate(): Promise<void> {
    const next = await this.ctx.storage.transaction(async (transaction) => {
      const old = await transaction.get<{ count: number; expiresAt: number }>("write-rate");
      const next = old && old.expiresAt > Date.now() ? { ...old, count: old.count + 1 } : { count: 1, expiresAt: Date.now() + 60_000 };
      await transaction.put("write-rate", next);
      return next;
    });
    if (next.count > 60) throw new ApiError(429, "member_rate_limited", "保存过于频繁，请稍后重试。", { retryAfter: Math.max(1, Math.ceil((next.expiresAt - Date.now()) / 1000)) });
  }

  private async pruneLedger(transaction: DurableObjectTransaction, metadata: Metadata, force = false): Promise<void> {
    const expiry = await transaction.list<{ key: string }>({ prefix: "mutation-expiry:", limit: force ? 1 : 16 });
    for (const [expiryKey, value] of expiry) {
      const at = Number(expiryKey.split(":")[1]);
      if (!force && at > Date.now()) break;
      const record = await transaction.get<MutationRecord>(value.key);
      if (record) {
        metadata.ledgerBytes = Math.max(0, metadata.ledgerBytes - byteLength(record));
        metadata.ledgerCount = Math.max(0, metadata.ledgerCount - 1);
        await transaction.delete(value.key);
      }
      await transaction.delete(expiryKey);
    }
  }

  private async mutate(body: Record<string, unknown>, action: "create" | "update" | "delete"): Promise<Response> {
    const common = ["userId", "sessionHash", "csrfToken", "mutationId"];
    memberFields(body, [...common, ...(action === "create" ? ["term"] : ["entryId", "revision"]), ...(action === "update" ? ["term"] : [])], action === "delete" ? [] : ["meaning", "note"]);
    await this.authenticate(body, true);
    if (typeof body.mutationId !== "string" || !MEMBER_UUID.test(body.mutationId)) throw new ApiError(400, "invalid_mutation_id", "保存操作需要有效的唯一标识。");
    if (action !== "create" && (!validEntryId(body.entryId) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1)) {
      throw new ApiError(400, "invalid_entry", "词条 ID 或版本不正确。");
    }
    await this.applyWriteRate();
    const content = action === "delete" ? null : this.content(body);
    const semantic = { action, ...(action !== "create" ? { id: body.entryId, revision: body.revision } : {}), ...content };
    const fingerprint = await sha256Hex(JSON.stringify(semantic));
    const mutationKey = `mutation:${body.mutationId}`;
    const response = await this.ctx.storage.transaction(async (transaction) => {
      // A concurrent deletion may have begun while authentication was in flight.
      if (await transaction.get("deleted")) throw new ApiError(410, "account_deleted", "这个个人词库已删除。");
      const metadata = { ...EMPTY, ...await transaction.get<Metadata>("meta") };
      const known = await transaction.get<MutationRecord>(mutationKey);
      if (known && known.expiresAt > Date.now()) {
        if (known.fingerprint !== fingerprint) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于其他内容，请重新保存。");
        const current = await transaction.get<PersonalEntry>(`entry:${known.entryId}`);
        return { entry: current || null, revision: metadata.revision, action: "idempotent" };
      }
      if (known) {
        await transaction.delete(mutationKey);
        await transaction.delete(`mutation-expiry:${String(known.expiresAt).padStart(13, "0")}:${body.mutationId}`);
        metadata.ledgerBytes = Math.max(0, metadata.ledgerBytes - byteLength(known));
        metadata.ledgerCount = Math.max(0, metadata.ledgerCount - 1);
      }
      await this.pruneLedger(transaction, metadata);
      if (metadata.ledgerCount >= PERSONAL_LIMITS.ledger) await this.pruneLedger(transaction, metadata, true);
      let previous: PersonalEntry | undefined;
      if (action !== "create") {
        previous = await transaction.get<PersonalEntry>(`entry:${body.entryId}`);
        if (!previous) throw new ApiError(404, "entry_missing", "词条已经不存在，请刷新自己的词库。");
        if (previous.revision !== body.revision) throw new ApiError(409, "revision_conflict", "这条词已经在其他设备更新；当前输入不会覆盖它。", { existing: previous, revision: metadata.revision });
      }
      if (content) {
        const owner = await transaction.get<string>(`normalized:${content.normalized}`);
        if (owner && owner !== previous?.id) {
          const existing = await transaction.get<PersonalEntry>(`entry:${owner}`);
          throw new ApiError(409, "duplicate_entry", "自己的词库中已经有这个词，不会重复加入。", { existing, revision: metadata.revision });
        }
      }
      if (action === "create" && metadata.count >= PERSONAL_LIMITS.entries) throw new ApiError(413, "personal_entry_limit", "个人词库最多保存 1,000 条，请先导出并整理旧词。");
      const now = new Date().toISOString();
      const entry: PersonalEntry | null = content ? { id: previous?.id || `member-${crypto.randomUUID()}`, revision: (previous?.revision || 0) + 1,
        ...content, createdAt: previous?.createdAt || now, updatedAt: now } : null;
      const entryId = entry?.id || previous!.id;
      const record: MutationRecord = { fingerprint, entryId, action, expiresAt: Date.now() + 30 * 24 * 60 * 60_000 };
      metadata.entryBytes += (entry ? byteLength(entry) : 0) - (previous ? byteLength(previous) : 0);
      metadata.ledgerBytes += byteLength(record);
      metadata.ledgerCount++;
      // Leave space for bounded metadata/index keys, not just entry values.
      const projectedCount = metadata.count + (action === "create" ? 1 : action === "delete" ? -1 : 0);
      // An index key may contain 200 four-byte Unicode code points. Reserve
      // more than that plus its ID/key encoding instead of assuming ASCII.
      const estimatedBytes = () => metadata.entryBytes + metadata.ledgerBytes + projectedCount * 1100 + metadata.ledgerCount * 300 + 4096;
      while (estimatedBytes() > PERSONAL_LIMITS.bytes && metadata.ledgerCount > 1) {
        const count = metadata.ledgerCount;
        await this.pruneLedger(transaction, metadata, true);
        if (count === metadata.ledgerCount) break;
      }
      if (action !== "delete" && estimatedBytes() > PERSONAL_LIMITS.bytes) throw new ApiError(413, "personal_storage_limit", "个人词库已达到 2 MiB 安全上限，请先导出并整理旧词。");
      if (previous && previous.normalized !== entry?.normalized) await transaction.delete(`normalized:${previous.normalized}`);
      if (entry) {
        await transaction.put(`entry:${entry.id}`, entry);
        await transaction.put(`normalized:${entry.normalized}`, entry.id);
      } else await transaction.delete(`entry:${entryId}`);
      metadata.count += action === "create" ? 1 : action === "delete" ? -1 : 0;
      metadata.revision++;
      await transaction.put({ meta: metadata, [mutationKey]: record,
        [`mutation-expiry:${String(record.expiresAt).padStart(13, "0")}:${body.mutationId}`]: { key: mutationKey } });
      return { entry, revision: metadata.revision, action: action === "create" ? "created" : action === "update" ? "updated" : "deleted" };
    });
    return jsonResponse(response);
  }

  private async destroy(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["userId", "proof"]);
    this.assertBinding(body.userId);
    await memberInternalCall(memberAuthStub(this.env), "/account/deletion/authorize", { userId: body.userId, proof: body.proof });
    // Tombstone first: failed batch deletion cannot expose or resurrect records.
    await this.ctx.storage.put("deleted", { userId: body.userId, at: Date.now() });
    while (true) {
      const rows = await this.ctx.storage.list({ limit: 129 });
      const keys = [...rows.keys()].filter((key) => key !== "deleted").slice(0, 128);
      if (!keys.length) break;
      await this.ctx.storage.delete(keys);
    }
    return jsonResponse({ ok: true });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") throw new ApiError(405, "method_not_allowed", "Method not allowed");
      const body = await readMemberJson(request, 32 * 1024);
      switch (new URL(request.url).pathname) {
        case "/entries": return await this.list(body);
        case "/create": return await this.mutate(body, "create");
        case "/update": return await this.mutate(body, "update");
        case "/delete": return await this.mutate(body, "delete");
        case "/destroy": return await this.destroy(body);
        default: throw new ApiError(404, "member_not_found", "个人词库接口不存在。");
      }
    } catch (error) { return memberError(error); }
  }
}
