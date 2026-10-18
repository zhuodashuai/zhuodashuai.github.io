import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { PublicSnapshotSchema } from "../src/schema";
import { entry, snapshot } from "./fixtures";

function sourceFixture() {
  const state: { owner: unknown | null; deployed: unknown | null } = {
    owner: { ...snapshot(), exportedAt: "2026-09-02T00:00:00.000Z", revisionId: "revision-owner-cache-0001" },
    deployed: { ...snapshot([]), exportedAt: "2026-09-01T00:00:00.000Z", revisionId: "revision-deployed-cache-0001" }
  };
  const ownerFetch = vi.fn(async () => state.owner === null
    ? new Response("unavailable", { status: 503 })
    : Response.json({ snapshot: state.owner, confirmedAt: 1 }));
  const assetFetch = vi.fn(async () => state.deployed === null
    ? new Response("unavailable", { status: 503 })
    : Response.json(state.deployed));
  // Unique environment per fixture: validation memoization must not cross
  // deployments/bindings, and it is never populated with a private wordbook.
  const configured = { ...env, OWNER_CONTROL: { idFromName: () => "test-owner", get: () => ({ fetch: ownerFetch }) },
    ASSETS: { fetch: assetFetch } } as unknown as Env;
  const read = (etag = "") => worker.fetch(new Request("https://admin.example/api/v1/public/wordbook", {
    headers: { Origin: "https://zhuodashuai.github.io", ...(etag ? { "If-None-Match": etag } : {}) }
  }), configured);
  return { state, ownerFetch, assetFetch, read };
}

describe("public snapshot validation reuse", () => {
  it("still reads both sources on warm 200/304 requests but validates identical content only once", async () => {
    const source = sourceFixture();
    const parse = vi.spyOn(PublicSnapshotSchema, "safeParse");
    try {
      const first = await source.read();
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ revisionId: "revision-owner-cache-0001" });
      expect(parse).toHaveBeenCalledTimes(2);
      const etag = first.headers.get("etag")!;
      const second = await source.read();
      expect(second.status).toBe(200);
      expect(await second.json()).toMatchObject({ revisionId: "revision-owner-cache-0001" });
      const conditional = await source.read(etag);
      expect(conditional.status).toBe(304);
      expect(await conditional.text()).toBe("");
      expect(conditional.headers.get("etag")).toBe(etag);
      expect(conditional.headers.get("access-control-allow-origin")).toBe("https://zhuodashuai.github.io");
      expect(parse).toHaveBeenCalledTimes(2);
      expect(source.ownerFetch).toHaveBeenCalledTimes(3);
      expect(source.assetFetch).toHaveBeenCalledTimes(3);
    } finally { parse.mockRestore(); }
  });

  it("observes the next owner publish immediately and still compares a newer deployed correction", async () => {
    const source = sourceFixture();
    const first = await source.read();
    const oldTag = first.headers.get("etag")!;
    await first.text();
    source.state.owner = { ...snapshot(), exportedAt: "2026-09-03T00:00:00.000Z", revisionId: "revision-owner-cache-0002" };
    const published = await source.read(oldTag);
    expect(published.status).toBe(200);
    expect(published.headers.get("x-wordbook-source")).toBe("owner-confirmed");
    expect(await published.json()).toMatchObject({ revisionId: "revision-owner-cache-0002" });
    source.state.deployed = { ...snapshot(), exportedAt: "2026-09-04T00:00:00.000Z", revisionId: "revision-deployed-cache-0002" };
    const corrected = await source.read();
    expect(corrected.headers.get("x-wordbook-source")).toBe("deployed-newer");
    expect(await corrected.json()).toMatchObject({ revisionId: "revision-deployed-cache-0002" });
  });

  it("does not trust an unchanged revision ID when the source body changes", async () => {
    const source = sourceFixture();
    await (await source.read()).text();
    source.state.owner = { ...source.state.owner as Record<string, unknown>,
      entries: [entry({ meaning: "朝某人或某物猛戳；用言语挖苦或批评（修订）" })] };
    const revised = await source.read();
    expect(await revised.json()).toMatchObject({ entries: [{ meaning: "朝某人或某物猛戳；用言语挖苦或批评（修订）" }] });
    source.state.owner = { ...source.state.owner as Record<string, unknown>, unexpectedField: true };
    const invalid = await source.read();
    expect(invalid.status).toBe(200);
    expect(invalid.headers.get("x-wordbook-source")).toBe("deployed-newer");
    expect(await invalid.json()).toMatchObject({ revisionId: "revision-deployed-cache-0001", entries: [] });
  });

  it("does not let a post-publish read join an older pending owner request", async () => {
    const source = sourceFixture();
    const oldOwner = source.state.owner;
    let finishOld!: (response: Response) => void;
    source.ownerFetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }));
    const oldRead = source.read();
    source.state.owner = { ...snapshot(), exportedAt: "2026-09-03T00:00:00.000Z", revisionId: "revision-owner-after-publish" };
    const afterPublish = await source.read();
    expect(afterPublish.status).toBe(200);
    const latestTag = afterPublish.headers.get("etag")!;
    expect(await afterPublish.json()).toMatchObject({ revisionId: "revision-owner-after-publish" });
    finishOld(Response.json({ snapshot: oldOwner, confirmedAt: 1 }));
    expect(await (await oldRead).json()).toMatchObject({ revisionId: "revision-owner-cache-0001" });
    // Even if an older request finishes last, memoization cannot decide which
    // content is current; the next fresh owner read still supplies that fact.
    const current = await source.read(latestTag);
    expect(current.status).toBe(304);
    expect(current.headers.get("etag")).toBe(latestTag);
    expect(source.ownerFetch).toHaveBeenCalledTimes(3);
  });

  it("never serves an old memo when both current sources fail or become invalid", async () => {
    const source = sourceFixture();
    await (await source.read()).text();
    source.state.owner = null;
    source.state.deployed = { ...source.state.deployed as Record<string, unknown>, unexpectedField: true };
    const invalid = await source.read();
    expect(invalid.status).toBe(503);
    expect(await invalid.json()).toMatchObject({ error: { code: "public_snapshot_unavailable" } });
    source.state.deployed = null;
    const unavailable = await source.read();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: { code: "public_snapshot_unavailable" } });
  });

  it("does not cache a validation failure, and isolates source bindings", async () => {
    const first = sourceFixture();
    first.state.owner = null;
    first.state.deployed = { ...first.state.deployed as Record<string, unknown>, unexpectedField: true };
    expect((await first.read()).status).toBe(503);
    first.state.deployed = { ...snapshot(), exportedAt: "2026-09-01T00:00:00.000Z", revisionId: "revision-deployed-cache-0001" };
    expect((await first.read()).status).toBe(200);
    const isolated = sourceFixture();
    isolated.state.owner = null;
    isolated.state.deployed = null;
    expect((await isolated.read()).status).toBe(503);
  });
});
