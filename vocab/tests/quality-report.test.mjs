import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const report = JSON.parse(await readFile(new URL("../quality/generated-report.json", import.meta.url), "utf8"));

test("the published quality report contains observed passing evidence", () => {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, "passed");
  assert.equal(report.summary.total, 100);
  assert.equal(report.summary.passed, 100);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.passRate, 100);
  assert.equal(report.duplicateRound.status, "passed");
  assert.equal(report.duplicateRound.finalUniqueCount, 100);
  assert.equal(report.duplicateRound.providerRequests, 0);
  assert.equal(report.network.status, "passed");
  assert.equal(report.network.requestCount, 0);
  assert.equal(report.network.unexpectedRequestCount, 0);
  assert.ok(report.categories.every((category) => category.status === "passed" && category.passed === category.total));
});
