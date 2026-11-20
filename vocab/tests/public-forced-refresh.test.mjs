import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function actualLoader(file){
  const source=(await readFile(new URL('../js/'+file,import.meta.url),'utf8')).replace(/\r\n/gu,'\n');
  const start=source.indexOf('function loadWordbook('),end=source.indexOf('\n\nrefs.filterRow.addEventListener',start);
  assert(start>0&&end>start);
  const calls=[],releases=[];
  const context=vm.createContext({Promise,Date:{now:()=>10_000},state:{snapshot:{}},MIN_REFRESH_GAP_MS:3_000,
    performLoad:options=>{calls.push({...options});return new Promise(resolve=>releases.push(resolve));}});
  const program='let loadTask=null,queuedForcedLoad=null,lastLoadStartedAt=0;\n'+source.slice(start,end)
    +'\n({run:loadWordbook,idle:()=>loadTask===null,queued:()=>queuedForcedLoad});';
  return {...vm.runInContext(program,context),calls,releases};
}
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));

for(const file of['public-app.js','public-app-v113.js']){
  test(file+' joins forced bursts into one follow-up and foreground retry wins',async()=>{
    const loader=await actualLoader(file),first=loader.run({background:true,force:true});
    for(let index=0;index<8;index++){
      assert.equal(loader.run({background:true,force:true}),first);
      assert.equal(loader.run({background:true}),first);
    }
    assert.equal(loader.run({force:true}),first);
    assert.equal(loader.run({background:true,force:true}),first);
    assert.equal(loader.calls.length,1);
    assert.equal(loader.queued().background,false);
    loader.releases.shift()();await nextTurn();
    assert.equal(loader.calls.length,2);assert.equal(loader.calls[1].background,false);
    assert.equal(loader.idle(),false);
    loader.releases.shift()();await first;
    assert.equal(loader.idle(),true);assert.equal(loader.queued(),null);assert.equal(loader.calls.length,2);
    await loader.run({background:true});assert.equal(loader.calls.length,2);
  });
  test(file+' unforced focus/poll calls never queue a trailing refresh',async()=>{
    const loader=await actualLoader(file),first=loader.run({background:true,force:true});
    for(let index=0;index<20;index++)assert.equal(loader.run({background:true}),first);
    assert.equal(loader.queued(),null);loader.releases.shift()();await first;
    assert.equal(loader.calls.length,1);assert.equal(loader.idle(),true);
  });
}
