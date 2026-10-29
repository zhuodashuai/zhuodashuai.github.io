import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

// These source files now also implement current search/pagination behavior.
// The old mechanical v108/v109 relationship is a historical claim, so bind it
// to exact Git blobs rather than freezing today's application forever.
export const V108_HISTORICAL_COMMIT = "f5ec5db6b21663b1e5f97217069bb08590d7f667";
const archivePin = { bytes: 153375, sha256: "7b2f56ff5fdc872c4b57c97875e80def7e79c9d137c40083b142fe7066b7cf9a", uncompressedBytes: 682332 };
const folder = new URL("../fixtures/dictionary-v108-graph/", import.meta.url);
const root = new URL("../../../", import.meta.url);
let packet;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

export function decodeHistoricalV108Archive(raw) {
  assert.equal(raw.length, archivePin.bytes, "Historical program archive byte length changed");
  assert.equal(sha(raw), archivePin.sha256, "Historical program archive integrity changed");
  const expanded = gunzipSync(raw, { maxOutputLength: archivePin.uncompressedBytes });
  assert.equal(expanded.length, archivePin.uncompressedBytes);
  const value = JSON.parse(expanded.toString("utf8"));
  assert.equal(value.schemaVersion, 1); assert.equal(value.sourceCommit, V108_HISTORICAL_COMMIT);
  for (const item of Object.values(value.files)) {
    const bytes = Buffer.from(item.source);
    assert.equal(bytes.length, item.bytes); assert.equal(sha(bytes), item.sha256);
    assert.match(item.gitBlob, /^[a-f0-9]{40}$/u);
  }
  return value;
}

async function historicalPacket() {
  if (!packet) packet = Promise.all([
    readFile(new URL("f5ec5db-programs.json.gz", folder)),
    readFile(new URL("manifest.json", folder), "utf8")
  ]).then(([raw, manifestText]) => {
    const value = decodeHistoricalV108Archive(raw), manifest = JSON.parse(manifestText);
    assert.equal(manifest.sourceCommit, V108_HISTORICAL_COMMIT);
    assert.deepEqual(manifest.archive, { file: "f5ec5db-programs.json.gz", ...archivePin });
    assert.deepEqual(manifest.files, Object.fromEntries(Object.entries(value.files)
      .map(([name, { source, ...metadata }]) => [name, metadata])));
    return value;
  });
  return packet;
}

export async function readV108HistoricalProgram(name) {
  assert.match(name, /^[a-z][a-z0-9-]*\.js$/u);
  const { files } = await historicalPacket();
  return Object.hasOwn(files, name) ? Buffer.from(files[name].source)
    : readFile(new URL(`vocab/js/${name}`, root));
}
