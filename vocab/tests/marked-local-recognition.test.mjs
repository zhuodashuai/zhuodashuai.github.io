import test from "node:test";
import assert from "node:assert/strict";
import { markedLiteralText, selectMarkedOcrAlternative, joinMarkedLineWraps } from "../js/marked-local-recognition.js";

test("literal OCR normalization retains digits and lexical punctuation without inventing text", () => {
  assert.equal(markedLiteralText("“COVID-19,”"), "COVID-19");
  assert.equal(markedLiteralText("‘raggy |"), "raggy");
  assert.equal(markedLiteralText("omable, ¢"), "omable");
  assert.equal(markedLiteralText("don't well-known unfath-"), "don't well-known unfath-");
  assert.equal(markedLiteralText(null), "");
  assert.equal(markedLiteralText("x".repeat(2001)), "");
});

test("OCR consensus ranks literal alternatives and preserves honest uncertainty", () => {
  const selected = selectMarkedOcrAlternative([{ text: "eavesdrop,", confidence: 90 }, { text: "eavesdrop", confidence: 82 }, { text: "eavesdrop", confidence: 86 }]);
  assert.equal(selected.text, "eavesdrop"); assert.equal(selected.certainty, "clear");
  assert.deepEqual(selected.alternatives, []);
  assert.equal(selectMarkedOcrAlternative([{ text: "rareword", confidence: 0 }, { text: "rareword", confidence: 0 }]).certainty, "uncertain");
  assert.equal(selectMarkedOcrAlternative([{ text: "riotous", confidence: 80 }, { text: "riotous", confidence: 75 }, { text: "Fiotous", confidence: 95 }]).certainty, "uncertain");
});

test("a unique already-known literal resolves a no-consensus tie without creating any candidate", () => {
  const readings = [{ text: "impersonatior", confidence: 73 }, { text: "impersonatio", confidence: 53 }, { text: "impersonation", confidence: 47 }];
  const selected = selectMarkedOcrAlternative(readings, new Set(["impersonation"]));
  assert.equal(selected.text, "impersonation"); assert.equal(selected.certainty, "uncertain");
  assert.deepEqual(selected.alternatives, ["impersonatior", "impersonatio"]);
  assert.equal(selectMarkedOcrAlternative(readings, new Set(["invented"])).text, "impersonatior");
});

test("known terms cannot override a repeated OCR reading or arbitrarily choose among two attested readings", () => {
  assert.equal(selectMarkedOcrAlternative([{ text: "actual", confidence: 70 }, { text: "actual", confidence: 70 }, { text: "known", confidence: 99 }], new Set(["known"])).text, "actual");
  assert.equal(selectMarkedOcrAlternative([{ text: "first", confidence: 90 }, { text: "second", confidence: 60 }], new Set(["first", "second"])).text, "first");
  assert.equal(selectMarkedOcrAlternative([{ text: "123 |", confidence: 99 }]), null);
});

function wrap(firstText, secondText) {
  return [
    { text: firstText, certainty: "clear", mark: { color: "blue", box: [800, 100, 80, 8] }, region: [.79, .035, .10, .045] },
    { text: secondText, certainty: "clear", mark: { color: "blue", box: [100, 150, 80, 8] }, region: [.09, .065, .10, .045] }
  ];
}

test("a visible soft-wrap hyphen is removed only for a uniquely attested literal combination", () => {
  const [candidate] = joinMarkedLineWraps(wrap("unfath-", "omable"), 1000, 1600, new Set(["unfathomable"]));
  assert.equal(candidate.text, "unfathomable");
  assert.equal(candidate.originalText, "unfath-\nomable");
  assert.equal(candidate.certainty, "uncertain");
  assert.deepEqual(candidate.alternatives, ["unfath-omable"]);
});

test("a lexical well-known hyphen survives a physical line break", () => {
  const [candidate] = joinMarkedLineWraps(wrap("well-", "known"), 1000, 1600, new Set(["well-known"]));
  assert.equal(candidate.text, "well-known"); assert.equal(candidate.certainty, "uncertain");
  assert.equal(candidate.originalText, "well-\nknown");
  assert.deepEqual(candidate.alternatives, ["wellknown"]);
});

test("unknown and ambiguous line breaks retain the actual hyphen and surface the alternative", () => {
  for (const known of [new Set(), new Set(["re-cover", "recover"])]) {
    const [candidate] = joinMarkedLineWraps(wrap("re-", "cover"), 1000, 1600, known);
    assert.equal(candidate.text, "re-cover"); assert.equal(candidate.certainty, "uncertain");
    assert.deepEqual(candidate.alternatives, ["recover"]);
  }
});

test("geometry alone, an absent hyphen or mismatching color cannot concatenate unrelated marked words", () => {
  const noHyphen = wrap("whole", "word");
  assert.equal(joinMarkedLineWraps(noHyphen, 1000, 1600).length, 2);
  const color = wrap("some-", "thing"); color[1].mark.color = "red";
  assert.equal(joinMarkedLineWraps(color, 1000, 1600).length, 2);
  const sameLine = wrap("some-", "thing"); sameLine[1].mark.box[1] = 110;
  assert.equal(joinMarkedLineWraps(sameLine, 1000, 1600).length, 2);
});
