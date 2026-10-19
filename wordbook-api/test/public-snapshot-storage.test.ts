import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import publishedSnapshot from "../../vocab/data/owner-wordbook.json";
import { readPublicSnapshotRecord, writePublicSnapshotRecord, type PublicSnapshotRecord } from "../src/public-snapshot-cache";
import { validateSnapshot } from "../src/schema";
import { entry, snapshot } from "./fixtures";

const LEGACY = "public-snapshot:latest";
const PREFIX = "public-snapshot:chunked:v1:";
const HEAD = `${PREFIX}head`;
const encoder = new TextEncoder();
const record = (document = snapshot(), sha = "a".repeat(40)): PublicSnapshotRecord => ({
  snapshot: document, sha, htmlUrl: "https://github.com/zhuodashuai/zhuodashuai.github.io", confirmedAt: 1_790_000_000_000
});
const withStorage = <T>(work: (storage: DurableObjectStorage) => Promise<T>) => runInDurableObject(
  env.OWNER_CONTROL.get(env.OWNER_CONTROL.idFromName("public-cache-storage-tests")),
  async (_instance, state) => work(state.storage)
);

beforeEach(async () => reset());

describe("bounded atomic public snapshot storage", () => {
  it("round-trips the actual 616-entry published snapshot above the SQLite per-value limit", async () => {
    const current = record(validateSnapshot(publishedSnapshot));
    expect(current.snapshot.entries.length).toBeGreaterThanOrEqual(616);
    expect(encoder.encode(JSON.stringify(current)).byteLength).toBeGreaterThan(2 * 1024 * 1024);
    await withStorage(async storage => {
      await writePublicSnapshotRecord(storage, current);
      expect(await readPublicSnapshotRecord(storage)).toEqual(current);
      const values = await storage.list<unknown>({ prefix: PREFIX });
      const chunks = [...values].filter(([key]) => key !== HEAD).map(([, value]) => value as Uint8Array);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk).toBeInstanceOf(Uint8Array);
        expect(chunk.byteLength).toBeLessThanOrEqual(256 * 1024);
      }
      expect(await storage.get(LEGACY)).toBeUndefined();
    });
  });

  it("splits UTF-8 bytes safely, including multibyte and astral text across chunk boundaries", async () => {
    const document = snapshot(Array.from({ length: 360 }, (_, index) => entry({
      id: `public-unicode-${index}`, term: `unicode fixture ${index}`,
      meaning: "汉字😀".repeat(350), exampleZh: "多字节边界不应损坏😀".repeat(80)
    })));
    const current = record(document);
    expect(encoder.encode(JSON.stringify(current)).byteLength).toBeGreaterThan(2 * 1024 * 1024);
    await withStorage(async storage => {
      await writePublicSnapshotRecord(storage, current);
      expect(await readPublicSnapshotRecord(storage)).toEqual(current);
    });
  });

  it("reads an existing legacy record and never deletes or rewrites it during rollout", async () => {
    await withStorage(async storage => {
      expect(await readPublicSnapshotRecord(storage)).toBeUndefined();
      const legacy = record();
      await storage.put(LEGACY, legacy);
      expect(await readPublicSnapshotRecord(storage)).toEqual(legacy);
      const next = record({ ...snapshot([]), revisionId: "revision-new-chunked-001" }, "b".repeat(40));
      await writePublicSnapshotRecord(storage, next);
      expect(await readPublicSnapshotRecord(storage)).toEqual(next);
      expect(await storage.get(LEGACY)).toEqual(legacy);
    });
  });

  it("missing, corrupt, wrong-length or revision-mismatched chunks cannot mix with another revision", async () => {
    await withStorage(async storage => {
      const legacy = record(snapshot([]));
      await storage.put(LEGACY, legacy);
      const current = record({ ...snapshot(), revisionId: "revision-current-chunked-001" }, "b".repeat(40));
      for (const corruption of ["missing", "bytes", "length", "revision", "sha"] as const) {
        await writePublicSnapshotRecord(storage, current);
        const head = await storage.get<{ slot: number; revisionId: string; sha: string }>(HEAD);
        const key = `${PREFIX}slot:${head!.slot}:000`;
        if (corruption === "missing") await storage.delete(key);
        else if (corruption === "revision" || corruption === "sha") await storage.put(HEAD, {
          ...head, [corruption === "revision" ? "revisionId" : "sha"]: corruption === "revision" ? "revision-unrelated-001" : "c".repeat(40)
        });
        else {
          const bytes = await storage.get<Uint8Array>(key);
          if (corruption === "length") await storage.put(key, bytes!.slice(1));
          else { bytes![0] ^= 1; await storage.put(key, bytes); }
        }
        expect(await readPublicSnapshotRecord(storage)).toEqual(legacy);
      }
      await storage.delete(LEGACY);
      expect(await readPublicSnapshotRecord(storage)).toBeUndefined();
    });
  });

  it("rejects unbounded manifests and invalid/private legacy records without returning partial data", async () => {
    await withStorage(async storage => {
      await storage.put(HEAD, { version: 1, slot: 0, byteLength: Number.MAX_SAFE_INTEGER,
        chunkCount: Number.MAX_SAFE_INTEGER, digest: "a".repeat(64), sha: "a".repeat(40), revisionId: "revision-corrupt-001" });
      expect(await readPublicSnapshotRecord(storage)).toBeUndefined();
      await storage.put(LEGACY, { ...record(), githubTokenCipher: "must-not-be-public" });
      expect(await readPublicSnapshotRecord(storage)).toBeUndefined();
      await storage.put(LEGACY, { ...record(), snapshot: { ...snapshot(), entries: [{ ...entry(), privateNote: "not-public" }] } });
      expect(await readPublicSnapshotRecord(storage)).toBeUndefined();
    });
  });

  it("a transaction failure before the head swap leaves the previously committed revision intact", async () => {
    await withStorage(async storage => {
      const old = record(), next = record({ ...snapshot([]), revisionId: "revision-failed-next-001" }, "b".repeat(40));
      await writePublicSnapshotRecord(storage, old);
      const failing = new Proxy(storage, {
        get(target, property) {
          if (property === "transaction") return (work: (transaction: DurableObjectTransaction) => Promise<unknown>) => target.transaction(transaction => work(new Proxy(transaction, {
            get(actual, field) {
              if (field === "put") return async (key: string, value: unknown) => {
                if (key === HEAD) throw new Error("injected head-swap failure");
                await actual.put(key, value);
              };
              const value = Reflect.get(actual, field);
              return typeof value === "function" ? value.bind(actual) : value;
            }
          })));
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
      await expect(writePublicSnapshotRecord(failing, next)).rejects.toThrow("injected head-swap failure");
      expect(await readPublicSnapshotRecord(storage)).toEqual(old);
    });
  });

  it("repeated large and small writes reuse two fixed slots and remove only obsolete slot tails", async () => {
    await withStorage(async storage => {
      const legacy = record();
      await storage.put(LEGACY, legacy);
      const large = record(validateSnapshot(publishedSnapshot));
      await storage.put("session:private-do-not-delete", { sentinel: true });
      for (let index = 0; index < 8; index++) {
        const next = index % 2 ? record({ ...snapshot([]), revisionId: `revision-small-cache-${index}` }) : large;
        await writePublicSnapshotRecord(storage, next);
        expect(await readPublicSnapshotRecord(storage)).toEqual(next);
      }
      const keys = [...(await storage.list({ prefix: PREFIX })).keys()];
      expect(keys.length).toBeLessThanOrEqual(1 + 2 * 21);
      expect(keys.every(key => key === HEAD || /^public-snapshot:chunked:v1:slot:[01]:\d{3}$/.test(key))).toBe(true);
      expect(await storage.get(LEGACY)).toEqual(legacy);
      expect(await storage.get("session:private-do-not-delete")).toEqual({ sentinel: true });
    });
  });

  it("concurrent reads and writes return complete old or new revisions, never a hybrid", async () => {
    await withStorage(async storage => {
      const old = record(validateSnapshot(publishedSnapshot));
      const next = record({ ...old.snapshot, revisionId: "revision-concurrent-next-001", entries: old.snapshot.entries.slice(0, 400) }, "b".repeat(40));
      await writePublicSnapshotRecord(storage, old);
      const [, read] = await Promise.all([writePublicSnapshotRecord(storage, next), readPublicSnapshotRecord(storage)]);
      expect([old, next]).toContainEqual(read);
      expect(await readPublicSnapshotRecord(storage)).toEqual(next);
    });
  });

  it("invalid, private or oversized writes leave a good current record untouched", async () => {
    await withStorage(async storage => {
      const current = record();
      await writePublicSnapshotRecord(storage, current);
      const oversized = record(snapshot(Array.from({ length: 800 }, (_, index) => entry({
        id: `public-oversized-${index}`, term: `oversized fixture ${index}`, meaning: "汉".repeat(1400)
      }))));
      expect(validateSnapshot(oversized.snapshot)).toEqual(oversized.snapshot);
      expect(encoder.encode(JSON.stringify(oversized.snapshot)).byteLength).toBeGreaterThan(5_000_000);
      const invalid = [
        { ...current, githubRefreshTokenCipher: "not-public" },
        { ...current, snapshot: { ...snapshot(), entries: [entry(), entry()] } },
        { ...current, sha: "not-a-git-blob-sha" },
        { ...current, htmlUrl: "javascript:alert(1)" },
        oversized
      ];
      for (const value of invalid) await expect(writePublicSnapshotRecord(storage, value as PublicSnapshotRecord)).rejects.toThrow("cache record is invalid");
      expect(await readPublicSnapshotRecord(storage)).toEqual(current);
    });
  });
});
