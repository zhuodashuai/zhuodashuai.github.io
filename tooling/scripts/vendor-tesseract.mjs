import { createRequire } from "node:module";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const api = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json", { paths: [api] }));
const language = dirname(require.resolve("@tesseract.js-data/eng/package.json"));
const packages = await Promise.all([api, core, language].map(async (directory) => JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"))));
if (packages[0].version !== "7.0.0" || packages[1].version !== "7.0.0" || packages[2].version !== "1.0.0") throw new Error("Review OCR dependency versions before vendoring.");
const target = resolve(dirname(fileURLToPath(import.meta.url)), "../../vocab/vendor/tesseract/7.0.0");
await mkdir(resolve(target, "core"), { recursive: true });
await mkdir(resolve(target, "lang"), { recursive: true });
const files = [
  [resolve(api, "dist/worker.min.js"), "worker.min.js"],
  [resolve(api, "dist/worker.min.js.LICENSE.txt"), "worker.min.js.LICENSE.txt"],
  [resolve(core, "LICENSE"), "LICENSE-APACHE-2.0.txt"],
  ...["", "simd-", "relaxedsimd-"].map((variant) => [resolve(core, `tesseract-core-${variant}lstm.wasm.js`), `core/tesseract-core-${variant}lstm.wasm.js`]),
  [resolve(language, "4.0.0_best_int/eng.traineddata.gz"), "lang/eng.traineddata.gz"]
];
const hashes = {};
for (const [source, name] of files) {
  await copyFile(source, resolve(target, name));
  hashes[name] = createHash("sha256").update(await readFile(source)).digest("hex");
}
await writeFile(resolve(target, "version.json"), JSON.stringify({
  engine: "tesseract.js@7.0.0", core: "tesseract.js-core@7.0.0", language: "@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
  sources: packages.map(({ name, version, license, repository }) => ({ name, version, license, repository })),
  note: "Pinned English LSTM-only, same-origin worker/core/language files. No runtime CDN or remote image submission.", hashes
}, null, 2) + "\n");
console.log("Vendored pinned local English OCR worker, three LSTM variants, language data and licenses.");
