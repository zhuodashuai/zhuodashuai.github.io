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
      "term": "E",
      "canonicalId": 2197600,
      "canonicalSourceSha256": "1e68ee2b5980f2bd5866850b75ef3ae4327f8eb6a705028308ad8aca45d3b728",
      "exactCanonicalRecord": {
        "id": 2197600,
        "term": "E",
        "partOfSpeech": "noun",
        "meaning": "[计] 元件, 部件, 元素, 误差, 执行, 表达式, 指数",
        "forms": [],
        "source": "pos-reviewed",
        "seed": {
          "rank": 17171,
          "forms": [],
          "workbook": true
        },
        "variants": [
          {
            "partOfSpeech": "",
            "meaning": "[计] 元件, 部件, 元素, 误差, 执行, 表达式, 指数",
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
        "term": "E",
        "senses": [
          {
            "id": "example:E",
            "partOfSpeech": "noun",
            "meaningZh": "英文字母E",
            "examples": [
              {
                "en": "The child left the letter E out of the word.",
                "zh": "孩子在拼写那个词时漏掉了字母E。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "f8b98309e0713fc473f6f98027c969684a332e7561fbf16916999230b3e9a1b8",
      "acceptedDisplayContexts": [
        {
          "term": "E",
          "partOfSpeech": "noun",
          "meaning": "[计] 元件, 部件, 元素, 误差, 执行, 表达式, 指数"
        },
        {
          "term": "E",
          "partOfSpeech": "noun",
          "meaning": "① [计] 元件, 部件, 元素, 误差, 执行, 表达式, 指数"
        }
      ],
      "replacementPair": {
        "term": "E",
        "partOfSpeech": "noun",
        "meaningZh": "[计] 元件, 部件, 元素, 误差, 执行, 表达式, 指数",
        "en": "The spreadsheet interpreted 4.2E3 as 4,200, with E marking the exponent.",
        "zh": "电子表格把4.2E3识别为4200，其中E表示指数。"
      },
      "senseId": "canonical-example:2197600:1e68ee2b5980f2bd5866850b75ef3ae4327f8eb6a705028308ad8aca45d3b728",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "FOB",
      "canonicalId": 3063264,
      "canonicalSourceSha256": "1bb7d6b3e993f6ce4e6b9e1bfe115d40e5e3d52423c7bd94b330de9d1a062d6c",
      "exactCanonicalRecord": {
        "id": 3063264,
        "term": "FOB",
        "partOfSpeech": "noun · verb",
        "meaning": "n. 诡计, 表袋, 短表链\nvt. 骗人, 混骗",
        "forms": [
          "fobbed",
          "fobbing",
          "fobs"
        ],
        "source": "mit",
        "seed": {
          "rank": 23937,
          "forms": [
            "fobbed",
            "fobbing",
            "fobs"
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
        "term": "FOB",
        "senses": [
          {
            "id": "example:FOB",
            "partOfSpeech": "abbreviation",
            "meaningZh": "船上交货；离岸价条款的缩写（free on board，本例取贸易术语义）",
            "examples": [
              {
                "en": "The quotation marked the price as FOB.",
                "zh": "报价单把价格标为离岸价。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "747346aa72120d608ff3b1049634a12306f9009bd24ac1080f74678f362e26b4",
      "acceptedDisplayContexts": [
        {
          "term": "FOB",
          "partOfSpeech": "noun · verb",
          "meaning": "n. 诡计, 表袋, 短表链\nvt. 骗人, 混骗"
        },
        {
          "term": "FOB",
          "partOfSpeech": "noun · verb",
          "meaning": "① n. 诡计, 表袋, 短表链\n② vt. 骗人, 混骗"
        }
      ],
      "replacementPair": {
        "term": "FOB",
        "partOfSpeech": "noun · verb",
        "meaningZh": "n. 诡计, 表袋, 短表链\nvt. 骗人, 混骗",
        "en": "He fastened the silver fob to his waistcoat before putting on his jacket.",
        "zh": "他先把银质短表链扣在马甲上，然后穿上外套。"
      },
      "senseId": "canonical-example:3063264:1bb7d6b3e993f6ce4e6b9e1bfe115d40e5e3d52423c7bd94b330de9d1a062d6c",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "M",
      "canonicalId": 2218616,
      "canonicalSourceSha256": "e66657af56cf473527d3ff5d0367406a333e1bb7bd1cfb2b0490ee7ce3ae5b91",
      "exactCanonicalRecord": {
        "id": 2218616,
        "term": "M",
        "partOfSpeech": "noun · adjective",
        "meaning": "[计] 尾数, 主要, 媒体, 介质, 中等, 存储器, 方式, 分, 模, 乘法器, 兆, 毫\n[医] 容积克分子(溶液), 容模的",
        "forms": [
          "med"
        ],
        "source": "pos-reviewed",
        "seed": {
          "rank": 17335,
          "forms": [
            "med"
          ],
          "workbook": true
        },
        "variants": [
          {
            "partOfSpeech": "",
            "meaning": "[计] 尾数, 主要, 媒体, 介质, 中等, 存储器, 方式, 分, 模, 乘法器, 兆, 毫\n[医] 容积克分子(溶液), 容模的",
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
        "term": "M",
        "senses": [
          {
            "id": "example:M",
            "partOfSpeech": "noun",
            "meaningZh": "罗马数字M；表示一千",
            "examples": [
              {
                "en": "The date on the stone plaque began with an M.",
                "zh": "石牌上的日期以罗马数字M开头。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "c0be11c2a59d2717cf13661c93ecfa0b3fe67afd1f3359f04822fb4952e516ac",
      "acceptedDisplayContexts": [
        {
          "term": "M",
          "partOfSpeech": "noun · adjective",
          "meaning": "[计] 尾数, 主要, 媒体, 介质, 中等, 存储器, 方式, 分, 模, 乘法器, 兆, 毫\n[医] 容积克分子(溶液), 容模的"
        },
        {
          "term": "M",
          "partOfSpeech": "noun · adjective",
          "meaning": "① [计] 尾数, 主要, 媒体, 介质, 中等, 存储器, 方式, 分, 模, 乘法器, 兆, 毫\n   [医] 容积克分子(溶液), 容模的"
        }
      ],
      "replacementPair": {
        "term": "M",
        "partOfSpeech": "noun · adjective",
        "meaningZh": "[计] 尾数, 主要, 媒体, 介质, 中等, 存储器, 方式, 分, 模, 乘法器, 兆, 毫\n[医] 容积克分子(溶液), 容模的",
        "en": "The bottle contained a 0.10 M sodium chloride solution.",
        "zh": "瓶里装着浓度为0.10 M的氯化钠溶液。"
      },
      "senseId": "canonical-example:2218616:e66657af56cf473527d3ff5d0367406a333e1bb7bd1cfb2b0490ee7ce3ae5b91",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "abbr",
      "canonicalId": 6671294,
      "canonicalSourceSha256": "878971687cbe9af357a2483eb3f745190e69d3d4d7d9e32e9bcb808946076cb5",
      "exactCanonicalRecord": {
        "id": 6671294,
        "term": "abbr",
        "partOfSpeech": "noun",
        "meaning": "abbreviation 缩写",
        "forms": [],
        "source": "pos-reviewed",
        "seed": {
          "rank": 52146,
          "forms": [],
          "workbook": false
        },
        "variants": [
          {
            "partOfSpeech": "",
            "meaning": "abbreviation 缩写",
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
        "term": "abbr",
        "senses": [
          {
            "id": "example:abbr",
            "partOfSpeech": "abbreviation",
            "meaningZh": "缩写；缩略语（abbreviation的缩写，常写abbr.）",
            "examples": [
              {
                "en": "The dictionary marks the entry as abbr.",
                "zh": "词典把那个词条标为缩略语。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "3e84d6d5fa5606c912faae7dc9a7632c1abf53cdca83a90e3ac34f8df8b2ba3f",
      "acceptedDisplayContexts": [
        {
          "term": "abbr",
          "partOfSpeech": "noun",
          "meaning": "abbreviation 缩写"
        },
        {
          "term": "abbr",
          "partOfSpeech": "noun",
          "meaning": "① abbreviation 缩写"
        }
      ],
      "replacementPair": {
        "term": "abbr",
        "partOfSpeech": "noun",
        "meaningZh": "abbreviation 缩写",
        "en": "Use an abbr. only when the full title will not fit in the box.",
        "zh": "只有在框里写不下完整标题时，才使用缩写。"
      },
      "senseId": "canonical-example:6671294:878971687cbe9af357a2483eb3f745190e69d3d4d7d9e32e9bcb808946076cb5",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "bse",
      "canonicalId": 4035909,
      "canonicalSourceSha256": "1cc4042c863adb9f88260317fe9a18db18b7f36a1fcf120ae317f08fdd6c3839",
      "exactCanonicalRecord": {
        "id": 4035909,
        "term": "bse",
        "partOfSpeech": "abbreviation",
        "meaning": "abbr. base support equipment 基地支援装备; breast self-examination (cancer control) 乳房自身检查, 自行乳腺检查（癌症控制）",
        "forms": [
          "bses"
        ],
        "source": "mit",
        "seed": {
          "rank": 31537,
          "forms": [
            "bses"
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
        "term": "bse",
        "senses": [
          {
            "id": "example:bse",
            "partOfSpeech": "abbreviation",
            "meaningZh": "牛海绵状脑病的缩写（bovine spongiform encephalopathy）",
            "examples": [
              {
                "en": "The history lecture discussed public responses to the BSE crisis.",
                "zh": "历史讲座讨论了公众对牛海绵状脑病危机的反应。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "31c5b3e510c28c55432106e76c50d6c946187754778902566fdc7d43c1bc9ae6",
      "acceptedDisplayContexts": [
        {
          "term": "bse",
          "partOfSpeech": "abbreviation",
          "meaning": "abbr. base support equipment 基地支援装备; breast self-examination (cancer control) 乳房自身检查, 自行乳腺检查（癌症控制）"
        },
        {
          "term": "bse",
          "partOfSpeech": "abbreviation",
          "meaning": "① abbr. base support equipment 基地支援装备; breast self-examination (cancer control) 乳房自身检查, 自行乳腺检查（癌症控制）"
        }
      ],
      "replacementPair": {
        "term": "bse",
        "partOfSpeech": "abbreviation",
        "meaningZh": "abbr. base support equipment 基地支援装备; breast self-examination (cancer control) 乳房自身检查, 自行乳腺检查（癌症控制）",
        "en": "The questionnaire asked whether participants had ever performed BSE.",
        "zh": "问卷询问参与者是否曾做过乳房自我检查（BSE）。"
      },
      "senseId": "canonical-example:4035909:1cc4042c863adb9f88260317fe9a18db18b7f36a1fcf120ae317f08fdd6c3839",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "carney",
      "canonicalId": 4704835,
      "canonicalSourceSha256": "41538d24324306aa8e3a3dc3cd7b48faf160b47317d637e14ec00e33ce25b8a0",
      "exactCanonicalRecord": {
        "id": 4704835,
        "term": "carney",
        "partOfSpeech": "verb · noun",
        "meaning": "v. 哄骗\nn. 哄骗的话",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 36768,
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
        "term": "carney",
        "senses": [
          {
            "id": "example:carney",
            "partOfSpeech": "noun",
            "meaningZh": "嘉年华或流动游乐场的工作人员（亦写carny）",
            "examples": [
              {
                "en": "A carney called to visitors from beside the game stalls.",
                "zh": "一名游乐场工作人员站在游戏摊旁招呼游客。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "555aac68db1ab9e7615faa0dd5a99606b6c6296a24755cf3a27773a404a049f5",
      "acceptedDisplayContexts": [
        {
          "term": "carney",
          "partOfSpeech": "verb · noun",
          "meaning": "v. 哄骗\nn. 哄骗的话"
        },
        {
          "term": "carney",
          "partOfSpeech": "verb · noun",
          "meaning": "① v. 哄骗\n② n. 哄骗的话"
        }
      ],
      "replacementPair": {
        "term": "carney",
        "partOfSpeech": "verb · noun",
        "meaningZh": "v. 哄骗\nn. 哄骗的话",
        "en": "He tried to carney her into lending him another twenty pounds.",
        "zh": "他试图用好话哄她再借给他二十英镑。"
      },
      "senseId": "canonical-example:4704835:41538d24324306aa8e3a3dc3cd7b48faf160b47317d637e14ec00e33ce25b8a0",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "flathead",
      "canonicalId": 4049076,
      "canonicalSourceSha256": "6ffaa8ecaa69a2545cbf62881c93e196ae1f9e61c9c2ea736a2581b5e5a4a75f",
      "exactCanonicalRecord": {
        "id": 4049076,
        "term": "flathead",
        "partOfSpeech": "noun",
        "meaning": "n. 扁头印第安人",
        "forms": [
          "flatheads"
        ],
        "source": "mit",
        "seed": {
          "rank": 31640,
          "forms": [
            "flatheads"
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
        "term": "flathead",
        "senses": [
          {
            "id": "example:flathead",
            "partOfSpeech": "noun",
            "meaningZh": "鲬等头部扁平的鱼（本例取鱼名义）",
            "examples": [
              {
                "en": "The angler returned the small flathead to the water.",
                "zh": "钓鱼者把那条小鲬鱼放回了水中。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "ea4bd70676b7ea778d656372e8a6bb0e2d9c049781a1aa9366eadd5d7ef42c14",
      "acceptedDisplayContexts": [
        {
          "term": "flathead",
          "partOfSpeech": "noun",
          "meaning": "n. 扁头印第安人"
        },
        {
          "term": "flathead",
          "partOfSpeech": "noun",
          "meaning": "① n. 扁头印第安人"
        }
      ],
      "replacementPair": {
        "term": "flathead",
        "partOfSpeech": "noun",
        "meaningZh": "n. 扁头印第安人",
        "en": "The nineteenth-century diary records a conversation with a Flathead guide.",
        "zh": "那本十九世纪的日记记下了与一位萨利希族（旧称Flathead）向导的谈话。"
      },
      "senseId": "canonical-example:4049076:6ffaa8ecaa69a2545cbf62881c93e196ae1f9e61c9c2ea736a2581b5e5a4a75f",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "foo",
      "canonicalId": 4241367,
      "canonicalSourceSha256": "f0d0d5c0c47e4959271b2ab3045273ead144f718ebfbdf727de81410ad1a03fd",
      "exactCanonicalRecord": {
        "id": 4241367,
        "term": "foo",
        "partOfSpeech": "noun",
        "meaning": "n. 富/夫（姓氏）",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 33143,
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
        "term": "foo",
        "senses": [
          {
            "id": "example:foo",
            "partOfSpeech": "noun",
            "meaningZh": "程序示例中用作变量或函数名的占位名称foo",
            "examples": [
              {
                "en": "The tutorial uses foo as a temporary variable name.",
                "zh": "教程把foo用作临时变量名称。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "cd4721b8f99714078edafe5d0c61c986fd5493ad07a3f74cb86924c5f8282fb8",
      "acceptedDisplayContexts": [
        {
          "term": "foo",
          "partOfSpeech": "noun",
          "meaning": "n. 富/夫（姓氏）"
        },
        {
          "term": "foo",
          "partOfSpeech": "noun",
          "meaning": "① n. 富/夫（姓氏）"
        }
      ],
      "replacementPair": {
        "term": "foo",
        "partOfSpeech": "noun",
        "meaningZh": "n. 富/夫（姓氏）",
        "en": "Ms Foo reserved a meeting room for Tuesday afternoon.",
        "zh": "Foo女士预订了周二下午的一间会议室。"
      },
      "senseId": "canonical-example:4241367:f0d0d5c0c47e4959271b2ab3045273ead144f718ebfbdf727de81410ad1a03fd",
      "reviewer": "AI/common-class-coverage-audit"
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
      "term": "qed",
      "canonicalId": 5229453,
      "canonicalSourceSha256": "318bbf4343d6f4432865338364ab52597a5bc07ad28305027c49c173f616230c",
      "exactCanonicalRecord": {
        "id": 5229453,
        "term": "qed",
        "partOfSpeech": "abbreviation",
        "meaning": "abbr. quantitative evaluative device 定量可估价的装置; quantum electrodynamics 量子电动力学; quick-reaction dome 快速反应罩",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 40873,
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
        "term": "qed",
        "senses": [
          {
            "id": "example:qed",
            "partOfSpeech": "abbreviation",
            "meaningZh": "证毕（拉丁语quod erat demonstrandum）的缩写",
            "examples": [
              {
                "en": "She placed QED at the end of the proof.",
                "zh": "她在证明末尾写上了表示证毕的QED。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "af3a3e3e30098220f392acc4268ea797d7a1410d1301a7adf41e62853e0b9044",
      "acceptedDisplayContexts": [
        {
          "term": "qed",
          "partOfSpeech": "abbreviation",
          "meaning": "abbr. quantitative evaluative device 定量可估价的装置; quantum electrodynamics 量子电动力学; quick-reaction dome 快速反应罩"
        },
        {
          "term": "qed",
          "partOfSpeech": "abbreviation",
          "meaning": "① abbr. quantitative evaluative device 定量可估价的装置; quantum electrodynamics 量子电动力学; quick-reaction dome 快速反应罩"
        }
      ],
      "replacementPair": {
        "term": "qed",
        "partOfSpeech": "abbreviation",
        "meaningZh": "abbr. quantitative evaluative device 定量可估价的装置; quantum electrodynamics 量子电动力学; quick-reaction dome 快速反应罩",
        "en": "The lecture used QED to explain how electrons interact with light.",
        "zh": "这堂讲座用量子电动力学（QED）解释了电子如何与光相互作用。"
      },
      "senseId": "canonical-example:5229453:318bbf4343d6f4432865338364ab52597a5bc07ad28305027c49c173f616230c",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "sheepshead",
      "canonicalId": 5705987,
      "canonicalSourceSha256": "6a5ffbe1b58410c624e42afdc463ddfb622078561a382babaa8ef14456fcd555",
      "exactCanonicalRecord": {
        "id": 5705987,
        "term": "sheepshead",
        "partOfSpeech": "noun",
        "meaning": "n. 羊头, 蠢人",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 44597,
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
        "term": "sheepshead",
        "senses": [
          {
            "id": "example:sheepshead",
            "partOfSpeech": "noun",
            "meaningZh": "羊头鱼；本例取鱼名义",
            "examples": [
              {
                "en": "The illustration shows the teeth of a sheepshead.",
                "zh": "插图展示了一条羊头鱼的牙齿。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "d662cb189493cf492146f7aef168b3d9c88a0f0217611eeaf6ec068c715b755e",
      "acceptedDisplayContexts": [
        {
          "term": "sheepshead",
          "partOfSpeech": "noun",
          "meaning": "n. 羊头, 蠢人"
        },
        {
          "term": "sheepshead",
          "partOfSpeech": "noun",
          "meaning": "① n. 羊头, 蠢人"
        }
      ],
      "replacementPair": {
        "term": "sheepshead",
        "partOfSpeech": "noun",
        "meaningZh": "n. 羊头, 蠢人",
        "en": "In the old comedy, the master calls his apprentice a sheepshead for losing the keys.",
        "zh": "在那出旧喜剧中，师傅把丢了钥匙的学徒骂作笨蛋。"
      },
      "senseId": "canonical-example:5705987:6a5ffbe1b58410c624e42afdc463ddfb622078561a382babaa8ef14456fcd555",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "situationist",
      "canonicalId": 4514021,
      "canonicalSourceSha256": "7ba2ce73d575fc03df8a85250802d510b8feaf4f677ae8e9415816ab952c1fc6",
      "exactCanonicalRecord": {
        "id": 4514021,
        "term": "situationist",
        "partOfSpeech": "noun · adjective",
        "meaning": "情境画家",
        "forms": [
          "situationists"
        ],
        "source": "pos-reviewed",
        "seed": {
          "rank": 35275,
          "forms": [
            "situationists"
          ],
          "workbook": false
        },
        "variants": [
          {
            "partOfSpeech": "",
            "meaning": "情境画家",
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
        "term": "situationist",
        "senses": [
          {
            "id": "example:situationist",
            "partOfSpeech": "noun",
            "meaningZh": "情境主义者；主张情境主义的人",
            "examples": [
              {
                "en": "The situationist challenged the separation of art from everyday life.",
                "zh": "那位情境主义者质疑把艺术与日常生活割裂开的做法。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "e3e47a5746cad133028350f331b93a95d84563eb3c6f2a2f2346bd007dcbecd8",
      "acceptedDisplayContexts": [
        {
          "term": "situationist",
          "partOfSpeech": "noun · adjective",
          "meaning": "情境画家"
        },
        {
          "term": "situationist",
          "partOfSpeech": "noun · adjective",
          "meaning": "① 情境画家"
        }
      ],
      "replacementPair": {
        "term": "situationist",
        "partOfSpeech": "noun · adjective",
        "meaningZh": "情境画家",
        "en": "The situationist transformed a discarded painting by adding bright figures and a slogan.",
        "zh": "这位情境主义画家在一幅废弃画作上添加鲜艳的人物形象和标语，改造了它。"
      },
      "senseId": "canonical-example:4514021:7ba2ce73d575fc03df8a85250802d510b8feaf4f677ae8e9415816ab952c1fc6",
      "reviewer": "AI/common-class-coverage-audit"
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
      "term": "sus",
      "canonicalId": 5333202,
      "canonicalSourceSha256": "8fec72de3d246a4112a2ba1a63d87c0e07c99be7bb4abc2c5792ad5d72ac4210",
      "exactCanonicalRecord": {
        "id": 5333202,
        "term": "sus",
        "partOfSpeech": "noun",
        "meaning": "n. 可疑行为；嫌疑犯",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 41684,
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
        "term": "sus",
        "senses": [
          {
            "id": "example:sus",
            "partOfSpeech": "adjective",
            "meaningZh": "可疑的；不可信的（非正式用语）",
            "examples": [
              {
                "en": "That explanation sounds a bit sus to me.",
                "zh": "我觉得那个解释听起来有点可疑。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "b94d6f6e360c54e8887e678a8feab801281dda6a4ccbf46809aca5b662f29bd4",
      "acceptedDisplayContexts": [
        {
          "term": "sus",
          "partOfSpeech": "noun",
          "meaning": "n. 可疑行为；嫌疑犯"
        },
        {
          "term": "sus",
          "partOfSpeech": "noun",
          "meaning": "① n. 可疑行为；嫌疑犯"
        }
      ],
      "replacementPair": {
        "term": "sus",
        "partOfSpeech": "noun",
        "meaningZh": "n. 可疑行为；嫌疑犯",
        "en": "The officers questioned the sus about the missing jewellery.",
        "zh": "警员就失踪的珠宝盘问了那名嫌疑犯。"
      },
      "senseId": "canonical-example:5333202:8fec72de3d246a4112a2ba1a63d87c0e07c99be7bb4abc2c5792ad5d72ac4210",
      "reviewer": "AI/common-class-coverage-audit"
    },
    {
      "term": "thankyou",
      "canonicalId": 5157650,
      "canonicalSourceSha256": "e391823846d2cc6336571fad0b6a00272dd95299499177366b89b0da80065c28",
      "exactCanonicalRecord": {
        "id": 5157650,
        "term": "thankyou",
        "partOfSpeech": "noun",
        "meaning": "n. 谢谢",
        "forms": [
          "thankyous"
        ],
        "source": "mit",
        "seed": {
          "rank": 40311,
          "forms": [
            "thankyous"
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
        "term": "thankyou",
        "senses": [
          {
            "id": "example:thankyou",
            "partOfSpeech": "noun",
            "meaningZh": "感谢；表示感谢的话或便笺（规范写作thank-you）",
            "examples": [
              {
                "en": "She sent a handwritten thank-you after the visit.",
                "zh": "拜访之后，她寄去了一封手写的感谢信。"
              }
            ],
            "reviewer": "AI/prepare-author-selfcheck",
            "source": "原创例句·作者自查（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "e6c3fbf045385cf741e169df89b64a5d91542947f0fd592cb8e967dbde115072",
      "acceptedDisplayContexts": [
        {
          "term": "thankyou",
          "partOfSpeech": "noun",
          "meaning": "n. 谢谢"
        },
        {
          "term": "thankyou",
          "partOfSpeech": "noun",
          "meaning": "① n. 谢谢"
        }
      ],
      "replacementPair": {
        "term": "thankyou",
        "partOfSpeech": "noun",
        "meaningZh": "n. 谢谢",
        "en": "He murmured a thankyou as she handed him the repaired watch.",
        "zh": "她把修好的手表交给他时，他低声道了谢。"
      },
      "senseId": "canonical-example:5157650:e391823846d2cc6336571fad0b6a00272dd95299499177366b89b0da80065c28",
      "reviewer": "AI/common-class-coverage-audit"
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
