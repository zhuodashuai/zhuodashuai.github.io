import { registerHooks } from "node:module";

// Local browser fixture only. Resolve the Worker's extensionless TS imports,
// then remove the hook: browser routing/static modules keep normal resolution.
// This runs the real pure folder validation/transaction helpers, not a second
// permissive implementation of their contract. CI uses current Node 22 LTS.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/wordbook-api/src/") && /^\.\.?\//u.test(specifier) && !/\.[a-z]+$/iu.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  }
});
let helpers;
try { helpers = await import("../../../wordbook-api/src/private-folders.ts"); }
finally { hooks.deregister(); }

const transactions = new WeakMap();
async function serialized(account, operation) {
  const previous = transactions.get(account) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  transactions.set(account, current);
  await previous;
  try { return await operation(); }
  finally { release(); if (transactions.get(account) === current) transactions.delete(account); }
}

export function folderFixtureFields(path, method) {
  if (path === "folders" && method === "POST") return ["name", "mutationId"];
  if (/^folders\/[^/]+$/u.test(path) && method === "PUT") return ["name", "revision", "mutationId"];
  if (/^folders\/[^/]+$/u.test(path) && method === "DELETE") return ["revision", "mutationId"];
  if (/^folders\/[^/]+\/entries$/u.test(path) && method === "POST") return ["entryIds", "mode", "revision", "mutationId"];
  return null;
}

function transactionFor(account) {
  const records = structuredClone(account.folderFixtureRecords || new Map());
  if (account.deleted) records.set("deleted", true);
  // Share actual fixture entry identity and its mutation namespace. Folders
  // cannot manufacture entries, alter cards, or create learning records.
  for (const key of records.keys()) if (key.startsWith("entry:") || key.startsWith("mutation:") || key.startsWith("review-mutation:")) records.delete(key);
  for (const entry of account.entries) records.set(`entry:${entry.id}`, structuredClone(entry));
  for (const [id, record] of account.mutations) {
    records.set(`${record.operation.startsWith("review:") ? "review-mutation:" : "mutation:"}${id}`, { expiresAt: Date.now() + 86_400_000 });
  }
  return {
    async get(key) { return structuredClone(records.get(key)); },
    async put(key, value) {
      if (typeof key === "string") records.set(key, structuredClone(value));
      else for (const [name, item] of Object.entries(key)) records.set(name, structuredClone(item));
    },
    async delete(key) { return records.delete(key); },
    async list({ prefix = "", limit = Infinity } = {}) {
      return new Map([...records].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([key, value]) => [key, structuredClone(value)]));
    },
    commit() {
      if (account.deleted) throw Object.assign(new Error("这个个人词库已删除。"), { status: 410, code: "account_deleted" });
      account.folderFixtureRecords = records;
    }
  };
}

export async function folderFixtureMutationAvailable(account, mutationId) {
  await helpers.assertFolderMutationUnused(transactionFor(account), mutationId);
}

export async function removeFixtureEntryFromFolders(account, entryId, removeEntry) {
  return serialized(account, async () => {
    const transaction = transactionFor(account);
    await helpers.removeEntryFromPrivateFolders(transaction, entryId);
    transaction.commit();
    removeEntry();
  });
}

export function clearFixtureFolders(account) { account.folderFixtureRecords?.clear(); }

export async function handleFolderFixture({ request, response, path, payload, account, json, error }) {
  if (path !== "folders" && !path.startsWith("folders/")) return false;
  return serialized(account, () => routeFolderFixture({ request, response, path, payload, account, json, error }));
}

async function routeFolderFixture({ request, response, path, payload, account, json, error }) {
  try {
    const expectedUser = request.headers["x-member-user"];
    if (expectedUser !== undefined && expectedUser !== account.id) {
      error(response, 401, "member_session_changed", "账号已改变，请重新登录确认。"); return true;
    }
    const transaction = transactionFor(account);
    if (path === "folders" && request.method === "GET") {
      json(response, 200, await helpers.listPrivateFolders(transaction)); return true;
    }
    const parts = path.split("/");
    const folderId = parts[1];
    let action;
    if (parts.length === 1 && request.method === "POST") action = "create";
    else {
      if (!helpers.validFolderId(folderId)) { error(response, 400, "invalid_folder_id", "收藏夹 ID 不正确。"); return true; }
      if (parts.length === 2 && request.method === "PUT") action = "rename";
      else if (parts.length === 2 && request.method === "DELETE") action = "delete";
      else if (parts.length === 3 && parts[2] === "entries" && request.method === "POST") action = "entries";
      else { error(response, 404, "member_not_found", "收藏夹接口不存在。"); return true; }
    }
    if (request.headers["idempotency-key"] && request.headers["idempotency-key"] !== payload.mutationId) {
      error(response, 400, "idempotency_mismatch", "幂等键不匹配。"); return true;
    }
    const prepared = await helpers.prepareFolderMutation({ ...payload, ...(folderId ? { folderId } : {}) }, action);
    const result = await helpers.applyPrivateFolderMutation(transaction, prepared);
    transaction.commit();
    json(response, 200, result);
  } catch (failure) {
    if (!Number.isInteger(failure.status)) throw failure;
    error(response, failure.status, failure.code, failure.message, failure.details);
  }
  return true;
}
