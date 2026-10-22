// Trusted finite bundles only. Adding a bundle requires a genuinely new
// independent whole-source/pair opinion AND review of this authority update.
// No caller-supplied author/reviewer string can register a new authority.
import assert from 'node:assert/strict';
const deepFreeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;};
// A separate, independently reviewed runtime transport mapping. The long
// descriptor inside the immutable source candidate remains historical proof.
export const SEMANTIC_RUNTIME_SOURCE_KEY='semantic-editorial';
export const SEMANTIC_SOURCE_REVISION_ID='semantic-common-five-0001';
export const SEMANTIC_BASE_VERSION='5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432';
export const SEMANTIC_RUNTIME_SOURCE=deepFreeze({
 name:'卓式词典·释义校订',
 license:'项目原创中文释义；Princeton WordNet 3.1 为参考证据，适用其独立许可；原 ECDICT 数据保留 MIT 许可。',
 url:'https://zhuodashuai.github.io/vocab/dictionary-semantic-revisions.html'
});
export const SEMANTIC_BUNDLE_PROOF_PATHS=deepFreeze({
 'semantic-common-five-0001':{
  candidateText:'tooling/dictionary/source-revisions/semantic-common-five-0001.candidate.json',
  reviewText:'tooling/dictionary/source-revisions/semantic-common-five-0001.language-review.json',
  sourceManifestText:'tooling/dictionary/source-revisions/baseline-5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432.manifest.json',
  runtimeProposalText:'tooling/dictionary/source-revisions/semantic-common-five-0001.runtime-proposal.json',
  runtimeReviewText:'tooling/dictionary/source-revisions/semantic-common-five-0001.runtime-review.json',
  runtimeNoticeText:'tooling/dictionary/source-revisions/semantic-common-five-0001.notice-draft.html'
 }
});
// Caller resolves only these repo-relative file names; this module does no I/O.
export const SEMANTIC_REVISION_PROOF_FILES=deepFreeze(Object.fromEntries(
 Object.entries(SEMANTIC_BUNDLE_PROOF_PATHS[SEMANTIC_SOURCE_REVISION_ID])
  .map(([key,value])=>[key,value.slice('tooling/dictionary/source-revisions/'.length)])
));
const AUTHORITIES=deepFreeze({
 'semantic-common-five-0001':{
  id:'semantic-common-five-0001',candidateId:'future-semantic-common-five-0001-v2',candidateAuthor:'root',reviewer:'c',
  candidate:{bytes:24860,sha256:'802943b0dd8b8c34560e59bd14cbda07a0595bf58ed78e60a3a0a6a7530859a6'},
  review:{bytes:12849,sha256:'bb756de5fac506ca8db1fef2571aae343206bdd85e992cbf652ba980d97fdb86'},
  runtime:{author:'e',reviewer:'c',
   proposal:{bytes:4285,sha256:'e5213e9251b57909d8167bcb1041ac8a560600fef4b16857d2c90d92ea78b7f3'},
   review:{bytes:16466,sha256:'056fe3b41602c8642a0f92100ee577aab2396194d836b2124fcec8c542a243ec'},
   notice:{bytes:3466,sha256:'5e462671ef106480432eb09bd07ce869090d3d9cef9aac7f946cff73b4e5dd78'}},
  dictionary:{version:'5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432',manifestBytes:54705,manifestSha256:'da424df6edf245db2da69925a1c6e5e2d0936f3458709aa0ded1dde82983a82b',
   canonicalRecords:102609,englishKeyRows:140858,canonicalRecordsSha256:'bd89627f7f941c9bcf49995a24489ba0b4239beb376ee7ea4228c130f24104df',englishKeysSha256:'42c2154fe8dd1b8ab3caf2c2c1dc042a498fec784402d3ca83b37d3045d97923'},
  examplesVersion:'4506265fab099d7b70a59bb3667ab8276c083f14c66f4d149cacf73c5c7e8f92',
  allowedChangedFields:['meaning','source','variants'],historicalHolds:9,quarantinedTuples:4,retiredTuples:1,
  targets:[
   {term:'affordable',id:696511,beforeSha256:'2377ee764319279714c7c51853de8dc0e40b61dadbfea9587050af2c959e1819',afterSha256:'663fb65a43ad83128801778ed6806f57e13db80de42514b79a8e16024f6640e1',pairSha256:'0dabb458079236d524059866894c788f7da238251ace04cfc2c73ea7900db540'},
   {term:'discretionary',id:822339,beforeSha256:'4d7f996f7255552c5fb1b96c4c49af805c4e012fa71893388179aa32ae300a3c',afterSha256:'d44ae48e987d3d8c8592ad00b54bbc5441fb2a86916a90c83f8e29568983844d',pairSha256:'01f3b65c78e237ca2ab8d0c8e7b1e217be95b41e1c6980218d1064eb8cd2505e'},
   {term:'download',id:1224057,beforeSha256:'0262aed73b92af25881b672800ca3560c8671dc2881a39017e6fc1bd475b915e',afterSha256:'0d3c6d99cdef71e2329adc6b0559d754285b156f7d7ce6ef2668dc9e44fef2c3',pairSha256:'5ee491b257713b26fef4e2a7721ea7aefe1b2c93ea229be0ff3807d18cef99c3'},
   {term:'competitiveness',id:1238295,beforeSha256:'c48d735e5b29c3992e72501a175f6a81aa33499f320e30a7003df415669976f5',afterSha256:'8067d83968bdcfba98c555fc18f2d3064964b760c13a0121826747ce45e63bd2',pairSha256:'f9cbafa325e16ffd3777b358171dea5f165413290cf0905d8beffcbae4fc45ac'},
   {term:'revitalization',id:1322858,beforeSha256:'509826c5f4a91bbc117e0be6988f87ecb121787bedc20f05d0543a7fbda7d123',afterSha256:'84a28b7716bb7a3fa978c8e8f09f73a8bae7afebb618e16423748b8b92d7fe07',pairSha256:'b025c38f09ce03a27bc7b18e76f75bfe5521a4212831243329ad7f6bf0517143'}
  ],
  scope:'Pure future five-source contract only. C language opinion remains conditional, not implementation, materialized reentry, admission or publication approval.'
 }
});
export const SEMANTIC_AUTHORITY_IDS=Object.freeze(Object.keys(AUTHORITIES));
export function getSemanticAuthority(id){assert.equal(typeof id,'string','A registered finite bundle ID is required');assert(Object.hasOwn(AUTHORITIES,id),'Unknown/unreviewed semantic bundle');return AUTHORITIES[id];}
