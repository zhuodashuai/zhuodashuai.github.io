import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {decodeGzipArtifact} from '../../vocab/js/dictionary-examples-additive-codec.js';
import {httpTransportFixture,observedCatalogueWire} from './helpers/dictionary-examples-http-transport-fixture.mjs';

const fixture=await httpTransportFixture();
async function readGeo({headers={'content-encoding':'gzip','content-length':'1688'},change=raw=>raw}={}){
  const requested=[];const client=createAdditiveExamplesLoader(fixture.release,{fetchImpl:async url=>{
    const key=String(url).split('/vocab/')[1];requested.push(key);assert(fixture.files.has(key),key);
    const raw=fixture.files.get(key),catalogue=key===fixture.cataloguePath;
    return new Response(catalogue?change(Buffer.from(raw)):raw,{status:200,headers:catalogue?headers:{'content-length':String(raw.length)}});
  }});
  try{return {row:await client.load('geo',{lookupQuery:'geo'}),requested};}finally{client.close();}
}
test('real D32 catalogue has the observed 1660 body / 1688 HTTP gzip wire tuple',()=>{
  assert.equal(fixture.catalogueBytes.length,1660);assert.equal(observedCatalogueWire(fixture.catalogueBytes).length,1688);
});
test('HTTP gzip Content-Length describes wire bytes; exact bounded Fetch artifact still loads',async()=>{
  const result=await readGeo();assert.deepEqual(result.row,fixture.row.example);assert(result.requested.includes(fixture.deltaPath));
});
test('without an HTTP encoding an oversized Content-Length remains rejected',async()=>{
  for(const encoding of [undefined,'identity'])await assert.rejects(readGeo({headers:{'content-length':'1688',...(encoding?{'content-encoding':encoding}:{})}}),{code:'invalid_dictionary_examples_additive'});
});
test('encoded HTTP headers must still contain a valid numeric Content-Length',async()=>{
  for(const length of ['invalid','-1','1.5','1688x'])await assert.rejects(readGeo({headers:{'content-encoding':'gzip','content-length':length}}),{code:'invalid_dictionary_examples_additive'});
});
test('missing length or a smaller encoded wire length does not replace actual body validation',async()=>{
  for(const headers of [{},{'content-encoding':'br','content-length':'1000'}])assert.deepEqual((await readGeo({headers})).row,fixture.row.example);
});
test('an encoded response whose delivered Fetch body exceeds the artifact cap is rejected',async()=>{
  await assert.rejects(readGeo({change:raw=>Buffer.concat([raw,Buffer.from(' ')])}),{code:'invalid_dictionary_examples_additive'});
});
test('an encoded response with a short body is rejected by exact artifact length',async()=>{
  await assert.rejects(readGeo({change:raw=>raw.subarray(0,-1)}),{code:'invalid_dictionary_examples_additive'});
});
test('same-length encoded artifact corruption remains rejected by SHA',async()=>{
  await assert.rejects(readGeo({change:raw=>{raw[15]^=1;return raw;}}),{code:'invalid_dictionary_examples_additive'});
});
test('inner artifact gzip decoded-byte and decoded-SHA limits are not relaxed',async()=>{
  await assert.rejects(decodeGzipArtifact(fixture.catalogueBytes,{...fixture.release.catalogue,decodedBytes:4055}),{code:'invalid_dictionary_examples_additive'});
  await assert.rejects(decodeGzipArtifact(fixture.catalogueBytes,{...fixture.release.catalogue,decodedSha256:'0'.repeat(64)}),{code:'invalid_dictionary_examples_additive'});
});
