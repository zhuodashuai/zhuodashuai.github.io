/** Project only already-shipped dictionary and public glosses into a small member index. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCoreDictionary } from "../../vocab/js/core-dictionary.js";
import { normalizeEnglish, parsePublicSnapshot, validateEnglishInput } from "../../vocab/js/wordbook-schema.js";

const ROOT = resolve(import.meta.dirname, "../..");
const HAN = /\p{Script=Han}/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const digest = value => createHash("sha256").update(value).digest("hex");
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function text(value, maximum, label, { chinese = false, empty = false } = {}) {
  if (typeof value !== "string" || [...value].length > maximum || CONTROL.test(value)
    || (!empty && !value.trim()) || (chinese && !HAN.test(value))) throw new Error(`Unsafe member index ${label}.`);
  return value.trim();
}
const fitsMemberText = (value, maximum, { chinese = false, empty = false } = {}) =>
  typeof value === "string" && [...value].length <= maximum && !CONTROL.test(value)
  && (empty || Boolean(value.trim())) && (!chinese || HAN.test(value));
function fitsMemberLexicalTerm(value) {
  if (!fitsMemberText(value, 200) || HAN.test(value)) return false;
  // Match the member lookup's English-only input contract, retaining only the
  // existing numeric literal exception rather than accepting arbitrary digits.
  if (value.trim() === "24/7") return true;
  try { validateEnglishInput(value); return true; }
  catch { return false; }
}

/** Retain existing Chinese glosses; no English definitions, examples, IPA, IDs or private data. */
export function buildMemberDictionary(corePayload, publicPayload, { coreFileSha256, publicFileSha256 }) {
  const dictionary = parseCoreDictionary(corePayload);
  const snapshot = parsePublicSnapshot(publicPayload, { allowLegacy: false });
  if (dictionary.source.name !== "ECDICT" || dictionary.source.license !== "MIT"
    || !/^https:\/\/github\.com\/skywind3000\/ECDICT\/?$/u.test(dictionary.source.url)
    || !/^[a-f0-9]{64}$/u.test(coreFileSha256) || !/^[a-f0-9]{64}$/u.test(publicFileSha256)) throw new Error("Invalid source provenance.");
  let omittedWithoutChinese = 0;
  const core = [...dictionary.entries.values()].flatMap(row => {
    if (!HAN.test(row.meaning)) { omittedWithoutChinese++; return []; }
    return [[text(row.word, 200, "core term"), text(row.partOfSpeech, 200, "core POS", { empty: true }),
      text(row.meaning, 2000, "core meaning", { chinese: true }), row.forms.map(form => text(form, 200, "core form"))]];
  }).sort((a, b) => compare(normalizeEnglish(a[0]), normalizeEnglish(b[0])));
  let publicAliases = 0, publicAliasesInput = 0, omittedPublicAliases = 0, omittedPublishedEntries = 0;
  const published = snapshot.entries.flatMap(entry => {
    const candidates = new Map();
    // Only actual reading-context forms are aliases. A correction's original
    // spelling can be wrong (e.g. surveilance) and is never promoted here.
    for (const context of entry.readingContexts) {
      if (normalizeEnglish(context.originalInput) === normalizeEnglish(entry.term)) continue;
      const alias = [context.originalInput, context.partOfSpeech, context.meaning];
      candidates.set(JSON.stringify(alias), alias);
    }
    publicAliasesInput += candidates.size;
    // A legal public card has a wider contract than the manual member editor.
    // Omit an unsuitable card explicitly rather than truncate it or break every
    // other user's lookup/deployment. Strict source validation happened above.
    if (!fitsMemberLexicalTerm(entry.term) || !fitsMemberText(entry.partOfSpeech, 200, { empty: true })
      || !fitsMemberText(entry.meaning, 2000, { chinese: true })) {
      omittedPublishedEntries++;
      omittedPublicAliases += candidates.size;
      return [];
    }
    const term = text(entry.term, 200, "public term");
    const originals = [...candidates.values()].filter(alias => {
      const suitable = fitsMemberLexicalTerm(alias[0]) && fitsMemberText(alias[1], 200, { empty: true })
        && fitsMemberText(alias[2], 2000, { chinese: true });
      if (!suitable) omittedPublicAliases++;
      return suitable;
    }).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
    publicAliases += originals.length;
    return [[term, text(entry.partOfSpeech, 200, "public POS", { empty: true }),
      text(entry.meaning, 2000, "public meaning", { chinese: true }), originals]];
  }).sort((a, b) => compare(normalizeEnglish(a[0]), normalizeEnglish(b[0])));
  return {
    schemaVersion: 1,
    source: {
      core: { name: "ECDICT", license: "MIT", url: dictionary.source.url, fileSha256: coreFileSha256 },
      published: { name: "卓的公开词库", fileSha256: publicFileSha256 }
    },
    counts: { coreInput: dictionary.entries.size, core: core.length, published: published.length,
      omittedWithoutChinese, publicAliases, publishedInput: snapshot.entries.length,
      publicAliasesInput, omittedPublishedEntries, omittedPublicAliases },
    // Each row holds term, POS, Chinese gloss and known forms/context aliases.
    // Public canonical glosses remain exactly as published; chapters are not merged.
    core,
    published
  };
}

export async function generateMemberDictionary({ root = ROOT, check = false } = {}) {
  const [coreBytes, publicBytes] = await Promise.all([
    readFile(resolve(root, "vocab/data/ecdict-core.json")),
    readFile(resolve(root, "vocab/data/owner-wordbook.json"))
  ]);
  const payload = buildMemberDictionary(JSON.parse(coreBytes), JSON.parse(publicBytes), {
    coreFileSha256: digest(coreBytes), publicFileSha256: digest(publicBytes)
  });
  const output = `${JSON.stringify(payload)}\n`;
  const sha256 = digest(output);
  const manifest = `// Generated by tooling/scripts/build-member-dictionary.mjs; do not edit by hand.\nexport const MEMBER_DICTIONARY_MANIFEST = Object.freeze(${JSON.stringify({ schemaVersion: 1, file: "member-dictionary.json", sha256, counts: payload.counts })});\n`;
  const dataPath = resolve(root, "vocab/data/member-dictionary.json");
  const manifestPath = resolve(root, "vocab/js/member-dictionary-manifest.js");
  if (check) {
    const [existingData, existingManifest] = await Promise.all([readFile(dataPath, "utf8"), readFile(manifestPath, "utf8")]);
    if (existingData !== output || existingManifest !== manifest) throw new Error("Member dictionary is stale; run node tooling/scripts/build-member-dictionary.mjs.");
  } else {
    await Promise.all([writeFile(dataPath, output), writeFile(manifestPath, manifest)]);
  }
  return { bytes: Buffer.byteLength(output), originalCoreBytes: coreBytes.byteLength, sha256, ...payload.counts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await generateMemberDictionary({ check: process.argv.includes("--check") }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
