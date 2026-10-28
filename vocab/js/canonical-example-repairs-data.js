// Generated from exact independent canonical-example approvals; immutable source assets remain unchanged.
const deepFreeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
export const CANONICAL_EXAMPLE_REPAIRS = deepFreeze({
  "schemaVersion": 1,
  "kind": "canonical-same-sense-example-only-v1",
  "pins": {
    "version": "cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644",
    "manifestSha256": "2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f"
  },
  "rows": [
    {
      "term": "DEM",
      "canonicalId": 2846173,
      "canonicalSourceSha256": "f891462db4a4c0b7911401ce9e082e7166985987d9777246c2d0182f93497722",
      "exactCanonicalRecord": {
        "id": 2846173,
        "term": "DEM",
        "partOfSpeech": "noun",
        "meaning": "[计] 解调器",
        "forms": [
          "dems"
        ],
        "source": "pos-reviewed",
        "seed": {
          "rank": 22241,
          "forms": [
            "dems"
          ],
          "workbook": false
        },
        "variants": [
          {
            "partOfSpeech": "",
            "meaning": "[计] 解调器",
            "source": "mit"
          }
        ]
      },
      "canonicalSourceDescriptor": {
        "name": "原有释义＋词性校订",
        "license": "Meanings retain their original licences; POS sources and review methods are listed in the notice",
        "url": "https://zhuodashuai.github.io/vocab/dictionary-pos.html",
        "sha256": "7b4db9512038b99793649008e8529e46d615893769c533cf7adb7d719be8d1f0"
      },
      "expectedOriginalEntry": {
        "term": "DEM",
        "senses": [
          {
            "id": "example:DEM",
            "partOfSpeech": "abbreviation",
            "meaningZh": "德国马克的旧货币代码",
            "examples": [
              {
                "en": "The invoice recorded the price in DEM rather than dollars.",
                "zh": "发票以德国马克而不是美元记录了价格。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "6ef72474d57f2d4a1f4adc332ba2333a5a609733d5fa992da57adf64b61d16ad",
      "acceptedDisplayContexts": [
        {
          "term": "DEM",
          "partOfSpeech": "noun",
          "meaning": "[计] 解调器"
        },
        {
          "term": "DEM",
          "partOfSpeech": "noun",
          "meaning": "① [计] 解调器"
        }
      ],
      "replacementPair": {
        "term": "DEM",
        "partOfSpeech": "noun",
        "meaningZh": "[计] 解调器",
        "en": "The technician traced the weak output signal to a faulty DEM in the receiver.",
        "zh": "技术员查明，输出信号微弱是接收机中的解调器故障造成的。"
      },
      "senseId": "canonical-example:2846173:f891462db4a4c0b7911401ce9e082e7166985987d9777246c2d0182f93497722",
      "reviewer": "AI/repair_language_review"
    },
    {
      "term": "hubble",
      "canonicalId": 3938005,
      "canonicalSourceSha256": "2abed6ac798d72aaa46920f3a69495d82e73284ce60464f78dd2dd4c2e426fa8",
      "exactCanonicalRecord": {
        "id": 3938005,
        "term": "hubble",
        "partOfSpeech": "noun",
        "meaning": "n. 小凸起, 小瘤",
        "forms": [
          "hubbling"
        ],
        "source": "mit",
        "seed": {
          "rank": 30772,
          "forms": [
            "hubbling"
          ],
          "workbook": false
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT",
        "license": "MIT",
        "url": "https://github.com/skywind3000/ECDICT",
        "commit": "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
        "sha256": "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
      },
      "expectedOriginalEntry": {
        "term": "hubble",
        "senses": [
          {
            "id": "example:hubble",
            "partOfSpeech": "proper noun",
            "meaningZh": "哈勃太空望远镜的常用简称Hubble",
            "examples": [
              {
                "en": "The lecturer showed an image taken by Hubble.",
                "zh": "讲师展示了一幅由哈勃太空望远镜拍摄的图像。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "10681628d8607ad4367f124b1bce007228c6a00f1a5d977a1b9c40bb390734fe",
      "acceptedDisplayContexts": [
        {
          "term": "hubble",
          "partOfSpeech": "noun",
          "meaning": "n. 小凸起, 小瘤"
        },
        {
          "term": "hubble",
          "partOfSpeech": "noun",
          "meaning": "① n. 小凸起, 小瘤"
        }
      ],
      "replacementPair": {
        "term": "hubble",
        "partOfSpeech": "noun",
        "meaningZh": "n. 小凸起, 小瘤",
        "en": "His skate caught on a hubble in the ice, and he stumbled.",
        "zh": "他的冰刀被冰面上的一处小凸起绊住，他踉跄了一下。"
      },
      "senseId": "canonical-example:3938005:2abed6ac798d72aaa46920f3a69495d82e73284ce60464f78dd2dd4c2e426fa8",
      "reviewer": "AI/repair_source_review"
    },
    {
      "term": "melville",
      "canonicalId": 3299771,
      "canonicalSourceSha256": "43ca826a8e28d8a00930a63572064510583d7feae9759a091026e09dc39184fe",
      "exactCanonicalRecord": {
        "id": 3299771,
        "term": "melville",
        "partOfSpeech": "noun",
        "meaning": "n. 梅尔维尔（男子名）；梅尔维尔湖（位于加拿大东部）",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 25785,
          "forms": [],
          "workbook": false
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT",
        "license": "MIT",
        "url": "https://github.com/skywind3000/ECDICT",
        "commit": "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
        "sha256": "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
      },
      "expectedOriginalEntry": {
        "term": "melville",
        "senses": [
          {
            "id": "example:melville",
            "partOfSpeech": "proper noun",
            "meaningZh": "梅尔维尔；本例指作家Herman Melville",
            "examples": [
              {
                "en": "The seminar returned to Melville’s descriptions of the sea.",
                "zh": "研讨课又回到梅尔维尔对大海的描写。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "a20ba631b0a2cc238181a6d35595632cf3f080bedbf6634a2470510a5a4cc060",
      "acceptedDisplayContexts": [
        {
          "term": "melville",
          "partOfSpeech": "noun",
          "meaning": "n. 梅尔维尔（男子名）；梅尔维尔湖（位于加拿大东部）"
        },
        {
          "term": "melville",
          "partOfSpeech": "noun",
          "meaning": "① n. 梅尔维尔（男子名）；梅尔维尔湖（位于加拿大东部）"
        }
      ],
      "replacementPair": {
        "term": "melville",
        "partOfSpeech": "noun",
        "meaningZh": "n. 梅尔维尔（男子名）；梅尔维尔湖（位于加拿大东部）",
        "en": "Melville, a boy in my class, prefers to be called Mel.",
        "zh": "我们班有个男孩名叫梅尔维尔，他更喜欢别人叫他梅尔。"
      },
      "senseId": "canonical-example:3299771:43ca826a8e28d8a00930a63572064510583d7feae9759a091026e09dc39184fe",
      "reviewer": "AI/repair_language_review",
      "additionalExamples": [
        {
          "en": "Our boat reached the western shore of Lake Melville before the fog thickened.",
          "zh": "雾变浓前，我们的船抵达了梅尔维尔湖西岸。"
        }
      ]
    },
    {
      "term": "molly",
      "canonicalId": 2282180,
      "canonicalSourceSha256": "8dc12464be5fe3529b78b1ff3b022e62b77590572c22f2468688677b9f3415d9",
      "exactCanonicalRecord": {
        "id": 2282180,
        "term": "molly",
        "partOfSpeech": "noun",
        "meaning": "n. [俚]懦夫；娘娘腔的男人",
        "forms": [
          "mollied",
          "mollies"
        ],
        "source": "mit",
        "seed": {
          "rank": 17832,
          "forms": [
            "mollied",
            "mollies"
          ],
          "workbook": false
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT",
        "license": "MIT",
        "url": "https://github.com/skywind3000/ECDICT",
        "commit": "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
        "sha256": "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
      },
      "expectedOriginalEntry": {
        "term": "molly",
        "senses": [
          {
            "id": "example:molly",
            "partOfSpeech": "noun",
            "meaningZh": "摩利鱼；水族饲养中常见的一类小鱼（本例取鱼名义）",
            "examples": [
              {
                "en": "A small molly darted behind the aquarium plants.",
                "zh": "一条小摩利鱼飞快地躲到了水族箱的水草后面。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "9a61a562d2071f983b7f492e48e09ee13a2c3e9b649cb825fe093c223341eb28",
      "acceptedDisplayContexts": [
        {
          "term": "molly",
          "partOfSpeech": "noun",
          "meaning": "n. [俚]懦夫；娘娘腔的男人"
        },
        {
          "term": "molly",
          "partOfSpeech": "noun",
          "meaning": "① n. [俚]懦夫；娘娘腔的男人"
        }
      ],
      "replacementPair": {
        "term": "molly",
        "partOfSpeech": "noun",
        "meaningZh": "n. [俚]懦夫；娘娘腔的男人",
        "en": "The bully called him a molly because he would not join the fight.",
        "zh": "他不肯参加打架，那个恶霸就骂他是个懦夫。"
      },
      "senseId": "canonical-example:2282180:8dc12464be5fe3529b78b1ff3b022e62b77590572c22f2468688677b9f3415d9",
      "reviewer": "AI/repair_language_review"
    },
    {
      "term": "monmouth",
      "canonicalId": 3247104,
      "canonicalSourceSha256": "8a294a54bf6ebf5f7e334078d40d8185cd7c3c3cf012bf69549d70d8c0f99fbd",
      "exactCanonicalRecord": {
        "id": 3247104,
        "term": "monmouth",
        "partOfSpeech": "noun",
        "meaning": "n. 蒙默思郡（英国威尔士原郡名）",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 25374,
          "forms": [],
          "workbook": false
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT",
        "license": "MIT",
        "url": "https://github.com/skywind3000/ECDICT",
        "commit": "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
        "sha256": "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
      },
      "expectedOriginalEntry": {
        "term": "monmouth",
        "senses": [
          {
            "id": "example:monmouth",
            "partOfSpeech": "proper noun",
            "meaningZh": "蒙茅斯（威尔士地名，规范写作Monmouth）",
            "examples": [
              {
                "en": "They stopped in Monmouth on the way to the coast.",
                "zh": "他们在前往海岸的途中在蒙茅斯停了下来。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "960b6e3e13fd79fcbfa7e194377bdbd84fa574a58adebbe78da57f8603e4bb7f",
      "acceptedDisplayContexts": [
        {
          "term": "monmouth",
          "partOfSpeech": "noun",
          "meaning": "n. 蒙默思郡（英国威尔士原郡名）"
        },
        {
          "term": "monmouth",
          "partOfSpeech": "noun",
          "meaning": "① n. 蒙默思郡（英国威尔士原郡名）"
        }
      ],
      "replacementPair": {
        "term": "monmouth",
        "partOfSpeech": "noun",
        "meaningZh": "n. 蒙默思郡（英国威尔士原郡名）",
        "en": "The historian compared parish records from across the old county of Monmouth.",
        "zh": "这位历史学家比较了旧蒙默思郡各地的教区档案。"
      },
      "senseId": "canonical-example:3247104:8a294a54bf6ebf5f7e334078d40d8185cd7c3c3cf012bf69549d70d8c0f99fbd",
      "reviewer": "AI/repair_language_review"
    },
    {
      "term": "primo",
      "canonicalId": 4085182,
      "canonicalSourceSha256": "29572b31a10fa7c4296d580552797d2817dae1ae491073f088541fb2bdd06c0f",
      "exactCanonicalRecord": {
        "id": 4085182,
        "term": "primo",
        "partOfSpeech": "adjective",
        "meaning": "a. 第一的；首先的",
        "forms": [
          "primos"
        ],
        "source": "mit",
        "seed": {
          "rank": 31923,
          "forms": [
            "primos"
          ],
          "workbook": false
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT",
        "license": "MIT",
        "url": "https://github.com/skywind3000/ECDICT",
        "commit": "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
        "sha256": "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
      },
      "expectedOriginalEntry": {
        "term": "primo",
        "senses": [
          {
            "id": "example:primo",
            "partOfSpeech": "adjective",
            "meaningZh": "极好的；上等的（非正式）",
            "examples": [
              {
                "en": "They found a primo spot overlooking the stage.",
                "zh": "他们找到了一个正对舞台的绝佳位置。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "8c8e89af283c87a309daa358699a7b148ef7f1d0215ee3849553b2e482cf2ab0",
      "acceptedDisplayContexts": [
        {
          "term": "primo",
          "partOfSpeech": "adjective",
          "meaning": "a. 第一的；首先的"
        },
        {
          "term": "primo",
          "partOfSpeech": "adjective",
          "meaning": "① adj. 第一的；首先的"
        }
      ],
      "replacementPair": {
        "term": "primo",
        "partOfSpeech": "adjective",
        "meaningZh": "a. 第一的；首先的",
        "en": "I practised the primo part while my sister worked on the secondo part.",
        "zh": "我练习第一声部，姐姐则练习第二声部。"
      },
      "senseId": "canonical-example:4085182:29572b31a10fa7c4296d580552797d2817dae1ae491073f088541fb2bdd06c0f",
      "reviewer": "AI/repair_language_review"
    },
    {
      "term": "steinway",
      "canonicalId": 5734085,
      "canonicalSourceSha256": "7664cb56099367283d9ba11a68a0ebe26612e3458aa72f49f4687132c1945914",
      "exactCanonicalRecord": {
        "id": 5734085,
        "term": "steinway",
        "partOfSpeech": "noun",
        "meaning": "斯坦韦\nn. (Steinway)人名；(德)施泰因韦；(英)斯坦韦",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 44816,
          "forms": [],
          "workbook": false
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT",
        "license": "MIT",
        "url": "https://github.com/skywind3000/ECDICT",
        "commit": "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
        "sha256": "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
      },
      "expectedOriginalEntry": {
        "term": "steinway",
        "senses": [
          {
            "id": "example:steinway",
            "partOfSpeech": "proper noun",
            "meaningZh": "施坦威；本例指钢琴品牌Steinway",
            "examples": [
              {
                "en": "A Steinway occupied the centre of the rehearsal room.",
                "zh": "一架施坦威钢琴摆在排练室中央。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "0cb1a805f742707d3adaec69657cf9091c400b7a58708a474c084efa0a5c93d9",
      "acceptedDisplayContexts": [
        {
          "term": "steinway",
          "partOfSpeech": "noun",
          "meaning": "斯坦韦\nn. (Steinway)人名；(德)施泰因韦；(英)斯坦韦"
        },
        {
          "term": "steinway",
          "partOfSpeech": "noun",
          "meaning": "① 斯坦韦\n② n. (Steinway)人名；(德)施泰因韦；(英)斯坦韦"
        }
      ],
      "replacementPair": {
        "term": "steinway",
        "partOfSpeech": "noun",
        "meaningZh": "斯坦韦\nn. (Steinway)人名；(德)施泰因韦；(英)斯坦韦",
        "en": "In 1853, Henry E. Steinway and his sons started a piano-making business in New York.",
        "zh": "一八五三年，亨利·E·斯坦韦和儿子们在纽约创办了一家钢琴制造企业。"
      },
      "senseId": "canonical-example:5734085:7664cb56099367283d9ba11a68a0ebe26612e3458aa72f49f4687132c1945914",
      "reviewer": "AI/repair_language_review"
    },
    {
      "term": "wally",
      "canonicalId": 2807812,
      "canonicalSourceSha256": "0e32ffdcb9635913aec920666478251cc30ad3c3e6dd55183be1ee951224205f",
      "exactCanonicalRecord": {
        "id": 2807812,
        "term": "wally",
        "partOfSpeech": "adjective",
        "meaning": "a. 好的, 第一流的, 大的",
        "forms": [
          "wallies"
        ],
        "source": "mit",
        "seed": {
          "rank": 21942,
          "forms": [
            "wallies"
          ],
          "workbook": true
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT",
        "license": "MIT",
        "url": "https://github.com/skywind3000/ECDICT",
        "commit": "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
        "sha256": "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
      },
      "expectedOriginalEntry": {
        "term": "wally",
        "senses": [
          {
            "id": "example:wally",
            "partOfSpeech": "noun",
            "meaningZh": "笨蛋；傻瓜（英式非正式用语）",
            "examples": [
              {
                "en": "I felt like a wally when I realised I had locked myself out.",
                "zh": "发现自己把自己锁在门外时，我觉得自己像个笨蛋。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "77797e2149e4920b95d1aaf5c0e7ee94f1325770ce78c592e69e9de82173e787",
      "acceptedDisplayContexts": [
        {
          "term": "wally",
          "partOfSpeech": "adjective",
          "meaning": "a. 好的, 第一流的, 大的"
        },
        {
          "term": "wally",
          "partOfSpeech": "adjective",
          "meaning": "① adj. 好的, 第一流的, 大的"
        }
      ],
      "replacementPair": {
        "term": "wally",
        "partOfSpeech": "adjective",
        "meaningZh": "a. 好的, 第一流的, 大的",
        "en": "At the end of the harvest, they laid out a wally supper for the workers.",
        "zh": "收割结束时，他们为工人们摆下了一顿丰盛的晚餐。"
      },
      "senseId": "canonical-example:2807812:0e32ffdcb9635913aec920666478251cc30ad3c3e6dd55183be1ee951224205f",
      "reviewer": "AI/repair_language_review"
    },
    {
      "term": "wot",
      "canonicalId": 3740477,
      "canonicalSourceSha256": "6ea74045d42bfc2bbaf092ea2018c395f982d1442b0cedfc3ee5dd241d9001f9",
      "exactCanonicalRecord": {
        "id": 3740477,
        "term": "wot",
        "partOfSpeech": "verb · adverb · pronoun · interjection",
        "meaning": "vbl.wit的第1、3人称单数现在式",
        "forms": [
          "wots"
        ],
        "source": "pos-reviewed",
        "seed": {
          "rank": 29229,
          "forms": [
            "wot",
            "wots"
          ],
          "workbook": true
        },
        "variants": [
          {
            "partOfSpeech": "",
            "meaning": "vbl.wit的第1、3人称单数现在式",
            "source": "mit"
          }
        ]
      },
      "canonicalSourceDescriptor": {
        "name": "原有释义＋词性校订",
        "license": "Meanings retain their original licences; POS sources and review methods are listed in the notice",
        "url": "https://zhuodashuai.github.io/vocab/dictionary-pos.html",
        "sha256": "7b4db9512038b99793649008e8529e46d615893769c533cf7adb7d719be8d1f0"
      },
      "expectedOriginalEntry": {
        "term": "wot",
        "senses": [
          {
            "id": "example:wot",
            "partOfSpeech": "pronoun",
            "meaningZh": "what的非标准口语拼写（本例用于对话）",
            "examples": [
              {
                "en": "“Wot are you doing out here in the rain?”",
                "zh": "“你在外面淋着雨干什么呢？”"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "be242062b1357fdd6412fa0b401bed9b4eb69c75ce58fd3c76b25d9fa874bf7d",
      "acceptedDisplayContexts": [
        {
          "term": "wot",
          "partOfSpeech": "verb · adverb · pronoun · interjection",
          "meaning": "vbl.wit的第1、3人称单数现在式"
        },
        {
          "term": "wot",
          "partOfSpeech": "verb · adverb · pronoun · interjection",
          "meaning": "① vbl.wit的第1、3人称单数现在式"
        }
      ],
      "replacementPair": {
        "term": "wot",
        "partOfSpeech": "verb · adverb · pronoun · interjection",
        "meaningZh": "vbl.wit的第1、3人称单数现在式",
        "en": "'I wot not whether the bridge is safe,' the traveller replied.",
        "zh": "旅人回答：“我不知道那座桥是否安全。”"
      },
      "senseId": "canonical-example:3740477:6ea74045d42bfc2bbaf092ea2018c395f982d1442b0cedfc3ee5dd241d9001f9",
      "reviewer": "AI/repair_language_review"
    }
  ]
});
