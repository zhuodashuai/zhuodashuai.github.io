import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config";
import { MAX_GITHUB_JSON_BYTES, MAX_SNAPSHOT_BYTES, readRemoteWordbook, writeRemoteWordbook } from "../src/github";
import type { PublicSnapshot } from "../src/schema";
import published from "../../vocab/data/owner-wordbook.json";
import { entry, snapshot } from "./fixtures";

const config: AppConfig = {
  PUBLIC_SITE_URL: "https://zhuodashuai.github.io/vocab/", GITHUB_OWNER: "zhuodashuai", GITHUB_OWNER_ID: 156042078,
  GITHUB_REPOSITORY: "zhuodashuai.github.io", GITHUB_REPOSITORY_ID: 1309360291, GITHUB_BRANCH: "main",
  GITHUB_WORDBOOK_PATH: "vocab/data/owner-wordbook.json", AI_PROVIDER: "cloudflare"
};
const url = "https://api.github.com/repos/zhuodashuai/zhuodashuai.github.io/contents/vocab/data/owner-wordbook.json?ref=main";
const encoder = new TextEncoder();

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function blobSha(bytes: Uint8Array): Promise<string> {
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const blob = new Uint8Array(header.length + bytes.length);
  blob.set(header);
  blob.set(bytes, header.length);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-1", blob))].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function metadata(overrides: Record<string, unknown> = {}) {
  return { type: "file", sha: "a".repeat(40), html_url: "https://github.com/file", encoding: "none", content: "", ...overrides };
}

function oversizedStream(limit: number) {
  const cancel = vi.fn();
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent > limit) { controller.close(); return; }
      const size = Math.min(1_000_000, limit - sent + 1);
      controller.enqueue(new Uint8Array(size).fill(32));
      sent += size;
    },
    cancel
  }, { highWaterMark: 0 });
  return { response: new Response(body), cancel };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("bounded GitHub wordbook transport", () => {
  it("reads the expanded snapshot through raw content and writes it with the same CAS SHA", async () => {
    const bytes = encoder.encode(`${JSON.stringify(published, null, 2)}\n`);
    expect(bytes.length).toBeGreaterThan(1_000_000);
    expect(bytes.length).toBeLessThan(MAX_SNAPSHOT_BYTES);
    const sha = await blobSha(bytes);
    const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (init.method === "PUT") {
        const body = JSON.parse(String(init.body));
        expect(body.sha).toBe(sha);
        expect(body.branch).toBe("main");
        const decoded = Uint8Array.from(atob(body.content), (character) => character.charCodeAt(0));
        expect(JSON.parse(new TextDecoder().decode(decoded))).toEqual(published);
        expect(decoded.length).toBeLessThan(MAX_SNAPSHOT_BYTES);
        return Response.json({ content: { sha: "b".repeat(40) }, commit: { sha: "c".repeat(40) } });
      }
      expect(String(input)).toBe(url);
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-token");
      if (new Headers(init.headers).get("accept") === "application/vnd.github.raw+json") return new Response(bytes);
      expect(new Headers(init.headers).get("accept")).toBe("application/vnd.github.object+json");
      return Response.json(metadata({ sha, size: bytes.length, download_url: "https://untrusted.invalid/file" }));
    });
    vi.stubGlobal("fetch", mock);
    const remote = await readRemoteWordbook("test-token", config);
    expect(remote.snapshot).toEqual(published);
    await expect(writeRemoteWordbook({ token: "test-token", config, expectedSha: remote.sha, snapshot: remote.snapshot, message: "Update wordbook" })).resolves.toMatchObject({ sha: "b".repeat(40) });
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("still reads base64 content without a second request", async () => {
    const document = snapshot();
    const mock = vi.fn(async () => Response.json(metadata({ encoding: "base64", content: encode(encoder.encode(JSON.stringify(document))) })));
    vi.stubGlobal("fetch", mock);
    expect((await readRemoteWordbook("test-token", config)).snapshot).toEqual(document);
    expect(mock).toHaveBeenCalledOnce();
  });

  it("fails closed if the raw bytes no longer match the metadata SHA", async () => {
    const mock = vi.fn().mockResolvedValueOnce(Response.json(metadata())).mockResolvedValueOnce(Response.json(snapshot()));
    vi.stubGlobal("fetch", mock);
    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({ status: 409, code: "github_conflict" });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("rejects declared oversized files before requesting their raw content", async () => {
    const mock = vi.fn(async () => Response.json(metadata({ size: MAX_SNAPSHOT_BYTES + 1 })));
    vi.stubGlobal("fetch", mock);
    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({ status: 413, code: "snapshot_too_large" });
    expect(mock).toHaveBeenCalledOnce();
  });

  it("enforces decoded base64 bytes even when the metadata understates size", async () => {
    const content = encode(new Uint8Array(MAX_SNAPSHOT_BYTES + 1));
    expect(encoder.encode(JSON.stringify(metadata({ content }))).length).toBeLessThan(MAX_GITHUB_JSON_BYTES);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(metadata({ size: 1, encoding: "base64", content }))));
    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({ status: 413, code: "snapshot_too_large" });
  });

  it("stops oversized raw bodies without relying on Content-Length", async () => {
    const stream = oversizedStream(MAX_SNAPSHOT_BYTES);
    const mock = vi.fn().mockResolvedValueOnce(Response.json(metadata({ size: 1 }))).mockResolvedValueOnce(stream.response);
    vi.stubGlobal("fetch", mock);
    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({ status: 413, code: "snapshot_too_large" });
    expect(stream.cancel).toHaveBeenCalledOnce();
  });

  it("rejects oversized wrapper Content-Length before reading the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "Content-Length": String(MAX_GITHUB_JSON_BYTES + 1) } })));
    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({ status: 502, code: "github_response_too_large" });
  });

  it("stops oversized JSON wrappers with absent Content-Length", async () => {
    const stream = oversizedStream(MAX_GITHUB_JSON_BYTES);
    vi.stubGlobal("fetch", vi.fn(async () => stream.response));
    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({ status: 502, code: "github_response_too_large" });
    expect(stream.cancel).toHaveBeenCalledOnce();
  });

  it("keeps malformed raw JSON and upstream rate limits as explicit safe failures", async () => {
    const bytes = encoder.encode("not JSON");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(metadata({ sha: await blobSha(bytes) }))).mockResolvedValueOnce(new Response(bytes)));
    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({ status: 409, code: "invalid_remote_snapshot" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(metadata())).mockResolvedValueOnce(Response.json({ message: "Rate limit" }, { status: 429, headers: { "Retry-After": "30" } })));
    await expect(readRemoteWordbook("test-token", config)).rejects.toMatchObject({ status: 429, code: "github_rate_limited" });
  });

  it("retains a write size limit measured in UTF-8 bytes and never sends an oversized file", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    const document = snapshot([entry({ usage: "中".repeat(Math.ceil(MAX_SNAPSHOT_BYTES / 3)) })]) as PublicSnapshot;
    await expect(writeRemoteWordbook({ token: "test-token", config, expectedSha: "a".repeat(40), snapshot: document, message: "Too large" })).rejects.toMatchObject({ status: 413, code: "snapshot_too_large" });
    expect(mock).not.toHaveBeenCalled();
  });
});
