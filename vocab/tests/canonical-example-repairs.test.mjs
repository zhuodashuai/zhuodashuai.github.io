import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { canonicalSnapshot, canonicalSavedContext, canonicalDisplayContexts, canonicalSourceBucket,
  canonicalFold, createCanonicalSourceClient } from '../js/canonical-example-repair-source.js';
import { createCanonicalExampleRepairResolver, createCanonicalExampleRepairs } from '../js/dictionary-canonical-example-repairs.js';
import { CANONICAL_EXAMPLE_REPAIRS } from '../js/canonical-example-repairs-data.js';

// Synthetic transport records below deliberately exercise identity and failure
// handling. Their content is never emitted into the published learning corpus.
const clone = value => structuredClone(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const semantic = value => hash(JSON.stringify(value));
const KIND = 'canonical-same-sense-example-only-v1';
function fixture() {
  const term = 'hubble', bucket = canonicalSourceBucket(term), version = 'a'.repeat(64);
  const descriptor = { name: 'Synthetic test source', license: 'MIT', url: 'https://example.invalid/source' };
  const record = { id: 1280 + bucket, term, partOfSpeech: 'noun', meaning: 'n. 合成测试凸起', forms: ['hubbling'], source: 'mit' };
  const old = { term, senses: [{ id: 'example:hubble', partOfSpeech: 'proper noun', meaningZh: '合成测试专名',
    examples: [{ en: 'The old test used Hubble as a title.', zh: '旧测试把 Hubble 当作标题。' }], reviewer: 'AI/test-author', source: 'Synthetic original example' }] };
  const row = { term, canonicalId: record.id, canonicalSourceSha256: semantic(record), exactCanonicalRecord: clone(record),
    canonicalSourceDescriptor: clone(descriptor), expectedOriginalEntry: clone(old), expectedOriginalEntrySha256: semantic(old),
    acceptedDisplayContexts: canonicalDisplayContexts(record), replacementPair: { term, partOfSpeech: record.partOfSpeech, meaningZh: record.meaning,
      en: 'A hubble in the ice caught his skate.', zh: '冰面上的一个小凸起绊住了他的冰刀。' },
    senseId: `canonical-example:${record.id}:${semantic(record)}`, reviewer: 'AI/test-reviewer' };
  const shard = { schemaVersion: 2, kind: 'en', bucket, records: [clone(record)], keys: [[term, [{ id: record.id, kind: 'canonical' }]]] };
  const manifest = { schemaVersion: 2, version, sources: { mit: descriptor }, english: { buckets: 128,
    shards: Array.from({ length: 128 }, (_, i) => ({ bucket: i, file: `${version}/en-${String(i).padStart(3,'0')}.json`,
      sha256: '0'.repeat(64), bytes: 1, count: 0 })) } };
  const assets = new Map(), requests = [], table = { schemaVersion: 1, kind: KIND, pins: { version, manifestSha256: '' }, rows: [row] };
  const f = { term, bucket, manifest, shard, record, row, old, table, assets, requests };
  f.repin = () => {
    const shardBytes = Buffer.from(JSON.stringify(shard)), d = manifest.english.shards[bucket];
    Object.assign(d, { sha256: hash(shardBytes), bytes: shardBytes.length, count: shard.keys.length });
    assets.set(d.file, shardBytes); const manifestBytes = Buffer.from(JSON.stringify(manifest));
    assets.set('manifest.json', manifestBytes); table.pins.manifestSha256 = hash(manifestBytes);
  };
  f.fetch = async (url, options) => {
    const key = new URL(url).pathname.split('/expanded-dictionary/')[1];
    requests.push({ key, options }); assert(assets.has(key), `unexpected source URL ${url}`);
    return new Response(assets.get(key));
  };
  f.resolver = (overrides = {}) => createCanonicalExampleRepairResolver(table, { fetchImpl: f.fetch, loadOriginalEntry: async () => clone(old), ...overrides });
  f.repin(); return f;
}
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };

