import { AI_DAILY_REQUEST_LIMIT, OWNER_USER_ID, readConfig, requireOwnerSecrets, SESSION_TTL_SECONDS, type AppConfig } from "./config";
import {
  readRemoteWordbook,
  revokeOAuthToken,
  verifyOwnerAndRepository,
  writeRemoteWordbook,
  type GitHubIdentity
} from "./github";
import { PublishRequestSchema, type PublicSnapshot, type PublishRequest } from "./schema";
import {
  ApiError,
  decryptSecret,
  encryptSecret,
  jsonResponse,
  randomToken,
  readJsonBody,
  sha256Hex
} from "./security";
import { applyPublishMutation } from "./wordbook";

interface OAuthTransaction {
  verifier: string;
  expiresAt: number;
  createdAt: number;
}

interface OwnerSession {
  githubTokenCipher: string;
  githubTokenExpiresAt: number;
  login: string;
  userId: number;
  avatarUrl: string;
  installationId: number;
  repositoryId: number;
  csrfHashes: string[];
  createdAt: number;
  absoluteExpiresAt: number;
  lastSeenAt: number;
  encryptionKeyVersion: 1;
}

interface RateRecord {
  count: number;
  resetAt: number;
}

interface MutationRecord {
  semanticHash: string;
  status: "pending" | "committed";
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

interface PublicSnapshotRecord {
  snapshot: PublicSnapshot;
  sha: string;
  htmlUrl: string;
  confirmedAt: number;
}

const MUTATION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const STORAGE_DELETE_BATCH_SIZE = 128;
const PUBLIC_SNAPSHOT_KEY = "public-snapshot:latest";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_internal_request", "Internal request body is invalid");
  }
  return value as Record<string, unknown>;
}

function internalString(body: Record<string, unknown>, key: string, minimum = 1, maximum = 5000): string {
  const value = body[key];
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new ApiError(400, "invalid_internal_request", `Invalid ${key}`);
  }
  return value;
}

export class OwnerControl implements DurableObject {
  private readonly config: AppConfig;
  private publishTail: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {
    this.config = readConfig(env);
  }

  private async cleanupExpired(now = Date.now()): Promise<void> {
    const [oauth, sessions, rates, mutations] = await Promise.all([
      this.ctx.storage.list<OAuthTransaction>({ prefix: "oauth:", limit: 100 }),
      this.ctx.storage.list<OwnerSession>({ prefix: "session:", limit: 100 }),
      this.ctx.storage.list<RateRecord>({ prefix: "rate:", limit: 100 }),
      this.ctx.storage.list<MutationRecord>({ prefix: "mutation:", limit: 100 })
    ]);
    const expired: string[] = [];
    for (const [key, value] of oauth) if (value.expiresAt <= now) expired.push(key);
    for (const [key, value] of sessions) if (value.absoluteExpiresAt <= now || value.githubTokenExpiresAt <= now) expired.push(key);
    for (const [key, value] of rates) if (value.resetAt <= now) expired.push(key);
    for (const [key, value] of mutations) if (value.expiresAt <= now) expired.push(key);
    for (let index = 0; index < expired.length; index += STORAGE_DELETE_BATCH_SIZE) {
      await this.ctx.storage.delete(expired.slice(index, index + STORAGE_DELETE_BATCH_SIZE));
    }
  }

  private async loadSession(sessionHash: string, csrfToken = ""): Promise<OwnerSession> {
    const key = `session:${sessionHash}`;
    const session = await this.ctx.storage.get<OwnerSession>(key);
    const now = Date.now();
    if (!session || session.absoluteExpiresAt <= now || session.githubTokenExpiresAt <= now) {
      if (session) await this.ctx.storage.delete(key);
      throw new ApiError(401, "authentication_required", "请先以卓本人身份登录。");
    }
    if (csrfToken) {
      const hash = await sha256Hex(csrfToken);
      if (!session.csrfHashes.includes(hash)) {
        throw new ApiError(403, "csrf_failed", "页面验证已失效，请刷新后重试。");
      }
    }
    session.lastSeenAt = now;
    await this.ctx.storage.put(key, session);
    return session;
  }

  private async tokenForSession(session: OwnerSession): Promise<string> {
    const { SESSION_SECRET } = requireOwnerSecrets(this.config);
    return decryptSecret(session.githubTokenCipher, SESSION_SECRET);
  }

