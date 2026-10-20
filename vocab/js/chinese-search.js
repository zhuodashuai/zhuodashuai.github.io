import { COMMON_CHINESE_GROUPS } from "./chinese-related-common.js?v=94";

// These are small, editorially selected reverse-lookup concepts, not claims
// that every English result is interchangeable. Never expand part of a query,
// derive an antonym by deleting a negation, or follow a second synonym hop.
// Batch 003 uses a short reviewed lexical set for each concept. Every result
// must still have an independent matching source atom; the shortlist is neither
// a generated translation nor permission to treat these words as interchangeable.
const CURATED_BATCH_003 = Object.freeze([
  { terms: ["勤奋", "勤劳", "勤勉"], heads: ["diligent", "industrious", "assiduous", "diligence"] },
  { terms: ["懒惰", "懒散", "怠惰"], heads: ["lazy", "idle", "indolent", "slothful"] },
  { terms: ["富裕", "富有", "富足"], heads: ["rich", "wealthy", "affluent", "well-to-do"] },
  { terms: ["贫穷", "贫困", "穷困"], heads: ["poor", "poverty", "needy", "destitute"] },
  { terms: ["谦虚", "谦逊"], heads: ["modest", "humble", "unassuming", "humility"] },
  { terms: ["傲慢", "高傲", "倨傲"], heads: ["arrogant", "haughty", "imperious", "hubris"] },
  { terms: ["友好", "友善", "亲善"], heads: ["friendly", "amicable", "affable", "goodwill"] },
  { terms: ["残忍", "残酷", "凶残"], heads: ["cruel", "brutal", "ruthless", "merciless"] },
  { terms: ["冷静", "镇定", "沉着"], heads: ["calm", "cool", "composed", "composure"] },
  { terms: ["孤独", "孤单", "寂寞"], heads: ["lonely", "lonesome", "solitary", "loneliness"] },
  { terms: ["宽阔", "宽广", "广阔"], heads: ["wide", "broad", "spacious", "expansive"] },
  { terms: ["吵闹", "喧闹", "喧嚣"], heads: ["noisy", "rowdy", "boisterous", "clamorous", "racket"] },
  { terms: ["必要", "必需"], heads: ["necessary", "essential", "requisite", "necessity"] },
  { terms: ["等待", "等候"], heads: ["wait", "await", "waiting"] },
  { terms: ["到达", "抵达"], heads: ["arrive", "reach", "arrival"] },
  { terms: ["选择", "挑选", "选取"], heads: ["choose", "select", "pick", "choice", "selection"] },
  { terms: ["创建", "建立", "创立"], heads: ["establish", "found", "institute", "set up"] },
  { terms: ["保护", "防护", "保卫"], heads: ["protect", "defend", "guard", "protection"] },
  { terms: ["阻止", "阻拦", "制止"], heads: ["prevent", "stop", "restrain", "deter"] },
  { terms: ["改善", "改进", "改良"], heads: ["improve", "amend", "ameliorate", "improvement"] },
  { terms: ["解释", "说明", "阐释"], heads: ["explain", "interpret", "explanation"] },
  { terms: ["隐藏", "隐蔽", "藏匿"], heads: ["hide", "conceal", "harbour", "covert"] },
  { terms: ["称赞", "赞扬", "赞美"], heads: ["praise", "compliment", "applaud", "laud"] },
  { terms: ["责备", "责怪", "指责"], heads: ["blame", "reproach", "rebuke", "censure"] },
  { terms: ["道歉", "致歉"], heads: ["apologize", "apologise", "apology", "apologetic"] },
  { terms: ["欺骗", "蒙骗", "哄骗"], heads: ["deceive", "cheat", "trick", "hoodwink"] },
  { terms: ["继续", "持续", "延续"], heads: ["continue", "last", "endure", "sustain"] },
  { terms: ["停止", "停下", "停住"], heads: ["stop", "cease", "halt", "quit"] },
  { terms: ["增加", "增多", "增长"], heads: ["increase", "grow", "rise", "growth"] },
  { terms: ["减少", "减小", "缩减"], heads: ["reduce", "decrease", "lessen", "reduction"] },
].map(group => Object.freeze({ terms: Object.freeze(group.terms), heads: Object.freeze(group.heads) })));
const CURATED_HEADS_003 = new Map(CURATED_BATCH_003.flatMap(group => group.terms.map(term => [term, group.heads])));

