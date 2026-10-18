import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const testEnv = env as unknown as Env;

function staticEnvironment(contentType = "text/html") {
  const assets = vi.fn(async () => new Response("first-party static asset", {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" }
  }));
  const model = vi.fn(() => { throw new Error("static OCR must not invoke AI"); });
  return { environment: { ...testEnv, ASSETS: { fetch: assets }, AI: { run: model } } as unknown as Env, assets, model };
}

function directive(response: Response, name: string): string[] {
  const text = response.headers.get("Content-Security-Policy") || "";
  const field = text.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return field?.split(/\s+/u).slice(1) || [];
}

function strictNonExecutionBoundaries(response: Response) {
  const policy = response.headers.get("Content-Security-Policy") || "";
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).not.toContain("'unsafe-inline'");
  expect(policy).not.toMatch(/blob:|jsdelivr|unpkg/iu);
  expect(directive(response, "worker-src")).toEqual(["'self'"]);
  expect(directive(response, "connect-src")).toEqual(["'self'"]);
  expect(directive(response, "object-src")).toEqual(["'none'"]);
  expect(directive(response, "frame-ancestors")).toEqual(["'none'"]);
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
}

describe("capture-only local OCR WebAssembly policy", () => {
  it.each([
    "/capture.html", "/capture.html?release=78",
    "/vendor/tesseract/7.0.0/worker.min.js", "/vendor/tesseract/7.0.0/worker.min.js?v=7.0.0"
  ])("adds only wasm compilation to the exact capture/worker asset response: %s", async (path) => {
    const { environment, assets, model } = staticEnvironment(path.includes("worker.min.js") ? "application/javascript" : "text/html");
    const response = await worker.fetch(new Request(`https://admin.example${path}`), environment);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("first-party static asset");
    expect(directive(response, "script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    strictNonExecutionBoundaries(response);
    expect(assets).toHaveBeenCalledOnce(); expect(model).not.toHaveBeenCalled();
  });

  it.each([
    "/", "/index.html", "/owner.html", "/personal.html", "/guide.html", "/capture",
    "/other/capture.html", "/capture.html/extra", "/vendor/pdfjs/pdf.worker.mjs",
    "/vendor/tesseract/7.0.0/tesseract-core-lstm.wasm.js", "/vendor/tesseract/8.0.0/worker.min.js",
    "/vendor/tesseract/7.0.0/worker.min.js.map", "/vendor/tesseract/7.0.0/worker.min.js/extra"
  ])("does not broaden script policy on other HTML, modules or near-match paths: %s", async (path) => {
    const { environment, model } = staticEnvironment();
    const response = await worker.fetch(new Request(`https://admin.example${path}`), environment);
    expect(response.status).toBe(200);
    expect(directive(response, "script-src")).toEqual(["'self'"]);
    strictNonExecutionBoundaries(response); expect(model).not.toHaveBeenCalled();
  });

  it("wraps the real capture HTML asset and keeps both HTML and PDF module updates revalidated", async () => {
    const actual = await worker.fetch(new Request("https://admin.example/capture.html"), testEnv);
    expect(actual.status).toBe(200);
    expect(actual.headers.get("Content-Type")).toContain("text/html");
    expect(await actual.text()).toContain("capture-auth-gate");
    expect(actual.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
    expect(directive(actual, "script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    const { environment } = staticEnvironment("text/javascript");
    const module = await worker.fetch(new Request("https://admin.example/vendor/pdfjs/pdf.worker.mjs"), environment);
    expect(module.headers.get("Cache-Control")).toBe("no-cache");
    expect(directive(module, "script-src")).toEqual(["'self'"]);
  });

  it.each(["GET", "POST"])("has no %s marked-image API route, image forwarding, quota allocation or fallback", async (method) => {
    const { environment, assets, model } = staticEnvironment();
    const response = await worker.fetch(new Request("https://admin.example/api/v1/owner/marked-words", {
      method, ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: '{"image":"private image data"}' } : {})
    }), environment);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "api_not_found" } });
    expect(directive(response, "script-src")).toEqual(["'self'"]);
    strictNonExecutionBoundaries(response);
    expect(assets).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled();
  });

  it("keeps the existing API health response under the strict non-WASM policy", async () => {
    const response = await worker.fetch(new Request("https://admin.example/api/v1/health"), testEnv);
    expect(response.status).toBe(200);
    expect(directive(response, "script-src")).toEqual(["'self'"]);
    strictNonExecutionBoundaries(response);
  });
});
