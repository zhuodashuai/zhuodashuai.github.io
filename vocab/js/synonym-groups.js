import { normalizeEnglish } from "./wordbook-schema.js";
import { entrySynonymFingerprint, sameSynonymSenseView } from "./synonym-evidence.js";

const LEXICAL_TYPES = new Set(["word", "phrase", "phrasal-verb", "idiom", "collocation"]);
const REVIEWED_POS = new Map([
  ["mystified", ["adjective"]], ["bewildered", ["adjective"]],
  ["pull somebody's leg", ["verb phrase", "phrasal verb", "idiom"]],
  ["have somebody on", ["phrasal verb", "verb phrase", "idiom"]],
  ["be for it", ["idiom", "verb phrase"]], ["be in hot water", ["idiom", "verb phrase"]],
  ["ambivalent", ["adjective"]], ["be torn between a and b", ["adjective phrase", "idiom", "verb phrase"]],
  ["daft", ["adjective"]], ["potty", ["adjective"]]
]);

// A reversible reading aid, not new vocabulary or a rewrite of the saved entries.
// Match the collected sense as well as the headword. These reviewed pairs are
// deliberately not expanded through a transitive synonym graph.
export const REVIEWED_SYNONYM_GROUPS = [
  {
    id: "confused", title: "困惑不解", note: "近义：都表示不理解；困惑的侧重点不同。",
    members: [
      { term: "mystified", sense: /迷惑|困惑|摸不着头脑/u, note: "觉得事情令人费解，想不明白原因。" },
      { term: "bewildered", sense: /困惑|不知所措/u, note: "困惑得不知所措，更突出茫然的状态。" }
    ]
  },
  {
    id: "teasing", title: "逗某人 · 开玩笑", note: "近义：都可用于识破玩笑；这里不是恶意欺骗。",
    members: [
      { term: "pull somebody's leg", sense: /逗|玩笑/u, note: "编些不当真的话逗对方；把整个习语一起记。" },
      { term: "have somebody on", sense: /逗|玩笑/u, note: "假装认真地逗对方，英式非正式表达。" }
    ]
  },
  {
    id: "trouble", title: "惹麻烦 · 要挨训", note: "近义：都涉及可能受到责备，但对麻烦发生的时点强调不同。",
    members: [
      { term: "be for it", sense: /倒霉|挨训|受罚/u, note: "预料自己马上要挨训或受罚：这下要倒霉了。英式口语。" },
      { term: "be in hot water", sense: /麻烦|责备/u, note: "已经因某事惹上麻烦；可接 with somebody。" }
    ]
  },
  {
    id: "mixed-feelings", title: "心情矛盾 · 难以抉择", note: "部分近义，不宜直接互换：矛盾感受未必需要作出选择。",
    members: [
      { term: "ambivalent", sense: /矛盾|相反感受/u, note: "对同一件事既有正面又有负面感受；常接 about。" },
      { term: "be torn between A and B", sense: /难以抉择/u, note: "在 A、B 两种选择之间摇摆；强调取舍困难。" }
    ]
  },
  {
    id: "foolish", title: "傻气与不理性", note: "部分近义：可表示不理性，但本章的 potty 更偏向疯疯癫癫，不等于单纯愚蠢。",
    members: [
      { term: "daft", sense: /傻的|愚蠢/u, note: "傻的、不明智的；英式口语，可以带嘲讽。" },
      { term: "potty", sense: /疯疯癫癫|不正常/u, note: "本章偏向疯疯癫癫、行为古怪；原文是假设反驳，不是认定 Miss Emily 疯了。" }
    ]
  }
];

function senseText(entry) {
  return [entry.meaning, ...(entry.senses || []).map((sense) => sense.meaningZh)].filter(Boolean).join(" ");
}