  private async createOAuth(body: Record<string, unknown>): Promise<Response> {
    const stateHash = internalString(body, "stateHash", 64, 64);
    const verifier = internalString(body, "verifier", 43, 128);
    const expiresAt = Number(body.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 15 * 60 * 1000) {
      throw new ApiError(400, "invalid_internal_request", "Invalid OAuth expiry");
    }
    await this.cleanupExpired();
    await this.ctx.storage.put<OAuthTransaction>(`oauth:${stateHash}`, {
      verifier,
      expiresAt,
      createdAt: Date.now()
    });
    return jsonResponse({ ok: true });
  }

  private async consumeOAuth(body: Record<string, unknown>): Promise<Response> {
    const stateHash = internalString(body, "stateHash", 64, 64);
    const key = `oauth:${stateHash}`;
    const transaction = await this.ctx.storage.get<OAuthTransaction>(key);
    await this.ctx.storage.delete(key);
    if (!transaction || transaction.expiresAt <= Date.now()) {
      throw new ApiError(401, "oauth_state_invalid", "登录请求已过期或已使用，请重新开始。");
    }
    return jsonResponse({ verifier: transaction.verifier });
  }

  private async createSession(body: Record<string, unknown>): Promise<Response> {
    const secrets = requireOwnerSecrets(this.config);
    const sessionHash = internalString(body, "sessionHash", 64, 64);
    const githubToken = internalString(body, "githubToken", 20, 1000);
    const githubTokenExpiresAt = Number(body.githubTokenExpiresAt);
    const identityValue = body.identity;
    if (!identityValue || typeof identityValue !== "object" || Array.isArray(identityValue)) {
      throw new ApiError(400, "invalid_internal_request", "Invalid GitHub identity");
    }
    const identity = identityValue as unknown as GitHubIdentity;
    const now = Date.now();
    if (identity.login !== "zhuodashuai" || identity.id !== OWNER_USER_ID
      || !Number.isInteger(identity.installationId) || identity.installationId <= 0
      || !Number.isFinite(githubTokenExpiresAt) || githubTokenExpiresAt <= now) {
      throw new ApiError(400, "invalid_internal_request", "Invalid owner session");
    }
    const session: OwnerSession = {
      githubTokenCipher: await encryptSecret(githubToken, secrets.SESSION_SECRET),
      githubTokenExpiresAt,
      login: identity.login,
      userId: identity.id,
      avatarUrl: identity.avatarUrl,
      installationId: identity.installationId,
      repositoryId: Number(this.config.GITHUB_REPOSITORY_ID),
      csrfHashes: [],
      createdAt: now,
      absoluteExpiresAt: Math.min(now + SESSION_TTL_SECONDS * 1000, githubTokenExpiresAt),
      lastSeenAt: now,
      encryptionKeyVersion: 1
    };
    await this.cleanupExpired(now);
    await this.ctx.storage.put(`session:${sessionHash}`, session);
    return jsonResponse({ expiresAt: session.absoluteExpiresAt });
  }

  private async sessionView(body: Record<string, unknown>): Promise<Response> {
    const sessionHash = internalString(body, "sessionHash", 64, 64);
    const session = await this.loadSession(sessionHash);
    const csrfToken = randomToken(32);
    const csrfHash = await sha256Hex(csrfToken);
    session.csrfHashes = [...session.csrfHashes.slice(-4), csrfHash];
    await this.ctx.storage.put(`session:${sessionHash}`, session);
    return jsonResponse({
      authenticated: true,
      user: { login: session.login, id: session.userId, avatarUrl: session.avatarUrl },
      csrfToken,
      expiresAt: session.absoluteExpiresAt
    });
  }

  private async assertSession(body: Record<string, unknown>): Promise<Response> {
    const sessionHash = internalString(body, "sessionHash", 64, 64);
    const csrfToken = internalString(body, "csrfToken", 16, 500);
    const session = await this.loadSession(sessionHash, csrfToken);
    return jsonResponse({ authenticated: true, user: { login: session.login, id: session.userId, avatarUrl: session.avatarUrl } });
  }

  private async deleteSession(body: Record<string, unknown>): Promise<Response> {
    const sessionHash = internalString(body, "sessionHash", 64, 64);
    const csrfToken = internalString(body, "csrfToken", 16, 500);
    const session = await this.loadSession(sessionHash, csrfToken);
    const token = await this.tokenForSession(session);
    await this.ctx.storage.delete(`session:${sessionHash}`);
    const secrets = requireOwnerSecrets(this.config);
    await revokeOAuthToken(secrets.GITHUB_APP_CLIENT_ID, secrets.GITHUB_APP_CLIENT_SECRET, token);
    return jsonResponse({ ok: true });
  }

