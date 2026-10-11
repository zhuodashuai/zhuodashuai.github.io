import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));

for (const path of ["/api/v1/public/wordbook", "/data/owner-wordbook.json"]) {
  test(`production-like gzip preserves the full public catalogue at ${path}`, async ({ request }) => {
    const headers = { Cookie: "e2e_run=transport-test" };
    const compressed = await request.get(path, { headers: { ...headers, "Accept-Encoding": "gzip" } });
    const identity = await request.get(path, { headers: { ...headers, "Accept-Encoding": "gzip;q=0, identity" } });
    expect(compressed.status()).toBe(200);
    expect(identity.status()).toBe(200);
    expect(compressed.headers()["content-encoding"]).toBe("gzip");
    expect(identity.headers()["content-encoding"]).toBeUndefined();
    expect(compressed.headers().vary).toContain("Accept-Encoding");
    if (path.startsWith("/api/")) expect(compressed.headers().vary).toContain("Origin");
    const data = await compressed.json();
    expect(data).toEqual(await identity.json());
    expect(data.entries.map(entry => entry.id)).toEqual(source.entries.map(entry => entry.id));
    expect(Number(compressed.headers()["content-length"])).toBeLessThan(Number(identity.headers()["content-length"]) / 2);
  });
}

test("fixture compression also preserves the mutable JavaScript module", async ({ request }) => {
  const compressed = await request.get("/js/wordbook-schema.js", { headers: { "Accept-Encoding": "gzip" } });
  const identity = await request.get("/js/wordbook-schema.js", { headers: { "Accept-Encoding": "identity" } });
  expect(compressed.headers()["content-encoding"]).toBe("gzip");
  expect(identity.headers()["content-encoding"]).toBeUndefined();
  expect(await compressed.text()).toBe(await identity.text());
});
