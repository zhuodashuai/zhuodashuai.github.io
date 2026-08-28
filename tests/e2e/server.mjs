import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createBlankEntry, findDuplicate, normalizeEnglish, parsePublicSnapshot, validatePublicEntry } from "../../vocab/js/wordbook-schema.js";

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
    runs.set(id, { snapshot: initial, sha: "a".repeat(40), conflictInjected: false });
  }
  return runs.get(id);
}

function json(response, status, payload, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(payload));
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

function organizedEntry(input) {
  const entry = createBlankEntry(input);
  const lower = normalizeEnglish(input);
  entry.synonyms = lower === "alleviate"
    ? ["ease", "mitigate", "soothe"]
    : lower === "ease"
      ? ["alleviate", "lessen", "relieve"]
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
  entry.partOfSpeech = lower === "hip" ? "noun · adjective" : lower === "jab at" ? "verb phrase" : "word";
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

async function api(request, response, url) {
  if (url.pathname === "/api/v1/health" && request.method === "GET") return json(response, 200, { ok: true, ownerAuthConfigured: true, aiProvider: "cloudflare", aiEffectiveProvider: "cloudflare", aiModel: "@cf/zai-org/glm-4.7-flash", aiRetryModel: "@cf/google/gemma-4-26b-a4b-it", aiAccessMode: "cloudflare-account-quota", aiConfigured: true, aiPrimaryConfigured: true, aiFreeRetryConfigured: true, paidFallbackEnabled: false, aiDailyRequestLimit: 20 });
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
      target = validatePublicEntry({ ...mutation.entry, revision: state.snapshot.entries[index].revision + 1, createdAt: state.snapshot.entries[index].createdAt, updatedAt: new Date().toISOString() });
      state.snapshot.entries[index] = target;
      action = "updated";
    } else {
      const index = state.snapshot.entries.findIndex((entry) => entry.id === mutation.id);
      if (index >= 0 && state.snapshot.entries[index].updatedAt !== mutation.expectedUpdatedAt) return error(response, 409, "entry_changed", "远端词条已变化。", { sha: state.sha, snapshot: state.snapshot });
      if (index >= 0) target = state.snapshot.entries.splice(index, 1)[0];
      action = "deleted";
    }
    state.snapshot = parsePublicSnapshot({ ...state.snapshot, exportedAt: new Date().toISOString(), revisionId: crypto.randomUUID(), lastMutationId: payload.mutationId }, { allowLegacy: false });
    state.sha = String.fromCharCode(98 + (state.snapshot.entries.length % 4)).repeat(40);
    return json(response, 200, { sha: state.sha, commitSha: "f".repeat(40), htmlUrl: "https://github.com/commit", snapshot: state.snapshot, entry: target, action, recovered: false });
  }
  return error(response, 404, "api_not_found", "API not found");
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:4187");
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    if (url.pathname === "/data/owner-wordbook.json") return json(response, 200, runState(request).snapshot);
    const rawPath = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
    const safe = normalize(rawPath).replace(/^(?:\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    const file = resolve(root, safe);
    if (!file.startsWith(`${root}${sep}`) && file !== root) return error(response, 403, "forbidden", "Forbidden");
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=0",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    response.end(bytes);
  } catch (errorValue) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Not found: ${errorValue.message}`);
  }
});

server.listen(4187, "127.0.0.1", () => console.log("E2E server listening on http://127.0.0.1:4187"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
