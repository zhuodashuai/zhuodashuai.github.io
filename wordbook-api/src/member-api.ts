import { ApiError, assertSameOriginWrite, clearSessionCookie, jsonResponse, parseCookies, sha256Hex } from "./security";
import {
  MEMBER_COOKIE, MEMBER_REMEMBER_SESSION_SECONDS, MEMBER_UUID, clearMemberCookie, memberAuthStub, memberCookie, memberRemember,
  assertPrivateSession, memberError, memberFields, memberInternalCall, memberSessionHash, privateOwnerStub, readMemberJson, verifyPrivateOwner,
  type MemberAuthType, type MemberEnv, type MemberIdentity
} from "./member-security";
import { prepareSelection, selectionRequest } from "./personal-selection";
import { validFolderId } from "./private-folders";

const PREFIX = "/api/v1/member";

function chosenAuthType(request: Request): MemberAuthType {
  const mode = request.headers.get("x-wordbook-auth") || "auto";
  if (!["auto", "member", "github-owner"].includes(mode)) throw new ApiError(400, "invalid_auth_type", "登录类型不正确。");
  if (mode !== "auto") return mode as MemberAuthType;
  return parseCookies(request).has(MEMBER_COOKIE) ? "member" : parseCookies(request).has("__Host-zhuo_session") ? "github-owner" : "member";
}

async function authenticationContext(request: Request, env: MemberEnv, writing: boolean): Promise<{ sessionHash: string; user: MemberIdentity; csrfToken?: string; authType: MemberAuthType }> {
  const authType = chosenAuthType(request);
  const sessionHash = await memberSessionHash(parseCookies(request).get(authType === "github-owner" ? "__Host-zhuo_session" : MEMBER_COOKIE) || "");
  const csrfToken = request.headers.get("x-csrf-token") || "";
  if (writing && !/^[A-Za-z0-9_-]{43}$/.test(csrfToken)) throw new ApiError(403, "csrf_failed", "页面验证已失效，请刷新后重试。");
  const { user } = await assertPrivateSession(env, authType, sessionHash, writing ? csrfToken : undefined);
  return { sessionHash, user, authType, ...(writing ? { csrfToken } : {}) };
}

async function authenticatedResponse(payload: Record<string, unknown>): Promise<Response> {
  const raw = payload.rawSession;
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(raw)) throw new ApiError(503, "member_auth_unavailable", "账号服务没有完成登录，请重试。");
  const { rawSession: _secret, ...view } = payload;
  const expiresAt = Number(view.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new ApiError(503, "member_auth_unavailable", "账号服务没有完成登录，请重试。");
  const seconds = Math.max(1, Math.min(MEMBER_REMEMBER_SESSION_SECONDS, Math.floor((expiresAt - Date.now()) / 1000)));
  return jsonResponse({ ...view, authType: "member" }, 200, { "Set-Cookie": memberCookie(raw, seconds) });
}

/** Project only private-entry DTOs; source contexts and review records keep their existing schema. */
function legacyEntry(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || !entry.id.startsWith("member-")) return value;
  const { partOfSpeech: _newField, ...legacy } = entry;
  return legacy;
}

async function adaptMemberFields(request: Request, response: Response): Promise<Response> {
  if (request.headers.get("X-Wordbook-Fields")?.split(",").some(field => field.trim() === "partOfSpeech")) return response;
  const payload = await response.json() as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(payload, "entry")) payload.entry = legacyEntry(payload.entry);
  if (Array.isArray(payload.entries)) payload.entries = payload.entries.map(legacyEntry);
  const error = payload.error as { details?: Record<string, unknown> } | undefined;
  if (error?.details && Object.prototype.hasOwnProperty.call(error.details, "existing")) error.details.existing = legacyEntry(error.details.existing);
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

/** All authenticated routes are same-origin. No member response grants CORS.
 * Field capabilities change only the response, never stored data, authorization or mutation identity.
 */
export async function handleMemberRequest(request: Request, env: MemberEnv, options: { readPublicSnapshot?: () => Promise<unknown> } = {}): Promise<Response | null> {
  const response = await routeMemberRequest(request, env, options);
  return response ? adaptMemberFields(request, response) : null;
}

