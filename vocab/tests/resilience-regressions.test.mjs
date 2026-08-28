import assert from "node:assert/strict";
import test from "node:test";

import { organizeWithAi, OwnerApiError, publishMutation } from "../js/owner-api.js";
import { enrichResolved, lookupTerm, resolveSpelling } from "../js/services.js";
import { classifySyncFailure } from "../js/sync-logic.js";
import {
  classifyInput,
  createBlankEntry,
  findDuplicate,
  normalizeEnglish,
  validateEnglishInput
} from "../js/wordbook-schema.js";

async function withFetch(fetchImpl, operation) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await operation();
  } finally {
    globalThis.fetch = previous;
  }
}

test("dictionary and spelling-provider outages preserve the exact input as an incomplete manual draft", async () => {
  const resolution = await resolveSpelling("florptastic", {
    offline: false,
    coreLookup: async () => null,
    dictionaryLookup: async () => { throw new Error("dictionary unavailable"); },
    languageToolLookup: async () => { throw new Error("spell checker unavailable"); }
  });
  assert.equal(resolution.original, "florptastic");
  assert.equal(resolution.chosen, "florptastic");
  assert.equal(resolution.correction.status, "unchecked");
  assert.match(resolution.warnings.join(" "), /Wiktionary|拼写建议服务/);

  const draft = await enrichResolved(resolution, {
    offline: false,
    coreLookup: async () => null,
    dictionaryLookup: async () => { throw new Error("dictionary unavailable"); }
  });
  assert.equal(draft.term, "florptastic");
  assert.equal(draft.meaning, "");
  assert.equal(draft.needsAttention, true);
  assert.equal(draft.quality.autoSave, false);
  assert.equal(draft.sourceUrl, "");
});

test("translation and attribution-provider outages keep a quotation editable and unverified", async () => {
  const quote = "Courage grows quietly before anyone notices.";
  const draft = await lookupTerm(quote, {
    offline: false,
    forceEntryType: "quote",
    translationLookup: async () => { throw new Error("translation unavailable"); },
    wikiquoteLookup: async () => { throw new Error("search unavailable"); }
  });
  assert.equal(draft.term, quote);
  assert.equal(draft.meaning, "");
  assert.equal(draft.attributionStatus, "unverified");
  assert.equal(draft.author, "");
  assert.equal(draft.sourceUrl, "");
  assert.equal(draft.needsAttention, true);
  assert.match(draft.warnings.join(" "), /翻译暂时不可用|出处搜索暂时不可用/);
});

test("owner API converts a rejected request into a stable network error", async () => {
  await withFetch(async () => {
    throw new DOMException("The operation timed out", "TimeoutError");
  }, async () => {
    await assert.rejects(
      organizeWithAi("hip", "csrf-test"),
      (error) => error instanceof OwnerApiError
        && error.status === 0
        && error.code === "network_error"
        && /网络不可用/.test(error.message)
    );
  });
});

test("owner AI requests carry only the browser-computed synonym allowlist", async () => {
  await withFetch(async (url, init) => {
    assert.equal(url, "/api/v1/owner/ai/organize");
    assert.deepEqual(JSON.parse(init.body), { input: "ease", allowedSynonyms: ["alleviate"] });
    return Response.json({ ok: true });
  }, async () => {
    await organizeWithAi("ease", "csrf-test", { allowedSynonyms: ["alleviate"] });
  });
});

test("owner API rejects non-JSON 200 and exposes retry metadata on 429", async () => {
  await withFetch(async () => new Response("not json", {
    status: 200,
    headers: { "Content-Type": "text/plain" }
  }), async () => {
    await assert.rejects(
      organizeWithAi("hip", "csrf-test"),
      (error) => error instanceof OwnerApiError && error.code === "invalid_response"
    );
  });

  await withFetch(async () => Response.json({
    error: { code: "github_rate_limited", message: "请稍后重试。" }
  }, {
    status: 429,
    headers: { "Retry-After": "37" }
  }), async () => {
    await assert.rejects(
      publishMutation({ clientProtocol: "v38", queueProtocol: "v38", mutationId: "mutation-test-0001" }, "csrf-test"),
      (error) => error instanceof OwnerApiError
        && error.status === 429
        && error.code === "github_rate_limited"
        && error.retryAfter === 37
    );
  });
});

test("sync failure classification distinguishes auth, conflict, transient and terminal errors", () => {
  for (const error of [
    { code: "network_error" },
    { status: 408 },
    { status: 425 },
    { status: 429 },
    { status: 500 },
    { status: 503 }
  ]) {
    assert.deepEqual(classifySyncFailure(error), { state: "retry_wait", retryable: true }, JSON.stringify(error));
  }
  for (const status of [401, 403]) {
    assert.deepEqual(classifySyncFailure({ status }), { state: "awaiting_auth", retryable: false });
  }
  for (const status of [409, 412]) {
    assert.deepEqual(classifySyncFailure({ status }), { state: "conflict", retryable: false });
  }
  assert.deepEqual(classifySyncFailure({ status: 400 }), { state: "failed", retryable: false });
});

test("browser normalization deduplicates ordinary hip variants while preserving display input", () => {
  const existing = createBlankEntry("hip");
  for (const raw of ["hip", " Hip ", "HIP", "hip!", '"hip"', "“hip”"]) {
    const candidate = createBlankEntry(raw);
    assert.equal(normalizeEnglish(raw), "hip", raw);
    assert.equal(candidate.normalized, "hip", raw);
    assert.equal(candidate.originalInput, validateEnglishInput(raw), raw);
    assert.equal(classifyInput(raw), "word", raw);
    assert.equal(findDuplicate([existing], candidate)?.id, existing.id, raw);
  }
  assert.equal(normalizeEnglish("Knowledge is power."), "knowledge is power.");
  assert.equal(classifyInput("Knowledge is power."), "quote");
});

test("browser validation rejects unsupported and adversarial input before owner workflow work", () => {
  for (const raw of [
    "",
    "   ",
    "12345",
    "🧠✨",
    "学习",
    "hello世界",
    "<script>alert(1)</script>",
    "<b>hip</b>",
    "javascript:alert(1)",
    "hip\u0000"
  ]) {
    assert.throws(() => validateEnglishInput(raw), undefined, JSON.stringify(raw));
  }
  assert.equal(validateEnglishInput("a"), "a");
  assert.equal(validateEnglishInput("a".repeat(2000)).length, 2000);
  assert.throws(() => validateEnglishInput("a".repeat(2001)));
});
