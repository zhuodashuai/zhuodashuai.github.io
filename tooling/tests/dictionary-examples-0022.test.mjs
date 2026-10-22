import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {loadExampleBuild,validateExampleReview} from '../scripts/build-dictionary-examples.mjs';
import {readDictionaryNamespace,assertHistoricalDictionaryLineage,SOURCE_LINEAGE_BASE_VERSION} from '../lib/dictionary-source-lineage.mjs';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url),sha=value=>createHash('sha256').update(value).digest('hex');
const read=file=>readFile(new URL(file,root)),json=async file=>JSON.parse(await read(file));
const version='e929d35b959c01772ab80d36db38775c7ecf8d4490c28c6928a3d29674f30ebc';
const dictionaryVersion='9f27bbc2f083007095b2e6830a87b2d0a7e18353f91a2e962b82443b2480339b';
const pins=[
 ['p001','c31f4be5d008deb6f88b0293a4d13014e66f13932db41051360a59903580af34','e4559ef530386ad2f3dba4d86a53bc05fb953c19740f92c78f02cddeb66f1941',72,'e'],
 ['p002','012c58590abc38669509daebf3a090d0fa8f25010d376fbe6730192c52968299','d62ab2ae0849da386867786d69e8a3e1c93c994770f330823fee57fde7d22822',2,'e'],
 ['p003','bb8a8622ef18d82e0b9b45fe51d0dfebccb1c46e50033da483cd595b78b97ad3','8e021e3778b3d888615853b37a9e8b6da1178185ae467de0d27b82800357d0e4',4,'e2']];
const provenance=await json('tooling/dictionary/examples/queues/batch-0022-provenance.json');
const queue=await json('tooling/dictionary/examples/queues/batch-0022.json');
const outcome=await json('tooling/dictionary/examples/queues/batch-0022-outcome.json');
const build=await loadExampleBuild(),byTerm=new Map(build.entries.map(row=>[row.term,row]));
const dictionaryManifest=await json('vocab/data/expanded-dictionary/manifest.json');
const namespace=await readDictionaryNamespace(dictionaryManifest,fileURLToPath(new URL('vocab/data/expanded-dictionary/',root)));

test('D22 exact 72+2+4 saved packs retain their original independent reviewer and five fields',async()=>{
 const expected=new Map(provenance.sourceQueues.map(row=>[row.term,row]));assert.equal(expected.size,78);
 const saved=[];
 for(const[id,sourceHash,reviewHash,count,reviewer]of pins){
  const name='batch-0022-'+id+'.json',sourceBytes=await read('tooling/dictionary/examples/source/'+name),reviewBytes=await read('tooling/dictionary/examples/reviews/'+name);
  assert.equal(sha(sourceBytes),sourceHash);assert.equal(sha(reviewBytes),reviewHash);
  const pack=JSON.parse(sourceBytes),review=JSON.parse(reviewBytes),rows=validateExampleReview(pack,review);assert.equal(rows.length,count);
  assert.equal(review.reviewer,'AI/examples22_reviewer_'+reviewer);
  for(const row of rows){
   const original=expected.get(row.term);assert(original);assert.equal(original.reviewerPrincipal,reviewer);
   assert(!original.authorPrincipal.split('_and_').includes(reviewer));
   assert.deepEqual([row.term,row.partOfSpeech,row.meaningZh,row.en,row.zh],original.pair);
   assert.deepEqual(namespace.records.get(row.term),original.source);assert.equal(sha(JSON.stringify(original.source)),original.sourceSha256);
   const sense=byTerm.get(row.term).senses;assert.equal(sense.length,1);assert.equal(sense[0].partOfSpeech,row.partOfSpeech);
   assert.equal(sense[0].meaningZh,row.meaningZh);assert.deepEqual(sense[0].examples,[{en:row.en,zh:row.zh}]);assert.equal(sense[0].reviewer,review.reviewer);
   saved.push(row.term);
  }
 }
 assert.deepEqual(saved,provenance.sourceQueues.map(row=>row.term));assert.equal(new Set(saved).size,78);
});

