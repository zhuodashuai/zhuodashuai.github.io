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
  return { state, ownerFetch, assetFetch, read, configured };
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

describe("public snapshot error CORS boundaries", () => {
  it("keeps a both-sources-unavailable error CORS-readable without changing its safe response", async () => {
    const source = sourceFixture();
    source.state.owner = null;
    source.state.deployed = null;
    const response = await source.read();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: {
      code: "public_snapshot_unavailable", message: "公开词库暂时不可读取。", requestId: expect.any(String)
    } });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://zhuodashuai.github.io");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("Accept, If-None-Match");
    expect(response.headers.get("access-control-expose-headers")).toBe("ETag, X-Wordbook-Source");
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("etag")).toBeNull();
    expect(response.headers.get("x-wordbook-source")).toBeNull();
    expect(source.ownerFetch).toHaveBeenCalledTimes(1);
    expect(source.assetFetch).toHaveBeenCalledTimes(1);
  });

  it.each(["https://evil.example", "null", ""])("does not reflect the request Origin %s on a public error", async origin => {
    const source = sourceFixture();
    source.state.owner = null;
    source.state.deployed = null;
    const response = await worker.fetch(new Request("https://admin.example/api/v1/public/wordbook", {
      headers: origin ? { Origin: origin } : {}
    }), source.configured);
    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://zhuodashuai.github.io");
    expect(response.headers.get("access-control-allow-origin")).not.toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: "public_snapshot_unavailable" } });
  });

  it("uses the configured public origin rather than a request origin or URL path", async () => {
    const source = sourceFixture();
    source.state.owner = null;
    source.state.deployed = null;
    const response = await worker.fetch(new Request("https://admin.example/api/v1/public/wordbook", {
      headers: { Origin: "https://evil.example" }
    }), { ...source.configured, PUBLIC_SITE_URL: "https://configured-public.example/vocab/" } as unknown as Env);
    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://configured-public.example");
    expect(response.headers.get("vary")).toBe("Origin");
    expect(await response.json()).toMatchObject({ error: { code: "public_snapshot_unavailable" } });
  });

  it("does not turn a warm conditional request into an old 304 when both current sources fail", async () => {
    const source = sourceFixture();
    const first = await source.read();
    const etag = first.headers.get("etag")!;
    expect(first.status).toBe(200);
    await first.text();
    source.state.owner = null;
    source.state.deployed = null;
    const response = await source.read(etag);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "public_snapshot_unavailable" } });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://zhuodashuai.github.io");
    expect(response.headers.get("etag")).toBeNull();
    expect(response.headers.get("x-wordbook-source")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(source.ownerFetch).toHaveBeenCalledTimes(2);
    expect(source.assetFetch).toHaveBeenCalledTimes(2);
  });

  it("also keeps both rejected source reads as the same CORS-readable safe error", async () => {
    const source = sourceFixture();
    source.ownerFetch.mockRejectedValueOnce(new Error("owner transport detail"));
    source.assetFetch.mockRejectedValueOnce(new Error("asset transport detail"));
    const response = await source.read();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ error: { code: "public_snapshot_unavailable" } });
    expect(body).not.toMatch(/transport detail/);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://zhuodashuai.github.io");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["GET", "/api/v1/owner/wordbook", 401],
    ["POST", "/api/v1/owner/publish", 403],
    ["GET", "/api/v1/member/entries", 401],
    ["POST", "/api/v1/public/wordbook", 404],
    ["HEAD", "/api/v1/public/wordbook", 404],
    ["GET", "/api/v1/public/wordbook/extra", 404]
  ] as const)("does not grant CORS to %s %s error responses", async (method, path, status) => {
    const source = sourceFixture();
    const response = await worker.fetch(new Request(`https://admin.example${path}`, {
      method, headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      ...(method === "POST" ? { body: "{}" } : {})
    }), source.configured);
    expect(response.status).toBe(status);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
    expect(response.headers.get("access-control-allow-headers")).toBeNull();
    expect(response.headers.get("access-control-expose-headers")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toMatchObject({ error: { code: expect.any(String) } });
    expect(source.ownerFetch).not.toHaveBeenCalled();
    expect(source.assetFetch).not.toHaveBeenCalled();
  });

  it.each(["not-a-url", ""])("keeps invalid public-site configuration as a safe JSON error without throwing again (%s)", async value => {
    const source = sourceFixture();
    const response = await worker.fetch(new Request("https://admin.example/api/v1/public/wordbook", {
      headers: { Origin: "https://evil.example" }
    }), { ...source.configured, PUBLIC_SITE_URL: value } as unknown as Env);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: {
      code: "internal_error", message: "服务暂时无法完成请求，请稍后重试。", requestId: expect.any(String)
    } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(source.ownerFetch).not.toHaveBeenCalled();
    expect(source.assetFetch).not.toHaveBeenCalled();
  });

  it.each(["data:text/plain,public", "file:///public/wordbook", "ftp://public.example/vocab/"])("fails closed for a non-web configured origin (%s)", async value => {
    const source = sourceFixture();
    source.state.owner = null;
    source.state.deployed = null;
    const response = await worker.fetch(new Request("https://admin.example/api/v1/public/wordbook"), {
      ...source.configured, PUBLIC_SITE_URL: value
    } as unknown as Env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "public_snapshot_unavailable" } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
