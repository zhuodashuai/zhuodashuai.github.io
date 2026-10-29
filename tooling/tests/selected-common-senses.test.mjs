import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateSelectedCommonSenseBindings, selectedGroupSourceHash, loadSelectedCommonSenseBuild } from '../scripts/build-selected-common-senses.mjs';
import { COMMON_CHINESE_GROUPS } from '../../vocab/js/chinese-related-common.js';
import { REVIEWED_SENSE_ENTRIES } from '../../vocab/js/reviewed-senses-data.js';
import { SELECTED_COMMON_SENSE_BINDINGS } from '../../vocab/js/selected-common-sense-data.js';
import { selectedCommonSenseCandidate, selectedGroupOriginalContext, matchesSelectedGroupOriginalDTO } from '../../vocab/js/selected-common-sense.js';
import { searchExpandedDictionary, searchRelatedChineseDictionary } from '../../vocab/js/expanded-dictionary.js';
import { loadDictionaryExamples } from '../../vocab/js/dictionary-examples-current-v4.js';
import { dictionaryExampleSensePlan } from '../../vocab/js/dictionary-app.js';
import { lookupPersonalDictionaryFast } from '../../vocab/js/personal-lookup-flow.js';

const read = async path => JSON.parse(await fs.readFile(new URL(path,import.meta.url)));
const source = await read('../dictionary/selected-common-senses/source/batch-0001.json');
const review = await read('../dictionary/selected-common-senses/reviews/batch-0001.json');
const rawGroup = (await read('../dictionary/chinese-related-common.json')).groups.find(g=>g.id==='common-240');
const pack = await read('../dictionary/reviewed-senses/source/batch-0010.json');
const entry = source.entries[0],binding=SELECTED_COMMON_SENSE_BINDINGS.find(r=>r.head==='obligation');
const manifest=await read('../../vocab/data/expanded-dictionary/manifest.json'),descriptor=manifest.english.shards[entry.canonicalShard.bucket];
const actualBytes=await fs.readFile(new URL('../../vocab/data/expanded-dictionary/'+descriptor.file,import.meta.url));
assert.equal(createHash('sha256').update(actualBytes).digest('hex'),descriptor.sha256);
const actualRecord=JSON.parse(actualBytes).records.find(r=>r.id===entry.canonicalId);assert.deepEqual(actualRecord,entry.canonicalRecord);
const originalExampleScopes=new Map((await read('../dictionary/chinese-related-common-examples.json')).groups.map(g=>[g.id,g.heads]));
const context={groups:new Map([[rawGroup.id,rawGroup]]),runtimeGroups:new Map(COMMON_CHINESE_GROUPS.map(g=>[g.id,g])),groupExampleScopes:originalExampleScopes,canonicalRecords:new Map([[entry.head,actualRecord]]),canonicalLocations:new Map([[entry.head,descriptor]]),manifestVersion:manifest.version,selections:new Map([[entry.head,{batch:'batch-0010.json',pack,row:pack.entries[0]}]]),originalDTOs:new Map([[entry.head,entry.originalDTO]])};
const clone=structuredClone;
const origin={manifestVersion:entry.canonicalManifestVersion,...entry.canonicalShard,rawRecordJSON:JSON.stringify(actualRecord)};
function localFetch() {
  const requests=[];
  return {requests,fetchImpl:async(input,options)=>{const url=new URL(input);assert.equal(url.protocol,'file:');assert(url.pathname.includes('/vocab/data/'));assert.equal(url.search,'');assert(!options?.method || options.method==='GET');requests.push(url.href);return new Response(await fs.readFile(url));}};
}

test('selected common-sense mapping consumes actual independent finite source and preserves all484 old groups',()=>{
  assert.equal(COMMON_CHINESE_GROUPS.length,484);assert.equal(SELECTED_COMMON_SENSE_BINDINGS.length,1);
  assert.equal(REVIEWED_SENSE_ENTRIES.length,172);assert.equal(new Set(REVIEWED_SENSE_ENTRIES.map(r=>r.term)).size,172);
  const rows=validateSelectedCommonSenseBindings(source,review,context);assert.equal(rows.length,1);assert.deepEqual(rows[0],binding);
  assert.equal(binding.sourceId,'pwn30:01129920-n');assert.deepEqual(binding.runtimeGroup,COMMON_CHINESE_GROUPS.find(g=>g.id==='common-240'));
  assert.deepEqual(binding.runtimeGroup.heads,['duty','responsibility','obligation']);assert.equal(binding.canonicalId,374313);
  assert.equal(entry.originalDTO.senses[0].examples[0].en,'I felt an obligation to keep my promise.');
});

test('compiled selected group exactly rebuilds through full selected-source and immutable example authentication',async()=>{
  const built=await loadSelectedCommonSenseBuild();assert.equal(built.rows.length,1);assert.deepEqual(built.rows,SELECTED_COMMON_SENSE_BINDINGS);
  assert.equal(await fs.readFile(new URL('../../vocab/js/selected-common-sense-data.js',import.meta.url),'utf8'),built.source);
});

