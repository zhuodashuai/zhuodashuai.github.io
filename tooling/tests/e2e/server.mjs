import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createBlankEntry, findDuplicate, normalizeEnglish, parsePublicSnapshot, validateEnglishInput, validatePublicEntry } from "../../../vocab/js/wordbook-schema.js";
import { isSynonymLexicalEntry, pendingSynonymScan } from "../../../vocab/js/synonym-evidence.js";
import { collectionMemberships } from "../../../vocab/js/collections.js";
import { scheduleReview } from "../../../vocab/js/review.js";

const root = resolve("vocab");
const baseline = parsePublicSnapshot(JSON.parse(await readFile(join(root, "data/owner-wordbook.json"), "utf8")));
const runs = new Map();

function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => part.trim().split(/=(.*)/s)).filter(([key]) => key));
}

function runState(request) {
  const requestCookies = cookies(request);
  const id = requestCookies.e2e_run || "default";
  if (!runs.has(id)) {
    const initial = structuredClone(baseline);
    if (requestCookies.e2e_empty === "1") initial.entries = [];
    runs.set(id, {
      snapshot: initial, sha: "a".repeat(40), conflictInjected: false,
      memberAccounts: new Map(), memberSessions: new Map()
    });
  }
  return runs.get(id);
}

function send(response, status, bodyValue, headers) {
  let bytes = Buffer.isBuffer(bodyValue) ? bodyValue : Buffer.from(bodyValue);
  const compressible = /^(?:text\/|application\/(?:json|manifest\+json))/i.test(headers["Content-Type"] || "");
  const acceptsGzip = String(response.req.headers["accept-encoding"] || "").split(",").some(part => {
    const [encoding, ...parameters] = part.trim().toLowerCase().split(";");
    const quality = parameters.map(value => value.trim()).find(value => value.startsWith("q="));
    return encoding === "gzip" && (!quality || Number(quality.slice(2)) > 0);
  });
  // Pages and the Worker compress textual responses in production. Mirror
  // that transport here: throttled tests must measure transferred bytes, not
  // an ever-growing uncompressed catalogue that production never sends.
  const compressed = compressible && acceptsGzip && bytes.length > 1024;
  if (compressed) bytes = gzipSync(bytes);
  response.writeHead(status, {
    ...headers,
    ...(compressible ? { Vary: [headers.Vary, "Accept-Encoding"].filter(Boolean).join(", ") } : {}),
    ...(compressed ? { "Content-Encoding": "gzip" } : {}),
    "Content-Length": bytes.length
  });
  response.end(bytes);
}

