import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {EVERYDAY_LOOKUP_ENTRIES as rows,EVERYDAY_CHINESE_ALIASES as aliases} from '../../vocab/js/everyday-lookup-data.js';
import {searchEverydayDictionary,loadEverydayExamples} from '../../vocab/js/everyday-lookup.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const read=async f=>JSON.parse(await fs.readFile(new URL('../dictionary/everyday-expansions/2026-10-27/'+f,import.meta.url),'utf8'));
const manifest=await read('manifest.json'),baseline=await read('baseline.json'),byHead=new Map(rows.map(r=>[r.term,r]));
test('daily additions are exact independently approved tuples and alias-only approvals cannot replace bodies',async()=>{
 assert.equal(hash(manifest),'fff8b89d365af64002ed416672549db403ff6450650e9f06c907d09215e18f81');
 const admitted=[];
 for(const source of manifest.sources){const pack=await read(source.sourceFile),review=await read(source.reviewFile);
  assert.equal(hash(pack),source.sourceSha256);assert.equal(hash(review),source.reviewSha256);assert.equal(review.sourceSha256,hash(pack));
  assert(review.independentOfAuthor);assert.notEqual(review.reviewer,pack.author);
  for(const row of pack.entries){const d=review.decisions.find(d=>d.term===row.term);assert.equal(d?.rowSha256,hash(row));
   if(d.decision==='approve-new-row'){assert.deepEqual(byHead.get(row.term),row);admitted.push(row);}
   else{assert.equal(d.decision,'approve-alias-only');assert.equal(hash(byHead.get(row.term)),d.existingRowSha256);}
  }
 }
 assert.equal(admitted.length,105);assert.equal(new Set(admitted.map(r=>r.term)).size,105);assert.equal(hash(admitted),manifest.addedRowsSha256);
 assert.equal(manifest.newAliases.reduce((n,r)=>n+r.aliases.length,0),9);
 for(const row of manifest.newAliases){assert.deepEqual(aliases.find(r=>r.term===row.term),row);assert.equal(hash(byHead.get(row.term)),row.targetEntrySha256);}
});
test('all previous daily tuples and selected-sense tuples remain exact',()=>{
 const ordinary=rows.filter(r=>!r.reviewedCanonicalSense),selected=rows.filter(r=>r.reviewedCanonicalSense);
 assert.equal(ordinary.length,837);assert.equal(hash(ordinary.slice(0,678)),baseline.ordinarySha256);
 assert.equal(hash(baseline.selectedHeads.map(term=>byHead.get(term))),baseline.selectedSha256);
 assert.equal(selected.length,131);for(const row of baseline.aliases)assert.deepEqual(aliases.find(r=>r.term===row.term),row);
});
test('the second measured gap pass adds54 reviewed tuples and keeps the first105 unchanged',async()=>{
 const next=await read('manifest-next.json'),previous=await read('baseline-next.json');assert.equal(hash(next),'7ef1d2914e17d9968216288e48784c4a6074668025ce12ce508d82ce3d7f5ee7');
 const added=[];for(const s of next.sources){const p=await read(s.sourceFile),r=await read(s.reviewFile);assert.equal(hash(p),s.sourceSha256);assert.equal(hash(r),s.reviewSha256);assert.equal(r.sourceSha256,hash(p));assert(r.independentOfAuthor&&r.reviewer!==p.author);
  for(const row of p.entries){const d=r.decisions.find(d=>d.term===row.term);assert.equal(d?.rowSha256,hash(row));if(d.decision==='approve-new-row'){assert.deepEqual(byHead.get(row.term),row);added.push(row);}else{assert.equal(d.decision,'approve-alias-only');assert.equal(hash(byHead.get(row.term)),d.existingRowSha256);}}
 }
 assert.equal(added.length,54);assert.equal(hash(added),next.addedRowsSha256);assert.equal(hash(rows.filter(r=>!r.reviewedCanonicalSense).slice(0,783)),previous.ordinarySha256);assert.equal(hash(previous.selectedHeads.map(h=>byHead.get(h))),previous.selectedSha256);
 for(const row of previous.aliases)assert.deepEqual(aliases.find(a=>a.term===row.term),row);
 assert.deepEqual(searchEverydayDictionary('消防通道').results.map(r=>r.term).sort(),['escape route','fire access route']);
 assert.match(byHead.get('fire access route').meaning,/消防车/u);assert.match(byHead.get('escape route').meaning,/撤离/u);
});
test('the one literal rescheduling overlap remains pinned compatible verb lemmatization, never a general -ing exception',async()=>{
 const p=await read('rescheduling-form-independent-decision.json');assert.equal(hash(p),'c63d0e55d0186c8f3c1641e168a6674db102cd36be94fd0f3f4b5a9496c94f1a');assert.equal(p.decision,'approve-exact-compatible-verb-form');
 assert(p.independentOfAuthor);assert.notEqual(p.author,p.reviewer);assert.equal(p.term,'reschedule');assert.equal(p.form,'rescheduling');
 assert.equal(hash(byHead.get(p.term)),p.selectedRowSha256);assert(byHead.get(p.term).englishForms.includes(p.form));
 const bytes=await fs.readFile(new URL('../../vocab/data/expanded-dictionary/'+p.shardFile,import.meta.url));assert.equal(bytes.length,p.shardBytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),p.shardSha256);
 const record=JSON.parse(bytes).records.find(r=>r.term===p.form);assert.equal(hash(record),p.canonicalSourceSha256);assert.deepEqual(record,p.exactCanonicalRecord);assert.equal(record.id,10120438);assert.equal(record.partOfSpeech,'verb');assert.match(record.meaning,/reschedule的现在分词/u);
});
test('practical queries resolve immediately without a shard or provider, with POS and matched examples',async()=>{
 const cases=[['小葱','spring onion'],['锅盖','pot lid'],['煮熟','cook until done'],['眼药水','eye drops'],['电工','electrician'],['食用油','cooking oil'],['二维码','QR code'],['叫号','call a number'],['保质期','shelf life'],['门窗密封条','weatherstripping'],['我马上回来',"I'll be right back"],['另存为','save as']];
 for(const[q,term]of cases){const r=await searchExpandedDictionary(q,{fetchImpl:()=>{throw Error('Local daily query must not read a provider/shard');}});assert.equal(r.results[0]?.term,term,q);
  assert.equal(r.results[0].partOfSpeech,byHead.get(term).partOfSpeech);assert.equal(r.results[0].meaning,byHead.get(term).meaning);
  const example=loadEverydayExamples(term);assert.equal(example.senses[0].meaningZh,byHead.get(term).meaning);assert.equal(example.senses[0].examples[0].en,byHead.get(term).en);
 }
});
test('exact aliases preserve negations and distinct physical concepts',()=>{
 for(const q of['未煮熟','没煮熟','不是眼药水','不要扫码','不是电工','无乳糖','非冷藏保存','不是小葱'])assert.equal(searchEverydayDictionary(q),null,q);
 assert.equal(searchEverydayDictionary('不含乳制品').results[0].term,'dairy-free');
 assert.equal(searchEverydayDictionary('不放香菜').results[0].term,'no coriander, please');
 assert.equal(searchEverydayDictionary('爆胎').results[0].term,'tyre blowout');
 assert.equal(searchEverydayDictionary('车胎漏气').results[0].term,'leaking tyre');
});
test('two exact contaminated old Chinese heads stop producing unrelated reverse results; real neighbouring heads survive',async()=>{
 const fetchImpl=async input=>{const url=new URL(input);assert.equal(url.protocol,'file:');assert(url.pathname.includes('/vocab/data/expanded-dictionary/'));return new Response(await fs.readFile(fileURLToPath(url)),{headers:{'content-type':'application/json'}});};
 for(const q of['小葱拌豆腐','厨用灯油']){const r=await searchExpandedDictionary(q,{fetchImpl});assert(!r.results.some(x=>['clearcut','cooking oil'].includes(x.term)),q);}
 const lamp=await searchExpandedDictionary('灯油',{fetchImpl});assert(lamp.results.some(r=>r.term==='kerosene'));assert(!lamp.results.some(r=>r.term==='cooking oil'));
 const adjective=await searchExpandedDictionary('clear-cut',{fetchImpl});assert.equal(adjective.results[0].term,'clear-cut');assert.match(adjective.results[0].partOfSpeech,/adjective/u);assert(!adjective.results[0].meaning.includes('皆伐地'));
 await assert.rejects(searchExpandedDictionary('clearcutting',{fetchImpl}),e=>e.code==='unreviewed_dictionary_form');
 const noun=await searchExpandedDictionary('clearcut',{fetchImpl});assert.equal(noun.results[0].partOfSpeech,'noun');assert.match(noun.results[0].meaning,/皆伐地/u);
});
