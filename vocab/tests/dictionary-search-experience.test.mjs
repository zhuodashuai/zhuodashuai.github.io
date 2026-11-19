import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as reusable from '../js/dictionary-app.js';
import * as standalone from '../js/dictionary-app-v109.js';
import {suggestDictionaryTerms} from '../js/dictionary-suggestions.js';

const row = term => ({term,partOfSpeech:'adjective',meaning:'① 快乐的',source:'local source',license:'MIT',url:'https://example.com/lexicon',alternatives:[]});
const settle = () => new Promise(resolve => setImmediate(resolve));

for (const [name,module] of [['reusable',reusable],['standalone',standalone]]) {
  test(`${name} editing keeps an explicit old-card preview but removes every actionable result and page`,async () => {
    const original=[row('chuffed'),row('happy')],before=structuredClone(original);
    const controller=module.createDictionaryController({search:async()=>({results:original,hasMore:true,nextOffset:20}),suggest:async()=>[]});
    await controller.submit('开心');controller.select(1);
    controller.change('happ');
    const state=controller.getState();
    assert.equal(state.phase,'idle');assert.equal(state.input,'happ');
    assert.equal(state.previousResult.query,'开心');assert.deepEqual(state.previousResult.result,before[1]);
    assert.deepEqual(state.results,[]);assert.equal(state.canLoadMore,false);assert.equal(controller.select(0),false);
    assert.equal(await controller.loadMore(),false);assert.deepEqual(original,before);
    controller.change('happi');assert.deepEqual(controller.getState().previousResult,state.previousResult);
    controller.change('');assert.equal(controller.getState().previousResult,null);
  });

  test(`${name} a fresh submission or cancellation removes the preview and stale loaders cannot restore it`,async () => {
    let finish;let signal;
    const controller=module.createDictionaryController({suggest:async()=>[],search:async(input,options)=>{
      if(input==='slow'){signal=options.signal;return new Promise(resolve=>{finish=resolve;});}
      return{results:[row(input)],hasMore:false};
    }});
    await controller.submit('happy');controller.change('slow');
    assert.equal(controller.getState().previousResult.result.term,'happy');
    const pending=controller.submit('slow');assert.equal(controller.getState().previousResult,null);
    controller.change('calm');assert.equal(signal.aborted,true);
    finish({results:[row('stale')],hasMore:false});await pending;
    assert.deepEqual(controller.getState().results,[]);assert.equal(controller.getState().previousResult,null);
    await controller.submit('calm');controller.change('next');controller.cancel();
    assert.equal(controller.getState().previousResult,null);assert.equal(controller.getState().phase,'cancelled');
  });

  test(`${name} Chinese misses never start English spelling, while fullwidth Latin suggestions preserve raw input`,async () => {
    const calls=[];
    const controller=module.createDictionaryController({search:async()=>({results:[],hasMore:false}),suggest:async input=>{calls.push(input);return[row('happy')];}});
    for(const input of ['文献综述','开心','happy的意思']){
      await controller.submit(input);await settle();
      assert.equal(controller.getState().phase,'empty');assert.equal(controller.getState().suggestionPhase,'idle');
    }
    assert.deepEqual(calls,[]);
    await controller.submit('ＨＥＰＰＹ');await settle();
    assert.deepEqual(calls,['ＨＥＰＰＹ']);assert.equal(controller.getState().input,'ＨＥＰＰＹ');
    assert.deepEqual(controller.getState().results,[]);assert.equal(controller.getState().suggestions[0].term,'happy');
  });

  test(`${name} pasted typo formatting reaches actual spelling candidates without changing the raw query`,async()=>{
    const manifest=JSON.parse(await readFile(new URL('../data/expanded-dictionary/manifest.json',import.meta.url)));
    const calls=[],requests=[];
    const controller=module.createDictionaryController({search:async()=>({results:[],hasMore:false}),suggest:async(input,options)=>{
      calls.push(input);
      return suggestDictionaryTerms(input,{...options,dictionaryVersion:manifest.version,fetchImpl:async(url,request)=>{
        assert.equal(new URL(url).protocol,'file:');assert.equal(request.credentials,'omit');requests.push(String(url));
        return new Response(await readFile(url));
      }});
    }});
    for(const[input,target]of [['heppy!','happy'],['heppy?','happy'],['he\u200bppy','happy'],['“heppy”','happy'],['donʼtt',"don't"],['charging calbe?','charging cable']]){
      await controller.submit(input);
      // The suggestion sidecar is deliberately detached from the successful
      // miss; wait for its actual local, authenticated manifest/shard reads.
      for(let attempt=0;attempt<1000&&controller.getState().suggestionPhase==='loading';attempt++)await new Promise(resolve=>setTimeout(resolve,5));
      const state=controller.getState();
      assert.equal(state.phase,'empty',input);assert.equal(state.suggestionPhase,'ready',input);
      assert.equal(state.input,input);assert.deepEqual(state.results,[]);
      assert(state.suggestions.some(candidate=>candidate.term===target),`${name}: ${input} must offer ${target}`);
      assert.equal(calls.at(-1),input);
    }
    assert.equal(calls.length,6);assert(requests.length>0);
    assert(requests.every(url=>!/[?&](?:q|query|word|term)=/u.test(url)));
  });

  test(`${name} Chinese, unsafe, and too-short misses do not invoke the lazy suggestion loader`,async()=>{
    const calls=[];
    const controller=module.createDictionaryController({search:async()=>({results:[],hasMore:false}),suggest:async input=>{calls.push(input);throw Error('Must remain lazy');}});
    for(const input of ['文献综述','开心！','happy的意思','heppy\u0000','heppy\u000b','heppy\u202e','heppy\u2066','<script>heppy</script>','javascript:alert(1)','java\nscript:alert(1)','a','xx','a b','a'.repeat(65),'a'.repeat(201),'24/7']){
      await controller.submit(input);await settle();
      assert.equal(controller.getState().suggestionPhase,'idle',input);assert.deepEqual(controller.getState().suggestions,[],input);
    }
    assert.deepEqual(calls,[]);
  });

  test(`${name} fragment decoding preserves copied line layout while refusing every other control`,()=>{
    for(const input of ['accom-\nmodation','two\twords','two\r\nwords'])assert.equal(module.initialDictionaryQuery(`#q=${encodeURIComponent(input)}`),input);
    for(const input of ['accom-\u0000modation','heppy\u000b','heppy\u000c','heppy\u001f','heppy\u007f','heppy\u202e','heppy\u2066'])assert.equal(module.initialDictionaryQuery(`#q=${encodeURIComponent(input)}`),'');
  });

  test(`${name} phrase recovery offers literal components only and contextual mentions never borrow synonym previews`,()=>{
    assert.deepEqual(module.dictionaryPhraseComponents('literature review'),['literature','review']);
    assert.deepEqual(module.dictionaryPhraseComponents('get the hang of'),['get','hang']);
    for(const value of ['文献综述','one','<script>two words</script>','happy\u202e calm','two / words'])assert.deepEqual(module.dictionaryPhraseComponents(value),[],value);
    const mention={term:'phone charger',meaning:'① 手机充电器；解释中提到充电线。',matchedSense:'充电线',matchType:'mention'};
    const before=structuredClone(mention);
    assert.equal(module.dictionaryChoiceDescription(mention),mention.meaning);assert.deepEqual(mention,before);
    assert.equal(module.dictionaryChoiceDescription({...mention,matchType:'related'}),'充电线');
  });
}
