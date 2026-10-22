import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dictionary direct entry initializes PWA without blocking lookup or forcing an update reload", async () => {
  const html = await readFile(new URL("../dictionary.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../js/dictionary-entry.js", import.meta.url), "utf8");
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/u);
  assert.match(html, /manifest-src 'self'; worker-src 'self'/u);
  assert.match(html, /id="update-banner"[^>]*hidden/u);
  assert.match(html, /id="apply-update"/u);
  assert.match(app, /import \{ setupPwa \} from "\.\/pwa\.js\?v=77"/u);
  assert.match(app, /import \{ installDictionaryOfflineWarm \} from "\.\/dictionary-offline-warm\.js\?v=102"/u);
  assert.match(app, /import "\.\/dictionary-app\.js\?v=99"/u);
  assert.ok(app.indexOf('import "./dictionary-app.js?v=99"') < app.indexOf("setupPwa({"));
  const initialization = app.slice(app.lastIndexOf('if (typeof document !== "undefined"'));
  assert.ok(initialization.indexOf("installDictionaryOfflineWarm()") < initialization.indexOf("setupPwa({"));
  assert.doesNotMatch(initialization, /autoApplyUpdate:\s*true|await navigator\.serviceWorker\.ready/u);
  assert.match(sw, /zhuo-wordbook-v100/u);
  for (const url of ["dictionary.html", "dictionary.css?v=101", "app-navigation.css?v=101", "js/dictionary-entry.js?v=102", "js/dictionary-entry.js", "js/dictionary-offline-warm.js?v=102", "js/dictionary-offline-warm.js", "js/dictionary-app.js?v=99", "js/pwa.js?v=77"]) {
    assert.ok(sw.includes(`"./${url}"`), `Missing direct-entry dependency ${url}`);
  }
});
