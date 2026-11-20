import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Test startup only: execute the actual production resolver in memory instead
// of maintaining a second, incomplete canonical-only implementation here.
// Wrangler already owns this exact esbuild dependency; no packages are added.
const repositoryRoot=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const apiRequire=createRequire(new URL('../../../wordbook-api/package.json',import.meta.url));
const wranglerRequire=createRequire(apiRequire.resolve('wrangler/package.json'));
const {build}=wranglerRequire('esbuild');
const result=await build({
  absWorkingDir:repositoryRoot,
  entryPoints:[join(repositoryRoot,'wordbook-api/src/dictionary-collection.ts')],
  bundle:true,write:false,platform:'node',format:'esm',target:'node22',logLevel:'silent'
});
if(result.outputFiles.length!==1)throw Error('Expected one in-memory production dictionary resolver');
const production=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
const assetRoot=join(repositoryRoot,'vocab');
const assets={fetch:async input=>{
  const url=new URL(input.url);
  if(url.protocol!=='https:'||url.hostname!=='dictionary.internal'||url.search||url.hash
    || !/^\/data\/expanded-dictionary\/(?:manifest\.json|[a-f0-9]{64}\/en-\d{3}\.json)$/u.test(url.pathname)){
    throw Error('Fixture resolver attempted a nonlocal dictionary asset');
  }
  if(input.signal.aborted)throw new DOMException('Aborted','AbortError');
  const bytes=await readFile(join(assetRoot,url.pathname.slice(1)));
  if(input.signal.aborted)throw new DOMException('Aborted','AbortError');
  if(bytes.length>8*1024*1024)throw Error('Fixture dictionary asset exceeds production bound');
  return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});
}};
export const findProductionCollectedEntry=production.findCollectedEntry;
export const resolveProductionDictionaryCollection=term=>production.resolveDictionaryCollection(term,assets);
