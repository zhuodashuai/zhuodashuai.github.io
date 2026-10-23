import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Registered only after the actual normal build and raw archive readback.
// This describes built bytes, not a public verification or publication receipt.
export const D29_BUILD=Object.freeze({version:'4b0dfc4ca2f3a084531ca4d978d5b3874507026c690d1a672368c0756c1b2bb7',manifestSha256:'a8009291a26e57a9b496648b4d7685c3746054fc6c462fab5a0d8e4694c3d3c0',queueSha256:'855d1f53d8a196cbde8d143e870249a828b6cd6f5fa9541d95d5e6be6f0d282e',provenanceSha256:'5148786e0e1e861952677e88a709bff59a28f1a5b8de0bd4a85c543bd07c1b5d'});

// Eight literal expectations independently written after complete raw-source
// reads. The product formatter is never called to create expected values.
export const D29_DISPLAYS=Object.freeze([
 ['blackened',390,'adjective · verb','① adj. （食品）涂上辣椒粉和调味品后油炸的, 熏制的\n② v. （使）变黑, 把…弄黑( blacken的过去式和过去分词 ); 发暗; 败坏（名誉等）, 诋毁','mit'],
 ['covariate',1440,'noun','① n. 协变量, 相关变量','mit'],
 ['one-horse',390,'adjective','① adj. 单马拉的, 只用一匹马的','mit'],
 ['root out',1440,'verb','① 用鼻拱出, 发现','pos-reviewed'],
 ['six times',390,'adverb','① 六倍','pos-reviewed'],
 ['powder compact',1440,'noun','① 粉末压块','pos-reviewed'],
 ['police action',390,'noun','① 警察行动','pos-reviewed'],
 ['the real thing',1440,'noun phrase','① 货真价实','pos-reviewed']
]);
export const D29_WHOLE_PAIRS=Object.freeze([
 ['blackened','adjective · verb','把…弄黑','Smoke from the fire blackened the kitchen ceiling.','火灾产生的烟把厨房的天花板熏黑了。'],
 ['covariate','noun','协变量','We included household income as a covariate in the analysis.','我们在分析中将家庭收入作为协变量。'],
 ['one-horse','adjective','单马拉的','A one-horse cart carried the sacks from the mill to the village.','一辆单马拉的车把那些袋子从磨坊运到村里。'],
 ['root out','verb','发现','The archivist spent weeks trying to root out the missing letter.','那位档案管理员花了几个星期，试图找出那封失踪的信。'],
 ['six times','adverb','六倍','The new robot moves six times as fast as the old one.','新机器人的移动速度是旧机器人的六倍。'],
 ['powder compact','noun','粉末压块','The powder compact cracked when it was lifted from the mould.','那块粉末压块从模具中取出时裂开了。'],
 ['police action','noun','警察行动','Residents complained about the police action after officers searched several homes without explanation.','警方未作解释便搜查了几处住宅后，居民对这次警察行动提出了抱怨。'],
 ['the real thing','noun phrase','货真价实','The bracelet was a cheap copy, not the real thing.','那只手镯是廉价仿品，并非真品。']
]);
const PRIMARY_SOURCES=Object.freeze({
 mit:{source:'ECDICT',license:'MIT',url:'https://github.com/skywind3000/ECDICT'},
 'pos-reviewed':{source:'原有释义＋词性校订',license:'Meanings retain their original licences; POS sources and review methods are listed in the notice',url:'https://zhuodashuai.github.io/vocab/dictionary-pos.html'}
});
const PACKS=Object.freeze([
 ['batch-0029-p001.json',153,'AI/examples29_reviewer_e2','c','e2','724169727318ef1e28a029f737a3e7195c22f5aa29b9121b3a24c5ecdd0a39dc','ded7d23e1f70ddfb10244e0fbd5a482d8253a78729690d18c70a2da2d8286b52'],
 ['batch-0029-p002.json',132,'AI/examples29_reviewer_root','e','root','4f483251a942e312d0351a7d96db8cb3c31edfd5550b7006ec9a9e8d28bcb441','2222d2b21eb8b4b5020011edafe1acb74be4821d65cd036c5bd812ea0fd212d9'],
 ['batch-0029-p003.json',2,'AI/examples29_reviewer_root','e','root','d617fd68a3cd0d1d93ae732980ba883c2f9fc0789c8d068849205d447dc95ffd','3dafed69be7311a060d4265b4f7d6d245a7103a15edf52119cd6d8ca04dfdacf']
]);
const C_HOLDS=['deep freeze','masonic','bitty','espalier','deadhead','dimwit','hypoglycaemic','but for'];
const E_HOLDS=['such and such','workgroup','scaremonger','uncultured','sophist','supergiant','stablemate'];
const REPLACED=['police action','the real thing'];
const PROOF_INPUTS=Object.freeze({
 cAuthor:'6849c326c2c68f1ead8e2ab396bf7551cfcff53cfff39bd25d3835469f849873',
 cOpinion:'64c022346360c62d4fb0cbb4b3e3ab7ee4df0d52987987ec3912225f6c44e6cc',
 cProjection:'22a11aeae4444a57ad4f8b047370a2b77c4571f06cccca501b5ce91f0bb0c5e1',
 eAuthor:'a6b37071ff784e3dd00921cc22e5940e30994659fcb49d3ce9bd947b823be7cf',
 eOpinion:'94da7dad05d8cbf04c7d959aaf7044306dd2822064b11c04b68ad065558cd518',
 eRepair:'c0ecf4ae5fe87934bbff6f04e2f2b217b329cb12fd3f1ab235bef29d38629b2c',
 eProjection:'6edf360e3af775e8c85a2c19767f1c05c2818cfb39b18b78528f6e8e9ed885dc'
});
// Exact independently read working-tree and Git-blob transports. The member
// builder also records input-file hashes, so Linux regeneration has one exact
// additional tuple, derived and compared in dictionary-examples-0029.test.mjs.
// Nothing is newline-normalized at this boundary; other content is rejected.
const PROTECTED_RAW_FORMS=Object.freeze({
 'vocab/data/owner-wordbook.json':[
  {bytes:3090428,sha256:'4063f5bdeccd6b21a38aa45a55eb40e91596c4800b8bc17f5955923c4be9db0e'},
  {bytes:3022710,sha256:'4c3fb9ae6d0e0ec9cb85a0d989c677a6d7942e72d0468d73ad2dc30a1785fa4c'}],
 'vocab/data/book-passages.json':[
  {bytes:427614,sha256:'3c01b7e2226fe5d98be1d6f142ca5686da1a54219b87a680859a22c674958993'},
  {bytes:414570,sha256:'66cfc168b2786380a432492c4a8c693438e6f579b303119b970a995f396b09ba'}],
 'vocab/data/ecdict-core.json':[
  {bytes:1963100,sha256:'e226936f68144d47c50529607f994287ac9919870681567bfd61d46e38e5d302'},
  {bytes:1963099,sha256:'eb430465c024ce3fd6c1ace668eb437135ed8b52ecffcacf8be05b49e070f5f6'}],
 'vocab/data/member-dictionary.json':[
  {bytes:843625,sha256:'932408e43361be26db2308062f1e6c818ef02d8dc2e1a131d49b77cb3229ef21'},
  {bytes:843625,sha256:'efaf0d86965569a358d8e0530b259b4f2c5236a17af9483b098f2db0f9a632f0'}]
});
const sha=b=>createHash('sha256').update(b).digest('hex'),sem=x=>sha(JSON.stringify(x));
const fold=s=>s.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const sorted=a=>a.slice().sort();
export function assertD29ProtectedBytes(file,raw){
 assert(Object.hasOwn(PROTECTED_RAW_FORMS,file),'Unspecified protected file');assert(Buffer.isBuffer(raw));
 const found=PROTECTED_RAW_FORMS[file].find(form=>raw.length===form.bytes&&sha(raw)===form.sha256);
 assert(found,'Protected bytes differ from the exact registered raw transports: '+file);return found;
}

