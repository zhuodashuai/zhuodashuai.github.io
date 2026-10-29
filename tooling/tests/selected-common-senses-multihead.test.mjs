import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { validateSelectedCommonSenseBindings, renderSelectedCommonSenseModule, selectedGroupSourceHash as hash } from '../scripts/build-selected-common-senses.mjs';
import { validateReviewedSensePack, reviewedSensePackHash } from '../scripts/build-reviewed-dictionary-senses.mjs';
import { canonicalSourceBucket, canonicalDisplayContexts } from '../../vocab/js/canonical-example-repair-source.js';
import { createAdditiveExamplesLoader } from '../../vocab/js/dictionary-examples-additive.js';
import { dictionaryExamplesRelease } from '../../vocab/js/dictionary-examples-release-v4.js';
import { REVIEWED_SENSE_ENTRIES } from '../../vocab/js/reviewed-senses-data.js';
import { COMMON_CHINESE_GROUPS } from '../../vocab/js/chinese-related-common.js';
import { SELECTED_COMMON_SENSE_BINDINGS } from '../../vocab/js/selected-common-sense-data.js';

const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url)));
const originalSource=await read('../dictionary/selected-common-senses/source/batch-0001.json'),originalEntry=originalSource.entries[0],group=(await read('../dictionary/chinese-related-common.json')).groups.find(g=>g.id===originalEntry.groupId),runtimeGroup=COMMON_CHINESE_GROUPS.find(g=>g.id===group.id),manifest=await read('../../vocab/data/expanded-dictionary/manifest.json');
const dutyDescriptor=manifest.english.shards[canonicalSourceBucket('duty')],dutyBytes=await fs.readFile(new URL('../../vocab/data/expanded-dictionary/'+dutyDescriptor.file,import.meta.url));
assert.equal(createHash('sha256').update(dutyBytes).digest('hex'),dutyDescriptor.sha256);
const dutyRecord=JSON.parse(dutyBytes).records.find(r=>r.term==='duty');assert(dutyRecord);
const originalPack=await read('../dictionary/reviewed-senses/source/batch-0010.json');
// This second head is an explicit test-only independently reviewed source.
// No runtime data override or caller approval option is added to production.
const dutyRow={term:'duty',partOfSpeech:'noun',meaning:'① 义务；职责；责任。',chineseAliases:['职责'],englishForms:[],en:'It is my duty to check the doors.',zh:'检查这些门是我的职责。',references:['https://www.merriam-webster.com/dictionary/duty'],canonicalId:dutyRecord.id,canonicalSourceSha256:hash(dutyRecord)};
const dutyPack={schemaVersion:1,author:'AI/fixture_selected_author',entries:[dutyRow],exampleSource:'原创学习例句'},dutyReview={schemaVersion:1,sourceSha256:reviewedSensePackHash(dutyPack),reviewer:'AI/fixture_selected_other_reader',independentOfAuthor:true,approvedTerms:['duty'],issues:[]};
const compiledDuty=validateReviewedSensePack(dutyPack,dutyReview,new Map([['duty',dutyRecord]]))[0];
const loader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:async input=>{const u=new URL(input);assert.equal(u.protocol,'file:');return new Response(await fs.readFile(u));}});
let dutyDTO;try{dutyDTO=await loader.load('duty',{lookupQuery:'duty'});}finally{loader.close();}
assert(dutyDTO);
function proof(row){let key=0xcbf29ce484222325n;for(const char of row.term){key^=BigInt(char.codePointAt(0));key=BigInt.asUintN(64,key*0x100000001b3n);}return{id:'reviewed-sense:'+key.toString(16).padStart(16,'0'),partOfSpeech:row.partOfSpeech,meaningZh:row.meaning,examples:[{en:row.en,zh:row.zh}]};}
const dutyEntry={...originalEntry,head:'duty',canonicalId:dutyRecord.id,canonicalSourceSha256:hash(dutyRecord),canonicalShard:{bucket:dutyDescriptor.bucket,file:dutyDescriptor.file,sha256:dutyDescriptor.sha256,bytes:dutyDescriptor.bytes},canonicalRecord:dutyRecord,selectedBatch:'batch-9911.json',selectedSourceSha256:hash(dutyPack),selectedRowSha256:hash(dutyRow),selectedRow:dutyRow,directTerms:[...new Set(group.evidence.filter(r=>r.head==='duty').flatMap(r=>r.terms))],selectedExampleProof:proof(dutyRow),originalGroupExampleProofs:runtimeGroup.exampleSenses.duty,originalDTO:dutyDTO,originalDTOSha256:hash(dutyDTO),legacySavedContexts:canonicalDisplayContexts(dutyRecord),reason:'TEST-ONLY: second independently reviewed head in the same actual social-duty group. Never indexed or published.'};
const fixtureSource={schemaVersion:1,author:'AI/fixture_group_author',entries:[originalEntry,dutyEntry]},fixtureReview={schemaVersion:1,sourceSha256:hash(fixtureSource),reviewer:'AI/fixture_group_other_reader',independentOfAuthor:true,approvedHeads:['obligation','duty'],issues:[]};
const context={groups:new Map([[group.id,group]]),runtimeGroups:new Map([[group.id,runtimeGroup]]),groupExampleScopes:new Map([[group.id,runtimeGroup.exampleSenses]]),canonicalRecords:new Map([['obligation',originalEntry.canonicalRecord],['duty',dutyRecord]]),canonicalLocations:new Map([['obligation',manifest.english.shards[originalEntry.canonicalShard.bucket]],['duty',dutyDescriptor]]),manifestVersion:manifest.version,selections:new Map([['obligation',{batch:'batch-0010.json',pack:originalPack,row:originalEntry.selectedRow}],['duty',{batch:'batch-9911.json',pack:dutyPack,row:dutyRow}]]),originalDTOs:new Map([['obligation',originalEntry.originalDTO],['duty',dutyDTO]])};
const twoBindings=validateSelectedCommonSenseBindings(fixtureSource,fixtureReview,context);assert.equal(twoBindings.length,2);
const deepModule=(name,value)=>`const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};export const ${name}=freeze(${JSON.stringify(value)});\n`;
async function isolatedModule({staleFirst=false}={}){
  const dir=await fs.mkdtemp(path.join(tmpdir(),'zhuo-selected-common-fixture-'));
  const selected=[REVIEWED_SENSE_ENTRIES.find(r=>r.term==='obligation'),compiledDuty].map(r=>structuredClone(r));
  if(staleFirst)selected[0].meaning+=' changed without approved mapping';
  await fs.writeFile(path.join(dir,'package.json'),'{"type":"module"}\n');
  await fs.writeFile(path.join(dir,'selected-common-sense.js'),await fs.readFile(new URL('../../vocab/js/selected-common-sense.js',import.meta.url)));
  await fs.writeFile(path.join(dir,'chinese-related-common.js'),deepModule('COMMON_CHINESE_GROUPS',[runtimeGroup]));
  await fs.writeFile(path.join(dir,'reviewed-senses-data.js'),deepModule('REVIEWED_SENSE_ENTRIES',selected));
  await fs.writeFile(path.join(dir,'selected-common-sense-data.js'),renderSelectedCommonSenseModule(twoBindings));
  const api=await import(pathToFileURL(path.join(dir,'selected-common-sense.js')));
  return{api,async close(){const actual=await fs.realpath(dir),parent=await fs.realpath(tmpdir());assert(actual.startsWith(parent+path.sep));assert(path.basename(actual).startsWith('zhuo-selected-common-fixture-'));await fs.rm(actual,{recursive:true,force:true});}};
}
const originFor=entry=>({manifestVersion:entry.canonicalManifestVersion,...entry.canonicalShard,rawRecordJSON:JSON.stringify(entry.canonicalRecord)});

