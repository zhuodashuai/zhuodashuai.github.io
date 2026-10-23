import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Filled only from the actual normal build, not the admission projection.
export const D26_BUILD=Object.freeze({"version":"571d90601aab915939fa2b23f30ecbde365ce8580bd4c08e73d7af29c5da264b","manifestSha256":"c53db6ed450f5ccf0b8a141f8f074459cb502683cb1048974a253b9b329c4487","queueSha256":"5c66b3ed2a63f1faeb92bde7e711870d0ebbbf9095865aa9b0767a56d946dd3c","provenanceSha256":"9de9faf17dc65b733184ad803d4e782f3946029b9be0c46f766a4f21a1bd9455"});
export const D26_REPRESENTATIVES=Object.freeze([
  ['a hundred and one',390],['or not',1440],['as the mood takes somebody',390],
  ["hang on somebody's every word",1440],['keep at bay',390],["he'd",1440],
  ['qua',390],['touche',1440]
]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const fold=s=>s.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
export const meaningLines=s=>(/^\s*(?:[①-⑳]|\d+[.、])/u.test(s)?s:'① '+s).split(/\r?\n/u).filter(s=>s.trim());
export async function loadD26Fixture(){
  assert(D26_BUILD,'Actual D26 build is not registered');
  assert.deepEqual(Object.keys(D26_BUILD).sort(),['version','manifestSha256','queueSha256','provenanceSha256'].sort());
  for(const value of Object.values(D26_BUILD))assert.equal(typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value),true,'Incomplete actual D26 build binding');
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const read=async file=>fs.readFile(path.join(root,file));
  const json=async file=>JSON.parse(await read(file));
  async function loadExamples(file,expected){
    const raw=await read(file);if(expected)assert.equal(sha(raw),expected);
    const manifest=JSON.parse(raw),entries=new Map();let pairs=0;
    assert.equal(manifest.schemaVersion,2);assert.equal(manifest.shards.length,256);
    for(const d of manifest.shards){
      const bytes=await read('vocab/data/dictionary-examples/'+d.file);
      assert.equal(bytes.length,d.bytes);assert.equal(sha(bytes),d.sha256);
      for(const row of JSON.parse(bytes).entries){assert(!entries.has(row.term));entries.set(row.term,row);pairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);}
    }
    assert.equal(entries.size,manifest.counts.heads);assert.equal(pairs,manifest.counts.examples);
    const sorted=[...entries.values()].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
    assert.equal(sha(JSON.stringify({schemaVersion:2,bucketCount:256,entries:sorted})),manifest.version);
    return {manifest,entries,pairs};
  }
  const before=await loadExamples('tooling/dictionary/examples/archives/baseline-93e0610e74ecc7e990ba28900733efd2996c03186054e82c33e5a185948f99b5.manifest.json','d7c1630bc1feed1e41e9c3f42cd8ce0947c39e395360b770cf5fca3f45ef2d39');
  const after=await loadExamples('tooling/dictionary/examples/archives/baseline-'+D26_BUILD.version+'.manifest.json',D26_BUILD.manifestSha256);
  assert.equal(after.manifest.version,D26_BUILD.version);
  assert.deepEqual(before.manifest.counts,{heads:85366,examples:86755});
  assert.deepEqual(after.manifest.counts,{heads:85449,examples:86838});
  const current=await loadExamples('vocab/data/dictionary-examples/manifest-v2.json');
  for(const [term,row]of before.entries)assert.deepEqual(after.entries.get(term),row,'Old whole example changed '+term);
  for(const [term,row]of after.entries)assert.deepEqual(current.entries.get(term),row,'Current example lost '+term);
  const sourceRaw=await read('vocab/data/expanded-dictionary/manifest.json');
  assert.equal(sha(sourceRaw),'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f');
  const source=JSON.parse(sourceRaw),records=new Map();
  for(const d of source.english.shards){const raw=await read('vocab/data/expanded-dictionary/'+d.file);assert.equal(raw.length,d.bytes);assert.equal(sha(raw),d.sha256);for(const row of JSON.parse(raw).records){if(records.has(row.term))assert.deepEqual(records.get(row.term),row);else records.set(row.term,row);}}
  assert.equal(records.size,102609);
  const queueRaw=await read('tooling/dictionary/examples/queues/batch-0026.json');
  assert.equal(sha(queueRaw),D26_BUILD.queueSha256,'Whole authored entries and all nine original hold objects/flags/reasons changed');
  const queue=JSON.parse(queueRaw);
  const provenanceRaw=await read('tooling/dictionary/examples/queues/batch-0026-provenance.json');
  assert.equal(sha(provenanceRaw),D26_BUILD.provenanceSha256,'Original admission evidence changed');
  const provenance=JSON.parse(provenanceRaw);
  assert.equal(queue.entries.length,83);assert.equal(queue.authorHolds.length,9);
  assert.deepEqual(queue.authorHolds.map(r=>r.term).sort(),['every bit as','ere','cum','vee','ran','got','met','yup','hah'].sort());
  assert.equal(provenance.newLanguageDecisions,0);assert.equal(provenance.sourceChanges,0);assert.equal(provenance.formsChanges,0);
  assert.deepEqual(provenance.originalLanguageOpinions,[{reviewerPrincipal:'root',pairs:82},{reviewerPrincipal:'c',pairs:1}]);
  const standard=await import(pathToFileURL(path.join(root,'tooling/scripts/build-dictionary-examples.mjs')));
  const rows=[];
  for(const [i,reviewer]of ['AI/examples26_reviewer_root','AI/examples26_reviewer_c'].entries()){
    const file='batch-0026-p00'+(i+1)+'.json',pack=await json('tooling/dictionary/examples/source/'+file),review=await json('tooling/dictionary/examples/reviews/'+file);
    assert.equal(review.reviewer,reviewer);assert.equal(review.independentOfAuthor,true);
    rows.push(...standard.validateExampleReview(pack,review));
  }
  assert.equal(rows.length,83);
  const pairByTerm=new Map(),oldEn=new Set(),newEn=new Set();
  for(const row of before.entries.values())for(const s of row.senses)for(const p of s.examples)oldEn.add(fold(p.en));
  for(const entry of queue.entries){
    assert.deepEqual(records.get(entry.term),entry.source,'Source changed '+entry.term);
    assert.equal(sha(JSON.stringify(entry.source)),entry.sourceSha256);assert.equal(sha(JSON.stringify(entry.pair)),entry.pairSha256);
    const [term,partOfSpeech,meaningZh,en,zh]=entry.pair;
    const row=rows.find(r=>r.term===term);assert(row);assert.deepEqual(row,{term,partOfSpeech,meaningZh,en,zh,reviewer:term==='touche'?'AI/examples26_reviewer_c':'AI/examples26_reviewer_root'});
    const saved=after.entries.get(term);assert(!before.entries.has(term));assert.equal(saved.senses.length,1);
    assert.equal(saved.senses[0].partOfSpeech,partOfSpeech);assert.equal(saved.senses[0].meaningZh,meaningZh);
    assert.deepEqual(saved.senses[0].examples,[{en,zh}]);assert.equal(saved.senses[0].reviewer,row.reviewer);
    assert(!oldEn.has(fold(en))&&!newEn.has(fold(en)),'English duplicate '+term);newEn.add(fold(en));pairByTerm.set(term,row);
  }
  assert.deepEqual([...after.entries.keys()].filter(t=>!before.entries.has(t)).sort(),[...pairByTerm.keys()].sort());
  for(const held of queue.authorHolds){assert.deepEqual(records.get(held.term),held.source);assert(!after.entries.has(held.term),'Held source falsely counted '+held.term);}
  const index=await json('tooling/dictionary/examples/index.json');
  assert.equal(provenance.baselineSourceFiles.length,534);assert.deepEqual(index.sourceFiles.slice(0,536),[...provenance.baselineSourceFiles,'batch-0026-p001.json','batch-0026-p002.json']);
  function display(record){
    function readable(item){
      if(!['mit','core','pos-reviewed','grammar-reviewed','pos-notation-reviewed'].includes(item.source)||/^\s*(?:[①-⑳]|\d+[.、])/u.test(item.meaning))return item;
      // Independent finite reference for this cohort, not the product formatter.
      // Its six observed legacy prefixes are fixed; an unfamiliar or second
      // labelled sense must be reviewed rather than silently generalized.
      const labels={adv:'adverb',int:'interjection',interj:'interjection',n:'noun',prep:'preposition',vi:'verb'};
      const lines=item.meaning.split(/\r?\n/u).map(s=>s.trim()).filter(Boolean);
      const prefixes=lines.map((line,i)=>({i,match:/^([a-z]+)\.\s*/u.exec(line)})).filter(r=>r.match);
      assert(prefixes.length<=1&&prefixes.every(r=>r.i===0&&Object.hasOwn(labels,r.match[1])),'Unreviewed display shape '+record.term);
      const partOfSpeech=prefixes.length?labels[prefixes[0].match[1]]:item.partOfSpeech;
      return {...item,partOfSpeech,meaning:'① '+lines.join('\n   ')};
    }
    const p=readable(record),d=source.sources[record.source],result={term:record.term,partOfSpeech:p.partOfSpeech,meaning:p.meaning,source:d.name,license:d.license,url:d.url};
    const alts=(record.variants||[]).filter(v=>!((record.source==='pos-reviewed'||record.source==='grammar-reviewed'&&v.source==='mit')&&v.meaning===record.meaning&&!v.partOfSpeech.trim())).map(v=>{const r=readable(v),s=source.sources[v.source];return{partOfSpeech:r.partOfSpeech,meaning:r.meaning,source:s.name,license:s.license,url:s.url};});if(alts.length)result.alternatives=alts;return result;
  }
  const product=await import(pathToFileURL(path.join(root,'vocab/js/expanded-dictionary.js')));
  const fetchImpl=async url=>{const file=fileURLToPath(url);assert(path.resolve(file).startsWith(path.resolve(root,'vocab/data/expanded-dictionary')+path.sep));const raw=await fs.readFile(file);return new Response(raw,{headers:{'content-length':String(raw.length)}});};
  for(const entry of queue.entries){const result=await product.searchExpandedDictionary(entry.term,{fetchImpl,timeoutMs:30000});assert.deepEqual(result.results,[display(entry.source)],'Complete runtime lookup changed '+entry.term);}
  return {before,after,current,queue,provenance,pairByTerm,representatives:D26_REPRESENTATIVES.map(([term,width])=>({term,width,pair:pairByTerm.get(term),display:display(records.get(term))}))};
}
