// Install at tooling/tests only after exact independently reviewed D36 admission.
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
const build=await loadAdditiveExampleBuild(),index=JSON.parse(await read('tooling/dictionary/examples/additive-index-v4.json'));
const receipt=JSON.parse(await read('tooling/dictionary/examples/queues/batch-0036-admission-receipt.json'));
const group=index.releases.find(r=>r.id==='examples-0036'),reviewed=[];
assert(group);assert.deepEqual(group.sourceFiles,receipt.standardPacks.map(p=>p.file));
for(const file of group.sourceFiles){
 const source=JSON.parse(await read('tooling/dictionary/examples/source/'+file)),review=JSON.parse(await read('tooling/dictionary/examples/reviews/'+file));
 reviewed.push(...validateExampleReview(source,review));
}
const admitted=receipt.standardPacks.reduce((n,g)=>n+g.heads,0);
assert.equal(admitted,556);assert.equal(reviewed.length,admitted);
test('every exact D36 reviewed pair survives the normal build while all prior immutable examples remain intact',async()=>{
 assert.equal(new Set(reviewed.map(r=>r.term)).size,admitted);
 assert(build.catalogue.counts.heads>=87660+admitted);assert(build.catalogue.counts.examples>=89049+admitted);
 assert.equal(build.audit.retainedWholeBaseEntries,86415);assert.deepEqual(build.descriptor,dictionaryExamplesRelease.catalogue);
 const previous=JSON.parse(gunzipSync(await read('vocab/data/dictionary-examples/catalogue-v4/4191b9ceb5740892393f3a4c4124d1d403df4780fc4c932bf973736f55745e0b.bin')));
 assert.deepEqual(previous.counts,{heads:87660,examples:89049});
 assert.deepEqual(build.catalogue.deltas.slice(0,previous.deltas.length),previous.deltas);
 const keys=new Map(build.catalogue.keys);for(const[term,id]of previous.keys)assert.equal(keys.get(term),id);
 const installed=new Map();
 for(const d of build.catalogue.deltas){const raw=await read('vocab/data/dictionary-examples/'+d.file);assert.equal(createHash('sha256').update(raw).digest('hex'),d.sha256);for(const row of JSON.parse(gunzipSync(raw)).entries)installed.set(row.term,row);}
 for(const r of reviewed){const e=installed.get(r.term);assert(e,r.term);const s=e.example.senses[0],p=s.examples[0];assert.deepEqual([e.term,s.partOfSpeech,s.meaningZh,p.en,p.zh],[r.term,r.partOfSpeech,r.meaningZh,r.en,r.zh]);}
});
test('strict runtime resolves all D36 literal heads with exact bilingual selected senses and rejects unrelated lookups',async()=>{
 const root=new URL('../../vocab/data/',import.meta.url),files=new Map(),requests=[];
 const fetchImpl=async(url,options={})=>{const target=new URL(url);assert(target.href.startsWith(root.href));assert.equal(target.search,'');assert.equal(target.hash,'');assert.equal(options.credentials,'omit');assert(['GET',undefined].includes(options.method));if(!files.has(target.href))files.set(target.href,await readFile(target));const bytes=files.get(target.href);requests.push(target.href);return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}});};
 const client=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});
 try{for(const r of reviewed){const e=await client.load(r.term,{lookupQuery:r.term});assert(e,r.term);const s=e.senses[0],p=s.examples[0];assert.deepEqual([e.term,s.partOfSpeech,s.meaningZh,p.en,p.zh],[r.term,r.partOfSpeech,r.meaningZh,r.en,r.zh]);assert.equal(await client.load(r.term),null);assert.equal(await client.load(r.term,{lookupQuery:'different unrelated head'}),null);}assert(requests.some(u=>u.includes('/delta-v4/')));assert(requests.some(u=>u.includes('/expanded-dictionary/')));}finally{client.close();}
});
