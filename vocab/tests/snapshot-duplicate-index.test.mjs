import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlankEntry,
  findDuplicate,
  normalizeEnglish,
  parsePublicSnapshot,
  validatePublicEntry
} from "../js/wordbook-schema.js";

const WHEN = "2026-10-17T12:00:00.000Z";

function entry(id, term, overrides = {}) {
  return {
    ...createBlankEntry(term),
    id,
    term,
    normalized: normalizeEnglish(term),
    meaning: "测试释义",
    createdAt: WHEN,
    updatedAt: WHEN,
    ...overrides
  };
}

function snapshot(entries) {
  return { schemaVersion: 3, exportedAt: WHEN, revisionId: "duplicate-index-test", lastMutationId: "", entries };
}

// Preserve the former quadratic implementation as an independent behavioral
// oracle, including the entry named and ID-versus-alias error precedence.
function oldParse(payload) {
  const result = { ...payload, entries: payload.entries.map(validatePublicEntry) };
  const ids = new Set();
  for (const value of result.entries) {
    if (ids.has(value.id)) throw new Error(`公开词库存在重复编号：${value.id}`);
    ids.add(value.id);
    if (findDuplicate(result.entries, value, value.id)) {
      throw new Error(`公开词库存在重复词条：${value.term}`);
    }
  }
  return result;
}

function outcome(parse, payload) {
  try { return { value: parse(payload) }; }
  catch (error) { return { error: error.message }; }
}

function equivalent(entries, label = "") {
  const payload = snapshot(entries);
  const before = structuredClone(payload);
  const expected = outcome(oldParse, payload);
  assert.deepEqual(outcome(parsePublicSnapshot, payload), expected, label);
  assert.deepEqual(payload, before, `snapshot input must not be mutated: ${label}`);
  return expected;
}

function corrected(id, term, status, original, suggestion, chosen = term, overrides = {}) {
  return entry(id, term, {
    correction: { status, original, suggestion, chosen, confidence: 0.9, source: "test" },
    ...overrides
  });
}

test("indexed snapshot validation preserves accepted and suggested correction aliases", () => {
  for (const status of ["accepted", "suggested"]) {
    const value = corrected("source", "receive", status, "recieve", "receeve", "receive");
    for (const alias of ["receive", "recieve", "receeve"]) {
      assert.equal(equivalent([value, entry("other", alias)], `${status}: ${alias}`).error,
        "公开词库存在重复词条：receive");
    }
  }
  const suggested = corrected("source", "recieve", "suggested", "recieve", "receive", "recieve");
  assert.equal(equivalent([suggested, entry("other", "receive")]).error,
    "公开词库存在重复词条：recieve");
  const chosen = corrected("source", "colour", "accepted", "colur", "color", "hue");
  assert.equal(equivalent([chosen, entry("other", "hue")]).error,
    "公开词库存在重复词条：colour");
});

test("kept corrections reserve original and chosen aliases but release rejected suggestions", () => {
  const kept = corrected("source", "desert", "kept", "dessertt", "dessert", "deserted");
  assert.ok(equivalent([kept, entry("other", "dessert")]).value);
  for (const alias of ["desert", "dessertt", "deserted"]) {
    assert.equal(equivalent([kept, entry("other", alias)]).error,
      "公开词库存在重复词条：desert");
  }
  const exact = corrected("source", "alpha", "exact", "beta", "gamma", "delta");
  assert.ok(equivalent([exact, entry("beta", "beta"), entry("gamma", "gamma"), entry("delta", "delta")]).value);
});