async function routeMemberRequest(request: Request, env: MemberEnv, options: { readPublicSnapshot?: () => Promise<unknown> }): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  try {
    if (!env.MEMBER_AUTH || !env.PERSONAL_WORDBOOK || !env.SESSION_SECRET) throw new ApiError(503, "member_unavailable", "个人账号功能暂未配置。");
    if (path === `${PREFIX}/session` && request.method === "GET") {
      const authType = chosenAuthType(request);
      try {
        const sessionHash = await memberSessionHash(parseCookies(request).get(authType === "github-owner" ? "__Host-zhuo_session" : MEMBER_COOKIE) || "");
        if (authType === "github-owner") {
          // Read-assert first pins the identity before rotating an owner's CSRF.
          await assertPrivateSession(env, authType, sessionHash);
          const view = await memberInternalCall(privateOwnerStub(env), "/session/view", { sessionHash });
          return jsonResponse({ authenticated: true, user: verifyPrivateOwner(view), csrfToken: view.csrfToken, expiresAt: view.expiresAt, authType });
        }
        return jsonResponse({ ...await memberInternalCall(memberAuthStub(env), "/session/view", { sessionHash }), authType });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return jsonResponse({ authenticated: false }, 200, { "Set-Cookie": authType === "github-owner" ? clearSessionCookie() : clearMemberCookie() });
        throw error;
      }
    }
    const entryId = path.startsWith(`${PREFIX}/entries/`) ? path.slice(`${PREFIX}/entries/`.length) : "";
    if ([`${PREFIX}/entries`, `${PREFIX}/learning`, `${PREFIX}/folders`].includes(path) && request.method === "GET") {
      const auth = await authenticationContext(request, env, false);
      // An account cookie can change in a different tab without delivering a
      // broadcast. This is an expectation check only, never a tenant selector.
      const expectedUser = request.headers.get("x-member-user");
      if (expectedUser !== null && expectedUser !== auth.user.id) {
        throw new ApiError(401, "member_session_changed", "当前登录账号已变化，请重新确认身份后读取自己的词库。");
      }
      const stub = env.PERSONAL_WORDBOOK.get(env.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));
      return jsonResponse(await memberInternalCall(stub, path.endsWith("/learning") ? "/learning" : path.endsWith("/folders") ? "/folders" : "/entries", { userId: auth.user.id, sessionHash: auth.sessionHash, authType: auth.authType }));
    }
    if (!["POST", "PUT", "DELETE"].includes(request.method)) throw new ApiError(405, "method_not_allowed", "此个人词库接口不支持该方法。");
    assertSameOriginWrite(request);
    const body = await readMemberJson(request, request.method === "PUT" && entryId ? 128 * 1024 : undefined);
    if ((path === `${PREFIX}/register` || path === `${PREFIX}/login`) && request.method === "POST") {
      if (chosenAuthType(request) === "github-owner") throw new ApiError(403, "owner_account_managed_by_github", "卓本人的账号由现有 GitHub 登录管理，不需要注册普通账号。");
      memberFields(body, ["username", "password"], ["remember"]);
      memberRemember(body.remember);
      if (path.endsWith("/register") && env.MEMBER_SIGNUP_ENABLED !== "true") throw new ApiError(503, "member_signup_disabled", "新账号注册暂未开放，已有账号仍可登录。");
      const address = request.headers.get("cf-connecting-ip") || "local-development";
      const ipHash = await sha256Hex(`zhuo-member-ip-v1\0${env.SESSION_SECRET}\0${address}`);
      return authenticatedResponse(await memberInternalCall(memberAuthStub(env), path.endsWith("/register") ? "/register" : "/login", { ...body, ipHash }));
    }
    if (path === `${PREFIX}/password/reset` && request.method === "POST") {
      if (chosenAuthType(request) === "github-owner") throw new ApiError(403, "owner_account_managed_by_github", "GitHub 所有者的密码不能在这里重设。");
      memberFields(body, ["username", "recoveryCode", "newPassword"]);
      const address = request.headers.get("cf-connecting-ip") || "local-development";
      const ipHash = await sha256Hex(`zhuo-member-ip-v1\0${env.SESSION_SECRET}\0${address}`);
      return jsonResponse(await memberInternalCall(memberAuthStub(env), "/password/reset", { ...body, ipHash }), 200, { "Set-Cookie": clearMemberCookie() });
    }
    const auth = await authenticationContext(request, env, true);
    if (path === `${PREFIX}/folders` || path.startsWith(`${PREFIX}/folders/`)) {
      const expectedUser = request.headers.get("x-member-user");
      if (expectedUser !== null && expectedUser !== auth.user.id) throw new ApiError(401, "member_session_changed", "当前登录账号已变化，请重新确认身份后操作自己的收藏夹。");
      const suffix = path.slice(`${PREFIX}/folders`.length);
      const pieces = suffix ? suffix.slice(1).split("/") : [];
      const folderId = pieces[0];
      let operation: string;
      if (!suffix && request.method === "POST") {
        memberFields(body, ["name", "mutationId"]);
        operation = "/folders/create";
      } else {
        if (!validFolderId(folderId)) throw new ApiError(400, "invalid_folder_id", "收藏夹 ID 不正确。");
        if (pieces.length === 1 && request.method === "PUT") {
          memberFields(body, ["name", "revision", "mutationId"]); operation = "/folders/rename";
        } else if (pieces.length === 1 && request.method === "DELETE") {
          memberFields(body, ["revision", "mutationId"]); operation = "/folders/delete";
        } else if (pieces.length === 2 && pieces[1] === "entries" && request.method === "POST") {
          memberFields(body, ["entryIds", "mode", "revision", "mutationId"]); operation = "/folders/entries";
        } else throw new ApiError(404, "member_not_found", "收藏夹接口不存在。");
      }
      const stub = env.PERSONAL_WORDBOOK.get(env.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));
      return jsonResponse(await memberInternalCall(stub, operation, { ...body, ...(folderId ? { folderId } : {}), userId: auth.user.id,
        sessionHash: auth.sessionHash, csrfToken: auth.csrfToken, authType: auth.authType }));
    }
    if (path === `${PREFIX}/logout` && request.method === "POST") {
      memberFields(body, []);
      if (auth.authType === "github-owner") {
        await memberInternalCall(privateOwnerStub(env), "/session/delete", { sessionHash: auth.sessionHash, csrfToken: auth.csrfToken });
        return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
      }
      await memberInternalCall(memberAuthStub(env), "/logout", { sessionHash: auth.sessionHash, csrfToken: auth.csrfToken });
      return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearMemberCookie() });
    }
    if (path === `${PREFIX}/account` && request.method === "DELETE") {
      if (auth.authType === "github-owner") throw new ApiError(403, "owner_account_managed_by_github", "这里不能删除卓的 GitHub 所有者账号或其私人词库。");
      memberFields(body, ["password", "confirmation"]);
      const result = await memberInternalCall(memberAuthStub(env), "/account/delete", { ...body, sessionHash: auth.sessionHash, csrfToken: auth.csrfToken });
      return jsonResponse(result, result.deletionPending ? 202 : 200, { "Set-Cookie": clearMemberCookie() });
    }
    if (path === `${PREFIX}/selections` && request.method === "POST") {
      const selection = selectionRequest(body);
      if (!options.readPublicSnapshot) throw new ApiError(503, "public_source_unavailable", "公开词库选择服务暂未配置。");
      let trustedSnapshot: unknown;
      try { trustedSnapshot = await options.readPublicSnapshot(); }
      catch { throw new ApiError(503, "public_source_unavailable", "公开词库暂不可读取；自己的词库没有改变。"); }
      const prepared = prepareSelection(selection, trustedSnapshot);
      const stub = env.PERSONAL_WORDBOOK.get(env.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));
      return jsonResponse(await memberInternalCall(stub, "/select", { userId: auth.user.id, sessionHash: auth.sessionHash,
        csrfToken: auth.csrfToken, authType: auth.authType, prepared }));
    }
    if (path.startsWith(`${PREFIX}/reviews/`) && request.method === "POST") {
      const reviewEntryId = path.slice(`${PREFIX}/reviews/`.length);
      if (!reviewEntryId.startsWith("member-") || !MEMBER_UUID.test(reviewEntryId.slice(7))) throw new ApiError(400, "invalid_entry_id", "个人词条 ID 不正确。");
      memberFields(body, ["rating", "revision", "mutationId"]);
      const stub = env.PERSONAL_WORDBOOK.get(env.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));
      return jsonResponse(await memberInternalCall(stub, "/review", { ...body, entryId: reviewEntryId, userId: auth.user.id,
        sessionHash: auth.sessionHash, csrfToken: auth.csrfToken, authType: auth.authType }));
    }
    if ((path === `${PREFIX}/entries` && request.method === "POST") || (entryId && ["PUT", "DELETE"].includes(request.method))) {
      memberFields(body, request.method === "POST" ? ["term", "mutationId"] : request.method === "PUT" ? ["revision", "term", "mutationId"] : ["revision", "mutationId"], request.method === "DELETE" ? [] : ["partOfSpeech", "meaning", "note"]);
      if (entryId && (!entryId.startsWith("member-") || !MEMBER_UUID.test(entryId.slice(7)))) throw new ApiError(400, "invalid_entry_id", "个人词条 ID 不正确。");
      const stub = env.PERSONAL_WORDBOOK.get(env.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));
      return jsonResponse(await memberInternalCall(stub, request.method === "POST" ? "/create" : request.method === "PUT" ? "/update" : "/delete", {
        ...body, userId: auth.user.id, sessionHash: auth.sessionHash, csrfToken: auth.csrfToken, authType: auth.authType, ...(entryId ? { entryId } : {})
      }));
    }
    throw new ApiError(404, "member_not_found", "个人词库接口不存在。");
  } catch (error) { return memberError(error); }
}