test('exact literal canonical context receives only a fresh same-sense original example', async () => {
  const f = fixture(), before = JSON.stringify({ table: f.table, old: f.old }), resolver = f.resolver();
  try {
    const result = await resolver.load('hubble');
    assert.equal(result.term, 'hubble'); assert.equal(result.senses.length, 1);
    const sense = result.senses[0]; assert.equal(sense.id, f.row.senseId);
    assert.equal(sense.partOfSpeech, f.record.partOfSpeech); assert.equal(sense.meaningZh, f.record.meaning);
    assert.deepEqual(sense.examples, [{ en: f.row.replacementPair.en, zh: f.row.replacementPair.zh }]);
    assert.equal(sense.source, '原创学习例句'); assert.equal(sense.reviewer, f.row.reviewer);
    assert.equal(JSON.stringify({ table: f.table, old: f.old }), before);
    assert.deepEqual(f.requests.map(r=>r.key), ['manifest.json', f.manifest.english.shards[f.bucket].file]);
    for (const { options } of f.requests) assert.deepEqual({ credentials: options.credentials, mode: options.mode, redirect: options.redirect, cache: options.cache },
      { credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-cache' });
    for (const internal of ['canonicalId','canonicalSourceSha256','expectedOriginalEntry','acceptedDisplayContexts','canonicalSourceDescriptor']) assert(!JSON.stringify(result).includes(internal));
    sense.examples[0].en = 'Untrusted changed output.';
    assert.equal((await resolver.load('hubble')).senses[0].examples[0].en, f.row.replacementPair.en);
  } finally { resolver.close(); }
});

test('both actual display identities and nested saved Chinese meaning retain canonical eligibility', async () => {
  const f = fixture(), resolver = f.resolver();
  try {
    for (const context of f.row.acceptedDisplayContexts) {
      assert(await resolver.load('hubble', { savedEntry: clone(context) }));
      assert(await resolver.load('hubble', { savedEntry: { ...context, meaning: { zh: context.meaning }, bookExamples: [{ en: 'Existing passage.', zh: '原文。' }] } }));
    }
    const entry = { partOfSpeech: f.record.partOfSpeech, meaning: f.record.meaning, ownExample: 'Preserved' }, before = clone(entry);
    assert(await resolver.load('hubble', { savedEntry: entry })); assert.deepEqual(entry, before);
  } finally { resolver.close(); }
});

for (const [name, saved] of [
  ['different POS', f => ({ term: f.term, partOfSpeech: 'proper noun', meaning: f.record.meaning })],
  ['different head', f => ({ term: 'Hubble', partOfSpeech: f.record.partOfSpeech, meaning: f.record.meaning })],
  ['different meaning', f => ({ term: f.term, partOfSpeech: f.record.partOfSpeech, meaning: '哈勃太空望远镜' })],
  ['custom numbered meaning', f => ({ term: f.term, partOfSpeech: f.record.partOfSpeech, meaning: `② ${f.record.meaning}` })],
]) test(`saved ${name} cannot acquire the replacement and makes no source requests`, async () => {
  const f = fixture(), resolver = f.resolver();
  try { assert.equal(await resolver.load(f.term, { savedEntry: saved(f) }), null); assert.equal(f.requests.length, 0); }
  finally { resolver.close(); }
});

test('case, fullwidth, word forms and caller query aliases do not select a managed literal head', async () => {
  const f = fixture(), resolver = f.resolver();
  try {
    for (const term of ['Hubble','ｈｕｂｂｌｅ','hubbling',' hubble ','unknown',null,{}]) {
      assert.equal(resolver.has(term), false); assert.equal(await resolver.load(term), null);
    }
    assert.equal(await resolver.load('hubble', { lookupQuery: 'hubbling' }), null); assert.equal(f.requests.length,0);
  } finally { resolver.close(); }
});

test('saved-context accessors are never evaluated and metadata cannot authorize another meaning', async () => {
  const f = fixture(), resolver = f.resolver(); let reads = 0;
  const entry = { term: f.term, meaning: f.record.meaning };
  Object.defineProperty(entry,'partOfSpeech',{enumerable:true,get(){reads++;return 'noun';}});
  const options = {}; Object.defineProperty(options,'savedEntry',{enumerable:true,get(){reads++;return f.row.acceptedDisplayContexts[0];}});
  try {
    assert.equal(await resolver.load(f.term,{savedEntry:entry}),null); assert.equal(await resolver.load(f.term,options),null);
    assert.equal(reads,0); assert.equal(f.requests.length,0);
    assert.equal(await resolver.load(f.term,{approved:true,savedEntry:f.row.acceptedDisplayContexts[0]}),null);
  } finally { resolver.close(); }
});

test('a captured source table cannot be changed after resolver construction', async () => {
  const f=fixture(), resolver=f.resolver(), expected=f.row.replacementPair.en;
  f.row.replacementPair.en='Unchecked changed content.';f.table.rows.length=0;
  try { assert.equal((await resolver.load('hubble')).senses[0].examples[0].en,expected); } finally { resolver.close(); }
});

test('additional reviewed pairs survive and are copied independently on each result', async () => {
  const f=fixture();f.row.additionalExamples=[{en:'He nearly tripped over a hubble in the road.',zh:'他差点被路上的小凸起绊倒。'}];
  const resolver=f.resolver();
  try {
    const a=await resolver.load('hubble');assert.equal(a.senses[0].examples.length,2);a.senses[0].examples[1].zh='改动';
    assert.deepEqual((await resolver.load('hubble')).senses[0].examples[1],f.row.additionalExamples[0]);
  } finally { resolver.close(); }
});

for (const [name, change] of [
  ['old term', entry=>entry.term='other'], ['old POS', entry=>entry.senses[0].partOfSpeech='noun'],
  ['old meaning', entry=>entry.senses[0].meaningZh='另一个意思'],['old reviewer', entry=>entry.senses[0].reviewer='AI/other'],
  ['old source', entry=>entry.senses[0].source='Unbound source'],['old example', entry=>entry.senses[0].examples[0].en='Another sentence.'],
  ['extra old pair', entry=>entry.senses[0].examples.push({en:'Extra.',zh:'额外。'})],['extra old sense', entry=>entry.senses.push(clone(entry.senses[0]))],
  ['extra old metadata', entry=>entry.extra=true],
]) test(`changed ${name} fails closed without returning the old wrong sense`,async()=>{
  const f=fixture(), changed=clone(f.old);change(changed);const resolver=f.resolver({loadOriginalEntry:async()=>changed});
  try {assert.equal(await resolver.load('hubble'),null);}finally{resolver.close();}
});

test('async saved-context mutation invalidates the pending result while unrelated card fields are preserved',async()=>{
  const f=fixture(), gate=deferred(), saved=clone(f.row.acceptedDisplayContexts[0]);
  const resolver=f.resolver({loadOriginalEntry:async()=>{await gate.promise;return clone(f.old);}});
  try {
    const pending=resolver.load('hubble',{savedEntry:saved});saved.meaning='哈勃太空望远镜';gate.resolve();
    assert.equal(await pending,null);
  }finally{resolver.close();}
});

test('original DTO getters and toJSON facades never borrow the approved digest',async()=>{
  for(const mode of ['getter','toJSON']){
    const f=fixture();let reads=0;const entry=clone(f.old);
    if(mode==='getter')Object.defineProperty(entry,'term',{enumerable:true,get(){reads++;return f.term;}});
    else entry.toJSON=()=>{reads++;return f.old;};
    const resolver=f.resolver({loadOriginalEntry:async()=>entry});
    try{assert.equal(await resolver.load(f.term),null);assert.equal(reads,0);}finally{resolver.close();}
  }
});

test('mutation of the complete original DTO while its digest is pending cannot acquire a repair',async()=>{
  const f=fixture(),entry=clone(f.old),gate=deferred(),started=deferred();
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),native=globalThis.crypto,oldBytes=Buffer.from(JSON.stringify(entry));
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:async(algorithm,bytes)=>{
    if(Buffer.from(bytes).equals(oldBytes)){started.resolve();await gate.promise;}
    return native.subtle.digest(algorithm,bytes);
  }}}});
  const resolver=f.resolver({loadOriginalEntry:async()=>entry});
  try{
    const pending=resolver.load(f.term);await started.promise;entry.senses[0].meaningZh='异步期间换成另一个意思';gate.resolve();
    assert.equal(await pending,null);
  }finally{gate.resolve();Object.defineProperty(globalThis,'crypto',descriptor);resolver.close();}
});

