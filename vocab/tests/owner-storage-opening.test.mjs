import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

globalThis.BroadcastChannel = undefined;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.indexedDB = new IDBFactory();
const storage = await import("../js/owner-storage.js");

function opened(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
test.beforeEach(async () => { await storage.closeDatabaseForTests(); globalThis.indexedDB = new IDBFactory(); });
test.afterEach(async () => { await storage.closeDatabaseForTests(); });

test("blocked storage rejects visibly, closes its late connection, and permits a clean retry", async () => {
  const factory = globalThis.indexedDB;
  const blocker = await opened(factory.open(storage.DB_NAME, storage.DB_VERSION - 1));
  const requests = [];
  globalThis.indexedDB = { open(...args) { const request = factory.open(...args); requests.push(request); return request; } };
  await assert.rejects(storage.listReviewStates(), /旧页面占用/);
  assert.equal(requests.length, 1);
  const lateSuccess = new Promise((resolve) => requests[0].addEventListener("success", resolve, { once: true }));
  blocker.close(); await lateSuccess;
  assert.throws(() => requests[0].result.transaction("meta", "readonly"), { name: "InvalidStateError" });
  assert.deepEqual(await storage.listReviewStates(), []);
  assert.equal(requests.length, 2);
  assert.equal((await storage.openDatabase()).version, storage.DB_VERSION);
});

test("a transient denied open is not cached forever and cannot create a false saved record", async () => {
  const factory = globalThis.indexedDB;
  let attempts = 0;
  globalThis.indexedDB = {
    open(...args) {
      attempts += 1;
      if (attempts === 1) throw new DOMException("Temporarily denied", "SecurityError");
      return factory.open(...args);
    }
  };
  await assert.rejects(storage.listReviewStates(), /Temporarily denied/);
  assert.deepEqual(await storage.listReviewStates(), []);
  assert.equal(attempts, 2);
});
