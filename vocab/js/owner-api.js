const API_PREFIX = "/api/v1";
const READ_TIMEOUT_MS = 12_000;
const ORGANIZE_TIMEOUT_MS = 45_000;
const MUTATION_TIMEOUT_MS = 45_000;

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

async function request(path, { method = "GET", csrfToken = "", body, mutationId = "", signal, timeoutMs = READ_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timer;
  let interrupted = null;
  let rejectInterruption;
  const interruption = new Promise((_, reject) => { rejectInterruption = reject; });
  const interrupt = (code) => {
    if (interrupted) return;
    const mutation = path === "/owner/publish" || path === "/owner/synonyms";
    const organizing = path === "/owner/ai/organize";
    interrupted = new OwnerApiError(code === "request_timeout"
      ? (mutation ? "请求超时，远端结果尚未确认；本地草稿仍保留，请刷新远端核对后再显式重试。"
        : organizing ? "AI 整理超时；本地草稿仍保留，可以手动填写或显式重试。" : "读取超时，请稍后重试；本地内容仍保留。")
      : (mutation ? "请求已停止，远端结果尚未确认；请刷新远端核对，本地草稿仍保留。"
        : organizing ? "AI 整理已停止；本地草稿仍保留，可以手动填写或显式重试。" : "读取已取消，本地内容仍保留。"), { code });
    controller.abort();
    rejectInterruption(interrupted);
  };
  const onAbort = () => interrupt("request_aborted");
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  timer = setTimeout(() => interrupt("request_timeout"), Math.max(1, timeoutMs));
  const operation = async () => {
    if (interrupted) throw interrupted;
    let response;
    try {
      response = await fetch(`${API_PREFIX}${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          ...(mutationId ? { "Idempotency-Key": mutationId } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      if (interrupted) throw interrupted;
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
  };
  try {
    // The race also bounds body parsing and transports that ignore AbortSignal.
    // A late response cannot become an apparent successful owner operation.
    return await Promise.race([operation(), interruption]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function ownerLoginUrl({ remember = false } = {}) {
  return `${API_PREFIX}/auth/login${remember ? "?remember=1" : ""}`;
}

export function getSession(options) {
  return request("/session", options);
}

export function getHealth(options) {
  return request("/health", options);
}

export function logout(csrfToken) {
  return request("/auth/logout", { method: "POST", csrfToken, body: {} });
}

export function getOwnerWordbook(options) {
  return request("/owner/wordbook", options);
}

export function organizeWithAi(input, csrfToken, { allowedSynonyms = [], signal, timeoutMs = ORGANIZE_TIMEOUT_MS } = {}) {
  return request("/owner/ai/organize", { method: "POST", csrfToken, body: { input, allowedSynonyms }, signal, timeoutMs });
}

export function publishMutation(publishRequest, csrfToken, { signal, timeoutMs = MUTATION_TIMEOUT_MS } = {}) {
  return request("/owner/publish", {
    method: "POST",
    csrfToken,
    body: publishRequest,
    mutationId: publishRequest.mutationId,
    signal,
    timeoutMs
  });
}

export function recognizeEntrySynonyms(entryId, csrfToken, { signal, timeoutMs = MUTATION_TIMEOUT_MS } = {}) {
  return request("/owner/synonyms", { method: "POST", csrfToken, body: { entryId }, signal, timeoutMs });
}
