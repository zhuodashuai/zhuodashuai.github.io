// Finite complete surfaces: two orthographic variants and one noun plural.
// Whole-term references; never a productive suffix or word-rewriting rule:
// https://dictionary.cambridge.org/dictionary/english/well-adjusted
// https://dictionary.cambridge.org/dictionary/english/rock-and-roll
// https://dictionary.cambridge.org/dictionary/english/side-effect
// These are not rules for joining spaces/hyphens or replacing words. Runtime
// authority still requires the complete authenticated original source below.
const VERSION = 'cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644';
const MANIFEST_SHA256 = '2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f';
const SOURCE_JSON = '{"name":"ECDICT","license":"MIT","url":"https://github.com/skywind3000/ECDICT"}';
const variants = Object.freeze([
  Object.freeze({
    surface: 'well adjusted', target: 'well-adjusted', id: 10522514,
    descriptorJSON: '{"bucket":18,"file":"cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644/en-018.json","sha256":"b88ff913245cabb26796dccf43c29b40fb5412ce25e002130b3b70ad9c5a5f20","bytes":362206,"count":1116}',
    recordJSON: '{"id":10522514,"term":"well-adjusted","partOfSpeech":"adjective","meaning":"a. （人）能很好地适应社会的","forms":[],"source":"mit","seed":{"rank":90905,"forms":[],"workbook":true}}',
  }),
  Object.freeze({
    surface: "rock 'n' roll", target: "rock'n'roll", id: 10140777,
    descriptorJSON: '{"bucket":105,"file":"cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644/en-105.json","sha256":"a7beeb4afc99aa0bcef8ad0063b869fd000d8e314e9f858964c8c681049cccc9","bytes":356985,"count":1104}',
    recordJSON: '{"id":10140777,"term":"rock\'n\'roll","partOfSpeech":"noun · adjective","meaning":"n. 摇滚音乐, 摇滚舞曲\\na. 摇滚乐的","forms":[],"source":"mit","seed":{"rank":86054,"forms":[],"workbook":true}}',
  }),
  Object.freeze({
    surface: "side effects",
    target: "side effect",
    id: 12574919,
    sourceJSON: "{\"name\":\"原有释义＋词性校订\",\"license\":\"Meanings retain their original licences; POS sources and review methods are listed in the notice\",\"url\":\"https://zhuodashuai.github.io/vocab/dictionary-pos.html\"}",
    descriptorJSON: "{\"bucket\":71,\"file\":\"cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644/en-071.json\",\"sha256\":\"c9bc2976b1f145fd373458f0cadf0badd741ae5289cb53005f062df9e5e567ec\",\"bytes\":354687,\"count\":1120}",
    recordJSON: "{\"id\":12574919,\"term\":\"side effect\",\"partOfSpeech\":\"noun\",\"meaning\":\"副作用\\n[计] 副作用\",\"forms\":[],\"source\":\"pos-reviewed\",\"seed\":{\"rank\":107223,\"forms\":[],\"workbook\":true},\"variants\":[{\"partOfSpeech\":\"\",\"meaning\":\"副作用\\n[计] 副作用\",\"source\":\"mit\"}]}",
  }),
]);

export function reviewedEnglishSurfaceTarget(surface) {
  return variants.find(row => row.surface === surface)?.target || null;
}

// Cheap prefilter only; it cannot grant recovery or source authority.
export function isReviewedEnglishSurfaceCandidate(id, term) {
  return variants.some(row => row.id === id && row.target === term);
}

// Strings only: the helper never evaluates a caller's record accessors. Only
// parseEnglish calls it after authenticating the manifest and complete shard;
// the engine keeps its resulting record brand in a private WeakMap.
export function authenticatedEnglishSurface(recordJSON, manifestVersion, manifestSha256, descriptorJSON, sourceJSON) {
  if (manifestVersion !== VERSION || manifestSha256 !== MANIFEST_SHA256) return null;
  return variants.find(row => row.recordJSON === recordJSON && row.descriptorJSON === descriptorJSON
    && sourceJSON === (row.sourceJSON ?? SOURCE_JSON))?.surface || null;
}
