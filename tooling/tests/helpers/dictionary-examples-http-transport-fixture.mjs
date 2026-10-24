// Historical D32 public artifacts, not the mutable current release. Later
// append-only catalogues must not invalidate this HTTP transport regression.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {dictionaryExampleBucket} from '../../../vocab/js/dictionary-examples.js';

export const repositoryRoot=fileURLToPath(new URL('../../../',import.meta.url));
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const D32_CATALOGUE={file:'catalogue-v4/d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f.bin',codec:'gzip',bytes:1660,sha256:'d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f',decodedBytes:4056,decodedSha256:'ace34696bc4c219181753da0b107bea2be86d93402c3efda107f6ff00f10664a'};
export const GEO_PAIR=['geo','noun','海湾','We watched the sea surge into the narrow geo beneath the cliffs.','我们看着海水涌入悬崖下狭长的海湾。'];

export async function httpTransportFixture(){
  const read=p=>readFile(new URL('../../../'+p,import.meta.url));
  const catalogueBytes=await read('vocab/data/dictionary-examples/'+D32_CATALOGUE.file);
  assert.equal(hash(catalogueBytes),D32_CATALOGUE.sha256);assert.equal(catalogueBytes.length,1660);
  const decoded=gunzipSync(catalogueBytes);assert.equal(decoded.length,D32_CATALOGUE.decodedBytes);assert.equal(hash(decoded),D32_CATALOGUE.decodedSha256);
  const catalogue=JSON.parse(decoded),release={catalogue:D32_CATALOGUE,base:catalogue.base,source:catalogue.source};
  const baseBytes=await read('vocab/data/dictionary-examples/'+release.base.file);assert.equal(baseBytes.length,release.base.bytes);assert.equal(hash(baseBytes),release.base.sha256);
  const base=JSON.parse(baseBytes),sourceBytes=await read('vocab/data/expanded-dictionary/manifest.json');assert.equal(hash(sourceBytes),release.source.manifestSha256);
  const source=JSON.parse(sourceBytes),delta=catalogue.deltas[catalogue.keys.find(([term])=>term==='geo')[1]];
  const deltaBytes=await read('vocab/data/dictionary-examples/'+delta.file);assert.equal(deltaBytes.length,delta.bytes);assert.equal(hash(deltaBytes),delta.sha256);
  const row=JSON.parse(gunzipSync(deltaBytes)).entries.find(r=>r.term==='geo'),sense=row.example.senses[0],pair=sense.examples[0];
  assert.deepEqual([row.term,sense.partOfSpeech,sense.meaningZh,pair.en,pair.zh],GEO_PAIR);
  const bucket=base.shards[dictionaryExampleBucket('geo')],bucketBytes=await read('vocab/data/dictionary-examples/'+bucket.file);assert.equal(hash(bucketBytes),bucket.sha256);
  const sourceBucket=source.english.shards[row.canonicalId%128],canonicalBytes=await read('vocab/data/expanded-dictionary/'+sourceBucket.file);assert.equal(hash(canonicalBytes),sourceBucket.sha256);
  const files=new Map([
    ['data/dictionary-examples/'+release.base.file,baseBytes],['data/dictionary-examples/'+bucket.file,bucketBytes],
    ['data/dictionary-examples/'+D32_CATALOGUE.file,catalogueBytes],['data/dictionary-examples/'+delta.file,deltaBytes],
    ['data/expanded-dictionary/manifest.json',sourceBytes],['data/expanded-dictionary/'+sourceBucket.file,canonicalBytes]
  ]);
  return {release,files,row,catalogueBytes,cataloguePath:'data/dictionary-examples/'+D32_CATALOGUE.file,deltaPath:'data/dictionary-examples/'+delta.file};
}

// A legal gzip filename adds five bytes to the 1683-byte stored outer gzip.
// The header exactly reproduces the observed 1688-wire/1660-Fetch-body tuple.
export function observedCatalogueWire(raw){
  assert.equal(raw.length,1660);const wire=gzipSync(raw,{level:0});assert.equal(wire.length,1683);assert.equal(wire[3],0);
  const header=Buffer.from(wire.subarray(0,10));header[3]=8;
  const result=Buffer.concat([header,Buffer.from([104,116,116,112,0]),wire.subarray(10)]);
  assert.equal(result.length,1688);assert.deepEqual(gunzipSync(result),raw);return result;
}