export function buildSynonymGroups(entries = []) {
  const byTerm = new Map();
  for (const entry of entries) {
    if (!entry?.id || !LEXICAL_TYPES.has(entry.entryType)) continue;
    const key = normalizeEnglish(entry.term);
    if (!key) continue;
    if (!byTerm.has(key)) byTerm.set(key, []);
    if (!byTerm.get(key).some((item) => item.id === entry.id)) byTerm.get(key).push(entry);
  }
  const find = (term) => {
    const matches = byTerm.get(normalizeEnglish(term));
    return matches?.length === 1 ? matches[0] : null;
  };
  const groups = [];
  const pairs = new Set();
  const pairKey = (members) => members.map(({ entry }) => entry.id).sort().join("\u0000");
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  // New words are recognized at publication, not by extending a hard-coded
  // vocabulary list. One evidenced edge immediately appears on BOTH cards.
  for (const entry of entries) {
    const scan = entry.synonymScan;
    if (!LEXICAL_TYPES.has(entry.entryType) || scan?.status !== "complete" || scan.sourceFingerprint !== entrySynonymFingerprint(entry)) continue;
    for (const match of scan.matches) {
      const target = byId.get(match.targetId);
      if (!target || target.id === entry.id || !LEXICAL_TYPES.has(target.entryType)
        || match.targetFingerprint !== entrySynonymFingerprint(target)) continue;
      const members = [entry, target].map((item) => ({ entry: item, note: item.meaning || item.definition }));
      const key = pairKey(members);
      if (pairs.has(key)) continue;
      pairs.add(key);
      groups.push({ id: `auto:${key.replaceAll("\u0000", ":")}`, title: `${entry.term} / ${target.term}`, note: `自动识别的近义关系：${match.note}`, members });
    }
  }
  for (const group of REVIEWED_SYNONYM_GROUPS) {
    const members = group.members.flatMap((member) => {
      const entry = find(member.term);
      const allowedPos = REVIEWED_POS.get(normalizeEnglish(member.term)) || [];
      const matchesPos = entry && String(entry.partOfSpeech || "").toLowerCase().split(/\s*[·/|]\s*/u).some((pos) => allowedPos.includes(pos.trim()));
      return entry && matchesPos && member.sense.test(senseText(entry)) ? [{ entry, note: member.note }] : [];
    });
    if (members.length !== group.members.length || new Set(members.map(({ entry }) => entry.id)).size !== members.length) continue;
    if (pairs.has(pairKey(members))) continue;
    pairs.add(pairKey(members));
    groups.push({ id: group.id, title: group.title, note: group.note, members });
  }
  for (const matches of byTerm.values()) {
    if (matches.length !== 1) continue;
    const entry = matches[0];
    for (const term of entry.synonyms || []) {
      const target = find(term);
      if (!target || target.id === entry.id) continue;
      const members = [entry, target].map((item) => ({ entry: item, note: item.meaning || "请打开词条核对具体义项。" }));
      const key = pairKey(members);
      if (pairs.has(key)) continue;
      pairs.add(key);
      groups.push({ id: `saved:${key.replaceAll("\u0000", ":")}`, title: `${entry.term} / ${target.term}`, note: "词库中已保存的同义关系；请按具体义项使用，不自动扩展到其他词。", members });
    }
  }
  return groups;
}

export function synonymGroupsForEntry(entry, entries) {
  const original = entries.find((candidate) => candidate.id === entry.id);
  if (original && sameSynonymSenseView(entry, original)) {
    return buildSynonymGroups(entries).filter((group) => group.members.some((member) => member.entry.id === entry.id))
      .map((group) => ({ ...group, members: group.members.map((member) => member.entry.id === entry.id ? { ...member, entry } : member) }));
  }
  // Respect a chapter-specific sense when opening a multi-chapter entry.
  return buildSynonymGroups(entries.map((candidate) => candidate.id === entry.id ? entry : candidate))
    .filter((group) => group.members.some((member) => member.entry.id === entry.id));
}