// Batch 004 follows the same finite, source-evidenced policy. Related noun,
// adjective and adverb forms retain their original POS and usage differences.
const CURATED_BATCH_004 = Object.freeze([
  { terms: ["诚实", "正直"], heads: ["honest", "truthful", "upright", "honesty"] },
  { terms: ["忠诚", "忠实", "忠贞"], heads: ["loyal", "faithful", "loyalty"] },
  { terms: ["耐心", "耐性", "有耐心"], heads: ["patient", "patience", "patiently"] },
  { terms: ["好奇", "好奇心"], heads: ["curious", "curiosity"] },
  { terms: ["乐观", "乐天"], heads: ["optimistic", "optimism"] },
  { terms: ["悲观", "悲观情绪"], heads: ["pessimistic", "gloomy", "pessimism"] },
  { terms: ["热情", "热忱", "热心"], heads: ["enthusiastic", "enthusiasm", "ardent", "zeal"] },
  { terms: ["冷漠", "冷淡"], heads: ["cold", "aloof", "chilly", "unemotional"] },
  { terms: ["自信", "信心"], heads: ["confident", "assured", "confidence", "self-confident"] },
  { terms: ["紧张", "不安"], heads: ["nervous", "tense", "tension"] },
  { terms: ["尴尬", "窘迫", "困窘"], heads: ["embarrassed", "abashed", "awkwardness"] },
  { terms: ["沮丧", "灰心"], heads: ["dejected", "downhearted"] },
  { terms: ["满意", "满足"], heads: ["content", "contented", "satisfaction"] },
  { terms: ["感激", "感谢"], heads: ["grateful", "thankful", "thank", "appreciation"] },
  { terms: ["尊重", "尊敬", "敬重"], heads: ["respect", "esteem", "revere"] },
  { terms: ["信任", "信赖"], heads: ["trust", "rely", "reliance", "confidence"] },
  { terms: ["鼓励", "激励", "勉励"], heads: ["encourage", "encouragement", "hearten"] },
  { terms: ["支持", "拥护"], heads: ["support", "endorse", "uphold", "espouse"] },
  { terms: ["合作", "协作"], heads: ["cooperate", "collaborate", "cooperation", "collaborative"] },
  { terms: ["竞争", "角逐"], heads: ["compete", "contend", "competition", "vie"] },
  { terms: ["接受", "接纳"], heads: ["accept", "acceptance"] },
  { terms: ["否认", "否定"], heads: ["deny", "disavow", "denial", "negate"] },
  { terms: ["建议", "提议"], heads: ["suggest", "advise", "propose", "suggestion", "advice"] },
  { terms: ["邀请", "邀约"], heads: ["invite", "invitation"] },
  { terms: ["通知", "告知"], heads: ["notify", "inform", "notice"] },
  { terms: ["警告", "告诫", "警示"], heads: ["warn", "warning", "caution", "admonish"] },
  { terms: ["原谅", "宽恕"], heads: ["forgive", "pardon", "forgiveness"] },
  { terms: ["承诺", "许诺", "允诺", "诺言"], heads: ["promise", "pledge"] },
  { terms: ["计划", "打算"], heads: ["plan", "intend", "scheme", "propose"] },
  { terms: ["怀疑", "疑惑"], heads: ["doubt", "suspect", "doubtful", "skeptical", "sceptical"] },
].map(group => Object.freeze({ terms: Object.freeze(group.terms), heads: Object.freeze(group.heads) })));
const CURATED_HEADS_004 = new Map(CURATED_BATCH_004.flatMap(group => group.terms.map(term => [term, group.heads])));

