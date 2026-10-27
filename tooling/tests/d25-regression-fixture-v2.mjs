// External test draft. Planned target: tooling/tests/d25-regression-fixture-v2.mjs.
// Historical exact facts use immutable D25 archives, not mutable active pointers.
// Import is inert; unknown actual D25 output identities deliberately close I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

export const D25_BUILT_PINS=Object.freeze({exampleVersion:'93e0610e74ecc7e990ba28900733efd2996c03186054e82c33e5a185948f99b5',exampleManifestSha256:'d7c1630bc1feed1e41e9c3f42cd8ce0947c39e395360b770cf5fca3f45ef2d39',sourcePackSha256:'97b7b2b166efef60d02075de15ff1be641ac2c423dd6365bb1c88b8af6151828',reviewPackSha256:'6c51d32342f13f27f4f1e0d2212f5a8a6e630b659f742d511519859d2a9a54eb',provenanceSha256:'ac48c95c455dd34d5c28f2399824923eb0f3b3d00d3b9935cc92cfd5fe667fd3',historicalIndexSha256:'f66ce84337c3b36d3c451b8ffcda7d860b51184cc95475e140d0db8f5b07c176'});
export const D25_PUBLISHED_IDENTITY=null;
// No reviewed target-source evolution is registered. A later exact target
// change requires a new independent compatibility binding, not a blanket skip.
export const D25_TARGET_SOURCE_EVOLUTIONS=Object.freeze([]);
// The immutable D25 source remains exact. This one later, explicitly selected
// daily display is a separate source layer, not an evolution of the old record.
export const D25_DAILY_DISPLAY_COMPATIBILITY=Object.freeze({
 'to be honest':Object.freeze({rowSha256:'c75251744de653a69b77b11aaabde9e19ded011d288ede7bf9788e779dd62894',display:Object.freeze({
  term:'to be honest',partOfSpeech:'expression',meaning:'① 说实话；坦白说。用于引出自己真实的想法或感受，不是形容一个人诚实。',
  source:'卓的日常词组',license:'Original composition',url:'https://zhuodashuai.github.io/vocab/'
 })})
});
export function d25ExpectedCurrentDisplay(record,frozenDisplay,dailyEntries){
 const binding=D25_DAILY_DISPLAY_COMPATIBILITY[record.term];if(!binding)return frozenDisplay;
 const rows=dailyEntries.filter(row=>row.term===record.term);assert.equal(rows.length,1,'Registered daily head must remain unique');
 assert.equal(hash(rows[0]),binding.rowSha256,'Unreviewed change to the exact D25 daily display');
 return binding.display;
}
// Exact, finite historical checkout transports; never a general normalizer.
export const D25_LEGACY_TRANSPORT_PIN='0ffb3950de71e8be657e2c4c06a46aa5fc58c2de8ab4142527283fc6a15409be';
export const D25_EXISTING_PINS=Object.freeze({authorSha256:'6d642fd0a0299bfe1b7420db2f825534f9ad3b0227ab98db05558d2a5edf65f3',authorBytes:380063,languageReviewSha256:'ba88f8ee11c07b2c3fb7728ffe3b7830a93acddcccada2ac980b1dc4af6be828',languageReviewBytes:210090,sourceVersion:'cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644',sourceManifestSha256:'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f',beforeExampleVersion:'9d88df54348516f0c4d6d554e0eb49348512a6026c693bae5ee88ad0959e0210',beforeExampleManifestSha256:'b73f2da425af9350b6ed1b4f4ebd14681f024202e11353c51d5801b610253c61',beforeIndexSha256:'3d534e73d1a7328b35707909efe5af61f0bc4f10f50bdd4be2abb0e3947f0916',d24ProvenanceSha256:'830604f402655af18086e0e8e60e83f62defb8c28708b9781fb308485d13d811'});
export const D25_REPRESENTATIVES=Object.freeze([
 Object.freeze({term:'a bit of',query:'a bit of',family:'quantifier literal',width:390}),
 Object.freeze({term:'provided',query:'provided',family:'conjunction with retained MIT alternative',width:1440}),
 Object.freeze({term:'as if',query:'as if',family:'preserved mixed conjunction/interjection label; example illustrates conjunction',width:390}),
 Object.freeze({term:'be in hot water',query:'was in hot water',family:'actual published form/context, not new alias',width:1440}),
 Object.freeze({term:'be going to',query:'be going to',family:'exact am going to instantiation',width:390}),
 Object.freeze({term:"bare one's soul",query:"bare one's soul",family:'exact my instantiation',width:390}),
 Object.freeze({term:'be cut out for',query:'be cut out for',family:'exact am cut out for instantiation',width:1440}),
 Object.freeze({term:'bring out the best in somebody',query:'bring out the best in somebody',family:'exact a nervous player instantiation',width:390})
]);
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=v=>sha(JSON.stringify(v));
const order=(a,b)=>a.term<b.term?-1:a.term>b.term?1:0;
const fold=en=>en.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const exactSurface=(sentence,surface)=>new RegExp('(?:^|[^\\p{L}\\p{M}\\p{N}_])'+surface.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+'(?=$|[^\\p{L}\\p{M}\\p{N}_])','iu').test(sentence);
export function requireD25BuiltPins(){
 const pins=D25_BUILT_PINS;
 for(const key of Object.keys(D25_BUILT_PINS))assert(typeof pins?.[key]==='string'&&/^[a-f0-9]{64}$/u.test(pins[key]),'D25 actual built output '+key+' is not pinned; draft data/E2E cannot run or claim pass');
 assert.notEqual(pins.exampleVersion,D25_EXISTING_PINS.beforeExampleVersion);return pins;
}
export function requireD25PublishedIdentity(){
 const identity=D25_PUBLISHED_IDENTITY;
 assert(identity&&identity.stage==='D25-published-dual-origin-verified-goal-active','D25 publication identity is not registered; no live/publication assertion is permitted');
 for(const key of ['commit','tree'])assert.match(identity[key],/^[a-f0-9]{40}$/u);assert.match(identity.productionProofSha256,/^[a-f0-9]{64}$/u);return identity;
}
export function d25MeaningLines(meaning){return (/^\s*(?:[①-⑳]|\d+[.、])/u.test(meaning)?meaning:'① '+meaning).split(/\r?\n/u).filter(line=>line.trim());}
export function assertD25HistoricalTransport(raw,file,pin,registry){
 assert(Buffer.isBuffer(raw));assert.equal(pin.path,file);assert.equal(registry.schemaVersion,1);assert.equal(registry.kind,'D25-exact-finite-historical-CRLF-LF-transports');
 const matches=registry.entries.filter(row=>row.file===file);assert(matches.length<=1);const actual={bytes:raw.length,sha256:sha(raw)};
 if(matches.length){const row=matches[0];assert.deepEqual(row.historical,{bytes:pin.bytes,sha256:pin.sha256});if(actual.sha256===row.gitLf.sha256){assert.equal(actual.bytes,row.gitLf.bytes);return 'exact-registered-git-lf';}}
 assert.deepEqual(actual,{bytes:pin.bytes,sha256:pin.sha256},'Historical content moved, not an exact registered checkout transport: '+file);return 'exact-historical-raw';
}
export async function loadD25RegressionFixture(options={}){
 const pins=requireD25BuiltPins(); // Before options dereference, reads or product imports.
 const root=options.root??new URL('../../',import.meta.url);
 const base=fileURLToPath(root),bindings=[];
 async function read(file,expected,bytes){const raw=await fs.readFile(new URL(file,root));if(expected)assert.equal(sha(raw),expected,file);if(bytes!==undefined)assert.equal(raw.length,bytes);bindings.push({file,bytes:raw.length,sha256:sha(raw)});return raw;}
 const author=JSON.parse(await read('tooling/dictionary/examples/evidence/batch-0025-author.json',D25_EXISTING_PINS.authorSha256,D25_EXISTING_PINS.authorBytes));
 const languageReview=JSON.parse(await read('tooling/dictionary/examples/evidence/batch-0025-language-review.json',D25_EXISTING_PINS.languageReviewSha256,D25_EXISTING_PINS.languageReviewBytes));
 assert.equal(author.authorPrincipal,'e2');assert.equal(author.entries.length,99);assert.equal(author.authorHolds.length,1);assert.equal(languageReview.reviewerPrincipal,'e');assert.equal(languageReview.entries.length,100);assert.equal(languageReview.counts.wholePairsConditionallySupported,99);assert.equal(languageReview.scope.examplesAdmitted,0);
 const conditionalPatterns=new Map(languageReview.exactConditionalPatterns.map(row=>[row.term,row]));assert.deepEqual([...conditionalPatterns.keys()],['be going to',"bare one's soul",'be cut out for','bring out the best in somebody']);let literalMatches=0,finiteMatches=0;
 const sourceRaw=await read('tooling/dictionary/source-revisions/baseline-'+D25_EXISTING_PINS.sourceVersion+'.manifest.json',D25_EXISTING_PINS.sourceManifestSha256),sourceManifest=JSON.parse(sourceRaw);assert.equal(sourceManifest.version,D25_EXISTING_PINS.sourceVersion);
 const records=new Map();let sourceShardCount=0;
 for(const group of [sourceManifest.english,sourceManifest.chinese]){assert.equal(group.shards.length,128);for(const descriptor of group.shards){const raw=await read('vocab/data/expanded-dictionary/'+descriptor.file,descriptor.sha256,descriptor.bytes);sourceShardCount++;if(group===sourceManifest.english)for(const row of JSON.parse(raw).records){if(records.has(row.term))assert.deepEqual(records.get(row.term),row);else records.set(row.term,row);}}}
 assert.equal(sourceShardCount,256);assert.equal(records.size,102609);
 const activeSourceRaw=await read('vocab/data/expanded-dictionary/manifest.json'),activeSourceManifest=JSON.parse(activeSourceRaw),activeRecords=new Map();
 assert.match(activeSourceManifest.version,/^[a-f0-9]{64}$/u);assert.equal(D25_TARGET_SOURCE_EVOLUTIONS.length,0,'No target-source evolution is registered');
 for(const group of [activeSourceManifest.english,activeSourceManifest.chinese]){assert.equal(group.shards.length,128);for(const descriptor of group.shards){assert.match(descriptor.file,new RegExp('^'+activeSourceManifest.version+'/(?:en|zh)-[0-9]{3}\\.json$','u'));assert.match(descriptor.sha256,/^[a-f0-9]{64}$/u);const raw=await read('vocab/data/expanded-dictionary/'+descriptor.file,descriptor.sha256,descriptor.bytes);if(group===activeSourceManifest.english)for(const row of JSON.parse(raw).records){if(activeRecords.has(row.term))assert.deepEqual(activeRecords.get(row.term),row);else activeRecords.set(row.term,row);}}}
 assert.equal(activeRecords.size,activeSourceManifest.counts.records);
 for(const entry of author.entries){assert.deepEqual(activeRecords.get(entry.term),entry.source,'D25 target source changed: requires a separate exact source-evolution/runtime review for '+entry.term);for(const source of new Set([entry.source.source,...(entry.source.variants||[]).map(row=>row.source)]))assert.deepEqual(activeSourceManifest.sources[source],sourceManifest.sources[source],'Used D25 source descriptor changed without an exact compatibility binding '+source);}
 const parser=await import(pathToFileURL(path.join(base,'vocab/js/dictionary-examples.js')));
 async function examples(file,expectedSha,expectedVersion,heads,pairs){
  const raw=await read(file,expectedSha),manifest=parser.parseDictionaryExamplesManifest(JSON.parse(raw));if(expectedVersion)assert.equal(manifest.version,expectedVersion);if(heads!==undefined)assert.deepEqual(manifest.counts,{heads,examples:pairs});
  const entries=new Map();let pairCount=0;
  for(const descriptor of manifest.shards){const content=await read('vocab/data/dictionary-examples/'+descriptor.file,descriptor.sha256,descriptor.bytes);for(const[term,row]of parser.parseDictionaryExamplesShard(JSON.parse(content),manifest,descriptor)){assert(!entries.has(term));entries.set(term,row);pairCount+=row.senses.reduce((n,s)=>n+s.examples.length,0);}}
  assert.equal(entries.size,manifest.counts.heads);assert.equal(pairCount,manifest.counts.examples);assert.equal(hash({schemaVersion:2,bucketCount:256,entries:[...entries.values()].sort(order)}),manifest.version);return{raw,manifest,entries,pairCount};
 }
 const before=await examples('tooling/dictionary/examples/archives/baseline-'+D25_EXISTING_PINS.beforeExampleVersion+'.manifest.json',D25_EXISTING_PINS.beforeExampleManifestSha256,D25_EXISTING_PINS.beforeExampleVersion,85267,86656);
 const after=await examples('tooling/dictionary/examples/archives/baseline-'+pins.exampleVersion+'.manifest.json',pins.exampleManifestSha256,pins.exampleVersion,85366,86755);
 const current=await examples('vocab/data/dictionary-examples/manifest-v2.json');for(const[term,row]of after.entries)assert.deepEqual(current.entries.get(term),row,'Current build lost whole historical D25 entry '+term);
 for(const[term,row]of before.entries)assert.deepEqual(after.entries.get(term),row,'Old whole entry changed '+term);
 assert.deepEqual([...after.entries.keys()].filter(term=>!before.entries.has(term)).sort(),author.entries.map(row=>row.term).sort());
 const pairByTerm=new Map(),seenSentences=new Set(),oldSentences=new Set();
 for(const row of before.entries.values())for(const sense of row.senses)for(const pair of sense.examples)oldSentences.add(fold(pair.en));
 for(const entry of author.entries){
  const opinion=languageReview.entries.find(row=>row.term===entry.term);assert(opinion);assert.deepEqual(records.get(entry.term),entry.source);assert.equal(hash(entry.source),entry.sourceSha256);assert.deepEqual(opinion.source,entry.source);assert.deepEqual(opinion.pair,entry.pair);assert.equal(hash(entry.pair),entry.pairSha256);assert.equal(opinion.pairJsonSha256,entry.pairSha256);
  const[term,partOfSpeech,meaningZh,en,zh]=entry.pair,saved=after.entries.get(term);assert.equal(partOfSpeech,entry.source.partOfSpeech);assert.equal(entry.id,entry.source.id);assert.equal(entry.term,entry.source.term);
  const senseKey=/^[a-zA-Z0-9:_-]+$/u.test(term)&&term.length<=100?term:sha(term).slice(0,24);assert.deepEqual(saved,{term,senses:[{id:'example:'+senseKey,partOfSpeech,meaningZh,examples:[{en,zh}],reviewer:'AI/examples25_reviewer_e',source:parser.DICTIONARY_EXAMPLE_SOURCE}]});
  const pattern=conditionalPatterns.get(term),forms=[entry.source.term,...entry.source.forms].filter(form=>typeof form==='string'&&form&&(!term.includes(' ')||form.includes(' '))),matches=forms.filter(form=>exactSurface(en,form));assert.equal(opinion.decision.finiteCurrentPolicyWaiver,false);assert.equal(opinion.decision.sourceOrFormsRewriteApproved,false);
  if(pattern){assert.equal(opinion.decision.selectedMeaningAndWholePair,'conditionally-support-only-specific-pattern');assert.equal(matches.length,0);assert.equal(pattern.sourceSha256,entry.sourceSha256);assert.equal(pattern.pairJsonSha256,entry.pairSha256);assert.equal(pattern.exactEnglish,en);assert.equal(pattern.exactChinese,zh);assert(exactSurface(en,pattern.surface));finiteMatches++;}
  else{assert.equal(opinion.decision.selectedMeaningAndWholePair,'conditionally-support-exact-source-pair');assert(matches.length>0,'Unexpected unregistered substitution '+term);literalMatches++;}
  const key=fold(en);assert(!oldSentences.has(key)&&!seenSentences.has(key),'New English duplicate');seenSentences.add(key);pairByTerm.set(term,{term,partOfSpeech,meaningZh,en,zh});
 }
 assert.equal(literalMatches,95);assert.equal(finiteMatches,4);
 const held=author.authorHolds[0];assert.equal(held.term,'too good to be true');assert.equal(held.pair,null);assert.deepEqual(records.get(held.term),held.source);assert.equal(hash(held.source),held.sourceSha256);assert(!after.entries.has(held.term));
 const sourcePack=JSON.parse(await read('tooling/dictionary/examples/source/batch-0025-p001.json',pins.sourcePackSha256));
 const reviewPack=JSON.parse(await read('tooling/dictionary/examples/reviews/batch-0025-p001.json',pins.reviewPackSha256));
 const standard=await import(pathToFileURL(path.join(base,'tooling/scripts/build-dictionary-examples.mjs')));
 assert.deepEqual(sourcePack.entries,author.entries.map(row=>{const[term,partOfSpeech,meaningZh,en,zh]=row.pair;return{term,partOfSpeech,meaningZh,en,zh};}));assert.equal(sourcePack.batchId,'examples-0025-p001');assert.equal(reviewPack.sourceSha256,standard.exampleSourceHash(sourcePack));assert.equal(reviewPack.reviewer,'AI/examples25_reviewer_e');assert.equal(reviewPack.independentOfAuthor,true);assert.deepEqual(reviewPack.approvedTerms,author.entries.map(row=>row.term));assert.deepEqual(reviewPack.issues,[]);assert.equal(standard.validateExampleReview(sourcePack,reviewPack).length,99);
 const provenance=JSON.parse(await read('tooling/dictionary/examples/queues/batch-0025-provenance.json',pins.provenanceSha256));assert.equal(provenance.newLanguageDecisions,0);assert.equal(provenance.sourceChanges,0);assert.equal(provenance.formsChanges,0);assert.equal(provenance.coverageAdded,0);assert.equal(provenance.examplesBuilt,false);assert.equal(provenance.published,false);assert.deepEqual(provenance.authorHold,held);
 const oldProvenance=JSON.parse(await read('tooling/dictionary/examples/queues/batch-0024-provenance.json',D25_EXISTING_PINS.d24ProvenanceSha256));
 const oldFiles=[...oldProvenance.baselineSourceFiles,'batch-0024-p001.json'];assert.equal(oldFiles.length,533);assert.equal(sha(Buffer.from(JSON.stringify({schemaVersion:1,sourceFiles:oldFiles},null,2)+'\n')),D25_EXISTING_PINS.beforeIndexSha256);
 const historicalIndex=JSON.parse(await read('tooling/dictionary/examples/archives/batch-0025-index.snapshot.json',pins.historicalIndexSha256));assert.deepEqual(historicalIndex,{schemaVersion:1,sourceFiles:[...oldFiles,'batch-0025-p001.json']});
 const currentIndex=JSON.parse(await read('tooling/dictionary/examples/index.json'));assert.equal(currentIndex.schemaVersion,1);assert.deepEqual(currentIndex.sourceFiles.slice(0,historicalIndex.sourceFiles.length),historicalIndex.sourceFiles,'Current index lost exact historical D25 prefix');assert.equal(new Set(currentIndex.sourceFiles).size,currentIndex.sourceFiles.length);
 const legacyTransport=JSON.parse(await read('tooling/dictionary/examples/archives/batch-0025-legacy-transport.json',D25_LEGACY_TRANSPORT_PIN));assert.equal(legacyTransport.originalProvenanceSha256,pins.provenanceSha256);assert.equal(legacyTransport.entries.length,132);assert.equal(new Set(legacyTransport.entries.map(row=>row.file)).size,132);const historicalPaths=new Set(oldFiles.flatMap(file=>['source','reviews'].map(kind=>'tooling/dictionary/examples/'+kind+'/'+file)));assert.equal(historicalPaths.size,1066);for(const row of legacyTransport.entries)assert(historicalPaths.has(row.file),'No transport waiver for nonhistorical inputs');
 for(const file of oldFiles)for(const kind of ['source','reviews']){const relative='tooling/dictionary/examples/'+kind+'/'+file,pin=provenance.inputPins.find(row=>row.path===relative);assert(pin&&!pin.absent);const raw=await read(relative);assertD25HistoricalTransport(raw,relative,pin,legacyTransport);}
 const product=await import(pathToFileURL(path.join(base,'vocab/js/expanded-dictionary.js'))),formatter=await import(pathToFileURL(path.join(base,'vocab/js/personal-dictionary.js')));
 const fetchImpl=async value=>{const file=fileURLToPath(value);assert(path.resolve(file).startsWith(path.resolve(base,'vocab/data/expanded-dictionary')+path.sep),'Only local public source assets');const bytes=await fs.readFile(file);return new Response(bytes,{headers:{'content-length':String(bytes.length)}});};
 function readable(record,item){if(!['mit','core','pos-reviewed','grammar-reviewed','pos-notation-reviewed'].includes(item.source)||/^\s*(?:[①-⑳]|\d+[.、])/u.test(item.meaning))return item;const f=formatter.personalDictionaryResult({word:record.term,partOfSpeech:item.partOfSpeech,meaning:item.meaning});return f?{...item,partOfSpeech:f.partOfSpeech||item.partOfSpeech,meaning:f.meaning.length<=2000?f.meaning:item.meaning}:item;}
 function expectedDisplay(record){
  const descriptor=sourceManifest.sources[record.source],primary=readable(record,record),out={term:record.term,partOfSpeech:primary.partOfSpeech,meaning:primary.meaning,source:descriptor.name,license:descriptor.license,url:descriptor.url};
  const alternatives=(record.variants||[]).filter(item=>!((record.source==='pos-reviewed'||record.source==='grammar-reviewed'&&item.source==='mit')&&item.meaning===record.meaning&&!item.partOfSpeech.trim())).map(item=>{const f=readable(record,item),s=sourceManifest.sources[item.source];return{partOfSpeech:f.partOfSpeech,meaning:f.meaning,source:s.name,license:s.license,url:s.url};});if(alternatives.length)out.alternatives=alternatives;return out;
 }
 const {EVERYDAY_LOOKUP_ENTRIES:dailyEntries}=await import(pathToFileURL(path.join(base,'vocab/js/everyday-lookup-data.js')));
 const runtimeByTerm=new Map();for(const entry of author.entries){const response=await product.searchExpandedDictionary(entry.term,{fetchImpl,timeoutMs:30000});assert.equal(response.results.length,1,'Canonical lookup must remain unambiguous');const actual=response.results[0];assert.deepEqual(actual,d25ExpectedCurrentDisplay(entry.source,expectedDisplay(entry.source),dailyEntries),'Primary meaning/POS/provenance or retained alternatives changed '+entry.term);runtimeByTerm.set(entry.term,actual);}
 const representativeDisplays=[];for(const representative of D25_REPRESENTATIVES){const response=await product.searchExpandedDictionary(representative.query,{fetchImpl,timeoutMs:30000});assert.equal(response.results.length,1,'Representative query ambiguity must be resolved explicitly, not silently waived');assert.equal(response.results[0].term,representative.term);representativeDisplays.push({...representative,pair:pairByTerm.get(representative.term),canonicalDisplay:runtimeByTerm.get(representative.term),queryDisplay:response.results[0]});}
 return{author,languageReview,sourceManifest,records,activeSourceManifest,activeRecords,before,after,current,sourcePack,reviewPack,provenance,historicalIndex,currentIndex,pairByTerm,runtimeByTerm,representativeDisplays,bindings};
}
