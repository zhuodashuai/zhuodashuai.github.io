// One-time exact D22 baseline archive for the next finite source transition.
// This copies authenticated bytes; it does not authorize any source revision.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const ROOT=path.resolve(import.meta.dirname,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const POS_NOTATION_BASELINES=Object.freeze([
 Object.freeze({kind:'dictionary',source:'vocab/data/expanded-dictionary/manifest.json',
  version:'9f27bbc2f083007095b2e6830a87b2d0a7e18353f91a2e962b82443b2480339b',
  sha256:'c609196db70d0563c9ea92136cf6e4bd2d958359c954058f88862f1839d207b7',
  output:'tooling/dictionary/source-revisions/baseline-9f27bbc2f083007095b2e6830a87b2d0a7e18353f91a2e962b82443b2480339b.manifest.json'}),
 Object.freeze({kind:'examples',source:'vocab/data/dictionary-examples/manifest-v2.json',
  version:'e929d35b959c01772ab80d36db38775c7ecf8d4490c28c6928a3d29674f30ebc',
  sha256:'27ec47fe51962cacf4a1829eb8c3bf71d4d2ea4bcd9eea39f92cba43863c86e1',
  output:'tooling/dictionary/examples/archives/baseline-e929d35b959c01772ab80d36db38775c7ecf8d4490c28c6928a3d29674f30ebc.manifest.json'})
]);
export async function archivePosNotationBaselines({root=ROOT}={}){
 const ready=[];
 for(const pin of POS_NOTATION_BASELINES){
  const source=path.join(root,pin.source),bytes=await fs.readFile(source);
  assert.equal(sha(bytes),pin.sha256,'Only the actual unchanged published D22 manifest can be archived');
  const manifest=JSON.parse(bytes);assert.equal(manifest.version,pin.version);
  const descriptors=pin.kind==='dictionary'?[...manifest.english.shards,...manifest.chinese.shards]:manifest.shards;
  assert.equal(descriptors.length,256);
  if(pin.kind==='dictionary')assert.deepEqual(manifest.counts,{records:102609,englishKeys:140858,chineseTokens:160071});
  else assert.deepEqual(manifest.counts,{heads:85259,examples:86648});
  for(const descriptor of descriptors){
   assert(descriptor.file.startsWith(pin.version+'/')&&!descriptor.file.includes('..'));
   const shard=await fs.readFile(path.join(path.dirname(source),descriptor.file));
   assert.equal(shard.length,descriptor.bytes);assert.equal(sha(shard),descriptor.sha256);
  }
  const output=path.join(root,pin.output);
  try{await fs.lstat(output);assert.fail('Refusing to overwrite an existing baseline archive');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  ready.push({pin,source,bytes,output});
 }
 // Check both live pointers again before creating either immutable archive.
 for(const row of ready)assert.deepEqual(await fs.readFile(row.source),row.bytes,'Baseline moved during archive validation');
 const result=[];
 for(const row of ready){
  await fs.mkdir(path.dirname(row.output),{recursive:true});await fs.writeFile(row.output,row.bytes,{flag:'wx'});
  assert.deepEqual(await fs.readFile(row.output),row.bytes);
  result.push({file:row.pin.output,version:row.pin.version,sha256:row.pin.sha256,bytes:row.bytes.length,physicalShardsChecked:256});
 }
 return{stage:'exact-historical-baselines-archived-not-source-revision-approval',files:result,sourceChangesApplied:0,exampleCoverageAdded:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.argv.length,2,'This finite archive tool has no modes or input overrides');
 console.log(JSON.stringify(await archivePosNotationBaselines()));
}