const GROUPS = Object.freeze([
  ["开心", "高兴", "快乐", "愉快"],
  ["不开心", "不快乐", "不高兴"],
  ["难过", "伤心", "悲伤", "悲哀"],
  ["愤怒", "恼怒", "恼火"],
  ["害怕", "恐惧", "惧怕", "畏惧"],
  ["担心", "担忧", "忧虑", "发愁"],
  ["疲倦", "疲劳", "疲乏", "疲累"],
  ["困倦", "欲睡", "想睡"],
  ["聪明", "聪慧", "聪颖", "伶俐"],
  ["愚蠢", "愚笨"],
  ["勇敢", "英勇", "无畏"],
  ["有礼貌", "礼貌", "有礼", "客气"],
  ["美味", "好吃", "可口"],
  ["快速", "迅速", "飞快", "急速"],
  ["缓慢", "迟缓", "慢速"],
  ["干净", "清洁", "洁净"],
  ["肮脏", "污秽"],
  ["帮助", "帮忙", "协助", "援助"],
  ["开始", "起始", "开端"],
  ["结束", "终结", "终止"],
  ["喜欢", "喜爱"],
  ["讨厌", "厌恶", "嫌恶"],
  ["正确", "无误"],
  ["昂贵", "高价", "价高"],
  ["医生", "医师", "大夫"],
  ["教师", "教员", "老师"],
  ["儿童", "孩童", "小孩", "孩子"],
  ["婴儿", "婴孩", "宝宝"],
  ["朋友", "友人"],
  ["购买者", "买家", "买主"],
  ["寻找", "搜寻", "寻觅"],
  ["询问", "问询"],
  ["回答", "答复"],
  ["购买", "购置", "买"],
  ["出售", "卖出", "卖"],
  ["修理", "修缮", "维修"],
  ["巨大", "庞大"],
  ["微小", "细小"],
  ["困难", "艰难"],
  ["漂亮", "美丽", "秀丽"],
  ["惊讶", "惊奇", "诧异"],
  ["嫉妒", "妒忌"],
  ["谨慎", "慎重", "审慎"],
  ["准确", "精确", "确切"],
  ["相似", "类似", "相像"],
  ["不同", "相异", "有别"],
  ["理解", "领会", "领悟"],
  ["抱怨", "埋怨"],
  ["允许", "准许", "许可"],
  ["拒绝", "谢绝"],
  ["害羞", "羞怯", "腼腆"],
  ["著名", "有名", "知名"],
  ["错误", "差错"],
  ["安慰", "慰藉", "抚慰"],
  ...CURATED_BATCH_003.map(group => group.terms),
  ...CURATED_BATCH_004.map(group => group.terms),
].map(group => Object.freeze(group)));

// These concepts denote people, not their adjectival derivatives. A source
// gloss "教师的" supports pedagogical, but does not make it a word for a teacher.
const PERSON_TERMS = Object.freeze([
  "医生", "医师", "大夫", "教师", "教员", "老师", "儿童", "孩童", "小孩", "孩子",
  "婴儿", "婴孩", "宝宝", "朋友", "友人", "购买者", "买家", "买主",
]);
const MEDICAL_TERMS = Object.freeze(["医生", "医师", "大夫"]);
// A deliberately small, modern learning set. Some legacy source glosses call
// medical a doctor, or include unmarked mythological/rare usage (Aesculapius).
// Others name traditional healers rather than ordinary medical practitioners.
// Leave the source and English lookup unchanged; do not promote those glosses
// to generic Chinese doctor suggestions. Nor does this make Dr mean only doctor.
const MEDICAL_HEADS = Object.freeze(["doctor", "physician", "medical man", "practitioner", "medic", "medico"]);
const BUYING_TERMS = Object.freeze(["购买", "购置", "买"]);
const BUYING_HEADS = Object.freeze(["buy", "purchase"]);
const SELLING_TERMS = Object.freeze(["出售", "卖出", "卖"]);
const SELLING_HEADS = Object.freeze(["sell", "vend", "sale", "for sale"]);

