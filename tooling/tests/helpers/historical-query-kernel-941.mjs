import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const url=new URL('../../dictionary/query-cache-origins/941690147b97bfd319bda06acf260e0d2c68968f96d44e67d68c43926ef7e8b4/kernel/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let pending;
// These are archived raw source bytes, not a transformation of today's code.
export function loadHistorical941Kernel(){
 return pending??=(async()=>{
  const proofBytes=await readFile(new URL('provenance.json',url));
  assert.equal(sha(proofBytes),'067f46f76e49eb20cc20bdcff0b9445a114e7041c3172967954ae43f7a5edebc','Exact historical941 capture metadata');
  const proof=JSON.parse(proofBytes);assert.equal(proof.kind,'exact-historical941-kernel');assert.equal(proof.files.length,25);
  const pairs=[];for(const file of proof.files){
   assert.match(file.file,/^vocab\/js\/[a-z0-9-]+\.js$/u);
   const bytes=await readFile(new URL(file.file,url));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256,file.file);
   assert.equal(file.gitBlob,file.equalUi124Blob);pairs.push([file.file,file.sha256]);
  }
  pairs.sort(([a],[b])=>a.localeCompare(b));assert.equal(sha(JSON.stringify(pairs)),'4fd8701ee6bda2a2869e28a837b71b31e619f7539d3335e284fdef50479b14e1');
  const bytes=await readFile(new URL('vocab/js/chinese-query-cache-release.js',url));assert.equal(sha(bytes),'ac57572f62c413787165ba041a69e14ee517e19db854adea45cbe10ab64c80ef');
  const text=bytes.toString('utf8'),marker='export const CHINESE_QUERY_CACHE_RELEASE = freeze(';assert.equal(text.split(marker).length,2);assert(text.endsWith(');\n'));
  const release=JSON.parse(text.slice(text.indexOf(marker)+marker.length,-3));
  assert.equal(release.engineBinding,'81a773934d49ddc17a157e06e208026fc5760ea8389ab5b6ca897c542a5da28e');
  assert.equal(release.buildVersion,'941690147b97bfd319bda06acf260e0d2c68968f96d44e67d68c43926ef7e8b4');
  const manifest=await readFile(new URL(proof.sourceManifest.file,url));assert.equal(manifest.length,proof.sourceManifest.bytes);assert.equal(sha(manifest),release.sourceManifestSha256);
  assert.deepEqual(proof.selectionSources,release.selectionSources);assert.equal(proof.selectionSourceRawGitCheck.sha256,release.selectionSources[0].sha256);assert.equal(proof.selectionSourceRawGitCheck.bytes,release.selectionSources[0].bytes);
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  return freeze({root:fileURLToPath(url),url,release,proof});
 })();
}
