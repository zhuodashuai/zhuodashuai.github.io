import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateDevelopmentCorpus,completeDevelopmentStream} from '../scripts/audit-dictionary-development.mjs';

test('development audit retains original inputs without promoting exploratory heads to accuracy expectations',async()=>{
  const bytes=await readFile(new URL('../dictionary/search-benchmarks/2026-11-20-development.json',import.meta.url));
  const corpus=validateDevelopmentCorpus(JSON.parse(bytes));
  assert.equal(corpus.queries.slice(0,48).filter(r=>r.language==='zh').length,24);
  assert.match(corpus.scope,/not an unseen evaluation/u);
  assert.equal(createHash('sha256').update(JSON.stringify(corpus.queries)).digest('hex'),'af746c4374213a006c55244cfc37d885b511205f727ee2d9217ae9effe7de729');
  const promoted=structuredClone(corpus);promoted.queries[0].expectedHeads=['refund policy'];
  assert.throws(()=>validateDevelopmentCorpus(promoted));
});

test('development audit reads every Chinese page with the same options and preserves complete DTOs',async()=>{
  const rows=Array.from({length:73},(_,n)=>({term:'term '+n,meaning:'义项 '+n,partOfSpeech:'noun',source:'source',context:{original:n}})),offsets=[];
  const options={fetchImpl:()=>{},useChineseQueryCache:false};
  const stream=await completeDevelopmentStream(async(query,args)=>{
    assert.equal(query,'中文');assert.equal(args.fetchImpl,options.fetchImpl);assert.equal(args.useChineseQueryCache,false);offsets.push(args.offset);
    return {results:rows.slice(args.offset,args.offset+args.limit),total:73,ranking:'global',relatedIntegrated:true,hasMore:args.offset===0,nextOffset:50};
  },{query:'中文',language:'zh'},options);
  assert.deepEqual(offsets,[0,50]);assert.deepEqual(stream,{results:rows,pages:2,total:73});
});

test('development audit rejects incomplete, duplicated or non-progressing Chinese streams',async()=>{
  const base={results:[{term:'a'}],total:1,ranking:'global',relatedIntegrated:true,hasMore:false};
  for(const changes of [{coverage:'limited'},{ranking:'local'},{relatedIntegrated:false},{total:2},{total:null},{hasMore:true,nextOffset:0},{hasMore:true,nextOffset:1},{results:[],hasMore:true,nextOffset:1,total:2}]){
    await assert.rejects(()=>completeDevelopmentStream(async()=>({...base,...changes}),{query:'中文',language:'zh'},{}));
  }
  await assert.rejects(()=>completeDevelopmentStream(async()=>({...base,results:[{term:'a'},{term:'a'}],total:2}),{query:'中文',language:'zh'},{}),/Duplicate head/u);
});