for(const [name,change] of [
  ['manifest bytes',f=>f.assets.set('manifest.json',Buffer.from('{}'))],
  ['shard bytes',f=>f.assets.set(f.manifest.english.shards[f.bucket].file,Buffer.from('{}'))],
  ['form ref',f=>{f.shard.keys[0][1][0].kind='form';f.repin();}],
  ['wrong canonical key ID',f=>{f.shard.keys[0][1][0].id++;f.repin();}],
  ['duplicate owner',f=>{f.shard.records.push(clone(f.record));f.repin();}],
  ['NFKC duplicate owner',f=>{f.shard.records.push({...clone(f.record),term:'ｈｕｂｂｌｅ'});f.repin();}],
  ['duplicate canonical key',f=>{f.shard.keys.push(clone(f.shard.keys[0]));f.repin();}],
  ['canonical source descriptor',f=>{f.manifest.sources.mit.license='wrong';f.repin();}],
  ['canonical seed or extra field',f=>{f.shard.records[0].newField='unbound';f.repin();}],
  ['foreign shard path',f=>{f.manifest.english.shards[f.bucket].file='https://example.invalid/foreign.json';f.repin();}],
])test(`newly pinned synthetic transport still rejects ${name}`,async()=>{
  const f=fixture();change(f);const resolver=f.resolver();
  try{assert.equal(await resolver.load(f.term),null);}finally{resolver.close();}
});

