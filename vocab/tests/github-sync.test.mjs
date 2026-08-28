import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  OwnerConflictError,
  SyncConflictError,
  authenticateOwnerGitHub,
  connectGitHub,
  connectOwnerGitHub,
  disconnectGitHub,
  disconnectOwnerGitHub,
  isGitHubConnected,
  isOwnerGitHubConnected,
  isRetryableSyncError,
  writeOwnerPublicSnapshot
} from "../js/github-sync.js";

const originalFetch = globalThis.fetch;
const token = "github_pat_owner_test_1234567890";
const fileSha = "1111111111111111111111111111111111111111";
const nextSha = "2222222222222222222222222222222222222222";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function encodedSnapshot(entries = [{
  id: "public-hip",
  term: "hip",
  meaning: "髋；臀部",
  entryType: "word",
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z"
}]) {
  return Buffer.from(JSON.stringify({ schemaVersion: 2, updatedAt: "2026-08-27T00:00:00.000Z", entries })).toString("base64");
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  disconnectGitHub();
  disconnectOwnerGitHub();
});

test("auto-sync retries transient failures but stops on conflicts or credentials", () => {
  assert.equal(isRetryableSyncError({ retryable: true }), true);
  assert.equal(isRetryableSyncError({ status: 408 }), true);
  assert.equal(isRetryableSyncError({ status: 429 }), true);
  assert.equal(isRetryableSyncError({ status: 503 }), true);
  assert.equal(isRetryableSyncError({ status: 401 }), false);
  assert.equal(isRetryableSyncError(new SyncConflictError()), false);
});

test("private backup and owner publishing keep independent in-memory credentials", () => {
  connectGitHub("github_pat_private_test_123456789");
  connectOwnerGitHub(token);
  assert.equal(isGitHubConnected(), true);
  assert.equal(isOwnerGitHubConnected(), true);
  disconnectOwnerGitHub();
  assert.equal(isOwnerGitHubConnected(), false);
  assert.equal(isGitHubConnected(), true);
});

test("owner authentication pins the numeric user and repository identities before loading the live SHA", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/user")) return response({ login: "zhuodashuai", id: 156042078, avatar_url: "https://example.test/avatar.png" });
    if (String(url).endsWith("/repos/zhuodashuai/zhuodashuai.github.io")) return response({
      id: 1309360291,
      full_name: "zhuodashuai/zhuodashuai.github.io",
      owner: { id: 156042078 },
      default_branch: "main",
      fork: false,
      archived: false,
      disabled: false,
      permissions: { push: true }
    });
    if (String(url).includes("/branches/main")) return response({ name: "main" });
    if (String(url).includes("/contents/vocab/data/owner-wordbook.json")) return response({
      type: "file",
      sha: fileSha,
      html_url: "https://github.com/zhuodashuai/zhuodashuai.github.io/blob/main/vocab/data/owner-wordbook.json",
      content: encodedSnapshot()
    });
    throw new Error(`unexpected URL ${url}`);
  };
  connectOwnerGitHub(token);
  const result = await authenticateOwnerGitHub();
  assert.equal(result.login, "zhuodashuai");
  assert.equal(result.sha, fileSha);
  assert.equal(result.snapshot.entries.length, 1);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.options.headers.Authorization === `Bearer ${token}`));
});

test("owner authentication rejects a token belonging to another GitHub account", async () => {
  globalThis.fetch = async () => response({ login: "visitor", id: 99 });
  connectOwnerGitHub(token);
  await assert.rejects(authenticateOwnerGitHub(), /不是卓同学的 GitHub 账号/);
});

test("owner authentication fails closed when the public file contains duplicate ids", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/user")) return response({ login: "zhuodashuai", id: 156042078 });
    if (String(url).endsWith("/repos/zhuodashuai/zhuodashuai.github.io")) return response({
      id: 1309360291,
      full_name: "zhuodashuai/zhuodashuai.github.io",
      owner: { id: 156042078 },
      default_branch: "main",
      fork: false,
      permissions: { push: true }
    });
    if (String(url).includes("/branches/main")) return response({ name: "main" });
    const duplicate = {
      id: "public-duplicate",
      term: "hip",
      meaning: "髋；臀部",
      entryType: "word"
    };
    return response({ type: "file", sha: fileSha, content: encodedSnapshot([duplicate, { ...duplicate, term: "waist" }]) });
  };
  connectOwnerGitHub(token);
  await assert.rejects(authenticateOwnerGitHub(), /缺失或重复的词条编号/);
});