// Finite release transitions for the two metadata files that necessarily move.
// Each old prefix is an independently observed exact byte form, never a
// normalized or ignored body. The third form is Windows core.autocrlf checkout
// of the same three Git LF rules; every byte and only these lines is checked.
export const D29_LF_RULES=Object.freeze([
 'tooling/dictionary/examples/source/batch-0029-*.json text eol=lf',
 'tooling/dictionary/examples/reviews/batch-0029-*.json text eol=lf',
 'tooling/dictionary/examples/queues/batch-0029*.json text eol=lf'
]);
const ATTRS_BEFORE_FORMS=Object.freeze([
 {name:'observed-windows-before-plus-lf-rules',bytes:1904,sha256:'939ff78972628cf79330ef0cfa4f3d026963427f158c1f0daba4512122964e2b',eol:'\n'},
 {name:'tracked-git-lf-before-plus-lf-rules',bytes:1875,sha256:'42a54af67177b7d5f1fdc94a2cafac4e92db82f41a403c08af556b8de7642f8d',eol:'\n'},
 {name:'exact-windows-checkout-of-git-lf-rules',bytes:1904,sha256:'939ff78972628cf79330ef0cfa4f3d026963427f158c1f0daba4512122964e2b',eol:'\r\n'}
]);
const COMMON_BEFORE=Object.freeze({
 bytes:189170,rawSha256:'fa295c958cf3ae9eac5688cd07b770b7885b0ca5576c3bc5ce28a20a705d5a0b',
 objectSha256:'44b0103c0df6eefcca633e4247e4fa607475b235477088d23381a7ee8ef886d2',
 dictionaryExamplesVersion:'321bcdb170d6e810cab79179b1d492c338150366c8fa638188e53dcebc8fc382',
 dictionaryExamplesManifestSha256:'5740a33e757348569d51c24a0580736e788a57071183b3e782fb6d45bf365be0'
});
export function assertD29MetadataTransition(attributesRaw,commonRaw,build){
 assert(Buffer.isBuffer(attributesRaw)&&Buffer.isBuffer(commonRaw));
 assert.match(build.version,/^[a-f0-9]{64}$/u);assert.match(build.manifestSha256,/^[a-f0-9]{64}$/u);
 assert.notEqual(build.version,COMMON_BEFORE.dictionaryExamplesVersion);assert.notEqual(build.manifestSha256,COMMON_BEFORE.dictionaryExamplesManifestSha256);
 const attrs=ATTRS_BEFORE_FORMS.find(form=>sha(attributesRaw.subarray(0,form.bytes))===form.sha256
  &&attributesRaw.subarray(form.bytes).equals(Buffer.from(D29_LF_RULES.join(form.eol)+form.eol)));
 assert(attrs,'Only the exact old .gitattributes prefix plus the three known D29 LF rules is permitted');
 assert.equal(commonRaw.length,COMMON_BEFORE.bytes);
 const current=JSON.parse(commonRaw),restoredObject=JSON.parse(commonRaw);
 assert.equal(current.dictionaryExamplesVersion,build.version);
 assert.equal(current.dictionaryExamplesManifestSha256,build.manifestSha256);
 let restoredText=commonRaw.toString('utf8');
 for(const[key,actual]of [['dictionaryExamplesVersion',build.version],['dictionaryExamplesManifestSha256',build.manifestSha256]]){
  assert(Object.hasOwn(current,key));
  const literal='"'+key+'": "'+actual+'"';
  assert.equal(restoredText.split(literal).length-1,1,'Expected one exact actual pointer field '+key);
  restoredText=restoredText.replace(literal,'"'+key+'": "'+COMMON_BEFORE[key]+'"');
  restoredObject[key]=COMMON_BEFORE[key];
 }
 // Restoring only the two actual fields must recover the entire old raw file
 // and the whole prior object, including every group/sense/example and policy.
 assert.equal(sha(Buffer.from(restoredText)),COMMON_BEFORE.rawSha256,'Common review changed beyond the exact two pointer fields');
 assert.equal(sem(restoredObject),COMMON_BEFORE.objectSha256,'Common review whole object changed');
 return{attributesBeforeForm:attrs.name,exactPrefixBytes:attrs.bytes,appendedRuleCount:3,
  commonFields:['dictionaryExamplesVersion','dictionaryExamplesManifestSha256'],
  commonRestoredRawSha256:COMMON_BEFORE.rawSha256,commonRestoredObjectSha256:COMMON_BEFORE.objectSha256};
}

