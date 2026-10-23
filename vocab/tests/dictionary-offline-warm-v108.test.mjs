import test from 'node:test';
import assert from 'node:assert/strict';
import {dictionaryOfflineWarmUrl as current,installDictionaryOfflineWarm} from '../js/dictionary-offline-warm-v108.js';
import {dictionaryOfflineWarmUrl as legacy} from '../js/dictionary-offline-warm.js';
const base='https://wordbook.test/vocab/',hash='a'.repeat(64),url=(kind='catalogue-v4',h=hash)=>base+'data/dictionary-examples/'+kind+'/'+h+'.bin';

test('v108 warmer permits only the two exact same-origin immutable binary shapes',()=>{
 for(const kind of['catalogue-v4','delta-v4'])for(const h of[hash,'0123456789abcdef'.repeat(4)]){
  const value=url(kind,h);assert.equal(current(value,base),value);assert.equal(legacy(value,base),null);
 }
 for(const root of['https://worker.test/','http://127.0.0.1:4187/']){
  const value=root+'data/dictionary-examples/delta-v4/'+hash+'.bin';assert.equal(current(value,root),value);
 }
});

test('v108 warmer rejects cross-origin, private, query, encoded, traversal and noncanonical binary URLs',()=>{
 const value=url(),bad=[null,undefined,{},'',value+'?',value+'#',value+'?q=secret',value+'#secret',' '+value,value+'\n',
  value.replace('wordbook.test','other.test'),value.replace('https://','https://u:p@'),value.replace('https://','http://'),
  value.replace('/vocab/','/private/'),value.replace('/vocab/','/vocab-private/'),
  value.replace('catalogue-v4','audit-v4'),value.replace('catalogue-v4','catalogue-v3'),value.replace('.bin','.gz'),value.replace('.bin','.json'),
  url('catalogue-v4',hash.slice(1)),url('delta-v4',hash+'a'),url('delta-v4',hash.toUpperCase()),url('delta-v4','g'.repeat(64)),
  value.replace('/catalogue-v4/','/catalogue-v4/../catalogue-v4/'),value.replace('/catalogue-v4/','/%63atalogue-v4/'),
  value.replace('/catalogue-v4/','%2fcatalogue-v4/'),value.replace('/catalogue-v4/','\\catalogue-v4/'),
  value.replace('.bin','%2ebin'),base+'api/v1/member/'+hash+'.bin',base+'data/dictionary-examples/catalogue-v4/'+hash+'/a.bin'];
 for(const x of bad)assert.equal(current(x,base),null,String(x));
 for(const b of['file:///vocab/',base+'?q=x',base+'#x',base.slice(0,-1),'https://u:p@wordbook.test/vocab/'])assert.equal(current(value,b),null,b);
});

test('v108 preserves every legacy permitted URL shape and range',()=>{
 const values=[base+'data/expanded-dictionary/manifest.json',base+'data/dictionary-examples/manifest-v2.json'];
 for(const n of[0,1,127,128,255,256,999]){
  values.push(base+'data/expanded-dictionary/'+hash+'/en-'+String(n).padStart(3,'0')+'.json');
  values.push(base+'data/expanded-dictionary/'+hash+'/zh-'+String(n).padStart(3,'0')+'.json');
  values.push(base+'data/dictionary-examples/'+hash+'/examples-'+n+'.json');
 }
 for(const value of values)assert.equal(current(value,base),legacy(value,base),value);
});

test('v108 replays only actually observed v4 reads after claim, credential-free and with no catalogue prefetch',async()=>{
 const sw=new EventTarget(),lifecycle=new EventTarget(),requests=[],bodies=[],timers=new Map();let serial=0;sw.controller=null;
 const entry=name=>({name,entryType:'resource',initiatorType:'fetch',startTime:10,responseEnd:20});
 const entries=[entry(url()),entry(url('delta-v4')),entry(url().replace('wordbook.test','elsewhere.test')),entry(base+'api/v1/member/cards')];
 const stop=installDictionaryOfflineWarm({baseUrl:base,serviceWorker:sw,lifecycle,performance:{now:()=>100,getEntriesByType:()=>entries},Observer:null,
  fetchImpl:async(value,options)=>{requests.push({value,options});return{ok:true,arrayBuffer:async()=>{bodies.push(value);return new ArrayBuffer(0);}};},
  setTimeoutImpl:(callback,delay)=>{const id=++serial;timers.set(id,{callback,delay});return id;},clearTimeoutImpl:id=>timers.delete(id)});
 assert.equal(requests.length,0);sw.controller={};sw.dispatchEvent(new Event('controllerchange'));
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requests.map(x=>x.value),[url(),url('delta-v4')]);assert.deepEqual(bodies,[url(),url('delta-v4')]);
 for(const{options}of requests)assert.deepEqual({...options,signal:undefined},{method:'GET',credentials:'omit',cache:'reload',redirect:'error',mode:'same-origin',signal:undefined});
 stop();stop();assert.equal(timers.size,0);
});
