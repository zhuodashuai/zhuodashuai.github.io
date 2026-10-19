import { ApiError, jsonResponse, randomToken, sha256Hex } from "./security";
import {
  equalMemberSecret, hashMemberPassword, MEMBER_SESSION_SECONDS, MEMBER_REMEMBER_SESSION_SECONDS, MEMBER_UUID, memberRemember,
  memberError, memberFields, memberInternalCall, memberPassword, memberUsername,
  readMemberJson, verifyMemberPassword, type MemberEnv, type MemberIdentity, type MemberPasswordHash
} from "./member-security";

interface AccountBase extends MemberIdentity {
  credentialRevision: number;
  createdAt: number;
}
interface ActiveAccount extends AccountBase {
  status: "active";
  password: MemberPasswordHash;
  recoveryHash: string;
}
interface DeletingAccount extends AccountBase { status: "deleting" }
type Account = ActiveAccount | DeletingAccount;
interface UserReference { username?: string; status: "active" | "deleting" | "deleted" }
interface Session {
  userId: string;
  username: string;
  credentialRevision: number;
  csrfHashes: string[];
  createdAt: number;
  expiresAt: number;
}
interface Rate { count: number; expiresAt: number }
interface Expiry { target: string; expiresAt: number }
interface DeletionJob { userId: string; username: string; nonce: string; createdAt: number }
const MAX_SESSIONS = 10;
export const MEMBER_ACCOUNT_LIMIT = 1000;
const AUTH_FAILURE = () => new ApiError(401, "invalid_credentials", "用户名、密码或恢复信息不正确。");

/** Separate namespace: no GitHub token, public snapshot, or owner capability exists here. */
export class MemberAuth implements DurableObject {
  private cryptoTail: Promise<void> = Promise.resolve();
  private pendingCrypto = 0;
  constructor(private readonly ctx: DurableObjectState, private readonly env: MemberEnv) {}

  private async removeKeys(keys: string[]): Promise<void> {
    for (let index = 0; index < keys.length; index += 128) await this.ctx.storage.delete(keys.slice(index, index + 128));
  }

  private async expiry(target: string, expiresAt: number): Promise<void> {
    await this.ctx.storage.put<Expiry>(`expiry:${String(expiresAt).padStart(13, "0")}:${target}`, { target, expiresAt });
    await this.scheduleAlarm(Math.min(expiresAt, Date.now() + 15 * 60_000));
  }

  private async scheduleAlarm(at: number): Promise<void> {
    await this.ctx.storage.transaction(async (transaction) => {
      const current = await transaction.getAlarm();
      if (current === null || current > at) await transaction.setAlarm(Math.max(Date.now() + 1000, at));
    });
  }

  private async cleanup(now = Date.now()): Promise<boolean> {
    const rows = await this.ctx.storage.list<Expiry>({ prefix: "expiry:", limit: 100 });
    let hasMore = rows.size === 100;
    for (const [key, value] of rows) {
      if (value.expiresAt > now) { hasMore = false; break; }
      const target = await this.ctx.storage.get<{ expiresAt?: number; userId?: string }>(value.target);
      if (target?.expiresAt === value.expiresAt) {
        const keys = [value.target, key];
        if (value.target.startsWith("session:") && target.userId) keys.push(`user-session:${target.userId}:${value.target.slice(8)}`);
        await this.removeKeys(keys);
      } else await this.ctx.storage.delete(key);
    }
    return hasMore;
  }

  private async rate(kind: string, subject: string, limit: number, period: number): Promise<void> {
    const now = Date.now();
    const key = `rate:${kind}:${subject}`;
    const record = await this.ctx.storage.transaction(async (transaction) => {
      const old = await transaction.get<Rate>(key);
      const next = old && old.expiresAt > now ? { ...old, count: old.count + 1 }
        : { count: 1, expiresAt: now + period };
      await transaction.put(key, next);
      return next;
    });
    await this.expiry(key, record.expiresAt);
    if (record.count > limit) throw new ApiError(429, "member_rate_limited", "尝试过于频繁，请稍后再试。", {
      retryAfter: Math.max(1, Math.ceil((record.expiresAt - now) / 1000))
    });
  }

  private async authenticationRates(kind: "register" | "login" | "reset", username: string, ipHash: unknown): Promise<void> {
    if (typeof ipHash !== "string" || !/^[0-9a-f]{64}$/.test(ipHash)) throw new ApiError(400, "invalid_internal_request", "缺少认证限流信息。");
    // Global checks first bound the number of attacker-chosen username/IP keys.
    const period = kind === "register" ? 60 * 60_000 : 15 * 60_000;
    await this.rate(`${kind}-global`, "all", kind === "register" ? 20 : kind === "login" ? 120 : 30, period);
    await this.rate(`${kind}-ip`, ipHash, kind === "register" ? 3 : kind === "login" ? 30 : 8, period);
    await this.rate(`${kind}-name`, await sha256Hex(username), kind === "register" ? 5 : kind === "login" ? 10 : 5, period);
  }