export async function loadD29Fixture(){
 assert(D29_BUILD,'Actual D29 normal build has not been registered; projection is insufficient');
 assert.deepEqual(Object.keys(D29_BUILD).sort(),['version','manifestSha256','queueSha256','provenanceSha256'].sort());
 for(const pin of Object.values(D29_BUILD))assert.match(pin,/^[a-f0-9]{64}$/u);
 const {loadD28Fixture,D28_BUILD}=await import('./d28-regression-fixture.mjs');
 const root=fileURLToPath(new URL('../../',import.meta.url)),read=file=>fs.readFile(path.join(root,file));
 const json=async(file,pin)=>{const raw=await read(file);if(pin)assert.equal(sha(raw),pin,file);return JSON.parse(raw);};
 const inherited=await loadD28Fixture(),before=inherited.after,current=inherited.current;
 assert(before instanceof Map,'D28 after is a Map, not a manifest wrapper');assert.equal(before.size,85637);
 const beforeManifest=await json('tooling/dictionary/examples/archives/baseline-'+D28_BUILD.version+'.manifest.json',D28_BUILD.manifestSha256);
 assert.equal(beforeManifest.shards.length,256);assert.deepEqual(beforeManifest.counts,{heads:85637,examples:87026});
 for(const d of beforeManifest.shards){const raw=await read('vocab/data/dictionary-examples/'+d.file);assert.equal(raw.length,d.bytes);assert.equal(sha(raw),d.sha256);}
 const manifest=await json('tooling/dictionary/examples/archives/baseline-'+D29_BUILD.version+'.manifest.json',D29_BUILD.manifestSha256);
 assert.equal(manifest.schemaVersion,2);assert.equal(manifest.version,D29_BUILD.version);assert.equal(manifest.bucketCount,256);assert.equal(manifest.shards.length,256);assert.deepEqual(manifest.counts,{heads:85924,examples:87313});
 const after=new Map();let afterPairs=0;for(const d of manifest.shards){const raw=await read('vocab/data/dictionary-examples/'+d.file);assert.equal(raw.length,d.bytes);assert.equal(sha(raw),d.sha256);for(const row of JSON.parse(raw).entries){assert(!after.has(row.term));after.set(row.term,row);afterPairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);}}
 assert.equal(after.size,85924);assert.equal(afterPairs,87313);assert.equal(sem({schemaVersion:2,bucketCount:256,entries:[...after.values()].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0)}),manifest.version);
 for(const[term,row]of before)assert.deepEqual(after.get(term),row,'D29 changed an old whole entry '+term);
 for(const[term,row]of after)assert.deepEqual(current.entries.get(term),row,'Current corpus lost a D29 whole entry '+term);
 const source=await json('vocab/data/expanded-dictionary/manifest.json','2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f'),records=new Map(),descriptors=[...source.english.shards,...source.chinese.shards];
 assert.equal(source.counts.records,102609);assert.equal(descriptors.length,256);for(const d of descriptors){const raw=await read('vocab/data/expanded-dictionary/'+d.file);assert.equal(raw.length,d.bytes);assert.equal(sha(raw),d.sha256);if(d.file.includes('/en-'))for(const row of JSON.parse(raw).records){if(records.has(row.term))assert.deepEqual(records.get(row.term),row);else records.set(row.term,row);}}assert.equal(records.size,102609);
 for(const file of Object.keys(PROTECTED_RAW_FORMS))assertD29ProtectedBytes(file,await read(file));
 const metadataTransition=assertD29MetadataTransition(await read('.gitattributes'),await read('tooling/dictionary/chinese-related-common-examples.json'),D29_BUILD);
 const queue=await json('tooling/dictionary/examples/queues/batch-0029.json',D29_BUILD.queueSha256),provenance=await json('tooling/dictionary/examples/queues/batch-0029-provenance.json',D29_BUILD.provenanceSha256);
 assert.equal(queue.entries.length,287);assert.equal(queue.deferred.length,115);assert.equal(queue.all402CompleteOriginalAuthorObjects.length,402);assert.equal(queue.all395ExactPriorReasonBindings.length,395);
 for(const doc of [queue,provenance]){assert.equal(doc.examplesBuilt,false);assert.equal(doc.published,false);assert.equal(doc.coverageAdded,0);}assert.equal(queue.sourceChanged,false);assert.equal(queue.formsChanged,false);assert.equal(provenance.newLanguageDecisions,0);assert.equal(provenance.sourceChanges,0);assert.equal(provenance.formsChanges,0);
 assert.equal(provenance.consideredDistinctHeads,402);assert.equal(provenance.selectedDistinctHeads,287);assert.equal(provenance.deferredDistinctHeads,115);assert.equal(provenance.priorReasonObjects,395);
 assert.equal(new Set(provenance.inputs.map(b=>b.key)).size,provenance.inputs.length);for(const[key,pin]of Object.entries(PROOF_INPUTS))assert.equal(provenance.inputs.find(b=>b.key===key)?.sha256,pin,'Original independent proof binding changed '+key);
 const originalByTerm=new Map();for(const r of queue.all402CompleteOriginalAuthorObjects){assert(!originalByTerm.has(r.term));assert.deepEqual(records.get(r.term),r.source);assert.equal(sem(r.source),r.sourceSha256);originalByTerm.set(r.term,r);}
 assert.equal(queue.originalAuthorDeferrals.c.length,39);assert.equal(queue.originalAuthorDeferrals.e.length,61);assert.equal(queue.originalPrecisionOrPairHolds.c8.length,8);assert.equal(queue.originalPrecisionOrPairHolds.e7Source.length,7);
 assert.deepEqual(sorted(queue.originalPrecisionOrPairHolds.c8.map(r=>r.term)),sorted(C_HOLDS));assert.deepEqual(sorted(queue.originalPrecisionOrPairHolds.e7Source.map(r=>r.term)),sorted(E_HOLDS));assert.deepEqual(sorted(queue.original2RejectedPairsAndDecisions.map(r=>r.term)),REPLACED);
 const allReasons=queue.all402CompleteOriginalAuthorObjects.flatMap(r=>r.priorReasonBearingQueueObjects.map(h=>({term:r.term,completeOriginalReasonBinding:h})));assert.deepEqual(queue.all395ExactPriorReasonBindings,allReasons);assert.equal(queue.all402CompleteOriginalAuthorObjects.slice(0,200).flatMap(r=>r.priorReasonBearingQueueObjects).length,193);assert.equal(queue.all402CompleteOriginalAuthorObjects.slice(200).flatMap(r=>r.priorReasonBearingQueueObjects).length,202);
 const historyCache=new Map();for(const{completeOriginalReasonBinding:h}of allReasons){const normalized=h.file.replace(/\\/gu,'/'),match=/\/tooling\/dictionary\/examples\/queues\/(batch-\d{4}-outcome\.json)$/u.exec(normalized);assert(match,'Unexpected historical binding path');const relative='tooling/dictionary/examples/queues/'+match[1];if(!historyCache.has(relative)){const raw=await read(relative);historyCache.set(relative,{raw,doc:JSON.parse(raw)});}const actual=historyCache.get(relative);assert.equal(sha(actual.raw),h.rawFileSha256);const object=h.pointer.split('/').slice(1).map(k=>k.replace(/~1/gu,'/').replace(/~0/gu,'~')).reduce((v,k)=>v[k],actual.doc);assert.deepEqual(object,h.completeObject);assert.equal(sem(object),h.objectSha256);}
 const index=await json('tooling/dictionary/examples/index.json'),oldNames=[...inherited.provenance.baselineSourceFiles,'batch-0028-p001.json','batch-0028-p002.json','batch-0028-p003.json','batch-0028-p004.json'];assert.equal(oldNames.length,540);assert.deepEqual(provenance.baselineSourceFiles,oldNames);assert.deepEqual(index.sourceFiles.slice(0,543),[...oldNames,...PACKS.map(p=>p[0])]);
 assert.deepEqual(provenance.cohorts.map(c=>[c.file,c.count,c.author,c.reviewer]),PACKS.map(([file,count,,author,reviewer])=>[file,count,author,reviewer]));
 const standard=await import(pathToFileURL(path.join(root,'tooling/scripts/build-dictionary-examples.mjs'))),rows=[],cohortByTerm=new Map();
 for(const[file,count,reviewerId,author,reviewer,packPin,reviewPin]of PACKS){const p=await json('tooling/dictionary/examples/source/'+file,packPin),r=await json('tooling/dictionary/examples/reviews/'+file,reviewPin);assert.equal(p.entries.length,count);assert.equal(r.reviewer,reviewerId);assert.equal(r.independentOfAuthor,true);assert.equal(r.approvedTerms.length,count);const accepted=standard.validateExampleReview(p,r);assert.equal(accepted.length,count);for(const row of accepted){assert(!cohortByTerm.has(row.term));cohortByTerm.set(row.term,{file,author,reviewer,reviewerId});rows.push(row);}}
 assert.equal(rows.length,287);const rowMap=new Map(rows.map(r=>[r.term,r])),oldEnglish=new Set();for(const r of before.values())for(const s of r.senses)for(const p of s.examples)oldEnglish.add(fold(p.en));
 const newEnglish=new Set(),pairByTerm=new Map(),principalCounts={};for(const e of queue.entries){const r=originalByTerm.get(e.term),c=cohortByTerm.get(e.term),op=e.completeIndependentOpinion;assert(r&&c&&op);assert.deepEqual(records.get(e.term),e.source);assert.equal(sem(e.source),e.sourceSha256);assert.equal(sem(e.pair),e.pairSha256);assert.deepEqual(e.source,r.source);assert.equal(e.authorPrincipal,c.author);assert.equal(e.reviewerPrincipal,c.reviewer);assert.equal(e.reviewerId,c.reviewerId);assert.notEqual(e.authorPrincipal,e.reviewerPrincipal);assert.equal(e.sourceChanged,false);assert.equal(e.formsChanged,false);
  if(c.file==='batch-0029-p001.json'){assert.deepEqual(op.completeAuthorObject,r);assert.deepEqual(op.completeAuthorObject.pair,e.pair);assert.equal(op.sourceSha256,e.sourceSha256);assert.equal(op.pairSha256,e.pairSha256);assert.equal(op.independentOpinion.reviewerPrincipal,'e2');assert.equal(op.independentOpinion.decision,'support-exact-selected-five-cell-pair');assert.equal(op.independentOpinion.sourcePrecisionDecision,'no-additional-finite-source-blocker-raised-for-this-selected-use');assert.equal(op.independentOpinion.conditionalFutureReady,true);}
  else if(c.file==='batch-0029-p002.json'){for(const k of Object.keys(r))assert.deepEqual(op[k],r[k]);assert.deepEqual(op.pair.cells,e.pair);assert.equal(op.reviewerPrincipal,'root');assert.equal(op.pairLanguageDecision,'support-exact-selected-pair-only');assert.equal(op.wholeSourceDecision,'no-additional-finite-source-blocker-found-in-this-reading');assert.equal(op.conditionalFutureReady,true);}
  else{assert.equal(op.authorPrincipal,'e');assert.equal(op.pairAuthorPrincipal,'e');assert.equal(op.reviewerPrincipal,'root');assert.equal(op.decision,'support-exact-replacement-pair-only');assert.equal(op.conditionalFutureReady,true);assert.deepEqual(op.source,e.source);assert.equal(op.sourceSha256,e.sourceSha256);assert.equal(op.sourceChanged,false);assert.equal(op.formsChanged,false);assert.deepEqual(op.proposedFiveCells,e.pair);assert.deepEqual(op.originalFiveCells,r.pair.cells);assert.equal(sem(op.originalFiveCells),op.originalPairSha256);assert.equal(sem(op.proposedFiveCells),op.proposedPairSha256);assert.deepEqual(op.proposedFiveCells.slice(0,3),op.originalFiveCells.slice(0,3));const rejected=queue.original2RejectedPairsAndDecisions.find(x=>x.term===e.term);assert.equal(rejected.pairLanguageDecision,'hold-original-pair');assert.equal(rejected.conditionalFutureReady,false);assert.deepEqual(rejected.pair.cells,op.originalFiveCells);assert.deepEqual(queue.independent2ReplacementDecisions.find(x=>x.term===e.term),op);}
  const[term,partOfSpeech,meaningZh,en,zh]=e.pair,row=rowMap.get(term);assert.deepEqual(row,{term,partOfSpeech,meaningZh,en,zh,reviewer:e.reviewerId});assert.equal(partOfSpeech,e.source.partOfSpeech);assert(!before.has(term));assert(!pairByTerm.has(term));const saved=after.get(term);assert.equal(saved.senses.length,1);assert.equal(saved.senses[0].partOfSpeech,partOfSpeech);assert.equal(saved.senses[0].meaningZh,meaningZh);assert.deepEqual(saved.senses[0].examples,[{en,zh}]);assert.equal(saved.senses[0].reviewer,e.reviewerId);assert(!oldEnglish.has(fold(en))&&!newEnglish.has(fold(en)));newEnglish.add(fold(en));pairByTerm.set(term,row);const role=e.authorPrincipal+' -> '+e.reviewerPrincipal;principalCounts[role]=(principalCounts[role]||0)+1;
 }
 assert.deepEqual(sorted([...after.keys()].filter(t=>!before.has(t))),sorted([...pairByTerm.keys()]));assert.deepEqual(principalCounts,{'c -> e2':153,'e -> root':134});
 const deferredTerms=new Set();for(const h of queue.deferred){assert(!deferredTerms.has(h.term));deferredTerms.add(h.term);assert.deepEqual(records.get(h.term),h.source);assert.deepEqual(h.completeOriginalAuthorObject,originalByTerm.get(h.term));assert(!after.has(h.term));assert.equal(h.admitted,false);assert.equal(h.coverageAdded,0);}assert.equal(deferredTerms.size,115);
 for(const h of [...queue.originalAuthorDeferrals.c,...queue.originalAuthorDeferrals.e]){assert.deepEqual(h,originalByTerm.get(h.term));assert(deferredTerms.has(h.term));}for(const term of [...C_HOLDS,...E_HOLDS])assert(deferredTerms.has(term));for(const term of REPLACED)assert(pairByTerm.has(term)&&!deferredTerms.has(term));
 const product=await import(pathToFileURL(path.join(root,'vocab/js/expanded-dictionary.js'))),base=path.resolve(root,'vocab/data/expanded-dictionary');
 const fetchImpl=async(url,options)=>{assert.equal(options.credentials,'omit');const file=fileURLToPath(url);assert(path.resolve(file).startsWith(base+path.sep));const raw=await fs.readFile(file);return new Response(raw,{headers:{'content-length':String(raw.length)}});};
 let canonicalChecks=0;for(const row of rows){const result=await product.searchExpandedDictionary(row.term,{fetchImpl,timeoutMs:30000});assert.equal(result.results.length,1,'Canonical ambiguity '+row.term);assert.equal(result.hasMore,false);assert.equal(result.results[0].term,row.term);assert.equal(Object.hasOwn(result.results[0],'matchedForm'),false);assert.equal(result.results[0].partOfSpeech,records.get(row.term).partOfSpeech);assert.equal(result.results[0].source,source.sources[records.get(row.term).source].name);canonicalChecks++;}
 const representatives=D29_DISPLAYS.map(([term,width,partOfSpeech,meaning,sourceId],i)=>{const pair=pairByTerm.get(term);assert(pair,'Named representative is not selected: '+term);const[expectedTerm,expectedPos,meaningZh,en,zh]=D29_WHOLE_PAIRS[i];assert.equal(expectedTerm,term);assert.deepEqual(pair,{term,partOfSpeech:expectedPos,meaningZh,en,zh,reviewer:pair.reviewer});const p=PRIMARY_SOURCES[sourceId];assert.equal(source.sources[sourceId].name,p.source);assert.equal(source.sources[sourceId].license,p.license);assert.equal(source.sources[sourceId].url,p.url);return{term,width,pair,display:{term,partOfSpeech,meaning,...p},visibleVariantCount:0};});
 for(const rep of representatives){const result=await product.searchExpandedDictionary(rep.term,{fetchImpl,timeoutMs:30000});assert.deepEqual(result.results,[rep.display],'Manual whole primary display differs '+rep.term);}
 assert.equal(canonicalChecks,287);return{before,after,afterPairs,current,source,records,queue,provenance,pairByTerm,representatives,canonicalChecks,cohortCounts:PACKS.map(p=>p[1]),principalCounts,namespaceFilesVerified:descriptors.length+beforeManifest.shards.length,namespaceDescriptorCounts:{unchangedSource:descriptors.length,unchangedD28Examples:beforeManifest.shards.length,actualD29Examples:manifest.shards.length},metadataTransition};
}
