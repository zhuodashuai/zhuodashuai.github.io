// These are small, editorially selected reverse-lookup concepts, not claims
// that every English result is interchangeable. Never expand part of a query,
// derive an antonym by deleting a negation, or follow a second synonym hop.
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
  return null;
}

const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const BODY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const plans = new Map();
for (const group of GROUPS) for (const term of group) {
  plans.set(term, Object.freeze({ term, aliases: Object.freeze(group.filter(alias => alias !== term)) }));
}

/** A one-hop, exact whole-query plan. No network, storage, or generated words. */
export function chineseSearchPlan(query) {
  if (typeof query !== "string" || query.length > 50 || CONTROL.test(query)) return null;
  const term = query.normalize("NFKC").trim();
  return plans.get(term) || (/[的地]$/u.test(term) ? plans.get(term.slice(0, -1)) : null) || null;
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

/** Entry-level evidence adds the few reviewed lexical safety restrictions. */
export function matchesChineseSearchEntry(headword, meaning, term) {
  if (typeof headword !== "string" || !headword.trim() || headword.length > 200 || CONTROL.test(headword)
    || !matchesChineseSearchMeaning(meaning, term)) return false;
  const heads = chineseSearchHeads(term);
  return !heads || heads.includes(headword.normalize("NFKC").trim().toLocaleLowerCase("en-US"));
}