  private async applyRate(body: Record<string, unknown>): Promise<Response> {
    const subject = internalString(body, "subject", 8, 200);
    const kind = internalString(body, "kind", 2, 30);
    const allowed: Record<string, { limit: number; windowMs: number }> = {
      auth: { limit: 10, windowMs: 60_000 },
      callback: { limit: 20, windowMs: 60_000 },
      publish: { limit: 10, windowMs: 60_000 },
      ai: { limit: 6, windowMs: 60_000 },
      "ai-daily": { limit: AI_DAILY_REQUEST_LIMIT, windowMs: 24 * 60 * 60_000 }
    };
    const rule = allowed[kind];
    if (!rule) throw new ApiError(400, "invalid_internal_request", "Unknown rate kind");
    const bucket = Math.floor(Date.now() / rule.windowMs);
    const key = `rate:${kind}:${subject}:${bucket}`;
    const record = await this.ctx.storage.transaction(async (transaction) => {
      const current = await transaction.get<RateRecord>(key);
      const next: RateRecord = current && current.resetAt > Date.now()
        ? { ...current, count: current.count + 1 }
        : { count: 1, resetAt: (bucket + 1) * rule.windowMs };
      await transaction.put(key, next);
      return next;
    });
    if (record.count > rule.limit) {
      const retryAfter = Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000));
      throw kind === "ai-daily"
        ? new ApiError(429, "free_ai_daily_limit", `为保护免费额度，今天的 ${AI_DAILY_REQUEST_LIMIT} 次 AI 整理已经用完；请在 UTC 00:00 后再试，手动草稿仍可使用。`, { retryAfter, resetAt: record.resetAt })
        : new ApiError(429, "rate_limited", "操作过于频繁，请稍后再试。", { retryAfter });
    }
    return jsonResponse({ ok: true, remaining: rule.limit - record.count, resetAt: record.resetAt });
  }

  private async ownerSnapshot(body: Record<string, unknown>): Promise<Response> {
    const sessionHash = internalString(body, "sessionHash", 64, 64);
    const session = await this.loadSession(sessionHash);
    const token = await this.tokenForSession(session);
    const remote = await readRemoteWordbook(token, this.config);
    await this.rememberPublicSnapshot(remote);
    return jsonResponse(remote);
  }

  private async rememberPublicSnapshot(remote: { snapshot: PublicSnapshot; sha: string; htmlUrl?: string }): Promise<boolean> {
    try {
      await this.ctx.storage.put<PublicSnapshotRecord>(PUBLIC_SNAPSHOT_KEY, {
        snapshot: remote.snapshot,
        sha: remote.sha,
        htmlUrl: remote.htmlUrl || "",
        confirmedAt: Date.now()
      });
      return true;
    } catch {
      // GitHub is canonical. A cache acceleration failure must never turn an
      // already-confirmed publish into an apparent failure for the Owner.
      console.error("Public snapshot cache write failed after canonical confirmation");
      return false;
    }
  }

  private async publicSnapshot(): Promise<Response> {
    const current = await this.ctx.storage.get<PublicSnapshotRecord>(PUBLIC_SNAPSHOT_KEY);
    if (!current) {
      throw new ApiError(503, "public_snapshot_unavailable", "最新公开词库尚未进入即时缓存。");
    }
    return jsonResponse(current);
  }

  private async runPublish(body: Record<string, unknown>): Promise<Response> {
    const sessionHash = internalString(body, "sessionHash", 64, 64);
    const csrfToken = internalString(body, "csrfToken", 16, 500);
    const rawRequest = body.publishRequest;
    const parsed = PublishRequestSchema.safeParse(rawRequest);
    if (!parsed.success) throw new ApiError(400, "invalid_publish_request", "发布内容没有通过严格校验。", parsed.error.issues);
    const request: PublishRequest = parsed.data;
    const session = await this.loadSession(sessionHash, csrfToken);
    await this.applyRate({ subject: sessionHash, kind: "publish" });
    const token = await this.tokenForSession(session);
    const semanticHash = await sha256Hex(canonicalJson(request.mutation));
    const mutationKey = `mutation:${request.mutationId}`;
    const now = Date.now();
    let mutationRecord = await this.ctx.storage.get<MutationRecord>(mutationKey);
    if (mutationRecord && mutationRecord.expiresAt <= now) {
      await this.ctx.storage.delete(mutationKey);
      mutationRecord = undefined;
    }
    if (mutationRecord && mutationRecord.semanticHash !== semanticHash) {
      throw new ApiError(409, "idempotency_key_reused", "这个 Idempotency-Key 已绑定到另一项发布内容；请为新修改生成新的 mutationId。", {
        mutationId: request.mutationId
      });
    }
    const recordWasPresent = Boolean(mutationRecord);
    if (!mutationRecord) {
      mutationRecord = {
        semanticHash,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + MUTATION_TTL_MS
      };
      await this.ctx.storage.put(mutationKey, mutationRecord);
    }
    const boundMutationRecord = mutationRecord;
    const commitMutationRecord = async (): Promise<void> => {
      const committedAt = Date.now();
      await this.ctx.storage.put<MutationRecord>(mutationKey, {
        ...boundMutationRecord,
        status: "committed",
        updatedAt: committedAt,
        expiresAt: committedAt + MUTATION_TTL_MS
      });
    };
    await verifyOwnerAndRepository(token, this.config);
    const remote = await readRemoteWordbook(token, this.config);
    if (boundMutationRecord.status === "committed") {
      await this.rememberPublicSnapshot(remote);
      return jsonResponse({ ...remote, action: "idempotent", recovered: true });
    }
    if (remote.snapshot.lastMutationId === request.mutationId) {
      if (!recordWasPresent) {
        await this.ctx.storage.delete(mutationKey);
        throw new ApiError(409, "idempotency_unverifiable", "远端出现了同名 mutationId，但本地没有可核对的语义记录；已停止发布，请换用新的 mutationId。", {
          mutationId: request.mutationId
        });
      }
      await commitMutationRecord();
      await this.rememberPublicSnapshot(remote);
      return jsonResponse({ ...remote, action: "idempotent", recovered: true });
    }
    if (remote.sha.toLowerCase() !== request.baseSha.toLowerCase()) {
      throw new ApiError(409, "remote_conflict", "GitHub 公开词库已变化；草稿没有覆盖远端内容。", {
        sha: remote.sha,
        snapshot: remote.snapshot
      });
    }
    const result = applyPublishMutation(remote.snapshot, request);
    try {
      const written = await writeRemoteWordbook({
        token,
        config: this.config,
        expectedSha: remote.sha,
        snapshot: result.snapshot,
        message: `${result.action === "deleted" ? "Remove" : "Update"} ${result.entry?.term || "entry"} in Zhuo's public wordbook`
      });
      await commitMutationRecord();
      await this.rememberPublicSnapshot({ ...written, snapshot: result.snapshot });
      return jsonResponse({ ...written, snapshot: result.snapshot, entry: result.entry, action: result.action, recovered: false });
    } catch (error) {
      if (error instanceof ApiError && [409, 401, 403, 413, 429].includes(error.status)) throw error;
      try {
        const confirmed = await readRemoteWordbook(token, this.config);
        if (confirmed.snapshot.lastMutationId === request.mutationId) {
          await commitMutationRecord();
          await this.rememberPublicSnapshot(confirmed);
          return jsonResponse({ ...confirmed, entry: result.entry, action: result.action, recovered: true });
        }
        if (confirmed.sha !== remote.sha) {
          throw new ApiError(409, "publish_result_conflict", "发布结果无法确认，且远端已经变化；请刷新后核对。", {
            sha: confirmed.sha,
            snapshot: confirmed.snapshot
          });
        }
      } catch (confirmationError) {
        if (confirmationError instanceof ApiError && confirmationError.status === 409) throw confirmationError;
      }
      throw error;
    }
  }

  private publish(body: Record<string, unknown>): Promise<Response> {
    let resolveTask: (response: Response) => void;
    let rejectTask: (reason: unknown) => void;
    const task = new Promise<Response>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    this.publishTail = this.publishTail
      .catch(() => {})
      .then(async () => {
        try { resolveTask(await this.runPublish(body)); } catch (error) { rejectTask(error); }
      });
    return task;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") throw new ApiError(405, "method_not_allowed", "Method not allowed");
      const body = bodyRecord(await readJsonBody(request, 1_200_000));
      switch (new URL(request.url).pathname) {
        case "/oauth/create": return await this.createOAuth(body);
        case "/oauth/consume": return await this.consumeOAuth(body);
        case "/session/create": return await this.createSession(body);
        case "/session/view": return await this.sessionView(body);
        case "/session/assert": return await this.assertSession(body);
        case "/session/delete": return await this.deleteSession(body);
        case "/rate": return await this.applyRate(body);
        case "/public/snapshot": return await this.publicSnapshot();
        case "/owner/snapshot": return await this.ownerSnapshot(body);
        case "/owner/publish": return await this.publish(body);
        default: throw new ApiError(404, "internal_not_found", "Internal route not found");
      }
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(500, "internal_error", "Internal owner control error");
      return jsonResponse({ error: { code: apiError.code, message: apiError.message, details: apiError.details } }, apiError.status);
    }
  }
}
