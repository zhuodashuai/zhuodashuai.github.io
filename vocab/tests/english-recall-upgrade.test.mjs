import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {searchExpandedDictionary} from '../js/expanded-dictionary.js';
import {suggestDictionaryTerms,normalizeSuggestionQuery} from '../js/dictionary-suggestions.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const fold = value => value.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/[“”]/gu,'"').replace(/\s+/gu,' ').trim().toLowerCase();
const bucket = value => {let n=2166136261;for(const c of fold(value)){n^=c.codePointAt(0);n=Math.imul(n,16777619)>>>0;}return n%128;};
function fixture(entries) {
  const version=sha(JSON.stringify(entries)),files=new Map(),requests=[];
  const en=Array.from({length:128},(_,i)=>({schemaVersion:2,kind:'en',bucket:i,records:[],keys:[]}));
  const zh=Array.from({length:128},(_,i)=>({schemaVersion:2,kind:'zh',bucket:i,postings:[]}));
  entries.forEach((entry,i)=>{
    const row={id:i*128+bucket(entry.term),term:entry.term,partOfSpeech:entry.pos||'noun',meaning:entry.meaning||'测试词义',forms:entry.forms||[],source:'mit'};
    for(const [key,kind]of [[entry.term,'canonical'],...row.forms.map(form=>[form,'form'])]){
      const page=en[bucket(key)];if(!page.records.some(r=>r.id===row.id))page.records.push(row);
      const old=page.keys.find(item=>item[0]===fold(key));
      if(old)old[1].push({id:row.id,kind});else page.keys.push([fold(key),[{id:row.id,kind}]]);
    }
  });
  const descriptors=(rows,kind)=>rows.map((payload,i)=>{const body=JSON.stringify(payload),file=`${version}/${kind}-${String(i).padStart(3,'0')}.json`;files.set(file,body);return{bucket:i,file,sha256:sha(body),bytes:Buffer.byteLength(body),count:kind==='en'?payload.keys.length:0};});
  const english={buckets:128,shards:descriptors(en,'en')},chinese={buckets:128,shards:descriptors(zh,'zh')};
  const manifest={schemaVersion:2,version,counts:{records:entries.length,englishKeys:english.shards.reduce((n,d)=>n+d.count,0),chineseTokens:0},sources:{mit:{name:'ECDICT',license:'MIT',url:'https://github.com/skywind3000/ECDICT'}},english,chinese};
  const fetchImpl=async(url,options)=>{requests.push({url:String(url),options});const file=new URL(url).pathname.split('/expanded-dictionary/')[1];return new Response(file==='manifest.json'?JSON.stringify(manifest):files.get(file)||'missing',{status:file==='manifest.json'||files.has(file)?200:404});};
  return{fetchImpl,requests,manifest,files};
}
const local = () => {const requests=[];return{requests,fetchImpl:async(url,options)=>{assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');requests.push(String(url));return new Response(await readFile(url));}};};
const lexicalFields=['term','partOfSpeech','meaning','source','license','url','alternatives'];
const lexical=row=>Object.fromEntries(lexicalFields.map(key=>[key,row[key]]));

test('actual copied typography and layout recover the unchanged exact card, including closed packaged senses',async()=>{
  const data=local();
  for(const[input,target]of [['self‑esteem','self-esteem'],['mother‐in‐law','mother-in-law'],['donʼt',"don't"],['can‛t',"can't"],['U.S.,','U.S.'],['“e.g.”。','e.g.'],['ha\u200bppy','happy'],['accommo\u00addation','accommodation'],['accom-\nmodation','accommodation'],['mother-in- law','mother-in-law'],['state-\nof-the-art','state-of-the-art'],['out-of-pocket\nexpense','out-of-pocket expense'],['toilet pa\u200bper','toilet paper']]){
    const expected=await searchExpandedDictionary(target,data);assert.equal(expected.results.length,1,target);
    assert.deepEqual((await searchExpandedDictionary(input,data)).results,expected.results,input);
  }
  assert(data.requests.every(url=>!/[?&](?:q|query|word)=/u.test(url)));
});

test('genuine literal Unicode, lexical punctuation and proper-case collisions retain priority',async()=>{
  const data=fixture([{term:'alpha-beta'},{term:'alpha‑beta'},{term:'alpha\u200bbeta'},{term:'alphabeta'},{term:'e.g.'},{term:'e.g.,'},{term:"O'Reilly"},{term:"o'reilly"},{term:'C++'},{term:'24/7'}]);
  for(const term of ['alpha‑beta','alpha\u200bbeta','e.g.,','C++'])assert.equal((await searchExpandedDictionary(term,data)).results[0].term,term);
  assert.equal((await searchExpandedDictionary('OʼReilly',data)).results[0].term,"O'Reilly");
  assert.equal((await searchExpandedDictionary('oʼreilly',data)).results[0].term,"o'reilly");
  await assert.rejects(searchExpandedDictionary('OʼREILLY',data),error=>error.code==='ambiguous_dictionary_match');
});

test('wrapped-word recovery checks both complete spellings and rejects real ambiguity or arbitrary joins',async()=>{
  const data=fixture([{term:'re-creation',meaning:'重新创作'},{term:'recreation',meaning:'娱乐'},{term:'alphabeta'},{term:'accommodation',forms:['accommodations']}]);
  await assert.rejects(searchExpandedDictionary('re- creation',data),error=>error.code==='ambiguous_dictionary_match');
  assert.deepEqual((await searchExpandedDictionary('alpha beta',data)).results,[]);
  assert.deepEqual((await searchExpandedDictionary('accom-\nmodations',data)).results,(await searchExpandedDictionary('accommodations',data)).results);
});

test('real inflected phrases resolve the whole source phrase and preserve source fields',async()=>{
  const data=local();
  for(const[input,target]of [['got away with','get away with'],['followed up','follow up']]){
    const expected=(await searchExpandedDictionary(target,data)).results[0],actual=(await searchExpandedDictionary(input,data)).results[0];
    assert.equal(actual.term,target);assert.equal(actual.matchedForm,input);assert.deepEqual(lexical(actual),lexical(expected));
  }
});

test('phrase recovery requires real verb forms and a full verb head, preserves literals and rejects multiple heads',async()=>{
  const data=fixture([{term:'take',pos:'verb',forms:['taken']},{term:'take aback',pos:'verb'},{term:'taken aback',pos:'adjective'},
    {term:'fly',pos:'noun',forms:['flies']},{term:'fly around',pos:'verb'},
    {term:'write',pos:'verb',forms:['wrote']},{term:'write down',pos:'noun'},
    {term:'ax',pos:'verb',forms:['axes']},{term:'axe',pos:'verb',forms:['axes']},{term:'ax down',pos:'verb'},{term:'axe down',pos:'verb'}]);
  assert.equal((await searchExpandedDictionary('taken aback',data)).results[0].term,'taken aback');
  assert.deepEqual((await searchExpandedDictionary('flies around',data)).results,[]);
  assert.deepEqual((await searchExpandedDictionary('wrote down',data)).results,[]);
  await assert.rejects(searchExpandedDictionary('axes down',data),error=>error.code==='ambiguous_dictionary_match');
});

test('a derived form cannot authorize a newly selected closed packaged meaning',async()=>{
  const data=fixture([{term:'bargain',pos:'verb',forms:['bargaint']}]);
  await assert.rejects(searchExpandedDictionary('bargaint for',data),error=>error.code==='unreviewed_dictionary_form');
});

test('literal and form-source failures are never hidden by recovery, and ordinary cold lookup stays two reads',async()=>{
  const data=fixture([{term:'abacus'},{term:'follow',pos:'verb',forms:['followed']},{term:'follow up',pos:'verb'}]);
  assert.equal((await searchExpandedDictionary('abacus',data)).results[0].term,'abacus');assert.equal(data.requests.length,2);
  const broken=fixture([{term:'follow',pos:'verb',forms:['followed']},{term:'follow up',pos:'verb'}]);
  const descriptor=broken.manifest.english.shards[bucket('followed')];broken.files.set(descriptor.file,broken.files.get(descriptor.file)+' ');
  await assert.rejects(searchExpandedDictionary('followed up',broken),error=>error.code==='invalid_dictionary_data');
  const offline={fetchImpl:async(url,options)=>String(url).endsWith('/manifest.json')?data.fetchImpl(url,options):new Response('offline',{status:503})};
  await assert.rejects(searchExpandedDictionary('self‑esteem',offline),error=>error.code==='dictionary_network');
  for(const input of ['happy\u0000','happy\u202e','java\nscript:alert(1)','<script>\nhappy'])await assert.rejects(searchExpandedDictionary(input,{fetchImpl:()=>{throw Error('Unsafe input reached transport');}}));
});

test('spelling hints include actual packaged phrase heads without extra resources or duplicate choices',async()=>{
  const data=local(),manifest=JSON.parse(await readFile(new URL('../data/expanded-dictionary/manifest.json',import.meta.url)));
  const choices=await suggestDictionaryTerms('charging calbe',{...data,dictionaryVersion:manifest.version});
  assert(choices.some(row=>row.term==='charging cable'));assert.equal(new Set(choices.map(row=>row.term)).size,choices.length);assert(choices.length<=5);
  const actual=await searchExpandedDictionary('charging cable',data);assert.equal(actual.results[0].term,'charging cable');
  const reads=data.requests.length;await suggestDictionaryTerms('charging calbe',{...data,dictionaryVersion:manifest.version});assert.equal(data.requests.length,reads);
  assert(data.requests.filter(url=>url.includes('/dictionary-suggestions/')).every(url=>url.endsWith('/manifest.json')||/\/length-\d{2}\.json$/u.test(url)));
  for(const[input,normalized]of [['he\u200bppy','heppy'],['look afetr','look afetr'],['donʼt',"don't"],['self‑esteem','self-esteem']])assert.equal(normalizeSuggestionQuery(input),normalized);
  assert.deepEqual(await suggestDictionaryTerms('charging cable',{...data,dictionaryVersion:manifest.version}),[]);
});
