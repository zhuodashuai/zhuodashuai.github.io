import { createRequire } from 'node:module';
import { readFile, mkdir, copyFile, cp, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('pdfjs-dist/package.json'));
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../vocab/vendor/pdfjs');
const pkg = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
if (pkg.version !== '6.4.299') throw new Error('Unexpected PDF.js version; review the pinned dependency before vendoring.');
await mkdir(target, { recursive: true });
for (const file of ['pdf.mjs', 'pdf.worker.mjs']) await copyFile(resolve(source, 'legacy/build', file), resolve(target, file));
await copyFile(resolve(source, 'LICENSE'), resolve(target, 'LICENSE'));
await cp(resolve(source, 'standard_fonts'), resolve(target, 'standard_fonts'), { recursive: true });
await writeFile(resolve(target, 'version.json'), JSON.stringify({ name: pkg.name, version: pkg.version, license: pkg.license, repository: pkg.repository }, null, 2) + '\n');
console.log(`Vendored PDF.js ${pkg.version}: legacy browser modules, standard fonts and license.`);
