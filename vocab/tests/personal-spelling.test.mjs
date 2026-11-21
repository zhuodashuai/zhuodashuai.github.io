import {restoreSearchRelease125ModuleIfCurrent} from '../../tooling/tests/helpers/search-release-125-modules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canSuggestPersonalDictionary,createPersonalSpellingSuggestions} from '../js/personal-spelling.js';
import {createPersonalSessionScope} from '../js/personal-storage.js';
import {suggestDictionaryTerms} from '../js/dictionary-suggestions.js';

const empty={results:[],hasMore:false,coverage:'full'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function harness(suggest){
  const changes=[];const sidecar=createPersonalSpellingSuggestions({suggest,onChange:(state,current)=>changes.push({state,current})});
  return {sidecar,changes};
}

test('only a complete first-page English miss is eligible; source failures and Chinese never download suggestions',async()=>{
  let calls=0;const {sidecar}=harness(()=>{calls++;return [];});
  for(const [input,result]of[
    ['开心',empty],['申请延期交作业',empty],['',empty],['a',empty],['heppy',{...empty,coverage:'basic'}],
    ['heppy',{...empty,coverage:'limited'}],['heppy',{...empty,coverage:'unknown'}],['heppy',{...empty,coverage:null}],
    ['heppy',{...empty,hasMore:true}],['heppy',{results:[]}],['heppy',{...empty,total:1}],['heppy',{...empty,offset:7}],
    ['happy',{...empty,results:[{term:'happy'}]}],['heppy',null],['javascript:heppy',empty],['heppy\u202e',empty]
  ]){assert.equal(canSuggestPersonalDictionary(input,result),false,String(input));assert.equal(sidecar.start(input,result,{isCurrent:()=>true}),false);}
  await tick();assert.equal(calls,0);
  assert.equal(canSuggestPersonalDictionary('heppy',empty),true);
  assert.equal(canSuggestPersonalDictionary('heppy',{results:[],hasMore:false}),true,'The existing complete English response omits coverage');
});

test('a suggestion read is optional and never awaited by the main lookup path',async()=>{
  const wait=deferred();let options;
  const {sidecar,changes}=harness((input,value)=>{assert.equal(input,'heppy');options=value;return wait.promise;});
  assert.equal(sidecar.start('heppy',empty,{isCurrent:()=>true}),true);
  assert.deepEqual(changes.at(-1).state,{phase:'loading',suggestions:[]});
  await tick();assert.equal(options.limit,5);assert.equal(options.timeoutMs,3000);assert.equal(options.signal.aborted,false);
  assert.equal(options.isCurrent(),true);
  wait.resolve([{term:'happy',meaning:'Must not become a definition'}]);await tick();
  assert.deepEqual(changes.at(-1).state,{phase:'ready',suggestions:[{term:'happy'}]});
  assert.equal(changes.at(-1).current(),true,'A completed candidate may be clicked while its original query/session remains current');
});

test('clearing before the lazy step prevents even an import callback from starting',async()=>{
  let calls=0;const {sidecar,changes}=harness(()=>{calls++;return [];});
  sidecar.start('heppy',empty,{isCurrent:()=>true});sidecar.clear();await tick();
  assert.equal(calls,0);assert.deepEqual(changes.at(-1).state,{phase:'idle',suggestions:[]});
});

test('input changes abort only the sidecar and an abort-ignoring late result cannot restore candidates',async()=>{
  const wait=deferred();let signal;const {sidecar,changes}=harness((input,options)=>{signal=options.signal;return wait.promise;});
  sidecar.start('heppy',empty,{isCurrent:()=>true});await tick();sidecar.clear();assert.equal(signal.aborted,true);
  const cleared=changes.length;wait.resolve([{term:'happy'}]);await tick();assert.equal(changes.length,cleared);
  assert.deepEqual(changes.at(-1).state,{phase:'idle',suggestions:[]});
});

test('a fresh query supersedes both ready and in-flight candidates, including repeated identical input',async()=>{
  const first=deferred(),second=deferred();let calls=0;
  const {sidecar,changes}=harness(()=>++calls===1?first.promise:second.promise);
  sidecar.start('heppy',empty,{isCurrent:()=>true});await tick();
  sidecar.start('heppy',empty,{isCurrent:()=>true});await tick();
  second.resolve([{term:'happy'}]);await tick();const ready=changes.length,current=changes.at(-1).current;
  first.resolve([{term:'hippy'}]);await tick();assert.equal(changes.length,ready);assert.equal(current(),true);
  sidecar.start('happy',{...empty,results:[{term:'happy'}]},{isCurrent:()=>true});
  assert.equal(current(),false);assert.deepEqual(changes.at(-1).state,{phase:'idle',suggestions:[]});
});

test('each real session, query or page authority boundary suppresses an abort-ignoring result',async()=>{
  const uid='a0f0c1d2-1111-4111-8111-111111111111';
  for(const change of['same-user-session','other-user','sequence','input','phase']){
    const scope=createPersonalSessionScope();scope.advance(uid);const token=scope.capture();
    let input='heppy',phase='ready',userId=uid,sequence=1;const wait=deferred();
    const {sidecar,changes}=harness(()=>wait.promise);
    const current=()=>scope.current(token)&&userId===uid&&sequence===1&&input==='heppy'&&phase==='ready';
    sidecar.start(input,empty,{isCurrent:current});await tick();
    if(change==='same-user-session')scope.advance(uid);
    if(change==='other-user')userId='b0f0c1d2-1111-4111-8111-111111111111';
    if(change==='sequence')sequence++;
    if(change==='input')input='happy';
    if(change==='phase')phase='locked';
    const before=changes.length;wait.resolve([{term:'happy'}]);await tick();assert.equal(changes.length,before,change);
  }
});

test('ready button authority expires on clear or account change and never becomes selection authority',async()=>{
  let authorised=true;const {sidecar,changes}=harness(async()=>[{term:'happy'}]);
  sidecar.start('heppy',empty,{isCurrent:()=>authorised});await tick();const current=changes.at(-1).current;
  assert.equal(current(),true);authorised=false;assert.equal(current(),false);authorised=true;sidecar.clear();assert.equal(current(),false);
});

test('current optional failures get a separate error state and cancelled failures remain silent',async()=>{
  const wait=deferred(),{sidecar,changes}=harness(()=>wait.promise);
  sidecar.start('heppy',empty,{isCurrent:()=>true});await tick();wait.reject(Error('Optional transport unavailable'));await tick();
  assert.deepEqual(changes.at(-1).state,{phase:'error',suggestions:[]});
  const late=deferred(),next=harness(()=>late.promise);next.sidecar.start('heppy',empty,{isCurrent:()=>true});await tick();next.sidecar.clear();
  const count=next.changes.length;late.reject(Error('Cancelled late import'));await tick();assert.equal(next.changes.length,count);
});

test('only bounded explicit candidate terms reach the UI, without meanings or duplicate/control strings',async()=>{
  const {sidecar,changes}=harness(async()=>[null,{}, {term:''},{term:'ha\u0000ppy'},{term:'happy',meaning:'Do not reuse'},
    {term:'happy'},{term:'hippy'},{term:'hoppy'},{term:'help'},{term:'heap'},{term:'heaps'}]);
  sidecar.start('heppy',empty,{isCurrent:()=>true});await tick();
  assert.deepEqual(changes.at(-1).state,{phase:'ready',suggestions:[{term:'happy'},{term:'hippy'},{term:'hoppy'},{term:'help'},{term:'heap'}]});
});

test('an empty catalogue response produces no invented candidate',async()=>{
  const {sidecar,changes}=harness(async()=>[]);sidecar.start('heppy',empty,{isCurrent:()=>true});await tick();
  assert.deepEqual(changes.at(-1).state,{phase:'ready',suggestions:[]});
});

test('the actual authenticated shipped catalogue suggests happy for heppy, using public static assets only',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../data/expanded-dictionary/manifest.json',import.meta.url)));
  const requests=[];
  const candidates=await suggestDictionaryTerms('heppy',{dictionaryVersion:manifest.version,fetchImpl:async(url,options)=>{
    const parsed=new URL(url);assert.equal(parsed.protocol,'file:');assert(parsed.pathname.includes('/data/dictionary-suggestions/'));
    assert.equal(options.credentials,'omit');assert.equal(parsed.search,'');requests.push(parsed.pathname);return new Response(await readFile(parsed));
  }});
  assert(candidates.some(candidate=>candidate.term==='happy'));assert(requests.length>0);assert(candidates.length<=5);
});

test('personal app copies keep their sole existing examples import difference and the optional reader stays lazy',async()=>{
  const app=restoreSearchRelease125ModuleIfCurrent('js/personal-app-v108.js',await readFile(new URL('../js/personal-app-v108.js',import.meta.url),'utf8')),bare=restoreSearchRelease125ModuleIfCurrent('js/personal-app.js',await readFile(new URL('../js/personal-app.js',import.meta.url),'utf8'));
  assert.equal(app.replace('"./dictionary-examples-ui-v108.js?v=118"','"./dictionary-examples-ui.js?v=96"'),bare);
  assert.match(app,/await import\("\.\/dictionary-suggestions\.js\?v=118"\)/u);
  assert(!/^import[^\n]*dictionary-suggestions/mu.test(app));
  assert.match(app,/button\.setAttribute\("aria-label", `查询 \$\{candidate\.term\}`\)/u);
});