test('a consistently rehashed canonical ID cannot move its literal head into the wrong modulo bucket',async()=>{
  const f=fixture();f.row.canonicalId++;f.row.exactCanonicalRecord.id++;f.shard.records[0].id++;f.shard.keys[0][1][0].id++;
  f.row.canonicalSourceSha256=semantic(f.row.exactCanonicalRecord);f.row.senseId=`canonical-example:${f.row.canonicalId}:${f.row.canonicalSourceSha256}`;f.repin();
  const resolver=f.resolver();try{assert.equal(await resolver.load(f.term),null);}finally{resolver.close();}
});

test('even authentic malformed UTF-8 bytes fail before JSON data can be admitted',async()=>{
  const f=fixture(),bytes=new Uint8Array([0xff,0xfe]);f.table.pins.manifestSha256=hash(bytes);
  const resolver=f.resolver({fetchImpl:async()=>new Response(bytes)});
  try{assert.equal(await resolver.load(f.term),null);}finally{resolver.close();}
});

test('network, redirect, foreign response URL, size and UTF-8 failures return no optional example',async()=>{
  for(const mode of ['network','redirect','foreign-url','length','utf8']){
    const f=fixture(),resolver=f.resolver({fetchImpl:async()=>{
      if(mode==='network')throw Error('offline');
      const r=new Response(mode==='utf8'?new Uint8Array([0xff]):'{}',{headers:mode==='length'?{'content-length':'999999999'}:{}});
      if(mode==='redirect')Object.defineProperty(r,'redirected',{value:true});
      if(mode==='foreign-url')Object.defineProperty(r,'url',{value:'https://example.invalid/foreign.json'});
      return r;
    }});
    try{assert.equal(await resolver.load(f.term),null);}finally{resolver.close();}
  }
});

test('decoded gzip response bytes use decoded hashes and limits rather than CDN wire Content-Length',async()=>{
  const f=fixture(),resolver=f.resolver({fetchImpl:async(url)=>{
    const key=new URL(url).pathname.split('/expanded-dictionary/')[1];
    return new Response(f.assets.get(key),{headers:{'content-encoding':'gzip','content-length':'1'}});
  }});
  try{assert(await resolver.load(f.term));}finally{resolver.close();}
});

test('unavailable crypto hides only the optional example without returning the retired sense',async()=>{
  const f=fixture(),resolver=f.resolver(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});
  try{assert.equal(await resolver.load(f.term),null);}finally{Object.defineProperty(globalThis,'crypto',descriptor);resolver.close();}
});

test('abort and close settle promptly even when an original-entry dependency ignores its signal',async()=>{
  for(const mode of ['abort','close']){
    const f=fixture(), gate=deferred(), started=deferred(), controller=new AbortController();
    const resolver=f.resolver({loadOriginalEntry:()=>{started.resolve();return gate.promise;}});
    const pending=resolver.load(f.term,{signal:controller.signal});await started.promise;
    if(mode==='abort')controller.abort();else resolver.close();
    await assert.rejects(pending,{name:'AbortError'});gate.resolve(clone(f.old));resolver.close();
  }
});