function json(response, status, payload, headers = {}) {
  send(response, status, JSON.stringify(payload), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
}

function error(response, status, code, message, details) {
  json(response, status, { error: { code, message, requestId: "e2e-request", ...(details ? { details } : {}) } });
}

async function body(request, maximum = 1_200_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function authenticated(request) {
  return cookies(request).e2e_auth === "owner";
}

function assertWrite(request, response, payload) {
  if (!authenticated(request)) { error(response, 401, "authentication_required", "请先以卓本人身份登录。"); return false; }
  if (request.headers.origin !== "http://127.0.0.1:4187" || request.headers["content-type"] !== "application/json") {
    error(response, 403, "origin_forbidden", "请求不是来自同源管理页面。"); return false;
  }
  if (request.headers["x-csrf-token"] !== "e2e-csrf-token-000000000000000000000000") {
    error(response, 403, "csrf_failed", "页面验证已失效。"); return false;
  }
  if (payload?.mutationId && request.headers["idempotency-key"] !== payload.mutationId) {
    error(response, 400, "idempotency_mismatch", "幂等键不匹配。"); return false;
  }
  return true;
}

// Isolated in-memory browser fixtures only. The production password KDF and
// persistent account implementation are tested against the real Worker module;
// this deliberately cheap hash never handles a real account or external API.
const memberFixtureOrigin = "http://127.0.0.1:4187";
const fixturePasswordHash = password => createHash("sha256").update(password).digest("hex");
const fixtureMemberCookie = token => `e2e_member_session=${token}; Path=/; HttpOnly; SameSite=Strict`;
const memberHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const fixtureOwnerId = "15604207-8000-4000-8000-000000000001";

function memberJson(response, status, value, headers = {}) {
  return json(response, status, value, { ...memberHeaders, ...headers });
}

function memberError(response, status, code, message, details) {
  return memberJson(response, status, { error: { code, message, requestId: "e2e-member-request", ...(details ? { details } : {}) } });
}

function memberFixtureSession(request) {
  const state = runState(request);
  const requestCookies = cookies(request);
  const mode = request.headers["x-wordbook-auth"] || "auto";
  if (!["auto", "member", "github-owner"].includes(mode)) return null;
  if (mode === "github-owner" || (mode === "auto" && !requestCookies.e2e_member_session)) {
    if (!authenticated(request)) return null;
    state.ownerMemberAccount ||= { id: fixtureOwnerId, username: "zhuodashuai", revision: 0, entries: [], reviews: new Map(), mutations: new Map() };
    return { state, token: "github-owner", authType: "github-owner", account: state.ownerMemberAccount,
      session: { userId: fixtureOwnerId, username: "zhuodashuai", csrfToken: "e2e-csrf-token-000000000000000000000000", expiresAt: Date.now() + 3_600_000 } };
  }
  const token = requestCookies.e2e_member_session;
  const session = state.memberSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) return null;
  const account = state.memberAccounts.get(session.username);
  if (!account || account.deleted || account.id !== session.userId) return null;
  return { state, token, session, account, authType: "member" };
}

function memberSessionPayload(session, account, authType = "member") {
  return { authenticated: true, authType, user: { id: account.id, username: account.username }, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
}

function createMemberFixtureSession(state, account) {
  const token = randomBytes(48).toString("base64url");
  const session = { username: account.username, userId: account.id, csrfToken: randomBytes(32).toString("base64url"), expiresAt: Date.now() + 3_600_000 };
  state.memberSessions.set(token, session);
  return { token, session };
}

function revokeMemberFixtureSessions(state, account) {
  for (const [token, session] of state.memberSessions) if (session.userId === account.id) state.memberSessions.delete(token);
}

function validMemberFixtureCredentials(username, password) {
  return typeof username === "string" && /^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(username)
    && typeof password === "string" && [...password].length >= 15 && [...password].length <= 128
    && !/[\u0000-\u001f\u007f]/u.test(password);
}

function memberFixtureMutation(request, response, account, operation, payload) {
  if (typeof payload.mutationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(payload.mutationId)) {
    memberError(response, 400, "invalid_mutation_id", "请为本次保存提供有效的操作编号。");
    return { stopped: true };
  }
  if (request.headers["idempotency-key"] && request.headers["idempotency-key"] !== payload.mutationId) {
    memberError(response, 400, "idempotency_mismatch", "幂等键不匹配。");
    return { stopped: true };
  }
  const fingerprint = JSON.stringify(payload);
  const prior = account.mutations.get(payload.mutationId);
  if (prior) {
    if (prior.operation !== operation || prior.fingerprint !== fingerprint) {
      memberError(response, 409, "idempotency_key_reused", "这个操作编号已经用于另一项修改。");
    } else {
      memberJson(response, prior.status, operation === "selection" ? { ...prior.value, added: 0, reused: 0, contextAdded: 0 }
        : operation.startsWith("review:") ? { ...prior.value, action: "idempotent" } : prior.value);
    }
    return { stopped: true };
  }
  return { stopped: false, save(status, value) {
    account.mutations.set(payload.mutationId, { operation, fingerprint, status, value: structuredClone(value) });
    return memberJson(response, status, value);
  } };
}

function selectionContexts(entry, collectionId, chapterId) {
  const memberships = collectionMemberships(entry);
  const selected = memberships.length ? memberships.filter(item => (collectionId === "all" || item.collectionId === collectionId)
    && (chapterId === "all" || item.chapterId === chapterId)) : collectionId === "all" || collectionId === "main"
      ? [{ collectionId: "main", chapterId: "all", tag: "" }] : [];
  return selected.map(item => {
    const context = entry.readingContexts?.find(value => value.membership === item.tag) || entry;
    return {
      key: `${entry.id}:${item.collectionId}:${item.chapterId}`, entryId: entry.id, term: entry.term,
      collectionId: item.collectionId, chapterId: item.chapterId,
      bookTitle: item.collectionId === "main" ? "卓的主词本" : context.sourceWork || entry.sourceWork || item.collectionId,
      chapterTitle: item.chapterId === "all" ? "" : `Chapter ${item.chapterId.slice(8)}`,
      sourceTitle: context.sourceTitle || entry.sourceTitle || "", page: context.page || "",
      originalInput: context.originalInput || entry.originalInput || entry.term,
      meaning: context.meaning || "", definition: context.definition || "",
      exampleEn: context.exampleEn || "", exampleZh: context.exampleZh || "",
      partOfSpeech: context.partOfSpeech || "", phonetic: entry.phonetic || "", usage: context.usage || ""
    };
  });
}

function memberFixtureSelection(request, response, state, account, payload) {
  if (!Array.isArray(payload.entryIds) || !payload.entryIds.length || payload.entryIds.length > 100
    || payload.entryIds.some(id => typeof id !== "string") || new Set(payload.entryIds).size !== payload.entryIds.length
    || typeof payload.collectionId !== "string" || !/^(?:all|main|[a-z0-9]+(?:-[a-z0-9]+)*)$/u.test(payload.collectionId)
    || typeof payload.chapterId !== "string" || !/^(?:all|chapter-[1-9]\d*)$/u.test(payload.chapterId)
    || (payload.collectionId === "main" && payload.chapterId !== "all")) return memberError(response, 400, "invalid_selection", "请选择有效的公开词条及章节，每次最多 100 条。");
  const mutation = memberFixtureMutation(request, response, account, "selection", payload);
  if (mutation.stopped) return;
  const source = payload.entryIds.map(id => {
    const entry = state.snapshot.entries.find(item => item.id === id);
    return entry ? { entry, contexts: selectionContexts(entry, payload.collectionId, payload.chapterId) } : null;
  });
  if (source.some(item => !item || !item.contexts.length)) return memberError(response, 400, "invalid_selection", "选入的词条不属于指定公开章节。");
  if (account.entries.length + source.filter(item => !account.entries.some(entry => entry.normalized === item.entry.normalized)).length > 1000) return memberError(response, 413, "personal_entry_limit", "个人词库最多 1000 条。");
  let added = 0, reused = 0, contextAdded = 0;
  const affected = [];
  for (const { entry: publicEntry, contexts } of source) {
    let entry = account.entries.find(item => item.normalized === publicEntry.normalized);
    const isNew = !entry;
    const now = new Date().toISOString();
    if (!entry) {
      entry = { id: `member-${crypto.randomUUID()}`, revision: 1, term: publicEntry.term, normalized: publicEntry.normalized,
        meaning: contexts[0].meaning, note: "", createdAt: now, updatedAt: now, sourceContexts: [], meaningEdited: false };
      account.entries.push(entry); added++;
    } else {
      reused++;
      if (!entry.sourceContexts?.length) {
        entry.meaningEdited = Boolean(entry.meaning);
        if (!entry.meaning) entry.meaning = contexts[0].meaning;
      }
    }
    const existing = entry.sourceContexts || [];
    const extra = contexts.filter(context => !existing.some(value => value.key === context.key));
    if (existing.length + extra.length > 50) return memberError(response, 413, "source_context_limit", "每个词条最多保留 50 个阅读语境。");
    if (extra.length) {
      entry.sourceContexts = [...existing, ...extra];
      contextAdded += extra.length;
      if (!isNew) entry.revision++;
      entry.updatedAt = now;
    }
    affected.push(structuredClone(entry));
  }
  if (added || contextAdded) account.revision++;
  return mutation.save(200, { revision: account.revision, added, reused, contextAdded, entries: affected });
}

async function memberApi(request, response, url) {
  const path = url.pathname.slice("/api/v1/member/".length);
  const state = runState(request);
  const current = memberFixtureSession(request);
  if (path === "session" && request.method === "GET") {
    return memberJson(response, 200, current ? memberSessionPayload(current.session, current.account, current.authType) : { authenticated: false });
  }
  if (request.method !== "GET") {
    if (request.headers.origin !== memberFixtureOrigin || !/^application\/json(?:\s*;|$)/iu.test(request.headers["content-type"] || "")) {
      return memberError(response, 403, "origin_forbidden", "请从本站同源页面提交 JSON 请求。");
    }
  }
  let payload = null;
  if (request.method !== "GET") {
    try { payload = await body(request, 64_000); }
    catch { return memberError(response, 400, "invalid_json", "提交内容不是有效的 JSON。"); }
    const required = ["register", "login"].includes(path) ? ["username", "password"]
      : path === "password/reset" ? ["username", "recoveryCode", "newPassword"]
      : path === "account" ? ["password", "confirmation"]
      : path === "selections" ? ["entryIds", "collectionId", "chapterId", "mutationId"]
      : /^reviews\//u.test(path) ? ["rating", "revision", "mutationId"]
      : path === "entries" ? ["term", "mutationId"]
      : /^entries\//u.test(path) ? request.method === "DELETE" ? ["revision", "mutationId"] : ["revision", "term", "mutationId"] : [];
    const optional = (path === "entries" || /^entries\//u.test(path)) && request.method !== "DELETE" ? ["meaning", "note"] : [];
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || required.some(key => !Object.hasOwn(payload, key))
      || Object.keys(payload).some(key => !required.includes(key) && !optional.includes(key))) {
      return memberError(response, 400, "invalid_fields", "不接受身份、权限或额外字段。");
    }
  }
  if (["register", "login"].includes(path) && request.method === "POST") {
    if (request.headers["x-wordbook-auth"] === "github-owner") return memberError(response, 403, "owner_account_managed_by_github", "所有者请使用既有 GitHub 身份。");
    if (!validMemberFixtureCredentials(payload?.username, payload?.password)) return memberError(response, 400, "invalid_credentials", "用户名需以字母开头，为 3–24 位字母、数字或下划线；密码需为 15–128 个字符。");
    const username = payload.username.toLowerCase();
    if (["owner", "admin", "administrator", "zhuodashuai", "zhuo", "root", "support", "system"].includes(username)) return memberError(response, 400, "reserved_username", "这个用户名为系统保留。");
    let account = state.memberAccounts.get(username);
    let recoveryCode;
    if (path === "register") {
      if (account) return memberError(response, 409, "username_unavailable", "这个用户名已经注册。");
      recoveryCode = randomBytes(32).toString("base64url");
      account = { id: crypto.randomUUID(), username, passwordHash: fixturePasswordHash(payload.password), recoveryHash: fixturePasswordHash(recoveryCode), deleted: false, revision: 0, entries: [], reviews: new Map(), mutations: new Map() };
      state.memberAccounts.set(username, account);
    } else if (!account || account.deleted || account.passwordHash !== fixturePasswordHash(payload.password)) {
      return memberError(response, 401, "invalid_credentials", "用户名或密码不正确。");
    }
    const { token, session } = createMemberFixtureSession(state, account);
    return memberJson(response, 200,
      { ...memberSessionPayload(session, account), ...(recoveryCode ? { recoveryCode } : {}) },
      { "Set-Cookie": fixtureMemberCookie(token) });
  }
  if (path === "password/reset" && request.method === "POST") {
    if (request.headers["x-wordbook-auth"] === "github-owner") return memberError(response, 403, "owner_account_managed_by_github", "所有者账号由 GitHub 管理。");
    if (!validMemberFixtureCredentials(payload?.username, payload?.newPassword) || typeof payload.recoveryCode !== "string") {
      return memberError(response, 400, "invalid_reset", "请输入用户名、恢复码和不少于 15 字符的新密码。");
    }
    const account = state.memberAccounts.get(payload.username.toLowerCase());
    if (!account || account.deleted || account.recoveryHash !== fixturePasswordHash(payload.recoveryCode)) return memberError(response, 401, "invalid_credentials", "用户名或恢复码不正确。");
    const recoveryCode = randomBytes(32).toString("base64url");
    account.passwordHash = fixturePasswordHash(payload.newPassword);
    account.recoveryHash = fixturePasswordHash(recoveryCode);
    revokeMemberFixtureSessions(state, account);
    return memberJson(response, 200, { ok: true, recoveryCode }, { "Set-Cookie": "e2e_member_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict" });
  }
  if (!current) return memberError(response, 401, "member_authentication_required", "请先登录自己的私人单词本。");
  const { account, session, token } = current;
  if (request.method !== "GET" && request.headers["x-csrf-token"] !== session.csrfToken) return memberError(response, 403, "csrf_failed", "页面验证已失效，请重新登录。");
  if (path === "logout" && request.method === "POST") {
    if (cookies(request).e2e_member_logout_fail === "1") return memberError(response, 503, "member_unavailable", "测试用退出网络故障。");
    if (current.authType === "github-owner") return memberJson(response, 200, { ok: true }, { "Set-Cookie": "e2e_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" });
    state.memberSessions.delete(token);
    return memberJson(response, 200, { ok: true }, { "Set-Cookie": "e2e_member_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict" });
  }
  if (path === "account" && request.method === "DELETE") {
    if (current.authType === "github-owner") return memberError(response, 403, "owner_account_managed_by_github", "所有者账号由 GitHub 管理。");
    if (payload?.confirmation !== "DELETE" || typeof payload.password !== "string") return memberError(response, 400, "delete_confirmation_required", "删除账户需输入密码与 DELETE。");
    if (account.passwordHash !== fixturePasswordHash(payload.password)) return memberError(response, 401, "invalid_credentials", "密码不正确，账户没有删除。");
    account.deleted = true;
    account.entries = [];
    account.reviews.clear();
    account.mutations.clear();
    revokeMemberFixtureSessions(state, account);
    state.memberAccounts.delete(account.username);
    return memberJson(response, 200, { ok: true }, { "Set-Cookie": "e2e_member_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict" });
  }
  if (["entries", "learning"].includes(path) && request.method === "GET") {
    // A cookie may change in another tab between session verification and a
    // list read. This optional header only checks identity: it never selects
    // an account or grants access to another tenant's records.
    const expectedUser = request.headers["x-member-user"];
    if (expectedUser !== undefined && expectedUser !== account.id) return memberError(response, 401, "member_session_changed", "账号已改变，请重新登录确认。");
    return memberJson(response, 200, path === "learning" ? { revision: account.revision, reviews: structuredClone([...account.reviews.values()]) }
      : { revision: account.revision, entries: structuredClone(account.entries), limit: 1000 });
  }
  if (path === "selections" && request.method === "POST") return memberFixtureSelection(request, response, state, account, payload);
  const reviewMatch = path.match(/^reviews\/([^/]+)$/u);
  if (reviewMatch && request.method === "POST") {
    const id = decodeURIComponent(reviewMatch[1]);
    if (!account.entries.some(entry => entry.id === id)) return memberError(response, 404, "entry_missing", "词条不存在或不属于当前账号。");
    if (!["again", "hard", "good", "easy"].includes(payload.rating) || !Number.isSafeInteger(payload.revision) || payload.revision < 0) return memberError(response, 400, "invalid_review", "复习评分不正确。");
    const mutation = memberFixtureMutation(request, response, account, `review:${id}`, payload);
    if (mutation.stopped) return;
    const previous = account.reviews.get(id);
    if ((previous?.revision || 0) !== payload.revision) return memberError(response, 409, "revision_conflict", "复习记录已在其他设备改变。", { existing: previous || null, revision: account.revision });
    const review = { ...scheduleReview(previous || { entryId: id }, payload.rating, new Date()), revision: (previous?.revision || 0) + 1 };
    account.reviews.set(id, review); account.revision++;
    return mutation.save(200, { revision: account.revision, review: structuredClone(review), action: "reviewed" });
  }
  const match = path.match(/^entries\/([^/]+)$/u);
  if ((path === "entries" && request.method === "POST") || (match && ["PUT", "DELETE"].includes(request.method))) {
    const operation = `${request.method}:${path}`;
    const mutation = memberFixtureMutation(request, response, account, operation, payload);
    if (mutation.stopped) return;
    const id = match ? decodeURIComponent(match[1]) : null;
    const index = id ? account.entries.findIndex(entry => entry.id === id) : -1;
    if (id && index < 0) return memberError(response, 404, "entry_missing", "词条不存在或不属于当前账户。");
    if (id && payload.revision !== account.entries[index].revision) return memberError(response, 409, "revision_conflict", "词条已被另一个窗口修改，请刷新后再试。", { existing: account.entries[index], revision: account.revision });
    if (request.method === "DELETE") {
      account.entries.splice(index, 1);
      account.reviews.delete(id);
      account.revision++;
      return mutation.save(200, { revision: account.revision, entry: null, action: "deleted" });
    }
    if (typeof payload.term !== "string" || !payload.term.trim() || [...payload.term].length > 200
      || (payload.meaning !== undefined && (typeof payload.meaning !== "string" || [...payload.meaning].length > 2000))
      || (payload.note !== undefined && (typeof payload.note !== "string" || [...payload.note].length > 1000))) {
      return memberError(response, 400, "invalid_entry", "词条为空或长度超出限制。");
    }
    let term;
    try { term = validateEnglishInput(payload.term); }
    catch { return memberError(response, 400, "invalid_entry", "请输入有效的英文单词或短语。"); }
    const normalized = normalizeEnglish(term);
    if (id && account.entries[index].sourceContexts?.length && normalized !== account.entries[index].normalized) return memberError(response, 400, "source_term_locked", "选入的公开词条不能改成另一个词。");
    const duplicate = account.entries.find(entry => entry.normalized === normalized && entry.id !== id);
    if (duplicate) return memberError(response, 409, "duplicate_entry", "这个词已经在你的单词本里。", { existing: duplicate, revision: account.revision });
    if (!id && account.entries.length >= 1000) return memberError(response, 413, "personal_entry_limit", "个人词条达到上限。");
    const now = new Date().toISOString();
    const entry = {
      id: id || `member-${crypto.randomUUID()}`, revision: id ? account.entries[index].revision + 1 : 1,
      term, normalized, meaning: payload.meaning || "", note: payload.note || "",
      createdAt: id ? account.entries[index].createdAt : now, updatedAt: now
    };
    if (id && account.entries[index].sourceContexts?.length) {
      entry.sourceContexts = structuredClone(account.entries[index].sourceContexts);
      entry.meaningEdited = account.entries[index].meaningEdited || entry.meaning !== account.entries[index].meaning;
    }
    if (id) account.entries[index] = entry; else account.entries.push(entry);
    account.revision++;
    return mutation.save(200, { revision: account.revision, entry: structuredClone(entry), action: id ? "updated" : "created" });
  }
  return memberError(response, 404, "api_not_found", "Member API not found");
}

function organizedEntry(input) {
  const entry = createBlankEntry(input);
  const lower = normalizeEnglish(input);
  entry.synonyms = lower === "alleviate"
    ? ["ease", "mitigate", "soothe"]
    : lower === "ease"
      ? ["alleviate", "lessen", "relieve"]
      : lower === "delicious"
        ? ["yummy", "palatable", "tasty"]
        : lower === "yummy"
          ? ["delicious", "palatable", "tasty"]
          : lower === "palatable"
            ? ["delicious", "yummy", "tasty"]
      : [];
  entry.meaning = lower === "hip" ? "noun：髋部；髋关节；臀部两侧\nadjective：时髦的；了解最新潮流的"
    : lower === "jab at" ? "朝某人或某物猛戳；（言语上）挖苦或抨击"
    : lower === "recieve" ? "收到；接收"
      : lower === "xssword" ? "<img src=x onerror=window.__xss=1> 只应显示为文本"
        : "自动整理的测试释义";
  entry.definition = lower === "hip"
    ? "noun: Either side of the body below the waist, including the joint connecting the leg and pelvis.\nadjective: Fashionable or aware of current trends."
    : lower === "jab at" ? "To make a quick sharp movement or criticism toward someone or something." : "A test definition.";
  entry.phonetic = lower === "hip" ? "/hɪp/" : lower === "jab at" ? "/dʒæb æt/" : "/test/";
  entry.partOfSpeech = lower === "hip" ? "noun · adjective" : lower === "jab at" ? "verb phrase" : "noun";
  entry.exampleEn = lower === "hip" ? "She injured her hip while running." : lower === "jab at" ? "He jabbed at the button." : "This is a natural example.";
  entry.exampleZh = lower === "hip" ? "她跑步时伤了髋部。" : lower === "jab at" ? "他猛戳按钮。" : "这是一个自然的例句。";
  entry.usage = "Review this candidate before publishing.";
  entry.tags = ["E2E"];
  if (lower === "hip") {
    entry.senses = [
      {
        partOfSpeech: "noun", meaningZh: "髋部；髋关节；臀部两侧",
        definitionEn: "Either side of the body below the waist, including the joint connecting the leg and pelvis.",
        usageNotes: "常见身体部位义项优先。", register: "neutral", collocations: ["hip joint"],
        examples: [{ en: "She injured her hip while running.", zh: "她跑步时伤了髋部。" }], confusables: []
      },
      {
        partOfSpeech: "adjective", meaningZh: "时髦的；了解最新潮流的",
        definitionEn: "Fashionable or aware of the newest ideas and trends.",
        usageNotes: "Informal.", register: "informal", collocations: ["hip café"],
        examples: [{ en: "The neighbourhood is full of hip cafés.", zh: "这个街区到处都是时髦的咖啡馆。" }], confusables: []
      }
    ];
  }
  if (!entry.senses.length) {
    entry.senses = [{
      partOfSpeech: entry.partOfSpeech || "expression",
      meaningZh: entry.meaning,
      definitionEn: entry.definition,
      usageNotes: entry.usage,
      register: "neutral",
      collocations: [],
      examples: [{ en: entry.exampleEn, zh: entry.exampleZh }],
      confusables: []
    }];
  }
  if (lower === "recieve") {
    entry.standardForm = "receive";
    entry.correction = { status: "suggested", original: "recieve", suggestion: "receive", chosen: "recieve", confidence: .99, source: "e2e-ai" };
  }
  if (entry.entryType === "quote") {
    entry.author = "";
    entry.sourceTitle = "";
    entry.sourceUrl = "";
    entry.attributionStatus = "unverified";
    entry.attributionNote = "出处未核验；E2E 不提供虚构作者。";
  }
  entry.organizationMethod = "ai-cloudflare";
  return validatePublicEntry(entry);
}

function sameTerms(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function reconcileReciprocalSynonyms(entries, target, previous, now) {
  const targetId = target?.id || "";
  const lexical = (entry) => ["word", "phrase", "phrasal-verb", "idiom", "collocation"].includes(entry.entryType);
  const indexByTerm = new Map(entries.map((entry, index) => lexical(entry) ? [normalizeEnglish(entry.term), index] : null).filter(Boolean));
  const desired = entries.map((entry) => [...entry.synonyms]);

  if (previous && target && normalizeEnglish(previous.term) !== normalizeEnglish(target.term)) {
    const oldKey = normalizeEnglish(previous.term);
    for (let index = 0; index < entries.length; index += 1) {
      if (entries[index].id === targetId) continue;
      desired[index] = desired[index].map((synonym) => normalizeEnglish(synonym) === oldKey ? target.term : synonym);
    }
  }
  if (previous && target) {
    const currentKeys = new Set(target.synonyms.map((synonym) => normalizeEnglish(synonym)));
    const removed = previous.synonyms.filter((synonym) => !currentKeys.has(normalizeEnglish(synonym)));
    const ownerKeys = new Set([previous.term, target.term].map((term) => normalizeEnglish(term)));
    for (const synonym of removed) {
      const index = indexByTerm.get(normalizeEnglish(synonym));
      if (index !== undefined) desired[index] = desired[index].filter((value) => !ownerKeys.has(normalizeEnglish(value)));
    }
  }
  if (previous && !target) {
    const removedKey = normalizeEnglish(previous.term);
    for (let index = 0; index < entries.length; index += 1) {
      desired[index] = desired[index].filter((synonym) => normalizeEnglish(synonym) !== removedKey);
    }
  }

  for (let sourceIndex = 0; sourceIndex < entries.length; sourceIndex += 1) {
    if (!lexical(entries[sourceIndex])) continue;
    desired[sourceIndex] = desired[sourceIndex].map((synonym) => {
      const index = indexByTerm.get(normalizeEnglish(synonym));
      return index === undefined ? synonym : entries[index].term;
    });
    for (const synonym of desired[sourceIndex]) {
      const targetIndex = indexByTerm.get(normalizeEnglish(synonym));
      if (targetIndex === undefined || targetIndex === sourceIndex) continue;
      if (!desired[targetIndex].some((value) => normalizeEnglish(value) === normalizeEnglish(entries[sourceIndex].term))) {
        desired[targetIndex].push(entries[sourceIndex].term);
      }
    }
  }

  for (let index = 0; index < entries.length; index += 1) {
    if (sameTerms(entries[index].synonyms, desired[index])) continue;
    entries[index] = validatePublicEntry({
      ...entries[index],
      synonyms: desired[index],
      revision: entries[index].id === targetId ? entries[index].revision : entries[index].revision + 1,
      updatedAt: now
    });
  }
  return targetId ? entries.find((entry) => entry.id === targetId) || target : target;
}

async function api(request, response, url) {
  if (url.pathname.startsWith("/api/v1/member/")) return memberApi(request, response, url);
  if (url.pathname === "/api/v1/health" && request.method === "GET") return json(response, 200, { ok: true, ownerAuthConfigured: true, aiProvider: "cloudflare", aiEffectiveProvider: "cloudflare", aiModel: "@cf/zai-org/glm-4.7-flash", aiRetryModel: "@cf/google/gemma-4-26b-a4b-it", aiAccessMode: "cloudflare-account-quota", aiConfigured: true, aiPrimaryConfigured: true, aiFreeRetryConfigured: true, paidFallbackEnabled: false, aiDailyRequestLimit: 20 });
  if (url.pathname === "/api/v1/public/wordbook" && request.method === "GET") {
    if (cookies(request).e2e_public_fail === "1") return error(response, 503, "public_snapshot_unavailable", "即时公开源测试故障。");
    const state = runState(request);
    return json(response, 200, state.snapshot, {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4187",
      Vary: "Origin"
    });
  }
  if (url.pathname === "/api/v1/auth/login" && request.method === "GET") {
    response.writeHead(302, { Location: "/owner.html?login=ok", "Set-Cookie": "e2e_auth=owner; Path=/; HttpOnly; SameSite=Lax" });
    return response.end();
  }
  if (url.pathname === "/api/v1/session" && request.method === "GET") {
    if (!authenticated(request)) return json(response, 200, { authenticated: false });
    return json(response, 200, { authenticated: true, user: { login: "zhuodashuai", id: 156042078, avatarUrl: "/assets/icon-192.png" }, csrfToken: "e2e-csrf-token-000000000000000000000000", expiresAt: Date.now() + 3_600_000 });
  }
  if (url.pathname === "/api/v1/auth/logout" && request.method === "POST") {
    const payload = await body(request);
    if (!assertWrite(request, response, payload)) return;
    return json(response, 200, { ok: true }, { "Set-Cookie": "e2e_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" });
  }
  if (url.pathname === "/api/v1/owner/wordbook" && request.method === "GET") {
    if (!authenticated(request)) return error(response, 401, "authentication_required", "请先登录。");
    if (cookies(request).e2e_owner_delay === "1") await new Promise((resolveDelay) => setTimeout(resolveDelay, 900));
    const state = runState(request);
    return json(response, 200, { sha: state.sha, htmlUrl: "https://github.com/zhuodashuai/zhuodashuai.github.io", snapshot: state.snapshot });
  }
  if (url.pathname === "/api/v1/owner/ai/organize" && request.method === "POST") {
    const payload = await body(request);
    if (!assertWrite(request, response, payload)) return;
    if (cookies(request).e2e_ai_fail === "1") return error(response, 503, "ai_error", "AI 测试故障；草稿仍可手动填写。");
    if (cookies(request).e2e_ai_delay === "1") await new Promise((resolveDelay) => setTimeout(resolveDelay, 700));
    const entry = organizedEntry(payload.input);
    const warnings = entry.correction.status === "suggested" ? ["拼写只作为建议，发布前请选择。"] : [];
    if (cookies(request).e2e_ai_contract_break === "1") {
      entry.phonetic = "";
      warnings.push("音标已按本地校订数据锁定，不采用模型猜测。");
    }
    if (cookies(request).e2e_ai_empty_meaning === "1") {
      entry.meaning = "";
      return json(response, 200, { entry, provider: "cloudflare", warnings });
    }
    if (cookies(request).e2e_dictionary_no_examples === "1") {
      entry.senses = entry.senses.map((sense) => ({ ...sense, examples: [] }));
      entry.exampleEn = "";
      entry.exampleZh = "";
      return json(response, 200, { entry, provider: "local-dictionary", warnings, reviewRequired: false });
    }
    if (cookies(request).e2e_dictionary_review === "1") {
      entry.phonetic = "/bæŋk/";
      entry.partOfSpeech = "noun · verb";
      entry.meaning = "n. 银行；银行机构\nn. 河岸；堤岸";
      entry.definition = "n. sloping land beside a body of water\nn. a long ridge or pile";
      entry.senses = [];
      entry.usage = "【待复核】ECDICT 的中英文原始释义无法按义项可靠对齐；请核对并补全义项后再发布。";
      entry.tags = ["待复核", "ECDICT 原始释义"];
      warnings.push("【必须复核】中英文义项无法可靠逐项对齐，因此没有生成可发布的 sense；请手动核对并补全后再发布。");
      return json(response, 200, { entry, provider: "local-dictionary", warnings, reviewRequired: true });
    }
    if (entry.entryType === "quote") warnings.push("未找到可核验出处；作者和出处保持空白，状态为未核验。");
    return json(response, 200, { entry, provider: "cloudflare", warnings });
  }
  if (url.pathname === "/api/v1/owner/synonyms" && request.method === "POST") {
    const payload = await body(request);
    if (!assertWrite(request, response, payload)) return;
    const state = runState(request);
    const previous = state.snapshot.entries.find((entry) => entry.id === payload.entryId);
    if (!previous) return error(response, 404, "entry_missing", "词条已不存在，已停止识别。");
    if (!isSynonymLexicalEntry(previous)) return error(response, 400, "entry_not_lexical", "此词条类型不支持同义词识别。");
    const now = new Date().toISOString();
    const entry = validatePublicEntry({
      ...previous, revision: previous.revision + 1, updatedAt: now,
      synonymScan: { ...pendingSynonymScan(previous, state.snapshot.entries, now), status: "complete", reason: "", matches: [] }
    });
    state.snapshot = parsePublicSnapshot({
      ...state.snapshot, exportedAt: now, revisionId: crypto.randomUUID(), lastMutationId: `synonyms-${crypto.randomUUID()}`,
      entries: state.snapshot.entries.map((candidate) => candidate.id === entry.id ? entry : candidate)
    }, { allowLegacy: false });
    state.sha = createHash("sha1").update(JSON.stringify(state.snapshot)).digest("hex");
    return json(response, 200, { sha: state.sha, snapshot: state.snapshot, entry, action: "synonyms", synonymScan: entry.synonymScan });
  }
  if (url.pathname === "/api/v1/owner/publish" && request.method === "POST") {
    const payload = await body(request);
    if (!assertWrite(request, response, payload)) return;
    if (payload.clientProtocol !== "v38" || payload.queueProtocol !== "v38") {
      return error(response, 400, "owner_client_upgrade_required", "管理页面版本过旧；没有执行发布，请刷新到最新版后重新复核。 ");
    }
    if (cookies(request).e2e_github_timeout === "1") {
      return error(response, 503, "github_unreachable", "暂时无法连接 GitHub；草稿和发布任务仍保存在本机。");
    }
    const state = runState(request);
    if (state.snapshot.lastMutationId === payload.mutationId) return json(response, 200, { sha: state.sha, snapshot: state.snapshot, action: "idempotent", recovered: true });
    if (cookies(request).e2e_conflict === "1" && !state.conflictInjected) {
      state.conflictInjected = true;
      const targetId = payload.mutation.entry?.id || payload.mutation.id;
      const index = state.snapshot.entries.findIndex((entry) => entry.id === targetId);
      if (index >= 0) state.snapshot.entries[index] = { ...state.snapshot.entries[index], meaning: "远端并发修改的释义", revision: state.snapshot.entries[index].revision + 1, updatedAt: new Date().toISOString() };
      state.sha = "c".repeat(40);
      return error(response, 409, "remote_conflict", "GitHub 公开词库已变化；草稿没有覆盖远端内容。", { sha: state.sha, snapshot: state.snapshot });
    }
    if (payload.baseSha !== state.sha) return error(response, 409, "remote_conflict", "GitHub 公开词库已变化。", { sha: state.sha, snapshot: state.snapshot });
    const mutation = payload.mutation;
    let action;
    let target = null;
    let previous = null;
    const now = new Date().toISOString();
    if (mutation.type === "add") {
      const candidate = validatePublicEntry(mutation.entry);
      const duplicate = findDuplicate(state.snapshot.entries, candidate);
      if (duplicate) return error(response, 409, "duplicate_term", "词条已经存在。", { duplicate, sha: state.sha, snapshot: state.snapshot });
      state.snapshot.entries.push(candidate);
      target = candidate;
      action = "added";
    } else if (mutation.type === "update") {
      const index = state.snapshot.entries.findIndex((entry) => entry.id === mutation.entry.id);
      if (index < 0 || state.snapshot.entries[index].updatedAt !== mutation.expectedUpdatedAt) return error(response, 409, "entry_changed", "远端词条已变化。", { sha: state.sha, snapshot: state.snapshot });
      previous = state.snapshot.entries[index];
      target = validatePublicEntry({ ...mutation.entry, revision: previous.revision + 1, createdAt: previous.createdAt, updatedAt: now });
      state.snapshot.entries[index] = target;
      action = "updated";
    } else {
      const index = state.snapshot.entries.findIndex((entry) => entry.id === mutation.id);
      if (index >= 0 && state.snapshot.entries[index].updatedAt !== mutation.expectedUpdatedAt) return error(response, 409, "entry_changed", "远端词条已变化。", { sha: state.sha, snapshot: state.snapshot });
      if (index >= 0) previous = target = state.snapshot.entries.splice(index, 1)[0];
      action = "deleted";
    }
    const responseEntry = target;
    target = reconcileReciprocalSynonyms(state.snapshot.entries, action === "deleted" ? null : target, previous, now);
    state.snapshot = parsePublicSnapshot({ ...state.snapshot, exportedAt: now, revisionId: crypto.randomUUID(), lastMutationId: payload.mutationId }, { allowLegacy: false });
    state.sha = String.fromCharCode(98 + (state.snapshot.entries.length % 4)).repeat(40);
    return json(response, 200, { sha: state.sha, commitSha: "f".repeat(40), htmlUrl: "https://github.com/commit", snapshot: state.snapshot, entry: action === "deleted" ? responseEntry : target, action, recovered: false });
  }
  return error(response, 404, "api_not_found", "API not found");
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:4187");
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    if (url.pathname === "/__e2e__/append-public" && request.method === "POST") {
      const payload = await body(request);
      const term = normalizeEnglish(String(payload.term || ""));
      const state = runState(request);
      const candidate = organizedEntry(term);
      const duplicate = findDuplicate(state.snapshot.entries, candidate);
      if (duplicate) return error(response, 409, "duplicate_term", "测试词条已经存在。");
      const now = new Date().toISOString();
      state.snapshot = parsePublicSnapshot({
        ...state.snapshot,
        exportedAt: now,
        revisionId: `revision-e2e-fresh-${term}`,
        lastMutationId: `mutation-e2e-fresh-${term}`,
        entries: [...state.snapshot.entries, { ...candidate, createdAt: now, updatedAt: now }]
      }, { allowLegacy: false });
      state.sha = "e".repeat(40);
      return json(response, 200, state.snapshot);
    }
    if (url.pathname === "/data/owner-wordbook.json") {
      const snapshot = cookies(request).e2e_pages_stale === "1" ? baseline : runState(request).snapshot;
      return json(response, 200, snapshot);
    }
    const rawPath = /^\/personal\/?$/.test(url.pathname) ? "/personal.html"
      : url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
    const safe = normalize(rawPath).replace(/^(?:\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    const file = resolve(root, safe);
    if (!file.startsWith(`${root}${sep}`) && file !== root) return error(response, 403, "forbidden", "Forbidden");
    const bytes = await readFile(file);
    send(response, 200, bytes, {
      "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=0",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
  } catch (errorValue) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Not found: ${errorValue.message}`);
  }
});

server.listen(4187, "127.0.0.1", () => console.log("E2E server listening on http://127.0.0.1:4187"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
