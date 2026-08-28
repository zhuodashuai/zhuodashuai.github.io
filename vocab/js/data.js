export const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120];

export const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "in", "into",
  "of", "on", "or", "the", "to", "up", "with"
]);

export const LOCAL_CORRECTIONS = {
  accomodate: "accommodate",
  definately: "definitely",
  enviroment: "environment",
  neccessary: "necessary",
  recieve: "receive",
  seperate: "separate",
  wierd: "weird"
};

export const LOCAL_ENTRIES = {
  "jab at": {
    headword: "jab",
    entryType: "phrase",
    partOfSpeech: "verb phrase · noun collocation",
    phonetic: "jab /d͡ʒæb/ + at /ət, æt/",
    meaning: "① 朝某人或某物猛戳、猛刺或快速击打；② （言语上）抨击、挖苦或嘲讽",
    definition: "To make a quick, sharp poking or striking movement toward someone or something; also, a pointed criticism or mocking remark.",
    exampleEn: "He jabbed at the elevator button with his finger.\nThat comment sounded like a jab at his former teammate.",
    exampleZh: "他用手指快速地反复戳按电梯按钮。\n那句话听起来像是在挖苦他的前队友。",
    usage: "动词结构：jab at + sb/sth。表示“讥讽”时，也常见 a jab at 或 take a jab at。",
    forms: ["jab", "jabs", "jabbed", "jabbing"],
    tags: ["短语", "动词 + 介词", "动作", "批评与讽刺"]
  },
  accommodate: {
    meaning: "容纳；适应；为……提供便利",
    partOfSpeech: "verb",
    tags: ["动词", "常见拼写"]
  },
  definitely: {
    meaning: "肯定地；明确地；确实",
    partOfSpeech: "adverb",
    tags: ["副词", "常见拼写"]
  },
  environment: {
    meaning: "环境；周围状况；自然环境",
    partOfSpeech: "noun",
    tags: ["名词", "常见拼写"]
  },
  necessary: {
    meaning: "必要的；必需的",
    partOfSpeech: "adjective",
    tags: ["形容词", "常见拼写"]
  },
  receive: {
    meaning: "收到；接受；接待",
    partOfSpeech: "verb",
    tags: ["动词", "常见拼写"]
  },
  separate: {
    meaning: "分开的；使分离；区分",
    partOfSpeech: "adjective · verb",
    tags: ["形容词", "动词", "常见拼写"]
  },
  weird: {
    meaning: "奇怪的；怪异的",
    partOfSpeech: "adjective",
    tags: ["形容词", "常见拼写"]
  }
};

export function createSeedEntry() {
  const now = new Date().toISOString();
  const source = LOCAL_ENTRIES["jab at"];
  return {
    id: "seed-jab-at",
    rawInput: "jab at",
    term: "jab at",
    normalized: "jab at",
    headword: source.headword,
    entryType: source.entryType,
    correction: {
      status: "exact",
      original: "jab at",
      chosen: "jab at",
      confidence: 1,
      candidates: []
    },
    phonetic: source.phonetic,
    partOfSpeech: source.partOfSpeech,
    meaning: source.meaning,
    definition: source.definition,
    exampleEn: source.exampleEn,
    exampleZh: source.exampleZh,
    usage: source.usage,
    forms: source.forms,
    tags: source.tags,
    note: "",
    sources: ["curated", "FreeDictionaryAPI"],
    createdAt: now,
    updatedAt: now,
    review: {
      level: 0,
      dueAt: now,
      reviewCount: 0,
      lapseCount: 0,
      lastRating: null
    },
    history: []
  };
}
