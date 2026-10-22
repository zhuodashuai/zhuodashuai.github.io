/** The immutable MIT recovery authority is independent of active learner senses. */
import { createHash } from "node:crypto";
import { types } from "node:util";

export const DICTIONARY_SEED_ARCHIVE_VERSION = "474e8115824074012f7a918453f977f3a8d21c6ae25016c8a44a1fc8c2d264cc";
export const DICTIONARY_SEED_ARCHIVE_FILE = `tooling/dictionary/source-revisions/baseline-${DICTIONARY_SEED_ARCHIVE_VERSION}.manifest.json`;
export const DICTIONARY_SEED_ARCHIVE_SHA256 = "fb729e8f3334658e5f82df311390710dc3f05d278c125197e95de5ed1f96dd30";

const INTEGRITY = Object.freeze({
  schemaVersion: 1,
  source: Object.freeze({
    name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT",
    commit: "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
    sha256: "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
  }),
  rows: 102325,
  semanticSha256: "228cea0075dc455d4e9fb4633cdc7a9671a39f88b4b031b5643e8207d6f4a98b",
  headlistSha256: "6183795f1e3cb743db065f945376bd6296c589e7ab5b300b5456d2acb57f6fc9",
  workbookHeadsSha256: "ac0da3a83ddd75df102c87fc99c45b1a34ec11f8a184d12408bdc31f033feab5"
});

// Inspect descriptors before values: an exported gate must not execute a supplied
// accessor or silently accept hidden fields that JSON.parse cannot produce.
function matchesPinnedDataRecord(value, expected) {
  if (!value || typeof value !== "object" || types.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== Object.keys(expected).length) return false;
  for (const key of keys) {
    if (typeof key !== "string" || !Object.hasOwn(expected, key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return false;
    if (typeof expected[key] === "object"
      ? !matchesPinnedDataRecord(descriptor.value, expected[key])
      : !Object.is(descriptor.value, expected[key])) return false;
  }
  return true;
}

/** A missing/recomputed integrity file cannot redefine the existing MIT root. */
export function assertPinnedDictionarySeedIntegrity(integrity) {
  if (!matchesPinnedDataRecord(integrity, INTEGRITY)) throw new Error("Pinned MIT seed integrity mismatch; the original recovery root cannot be regenerated.");
}

/** Pure raw-byte authentication; not an approval of current active records. */
export function parsePinnedDictionarySeedArchive(bytes) {
  if (!(bytes instanceof Uint8Array)
    || createHash("sha256").update(bytes).digest("hex") !== DICTIONARY_SEED_ARCHIVE_SHA256) {
    throw new Error("Pinned MIT seed archive manifest has changed.");
  }
  let manifest;
  try { manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("Invalid pinned MIT seed archive manifest."); }
  if (manifest.schemaVersion !== 2 || manifest.version !== DICTIONARY_SEED_ARCHIVE_VERSION) {
    throw new Error("Pinned MIT seed archive identity mismatch.");
  }
  return manifest;
}
