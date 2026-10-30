import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chineseSearchPlan, chineseSearchHeads } from "../../vocab/js/chinese-search.js";
import { allChineseResults, assertAuditableChineseRow, sharedChineseTransport } from "./helpers/general-chinese-search-contract.mjs";

const batches = await Promise.all(["003", "004"].map(async id => JSON.parse(await readFile(new URL(`../dictionary/chinese-related-${id}.json`, import.meta.url), "utf8"))));
const bytes = new Map();
const guide = await readFile(new URL("../../vocab/guide.html", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../../vocab/data/expanded-dictionary/manifest.json", import.meta.url), "utf8"));
const bucket = value => { let hash = 2166136261; for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; } return hash % 128; };
const escapeHtml = value => value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");

for (const [index, catalogue] of batches.entries()) test(`numbered batch ${catalogue.id} is a bounded auditable list, not an implicit or transitive graph`, () => {
  const id = String(index + 3).padStart(3, "0"), start = 55 + index * 30;
  assert.equal(catalogue.schemaVersion, 1); assert.equal(catalogue.id, `chinese-related-${id}`);
  assert.equal(catalogue.start, start); assert.equal(catalogue.groups.length, 30);
  const terms = new Set(), table = guide.match(new RegExp(`<table\\b[^>]*data-related-batch="${id}"[^>]*>([\\s\\S]*?)<\\/table>`, "u"))?.[1];
  assert.ok(table, `${id}: a distinct labelled manual table must remain available`);
  assert.equal((table.match(/data-related-number=/gu) || []).length, 30);
  for (const [index, row] of catalogue.groups.entries()) {
    assert.equal(row.number, start + index); assert.ok(row.terms.length >= 2 && row.terms.length <= 4);
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
    const html = table.match(new RegExp(`<tr data-related-number="${row.number}">([\\s\\S]*?)<\\/tr>`, "u"))?.[1];
    assert.ok(html, `${row.number}: missing manual row`);
    assert.ok(html.includes(`<th scope="row">${row.number}</th>`), `${row.number}: manual numbering drift`);
    assert.ok(html.includes(`<a href="dictionary.html#q=${encodeURIComponent(row.terms[0])}">${row.terms[0]}</a>${row.terms.slice(1).map(term => "／" + term).join("")}`), `${row.number}: manual query link or aliases drift`);
    assert.ok(html.includes(`<span class="related-heads">${escapeHtml(row.heads.join(" / "))}</span>`), `${row.number}: manual reviewed heads drift`);
    assert.ok(html.includes(`<small>${escapeHtml(row.note)}</small>`), `${row.number}: manual note must match the latest reviewed fixture`);
  }
  assert.equal(terms.size, id === "003" ? 85 : 69);
  if (id === "004") {
    const heads = catalogue.groups.flatMap(row => row.heads);
    assert.equal(heads.length, 100); assert.equal(new Set(heads).size, 98);
  }
});

test("both reviewed batches retain 60 consecutive distinct manual rows without duplicate identifiers", () => {
  const numbers = [...guide.matchAll(/data-related-number="(\d+)"/gu)].map(match => Number(match[1]));
  assert.deepEqual(numbers, Array.from({ length: 60 }, (_, index) => index + 55));
  const allTerms = batches.flatMap(catalogue => catalogue.groups.flatMap(row => row.terms));
  assert.equal(new Set(allTerms).size, allTerms.length, "aliases cannot silently overwrite another reviewed batch");
});

for (const catalogue of batches) for (const row of catalogue.groups) test(`catalogue ${row.number}: ${row.terms.join(" / ")} — every alias retains reviewed heads inside complete source-ranked pages`, async () => {
  for (const head of row.forbidden) {
    const descriptor = manifest.english.shards[bucket(head.normalize("NFKC").toLowerCase())];
    const target = new URL(`../../vocab/data/expanded-dictionary/${descriptor.file}`, import.meta.url);
    if (!bytes.has(String(target))) bytes.set(String(target), readFile(target));
    const shard = JSON.parse((await bytes.get(String(target))).toString("utf8"));
    assert.ok(shard.records.some(record => record.term.normalize("NFKC").toLowerCase() === head.normalize("NFKC").toLowerCase()), head + ": a rejected example must be a real existing word, not a missing fixture");
  }
  for (const term of row.terms) for (const input of [term, term + "的", term + "地"]) {
    const complete = await allChineseResults(input), found = complete.results, names = found.map(item => item.term);
    if (input === term || complete.normalizedQuery === term) {
      for (const head of row.heads) assert.ok(names.includes(head), `${input}: every reviewed head must remain reachable across the complete pages: ${head}`);
    }
    for (const item of found) await assertAuditableChineseRow(input, item);
    for (const forbidden of row.forbidden) {
      const item = found.find(result => result.term === forbidden);
      if (item) assert.ok(!item.matchedSense && !item.matchedSourceEvidence && !item.matchedExampleSenseEvidence,
        `${input}/${forbidden}: a separate legitimate source sense must not inherit the rejected catalogue scope`);
    }
  }
  assert.ok(sharedChineseTransport.requests.filter(url => /\.bin$/u.test(url)).length <= 1,
    "all reviewed batches reuse one authenticated global ranking catalogue");
});