/** A lexical shortlist, never a generated translation or an unchecked result. */
export function chineseSearchHeads(term) {
  if (MEDICAL_TERMS.includes(term)) return MEDICAL_HEADS;
  // Single-character trade aliases would otherwise scan thousands of compound
  // mentions. These common heads still require an actual matching source atom.
  if (BUYING_TERMS.includes(term)) return BUYING_HEADS;
  if (SELLING_TERMS.includes(term)) return SELLING_HEADS;
  return CURATED_HEADS_003.get(term) || CURATED_HEADS_004.get(term) || COMMON_GROUPS_BY_TERM.get(term)?.heads || null;
}

const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const BODY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const plans = new Map();
for (const group of GROUPS) for (const term of group) {
  plans.set(term, Object.freeze({ term, aliases: Object.freeze(group.filter(alias => alias !== term)) }));
}
const commonPlans = new Map(), COMMON_GROUPS_BY_TERM = new Map();
const commonSenseCache = new WeakMap();
for (const group of COMMON_CHINESE_GROUPS) {
  // Offline catalogue validation is stricter. A malformed/colliding future
  // row nevertheless cannot replace an established query family at runtime.
  if (!Array.isArray(group.terms) || !Array.isArray(group.heads) || !Array.isArray(group.evidence)
    || !group.terms.length || new Set(group.terms).size !== group.terms.length
    || group.terms.some(term => typeof term !== "string" || !/^\p{Script=Han}{1,50}$/u.test(term)
      || plans.has(term) || commonPlans.has(term))) continue;
  for (const term of group.terms) {
    commonPlans.set(term, Object.freeze({ term, aliases: Object.freeze(group.terms.filter(alias => alias !== term)) }));
    COMMON_GROUPS_BY_TERM.set(term, group);
  }
}

/** A one-hop, exact whole-query plan. No network, storage, or generated words. */
export function chineseSearchPlan(query) {
  if (typeof query !== "string" || query.length > 50 || CONTROL.test(query)) return null;
  const term = query.normalize("NFKC").trim();
  const exact = plans.get(term) || commonPlans.get(term);
  if (exact) return exact;
  if (!/[的地]$/u.test(term)) return null;
  const base = term.slice(0, -1), established = plans.get(base);
  if (established) return established;
  const common = commonPlans.get(base), kind = unambiguousPartOfSpeech(COMMON_GROUPS_BY_TERM.get(base)?.pos);
  // A noun such as 目的 must never consume 目的地 as an adverbial particle.
  return common && ((term.endsWith("的") && kind === "adjective") || (term.endsWith("地") && kind === "adverb")) ? common : null;
}

/** The reviewed query sense, separate from the original source definition. */
export function chineseSearchSense(term) {
  const group = COMMON_GROUPS_BY_TERM.get(term);
  if (!group) return null;
  if (!commonSenseCache.has(group)) commonSenseCache.set(group, Object.freeze({
    pos: unambiguousPartOfSpeech(group.pos), sense: group.sense, note: group.note,
    exampleSenses: group.exampleSenses,
  }));
  return commonSenseCache.get(group);
}

const POS = "(?:uncountable noun|countable noun|phrasal verb|verb phrase|adjective|adverb|interjection|preposition|conjunction|determiner|pronoun|numeral|noun|verb|adj|adv|interj|prep|conj|pron|det|aux|vt|vi|int|n|v|a|形容词|副词|名词|动词)\\.?";
const COUNTABILITY = "(?:\\s*\\((?:countable or uncountable|uncountable or countable|uncountable|countable)\\))?";
const POS_PREFIX = new RegExp(`^${POS}${COUNTABILITY}(?:\\s*(?:[·/&]|and)\\s*${POS}${COUNTABILITY})*(?:\\s*[.:：]\\s*|\\s+)`, "iu");
const NUMBER_PREFIX = /^(?:\d{1,3}[.、):：]|[一二三四五六七八九十]+[、.:：]|\(\d{1,3}\))\s*/u;
const DOMAIN_PREFIX = /^\[([^\[\]]{1,20})\]\s*/u;
const DOMAIN_LABELS = new Set([
  "计", "医", "经", "法", "电", "化", "化学", "生", "生物", "植", "植物", "动", "动物",
  "地", "地理", "物", "物理", "心", "心理", "军", "数", "数学", "商", "金融", "工程", "电工",
  "航", "航海", "航天", "天", "天文", "体", "体育", "音", "音乐", "语", "语言学", "宗", "宗教",
  "哲", "哲学", "口", "口语", "书面", "文学", "美", "英", "俗", "古", "俚", "方",
]);

