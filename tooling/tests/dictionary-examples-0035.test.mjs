// Actual reviewed D35 data, not author draft counts or publication evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {loadAdditiveExampleBuild} from '../scripts/build-dictionary-examples-additive.mjs';
import {validateExampleReview} from '../scripts/build-dictionary-examples.mjs';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
const read=file=>readFile(new URL('../../'+file,import.meta.url));
const build=await loadAdditiveExampleBuild();
const index=JSON.parse(await read('tooling/dictionary/examples/additive-index-v4.json'));
const group=index.releases.find(r=>r.id==='examples-0035'),reviewed=[];
assert.equal(group.sourceFiles.length,25);
for(const file of group.sourceFiles){
 const source=JSON.parse(await read('tooling/dictionary/examples/source/'+file)),review=JSON.parse(await read('tooling/dictionary/examples/reviews/'+file));
 reviewed.push(...validateExampleReview(source,review));
}
test('all398 exact independently reviewed D35 pairs survive the actual normal build and whole previous catalogue',async()=>{
 assert.equal(reviewed.length,398);assert.equal(new Set(reviewed.map(r=>r.term)).size,398);
 assert(build.catalogue.counts.heads>=87660);assert(build.catalogue.counts.examples>=89049);
 assert.equal(build.audit.retainedWholeBaseEntries,86415);assert.deepEqual(build.descriptor,dictionaryExamplesRelease.catalogue);
 const previous=JSON.parse(gunzipSync(await read('vocab/data/dictionary-examples/catalogue-v4/b23d099a9751fff0b497cd003af4009fad8dc3066569c901e3063e31865c3e6c.bin')));
 assert.deepEqual(build.catalogue.deltas.slice(0,previous.deltas.length),previous.deltas);
 const keys=new Map(build.catalogue.keys);for(const [term,id]of previous.keys)assert.equal(keys.get(term),id);
 const installed=new Map();
 for(const d of build.catalogue.deltas){const raw=await read('vocab/data/dictionary-examples/'+d.file);assert.equal(createHash('sha256').update(raw).digest('hex'),d.sha256);for(const row of JSON.parse(gunzipSync(raw)).entries)installed.set(row.term,row);}
 for(const r of reviewed){const e=installed.get(r.term);assert(e,r.term);const s=e.example.senses[0],p=s.examples[0];assert.deepEqual([e.term,s.partOfSpeech,s.meaningZh,p.en,p.zh],[r.term,r.partOfSpeech,r.meaningZh,r.en,r.zh]);}
});
test('the strict runtime client returns every398 selected pair and rejects absent or unrelated literal lookups',async()=>{
 const root=new URL('../../vocab/data/',import.meta.url),files=new Map(),requests=[];
 const fetchImpl=async(url,options={})=>{const target=new URL(url);assert(target.href.startsWith(root.href));assert.equal(target.search,'');assert.equal(target.hash,'');assert.equal(options.credentials,'omit');assert(['GET',undefined].includes(options.method));if(!files.has(target.href))files.set(target.href,await readFile(target));const bytes=files.get(target.href);requests.push(target.href);return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}});};
 const client=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});
 try{for(const r of reviewed){const e=await client.load(r.term,{lookupQuery:r.term});assert(e,r.term);const s=e.senses[0],p=s.examples[0];assert.deepEqual([e.term,s.partOfSpeech,s.meaningZh,p.en,p.zh],[r.term,r.partOfSpeech,r.meaningZh,r.en,r.zh]);assert.equal(await client.load(r.term),null);assert.equal(await client.load(r.term,{lookupQuery:'different unrelated head'}),null);}assert(requests.some(u=>u.includes('/delta-v4/')));assert(requests.some(u=>u.includes('/expanded-dictionary/')));}finally{client.close();}
});
