import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const profileHtml = await readFile(new URL("../../index.html", import.meta.url), "utf8");

async function pngDimensions(path) {
  const bytes = await readFile(new URL(path, import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("PWA publishes separate any and safe maskable icons at declared sizes", async () => {
  const anyIcons = manifest.icons.filter((icon) => icon.purpose === "any");
  const maskableIcons = manifest.icons.filter((icon) => icon.purpose === "maskable");
  assert.equal(anyIcons.length, 2);
  assert.equal(maskableIcons.length, 2);
  for (const icon of manifest.icons) {
    const size = Number(icon.sizes.split("x")[0]);
    assert.deepEqual(await pngDimensions(`../${icon.src}`), { width: size, height: size });
  }
});

test("quality evidence is network-first with an offline fallback", () => {
  const reportRoute = serviceWorker.indexOf('url.pathname.endsWith("/quality/generated-report.json")');
  const reportNetworkFirst = serviceWorker.indexOf('networkFirst(request, "./quality/generated-report.json")');
  const genericCacheFirst = serviceWorker.lastIndexOf("event.respondWith(cacheFirst(request))");
  assert.ok(reportRoute >= 0);
  assert.ok(reportNetworkFirst > reportRoute);
  assert.ok(genericCacheFirst > reportNetworkFirst);
  assert.match(serviceWorker, /cache\.match\(request\)\) \|\| \(await cache\.match\(fallback\)\) \|\| response/);
  assert.match(serviceWorker, /cache\.match\(fallback\)\) \|\| Response\.error\(\)/);
});

test("the academic profile provides a discoverable route to the word cabinet", () => {
  assert.match(profileHtml, /href="vocab\/"[^>]*>卓同学的秘密单词屋/);
});
