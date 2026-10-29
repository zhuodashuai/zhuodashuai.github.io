import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { buildChineseSearchRanking } from "../scripts/build-chinese-search-ranking.mjs";
import { CHINESE_RANKING_RELEASE } from "../../vocab/js/chinese-ranking-release.js";
import { isPinnedChineseRankingFixture } from "./helpers/chinese-ranking-fixture-asset.mjs";

test("runtime fixture transports permit only the pinned local ranking binary", () => {
  const target = new URL(`../../vocab/data/chinese-search-ranking/${CHINESE_RANKING_RELEASE.file}`, import.meta.url);
  assert.equal(isPinnedChineseRankingFixture(target), true);
  for (const unsafe of [new URL(target.href + "?other=1"), new URL("../other.bin", target),
    new URL("../../owner-wordbook.json", target), new URL(target.pathname, "https://example.com")]) {
    assert.equal(isPinnedChineseRankingFixture(unsafe), false);
  }
});

test("ranking gzip uses the portable OS marker without changing its payload", async () => {
  const bytes = await readFile(new URL(`../../vocab/data/chinese-search-ranking/${CHINESE_RANKING_RELEASE.file}`, import.meta.url));
  assert.equal(bytes[9], 255, "Build-host metadata must not change the content-addressed filename");
  const payload = gunzipSync(bytes), normalizedHashes = new Set();
  for (const os of [0, 3, 10, 11, 255]) {
    const encoded = Buffer.from(bytes); encoded[9] = os;
    assert.deepEqual(gunzipSync(encoded), payload);
    encoded[9] = 255;
    normalizedHashes.add(createHash("sha256").update(encoded).digest("hex"));
  }
  assert.deepEqual([...normalizedHashes], [CHINESE_RANKING_RELEASE.sha256]);
});

test("Chinese ranking sidecar is fresh, hash-bound, and lossless for every canonical source variant", async () => {
  const release = await buildChineseSearchRanking({ check: true });
  assert.deepEqual(release, CHINESE_RANKING_RELEASE);
  const root = new URL("../../vocab/data/expanded-dictionary/", import.meta.url);
  const manifestBytes = await readFile(new URL("manifest.json", root)), manifest = JSON.parse(manifestBytes);
  assert.equal(createHash("sha256").update(manifestBytes).digest("hex"), release.sourceManifestSha256);
  const compressed = await readFile(new URL(`../../vocab/data/chinese-search-ranking/${release.file}`, import.meta.url));
  assert.equal(compressed.length, release.bytes); assert.ok(compressed.length < 4 * 1024 * 1024);
  const bytes = gunzipSync(compressed); assert.equal(bytes.length, release.uncompressedBytes);
  const payload = JSON.parse(bytes), rows = new Map(payload.records.map(row => [row[0], row]));
  assert.equal(payload.dictionaryVersion, manifest.version); assert.equal(rows.size, manifest.counts.records);
  const checked = new Set();
  for (const descriptor of manifest.english.shards) {
    const source = JSON.parse(await readFile(new URL(descriptor.file, root))), records = new Map(source.records.map(row => [row.id, row]));
    for (const [, refs] of source.keys) for (const ref of refs) if (ref.kind === "canonical") {
      const record = records.get(ref.id);
      assert.deepEqual(rows.get(record.id), [record.id, record.term,
        [record, ...(record.variants || [])].map(item => [item.partOfSpeech, item.source, item.meaning])]);
      checked.add(record.id);
    }
  }
  assert.equal(checked.size, rows.size);
});