test('personal native bound-group lookup uses complete authenticated source instead of returning an old partial hot group',async()=>{
  const local=localFetch();let hot=0,full=0;
  const result=await lookupPersonalDictionaryFast('责任',{hotLookup:()=>{hot++;throw Error('Unexpected hot English lookup');},hotReverse:()=>{hot++;return{results:[{term:'duty'}],hasMore:false};},fullSearch:(input,options)=>{full++;return searchExpandedDictionary(input,{...options,fetchImpl:local.fetchImpl});}});
  assert.equal(hot,0);assert.equal(full,1);assert.deepEqual(result.results.map(r=>r.term),['responsibility','duty','obligation']);assert.equal(result.results[2].source,'卓式词典·义项补充');
});

const changes=[
 ['changed complete canonical seed',s=>{s.entries[0].canonicalRecord.seed.rank++;s.entries[0].canonicalSourceSha256=selectedGroupSourceHash(s.entries[0].canonicalRecord);}],
 ['changed complete canonical variant',s=>{s.entries[0].canonicalRecord.variants[0].meaning+=' unrelated';s.entries[0].canonicalSourceSha256=selectedGroupSourceHash(s.entries[0].canonicalRecord);}],
 ['wrong canonical id',s=>{s.entries[0].canonicalId++;}],
 ['stale canonical hash',s=>{s.entries[0].canonicalSourceSha256='0'.repeat(64);}],
 ['wrong source shard',s=>{s.entries[0].canonicalShard.sha256='0'.repeat(64);}],
 ['wrong WordNet source id',s=>{s.entries[0].sourceId='pwn30:01129921-n';}],
 ['wrong group POS',s=>{s.entries[0].groupPos='verb';}],
 ['wrong group member',s=>{s.entries[0].head='tariff';}],
 ['changed group meaning',s=>{s.entries[0].groupSense='财务债券';}],
 ['wrong group hash',s=>{s.entries[0].groupSha256='0'.repeat(64);}],
 ['changed selected source pack',s=>{s.entries[0].selectedSourceSha256='0'.repeat(64);}],
 ['changed selected row',s=>{s.entries[0].selectedRow.meaning='① 财务债券';s.entries[0].selectedRowSha256=selectedGroupSourceHash(s.entries[0].selectedRow);}],
 ['unknown selected batch',s=>{s.entries[0].selectedBatch='batch-9999.json';}],
 ['changed direct related partition',s=>{s.entries[0].directTerms=['义务','职责','责任'];}],
 ['old example id claimed for new selected example',s=>{s.entries[0].selectedExampleProof.id='example:obligation';}],
 ['new pair attached to old immutable DTO',s=>{s.entries[0].originalDTO.senses[0].examples=[{en:s.entries[0].selectedRow.en,zh:s.entries[0].selectedRow.zh}];s.entries[0].originalDTOSha256=selectedGroupSourceHash(s.entries[0].originalDTO);}],
 ['truncated old full saved gloss',s=>{s.entries[0].legacySavedContexts[0].meaning='义务';}],
 ['a caller approval flag',s=>{s.entries[0].approved=true;}],
];
for(const [name,mutate]of changes)test(`finite selected group rejects ${name} even after recomputed outer source hash`,()=>{
  const changed=clone(source);mutate(changed);assert.throws(()=>validateSelectedCommonSenseBindings(changed,{...review,sourceSha256:selectedGroupSourceHash(changed)},context));
});
test('finite selected group rejects missing, stale, same-author and unresolved reviews',()=>{
  for(const bad of[undefined,{...review,sourceSha256:'0'.repeat(64)},{...review,reviewer:source.author},{...review,independentOfAuthor:false},{...review,approved:true},{...review,issues:[{term:'obligation',blocking:true,resolution:''}]}])assert.throws(()=>validateSelectedCommonSenseBindings(source,bad,context));
});

test('selected group builder rejects drift of old runtime POS, members, source evidence and another member example',()=>{
  for(const mutate of[g=>{g.pos='verb';},g=>{g.heads=['obligation','tariff'];},g=>{g.evidence[0].meaning+=' changed';},g=>{g.exampleSenses.duty[0].examples[0].zh+=' changed';}]){
    const group=clone(COMMON_CHINESE_GROUPS.find(g=>g.id==='common-240'));mutate(group);
    assert.throws(()=>validateSelectedCommonSenseBindings(source,review,{...context,runtimeGroups:new Map([['common-240',group]])}),/runtime group or complete original example scope drifted/u);
  }
});

test('service worker preserves existing cache namespace and installs both new finite source-binding modules',async()=>{
  const sw=await fs.readFile(new URL('../../vocab/sw.js',import.meta.url),'utf8');assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100";'));assert(sw.includes('"./js/selected-common-sense.js"'));assert(sw.includes('"./js/selected-common-sense-data.js"'));
});