test('D22 preserves all48 explicit author holds and four specific old-hold re-entry chains',()=>{
 assert.equal(queue.queuedHeads,126);assert.equal(queue.retainedHolds.length,48);assert.equal(outcome.deferred.length,48);
 assert.deepEqual(queue.retainedHolds,provenance.retainedHolds);assert.deepEqual(outcome.reentries,provenance.reentries);
 assert.deepEqual(outcome.deferred,provenance.retainedHolds.map(row=>({term:row.term,stage:'authoring',reason:row.authorHold.reason,sourceSha256:row.sourceSha256})));
 assert.equal(new Set([...provenance.sourceQueues,...provenance.retainedHolds].map(row=>row.term)).size,126);
 assert.deepEqual(provenance.reentries.map(row=>row.term),['Middle England','bicarb','are','been']);
 for(const hold of provenance.retainedHolds){assert(!byTerm.has(hold.term));assert.deepEqual(namespace.records.get(hold.term),hold.source);assert.equal(sha(JSON.stringify(hold.source)),hold.sourceSha256);assert(hold.authorHold.reason.trim());}
 assert.equal(provenance.reentries.find(row=>row.term==='been').exactHistoricalHold.pack,'p012');
 assert.match(provenance.reentries.find(row=>row.term==='are').exactHistoricalHold.reason,/area unit/u);
 assert.equal(provenance.privateRecordsAccessed,false);assert.equal(provenance.complete,false);
});

test('D22 actual corrected namespace changes only the reviewed four records and exact stale refs',async()=>{
 assert.equal(dictionaryManifest.version,dictionaryVersion);
 const result=await assertHistoricalDictionaryLineage(SOURCE_LINEAGE_BASE_VERSION,dictionaryManifest,namespace.records);
 assert.deepEqual(result,provenance.sourceLineage);assert.equal(result.unchangedRecords,102605);
 assert.deepEqual(result.changedTerms,['are','did','had','been']);assert.equal(result.removedExactFormRefs.length,4);
 const audit=await json('vocab/data/expanded-dictionary/source-audit.json');assert.equal(audit.sourceRevisions.applied,4);
});

test('D22 all256 actual example shards match the complete deterministic build',async()=>{
 const manifestBytes=await read('vocab/data/dictionary-examples/manifest-v2.json');assert.deepEqual(manifestBytes,build.files.get('manifest-v2.json'));
 assert.equal(build.manifest.version,version);assert.deepEqual(build.manifest.counts,{heads:85259,examples:86648});
 assert.equal(build.manifest.shards.length,256);
 for(const descriptor of build.manifest.shards){const bytes=await read('vocab/data/dictionary-examples/'+descriptor.file);assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);assert.deepEqual(bytes,build.files.get(descriptor.file));}
 assert.equal(outcome.remainingHeads,17350);assert.equal(outcome.complete,false);
});

test('D22 all85181 older heads and86570 whole pairs are unchanged; new English is novel',async()=>{
 assert.equal(provenance.baselineManifest.version,'aad44cb969693e134e9b09821a694c69c84d12f124eed69dfa9902971306c1f0');
 const older=new Set(),sentences=new Set();let heads=0,pairs=0;
 for(const descriptor of provenance.baselineManifest.shards){
  const bytes=await read('vocab/data/dictionary-examples/'+descriptor.file);assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);
  for(const row of JSON.parse(bytes).entries){assert(!older.has(row.term));older.add(row.term);heads++;assert.deepEqual(byTerm.get(row.term),row);for(const sense of row.senses)for(const pair of sense.examples){pairs++;sentences.add(pair.en.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim());}}
 }
 assert.equal(heads,85181);assert.equal(pairs,86570);
 for(const entry of provenance.sourceQueues){assert(!older.has(entry.term));const key=entry.pair[3].normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();assert(!sentences.has(key));sentences.add(key);}
 const related=await json('tooling/dictionary/chinese-related-common-examples.json');assert.equal(related.dictionaryExamplesVersion,version);assert.equal(related.dictionaryExamplesManifestSha256,sha(build.files.get('manifest-v2.json')));
});