test('already aborted managed lookup makes no network calls',async()=>{
  const f=fixture(),resolver=f.resolver(),controller=new AbortController();controller.abort();
  try{await assert.rejects(resolver.load(f.term,{signal:controller.signal}),{name:'AbortError'});assert.equal(f.requests.length,0);}finally{resolver.close();}
});

test('bounded optional deadline returns no example when an original dependency never settles',async()=>{
  const f=fixture(),gate=deferred(),resolver=f.resolver({timeoutMs:30,loadOriginalEntry:()=>gate.promise});
  try{assert.equal(await resolver.load(f.term),null);}finally{gate.resolve(clone(f.old));resolver.close();}
});

test('concurrent source consumers share bytes and cancelling one does not abort the other',async()=>{
  const f=fixture(),gate=deferred(),started=deferred(),controller=new AbortController();let calls=0;
  const source=createCanonicalSourceClient(f.table.pins,{fetchImpl:async(...args)=>{calls++;if(calls===1){started.resolve();await gate.promise;}return f.fetch(...args);}});
  try{
    const a=source.authenticate(f.row,{signal:controller.signal}),b=source.authenticate(f.row);await started.promise;controller.abort();
    await assert.rejects(a,{name:'AbortError'});gate.resolve();assert.deepEqual(await b,f.record);assert.equal(calls,2);
    assert.deepEqual(await source.authenticate(f.row),f.record);assert.equal(calls,2);
  }finally{gate.resolve();source.close();}
});

test('a source timeout bounds a fetch implementation that ignores abort and permits later retry',async()=>{
  const f=fixture(),never=deferred();let broken=true;
  const source=createCanonicalSourceClient(f.table.pins,{timeoutMs:25,fetchImpl:(...args)=>broken?never.promise:f.fetch(...args)});
  try{
    await assert.rejects(source.authenticate(f.row));broken=false;
    assert.deepEqual(await source.authenticate(f.row),f.record);
  }finally{never.resolve(new Response('{}'));source.close();}
});

test('closing a source client promptly rejects a shared download even if fetch ignores abort',async()=>{
  const f=fixture(),gate=deferred(),started=deferred();
  const source=createCanonicalSourceClient(f.table.pins,{timeoutMs:5000,fetchImpl:()=>{started.resolve();return gate.promise;}});
  let timer;
  try{
    const pending=source.authenticate(f.row);await started.promise;source.close();
    const outcome=await Promise.race([pending.then(()=>({resolved:true}),error=>({error})),new Promise(resolve=>{timer=setTimeout(()=>resolve({timedOut:true}),100);})]);
    assert.equal(outcome.timedOut,undefined,'close must settle the caller without waiting for a five-second transport timeout');
    assert.equal(outcome.error?.name,'AbortError');
  }finally{clearTimeout(timer);gate.resolve(new Response('{}'));source.close();}
});

test('runtime constructor rejects changed-head chains, scriptless pairs and duplicate normalized owners',()=>{
  for(const change of [
    f=>{f.row.expectedOriginalEntry.term='other';f.row.expectedOriginalEntrySha256=semantic(f.row.expectedOriginalEntry);},
    f=>{f.row.replacementPair.en='123456';},f=>{f.row.replacementPair.zh='English only';},
    f=>{const r=clone(f.row);r.term='ｈｕｂｂｌｅ';r.exactCanonicalRecord.term=r.term;f.table.rows.push(r);},
    f=>{f.row.additionalExamples=[{en:f.row.replacementPair.en,zh:'重复。'}];},
    f=>{f.row.acceptedDisplayContexts.push({term:f.term,partOfSpeech:'noun',meaning:'另一个意思'});},
    f=>{f.row.approved=true;},f=>{f.row.senseId=f.old.senses[0].id;},
  ]){const f=fixture();change(f);assert.throws(()=>f.resolver());}
});

test('source snapshots reject hidden/accessor/facade/symbol/sparse fields without executing code',()=>{
  let reads=0;const getter={};Object.defineProperty(getter,'x',{enumerable:true,get(){reads++;return 1;}});
  const hidden={};Object.defineProperty(hidden,'x',{value:1});
  for(const value of [getter,hidden,{[Symbol('x')]:1},new Array(2),{toJSON(){reads++;return{};}},Object.create({x:1}),{x:'\u0000'}])assert.throws(()=>canonicalSnapshot(value));
  assert.equal(reads,0);assert.equal(canonicalFold(' ＨＵＢＢＬＥ '),'hubble');
  assert.throws(()=>canonicalSavedContext({term:'hubble',partOfSpeech:'noun',meaning:{get zh(){reads++;return '凸起';}}},'hubble'));assert.equal(reads,0);
});