function stripEditorialPrefix(segment) {
  let value = segment.trim();
  // Prefixes can occur in either order, but arbitrary parenthesised words
  // such as (使) and [使] must never be discarded as if they were POS labels.
  for (let count = 0; count < 6; count++) {
    const previous = value;
    value = value.replace(NUMBER_PREFIX, "").replace(POS_PREFIX, "").trim();
    const domain = value.match(DOMAIN_PREFIX);
    if (domain && DOMAIN_LABELS.has(domain[1])) value = value.slice(domain[0].length).trim();
    if (value === previous) break;
  }
  return value;
}

function definitionSegments(value) {
  const segments = []; let start = 0; const brackets = [];
  const closing = new Map([["(", ")"], ["[", "]"], ["【", "】"]]);
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (closing.has(char)) brackets.push(closing.get(char));
    else if (brackets.length && char === brackets.at(-1)) brackets.pop();
    else if (!brackets.length && /[\r\n,，;；。]/u.test(char)) {
      segments.push(value.slice(start, index)); start = index + 1;
    }
  }
  segments.push(value.slice(start)); return segments;
}

/** Match a definition atom, not a mention in an explanation or a compound. */
export function matchesChineseSearchMeaning(meaning, term) {
  if (typeof meaning !== "string" || meaning.length > 20_000 || BODY_CONTROL.test(meaning)
    || typeof term !== "string" || !/^\p{Script=Han}{1,50}$/u.test(term)) return false;
  // NFKC would otherwise turn ① into a bare 1, losing its list-marker role.
  const value = meaning.replace(/[①-⑳]/gu, char => `${char.codePointAt(0) - 0x245f}. `).normalize("NFKC");
  for (const segment of definitionSegments(value)) {
    const atom = stripEditorialPrefix(segment);
    const match = atom.match(/^([\p{Script=Han}]+)(?:\s*(?:\(([^()]*)\)|\[([^\[\]]*)\]|【([^【】]*)】))?[.．]?$/u);
    const accepted = PERSON_TERMS.includes(term) ? [term] : [term, `${term}的`, `${term}地`];
    if (!match || !accepted.includes(match[1])) continue;
    const note = (match[2] || match[3] || match[4] || "").trim();
    // A bracketed grammatical operator is not a harmless usage annotation.
    if (/^(?:使(?:人|某人)?|令(?:人|某人)?|让(?:人|某人)?|并非|不|无|未|非)/u.test(note)) continue;
    return true;
  }
  return false;
}

const POS_KINDS = new Map([
  ["n", "noun"], ["noun", "noun"], ["countable noun", "noun"], ["uncountable noun", "noun"], ["名词", "noun"],
  ["v", "verb"], ["vt", "verb"], ["vi", "verb"], ["verb", "verb"], ["verb phrase", "verb"], ["phrasal verb", "verb"], ["动词", "verb"],
  ["a", "adjective"], ["s", "adjective"], ["adj", "adjective"], ["adjective", "adjective"], ["形容词", "adjective"],
  ["r", "adverb"], ["adv", "adverb"], ["adverb", "adverb"], ["副词", "adverb"],
]);
const POS_TOKENS = /uncountable noun|countable noun|phrasal verb|verb phrase|adjective|adverb|noun|verb|adj|adv|vt|vi|名词|动词|形容词|副词|\b[nvasr]\b/giu;

function unambiguousPartOfSpeech(value) {
  if (typeof value !== "string" || value.length > 200 || CONTROL.test(value)) return null;
  const text = value.normalize("NFKC").toLowerCase().replace(/\((?:countable or uncountable|uncountable or countable|countable|uncountable)\)/gu, "");
  const kinds = new Set([...text.matchAll(POS_TOKENS)].map(match => POS_KINDS.get(match[0])));
  // A summary such as "noun · verb" cannot lend its verb label to a noun
  // definition. Unknown labels and prose are not grammatical evidence either.
  const remainder = text.replace(POS_TOKENS, "").replace(/(?:\band\b|[\s./&·:：,，;；-])/gu, "");
  return kinds.size === 1 && !remainder ? [...kinds][0] : null;
}

