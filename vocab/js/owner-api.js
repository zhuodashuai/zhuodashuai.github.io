const API_PREFIX = "/api/v1";

export class OwnerApiError extends Error {
  constructor(message, { status = 0, code = "request_failed", details = null, retryAfter = 0 } = {}) {
    super(message);
    this.name = "OwnerApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

async function request(path, { method = "GET", csrfToken = "", body, mutationId = "" } = {}) {
  let response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        ...(mutationId ? { "Idempotency-Key": mutationId } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    throw new OwnerApiError("网络不可用；内容仍安全保存在本机。", { code: "network_error", details: String(error) });
  }
  let payload = null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try { payload = await response.json(); } catch { /* handled below */ }
  }
  if (!response.ok) {
    const error = payload?.error || {};
    throw new OwnerApiError(error.message || `管理接口返回 ${response.status}。`, {
      status: response.status,
      code: error.code || "request_failed",
      details: error.details || null,
      retryAfter: Number(response.headers.get("retry-after") || 0)
    });
  }
  if (!payload || typeof payload !== "object") throw new OwnerApiError("管理接口没有返回有效 JSON。", { status: response.status, code: "invalid_response" });
  return payload;
}

export function ownerLoginUrl() {
  return `${API_PREFIX}/auth/login`;
}

export function getSession() {
  return request("/session");
}

export function logout(csrfToken) {
  return request("/auth/logout", { method: "POST", csrfToken, body: {} });
}

export function getOwnerWordbook() {
  return request("/owner/wordbook");
}

export function organizeWithAi(input, csrfToken) {
  return request("/owner/ai/organize", { method: "POST", csrfToken, body: { input } });
}

export function publishMutation(publishRequest, csrfToken) {
  return request("/owner/publish", {
    method: "POST",
    csrfToken,
    body: publishRequest,
    mutationId: publishRequest.mutationId
  });
}
