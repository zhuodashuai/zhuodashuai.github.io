// Test-only historical metadata bridge; no product reads or writes on import.
// The original D31 metadata predicate still owns the historical validation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const D32_ATTRIBUTES_SUFFIX_LINES=Object.freeze([
 '# Gzip bodies use .bin so HTTP servers do not transparently decode the .gz',
 '# representation. Never apply text or line-ending conversion to these bytes.',
 'vocab/data/dictionary-examples/catalogue-v4/*.bin -text',
 'vocab/data/dictionary-examples/delta-v4/*.bin -text',
 'tooling/dictionary/examples/source/batch-0032-*.json text eol=lf',
 'tooling/dictionary/examples/reviews/batch-0032-*.json text eol=lf',
 'tooling/dictionary/examples/queues/batch-0032*.json text eol=lf',
 'tooling/dictionary/examples/additive-index-v4.json text eol=lf'
]);

// Whole D31 attributes, not arbitrary text prefixes. These are exactly the three
// D30-prefix/D31-rule transports accepted by the unchanged historical predicate.
// LF Git -> LF extension; observed mixed Windows prefix -> LF extension;
// ordinary all-CRLF Windows checkout -> CRLF extension. No cross-product waiver.
export const D31_PRIOR_ATTRIBUTES_TRANSPORTS=Object.freeze([
 Object.freeze({name:'Git-LF',bytes:2460,sha256:'b9c3bb6a8cdfcbee7307939b7e02d2948413fc808821ae2c845f19cb8456a9f8',suffixEol:'\n'}),
 Object.freeze({name:'observed-Windows-prefix-LF-D31-rules',bytes:2495,sha256:'650f540521706cc7bee9940fb94dae396dd1a90558114f9da1940c0577891a78',suffixEol:'\n'}),
 Object.freeze({name:'Windows-CRLF',bytes:2498,sha256:'b31de7f54c0558679603b96aec2a0235e46190c20241dacbf870a8d2da5bcd06',suffixEol:'\r\n'})
]);

export function restoreD31HistoricalAttributes(raw){
 assert(Buffer.isBuffer(raw),'Attributes must be raw bytes');
 for(const form of D31_PRIOR_ATTRIBUTES_TRANSPORTS){
  const suffix=Buffer.from(D32_ATTRIBUTES_SUFFIX_LINES.join(form.suffixEol)+form.suffixEol);
  if(raw.length!==form.bytes&&raw.length!==form.bytes+suffix.length)continue;
  const prior=raw.subarray(0,form.bytes);
  if(createHash('sha256').update(prior).digest('hex')!==form.sha256)continue;
  if(raw.length!==form.bytes&&!raw.subarray(form.bytes).equals(suffix))continue;
  return Buffer.from(prior);
 }
 assert.fail('Unknown D31 historical attributes or exact D32 suffix transport');
}