/** Match one source sense and its grammatical role, never a mixed-POS summary. */
export function matchesChineseSenseMeaning(meaning, term, partOfSpeech, targetPos) {
  const target = unambiguousPartOfSpeech(targetPos);
  if (!target || typeof meaning !== "string" || meaning.length > 20_000 || BODY_CONTROL.test(meaning)
    || typeof term !== "string" || !/^\p{Script=Han}{1,50}$/u.test(term)) return false;
  const value = meaning.replace(/[①-⑳]/gu, char => `${char.codePointAt(0) - 0x245f}. `).normalize("NFKC");
  let currentPos = unambiguousPartOfSpeech(partOfSpeech);
  for (const segment of definitionSegments(value)) {
    let atom = segment.trim();
    // Explicit labels bind this and following comma-separated atoms. They
    // replace, rather than supplement, the coarse record-level POS summary.
    for (let count = 0; count < 6; count++) {
      const previous = atom;
      atom = atom.replace(NUMBER_PREFIX, "").trim();
      const label = atom.match(POS_PREFIX);
      if (label) {
        currentPos = unambiguousPartOfSpeech(label[0].replace(/[.:：\s]+$/gu, ""));
        atom = atom.slice(label[0].length).trim();
      }
      const domain = atom.match(DOMAIN_PREFIX);
      if (domain && DOMAIN_LABELS.has(domain[1])) atom = atom.slice(domain[0].length).trim();
      if (atom === previous) break;
    }
    // Do not carry an earlier noun/verb label past a different unrecognised
    // editorial label into later comma-separated Chinese text.
    if (/^[a-z][a-z ]{0,30}[.:：]\s*/iu.test(atom)) currentPos = null;
    if (currentPos !== target) continue;
    const match = atom.match(/^([\p{Script=Han}]+)(?:\s*(?:\(([^()]*)\)|\[([^\[\]]*)\]|【([^【】]*)】))?[.．]?$/u);
    // Nouns and verbs never become adjectives/adverbs by removing 的/地.
    // The query aliases themselves may contain a particle when explicitly
    // reviewed; this rule does not manufacture a further alias from them.
    const accepted = target === "adjective" ? [term, `${term}的`]
      : target === "adverb" ? [term, `${term}地`] : [term];
    if (!match || !accepted.includes(match[1])) continue;
    const note = (match[2] || match[3] || match[4] || "").trim();
    if (/^(?:使(?:人|某人)?|令(?:人|某人)?|让(?:人|某人)?|并非|不|无|未|非)/u.test(note)) continue;
    return true;
  }
  return false;
}

/** Entry-level evidence adds the few reviewed lexical safety restrictions. */
export function matchesChineseSearchEntry(headword, meaning, term, partOfSpeech, source) {
  if (typeof headword !== "string" || !headword.trim() || headword.length > 200 || CONTROL.test(headword)) return false;
  const head = headword.normalize("NFKC").trim().toLocaleLowerCase("en-US"), group = COMMON_GROUPS_BY_TERM.get(term);
  if (group) {
    // Bind all evidence to one immutable source variant. A POS from one sense,
    // a gloss from another, or a same-text different source cannot authorize a
    // suggestion. Source drift fails closed until the catalogue is re-audited.
    return group.heads.includes(head) && group.evidence.some(item => item.head === head
      && item.meaning === meaning && item.partOfSpeech === partOfSpeech && item.source === source
      && Array.isArray(item.terms) && item.terms.includes(term))
      && matchesChineseSenseMeaning(meaning, term, partOfSpeech, group.pos);
  }
  if (!matchesChineseSearchMeaning(meaning, term)) return false;
  const heads = chineseSearchHeads(term);
  return !heads || heads.includes(head);
}