test("owner publishing uses the live SHA and strips personal-only fields", async () => {
  let putBody = null;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "PUT") {
      putBody = JSON.parse(options.body);
      return response({
        content: { sha: nextSha, html_url: "https://github.com/example/file" },
        commit: { sha: "3333333333333333333333333333333333333333" }
      });
    }
    return response({ type: "file", sha: fileSha, content: encodedSnapshot() });
  };
  connectOwnerGitHub(token);
  const result = await writeOwnerPublicSnapshot([{
    id: "public-accommodate",
    term: "accommodate",
    meaning: "容纳；适应",
    entryType: "word",
    rawInput: "accomodate",
    note: "private",
    history: [{ at: "2026-08-27T00:00:00.000Z", rating: "good" }],
    review: { level: 2, dueAt: "2026-08-28T00:00:00.000Z" },
    correction: { status: "autocorrected", original: "accomodate", chosen: "accommodate", confidence: 1, candidates: ["accommodate"], source: "ECDICT" },
    quality: { status: "trusted", autoSave: false, source: "卓同学确认" }
  }], fileSha);
  assert.equal(putBody.sha, fileSha);
  assert.equal(putBody.branch, "main");
  const document = JSON.parse(Buffer.from(putBody.content, "base64").toString("utf8"));
  assert.equal(document.owner.profileUrl, "https://zhuodashuai.github.io/");
  assert.equal(document.entries.length, 1);
  assert.equal(document.entries[0].rawInput, undefined);
  assert.equal(document.entries[0].note, undefined);
  assert.equal(document.entries[0].history, undefined);
  assert.equal(document.entries[0].review, undefined);
  assert.equal(document.entries[0].correction.original, "accomodate");
  assert.equal(document.entries[0].correction.candidates, undefined);
  assert.equal(result.sha, nextSha);
  assert.equal(result.recovered, false);
});

test("a stale public SHA aborts before PUT", async () => {
  let putCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "PUT") putCount += 1;
    return response({ type: "file", sha: nextSha, content: encodedSnapshot() });
  };
  connectOwnerGitHub(token);
  await assert.rejects(writeOwnerPublicSnapshot([], fileSha), OwnerConflictError);
  assert.equal(putCount, 0);
});

test("a remote correction alias cannot collide with another public term", async () => {
  const entries = [{
    id: "public-accommodate",
    term: "accommodate",
    meaning: "容纳；适应",
    entryType: "word",
    correction: { status: "autocorrected", original: "accomodate", chosen: "accommodate", confidence: 1, source: "ECDICT" }
  }, {
    id: "public-accomodate",
    term: "accomodate",
    meaning: "错误拼写占位",
    entryType: "word"
  }];
  globalThis.fetch = async () => response({ type: "file", sha: fileSha, content: encodedSnapshot(entries) });
  connectOwnerGitHub(token);
  await assert.rejects(writeOwnerPublicSnapshot([], fileSha), /纠错别名发生冲突/);
});

test("a lost PUT response is reconciled when the intended public snapshot reached GitHub", async () => {
  let phase = 0;
  let committedDocument = null;
  globalThis.fetch = async (url, options = {}) => {
    phase += 1;
    if (options.method === "PUT") {
      committedDocument = JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8"));
      throw new TypeError("connection closed after upload");
    }
    if (phase >= 3) {
      return response({
        type: "file",
        sha: nextSha,
        html_url: "https://github.com/example/file",
        content: Buffer.from(JSON.stringify(committedDocument)).toString("base64")
      });
    }
    return response({ type: "file", sha: fileSha, content: encodedSnapshot() });
  };
  connectOwnerGitHub(token);
  const result = await writeOwnerPublicSnapshot([{
    id: "public-jab-at",
    term: "jab at",
    meaning: "猛戳；挖苦",
    entryType: "phrase"
  }], fileSha);
  assert.equal(result.recovered, true);
  assert.equal(result.sha, nextSha);
});

test("a successful PUT without content sha is verified by reading the committed file", async () => {
  let phase = 0;
  let committedDocument = null;
  globalThis.fetch = async (url, options = {}) => {
    phase += 1;
    if (options.method === "PUT") {
      committedDocument = JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8"));
      return response({ commit: { sha: "3333333333333333333333333333333333333333" } });
    }
    if (phase >= 3) {
      return response({
        type: "file",
        sha: nextSha,
        html_url: "https://github.com/example/file",
        content: Buffer.from(JSON.stringify(committedDocument)).toString("base64")
      });
    }
    return response({ type: "file", sha: fileSha, content: encodedSnapshot() });
  };
  connectOwnerGitHub(token);
  const result = await writeOwnerPublicSnapshot([{
    id: "public-hip",
    term: "hip",
    meaning: "髋；臀部",
    entryType: "word"
  }], fileSha);
  assert.equal(result.recovered, true);
  assert.equal(result.sha, nextSha);
});

test("a branch-protection 422 remains an actionable GitHub error instead of being mislabeled as a SHA conflict", async () => {
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "PUT") return response({ message: "Changes must be made through a pull request" }, 422);
    return response({ type: "file", sha: fileSha, content: encodedSnapshot() });
  };
  connectOwnerGitHub(token);
  await assert.rejects(async () => {
    try {
      await writeOwnerPublicSnapshot([], fileSha);
    } catch (error) {
      assert.equal(error instanceof OwnerConflictError, false);
      throw error;
    }
  }, /pull request/);
});
