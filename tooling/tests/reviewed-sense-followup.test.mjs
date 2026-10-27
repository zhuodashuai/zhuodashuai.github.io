import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {REVIEWED_SENSE_ENTRIES} from '../../vocab/js/reviewed-senses-data.js';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../vocab/js/everyday-lookup-data.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(new URL('../dictionary/reviewed-senses/'+file,import.meta.url),'utf8'));
const baseline=await read('followup-0003-baseline.json'),context=await read('followup-0003-context.json');
const current=new Map(REVIEWED_SENSE_ENTRIES.map(row=>[row.term,row]));
test('all old31 selected rows and ordinary678 daily rows survive the format and follow-up release unchanged',()=>{
 assert.equal(hash(baseline.rows),'099f9e71be6ebeae84d9c243f0045090f9fdeb951ef7d6b3de7ef2d438e1859e');
 assert.equal(baseline.rows.length,31);for(const row of baseline.rows)assert.deepEqual(current.get(row.term),row);
 const ordinary=EVERYDAY_LOOKUP_ENTRIES.filter(row=>row.reviewedCanonicalSense!==true);
 assert.equal(hash(ordinary.slice(0,837)),'70e0a1f37d9de106c1630345551a5e9d361a312592921a15a8eeca9662ff3ab4');assert.equal(hash(ordinary.slice(0,678)),'8e678c9727e2f1a6cca3e511ae10230b036af9a58f3fedc8cb0242b1f955face');
});
test('98 new exact tuples retain their actual different-principal approvals and canonical bindings; holds stay unresolved',async()=>{
 const expected={ '0003':'3bfa52d2b7d3d9483613dfc1aa53ce61dc5e59d4aaf5446a6b2548ce36e33205','0004':'a150e7bd7e7a947e8fd3a89416b51417e6f3135fce34e9c56f2103d172c70c3f' };
 const queued=new Map(context.rows.map(row=>[row.term,row])),approved=[];
 for(const [id,pin]of Object.entries(expected)){
  const pack=await read('source/batch-'+id+'.json'),review=await read('reviews/batch-'+id+'.json');
  assert.equal(hash(pack),pin);assert.equal(review.sourceSha256,pin);assert(review.independentOfAuthor&&review.reviewer!==pack.author);
  assert.deepEqual(review.approvedTerms,pack.entries.map(row=>row.term));
  for(const row of pack.entries){
   const d=review.decisions.find(d=>d.term===row.term),old=queued.get(row.term),saved=current.get(row.term);
   assert.equal(d?.verdict,'approved');assert.equal(d.rowDigest||d.rowSha256,hash(row));assert((d.reason||d.notes)?.trim());
   assert.equal(old.originalVerdict,'needs-fix');assert.equal(row.canonicalId,old.canonicalRecord.id);
   assert.equal(row.canonicalSourceSha256,hash(old.canonicalRecord));assert.equal(saved.canonicalSourceSha256,row.canonicalSourceSha256);
   for(const key of['term','partOfSpeech','meaning','en','zh','chineseAliases','englishForms','references'])assert.deepEqual(saved[key],row[key]);
   assert.equal(saved.exampleReviewer,review.reviewer);assert.notEqual(saved.en,old.originalPair.en);
   approved.push(row.term);
  }
 }
 assert.equal(approved.length,98);assert.equal(new Set(approved).size,98);assert.equal(current.size,129+2);
 for(const held of['giga','reservior'])assert(!current.has(held));
});
test('the original1000 audit verdicts remain exact evidence rather than being relabelled after replacements',async()=>{
 assert.equal(hash(context),'0de9cf0fd7c0e0da623df14a43c76933a002eb6da4758c4632531a50f4e9313c');
 assert.equal(context.counts.auditedOriginalPairs,1000);assert.equal(context.rows.length,100);
 assert(context.rows.every(row=>row.originalVerdict==='needs-fix'));
 assert.equal(context.preservedAuditSemanticPins.length,8);
 for(const pin of context.preservedAuditSemanticPins){
  const audit=JSON.parse(await fs.readFile(new URL('../dictionary/examples/independent-audits/'+pin.file,import.meta.url),'utf8'));
  assert.equal(hash(audit),pin.jsonSha256);
 }
});
test('only ten separately approved whole canonical choices receive retention and scoped notes',async()=>{
 const policy=await read('retained-alternatives.json');assert.equal(hash(policy),'9f078a7712ab791288b3ab1a3e789d784a3ee26d7e2e342242f7f87309813ac5');
 assert.equal(policy.entries.length,10);
 const actual=REVIEWED_SENSE_ENTRIES.filter(row=>row.retainedCanonicalAlternatives?.length);
 assert.deepEqual(actual.map(row=>row.term).sort(),policy.entries.map(row=>row.term).sort());
 for(const row of actual){const p=policy.entries.find(p=>p.term===row.term);assert.equal(p.canonicalSourceSha256,row.canonicalSourceSha256);assert(row.retainLegacyChinese);
  assert.equal(p.selectedRowSha256,hash((await read('source/batch-'+(['stablemate','presidentially','uni'].includes(row.term)?'0004':'0003')+'.json')).entries.find(r=>r.term===row.term)));
 }
});