test('runtime selected projection requires complete private verified origin and exact literal canonical identity',()=>{
  const actual=selectedCommonSenseCandidate(actualRecord,origin,'义务');assert(actual);assert.equal(actual.result.source,'卓式词典·义项补充');
  assert.equal(selectedCommonSenseCandidate(actualRecord,null,'义务'),null);
  for(const change of[{rawRecordJSON:JSON.stringify({...actualRecord,seed:{...actualRecord.seed,rank:0}})},{sha256:'0'.repeat(64)},{file:'different.json'},{manifestVersion:'0'.repeat(64)}])assert.equal(selectedCommonSenseCandidate(actualRecord,{...origin,...change},'义务'),null);
  assert.equal(selectedCommonSenseCandidate({...actualRecord,id:0},origin,'义务'),null);
  assert.equal(selectedCommonSenseCandidate(actualRecord,origin,'人情债'),null);
  assert.equal(selectedCommonSenseCandidate(actualRecord,origin,'债券'),null);
});

for(const query of['义务','职责','责任'])test(`actual selected group ${query} keeps exact3 heads, original partition and bounded authenticated reads`,async()=>{
  const local=localFetch(),direct=await searchExpandedDictionary(query,{fetchImpl:local.fetchImpl}),related=await searchRelatedChineseDictionary(query,{fetchImpl:local.fetchImpl});
  const expectedDirect=query==='义务'?['duty','obligation']:query==='职责'?['responsibility','duty']:['responsibility','duty','obligation'];
  const expectedRelated=query==='义务'?['responsibility']:query==='职责'?['obligation']:[];
  assert.deepEqual(direct.results.map(r=>r.term),expectedDirect);assert.deepEqual(related.results.map(r=>r.term),expectedRelated);
  const all=[...direct.results,...related.results];assert.deepEqual(new Set(all.map(r=>r.term)),new Set(rawGroup.heads));
  const result=all.find(r=>r.term==='obligation');assert.equal(result.meaning,pack.entries[0].meaning);assert.equal(result.source,'卓式词典·义项补充');assert.equal(result.license,'Original composition');assert(!result.alternatives);
  assert.deepEqual(result.matchedExampleSenseEvidence,[entry.selectedExampleProof]);assert.equal(result.matchedSourceEvidence.canonicalSourceSha256,entry.canonicalSourceSha256);assert.equal(result.matchedPartOfSpeech,'noun');
  assert(!local.requests.some(u=>/\/zh-\d{3}\.json$/u.test(u)));assert(local.requests.filter(u=>/\/en-\d{3}\.json$/u.test(u)).length<=6);
  const dto=await loadDictionaryExamples('obligation',{fetchImpl:local.fetchImpl});const plan=dictionaryExampleSensePlan(dto,result);assert.equal(plan.hasMatch,true);assert.equal(plan.items[0].sense.examples[0].en,pack.entries[0].en);
});

test('legacy full raw and formatted saved contexts keep exact original DTO without new five-role pair',async()=>{
  const local=localFetch();
  for(const card of binding.legacySavedContexts){const dto=await loadDictionaryExamples('obligation',{fetchImpl:local.fetchImpl,savedEntry:clone(card)});assert.deepEqual(dto,entry.originalDTO);assert.equal(dto.senses[0].examples[0].en,'I felt an obligation to keep my promise.');assert(!dto.senses.some(s=>s.examples.some(p=>p.en===pack.entries[0].en)));}
  const exact=await loadDictionaryExamples('obligation',{fetchImpl:local.fetchImpl,savedEntry:{term:'obligation',partOfSpeech:'noun',meaning:'义务'}});assert.deepEqual(exact,entry.originalDTO);
});

test('legacy preservation rejects changed POS, negation, truncated or recombined meaning and foreign proof objects',async()=>{
  const local=localFetch(),old=binding.legacySavedContexts[0];
  for(const card of[{...old,term:'duty'},{...old,partOfSpeech:'verb'},{...old,meaning:'不是'+old.meaning},{...old,meaning:old.meaning+' 更多'},{...old,meaning:'义务；债券'},{...old,meaning:'人情债'}]){
    assert.equal(selectedGroupOriginalContext('obligation',card),null);
    assert.equal(await loadDictionaryExamples('obligation',{fetchImpl:local.fetchImpl,savedEntry:card}),null);
  }
  assert.equal(matchesSelectedGroupOriginalDTO({...binding},entry.originalDTO),false);
  assert.equal(matchesSelectedGroupOriginalDTO(binding,{...entry.originalDTO,term:'duty'}),false);
  const changed=clone(entry.originalDTO);changed.senses[0].examples[0].zh+='多余';assert.equal(matchesSelectedGroupOriginalDTO(binding,changed),false);
});

test('legacy full context preservation rejects a card edited while exact original example is loading',async()=>{
  let release,started;const wait=new Promise(r=>{release=r;}),begun=new Promise(r=>{started=r;});let first=true;
  const fetchImpl=async input=>{const u=new URL(input);assert.equal(u.protocol,'file:');if(first){first=false;started();await wait;}return new Response(await fs.readFile(u));};
  const card=clone(binding.legacySavedContexts[0]),pending=loadDictionaryExamples('obligation',{fetchImpl,savedEntry:card});await begun;card.meaning='人情债';release();assert.equal(await pending,null);
});
