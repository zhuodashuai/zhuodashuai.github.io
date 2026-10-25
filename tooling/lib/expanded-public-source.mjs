import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// The reviewed 102,609-head dictionary has a fixed public-source input. Reading
// library edits must not renumber its canonical IDs or invalidate old examples.
// The live library and compact member lookup continue to use owner-wordbook.
export const EXPANDED_PUBLIC_SOURCE = Object.freeze({
  file: "tooling/dictionary/public-source/owner-wordbook-fd742758.json",
  bytes: 3022710,
  sha256: "4c3fb9ae6d0e0ec9cb85a0d989c677a6d7942e72d0468d73ad2dc30a1785fa4c",
  repositoryCommit: "fd742758b1d2b0937299063714fa42dd698a670a"
});

export async function loadExpandedPublicSource({ root = resolve(import.meta.dirname, "../..") } = {}) {
  const bytes = await readFile(resolve(root, EXPANDED_PUBLIC_SOURCE.file));
  assert.equal(bytes.length, EXPANDED_PUBLIC_SOURCE.bytes, "Reviewed expanded public source size changed.");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), EXPANDED_PUBLIC_SOURCE.sha256,
    "Reviewed expanded public source digest changed.");
  return JSON.parse(bytes);
}
