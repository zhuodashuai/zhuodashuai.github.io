import { REVIEWED_SENSE_ENTRIES } from './reviewed-senses-data.js?v=118';

// One reviewed noun plural, not a suffix rule. A matching authored definition
// does not authenticate an origin: expanded-dictionary's private parser must
// bind the complete original record, shard and CURRENT manifest before use.
const VERSION = 'cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644';
const MANIFEST_SHA256 = '2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f';
const ID = 1333816;
const RECORD_SHA256 = '4d7af2f40b00097ef153ff1baf95ce9fb6807ea49575976f7a5241741707c2b7';
const RECORD_JSON = "{\"id\":1333816,\"term\":\"mortuary\",\"partOfSpeech\":\"noun · adjective\",\"meaning\":\"n. 停尸间, 太平间\\na. 丧葬的, 悲哀的, 埋葬的\",\"forms\":[\"mortuaries\"],\"source\":\"mit\",\"seed\":{\"rank\":10420,\"forms\":[\"mortuaries\"],\"workbook\":true}}";
// The same complete original row is authenticated in its canonical shard and
// the actual mortuaries form-index shard. Neither an arbitrary descriptor nor
// a similarly named head can brand the parsed record.
const DESCRIPTOR_JSONS = Object.freeze(["{\"bucket\":56,\"file\":\"cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644/en-056.json\",\"sha256\":\"2a67c4c85e580368a2d29f508048973b126f843117b9b97b75f4918aeaaa1994\",\"bytes\":356104,\"count\":1092}","{\"bucket\":76,\"file\":\"cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644/en-076.json\",\"sha256\":\"f2ff28233991d5939a24f14e79217dc714d1fe079489aeaa0043939f6e3e84f2\",\"bytes\":363784,\"count\":1150}"]);
const SOURCE_JSON = JSON.stringify({name:'ECDICT',license:'MIT',url:'https://github.com/skywind3000/ECDICT'});
const NOUN_MEANING = '①（名词，英式常用）停尸房；遗体在下葬、火化或检查前暂时安置的房间或建筑。\n②（名词，美式用法）殡仪馆；安置遗体、办理葬礼前准备等事务的场所。';
const LITERAL_MEANING = NOUN_MEANING+'\n③（形容词）与死亡、遗体处理或安葬有关的。';
const EXAMPLE_IDS = ['reviewed-source-correction:mortuary:1','reviewed-source-correction:mortuary:2'];
const equal = (left,right) => JSON.stringify(left) === JSON.stringify(right);

function activeProjection() {
  const row = REVIEWED_SENSE_ENTRIES.find(value => value.term === 'mortuary');
  if (!row || row.reviewedCanonicalSense !== true || row.canonicalId !== ID
    || row.canonicalSourceSha256 !== RECORD_SHA256 || row.partOfSpeech !== 'noun · adjective'
    || row.meaning !== LITERAL_MEANING || row.dictionarySource !== '卓式词典·义项补充'
    || !equal(row.chineseAliases,[]) || !equal(row.englishForms,[])
    || !Array.isArray(row.formProjections) || row.formProjections.length !== 1) return null;
  const projection = row.formProjections[0];
  if (!projection || Object.keys(projection).sort().join('|') !== 'exampleSenseIds|form|meaning|partOfSpeech'
    || projection.form !== 'mortuaries' || projection.partOfSpeech !== 'noun'
    || projection.meaning !== NOUN_MEANING || !equal(projection.exampleSenseIds,EXAMPLE_IDS)) return null;
  if (!row.exampleContexts?.some(context => context.partOfSpeech === 'noun'
    && context.meaning === NOUN_MEANING && equal(context.senseIds,EXAMPLE_IDS))) return null;
  if (!EXAMPLE_IDS.every(id => row.exampleSenses?.some(sense => sense.id === id && sense.partOfSpeech === 'noun'))) return null;
  return projection;
}

// Exact whole-query/potential-record prefilters; neither grants recovery.
export function reviewedCanonicalFormTarget(surface) {
  return surface === 'mortuaries' && activeProjection() ? 'mortuary' : null;
}
export function isReviewedCanonicalFormCandidate(id,term) {
  return id === ID && term === 'mortuary' && Boolean(activeProjection());
}

// Strings only, supplied exclusively after the engine authenticates a shard.
// The returned surface is stored against that parsed record in a private map.
export function authenticatedReviewedCanonicalForm(recordJSON,manifestVersion,manifestSha256,descriptorJSON,sourceJSON) {
  return activeProjection() && manifestVersion === VERSION && manifestSha256 === MANIFEST_SHA256
    && recordJSON === RECORD_JSON && DESCRIPTOR_JSONS.includes(descriptorJSON) && sourceJSON === SOURCE_JSON
    ? 'mortuaries' : null;
}

// Authored CONTENT only. This pure projection cannot prove that a lookup
// actually resolved the canonical record; that remains the private map's job.
export function reviewedCanonicalFormContent(surface) {
  const projection = surface === 'mortuaries' && activeProjection();
  return projection ? {term:'mortuary',partOfSpeech:projection.partOfSpeech,meaning:projection.meaning,
    source:'卓式词典·义项补充',license:'Original composition',url:'https://zhuodashuai.github.io/vocab/'} : null;
}
