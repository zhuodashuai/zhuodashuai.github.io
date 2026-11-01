import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {searchExpandedDictionary} from '../js/expanded-dictionary.js';

const sha=x=>createHash('sha256').update(x).digest('hex');
const fold=x=>x.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/[“”]/gu,'"').replace(/\s+/gu,' ').trim().toLowerCase();
const bucket=value=>{let hash=2166136261;for(const c of value){hash^=c.codePointAt(0);hash=Math.imul(hash,16777619)>>>0;}return hash%128;};
function fixture(terms){
 const version=sha(JSON.stringify(terms)),en=Array.from({length:128},(_,i)=>({schemaVersion:2,kind:'en',bucket:i,records:[],keys:[]}));
 const zh=Array.from({length:128},(_,i)=>({schemaVersion:2,kind:'zh',bucket:i,postings:[]}));
 terms.forEach((term,i)=>{const key=fold(term),b=bucket(key),id=i*128+b,row={id,term,partOfSpeech:'noun',meaning:'测试释义'+i,forms:[],source:'mit'};
  en[b].records.push(row);const item=en[b].keys.find(x=>x[0]===key);if(item)item[1].push({id,kind:'canonical'});else en[b].keys.push([key,[{id,kind:'canonical'}]]);
 });
 const files=new Map();const descriptors=(rows,kind)=>rows.map((payload,i)=>{const body=JSON.stringify(payload),file=`${version}/${kind}-${String(i).padStart(3,'0')}.json`;files.set(file,body);return{bucket:i,file,sha256:sha(body),bytes:Buffer.byteLength(body),count:kind==='en'?payload.keys.length:0};});
 const english={buckets:128,shards:descriptors(en,'en')},chinese={buckets:128,shards:descriptors(zh,'zh')};
 const manifest={schemaVersion:2,version,counts:{records:terms.length,englishKeys:english.shards.reduce((n,x)=>n+x.count,0),chineseTokens:0},sources:{mit:{name:'ECDICT',license:'MIT',url:'https://github.com/skywind3000/ECDICT'}},english,chinese};
 const requests=[];const fetchImpl=async(url,options)=>{requests.push({url:String(url),options});const file=new URL(url).pathname.split('/expanded-dictionary/')[1];return new Response(file==='manifest.json'?JSON.stringify(manifest):files.get(file)||'missing',{status:file==='manifest.json'||files.has(file)?200:404});};
 return{fetchImpl,requests,manifest,files};
}
const local=()=>{const requests=[];return{requests,fetchImpl:async(url,options)=>{assert.equal(new URL(url).protocol,'file:');requests.push({url:String(url),options});return new Response(await readFile(fileURLToPath(url)));}};};

test('actual English abbreviation heads retain their lexical period inside pasted sentence decoration',async()=>{
 const data=local();for(const term of ['U.S.','e.g.']){const exact=await searchExpandedDictionary(term,data);assert.equal(exact.results[0].term,term);
  for(const query of [term+',',term+'，','"'+term+'",','“'+term+'”。'])assert.deepEqual((await searchExpandedDictionary(query,data)).results,exact.results,query);
 }
 assert(data.requests.every(x=>x.options.credentials==='omit'&&!/q=|query=|\/api\//u.test(x.url)));
});
test('actual Unicode hyphen and modifier-apostrophe copies find the unchanged ASCII canonical cards',async()=>{
 const data=local();const pairs=[['self‐esteem','self-esteem'],['self‑esteem','self-esteem'],['mother‐in‐law','mother-in-law'],['mother‑in‑law','mother-in-law'],['long‑term','long-term'],["donʼt","don't"],["canʼt","can't"],["can‛t","can't"],['out‑of‑pocket expense','out-of-pocket expense']];
 for(const[query,term]of pairs){const exact=await searchExpandedDictionary(term,data);assert.equal(exact.results.length,1,term);assert.deepEqual((await searchExpandedDictionary(query,data)).results,exact.results,query);}
});
test('genuine Unicode and decorated literal heads win before any typography fallback',async()=>{
 const data=fixture(['self-esteem','self‑esteem','e.g.','e.g.,','Blue-bird','Blue‑bird','out‑of‑pocket expense']);
 for(const term of ['self‑esteem','e.g.,','Blue‑bird','out‑of‑pocket expense']){const result=await searchExpandedDictionary(term,data);assert.equal(result.results[0].term,term);}
});
test('normalized punctuation and typography preserve proper-name case and reject unresolved collisions',async()=>{
 const data=fixture(["O'Reilly","o'reilly",'M.D.','m.d.']);
 assert.equal((await searchExpandedDictionary('OʼReilly',data)).results[0].term,"O'Reilly");
 assert.equal((await searchExpandedDictionary('oʼreilly',data)).results[0].term,"o'reilly");
 assert.equal((await searchExpandedDictionary('M.D.,',data)).results[0].term,'M.D.');
 assert.equal((await searchExpandedDictionary('m.d.,',data)).results[0].term,'m.d.');
 await assert.rejects(searchExpandedDictionary('OʼREILLY',data),e=>e.code==='ambiguous_dictionary_match');
});
test('ordinary literal cold lookup still reads only its manifest and one authenticated shard',async()=>{
 const data=fixture(['ordinary']);assert.equal((await searchExpandedDictionary('ordinary',data)).results[0].term,'ordinary');assert.equal(data.requests.length,2);
});
test('normalization preserves lexical punctuation and existing dash fallback without guessing missing English words',async()=>{
 const data=fixture(['self-esteem','C++','24/7',"don't",'e.g.']);
 for(const term of ['C++','24/7',"don't",'e.g.'])assert.equal((await searchExpandedDictionary(term,data)).results[0].term,term);
 for(const query of ['self—esteem','self–esteem'])assert.equal((await searchExpandedDictionary(query,data)).results[0].term,'self-esteem');
 for(const query of ['self−esteem','heppy','missing_sense'])assert.deepEqual((await searchExpandedDictionary(query,data)).results,[],query);
});
test('failed literal transport is not hidden by a healthy typography-fallback shard',async()=>{
 const data=fixture(['self-esteem']);const fetchImpl=async(url,options)=>String(url).endsWith('/manifest.json')?data.fetchImpl(url,options):new Response('offline',{status:503});
 for(const query of ['self‑esteem','out‑of‑pocket expense'])await assert.rejects(searchExpandedDictionary(query,{fetchImpl}),e=>e.code==='dictionary_network');
});
test('literal integrity failure cannot be bypassed by punctuation or Unicode fallback',async()=>{
 const data=fixture(['e.g.','self-esteem']);const fetchImpl=async(url,options)=>{const response=await data.fetchImpl(url,options);return String(url).endsWith('/manifest.json')?response:new Response((await response.text())+' ');};
 for(const query of ['e.g.,','self‑esteem','out‑of‑pocket expense'])await assert.rejects(searchExpandedDictionary(query,{fetchImpl}),e=>e.code==='invalid_dictionary_data');
});
test('invalid and non-English-only input rejects before reading any index',async()=>{
 const fetchImpl=()=>{throw Error('Input validation reached transport');};
 for(const query of ['<script>','javascript:alert(1)','happy\u202e','\u0000happy','12345','---'])await assert.rejects(searchExpandedDictionary(query,{fetchImpl}));
});
