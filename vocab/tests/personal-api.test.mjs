import assert from "node:assert/strict";
import test from "node:test";
import { createPersonalApi, PersonalApiError } from "../js/personal-api.js";

const ENTRY_ID = "member-11111111-1111-4111-8111-111111111111";
const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });

test("member authentication is same-origin POST with untrimmed Unicode passwords and no URL secrets", async () => {
  const seen = [];
  const api = createPersonalApi({ fetchImpl: async (url, options) => { seen.push({ url, options }); return response({ authenticated: false }); } });
  const credentials = { username: "student", password: "  很长的密码🙂 passphrase with spaces  " };
  await api.register(credentials);
  await api.login(credentials);
  await api.resetPassword({ username: "student", recoveryCode: "a-recovery-code", newPassword: credentials.password });
  for (const { url, options } of seen) {
    assert.ok(url.startsWith("/api/v1/member/"));
    assert.equal(url.includes("?"), false);
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.headers["X-Wordbook-Fields"], "partOfSpeech");
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.password ?? body.newPassword, credentials.password);
    assert.equal(options.headers["X-CSRF-Token"], undefined);
  }
});

test("private CRUD and account deletion carry CSRF only in the request header", async () => {
  const seen = [];
  const api = createPersonalApi({ fetchImpl: async (url, options) => { seen.push({ url, options }); return response({ ok: true }); } });
  const mutation = { term: "by some fluke", meaning: "侥幸", note: "我的例子", mutationId: "operation-one" };
  await api.session();
  await api.entries({ expectedUserId: ENTRY_ID.slice(7) });
  await api.add(mutation, "csrf-only-header");
  await api.update(ENTRY_ID, { ...mutation, revision: 1 }, "csrf-only-header");
  await api.remove(ENTRY_ID, { revision: 1, mutationId: "operation-two" }, "csrf-only-header");
  await api.logout("csrf-only-header");
  await api.deleteAccount({ password: "a sufficiently long password", confirmation: "DELETE" }, "csrf-only-header");
  assert.deepEqual(seen.map(({ options }) => options.method), ["GET", "GET", "POST", "PUT", "DELETE", "POST", "DELETE"]);
  assert.equal(seen[0].options.headers["X-Member-User"], undefined);
  assert.equal(seen[1].options.headers["X-Member-User"], ENTRY_ID.slice(7));
  assert.equal(seen[1].url.includes(ENTRY_ID.slice(7)), false);
  for (const { options } of seen) assert.equal(options.headers["X-Wordbook-Fields"], "partOfSpeech");
  for (const { url, options } of seen.slice(2)) {
    assert.equal(options.headers["X-CSRF-Token"], "csrf-only-header");
    assert.equal(options.body.includes("csrf-only-header"), false);
    assert.equal(url.includes("csrf-only-header"), false);
  }
  assert.throws(() => api.update("../owner/publish", mutation, "csrf"), /编号不正确/);
});

test("an invalid expected account cannot send a private list request", async () => {
  let calls = 0;
  const api = createPersonalApi({ fetchImpl: async () => { calls += 1; return response({}); } });
  for (const expectedUserId of ["../owner", "", null, 123, "11111111-1111-1111-8111-111111111111"]) {
    await assert.rejects(api.entries({ expectedUserId }), (error) => error.code === "invalid_expected_user");
  }
  assert.equal(calls, 0);
});

test("member API preserves conflict details and bounded rate-limit errors", async () => {
  const existing = { id: ENTRY_ID, term: "hip" };
  const api = createPersonalApi({ fetchImpl: async () => response({ error: { code: "duplicate_entry", message: "已经收录", details: { existing } } }, 409) });
  await assert.rejects(api.add({ term: "hip" }, "csrf"), (error) => {
    assert.ok(error instanceof PersonalApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "duplicate_entry");
    assert.deepEqual(error.details.existing, existing);
    return true;
  });
  const limited = createPersonalApi({ fetchImpl: async () => response({ error: { code: "rate_limited", message: "稍后重试" } }, 429, { "Retry-After": "30" }) });
  await assert.rejects(limited.login({}), (error) => error.status === 429 && error.retryAfter === 30);
});

test("aborting a private request is bounded even if transport ignores AbortSignal", async () => {
  let complete;
  const transport = new Promise((resolve) => { complete = resolve; });
  const api = createPersonalApi({ fetchImpl: () => transport });
  const controller = new AbortController();
  const pending = api.entries({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "request_aborted");
  complete(response({ entries: [{ meaning: "不能重新出现的旧账号内容" }] }));
  await new Promise((resolve) => setImmediate(resolve));
});

test("timeouts bound a stalled response body rather than only the initial fetch", async () => {
  const api = createPersonalApi({ timeoutMs: 20, fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) });
  await assert.rejects(api.entries(), (error) => error.code === "request_timeout");
});

test("an already-aborted request cannot send credentials", async () => {
  let calls = 0;
  const api = createPersonalApi({ fetchImpl: async () => { calls += 1; return response({}); } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.login({ username: "student", password: "never send this password" }, { signal: controller.signal }), (error) => error.code === "request_aborted");
  assert.equal(calls, 0);
});

test("malformed and failed responses do not become apparent successful saves", async () => {
  const badJson = createPersonalApi({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("raw sensitive provider response"); } }) });
  await assert.rejects(badJson.add({}, "csrf"), (error) => error.code === "invalid_response" && !error.message.includes("sensitive"));
  const network = createPersonalApi({ fetchImpl: async () => { throw new Error("transport internal detail"); } });
  await assert.rejects(network.entries(), (error) => error.code === "network_error" && !error.message.includes("internal"));
  const badShape = createPersonalApi({ fetchImpl: async () => response([]) });
  await assert.rejects(badShape.session(), (error) => error.code === "invalid_response");
});
