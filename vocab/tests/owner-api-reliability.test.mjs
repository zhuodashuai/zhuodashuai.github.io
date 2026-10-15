import assert from "node:assert/strict";
import test from "node:test";
import { getHealth, getOwnerWordbook, OwnerApiError, publishMutation } from "../js/owner-api.js";

async function withFetch(fetchImpl, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { await callback(); } finally { globalThis.fetch = original; }
}

test("a read deadline aborts an unresponsive transport without retrying", async () => {
  let calls = 0;
  let signal;
  await withFetch((_url, options) => {
    calls += 1;
    signal = options.signal;
    return new Promise(() => {});
  }, async () => {
    await assert.rejects(getOwnerWordbook({ timeoutMs: 10 }), (error) =>
      error instanceof OwnerApiError && error.code === "request_timeout");
    assert.equal(signal.aborted, true);
    assert.equal(calls, 1);
  });
});

test("the deadline also bounds an unfinished JSON response body", async () => {
  await withFetch(async () => ({
    ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }),
    json: () => new Promise(() => {})
  }), async () => {
    await assert.rejects(getHealth({ timeoutMs: 10 }), { code: "request_timeout" });
  });
});

test("an unconfirmed mutation times out once and retains its idempotency key for review", async () => {
  const request = { mutationId: "review-this-unconfirmed-write", mutation: { type: "add", entry: { term: "hip" } } };
  const before = structuredClone(request);
  let calls = 0;
  await withFetch((_url, options) => {
    calls += 1;
    assert.equal(options.headers["Idempotency-Key"], request.mutationId);
    return new Promise(() => {});
  }, async () => {
    await assert.rejects(publishMutation(request, "test-csrf", { timeoutMs: 10 }), (error) =>
      error.code === "request_timeout" && /远端结果尚未确认/.test(error.message) && /显式重试/.test(error.message));
    assert.equal(calls, 1);
    assert.deepEqual(request, before);
  });
});

test("caller cancellation stops waiting even if the transport ignores AbortSignal", async () => {
  const controller = new AbortController();
  await withFetch(() => new Promise(() => {}), async () => {
    const task = publishMutation({ mutationId: "cancelled-write" }, "test-csrf", { signal: controller.signal });
    controller.abort();
    await assert.rejects(task, { code: "request_aborted" });
  });
});
