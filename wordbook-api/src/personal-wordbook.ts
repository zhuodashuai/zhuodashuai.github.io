import { normalizeEnglish, validateEnglishInput } from "./schema";
import { ApiError, jsonResponse, sha256Hex } from "./security";
import { MEMBER_UUID, assertPrivateSession, memberAuthStub, memberError, memberFields, memberInternalCall, memberText, readMemberJson, type MemberEnv } from "./member-security";
import { SOURCE_LIMITS, selectionRequest, validateSourceContext, type SourceContext, type PreparedSelection } from "./personal-selection";
import { EMPTY_LEARNING, LEARNING_LIMITS, nextPersonalReview, type LearningMetadata, type PersonalReview } from "./personal-learning";

export interface PersonalEntry {
  id: string;
  revision: number;
  term: string;
  normalized: string;
  partOfSpeech?: string;
  meaning: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  sourceContexts?: SourceContext[];
  meaningEdited?: boolean;
}
interface Metadata { revision: number; count: number; entryBytes: number; ledgerBytes: number; ledgerCount: number }
interface MutationRecord { fingerprint: string; entryId?: string; entryIds?: string[]; action: string; expiresAt: number }
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
    const auth = await assertPrivateSession(this.env, body.authType, body.sessionHash, writing ? body.csrfToken as string : undefined);
    if (auth.user.id !== body.userId) throw new ApiError(403, "tenant_forbidden", "个人词库身份不匹配。");
    if (await this.ctx.storage.get("deleted")) throw new ApiError(410, "account_deleted", "这个个人词库已删除。");
  }

  private async list(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["userId", "sessionHash"], ["authType"]);
    await this.authenticate(body, false);
    const { metadata, rows } = await this.ctx.storage.transaction(async (transaction) => ({
      metadata: await transaction.get<Metadata>("meta"),
      rows: await transaction.list<PersonalEntry>({ prefix: "entry:", limit: PERSONAL_LIMITS.entries + 1 })
    }));
    if (rows.size > PERSONAL_LIMITS.entries) throw new ApiError(503, "personal_storage_invalid", "词库需要安全检查，请稍后重试。");
    return jsonResponse({ revision: metadata?.revision || 0,
      entries: [...rows.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), limit: PERSONAL_LIMITS.entries });
  }

  private content(body: Record<string, unknown>, updating = false): Pick<PersonalEntry, "term" | "normalized" | "partOfSpeech" | "meaning" | "note"> {
    const raw = memberText(body.term, 200, "英文词条");
    const term = validateEnglishInput(raw);
    if ([...term].length > 200) throw new ApiError(400, "invalid_entry", "英文词条不能超过 200 个字符。");
    return { term, normalized: normalizeEnglish(term),
      ...(Object.prototype.hasOwnProperty.call(body, "partOfSpeech") ? { partOfSpeech: memberText(body.partOfSpeech, 200, "词性") } : {}),
      meaning: memberText(body.meaning ?? "", updating ? 20000 : 2000, "释义"), note: memberText(body.note ?? "", 1000, "笔记") };
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
    memberFields(body, [...common, ...(action === "create" ? ["term"] : ["entryId", "revision"]), ...(action === "update" ? ["term"] : [])], ["authType", ...(action === "delete" ? [] : ["partOfSpeech", "meaning", "note"])]);
    await this.authenticate(body, true);
    if (typeof body.mutationId !== "string" || !MEMBER_UUID.test(body.mutationId)) throw new ApiError(400, "invalid_mutation_id", "保存操作需要有效的唯一标识。");
    if (action !== "create" && (!validEntryId(body.entryId) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1)) {
      throw new ApiError(400, "invalid_entry", "词条 ID 或版本不正确。");
    }
    await this.applyWriteRate();
    const content = action === "delete" ? null : this.content(body, action === "update");
    const semantic = { action, ...(action !== "create" ? { id: body.entryId, revision: body.revision } : {}), ...content };
    const fingerprint = await sha256Hex(JSON.stringify(semantic));
    const mutationKey = `mutation:${body.mutationId}`;
    const response = await this.ctx.storage.transaction(async (transaction) => {
      // A concurrent deletion may have begun while authentication was in flight.
      if (await transaction.get("deleted")) throw new ApiError(410, "account_deleted", "这个个人词库已删除。");
      const metadata = { ...EMPTY, ...await transaction.get<Metadata>("meta") };
      const reviewedMutation = await transaction.get<MutationRecord>(`review-mutation:${body.mutationId}`);
      if (reviewedMutation && reviewedMutation.expiresAt > Date.now()) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于复习记录。");
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
        if (previous?.sourceContexts?.length && previous.normalized !== content.normalized) throw new ApiError(400, "source_term_locked", "来自公开词库的英文词条不能改成另一个词；中文释义和笔记仍可编辑。");
        if (!previous?.sourceContexts?.length && [...content.meaning].length > 2000) throw new ApiError(400, "invalid_entry", "手工词条释义最多 2,000 个字符。");
        const owner = await transaction.get<string>(`normalized:${content.normalized}`);
        if (owner && owner !== previous?.id) {
          const existing = await transaction.get<PersonalEntry>(`entry:${owner}`);
          throw new ApiError(409, "duplicate_entry", "自己的词库中已经有这个词，不会重复加入。", { existing, revision: metadata.revision });
        }
      }
      if (action === "create" && metadata.count >= PERSONAL_LIMITS.entries) throw new ApiError(413, "personal_entry_limit", "个人词库最多保存 1,000 条，请先导出并整理旧词。");
      const now = new Date().toISOString();
      const entry: PersonalEntry | null = content ? { id: previous?.id || `member-${crypto.randomUUID()}`, revision: (previous?.revision || 0) + 1,
        ...(previous?.partOfSpeech === undefined ? {} : { partOfSpeech: previous.partOfSpeech }),
        ...content, createdAt: previous?.createdAt || now, updatedAt: now,
        ...(previous?.sourceContexts ? { sourceContexts: previous.sourceContexts, meaningEdited: Boolean(previous.meaningEdited || content.meaning !== previous.meaning) } : {}) } : null;
      if (entry && byteLength(entry) > SOURCE_LIMITS.entryBytes) throw new ApiError(413, "selection_entry_too_large", "词条和完整来源超过安全上限，没有截断或覆盖。");
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
      } else {
        await transaction.delete(`entry:${entryId}`);
        const review = await transaction.get<PersonalReview>(`review:${entryId}`);
        if (review) {
          const learning = { ...EMPTY_LEARNING, ...await transaction.get<LearningMetadata>("learning-meta") };
          learning.reviewBytes = Math.max(0, learning.reviewBytes - byteLength(review));
          learning.revision++;
          await transaction.delete(`review:${entryId}`);
          await transaction.put("learning-meta", learning);
        }
      }
      metadata.count += action === "create" ? 1 : action === "delete" ? -1 : 0;
      metadata.revision++;
      await transaction.put({ meta: metadata, [mutationKey]: record,
        [`mutation-expiry:${String(record.expiresAt).padStart(13, "0")}:${body.mutationId}`]: { key: mutationKey } });
      return { entry, revision: metadata.revision, action: action === "create" ? "created" : action === "update" ? "updated" : "deleted" };
    });
    return jsonResponse(response);
  }

  private async select(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["userId", "sessionHash", "csrfToken", "prepared"], ["authType"]);
    await this.authenticate(body, true);
    await this.applyWriteRate();
    const prepared = body.prepared as PreparedSelection;
    if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) throw new ApiError(400, "invalid_selection", "选择资料格式不正确。");
    memberFields(prepared as unknown as Record<string, unknown>, ["request", "cards"]);
    const request = selectionRequest(prepared.request as unknown as Record<string, unknown>);
    if (!Array.isArray(prepared.cards) || prepared.cards.length !== request.entryIds.length) throw new ApiError(400, "invalid_selection", "选择资料数量不匹配。");
    const cards = prepared.cards.map(card => {
      if (!card || typeof card !== "object" || !Array.isArray(card.contexts) || !card.contexts.length || card.contexts.length > SOURCE_LIMITS.contexts) throw new ApiError(413, "selection_context_limit", "词条来源数量超过安全上限。");
      const term = validateEnglishInput(memberText(card.term, 200, "英文词条"));
      const contexts = card.contexts.map(validateSourceContext);
      if (contexts.some(context => context.term !== term || !request.entryIds.includes(context.entryId))) throw new ApiError(400, "invalid_selection", "选择来源与词条不一致。");
      return { term, normalized: normalizeEnglish(term), contexts };
    });
    const fingerprint = await sha256Hex(JSON.stringify({ action: "selection", entryIds: [...request.entryIds].sort(), collectionId: request.collectionId, chapterId: request.chapterId }));
    const mutationKey = `mutation:${request.mutationId}`;
    const response = await this.ctx.storage.transaction(async transaction => {
      if (await transaction.get("deleted")) throw new ApiError(410, "account_deleted", "这个个人词库已删除。");
      const metadata = { ...EMPTY, ...await transaction.get<Metadata>("meta") };
      const reviewedMutation = await transaction.get<MutationRecord>(`review-mutation:${request.mutationId}`);
      if (reviewedMutation && reviewedMutation.expiresAt > Date.now()) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于复习记录。");
      const known = await transaction.get<MutationRecord>(mutationKey);
      if (known && known.expiresAt > Date.now()) {
        if (known.fingerprint !== fingerprint) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于其他内容。");
        const entries: PersonalEntry[] = [];
        for (const id of known.entryIds || []) { const row = await transaction.get<PersonalEntry>(`entry:${id}`); if (row) entries.push(row); }
        return { revision: metadata.revision, added: 0, reused: 0, contextAdded: 0, entries };
      }
      if (known) {
        await transaction.delete(mutationKey);
        await transaction.delete(`mutation-expiry:${String(known.expiresAt).padStart(13, "0")}:${request.mutationId}`);
        metadata.ledgerBytes = Math.max(0, metadata.ledgerBytes - byteLength(known)); metadata.ledgerCount = Math.max(0, metadata.ledgerCount - 1);
      }
      await this.pruneLedger(transaction, metadata);
      if (metadata.ledgerCount >= PERSONAL_LIMITS.ledger) await this.pruneLedger(transaction, metadata, true);
      let added = 0, reused = 0, contextAdded = 0, changed = false;
      const affected = new Map<string, PersonalEntry>();
      for (const card of cards) {
        const existingId = await transaction.get<string>(`normalized:${card.normalized}`);
        const previous = existingId ? await transaction.get<PersonalEntry>(`entry:${existingId}`) : undefined;
        const contexts = [...(previous?.sourceContexts || [])];
        const keys = new Set(contexts.map(context => context.key));
        const fresh = card.contexts.filter(context => !keys.has(context.key));
        for (const context of fresh) { keys.add(context.key); contexts.push(context); }
        if (contexts.length > SOURCE_LIMITS.contexts) throw new ApiError(413, "selection_context_limit", "词条的章节来源已超过安全上限，整批没有加入。");
        if (previous) reused++; else added++;
        contextAdded += fresh.length;
        const now = new Date().toISOString();
        let entry = previous;
        if (!previous || fresh.length) {
          const manuallyMeaningful = previous && !previous.sourceContexts?.length && Boolean(previous.meaning.trim());
          entry = { id: previous?.id || `member-${crypto.randomUUID()}`, revision: (previous?.revision || 0) + 1,
            term: previous?.term || card.term, normalized: card.normalized,
            partOfSpeech: previous?.partOfSpeech ?? card.contexts[0].partOfSpeech,
            meaning: previous && (previous.sourceContexts?.length || previous.meaning.trim()) ? previous.meaning : card.contexts[0].meaning,
            note: previous?.note || "", createdAt: previous?.createdAt || now, updatedAt: now, sourceContexts: contexts,
            meaningEdited: previous?.sourceContexts?.length ? Boolean(previous.meaningEdited) : Boolean(manuallyMeaningful) };
          if (byteLength(entry) > SOURCE_LIMITS.entryBytes) throw new ApiError(413, "selection_entry_too_large", "完整词条来源过大；整批没有加入，也没有截断原文资料。");
          metadata.entryBytes += byteLength(entry) - (previous ? byteLength(previous) : 0);
          if (!previous) metadata.count++;
          await transaction.put(`entry:${entry.id}`, entry); await transaction.put(`normalized:${entry.normalized}`, entry.id);
          changed = true;
        }
        affected.set(entry!.id, entry!);
      }
      if (metadata.count > PERSONAL_LIMITS.entries) throw new ApiError(413, "personal_entry_limit", "个人词库最多保存 1,000 条；整批没有加入。");
      const record: MutationRecord = { fingerprint, entryIds: [...affected.keys()], action: "selection", expiresAt: Date.now() + 30 * 24 * 60 * 60_000 };
      metadata.ledgerBytes += byteLength(record); metadata.ledgerCount++;
      const size = () => metadata.entryBytes + metadata.ledgerBytes + metadata.count * 1100 + metadata.ledgerCount * 300 + 4096;
      while (size() > PERSONAL_LIMITS.bytes && metadata.ledgerCount > 1) {
        const before = metadata.ledgerCount; await this.pruneLedger(transaction, metadata, true); if (before === metadata.ledgerCount) break;
      }
      if (size() > PERSONAL_LIMITS.bytes) throw new ApiError(413, "personal_storage_limit", "完整词条和来源超过个人词库 2 MiB 上限，整批没有加入。");
      if (changed) metadata.revision++;
      await transaction.put({ meta: metadata, [mutationKey]: record,
        [`mutation-expiry:${String(record.expiresAt).padStart(13, "0")}:${request.mutationId}`]: { key: mutationKey } });
      return { revision: metadata.revision, added, reused, contextAdded, entries: [...affected.values()] };
    });
    return jsonResponse(response);
  }

  private async learning(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["userId", "sessionHash"], ["authType"]);
    await this.authenticate(body, false);
    const result = await this.ctx.storage.transaction(async transaction => ({
      metadata: await transaction.get<LearningMetadata>("learning-meta"), reviews: [...(await transaction.list<PersonalReview>({ prefix: "review:", limit: PERSONAL_LIMITS.entries })).values()]
    }));
    return jsonResponse({ revision: result.metadata?.revision || 0, reviews: result.reviews });
  }

  private async pruneReviewLedger(transaction: DurableObjectTransaction, metadata: LearningMetadata, force = false): Promise<void> {
    const expiry = await transaction.list<{ key: string }>({ prefix: "review-expiry:", limit: force ? 1 : 16 });
    for (const [expiryKey, value] of expiry) {
      if (!force && Number(expiryKey.split(":")[1]) > Date.now()) break;
      const old = await transaction.get<MutationRecord>(value.key);
      if (old) { metadata.ledgerBytes = Math.max(0, metadata.ledgerBytes - byteLength(old)); metadata.ledgerCount = Math.max(0, metadata.ledgerCount - 1); await transaction.delete(value.key); }
      await transaction.delete(expiryKey);
    }
  }

  private async review(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["userId", "sessionHash", "csrfToken", "entryId", "rating", "revision", "mutationId"], ["authType"]);
    await this.authenticate(body, true); await this.applyWriteRate();
    if (!validEntryId(body.entryId) || typeof body.mutationId !== "string" || !MEMBER_UUID.test(body.mutationId)
      || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new ApiError(400, "invalid_review", "复习词条、版本或操作标识不正确。");
    // Validate the rating even if this could be an idempotency replay.
    nextPersonalReview(body.entryId, undefined, body.rating);
    const fingerprint = await sha256Hex(JSON.stringify({ action: "review", entryId: body.entryId, rating: body.rating, revision: body.revision }));
    const key = `review-mutation:${body.mutationId}`;
    const result = await this.ctx.storage.transaction(async transaction => {
      if (await transaction.get("deleted")) throw new ApiError(410, "account_deleted", "这个个人词库已删除。");
      if (!await transaction.get(`entry:${body.entryId}`)) throw new ApiError(404, "entry_missing", "这个词不在自己的词库中。");
      const metadata = { ...EMPTY_LEARNING, ...await transaction.get<LearningMetadata>("learning-meta") };
      const vocabularyMutation = await transaction.get<MutationRecord>(`mutation:${body.mutationId}`);
      if (vocabularyMutation && vocabularyMutation.expiresAt > Date.now()) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于词库内容。");
      const previous = await transaction.get<PersonalReview>(`review:${body.entryId}`);
      const old = await transaction.get<MutationRecord>(key);
      if (old && old.expiresAt > Date.now()) {
        if (old.fingerprint !== fingerprint) throw new ApiError(409, "idempotency_key_reused", "这个操作标识已用于其他复习内容。");
        return { revision: metadata.revision, review: previous || null, action: "idempotent" };
      }
      if ((previous?.revision || 0) !== body.revision) throw new ApiError(409, "revision_conflict", "其他设备已经记录这次复习，请读取最新进度后继续。", { existing: previous || null, revision: metadata.revision });
      if (old) {
        await transaction.delete(key); await transaction.delete(`review-expiry:${String(old.expiresAt).padStart(13, "0")}:${body.mutationId}`);
        metadata.ledgerBytes = Math.max(0, metadata.ledgerBytes - byteLength(old)); metadata.ledgerCount = Math.max(0, metadata.ledgerCount - 1);
      }
      await this.pruneReviewLedger(transaction, metadata);
      if (metadata.ledgerCount >= LEARNING_LIMITS.ledger) await this.pruneReviewLedger(transaction, metadata, true);
      const review = nextPersonalReview(body.entryId as string, previous, body.rating, new Date());
      const record: MutationRecord = { fingerprint, entryId: body.entryId as string, action: "review", expiresAt: Date.now() + 30 * 24 * 60 * 60_000 };
      metadata.reviewBytes += byteLength(review) - (previous ? byteLength(previous) : 0);
      metadata.ledgerBytes += byteLength(record); metadata.ledgerCount++;
      const size = () => metadata.reviewBytes + metadata.ledgerBytes + metadata.ledgerCount * 300 + PERSONAL_LIMITS.entries * 128 + 4096;
      while (size() > LEARNING_LIMITS.bytes && metadata.ledgerCount > 1) {
        const before = metadata.ledgerCount; await this.pruneReviewLedger(transaction, metadata, true); if (before === metadata.ledgerCount) break;
      }
      if (size() > LEARNING_LIMITS.bytes) throw new ApiError(413, "personal_learning_limit", "云端学习记录已达到安全上限，旧记录没有被删除。");
      metadata.revision++;
      await transaction.put({ "learning-meta": metadata, [`review:${body.entryId}`]: review, [key]: record,
        [`review-expiry:${String(record.expiresAt).padStart(13, "0")}:${body.mutationId}`]: { key } });
      return { revision: metadata.revision, review, action: "reviewed" };
    });
    return jsonResponse(result);
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
      const path = new URL(request.url).pathname;
      const body = await readMemberJson(request, path === "/select" ? 2 * 1024 * 1024 : path === "/update" ? 128 * 1024 : 32 * 1024);
      switch (new URL(request.url).pathname) {
        case "/entries": return await this.list(body);
        case "/select": return await this.select(body);
        case "/learning": return await this.learning(body);
        case "/review": return await this.review(body);
        case "/create": return await this.mutate(body, "create");
        case "/update": return await this.mutate(body, "update");
        case "/delete": return await this.mutate(body, "delete");
        case "/destroy": return await this.destroy(body);
        default: throw new ApiError(404, "member_not_found", "个人词库接口不存在。");
      }
    } catch (error) { return memberError(error); }
  }
}