test("normalization and standard-form identity match the old lookup rules", () => {
  const pairs = [
    ["hip", "HIP"], ["hip", "hip,"], ["hip", '"hip"'], ["hip", "“hip”"],
    ["hip", "ＨＩＰ"], ["jab at", "jab   at"],
    ["somebody's turn", "somebody’s turn"], ["well-being", "well–being"]
  ];
  for (const [left, right] of pairs) {
    assert.equal(equivalent([entry("left", left), entry("right", right)], `${left} / ${right}`).error,
      `公开词库存在重复词条：${left}`);
  }
  assert.equal(equivalent([
    entry("left", "arose", { standardForm: "arise" }), entry("right", "arise")
  ]).error, "公开词库存在重复词条：arose");
  // Phrase punctuation is intentionally not normalized like single-word
  // punctuation. This optimization must not introduce new identity rules.
  assert.ok(equivalent([entry("left", "jab at"), entry("right", "jab at,")]).value);
});

test("forms, synonyms, confusables and raw input alone do not reserve other headwords", () => {
  assert.ok(equivalent([
    entry("source", "alpha", {
      originalInput: "epsilon", forms: ["beta"], synonyms: ["gamma"], confusedWith: ["delta"]
    }),
    entry("beta", "beta"), entry("gamma", "gamma"), entry("delta", "delta"), entry("epsilon", "epsilon")
  ]).value);
  assert.ok(equivalent([]).value);
  assert.ok(equivalent([entry("only", "alpha", { standardForm: "ALPHA" })]).value);
});

test("duplicate ID and alias failures retain original-order precedence and the same named entry", () => {
  const cases = [
    {
      entries: [entry("a", "alpha"), entry("a", "beta"), entry("b", "beta")],
      error: "公开词库存在重复编号：a"
    },
    {
      entries: [entry("a", "alpha"), entry("a", "beta"), entry("b", "alpha")],
      error: "公开词库存在重复词条：alpha"
    },
    {
      entries: [entry("a", "alpha"), entry("a", "alpha")],
      error: "公开词库存在重复编号：a"
    },
    {
      entries: [entry("a", "alpha"), entry("a", "alpha"), entry("b", "alpha")],
      error: "公开词库存在重复词条：alpha"
    },
    {
      entries: [entry("a", "alpha"), entry("b", "beta"), entry("a", "gamma"), entry("c", "ALPHA")],
      error: "公开词库存在重复词条：alpha"
    },
    {
      entries: [entry("a", "alpha"), entry("b", "beta"), entry("c", "BETA")],
      error: "公开词库存在重复词条：beta"
    },
    {
      entries: [entry("a", "alpha"), entry("b", "beta"), entry("b", "gamma")],
      error: "公开词库存在重复编号：b"
    }
  ];
  for (const { entries, error } of cases) assert.equal(equivalent(entries, error).error, error);
});

test("entry shape validation still runs before snapshot identity checks", () => {
  const value = equivalent([
    entry("a", "alpha"), entry("b", "ALPHA"), entry("c", "gamma", { unexpected: true })
  ]);
  assert.match(value.error, /包含缺失或未知字段/);
  assert.throws(() => parsePublicSnapshot({ ...snapshot([]), unexpected: true }), /包含缺失或未知字段/);
});

test("seeded mixed snapshots are equivalent to the old quadratic oracle", () => {
  let seed = 0x6e6c6d67;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const statuses = ["exact", "suggested", "accepted", "kept"];
  let valid = 0;
  let rejected = 0;
  for (let batch = 0; batch < 256; batch += 1) {
    const count = 2 + random(17);
    const entries = Array.from({ length: count }, (_, index) => {
      const term = `word-${batch}-${index}`;
      const alias = (offset) => `word-${batch}-${(index + offset) % count}`;
      const status = statuses[random(statuses.length)];
      const collision = random(4) === 0;
      return corrected(
        index && random(8) === 0 ? `id-${index - 1}` : `id-${index}`,
        random(3) === 0 ? term.toUpperCase() : term,
        status,
        collision ? alias(1) : term,
        collision ? alias(2) : term,
        term,
        { standardForm: random(8) === 0 ? alias(3) : term }
      );
    });
    const result = equivalent(entries, `seeded batch ${batch}`);
    if (result.value) valid += 1;
    else rejected += 1;
  }
  assert.ok(valid > 0 && rejected > 0, "the seeded corpus must exercise both successful and rejected snapshots");
});
