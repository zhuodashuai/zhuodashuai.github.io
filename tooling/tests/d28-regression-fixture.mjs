import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadD26Fixture} from './d26-regression-fixture.mjs';

// Register only the actual normal build and actual saved import receipts.
export const D28_BUILD=Object.freeze({"version":"321bcdb170d6e810cab79179b1d492c338150366c8fa638188e53dcebc8fc382","manifestSha256":"5740a33e757348569d51c24a0580736e788a57071183b3e782fb6d45bf365be0","queueSha256":"0ab267a8fc3cbea43eae9192cc05cb160ee6b7906cfdaf9c1b31d26171bef288","provenanceSha256":"b2f70611884f1b1c3967c04f98a37de042fec0b981b3c896f0f7c89cfc964897"});
// Independently specified full primary display for the eight observed source
// shapes. No import of the product's meaning/POS formatter creates expectations.
export const D28_DISPLAYS=Object.freeze([
 ['allow for',390,'verb','① 虑及, 体谅','pos-reviewed'],
 ['as soon as',1440,'preposition · conjunction','① 一...就','pos-reviewed'],
 ['cast of characters',390,'noun','① 演员表','pos-reviewed'],
 ['tactility',1440,'noun','① n. 触感','mit'],
 ['whole number',390,'noun','① 整数','pos-reviewed'],
 ['free agency',1440,'noun','① 行动自由, 自由意志','pos-reviewed'],
 ['housing development',390,'noun','① 住宅开发；房屋建设','pos-reviewed'],
 ['on the side',1440,'adverb','① 作为兼职, 另外','pos-reviewed']
]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const fold=s=>s.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
export async function loadD28Fixture(){
 assert(D28_BUILD,'Actual D28 build has not been registered');
 assert.deepEqual(Object.keys(D28_BUILD).sort(),['version','manifestSha256','queueSha256','provenanceSha256'].sort());
 for(const pin of Object.values(D28_BUILD))assert.match(pin,/^[a-f0-9]{64}$/u);
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const read=file=>fs.readFile(path.join(root,file));
 const json=async(file,pin)=>{const b=await read(file);if(pin)assert.equal(sha(b),pin);return JSON.parse(b);};
 const inherited=await loadD26Fixture(),before=inherited.after,current=inherited.current;
 const manifest=await json('tooling/dictionary/examples/archives/baseline-'+D28_BUILD.version+'.manifest.json',D28_BUILD.manifestSha256);
 assert.equal(manifest.version,D28_BUILD.version);assert.deepEqual(manifest.counts,{heads:85637,examples:87026});
 const after=new Map();let pairs=0;for(const d of manifest.shards){const b=await read('vocab/data/dictionary-examples/'+d.file);assert.equal(b.length,d.bytes);assert.equal(sha(b),d.sha256);for(const row of JSON.parse(b).entries){assert(!after.has(row.term));after.set(row.term,row);pairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);}}
 assert.equal(after.size,85637);assert.equal(pairs,87026);
 assert.equal(sha(JSON.stringify({schemaVersion:2,bucketCount:256,entries:[...after.values()].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0)})),manifest.version);
 for(const [term,row]of before.entries)assert.deepEqual(after.get(term),row,'D28 changed an old whole example '+term);
 for(const [term,row]of after)assert.deepEqual(current.entries.get(term),row,'Current build lost a D28 whole example '+term);
 const source=await json('vocab/data/expanded-dictionary/manifest.json','2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f');
 const records=new Map();for(const d of [...source.english.shards,...source.chinese.shards]){const b=await read('vocab/data/expanded-dictionary/'+d.file);assert.equal(b.length,d.bytes);assert.equal(sha(b),d.sha256);if(d.file.includes('/en-'))for(const row of JSON.parse(b).records){if(records.has(row.term))assert.deepEqual(records.get(row.term),row);else records.set(row.term,row);}}
 assert.equal(records.size,102609);
 const queue=await json('tooling/dictionary/examples/queues/batch-0028.json',D28_BUILD.queueSha256),provenance=await json('tooling/dictionary/examples/queues/batch-0028-provenance.json',D28_BUILD.provenanceSha256);
 assert.equal(queue.entries.length,188);assert.equal(queue.deferred.length,26);assert.equal(queue.sourceChanged,false);assert.equal(queue.formsChanged,false);assert.equal(queue.published,false);assert.equal(queue.coverageAdded,0);
 assert.equal(queue.originalAuthorDeferrals.am.length,17);assert.equal(queue.originalAuthorDeferrals.nz.length,10);
 assert.equal(provenance.newLanguageDecisions,0);assert.equal(provenance.sourceChanges,0);assert.equal(provenance.formsChanges,0);assert.equal(provenance.published,false);assert.equal(provenance.baselineSourceFiles.length,536);
 const index=await json('tooling/dictionary/examples/index.json'),names=['batch-0028-p001.json','batch-0028-p002.json','batch-0028-p003.json','batch-0028-p004.json'];
 assert.deepEqual(index.sourceFiles.slice(0,540),[...provenance.baselineSourceFiles,...names]);
 const standard=await import(pathToFileURL(path.join(root,'tooling/scripts/build-dictionary-examples.mjs'))),rows=[];
 for(const [i,file]of names.entries()){const p=await json('tooling/dictionary/examples/source/'+file),r=await json('tooling/dictionary/examples/reviews/'+file);assert.equal(p.entries.length,[79,99,8,2][i]);assert.equal(r.reviewer,['AI/e','AI/examples28_reviewer_c','AI/examples28_reviewer_c','AI/examples28_reviewer_root'][i]);rows.push(...standard.validateExampleReview(p,r));}
 assert.equal(rows.length,188);const rowMap=new Map(rows.map(r=>[r.term,r]));assert.equal(rowMap.size,188);
 const oldEnglish=new Set();for(const old of before.entries.values())for(const s of old.senses)for(const pair of s.examples)oldEnglish.add(fold(pair.en));
 const newEnglish=new Set(),pairByTerm=new Map();
 for(const entry of queue.entries){
  assert.deepEqual(records.get(entry.term),entry.source);assert.equal(sha(JSON.stringify(entry.source)),entry.sourceSha256);assert.equal(sha(JSON.stringify(entry.pair)),entry.pairSha256);assert.notEqual(entry.authorPrincipal,entry.reviewerPrincipal);
  const [term,partOfSpeech,meaningZh,en,zh]=entry.pair,row=rowMap.get(term);assert(row);assert.deepEqual(row,{term,partOfSpeech,meaningZh,en,zh,reviewer:entry.reviewer});assert.equal(partOfSpeech,entry.source.partOfSpeech);assert(!before.entries.has(term));
  const saved=after.get(term);assert.equal(saved.senses.length,1);assert.equal(saved.senses[0].partOfSpeech,partOfSpeech);assert.equal(saved.senses[0].meaningZh,meaningZh);assert.deepEqual(saved.senses[0].examples,[{en,zh}]);assert.equal(saved.senses[0].reviewer,row.reviewer);
  assert(!oldEnglish.has(fold(en))&&!newEnglish.has(fold(en)));newEnglish.add(fold(en));pairByTerm.set(term,row);
 }
 assert.deepEqual([...after.keys()].filter(t=>!before.entries.has(t)).sort(),[...pairByTerm.keys()].sort());
 for(const held of queue.deferred){assert.deepEqual(records.get(held.term),held.source);assert(!after.has(held.term),'D28 falsely counted a deferred source '+held.term);}
 const product=await import(pathToFileURL(path.join(root,'vocab/js/expanded-dictionary.js'))),base=path.resolve(root,'vocab/data/expanded-dictionary');
 const fetchImpl=async url=>{const file=fileURLToPath(url);assert(path.resolve(file).startsWith(base+path.sep));const bytes=await fs.readFile(file);return new Response(bytes,{headers:{'content-length':String(bytes.length)}});};
 for(const row of rows){const result=await product.searchExpandedDictionary(row.term,{fetchImpl,timeoutMs:30000});assert.equal(result.results.length,1,'D28 exact canonical ambiguity '+row.term);assert.equal(result.results[0].term,row.term);}
 const representatives=D28_DISPLAYS.map(([term,width,partOfSpeech,meaning,sourceId])=>{const s=source.sources[sourceId];return{term,width,pair:pairByTerm.get(term),display:{term,partOfSpeech,meaning,source:s.name,license:s.license,url:s.url}};});
 for(const rep of representatives){const result=await product.searchExpandedDictionary(rep.term,{fetchImpl,timeoutMs:30000});assert.deepEqual(result.results,[rep.display]);}
 return{before,after,current,source,queue,provenance,pairByTerm,representatives};
}