test('real immutable hubble source and old complete DTO authorize the actual same-sense pair',async()=>{
  const pack=JSON.parse(await readFile(new URL('../../tooling/dictionary/examples/canonical-repairs/source/canonical-quality-0001.json',import.meta.url),'utf8'));
  const input=pack.entries[0],pins=JSON.parse(await readFile(new URL('../../tooling/dictionary/examples/canonical-repairs/index.json',import.meta.url),'utf8')).pins;
  const row={term:input.term,canonicalId:input.canonicalId,canonicalSourceSha256:input.canonicalSourceSha256,exactCanonicalRecord:input.exactCanonicalRecord,
    canonicalSourceDescriptor:input.canonicalSourceDescriptor,expectedOriginalEntry:input.expectedOriginalEntry,expectedOriginalEntrySha256:input.expectedOriginalEntrySha256,
    acceptedDisplayContexts:input.acceptedDisplayContexts,replacementPair:input.replacementPair,senseId:`canonical-example:${input.canonicalId}:${input.canonicalSourceSha256}`,reviewer:'AI/test-reviewer'};
  const requests=[];const resolver=createCanonicalExampleRepairResolver({schemaVersion:1,kind:KIND,pins,rows:[row]},
    {fetchImpl:async(url,options)=>{requests.push(url);assert.equal(options.credentials,'omit');return new Response(await readFile(new URL(url)));},loadOriginalEntry:async()=>clone(input.expectedOriginalEntry)});
  try{
    const result=await resolver.load('hubble',{savedEntry:clone(input.acceptedDisplayContexts[1])});
    assert.equal(result.senses[0].meaningZh,'n. 小凸起, 小瘤');assert.equal(result.senses[0].partOfSpeech,'noun');
    assert.equal(result.senses[0].examples[0].en,'His skate caught on a hubble in the ice, and he stumbled.');
    assert(requests.some(url=>url.endsWith('/en-085.json')));assert(!requests.some(url=>url.endsWith('/en-078.json')));
  }finally{resolver.close();}
});

test('every admitted shipped row authenticates real bytes, preserves canonical meaning and retains all matched pairs',async()=>{
  const table=CANONICAL_EXAMPLE_REPAIRS,before=JSON.stringify(table),requests=[],old=new Map(table.rows.map(row=>[row.term,row.expectedOriginalEntry]));
  const resolver=createCanonicalExampleRepairs({fetchImpl:async(url,options)=>{
    requests.push(url);assert.equal(options.credentials,'omit');
    return new Response(await readFile(new URL(url)));
  },loadOriginalEntry:async term=>clone(old.get(term))});
  try{
    assert(table.rows.length>0);
    for(const row of table.rows){
      for(const savedEntry of row.acceptedDisplayContexts){
        const result=await resolver.load(row.term,{savedEntry:clone(savedEntry)}),sense=result.senses[0];
        assert.equal(sense.partOfSpeech,row.exactCanonicalRecord.partOfSpeech);assert.equal(sense.meaningZh,row.exactCanonicalRecord.meaning);
        assert.deepEqual(sense.examples,[{en:row.replacementPair.en,zh:row.replacementPair.zh},...(row.additionalExamples??[])]);
        for(const pair of sense.examples){assert.match(pair.en,/\p{Script=Latin}/u);assert.match(pair.zh,/\p{Script=Han}/u);}
        sense.examples.at(-1).en='Changed output.';
        assert.notEqual((await resolver.load(row.term,{savedEntry:clone(savedEntry)})).senses[0].examples.at(-1).en,'Changed output.');
      }
      const retired=row.expectedOriginalEntry.senses[0];
      if(!row.acceptedDisplayContexts.some(c=>c.partOfSpeech===retired.partOfSpeech&&c.meaning===retired.meaningZh)){
        assert.equal(await resolver.load(row.term,{savedEntry:{term:row.term,partOfSpeech:retired.partOfSpeech,meaning:retired.meaningZh}}),null);
      }
    }
    assert.equal(JSON.stringify(table),before);assert(requests.length>=2);
  }finally{resolver.close();}
});
