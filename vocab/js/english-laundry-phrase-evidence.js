// This finite scope rejects a borrowed execution-sense form only for two
// independently reviewed laundry phrases. Literal whole matches run first.
import {SEARCH_EXPERIENCE_ENTRIES} from './search-experience-data.js?v=118';
const VERSION="cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644";
const MANIFEST_SHA256="2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f";
const RECORD_JSON="{\"id\":114521,\"term\":\"hang\",\"partOfSpeech\":\"noun · verb\",\"meaning\":\"n. 悬挂, 诀窍, 意义\\nvt. 悬挂, 附着, 装饰, 垂下, 踌躇, 绞死, 使悬而未决\\nvi. 悬着, 垂下, 被绞死, 悬而不决\",\"forms\":[\"hanged\",\"hanging\",\"hangs\",\"hung\"],\"source\":\"core\",\"variants\":[{\"partOfSpeech\":\"noun · verb\",\"meaning\":\"n. 悬挂, 诀窍, 意义\\nvt. 悬挂, 附着, 装饰, 垂下, 踌躇, 绞死, 使悬而未决\\nvi. 悬着, 垂下, 被绞死, 悬而不决\",\"source\":\"mit\"},{\"partOfSpeech\":\"verb\",\"meaning\":\"1. verb：悬挂；挂起，固定上端使其余部分垂下，也可指物体处于悬垂状态。此义过去式和过去分词通常为 hung。\\n2. verb：绞死；以绳索套住颈部使人死亡，尤其指处决。此义过去式和过去分词通常为 hanged。\",\"source\":\"original\"}],\"seed\":{\"rank\":894,\"forms\":[\"hanging\",\"hangs\",\"hung\"],\"workbook\":false}}";
const DESCRIPTOR_JSON="{\"bucket\":48,\"file\":\"cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644/en-048.json\",\"sha256\":\"747d6af97f12c526a37781416df6d841c6ca249fe8f87a59ea0bd07cd794831f\",\"bytes\":360761,\"count\":1115}";
const SOURCE_JSON="{\"name\":\"ECDICT · 已上线核心整理\",\"license\":\"MIT and project editorial additions\",\"url\":\"https://github.com/skywind3000/ECDICT\"}";
const TARGET_JSON="{\"term\":\"hang out the washing\",\"partOfSpeech\":\"verb phrase\",\"meaning\":\"① （英式常用）把洗好的衣物等挂到外面晾干。\",\"chineseAliases\":[\"晾衣服\",\"晾晒衣物\",\"把洗好的衣物晾出去\"],\"englishForms\":[\"hangs out the washing\",\"hung out the washing\",\"hanging out the washing\",\"hang the washing out\",\"hangs the washing out\",\"hung the washing out\",\"hanging the washing out\"],\"en\":\"Maya hung out the washing before settling down to revise for her exam.\",\"zh\":\"玛雅先把洗好的衣物晾到外面，然后坐下来复习考试内容。\",\"references\":[\"https://www.oxfordlearnersdictionaries.com/definition/english/hang-out_1\",\"https://www.oxfordlearnersdictionaries.com/definition/english/hang_1\",\"https://dictionary.cambridge.org/dictionary/english/washing\"],\"dictionarySource\":\"卓式词典·原创释义\",\"exampleSource\":\"原创学习例句\",\"exampleReviewer\":\"AI/chinese_life_common_terms_admission_reviewer\"}";

export function isLaundryHangSourceCandidate(id,term){return id===114521&&term==='hang';}
// Strings only; the engine calls this after complete manifest/shard integrity
// verification and retains the decision in a private record WeakMap.
export function authenticatedLaundryHangSource(recordJSON,version,manifestSha256,descriptorJSON,sourceJSON){
  return recordJSON===RECORD_JSON&&version===VERSION&&manifestSha256===MANIFEST_SHA256
    &&descriptorJSON===DESCRIPTOR_JSON&&sourceJSON===SOURCE_JSON;
}
export function rejectsLaundryPhraseRecovery(first,target){
  return first==='hanged'&&['hang out the washing','hang the washing out'].includes(target);
}
export function authenticatedLaundryPhraseTarget(){
  const row=SEARCH_EXPERIENCE_ENTRIES.find(row=>row.term==='hang out the washing');
  return JSON.stringify(row)===TARGET_JSON;
}
