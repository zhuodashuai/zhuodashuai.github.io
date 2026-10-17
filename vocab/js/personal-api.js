const BASE_PATH = "/api/v1/member";
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class PersonalApiError extends Error {
  constructor(message, { code = "request_failed", status = 0, details = null, retryAfter = 0 } = {}) {
    super(message);
    this.name = "PersonalApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

/** Same-origin, no-store transport. Credentials and recovery codes are never persisted. */
export function createPersonalApi({ fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  async function request(path, { method = "GET", body, csrfToken = "", expectedUserId, authType = "auto", signal } = {}) {
    if (!["auto", "member", "github-owner"].includes(authType)) throw new PersonalApiError("登录方式不正确。", { code: "invalid_auth_type" });
    if (expectedUserId !== undefined && (typeof expectedUserId !== "string" || !USER_ID.test(expectedUserId))) {
      throw new PersonalApiError("当前账号编号不正确，请重新登录。", { code: "invalid_expected_user" });
    }
    const controller = new AbortController();
    let interrupted = null;
    let rejectInterruption;
    const interruption = new Promise((_, reject) => { rejectInterruption = reject; });
    const interrupt = (code) => {
      if (interrupted) return;
      interrupted = new PersonalApiError(code === "request_timeout"
        ? "连接超时，结果尚未确认。请保留当前内容后重试。"
        : "请求已停止，结果尚未确认。", { code });
      controller.abort();
      rejectInterruption(interrupted);
    };
    const onAbort = () => interrupt("request_aborted");
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => interrupt("request_timeout"), timeoutMs);
    const operation = async () => {
      if (interrupted) throw interrupted;
      let response;
      try {
        response = await fetchImpl(`${BASE_PATH}${path}`, {
          method,
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "X-Wordbook-Auth": authType,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(expectedUserId === undefined ? {} : { "X-Member-User": expectedUserId }),
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
      } catch {
        if (interrupted) throw interrupted;
        throw new PersonalApiError("暂时无法连接，当前页面的未保存内容仍保留。", { code: "network_error" });
      }
      let payload;
      try { payload = await response.json(); }
      catch {
        if (interrupted) throw interrupted;
        throw new PersonalApiError("服务器没有返回有效结果，请稍后重试。", { code: "invalid_response", status: response.status });
      }
      if (interrupted) throw interrupted;
      if (!response.ok) {
        const error = payload?.error || {};
        throw new PersonalApiError(typeof error.message === "string" ? error.message.slice(0, 500) : "请求未完成，请重试。", {
          code: typeof error.code === "string" ? error.code : "request_failed",
          status: response.status,
          details: error.details || null,
          retryAfter: Number(response.headers?.get("retry-after") || 0)
        });
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new PersonalApiError("服务器结果格式不正确，请重试。", { code: "invalid_response" });
      }
      return payload;
    };
    try { return await Promise.race([operation(), interruption]); }
    finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  const entryPath = (id) => {
    if (typeof id !== "string" || !/^member-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error("个人词条编号不正确。");
    return `/entries/${encodeURIComponent(id)}`;
  };
  return {
    session: (options) => request("/session", options),
    register: (body, options) => request("/register", { ...options, authType: "member", method: "POST", body }),
    login: (body, options) => request("/login", { ...options, authType: "member", method: "POST", body }),
    resetPassword: (body, options) => request("/password/reset", { ...options, authType: "member", method: "POST", body }),
    logout: (csrfToken, options) => request("/logout", { ...options, method: "POST", body: {}, csrfToken }),
    entries: (options) => request("/entries", options),
    learning: (options) => request("/learning", options),
    select: (body, csrfToken, options) => request("/selections", { ...options, method: "POST", body, csrfToken }),
    review: (id, body, csrfToken, options) => request(entryPath(id).replace("/entries/", "/reviews/"), { ...options, method: "POST", body, csrfToken }),
    add: (body, csrfToken, options) => request("/entries", { ...options, method: "POST", body, csrfToken }),
    update: (id, body, csrfToken, options) => request(entryPath(id), { ...options, method: "PUT", body, csrfToken }),
    remove: (id, body, csrfToken, options) => request(entryPath(id), { ...options, method: "DELETE", body, csrfToken }),
    deleteAccount: (body, csrfToken, options) => request("/account", { ...options, method: "DELETE", body, csrfToken })
  };
}
