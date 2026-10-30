import assert from "node:assert/strict";
import test from "node:test";
import { searchExpandedDictionary } from "../../vocab/js/expanded-dictionary.js";
import { assertAuditableChineseRow, sharedChineseTransport } from "./helpers/general-chinese-search-contract.mjs";

test("the corpus audit rejects a real source word promoted only by an unrelated co-definition anchor", async () => {
  const found = await searchExpandedDictionary("brook", sharedChineseTransport);
  const row = found.results.find(item => item.term === "brook"); assert(row);
  assert(!row.meaning.includes("目的地"));
  await assert.rejects(assertAuditableChineseRow("目的地", { ...row, matchType: "related", matchedChinese: "小溪" }),
    /literal source evidence or a declared whole alias/u);
});

test("the shared corpus transport rejects writes, query transmission and files outside immutable public descriptors", async () => {
  const before = sharedChineseTransport.requests.length;
  const manifest = new URL("../../vocab/data/expanded-dictionary/manifest.json", import.meta.url);
  await assert.rejects(sharedChineseTransport.fetchImpl(manifest, { credentials: "omit", method: "POST" }), /never write/u);
  const withQuery = new URL(manifest); withQuery.search = "q=fixture";
  await assert.rejects(sharedChineseTransport.fetchImpl(withQuery, { credentials: "omit" }));
  await assert.rejects(sharedChineseTransport.fetchImpl(new URL("../../vocab/data/owner-wordbook.json", import.meta.url), { credentials: "omit" }),
    /exact published source/u);
  assert.equal(sharedChineseTransport.requests.length, before);
});