test('two independently approved distinct heads in one legitimate group both resolve their own source and example',async()=>{
  const fixture=await isolatedModule();try{
    for(const entry of[originalEntry,dutyEntry])for(const query of group.terms){const result=fixture.api.selectedCommonSenseCandidate(entry.canonicalRecord,originFor(entry),query);assert(result,entry.head+'/'+query+' must survive another bound head');assert.equal(result.result.term,entry.head);assert.equal(result.result.meaning,entry.selectedRow.meaning);assert.equal(result.result.source,'卓式词典·义项补充');assert.deepEqual(result.result.matchedExampleSenseEvidence,[entry.selectedExampleProof]);}
    for(const entry of[originalEntry,dutyEntry]){assert.equal(fixture.api.selectedCommonSenseCandidate({...entry.canonicalRecord,id:0},originFor(entry),'义务'),null);assert.equal(fixture.api.selectedCommonSenseCandidate(entry.canonicalRecord,{...originFor(entry),rawRecordJSON:'{}'},'义务'),null);}
    assert.equal(fixture.api.hasSelectedCommonSensePlan('义务'),true);assert.equal(fixture.api.hasSelectedCommonSensePlan('财务债券'),false);
  }finally{await fixture.close();}
  assert.equal(SELECTED_COMMON_SENSE_BINDINGS.length,1,'test authority never changes the default published mapping');
});

test('one stale binding cannot shadow another active head in the same group',async()=>{
  const fixture=await isolatedModule({staleFirst:true});try{
    assert.equal(fixture.api.hasSelectedCommonSensePlan('义务'),true);
    assert.equal(fixture.api.selectedCommonSenseCandidate(originalEntry.canonicalRecord,originFor(originalEntry),'义务'),null);
    const result=fixture.api.selectedCommonSenseCandidate(dutyRecord,originFor(dutyEntry),'义务');assert(result);assert.equal(result.result.term,'duty');assert.deepEqual(result.result.matchedExampleSenseEvidence,[dutyEntry.selectedExampleProof]);
  }finally{await fixture.close();}
});
