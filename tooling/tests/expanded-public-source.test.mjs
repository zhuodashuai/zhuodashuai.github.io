import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { EXPANDED_PUBLIC_SOURCE, loadExpandedPublicSource } from "../lib/expanded-public-source.mjs";

test("the exact reviewed public source remains available independently of the live reading library", async () => {
  const source = await loadExpandedPublicSource();
  assert.equal(source.schemaVersion, 3);
  assert.equal(source.revisionId, "a23351b8-22ed-4a7b-957d-df5eebf44eb9");
  assert.equal(EXPANDED_PUBLIC_SOURCE.repositoryCommit, "fd742758b1d2b0937299063714fa42dd698a670a");
  assert(source.entries.some(entry => entry.term === "agitated"));
  assert(!source.entries.some(entry => entry.tags.includes("collection:the-forsyte-saga:chapter-1")));
});

test("a changed reviewed source is rejected even if it remains valid JSON of the same size", async () => {
  const root = await mkdtemp(join(tmpdir(), "wordbook-pinned-public-"));
  const target = join(root, EXPANDED_PUBLIC_SOURCE.file);
  try {
    await mkdir(dirname(target), { recursive: true });
    const bytes = await readFile(new URL("../dictionary/public-source/owner-wordbook-fd742758.json", import.meta.url));
    const changed = Buffer.from(bytes.toString().replace('"jab at"', '"jab ax"'));
    assert.equal(changed.length, bytes.length);
    JSON.parse(changed);
    await writeFile(target, changed);
    await assert.rejects(loadExpandedPublicSource({ root }), /digest changed/u);
    await writeFile(target, Buffer.concat([bytes, Buffer.from("\n")]));
    await assert.rejects(loadExpandedPublicSource({ root }), /size changed/u);
  } finally {
    const child = relative(tmpdir(), root);
    assert(child && !child.startsWith(".."));
    await rm(root, { recursive: true });
  }
});
