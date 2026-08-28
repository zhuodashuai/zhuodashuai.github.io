import assert from "node:assert/strict";
import test from "node:test";

import { isRetryableSyncError, SyncConflictError } from "../js/github-sync.js";

test("auto-sync retries transient failures but stops on conflicts or credentials", () => {
  assert.equal(isRetryableSyncError({ retryable: true }), true);
  assert.equal(isRetryableSyncError({ status: 408 }), true);
  assert.equal(isRetryableSyncError({ status: 429 }), true);
  assert.equal(isRetryableSyncError({ status: 503 }), true);
  assert.equal(isRetryableSyncError({ status: 401 }), false);
  assert.equal(isRetryableSyncError(new SyncConflictError()), false);
});
