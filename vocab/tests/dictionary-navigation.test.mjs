import assert from "node:assert/strict";
import test from "node:test";
import { createDictionaryPrefill, dictionaryQueryFromHash, dictionarySearchUrl, safeDictionaryQuery } from "../js/dictionary-navigation.js";

test("dictionary links keep English and Chinese queries in fragments on the current public origin", () => {
  for (const query of ["by some fluke", "苹果", "<script>alert(1)</script>"]) {
    const url = new URL(dictionarySearchUrl(query, "https://zhuodashuai.github.io/vocab/?book=x"));
    assert.equal(url.pathname, "/vocab/dictionary.html");
    assert.equal(url.search, "");
    assert.equal(dictionaryQueryFromHash(url.hash, "q"), query);
  }
  assert.equal(new URL(dictionarySearchUrl("hip", "http://127.0.0.1:4187/")).pathname, "/dictionary.html");
});

test("hash lookup bounds and normalizes untrusted query text without interpreting markup", () => {
  assert.equal(dictionaryQueryFromHash("#lookup=by%20some%20fluke"), "by some fluke");
  assert.equal(dictionaryQueryFromHash("#lookup=%EF%BC%A8%EF%BC%A9%EF%BC%B0"), "HIP");
  assert.equal(safeDictionaryQuery("a\n\t b"), "a b");
  assert.equal(dictionaryQueryFromHash("#lookup=" + "a".repeat(201)), "");
  assert.equal(dictionaryQueryFromHash("#lookup=" + "a".repeat(2000)), "");
  assert.equal(dictionaryQueryFromHash("#q=hip"), "");
});

test("login continuation prefills once only after ready and respects existing input", () => {
  const prefill = createDictionaryPrefill("#lookup=abacus");
  assert.equal(prefill(false), "");
  assert.equal(prefill(true), "abacus");
  assert.equal(prefill(true), "");
  const typed = createDictionaryPrefill("#lookup=abacus");
  assert.equal(typed(true, "hip"), "");
  assert.equal(typed(true), "");
});
