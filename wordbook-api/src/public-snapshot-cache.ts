import { PUBLIC_SCHEMA_VERSION, validateSnapshot, type PublicSnapshot } from "./schema";

export interface PublicSnapshotRecord {
  snapshot: PublicSnapshot;
  sha: string;
  htmlUrl: string;
  confirmedAt: number;
}

const LEGACY_KEY = "public-snapshot:latest";
const PREFIX = "public-snapshot:chunked:v1:";
const HEAD_KEY = `${PREFIX}head`;
// Leave substantial space below SQLite Durable Objects' 2 MiB per-value limit,
// including serialization overhead. Split UTF-8 bytes, not JS code units.
const CHUNK_BYTES = 240 * 1024;
const MAX_SNAPSHOT_BYTES = 5_000_000;
const MAX_RECORD_BYTES = MAX_SNAPSHOT_BYTES + 16_384;
const MAX_CHUNKS = Math.ceil(MAX_RECORD_BYTES / CHUNK_BYTES);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

interface ChunkedHead {
  version: 1;
  slot: 0 | 1;
  byteLength: number;
  chunkCount: number;
  digest: string;
  sha: string;
  revisionId: string;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

/** Never project arbitrary/private fields into the public cache. */
function validatedRecord(value: unknown): PublicSnapshotRecord | undefined {
  if (!plainRecord(value) || !hasKeys(value, ["snapshot", "sha", "htmlUrl", "confirmedAt"])
    || typeof value.sha !== "string" || !/^[a-f0-9]{40}$/i.test(value.sha)
    || typeof value.htmlUrl !== "string" || value.htmlUrl.length > 2048
    || !Number.isSafeInteger(value.confirmedAt) || Number(value.confirmedAt) <= 0
    || !plainRecord(value.snapshot) || value.snapshot.schemaVersion !== PUBLIC_SCHEMA_VERSION) return;
  if (value.htmlUrl) {
    try { if (new URL(value.htmlUrl).protocol !== "https:") return; } catch { return; }
  }
  try {
    const snapshot = validateSnapshot(value.snapshot);
    if (encoder.encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) return;
    return { snapshot, sha: value.sha, htmlUrl: value.htmlUrl, confirmedAt: Number(value.confirmedAt) };
  } catch { return; }
}

function validatedHead(value: unknown): ChunkedHead | undefined {
  if (!plainRecord(value) || !hasKeys(value, ["version", "slot", "byteLength", "chunkCount", "digest", "sha", "revisionId"])
    || value.version !== 1 || (value.slot !== 0 && value.slot !== 1)
    || !Number.isSafeInteger(value.byteLength) || Number(value.byteLength) <= 0 || Number(value.byteLength) > MAX_RECORD_BYTES
    || !Number.isSafeInteger(value.chunkCount) || Number(value.chunkCount) < 1 || Number(value.chunkCount) > MAX_CHUNKS
    || Number(value.chunkCount) !== Math.ceil(Number(value.byteLength) / CHUNK_BYTES)
    || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest)
    || typeof value.sha !== "string" || !/^[a-f0-9]{40}$/i.test(value.sha)
    || typeof value.revisionId !== "string" || value.revisionId.length < 12 || value.revisionId.length > 180) return;
  return value as unknown as ChunkedHead;
}

const chunkKey = (slot: number, index: number) => `${PREFIX}slot:${slot}:${String(index).padStart(3, "0")}`;

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * One transaction pins the manifest and all chunks to the same committed
 * revision. A damaged/missing current revision is never assembled from older
 * slot data: only the independently validated, untouched legacy key may fall
 * back. Callers still compare this public cache with the deployed snapshot.
 */
export async function readPublicSnapshotRecord(storage: DurableObjectStorage): Promise<PublicSnapshotRecord | undefined> {
  return storage.transaction(async transaction => {
    const head = validatedHead(await transaction.get(HEAD_KEY));
    if (head) {
      const bytes = new Uint8Array(head.byteLength);
      let complete = true;
      for (let index = 0; index < head.chunkCount; index++) {
        const chunk = await transaction.get<Uint8Array>(chunkKey(head.slot, index));
        const expected = Math.min(CHUNK_BYTES, head.byteLength - index * CHUNK_BYTES);
        if (!(chunk instanceof Uint8Array) || chunk.byteLength !== expected) { complete = false; break; }
        bytes.set(chunk, index * CHUNK_BYTES);
      }
      if (complete && await digest(bytes) === head.digest) {
        try {
          const record = validatedRecord(JSON.parse(decoder.decode(bytes)));
          if (record && record.sha === head.sha && record.snapshot.revisionId === head.revisionId) return record;
        } catch { /* Corrupt bytes cannot become an apparently valid snapshot. */ }
      }
    }
    return validatedRecord(await transaction.get(LEGACY_KEY));
  });
}

/**
 * Two fixed slots bound cache storage. Chunk replacement, tail cleanup and
 * head swap commit atomically; a failed write leaves the last good revision
 * intact. Never delete or replace the old single-key cache during rollout.
 */
export async function writePublicSnapshotRecord(storage: DurableObjectStorage, value: PublicSnapshotRecord): Promise<void> {
  const record = validatedRecord(value);
  if (!record) throw new Error("Public snapshot cache record is invalid");
  const bytes = encoder.encode(JSON.stringify(record));
  if (bytes.byteLength > MAX_RECORD_BYTES) throw new Error("Public snapshot cache record exceeds its byte limit");
  const chunkCount = Math.ceil(bytes.byteLength / CHUNK_BYTES);
  const checksum = await digest(bytes);
  await storage.transaction(async transaction => {
    const previous = validatedHead(await transaction.get(HEAD_KEY));
    const slot = previous?.slot === 0 ? 1 : 0;
    for (let index = 0; index < chunkCount; index++) {
      await transaction.put(chunkKey(slot, index), bytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES));
    }
    // Fixed, bounded keys only; no prefix-wide or user-data deletion.
    const tail = Array.from({ length: MAX_CHUNKS - chunkCount }, (_, index) => chunkKey(slot, chunkCount + index));
    if (tail.length) await transaction.delete(tail);
    const head: ChunkedHead = { version: 1, slot, byteLength: bytes.byteLength, chunkCount,
      digest: checksum, sha: record.sha, revisionId: record.snapshot.revisionId };
    await transaction.put(HEAD_KEY, head);
  });
}
