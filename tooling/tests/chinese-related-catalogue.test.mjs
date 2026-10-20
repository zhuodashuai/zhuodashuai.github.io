import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chineseSearchPlan, chineseSearchHeads, matchesChineseSearchEntry } from "../../vocab/js/chinese-search.js";
import { searchExpandedDictionary, searchRelatedChineseDictionary } from "../../vocab/js/expanded-dictionary.js";

const batches = await Promise.all(["003", "004"].map(async id => JSON.parse(await readFile(new URL(`../dictionary/chinese-related-${id}.json`, import.meta.url), "utf8"))));
const bytes = new Map();
const guide = await readFile(new URL("../../vocab/guide.html", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../../vocab/data/expanded-dictionary/manifest.json", import.meta.url), "utf8"));
const provenance = Object.values(manifest.sources);
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

for (const catalogue of batches) for (const row of catalogue.groups) test(`catalogue ${row.number}: ${row.terms.join(" / ")} — every alias finds its reviewed heads without broad postings`, async () => {
  for (const head of row.forbidden) {
    const descriptor = manifest.english.shards[bucket(head.normalize("NFKC").toLowerCase())];
    const target = new URL(`../../vocab/data/expanded-dictionary/${descriptor.file}`, import.meta.url);
    if (!bytes.has(String(target))) bytes.set(String(target), readFile(target));
    const shard = JSON.parse((await bytes.get(String(target))).toString("utf8"));
    assert.ok(shard.records.some(record => record.term.normalize("NFKC").toLowerCase() === head.normalize("NFKC").toLowerCase()), head + ": a rejected example must be a real existing word, not a missing fixture");
  }
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
    const startRequest = requests.length;
    const direct = await searchExpandedDictionary(input, { fetchImpl });
    const related = await searchRelatedChineseDictionary(input, { fetchImpl });
    const found = [...direct.results, ...related.results], names = found.map(item => item.term);
    assert.equal(new Set(names).size, names.length, input + " repeated canonical card");
    assert.deepEqual(new Set(names), new Set(row.heads), input + " must find each reviewed real word, not merely hasMore");
    assert.equal(direct.hasMore, false); assert.equal(related.hasMore, false);
    for (const item of found) assert.ok(provenance.some(source => item.source === source.name && item.license === source.license && item.url === source.url), input + ": retain the real definition's source and license");
    for (const item of direct.results) assert.ok(matchesChineseSearchEntry(item.term, item.meaning, term), input + ": " + item.term);
    for (const item of related.results) {
      assert.equal(item.matchType, "related"); assert.ok(row.terms.includes(item.matchedChinese));
      assert.ok(item.matchedChinese !== term);
      assert.ok(matchesChineseSearchEntry(item.term, item.meaning, item.matchedChinese), input + ": " + item.term);
    }
    for (const head of row.forbidden) assert.ok(!names.includes(head), input + ": forbidden " + head);
    const queryRequests = requests.slice(startRequest);
    assert.ok(queryRequests.every(url => !/\/zh-\d{3}\.json$/u.test(url)), input + ": no broad Chinese-posting downloads");
    assert.ok(queryRequests.filter(url => /\/en-\d{3}\.json$/u.test(url)).length <= new Set(row.heads.map(bucket)).size, input + ": bounded headword shard budget");
  }
  assert.ok(!requests.some(url => /\/zh-\d{3}\.json$/u.test(url)), "do not download broad Chinese compound postings");
  assert.equal(requests.filter(url => url.endsWith("/manifest.json")).length, 1);
  const english = requests.filter(url => /\/en-\d{3}\.json$/u.test(url));
  assert.equal(english.length, new Set(row.heads.map(bucket)).size, "one shared validated download per canonical-key bucket");
  assert.equal(new Set(english).size, english.length);
});