  /** Expensive native KDFs never run in the front Worker or concurrently here. */
  private async withCrypto<T>(work: () => Promise<T>): Promise<T> {
    if (this.pendingCrypto >= 4) throw new ApiError(429, "member_auth_busy", "登录服务忙，请稍后重试。", { retryAfter: 3 });
    this.pendingCrypto++;
    let unlock!: () => void;
    const previous = this.cryptoTail;
    this.cryptoTail = new Promise<void>((resolve) => { unlock = resolve; });
    await previous;
    try { return await work(); }
    finally { this.pendingCrypto--; unlock(); }
  }

  private hashField(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new ApiError(401, "member_authentication_required", "请先登录自己的账号。");
    return value;
  }

  private async accountForSession(sessionHash: string, csrfToken?: string): Promise<{ session: Session; account: ActiveAccount }> {
    const session = await this.ctx.storage.get<Session>(`session:${sessionHash}`);
    if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, "member_authentication_required", "登录已失效，请重新登录。");
    const account = await this.ctx.storage.get<Account>(`account:${session.username}`);
    if (!account || account.status !== "active" || account.id !== session.userId || account.credentialRevision !== session.credentialRevision) {
      throw new ApiError(401, "member_authentication_required", "登录已失效，请重新登录。");
    }
    if (csrfToken !== undefined) {
      const hash = typeof csrfToken === "string" ? await sha256Hex(csrfToken) : "";
      if (!hash || !session.csrfHashes.some((known) => equalMemberSecret(hash, known))) throw new ApiError(403, "csrf_failed", "页面验证已失效，请刷新后重试。");
    }
    return { session, account };
  }

  private async clearSessions(userId: string): Promise<void> {
    const index = await this.ctx.storage.list({ prefix: `user-session:${userId}:` });
    await this.removeKeys([...index.keys()].flatMap((key) => [key, `session:${key.slice(`user-session:${userId}:`.length)}`]));
  }

  private async issueSession(account: ActiveAccount, remember = false): Promise<Response> {
    const rawSession = randomToken(48), csrfToken = randomToken(32);
    const hash = await sha256Hex(rawSession);
    const now = Date.now(), expiresAt = now + (remember ? MEMBER_REMEMBER_SESSION_SECONDS : MEMBER_SESSION_SECONDS) * 1000;
    // A hard account bound also bounds session revocation work.
    const index = await this.ctx.storage.list<number>({ prefix: `user-session:${account.id}:` });
    if (index.size >= MAX_SESSIONS) {
      const oldest = [...index].sort((a, b) => a[1] - b[1]).slice(0, index.size - MAX_SESSIONS + 1);
      await this.removeKeys(oldest.flatMap(([key]) => [key, `session:${key.slice(`user-session:${account.id}:`.length)}`]));
    }
    const session: Session = { userId: account.id, username: account.username, credentialRevision: account.credentialRevision,
      csrfHashes: [await sha256Hex(csrfToken)], createdAt: now, expiresAt };
    await this.ctx.storage.put({ [`session:${hash}`]: session, [`user-session:${account.id}:${hash}`]: now });
    await this.expiry(`session:${hash}`, expiresAt);
    return jsonResponse({ authenticated: true, user: { id: account.id, username: account.username }, csrfToken, expiresAt, rawSession });
  }

  private async register(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["username", "password", "ipHash"], ["remember"]);
    const remember = memberRemember(body.remember);
    if (this.env.MEMBER_SIGNUP_ENABLED !== "true") throw new ApiError(503, "member_signup_disabled", "新账号注册暂未开放，已有账号仍可登录。");
    const username = memberUsername(body.username), password = memberPassword(body.password);
    await this.authenticationRates("register", username, body.ipHash);
    return this.withCrypto(async () => {
      if (await this.ctx.storage.get(`account:${username}`)) throw new ApiError(409, "username_unavailable", "这个用户名暂不可用，请选择其他名称。");
      if ((await this.ctx.storage.get<number>("account-count") || 0) >= MEMBER_ACCOUNT_LIMIT) throw new ApiError(503, "member_signup_limit", "个人账号已达到本站容量上限，暂不接受新注册。");
      const recoveryCode = randomToken(32);
      const account: ActiveAccount = { id: crypto.randomUUID(), username, status: "active", credentialRevision: 1,
        password: await hashMemberPassword(password, this.env), recoveryHash: await sha256Hex(recoveryCode), createdAt: Date.now() };
      // Authentication mutations share the queue, and storage creation is atomic.
      await this.ctx.storage.transaction(async (transaction) => {
        if (await transaction.get(`account:${username}`)) throw new ApiError(409, "username_unavailable", "这个用户名暂不可用，请选择其他名称。");
        const count = await transaction.get<number>("account-count") || 0;
        if (count >= MEMBER_ACCOUNT_LIMIT) throw new ApiError(503, "member_signup_limit", "个人账号已达到本站容量上限，暂不接受新注册。");
        await transaction.put("account-count", count + 1);
        await transaction.put({ [`account:${username}`]: account, [`user:${account.id}`]: { username, status: "active" } satisfies UserReference });
      });
      const response = await this.issueSession(account, remember);
      return jsonResponse({ ...await response.json() as Record<string, unknown>, recoveryCode });
    });
  }

  private async login(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["username", "password", "ipHash"], ["remember"]);
    const remember = memberRemember(body.remember);
    const username = memberUsername(body.username), password = memberPassword(body.password);
    await this.authenticationRates("login", username, body.ipHash);
    return this.withCrypto(async () => {
      const account = await this.ctx.storage.get<Account>(`account:${username}`);
      // Unknown accounts still pay one KDF; do not expose an existence timing oracle.
      if (!account || account.status !== "active") { await hashMemberPassword(password, this.env); throw AUTH_FAILURE(); }
      if (!await verifyMemberPassword(password, account.password, this.env)) throw AUTH_FAILURE();
      return this.issueSession(account, remember);
    });
  }

  private async sessionView(body: Record<string, unknown>, issueCsrf: boolean): Promise<Response> {
    memberFields(body, ["sessionHash"], issueCsrf ? [] : ["csrfToken"]);
    const sessionHash = this.hashField(body, "sessionHash");
    const { session, account } = await this.accountForSession(sessionHash, issueCsrf ? undefined : body.csrfToken as string | undefined);
    if (!issueCsrf) return jsonResponse({ authenticated: true, user: { id: account.id, username: account.username }, expiresAt: session.expiresAt });
    const csrfToken = randomToken(32), csrfHash = await sha256Hex(csrfToken);
    // Re-read in a transaction so logout/reset cannot be undone by a late GET.
    await this.ctx.storage.transaction(async (transaction) => {
      const fresh = await transaction.get<Session>(`session:${sessionHash}`);
      const latest = await transaction.get<Account>(`account:${session.username}`);
      if (!fresh || !latest || latest.status !== "active" || latest.id !== fresh.userId
        || latest.credentialRevision !== fresh.credentialRevision || fresh.expiresAt <= Date.now()) throw AUTH_FAILURE();
      await transaction.put(`session:${sessionHash}`, { ...fresh, csrfHashes: [...fresh.csrfHashes.slice(-4), csrfHash] });
    });
    return jsonResponse({ authenticated: true, user: { id: account.id, username: account.username }, csrfToken, expiresAt: session.expiresAt });
  }

  private async logout(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["sessionHash", "csrfToken"]);
    const hash = this.hashField(body, "sessionHash");
    const { session } = await this.accountForSession(hash, body.csrfToken as string);
    await this.removeKeys([`session:${hash}`, `user-session:${session.userId}:${hash}`]);
    return jsonResponse({ ok: true });
  }

  private async resetPassword(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["username", "recoveryCode", "newPassword", "ipHash"]);
    const username = memberUsername(body.username), password = memberPassword(body.newPassword);
    await this.authenticationRates("reset", username, body.ipHash);
    if (typeof body.recoveryCode !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.recoveryCode)) throw AUTH_FAILURE();
    const recoveryHash = await sha256Hex(body.recoveryCode);
    return this.withCrypto(async () => {
      const account = await this.ctx.storage.get<Account>(`account:${username}`);
      if (!account || account.status !== "active" || !equalMemberSecret(recoveryHash, account.recoveryHash)) throw AUTH_FAILURE();
      const recoveryCode = randomToken(32);
      const next = { ...account, credentialRevision: account.credentialRevision + 1,
        password: await hashMemberPassword(password, this.env), recoveryHash: await sha256Hex(recoveryCode) };
      await this.ctx.storage.put(`account:${username}`, next);
      await this.clearSessions(account.id);
      return jsonResponse({ ok: true, recoveryCode });
    });
  }

  private async deletionProof(job: DeletionJob): Promise<string> {
    if (!this.env.SESSION_SECRET) throw new ApiError(503, "member_auth_unavailable", "认证暂不可用。");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(this.env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`zhuo-member-delete-v1\0${job.userId}\0${job.nonce}`)));
    return [...signed].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  private async performDeletion(job: DeletionJob): Promise<boolean> {
    try {
      const stub = this.env.PERSONAL_WORDBOOK.get(this.env.PERSONAL_WORDBOOK.idFromName(`user:${job.userId}`));
      await memberInternalCall(stub, "/destroy", { userId: job.userId, proof: await this.deletionProof(job) });
      await this.ctx.storage.transaction(async (transaction) => {
        const account = await transaction.get<Account>(`account:${job.username}`);
        if (account?.id === job.userId && account.status === "deleting") {
          await transaction.delete(`account:${job.username}`);
          await transaction.put("account-count", Math.max(0, (await transaction.get<number>("account-count") || 0) - 1));
        }
        await transaction.put<UserReference>(`user:${job.userId}`, { status: "deleted" });
        await transaction.delete(`deletion:${job.userId}`);
      });
      return true;
    } catch {
      // No user data in logs; durable job remains and the account cannot log in.
      await this.scheduleAlarm(Date.now() + 60_000);
      return false;
    }
  }

  private async deleteAccount(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["sessionHash", "csrfToken", "password", "confirmation"]);
    if (body.confirmation !== "DELETE") throw new ApiError(400, "delete_confirmation_required", "请输入 DELETE 确认删除自己的账号。");
    const password = memberPassword(body.password), hash = this.hashField(body, "sessionHash");
    // Account/session verification precedes the costly check; only own account.
    const initial = await this.accountForSession(hash, body.csrfToken as string);
    await this.rate("delete-user", initial.account.id, 5, 15 * 60_000);
    return this.withCrypto(async () => {
      const { account } = await this.accountForSession(hash, body.csrfToken as string);
      if (!await verifyMemberPassword(password, account.password, this.env)) throw AUTH_FAILURE();
      const job: DeletionJob = { userId: account.id, username: account.username, nonce: randomToken(32), createdAt: Date.now() };
      await this.ctx.storage.transaction(async (transaction) => {
        // Drop credentials immediately, even if private storage needs retries.
        const tombstone: DeletingAccount = { id: account.id, username: account.username, createdAt: account.createdAt,
          status: "deleting", credentialRevision: account.credentialRevision + 1 };
        await transaction.put(`account:${account.username}`, tombstone);
        await transaction.put<UserReference>(`user:${account.id}`, { username: account.username, status: "deleting" });
        await transaction.put(`deletion:${account.id}`, job);
      });
      await this.clearSessions(account.id);
      await this.scheduleAlarm(Date.now() + 60_000);
      const complete = await this.performDeletion(job);
      return jsonResponse({ ok: true, ...(!complete ? { deletionPending: true } : {}) }, complete ? 200 : 202);
    });
  }

  private async authorizeDeletion(body: Record<string, unknown>): Promise<Response> {
    memberFields(body, ["userId", "proof"]);
    if (typeof body.userId !== "string" || !MEMBER_UUID.test(body.userId) || typeof body.proof !== "string") throw AUTH_FAILURE();
    const job = await this.ctx.storage.get<DeletionJob>(`deletion:${body.userId}`);
    const user = await this.ctx.storage.get<UserReference>(`user:${body.userId}`);
    if (!job || user?.status !== "deleting" || !equalMemberSecret(await this.deletionProof(job), body.proof)) throw AUTH_FAILURE();
    return jsonResponse({ authorized: true, userId: job.userId });
  }

  async alarm(): Promise<void> {
    const jobs = await this.ctx.storage.list<DeletionJob>({ prefix: "deletion:", limit: 20 });
    for (const job of jobs.values()) await this.performDeletion(job);
    const more = await this.cleanup();
    const nextJobs = await this.ctx.storage.list({ prefix: "deletion:", limit: 1 });
    const nextExpiry = await this.ctx.storage.list<Expiry>({ prefix: "expiry:", limit: 1 });
    if (nextJobs.size || more) await this.scheduleAlarm(Date.now() + 60_000);
    else if (nextExpiry.size) await this.scheduleAlarm(Math.max(Date.now() + 1000, [...nextExpiry.values()][0].expiresAt));
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") throw new ApiError(405, "method_not_allowed", "Method not allowed");
      const body = await readMemberJson(request, 32 * 1024);
      switch (new URL(request.url).pathname) {
        case "/register": return await this.register(body);
        case "/login": return await this.login(body);
        case "/session/view": return await this.sessionView(body, true);
        case "/session/assert": return await this.sessionView(body, false);
        case "/logout": return await this.logout(body);
        case "/password/reset": return await this.resetPassword(body);
        case "/account/delete": return await this.deleteAccount(body);
        case "/account/deletion/authorize": return await this.authorizeDeletion(body);
        default: throw new ApiError(404, "member_not_found", "个人账号接口不存在。");
      }
    } catch (error) { return memberError(error); }
  }
}
