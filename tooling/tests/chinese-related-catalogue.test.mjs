import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chineseSearchPlan, chineseSearchHeads, matchesChineseSearchEntry } from "../../vocab/js/chinese-search.js";
import { searchExpandedDictionary, searchRelatedChineseDictionary } from "../../vocab/js/expanded-dictionary.js";

const catalogue = JSON.parse(await readFile(new URL("../dictionary/chinese-related-003.json", import.meta.url), "utf8"));
const bytes = new Map();
const guide = await readFile(new URL("../../vocab/guide.html", import.meta.url), "utf8");
const bucket = value => { let hash = 2166136261; for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; } return hash % 128; };

test("the numbered batch is a bounded auditable list, not an implicit or transitive graph", () => {
  assert.equal(catalogue.schemaVersion, 1); assert.equal(catalogue.id, "chinese-related-003");
  assert.equal(catalogue.start, 55); assert.equal(catalogue.groups.length, 30);
  const terms = new Set();
  for (const [index, row] of catalogue.groups.entries()) {
    assert.equal(row.number, 55 + index); assert.ok(row.terms.length >= 2 && row.terms.length <= 4);
    assert.ok(row.heads.length >= 2 && row.heads.length <= 8);
    assert.equal(new Set(row.heads.map(head => head.normalize("NFKC").toLowerCase())).size, row.heads.length);
    assert.ok(typeof row.note === "string" && row.note.trim() && row.note.length <= 250);
    assert.ok(Array.isArray(row.forbidden) && row.forbidden.length);
    assert.ok(row.forbidden.every(head => !row.heads.includes(head)));
    for (const head of [...row.heads, ...row.forbidden]) assert.match(head, /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/u);
    for (const term of row.terms) {
      assert.match(term, /^\p{Script=Han}{2,10}$/u); assert.ok(!terms.has(term), term); terms.add(term);
      assert.deepEqual(chineseSearchPlan(term), { term, aliases: row.terms.filter(value => value !== term) });
      assert.deepEqual(chineseSearchHeads(term), row.heads); assert.ok(Object.isFrozen(chineseSearchHeads(term)));
    }
  }
  assert.equal(terms.size, 85);
  assert.equal((guide.match(/data-related-number=/gu) || []).length, 30);
  for (const row of catalogue.groups) {
    assert.ok(guide.includes(`data-related-number="${row.number}"`));
    for (const term of row.terms) assert.ok(guide.includes(term), `${row.number}: ${term} missing from user table`);
    for (const head of row.heads) assert.ok(guide.includes(head), `${row.number}: ${head} missing from user table`);
  }
});

for (const row of catalogue.groups) test(`catalogue ${row.number}: ${row.terms.join(" / ")} — every alias finds its reviewed heads without broad postings`, async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const target = new URL(url);
    assert.equal(target.protocol, "file:"); assert.equal(target.search, "");
    assert.match(target.pathname, /\/vocab\/data\/expanded-dictionary\//u);
    assert.equal(options.credentials, "omit"); assert.ok(!options.method || options.method === "GET");
    requests.push(String(target));
    if (!bytes.has(String(target))) bytes.set(String(target), readFile(target));
    return new Response(await bytes.get(String(target)));
  };
  for (const term of row.terms) for (const input of [term, term + "的", term + "地"]) {
    const direct = await searchExpandedDictionary(input, { fetchImpl });
    const related = await searchRelatedChineseDictionary(input, { fetchImpl });
    const found = [...direct.results, ...related.results], names = found.map(item => item.term);
    assert.equal(new Set(names).size, names.length, input + " repeated canonical card");
    assert.deepEqual(new Set(names), new Set(row.heads), input + " must find each reviewed real word, not merely hasMore");
    assert.equal(direct.hasMore, false); assert.equal(related.hasMore, false);
    for (const item of direct.results) assert.ok(matchesChineseSearchEntry(item.term, item.meaning, term), input + ": " + item.term);
    for (const item of related.results) {
      assert.equal(item.matchType, "related"); assert.ok(row.terms.includes(item.matchedChinese));
      assert.ok(item.matchedChinese !== term);
      assert.ok(matchesChineseSearchEntry(item.term, item.meaning, item.matchedChinese), input + ": " + item.term);
    }
    for (const head of row.forbidden) assert.ok(!names.includes(head), input + ": forbidden " + head);
  }
  assert.ok(!requests.some(url => /\/zh-\d{3}\.json$/u.test(url)), "do not download broad Chinese compound postings");
  assert.equal(requests.filter(url => url.endsWith("/manifest.json")).length, 1);
  const english = requests.filter(url => /\/en-\d{3}\.json$/u.test(url));
  assert.equal(english.length, new Set(row.heads.map(bucket)).size, "one shared validated download per canonical-key bucket");
  assert.equal(new Set(english).size, english.length);
});
