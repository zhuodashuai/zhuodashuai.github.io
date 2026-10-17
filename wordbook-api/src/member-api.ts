import { ApiError, assertSameOriginWrite, jsonResponse, parseCookies, sha256Hex } from "./security";
import {
  MEMBER_COOKIE, MEMBER_SESSION_SECONDS, MEMBER_UUID, clearMemberCookie, memberAuthStub, memberCookie,
  memberError, memberFields, memberInternalCall, memberSessionHash, readMemberJson, type MemberEnv, type MemberIdentity
} from "./member-security";

const PREFIX = "/api/v1/member";

async function authenticationContext(request: Request, env: MemberEnv, writing: boolean): Promise<{ sessionHash: string; user: MemberIdentity; csrfToken?: string }> {
  const sessionHash = await memberSessionHash(parseCookies(request).get(MEMBER_COOKIE) || "");
  const csrfToken = request.headers.get("x-csrf-token") || "";
  if (writing && !/^[A-Za-z0-9_-]{43}$/.test(csrfToken)) throw new ApiError(403, "csrf_failed", "页面验证已失效，请刷新后重试。");
  const view = await memberInternalCall(memberAuthStub(env), "/session/assert", { sessionHash, ...(writing ? { csrfToken } : {}) });
  const user = view.user as MemberIdentity | undefined;
  if (!user || !MEMBER_UUID.test(user.id) || typeof user.username !== "string") throw new ApiError(401, "member_authentication_required", "请重新登录自己的账号。");
  return { sessionHash, user, ...(writing ? { csrfToken } : {}) };
}

async function authenticatedResponse(payload: Record<string, unknown>): Promise<Response> {
  const raw = payload.rawSession;
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(raw)) throw new ApiError(503, "member_auth_unavailable", "账号服务没有完成登录，请重试。");
  const { rawSession: _secret, ...view } = payload;
  return jsonResponse(view, 200, { "Set-Cookie": memberCookie(raw, MEMBER_SESSION_SECONDS) });
}

/** All authenticated routes are same-origin. No member response grants CORS. */
export async function handleMemberRequest(request: Request, env: MemberEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  try {
    if (!env.MEMBER_AUTH || !env.PERSONAL_WORDBOOK || !env.SESSION_SECRET) throw new ApiError(503, "member_unavailable", "个人账号功能暂未配置。");
    if (path === `${PREFIX}/session` && request.method === "GET") {
      try {
        const sessionHash = await memberSessionHash(parseCookies(request).get(MEMBER_COOKIE) || "");
        return jsonResponse(await memberInternalCall(memberAuthStub(env), "/session/view", { sessionHash }));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return jsonResponse({ authenticated: false }, 200, { "Set-Cookie": clearMemberCookie() });
        throw error;
      }
    }
    const entryId = path.startsWith(`${PREFIX}/entries/`) ? path.slice(`${PREFIX}/entries/`.length) : "";
    if (path === `${PREFIX}/entries` && request.method === "GET") {
      const auth = await authenticationContext(request, env, false);
      // An account cookie can change in a different tab without delivering a
      // broadcast. This is an expectation check only, never a tenant selector.
      const expectedUser = request.headers.get("x-member-user");
      if (expectedUser !== null && expectedUser !== auth.user.id) {
        throw new ApiError(401, "member_session_changed", "当前登录账号已变化，请重新确认身份后读取自己的词库。");
      }
      const stub = env.PERSONAL_WORDBOOK.get(env.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));
      return jsonResponse(await memberInternalCall(stub, "/entries", { userId: auth.user.id, sessionHash: auth.sessionHash }));
    }
    if (!["POST", "PUT", "DELETE"].includes(request.method)) throw new ApiError(405, "method_not_allowed", "此个人词库接口不支持该方法。");
    assertSameOriginWrite(request);
    const body = await readMemberJson(request);
    if ((path === `${PREFIX}/register` || path === `${PREFIX}/login`) && request.method === "POST") {
      memberFields(body, ["username", "password"]);
      if (path.endsWith("/register") && env.MEMBER_SIGNUP_ENABLED !== "true") throw new ApiError(503, "member_signup_disabled", "新账号注册暂未开放，已有账号仍可登录。");
      const address = request.headers.get("cf-connecting-ip") || "local-development";
      const ipHash = await sha256Hex(`zhuo-member-ip-v1\0${env.SESSION_SECRET}\0${address}`);
      return authenticatedResponse(await memberInternalCall(memberAuthStub(env), path.endsWith("/register") ? "/register" : "/login", { ...body, ipHash }));
    }
    if (path === `${PREFIX}/password/reset` && request.method === "POST") {
      memberFields(body, ["username", "recoveryCode", "newPassword"]);
      const address = request.headers.get("cf-connecting-ip") || "local-development";
      const ipHash = await sha256Hex(`zhuo-member-ip-v1\0${env.SESSION_SECRET}\0${address}`);
      return jsonResponse(await memberInternalCall(memberAuthStub(env), "/password/reset", { ...body, ipHash }), 200, { "Set-Cookie": clearMemberCookie() });
    }
    const auth = await authenticationContext(request, env, true);
    if (path === `${PREFIX}/logout` && request.method === "POST") {
      memberFields(body, []);
      await memberInternalCall(memberAuthStub(env), "/logout", { sessionHash: auth.sessionHash, csrfToken: auth.csrfToken });
      return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearMemberCookie() });
    }
    if (path === `${PREFIX}/account` && request.method === "DELETE") {
      memberFields(body, ["password", "confirmation"]);
      const result = await memberInternalCall(memberAuthStub(env), "/account/delete", { ...body, sessionHash: auth.sessionHash, csrfToken: auth.csrfToken });
      return jsonResponse(result, result.deletionPending ? 202 : 200, { "Set-Cookie": clearMemberCookie() });
    }
    if ((path === `${PREFIX}/entries` && request.method === "POST") || (entryId && ["PUT", "DELETE"].includes(request.method))) {
      memberFields(body, request.method === "POST" ? ["term", "mutationId"] : request.method === "PUT" ? ["revision", "term", "mutationId"] : ["revision", "mutationId"], request.method === "DELETE" ? [] : ["meaning", "note"]);
      if (entryId && (!entryId.startsWith("member-") || !MEMBER_UUID.test(entryId.slice(7)))) throw new ApiError(400, "invalid_entry_id", "个人词条 ID 不正确。");
      const stub = env.PERSONAL_WORDBOOK.get(env.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));
      return jsonResponse(await memberInternalCall(stub, request.method === "POST" ? "/create" : request.method === "PUT" ? "/update" : "/delete", {
        ...body, userId: auth.user.id, sessionHash: auth.sessionHash, csrfToken: auth.csrfToken, ...(entryId ? { entryId } : {})
      }));
    }
    throw new ApiError(404, "member_not_found", "个人词库接口不存在。");
  } catch (error) { return memberError(error); }
}
