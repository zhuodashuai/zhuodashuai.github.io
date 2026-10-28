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
      "term": "aerospace",
      "canonicalId": 617858,
      "canonicalSourceSha256": "5302a807efe92e8f367a751f962f7cf4b6e946197c2600a39b65adf49b98ffc9",
      "exactCanonicalRecord": {
        "id": 617858,
        "term": "aerospace",
        "partOfSpeech": "noun",
        "meaning": "n. 航天空间, 航天技术",
        "forms": [],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "noun",
            "meaning": "n. 航天空间, 航天技术",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 4827,
          "forms": [],
          "workbook": true
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT · 已上线核心整理",
        "license": "MIT and project editorial additions",
        "url": "https://github.com/skywind3000/ECDICT",
        "sha256": "62c196b29efc1e994cb418c377d655ebcbfc2f7ba0bb4c24933a75a3624c12e1"
      },
      "expectedOriginalEntry": {
        "term": "aerospace",
        "senses": [
          {
            "id": "example:aerospace",
            "partOfSpeech": "adjective",
            "meaningZh": "航空航天的",
            "examples": [
              {
                "en": "She hopes to design lightweight materials for aerospace engineering.",
                "zh": "她希望为航空航天工程设计轻质材料。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "1bd00c393f6cb8ee9147ebe14c2698db6be32839ebb483daffd18cedf89a422f",
      "acceptedDisplayContexts": [
        {
          "term": "aerospace",
          "partOfSpeech": "noun",
          "meaning": "n. 航天空间, 航天技术"
        },
        {
          "term": "aerospace",
          "partOfSpeech": "noun",
          "meaning": "① n. 航天空间, 航天技术"
        }
      ],
      "replacementPair": {
        "term": "aerospace",
        "partOfSpeech": "noun",
        "meaningZh": "n. 航天空间, 航天技术",
        "en": "The university opened a new laboratory for research in aerospace.",
        "zh": "这所大学新建了一间用于航天技术研究的实验室。"
      },
      "senseId": "canonical-example:617858:5302a807efe92e8f367a751f962f7cf4b6e946197c2600a39b65adf49b98ffc9",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "audio",
      "canonicalId": 587161,
      "canonicalSourceSha256": "4296a4127dbb79ce6462ebd25ad8f44c4494dc572bd4254729adfa784340404d",
      "exactCanonicalRecord": {
        "id": 587161,
        "term": "audio",
        "partOfSpeech": "adjective",
        "meaning": "a. 音频的, 声音的\n[电] 声频",
        "forms": [
          "audios"
        ],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "adjective",
            "meaning": "a. 音频的, 声音的\n[电] 声频",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 4587,
          "forms": [
            "audios"
          ],
          "workbook": true
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT · 已上线核心整理",
        "license": "MIT and project editorial additions",
        "url": "https://github.com/skywind3000/ECDICT",
        "sha256": "62c196b29efc1e994cb418c377d655ebcbfc2f7ba0bb4c24933a75a3624c12e1"
      },
      "expectedOriginalEntry": {
        "term": "audio",
        "senses": [
          {
            "id": "example:audio",
            "partOfSpeech": "noun",
            "meaningZh": "音频；声音",
            "examples": [
              {
                "en": "The video is clear, but the audio is very quiet.",
                "zh": "视频画面很清楚，但声音很小。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "22912e5f3388313bc7227dd8c17402323527f31e508c0f9e5605f04901a140ec",
      "acceptedDisplayContexts": [
        {
          "term": "audio",
          "partOfSpeech": "adjective",
          "meaning": "a. 音频的, 声音的\n[电] 声频"
        },
        {
          "term": "audio",
          "partOfSpeech": "adjective",
          "meaning": "① adj. 音频的, 声音的\n   [电] 声频"
        }
      ],
      "replacementPair": {
        "term": "audio",
        "partOfSpeech": "adjective",
        "meaningZh": "a. 音频的, 声音的\n[电] 声频",
        "en": "The curator added an audio recording to the exhibition guide.",
        "zh": "策展人在展览导览中加入了一段录音。"
      },
      "senseId": "canonical-example:587161:4296a4127dbb79ce6462ebd25ad8f44c4494dc572bd4254729adfa784340404d",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "blur",
      "canonicalId": 603032,
      "canonicalSourceSha256": "9cfad6602029df5b46700780bdec85d9c00f8337e5c10dc3055b3ccdba492303",
      "exactCanonicalRecord": {
        "id": 603032,
        "term": "blur",
        "partOfSpeech": "verb",
        "meaning": "vt. 使模糊, 弄脏\nvi. 弄脏, 模糊",
        "forms": [
          "blurred",
          "blurring",
          "blurs"
        ],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "verb",
            "meaning": "vt. 使模糊, 弄脏\nvi. 弄脏, 模糊",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 4711,
          "forms": [
            "blurred",
            "blurring",
            "blurs"
          ],
          "workbook": true
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT · 已上线核心整理",
        "license": "MIT and project editorial additions",
        "url": "https://github.com/skywind3000/ECDICT",
        "sha256": "62c196b29efc1e994cb418c377d655ebcbfc2f7ba0bb4c24933a75a3624c12e1"
      },
      "expectedOriginalEntry": {
        "term": "blur",
        "senses": [
          {
            "id": "example:blur",
            "partOfSpeech": "noun",
            "meaningZh": "模糊的影像",
            "examples": [
              {
                "en": "Without my glasses, the distant houses were a blur.",
                "zh": "没戴眼镜，远处的房屋在我眼里一片模糊。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "44c7a5dacd9f0154327bc9fb8a842ebf0e4ad48e394de50064bf21625fddf49c",
      "acceptedDisplayContexts": [
        {
          "term": "blur",
          "partOfSpeech": "verb",
          "meaning": "vt. 使模糊, 弄脏\nvi. 弄脏, 模糊"
        },
        {
          "term": "blur",
          "partOfSpeech": "verb",
          "meaning": "① vt. 使模糊, 弄脏\n② vi. 弄脏, 模糊"
        }
      ],
      "replacementPair": {
        "term": "blur",
        "partOfSpeech": "verb",
        "meaningZh": "vt. 使模糊, 弄脏\nvi. 弄脏, 模糊",
        "en": "A drop of water can blur the ink before it dries.",
        "zh": "墨水干透之前，一滴水就可能把字迹洇模糊。"
      },
      "senseId": "canonical-example:603032:9cfad6602029df5b46700780bdec85d9c00f8337e5c10dc3055b3ccdba492303",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "bootleg",
      "canonicalId": 2128935,
      "canonicalSourceSha256": "a10dc8ab0fdeddbfea31b6e3105781428173a13b65ebf3275730188f45ff89d7",
      "exactCanonicalRecord": {
        "id": 2128935,
        "term": "bootleg",
        "partOfSpeech": "verb",
        "meaning": "v. 私卖(酒)",
        "forms": [
          "bootlegged",
          "bootlegging",
          "bootlegs"
        ],
        "source": "mit",
        "seed": {
          "rank": 16635,
          "forms": [
            "bootlegged",
            "bootlegging",
            "bootlegs"
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
        "term": "bootleg",
        "senses": [
          {
            "id": "example:bootleg",
            "partOfSpeech": "adjective",
            "meaningZh": "盗版的",
            "examples": [
              {
                "en": "The collector refused to buy a bootleg recording of the concert.",
                "zh": "那位收藏者拒绝购买音乐会的盗版录音。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "098e084b324c4a76756d7e9232e840d0007af555d67a260526b45e23e9eba21c",
      "acceptedDisplayContexts": [
        {
          "term": "bootleg",
          "partOfSpeech": "verb",
          "meaning": "v. 私卖(酒)"
        },
        {
          "term": "bootleg",
          "partOfSpeech": "verb",
          "meaning": "① v. 私卖(酒)"
        }
      ],
      "replacementPair": {
        "term": "bootleg",
        "partOfSpeech": "verb",
        "meaningZh": "v. 私卖(酒)",
        "en": "The innkeeper used to bootleg whisky from a room behind the kitchen.",
        "zh": "那位旅店老板过去常在厨房后面的一间屋子里私卖威士忌。"
      },
      "senseId": "canonical-example:2128935:a10dc8ab0fdeddbfea31b6e3105781428173a13b65ebf3275730188f45ff89d7",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "breakaway",
      "canonicalId": 2104114,
      "canonicalSourceSha256": "d158b165bc5723bc6448791c7405d74a0257c6de0fa554fa5c1d23e755ec012e",
      "exactCanonicalRecord": {
        "id": 2104114,
        "term": "breakaway",
        "partOfSpeech": "noun",
        "meaning": "n. 脱离, (美)(非正式)一碰就散开/脱落的, 分裂",
        "forms": [
          "breakaways"
        ],
        "source": "mit",
        "seed": {
          "rank": 16441,
          "forms": [
            "breakaways"
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
        "term": "breakaway",
        "senses": [
          {
            "id": "example:breakaway",
            "partOfSpeech": "adjective",
            "meaningZh": "分裂出去的",
            "examples": [
              {
                "en": "A breakaway group formed a new orchestra in the neighbouring town.",
                "zh": "一个分裂出去的团体在邻镇组建了新的管弦乐团。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "b15bb7deb4dea11e9836313c661dd113559d9e58058ed42f31567085e291e9da",
      "acceptedDisplayContexts": [
        {
          "term": "breakaway",
          "partOfSpeech": "noun",
          "meaning": "n. 脱离, (美)(非正式)一碰就散开/脱落的, 分裂"
        },
        {
          "term": "breakaway",
          "partOfSpeech": "noun",
          "meaning": "① n. 脱离, (美)(非正式)一碰就散开/脱落的, 分裂"
        }
      ],
      "replacementPair": {
        "term": "breakaway",
        "partOfSpeech": "noun",
        "meaningZh": "n. 脱离, (美)(非正式)一碰就散开/脱落的, 分裂",
        "en": "The faction's breakaway left the party without a majority.",
        "zh": "这个派系的分裂使该党失去了多数优势。"
      },
      "senseId": "canonical-example:2104114:d158b165bc5723bc6448791c7405d74a0257c6de0fa554fa5c1d23e755ec012e",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "cavalier",
      "canonicalId": 1353280,
      "canonicalSourceSha256": "c3528195f740dd0110217a655c242a05d642ddf8690c766778ac65f19d6f2a87",
      "exactCanonicalRecord": {
        "id": 1353280,
        "term": "cavalier",
        "partOfSpeech": "noun",
        "meaning": "n. 骑士, 骑手",
        "forms": [
          "cavaliers"
        ],
        "source": "mit",
        "seed": {
          "rank": 10572,
          "forms": [
            "cavaliers"
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
        "term": "cavalier",
        "senses": [
          {
            "id": "example:cavalier",
            "partOfSpeech": "adjective",
            "meaningZh": "漫不经心的",
            "examples": [
              {
                "en": "His cavalier attitude toward the fragile exhibits worried the curator.",
                "zh": "他对易碎展品漫不经心的态度让策展人担忧。"
              }
            ],
            "reviewer": "AI/examples4_a",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "dbba51d850e6b76fe5257df901977bb79302d5a5db6f9299d41693cb11323739",
      "acceptedDisplayContexts": [
        {
          "term": "cavalier",
          "partOfSpeech": "noun",
          "meaning": "n. 骑士, 骑手"
        },
        {
          "term": "cavalier",
          "partOfSpeech": "noun",
          "meaning": "① n. 骑士, 骑手"
        }
      ],
      "replacementPair": {
        "term": "cavalier",
        "partOfSpeech": "noun",
        "meaningZh": "n. 骑士, 骑手",
        "en": "A cavalier in polished armour rode across the bridge.",
        "zh": "一位身穿锃亮铠甲的骑士骑马过了桥。"
      },
      "senseId": "canonical-example:1353280:c3528195f740dd0110217a655c242a05d642ddf8690c766778ac65f19d6f2a87",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "cleric",
      "canonicalId": 1901661,
      "canonicalSourceSha256": "f33362f04438eae2724f9a916e7816af14754d340dd74d3b601166fa632ab4db",
      "exactCanonicalRecord": {
        "id": 1901661,
        "term": "cleric",
        "partOfSpeech": "adjective",
        "meaning": "a. 牧师的, 教士的",
        "forms": [
          "clerics"
        ],
        "source": "mit",
        "seed": {
          "rank": 14859,
          "forms": [
            "clerics"
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
        "term": "cleric",
        "senses": [
          {
            "id": "example:cleric",
            "partOfSpeech": "noun",
            "meaningZh": "教士",
            "examples": [
              {
                "en": "The visiting cleric examined the ancient manuscript with great interest.",
                "zh": "来访的教士饶有兴趣地察看那份古老手稿。"
              }
            ],
            "reviewer": "AI/examples8_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "fec055d66ffb69271454496aa16a3d983f57865fe8483fd6710283946c0f7ae0",
      "acceptedDisplayContexts": [
        {
          "term": "cleric",
          "partOfSpeech": "adjective",
          "meaning": "a. 牧师的, 教士的"
        },
        {
          "term": "cleric",
          "partOfSpeech": "adjective",
          "meaning": "① adj. 牧师的, 教士的"
        }
      ],
      "replacementPair": {
        "term": "cleric",
        "partOfSpeech": "adjective",
        "meaningZh": "a. 牧师的, 教士的",
        "en": "The actor wore cleric robes and a large silver cross.",
        "zh": "那位演员身穿教士袍，佩戴着一枚大银十字架。"
      },
      "senseId": "canonical-example:1901661:f33362f04438eae2724f9a916e7816af14754d340dd74d3b601166fa632ab4db",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "dairy",
      "canonicalId": 572828,
      "canonicalSourceSha256": "bccc5c5ba1994ccb82c1de89b71087c9bf42e8c9fe377a5a72d00aa5060c87a2",
      "exactCanonicalRecord": {
        "id": 572828,
        "term": "dairy",
        "partOfSpeech": "noun",
        "meaning": "n. 牛奶公司, 乳品店, 乳牛场",
        "forms": [
          "dairies",
          "dairying"
        ],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "noun",
            "meaning": "n. 牛奶公司, 乳品店, 乳牛场",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 4475,
          "forms": [
            "dairies",
            "dairying"
          ],
          "workbook": true
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT · 已上线核心整理",
        "license": "MIT and project editorial additions",
        "url": "https://github.com/skywind3000/ECDICT",
        "sha256": "62c196b29efc1e994cb418c377d655ebcbfc2f7ba0bb4c24933a75a3624c12e1"
      },
      "expectedOriginalEntry": {
        "term": "dairy",
        "senses": [
          {
            "id": "example:dairy",
            "partOfSpeech": "adjective",
            "meaningZh": "乳制品的",
            "examples": [
              {
                "en": "The shop keeps dairy products in a separate chilled cabinet.",
                "zh": "商店把乳制品放在单独的冷藏柜里。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "eb14808cab794426ce778cbea5eaf46c3df2de1b39365bd8e5b3cca7da1814c7",
      "acceptedDisplayContexts": [
        {
          "term": "dairy",
          "partOfSpeech": "noun",
          "meaning": "n. 牛奶公司, 乳品店, 乳牛场"
        },
        {
          "term": "dairy",
          "partOfSpeech": "noun",
          "meaning": "① n. 牛奶公司, 乳品店, 乳牛场"
        }
      ],
      "replacementPair": {
        "term": "dairy",
        "partOfSpeech": "noun",
        "meaningZh": "n. 牛奶公司, 乳品店, 乳牛场",
        "en": "The dairy on the edge of the village keeps a herd of Jersey cows.",
        "zh": "村边的那家乳牛场养着一群泽西奶牛。"
      },
      "senseId": "canonical-example:572828:bccc5c5ba1994ccb82c1de89b71087c9bf42e8c9fe377a5a72d00aa5060c87a2",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "deadpan",
      "canonicalId": 1380310,
      "canonicalSourceSha256": "15baf865ef67fbea1657a480aafa561d63a5b1778d83b83f2361b689ac93455b",
      "exactCanonicalRecord": {
        "id": 1380310,
        "term": "deadpan",
        "partOfSpeech": "noun",
        "meaning": "n. 无表情的脸",
        "forms": [
          "deadpanning",
          "deadpans"
        ],
        "source": "mit",
        "seed": {
          "rank": 10783,
          "forms": [
            "deadpanning",
            "deadpans"
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
        "term": "deadpan",
        "senses": [
          {
            "id": "example:deadpan",
            "partOfSpeech": "adjective",
            "meaningZh": "不露声色的",
            "examples": [
              {
                "en": "Her deadpan delivery made the absurd story even funnier.",
                "zh": "她不露声色的讲述让荒诞的故事更好笑了。"
              }
            ],
            "reviewer": "AI/examples4_a",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "2e77ab9234ba93cfc76ae6091d4e2b07cf5bba1dcf31a669683aecc088099caf",
      "acceptedDisplayContexts": [
        {
          "term": "deadpan",
          "partOfSpeech": "noun",
          "meaning": "n. 无表情的脸"
        },
        {
          "term": "deadpan",
          "partOfSpeech": "noun",
          "meaning": "① n. 无表情的脸"
        }
      ],
      "replacementPair": {
        "term": "deadpan",
        "partOfSpeech": "noun",
        "meaningZh": "n. 无表情的脸",
        "en": "A smile finally broke through her deadpan.",
        "zh": "她那张毫无表情的脸上终于露出了一丝笑容。"
      },
      "senseId": "canonical-example:1380310:15baf865ef67fbea1657a480aafa561d63a5b1778d83b83f2361b689ac93455b",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "defeatist",
      "canonicalId": 1542930,
      "canonicalSourceSha256": "9b2c610d6767359f5ddc4214c0aa0a3acf2860b884cdb2656ff7f7041f4849bf",
      "exactCanonicalRecord": {
        "id": 1542930,
        "term": "defeatist",
        "partOfSpeech": "noun",
        "meaning": "n. 失败主义者",
        "forms": [
          "defeatists"
        ],
        "source": "mit",
        "seed": {
          "rank": 12054,
          "forms": [
            "defeatists"
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
        "term": "defeatist",
        "senses": [
          {
            "id": "example:defeatist",
            "partOfSpeech": "adjective",
            "meaningZh": "失败主义的",
            "examples": [
              {
                "en": "Her practical suggestion challenged the group's defeatist mood.",
                "zh": "她的实用建议打破了小组认定会失败的消极气氛。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "c65602887789d57fea052246018408825e06b748e003c52c4eb9aecf51b63821",
      "acceptedDisplayContexts": [
        {
          "term": "defeatist",
          "partOfSpeech": "noun",
          "meaning": "n. 失败主义者"
        },
        {
          "term": "defeatist",
          "partOfSpeech": "noun",
          "meaning": "① n. 失败主义者"
        }
      ],
      "replacementPair": {
        "term": "defeatist",
        "partOfSpeech": "noun",
        "meaningZh": "n. 失败主义者",
        "en": "He refused to be a defeatist and began planning another attempt.",
        "zh": "他不肯做一个失败主义者，开始筹划再次尝试。"
      },
      "senseId": "canonical-example:1542930:9b2c610d6767359f5ddc4214c0aa0a3acf2860b884cdb2656ff7f7041f4849bf",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "downward",
      "canonicalId": 1240707,
      "canonicalSourceSha256": "c672951b6f4bc449d3431714a38b97733045e2cda1aea49683225d1587876048",
      "exactCanonicalRecord": {
        "id": 1240707,
        "term": "downward",
        "partOfSpeech": "adjective",
        "meaning": "a. 向下的",
        "forms": [],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "adjective",
            "meaning": "a. 向下的",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 9693,
          "forms": [],
          "workbook": true
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT · 已上线核心整理",
        "license": "MIT and project editorial additions",
        "url": "https://github.com/skywind3000/ECDICT",
        "sha256": "62c196b29efc1e994cb418c377d655ebcbfc2f7ba0bb4c24933a75a3624c12e1"
      },
      "expectedOriginalEntry": {
        "term": "downward",
        "senses": [
          {
            "id": "example:downward",
            "partOfSpeech": "adverb",
            "meaningZh": "向下",
            "examples": [
              {
                "en": "The path slopes downward after the last stone cottage.",
                "zh": "经过最后一间石屋后，小路向下倾斜。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "21bc06a43ea34a52d1f039774b86c7ee09752a5bac7eef31ca635eb1fe7c727c",
      "acceptedDisplayContexts": [
        {
          "term": "downward",
          "partOfSpeech": "adjective",
          "meaning": "a. 向下的"
        },
        {
          "term": "downward",
          "partOfSpeech": "adjective",
          "meaning": "① adj. 向下的"
        }
      ],
      "replacementPair": {
        "term": "downward",
        "partOfSpeech": "adjective",
        "meaningZh": "a. 向下的",
        "en": "The trail takes a sharp downward turn just beyond the gate.",
        "zh": "小路刚过大门就急转向下。"
      },
      "senseId": "canonical-example:1240707:c672951b6f4bc449d3431714a38b97733045e2cda1aea49683225d1587876048",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "duff",
      "canonicalId": 2089582,
      "canonicalSourceSha256": "9b4373bdb01822acdb2e693a5ebc7fe20496bda8510b56d230069aa3654781e0",
      "exactCanonicalRecord": {
        "id": 2089582,
        "term": "duff",
        "partOfSpeech": "noun · verb",
        "meaning": "n. 水果干布丁, 细煤, 煤屑, 无用的东西\nvt. 把...弄得像新的一样, 把...改头换面",
        "forms": [
          "duffed",
          "duffs"
        ],
        "source": "mit",
        "seed": {
          "rank": 16327,
          "forms": [
            "duffed",
            "duffs"
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
        "term": "duff",
        "senses": [
          {
            "id": "example:duff",
            "partOfSpeech": "adjective",
            "meaningZh": "坏了的",
            "examples": [
              {
                "en": "A duff battery left the portable radio silent all afternoon.",
                "zh": "一节坏电池让那台便携收音机整个下午都没响。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "d93a4c08c3e3dc84b0aa5e9a1f2ca7cb03fa870c60ba372293cd3fb625abae6e",
      "acceptedDisplayContexts": [
        {
          "term": "duff",
          "partOfSpeech": "noun · verb",
          "meaning": "n. 水果干布丁, 细煤, 煤屑, 无用的东西\nvt. 把...弄得像新的一样, 把...改头换面"
        },
        {
          "term": "duff",
          "partOfSpeech": "noun · verb",
          "meaning": "① n. 水果干布丁, 细煤, 煤屑, 无用的东西\n② vt. 把...弄得像新的一样, 把...改头换面"
        }
      ],
      "replacementPair": {
        "term": "duff",
        "partOfSpeech": "noun · verb",
        "meaningZh": "n. 水果干布丁, 细煤, 煤屑, 无用的东西\nvt. 把...弄得像新的一样, 把...改头换面",
        "en": "For dessert, she served warm duff studded with raisins.",
        "zh": "甜点是她端来的热布丁，里面点缀着葡萄干。"
      },
      "senseId": "canonical-example:2089582:9b4373bdb01822acdb2e693a5ebc7fe20496bda8510b56d230069aa3654781e0",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "ersatz",
      "canonicalId": 1523664,
      "canonicalSourceSha256": "1de4795ffc0020d3f44943bf5bc3b06a4ada82a9b2561b201d8a34c831117036",
      "exactCanonicalRecord": {
        "id": 1523664,
        "term": "ersatz",
        "partOfSpeech": "noun",
        "meaning": "n. 代用品",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 11903,
          "forms": [],
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
        "term": "ersatz",
        "senses": [
          {
            "id": "example:ersatz",
            "partOfSpeech": "adjective",
            "meaningZh": "仿制代用品的",
            "examples": [
              {
                "en": "The stage crown was made of ersatz gold.",
                "zh": "舞台王冠由仿金材料制成。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "a51272fc00f75d069ceacf8be8ef2e4e6a9541335489696dc754e806fc92d2d4",
      "acceptedDisplayContexts": [
        {
          "term": "ersatz",
          "partOfSpeech": "noun",
          "meaning": "n. 代用品"
        },
        {
          "term": "ersatz",
          "partOfSpeech": "noun",
          "meaning": "① n. 代用品"
        }
      ],
      "replacementPair": {
        "term": "ersatz",
        "partOfSpeech": "noun",
        "meaningZh": "n. 代用品",
        "en": "During the shortage, roasted barley served as an ersatz for coffee.",
        "zh": "物资短缺期间，烘烤过的大麦被用作咖啡的代用品。"
      },
      "senseId": "canonical-example:1523664:1de4795ffc0020d3f44943bf5bc3b06a4ada82a9b2561b201d8a34c831117036",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "fact-finding",
      "canonicalId": 2147311,
      "canonicalSourceSha256": "a595dca828f2999c5fe9fc94aa7eec888bdaddf2beb6a4dd5b8b99e2bee938d1",
      "exactCanonicalRecord": {
        "id": 2147311,
        "term": "fact-finding",
        "partOfSpeech": "noun",
        "meaning": "n. 实情调查, 调解\n[法] 查明事实, 实情调查, 调停",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 16778,
          "forms": [],
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
        "term": "fact-finding",
        "senses": [
          {
            "id": "example:fact-finding",
            "partOfSpeech": "adjective",
            "meaningZh": "调查实情的",
            "examples": [
              {
                "en": "A fact-finding visit helped the designers understand the village's needs.",
                "zh": "一次实情调查走访帮助设计师们了解了村庄的需求。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "985deb128c3c528cf579e4e508e3ac8e1e2f6b88c8c9c4a464e0f9cea698e102",
      "acceptedDisplayContexts": [
        {
          "term": "fact-finding",
          "partOfSpeech": "noun",
          "meaning": "n. 实情调查, 调解\n[法] 查明事实, 实情调查, 调停"
        },
        {
          "term": "fact-finding",
          "partOfSpeech": "noun",
          "meaning": "① n. 实情调查, 调解\n   [法] 查明事实, 实情调查, 调停"
        }
      ],
      "replacementPair": {
        "term": "fact-finding",
        "partOfSpeech": "noun",
        "meaningZh": "n. 实情调查, 调解\n[法] 查明事实, 实情调查, 调停",
        "en": "The committee postponed its decision until the fact-finding was complete.",
        "zh": "委员会推迟作出决定，直到实情调查完成。"
      },
      "senseId": "canonical-example:2147311:a595dca828f2999c5fe9fc94aa7eec888bdaddf2beb6a4dd5b8b99e2bee938d1",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "feminist",
      "canonicalId": 1207068,
      "canonicalSourceSha256": "0f5dd8967a8cf8fc48aac92770962168e47f69537f04c9adc399811ddb4cdd05",
      "exactCanonicalRecord": {
        "id": 1207068,
        "term": "feminist",
        "partOfSpeech": "noun",
        "meaning": "n. 男女平等主义者",
        "forms": [
          "feminists"
        ],
        "source": "mit",
        "seed": {
          "rank": 9430,
          "forms": [
            "feminists"
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
        "term": "feminist",
        "senses": [
          {
            "id": "example:feminist",
            "partOfSpeech": "adjective",
            "meaningZh": "女性主义的",
            "examples": [
              {
                "en": "The course explores feminist interpretations of several classic novels.",
                "zh": "课程探讨了对几部经典小说的女性主义解读。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "b3d68df68eeb48c713b619fb8fd9768e6ecc60bfb788d5b168542d8a4e494b79",
      "acceptedDisplayContexts": [
        {
          "term": "feminist",
          "partOfSpeech": "noun",
          "meaning": "n. 男女平等主义者"
        },
        {
          "term": "feminist",
          "partOfSpeech": "noun",
          "meaning": "① n. 男女平等主义者"
        }
      ],
      "replacementPair": {
        "term": "feminist",
        "partOfSpeech": "noun",
        "meaningZh": "n. 男女平等主义者",
        "en": "As a feminist, she argued that women and men should receive equal pay for equal work.",
        "zh": "作为一名男女平等主义者，她主张男女应当同工同酬。"
      },
      "senseId": "canonical-example:1207068:0f5dd8967a8cf8fc48aac92770962168e47f69537f04c9adc399811ddb4cdd05",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "fore",
      "canonicalId": 890543,
      "canonicalSourceSha256": "e9fcf4cc0e4667076dbb88cb7fde52f7777ce988ed00c692cfad646995584ae0",
      "exactCanonicalRecord": {
        "id": 890543,
        "term": "fore",
        "partOfSpeech": "adjective · adverb · preposition",
        "meaning": "a. 在前的, 以前的\nadv. 在前面, 在船头\nprep. 在...前",
        "forms": [
          "fores"
        ],
        "source": "mit",
        "seed": {
          "rank": 6957,
          "forms": [
            "fores"
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
        "term": "fore",
        "senses": [
          {
            "id": "example:fore",
            "partOfSpeech": "noun",
            "meaningZh": "显要位置",
            "examples": [
              {
                "en": "Her leadership skills came to the fore during rehearsals.",
                "zh": "排练期间，她的领导才能显现出来。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "3c98e6ebea7bd6b983ca87d6d02d775f7435bfb35d5e2cc15ae742022ed3b039",
      "acceptedDisplayContexts": [
        {
          "term": "fore",
          "partOfSpeech": "adjective · adverb · preposition",
          "meaning": "a. 在前的, 以前的\nadv. 在前面, 在船头\nprep. 在...前"
        },
        {
          "term": "fore",
          "partOfSpeech": "adjective · adverb · preposition",
          "meaning": "① adj. 在前的, 以前的\n② adv. 在前面, 在船头\n③ prep. 在...前"
        }
      ],
      "replacementPair": {
        "term": "fore",
        "partOfSpeech": "adjective · adverb · preposition",
        "meaningZh": "a. 在前的, 以前的\nadv. 在前面, 在船头\nprep. 在...前",
        "en": "The ship's fore deck was still wet from the storm.",
        "zh": "船的前甲板上仍留着暴风雨打湿的水迹。"
      },
      "senseId": "canonical-example:890543:e9fcf4cc0e4667076dbb88cb7fde52f7777ce988ed00c692cfad646995584ae0",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "indie",
      "canonicalId": 1840960,
      "canonicalSourceSha256": "9acfd74134d88ba50eb3bad34d3d249a3ee06182ea61fe9dd1e1c5a9adbc5317",
      "exactCanonicalRecord": {
        "id": 1840960,
        "term": "indie",
        "partOfSpeech": "noun",
        "meaning": "n. 独立制片人, 独立制作的影(唱)片",
        "forms": [],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "noun",
            "meaning": "n. 独立制片人, 独立制作的影(唱)片",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 14385,
          "forms": [],
          "workbook": true
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT · 已上线核心整理",
        "license": "MIT and project editorial additions",
        "url": "https://github.com/skywind3000/ECDICT",
        "sha256": "62c196b29efc1e994cb418c377d655ebcbfc2f7ba0bb4c24933a75a3624c12e1"
      },
      "expectedOriginalEntry": {
        "term": "indie",
        "senses": [
          {
            "id": "example:indie",
            "partOfSpeech": "adjective",
            "meaningZh": "独立制作的",
            "examples": [
              {
                "en": "The festival gives indie filmmakers access to a larger audience.",
                "zh": "这个电影节让独立电影制作者有机会接触更多观众。"
              }
            ],
            "reviewer": "AI/examples8_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "9ab6f6b477996a8dad5c2d01f28e292213e6c9fbc4966ca18ad5a0bfa4c0efbf",
      "acceptedDisplayContexts": [
        {
          "term": "indie",
          "partOfSpeech": "noun",
          "meaning": "n. 独立制片人, 独立制作的影(唱)片"
        },
        {
          "term": "indie",
          "partOfSpeech": "noun",
          "meaning": "① n. 独立制片人, 独立制作的影(唱)片"
        }
      ],
      "replacementPair": {
        "term": "indie",
        "partOfSpeech": "noun",
        "meaningZh": "n. 独立制片人, 独立制作的影(唱)片",
        "en": "The festival opened with an indie filmed on a tiny budget.",
        "zh": "这个电影节以一部低成本拍摄的独立电影开幕。"
      },
      "senseId": "canonical-example:1840960:9acfd74134d88ba50eb3bad34d3d249a3ee06182ea61fe9dd1e1c5a9adbc5317",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "jettison",
      "canonicalId": 1122737,
      "canonicalSourceSha256": "c5c54f89edd18f1abe440958b884a0134074b8bff33efa19cc5728c630e0a2b1",
      "exactCanonicalRecord": {
        "id": 1122737,
        "term": "jettison",
        "partOfSpeech": "noun",
        "meaning": "n. 投弃, 投弃货物\n[经] 抛弃, 船货投海",
        "forms": [
          "jettisoned",
          "jettisoning",
          "jettisons"
        ],
        "source": "mit",
        "seed": {
          "rank": 8771,
          "forms": [
            "jettisoned",
            "jettisoning",
            "jettisons"
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
        "term": "jettison",
        "senses": [
          {
            "id": "example:jettison",
            "partOfSpeech": "verb",
            "meaningZh": "抛弃",
            "examples": [
              {
                "en": "The editors jettisoned the confusing subplot.",
                "zh": "编辑们舍弃了那条令人困惑的支线情节。"
              }
            ],
            "reviewer": "AI/examples4_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "65c41ff6b0d78ea34e898b61cbfaf11d2eab698b8636b63c462d9ed03f1edd9b",
      "acceptedDisplayContexts": [
        {
          "term": "jettison",
          "partOfSpeech": "noun",
          "meaning": "n. 投弃, 投弃货物\n[经] 抛弃, 船货投海"
        },
        {
          "term": "jettison",
          "partOfSpeech": "noun",
          "meaning": "① n. 投弃, 投弃货物\n   [经] 抛弃, 船货投海"
        }
      ],
      "replacementPair": {
        "term": "jettison",
        "partOfSpeech": "noun",
        "meaningZh": "n. 投弃, 投弃货物\n[经] 抛弃, 船货投海",
        "en": "The jettison of heavy cargo helped keep the damaged ship afloat.",
        "zh": "将沉重的货物抛入海中，帮助受损的船只维持漂浮。"
      },
      "senseId": "canonical-example:1122737:c5c54f89edd18f1abe440958b884a0134074b8bff33efa19cc5728c630e0a2b1",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "knock-on",
      "canonicalId": 2152719,
      "canonicalSourceSha256": "7d2c5a1cddaacf45c8c0f198e1850320cc355d20104f2bd0ec791d55a34ac93d",
      "exactCanonicalRecord": {
        "id": 2152719,
        "term": "knock-on",
        "partOfSpeech": "noun",
        "meaning": "n. 漏球",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 16821,
          "forms": [],
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
        "term": "knock-on",
        "senses": [
          {
            "id": "example:knock-on",
            "partOfSpeech": "adjective",
            "meaningZh": "连锁的",
            "examples": [
              {
                "en": "The delayed delivery had a knock-on effect on the exhibition.",
                "zh": "交货延误对展览产生了连锁影响。"
              }
            ],
            "reviewer": "AI/examples8_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "352fa48d7095838244984e9a0587b0036cd1572c5d2b71bc8a7600dc362d45b7",
      "acceptedDisplayContexts": [
        {
          "term": "knock-on",
          "partOfSpeech": "noun",
          "meaning": "n. 漏球"
        },
        {
          "term": "knock-on",
          "partOfSpeech": "noun",
          "meaning": "① n. 漏球"
        }
      ],
      "replacementPair": {
        "term": "knock-on",
        "partOfSpeech": "noun",
        "meaningZh": "n. 漏球",
        "en": "A knock-on near the try line ended the attack.",
        "zh": "在达阵线附近的一次向前掉球终结了这次进攻。"
      },
      "senseId": "canonical-example:2152719:7d2c5a1cddaacf45c8c0f198e1850320cc355d20104f2bd0ec791d55a34ac93d",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "offside",
      "canonicalId": 2121769,
      "canonicalSourceSha256": "5307433f0f61a786f4587319b5be20460d6d66ef486c45875db86d4542604ff7",
      "exactCanonicalRecord": {
        "id": 2121769,
        "term": "offside",
        "partOfSpeech": "noun",
        "meaning": "n. 外侧, 越位",
        "forms": [
          "offsides"
        ],
        "source": "mit",
        "seed": {
          "rank": 16579,
          "forms": [
            "offsides"
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
        "term": "offside",
        "senses": [
          {
            "id": "example:offside",
            "partOfSpeech": "adjective",
            "meaningZh": "越位的",
            "examples": [
              {
                "en": "The referee ruled the striker offside before the ball reached him.",
                "zh": "球传到前锋脚下之前，裁判便判他越位了。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "8fc10bea5ade759cdc1ebd1a41b31f5108541bb46813840567c86bd69fb50c99",
      "acceptedDisplayContexts": [
        {
          "term": "offside",
          "partOfSpeech": "noun",
          "meaning": "n. 外侧, 越位"
        },
        {
          "term": "offside",
          "partOfSpeech": "noun",
          "meaning": "① n. 外侧, 越位"
        }
      ],
      "replacementPair": {
        "term": "offside",
        "partOfSpeech": "noun",
        "meaningZh": "n. 外侧, 越位",
        "en": "The referee disallowed Lena's late goal for offside.",
        "zh": "裁判因越位判定莉娜在比赛快结束时打进的一球无效。"
      },
      "senseId": "canonical-example:2121769:5307433f0f61a786f4587319b5be20460d6d66ef486c45875db86d4542604ff7",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "offstage",
      "canonicalId": 1657508,
      "canonicalSourceSha256": "b82efb73de334b61eea6e793289251511dce36ca08a3d94998ea26e37d74f514",
      "exactCanonicalRecord": {
        "id": 1657508,
        "term": "offstage",
        "partOfSpeech": "noun · adjective",
        "meaning": "n. 台后, 幕内\na. 台后的, 幕内的",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 12949,
          "forms": [],
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
        "term": "offstage",
        "senses": [
          {
            "id": "example:offstage",
            "partOfSpeech": "adverb",
            "meaningZh": "在舞台外",
            "examples": [
              {
                "en": "A bell rang offstage while the actor opened the letter.",
                "zh": "演员拆信时，舞台外响起了铃声。"
              }
            ],
            "reviewer": "AI/examples4_a",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "1f994fa45a58d09dba341448d5ef25f80caf5f5ad768dfbec5eba4205c5c7992",
      "acceptedDisplayContexts": [
        {
          "term": "offstage",
          "partOfSpeech": "noun · adjective",
          "meaning": "n. 台后, 幕内\na. 台后的, 幕内的"
        },
        {
          "term": "offstage",
          "partOfSpeech": "noun · adjective",
          "meaning": "① n. 台后, 幕内\n② adj. 台后的, 幕内的"
        }
      ],
      "replacementPair": {
        "term": "offstage",
        "partOfSpeech": "noun · adjective",
        "meaningZh": "n. 台后, 幕内\na. 台后的, 幕内的",
        "en": "An offstage voice announced the arrival of the king.",
        "zh": "一个幕后的声音宣布国王驾到。"
      },
      "senseId": "canonical-example:1657508:b82efb73de334b61eea6e793289251511dce36ca08a3d94998ea26e37d74f514",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "retro",
      "canonicalId": 2043279,
      "canonicalSourceSha256": "18e78d6fd66c496154ae7457954e47ce35300cb735636b02601557053938c4dd",
      "exactCanonicalRecord": {
        "id": 2043279,
        "term": "retro",
        "partOfSpeech": "noun",
        "meaning": "n. 制动火箭, 减速火箭；（服装式样等）重新流行",
        "forms": [
          "retros"
        ],
        "source": "mit",
        "seed": {
          "rank": 15966,
          "forms": [
            "retros"
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
        "term": "retro",
        "senses": [
          {
            "id": "example:retro",
            "partOfSpeech": "adjective",
            "meaningZh": "复古的",
            "examples": [
              {
                "en": "The café's retro lamps matched its collection of old radios.",
                "zh": "咖啡馆的复古灯具与收藏的旧收音机十分相配。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "2fbd77511639a7fdfdabe264b314ae05d45ddc6c41726c76307a7645c6c44c2d",
      "acceptedDisplayContexts": [
        {
          "term": "retro",
          "partOfSpeech": "noun",
          "meaning": "n. 制动火箭, 减速火箭；（服装式样等）重新流行"
        },
        {
          "term": "retro",
          "partOfSpeech": "noun",
          "meaning": "① n. 制动火箭, 减速火箭；（服装式样等）重新流行"
        }
      ],
      "replacementPair": {
        "term": "retro",
        "partOfSpeech": "noun",
        "meaningZh": "n. 制动火箭, 减速火箭；（服装式样等）重新流行",
        "en": "The spacecraft's retros fired briefly to reduce its speed.",
        "zh": "飞船的减速火箭短暂点火，降低了飞船的速度。"
      },
      "senseId": "canonical-example:2043279:18e78d6fd66c496154ae7457954e47ce35300cb735636b02601557053938c4dd",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "savvy",
      "canonicalId": 1254520,
      "canonicalSourceSha256": "3de3a1400a68a387fbfd508f3d3945deadcfa0a0858b159ed0e453a3be7470ff",
      "exactCanonicalRecord": {
        "id": 1254520,
        "term": "savvy",
        "partOfSpeech": "verb · noun",
        "meaning": "v. 理解, 领悟\nn. 理解能力, 机智, 悟性",
        "forms": [
          "savvied",
          "savvies",
          "savviest",
          "savvying"
        ],
        "source": "mit",
        "seed": {
          "rank": 9800,
          "forms": [
            "savvied",
            "savvies",
            "savviest",
            "savvying"
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
        "term": "savvy",
        "senses": [
          {
            "id": "example:savvy",
            "partOfSpeech": "adjective",
            "meaningZh": "精明的",
            "examples": [
              {
                "en": "The savvy organizer booked an indoor room as well.",
                "zh": "精明的组织者还订了一间室内房间。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "93568a54ae6bc0a28724703a547909a60d8cea9935a6faab1611a5788a863150",
      "acceptedDisplayContexts": [
        {
          "term": "savvy",
          "partOfSpeech": "verb · noun",
          "meaning": "v. 理解, 领悟\nn. 理解能力, 机智, 悟性"
        },
        {
          "term": "savvy",
          "partOfSpeech": "verb · noun",
          "meaning": "① v. 理解, 领悟\n② n. 理解能力, 机智, 悟性"
        }
      ],
      "replacementPair": {
        "term": "savvy",
        "partOfSpeech": "verb · noun",
        "meaningZh": "v. 理解, 领悟\nn. 理解能力, 机智, 悟性",
        "en": "Her practical savvy helped the team repair the shelter with very few tools.",
        "zh": "她凭着机智，帮助团队仅用很少的工具就修好了棚屋。"
      },
      "senseId": "canonical-example:1254520:3de3a1400a68a387fbfd508f3d3945deadcfa0a0858b159ed0e453a3be7470ff",
      "reviewer": "AI/common-class-vocabulary-author"
    },
    {
      "term": "scupper",
      "canonicalId": 2125333,
      "canonicalSourceSha256": "f00f5e814177f68a1e30252601418b79dcdea0baf4715d33bd7e694e41d592b0",
      "exactCanonicalRecord": {
        "id": 2125333,
        "term": "scupper",
        "partOfSpeech": "noun",
        "meaning": "n. 甲板排水孔, 泄水口",
        "forms": [
          "scuppered",
          "scuppering",
          "scuppers"
        ],
        "source": "mit",
        "seed": {
          "rank": 16607,
          "forms": [
            "scuppered",
            "scuppering",
            "scuppers"
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
        "term": "scupper",
        "senses": [
          {
            "id": "example:scupper",
            "partOfSpeech": "verb",
            "meaningZh": "使计划失败（英式）",
            "examples": [
              {
                "en": "A sudden power cut scuppered their plans for an outdoor film screening.",
                "zh": "突然停电使他们的露天电影放映计划泡了汤。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "ae96e3f0d33aea4891203d0247ab8763c46ff021d9eb7131289ae26d867809e1",
      "acceptedDisplayContexts": [
        {
          "term": "scupper",
          "partOfSpeech": "noun",
          "meaning": "n. 甲板排水孔, 泄水口"
        },
        {
          "term": "scupper",
          "partOfSpeech": "noun",
          "meaning": "① n. 甲板排水孔, 泄水口"
        }
      ],
      "replacementPair": {
        "term": "scupper",
        "partOfSpeech": "noun",
        "meaningZh": "n. 甲板排水孔, 泄水口",
        "en": "A sailor cleared leaves from the scupper so that water could drain off the deck.",
        "zh": "一名水手清除了甲板排水孔里的树叶，让积水能够排出去。"
      },
      "senseId": "canonical-example:2125333:f00f5e814177f68a1e30252601418b79dcdea0baf4715d33bd7e694e41d592b0",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "starboard",
      "canonicalId": 2050431,
      "canonicalSourceSha256": "38b3879c078da6845ff2ff903778829ab2f4dc5c70a2c7d9bc755cf291fe07df",
      "exactCanonicalRecord": {
        "id": 2050431,
        "term": "starboard",
        "partOfSpeech": "noun · adverb · verb",
        "meaning": "n. 右舷, 右侧\nadv. 向右舷\nvt. 转向右方, 向右转舵",
        "forms": [
          "starboarded",
          "starboarding",
          "starboards"
        ],
        "source": "mit",
        "seed": {
          "rank": 16021,
          "forms": [
            "starboarded",
            "starboarding",
            "starboards"
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
        "term": "starboard",
        "senses": [
          {
            "id": "example:starboard",
            "partOfSpeech": "adjective",
            "meaningZh": "右舷的",
            "examples": [
              {
                "en": "A gull perched on the ship's starboard railing.",
                "zh": "一只海鸥栖在船的右舷栏杆上。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "9d96552b59c0bbc94ad50bd42299c9b6feba2fa410819ee514c418c209cc343f",
      "acceptedDisplayContexts": [
        {
          "term": "starboard",
          "partOfSpeech": "noun · adverb · verb",
          "meaning": "n. 右舷, 右侧\nadv. 向右舷\nvt. 转向右方, 向右转舵"
        },
        {
          "term": "starboard",
          "partOfSpeech": "noun · adverb · verb",
          "meaning": "① n. 右舷, 右侧\n② adv. 向右舷\n③ vt. 转向右方, 向右转舵"
        }
      ],
      "replacementPair": {
        "term": "starboard",
        "partOfSpeech": "noun · adverb · verb",
        "meaningZh": "n. 右舷, 右侧\nadv. 向右舷\nvt. 转向右方, 向右转舵",
        "en": "The crew moved the spare anchor to starboard.",
        "zh": "船员们把备用船锚移到了右舷。"
      },
      "senseId": "canonical-example:2050431:38b3879c078da6845ff2ff903778829ab2f4dc5c70a2c7d9bc755cf291fe07df",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "swank",
      "canonicalId": 1520453,
      "canonicalSourceSha256": "91d456c52695b01585de04478053605a8acb9d83adc44849a6b5916d7b574027",
      "exactCanonicalRecord": {
        "id": 1520453,
        "term": "swank",
        "partOfSpeech": "verb · noun",
        "meaning": "vi. 出风头, 炫耀\nn. 出风头, 炫耀, 虚张声势, 优雅",
        "forms": [
          "swanked",
          "swanking",
          "swanks"
        ],
        "source": "mit",
        "seed": {
          "rank": 11878,
          "forms": [
            "swanked",
            "swanking",
            "swanks"
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
        "term": "swank",
        "senses": [
          {
            "id": "example:swank",
            "partOfSpeech": "adjective",
            "meaningZh": "豪华时髦的",
            "examples": [
              {
                "en": "The swank hotel occupied a converted riverside warehouse.",
                "zh": "这家豪华时髦的酒店由河边仓库改建而成。"
              }
            ],
            "reviewer": "AI/examples4_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "16c1d5dd48516d6e31195f6df424832a2fb455c862203d300fa1af14bd485970",
      "acceptedDisplayContexts": [
        {
          "term": "swank",
          "partOfSpeech": "verb · noun",
          "meaning": "vi. 出风头, 炫耀\nn. 出风头, 炫耀, 虚张声势, 优雅"
        },
        {
          "term": "swank",
          "partOfSpeech": "verb · noun",
          "meaning": "① vi. 出风头, 炫耀\n② n. 出风头, 炫耀, 虚张声势, 优雅"
        }
      ],
      "replacementPair": {
        "term": "swank",
        "partOfSpeech": "verb · noun",
        "meaningZh": "vi. 出风头, 炫耀\nn. 出风头, 炫耀, 虚张声势, 优雅",
        "en": "He likes to swank about his expensive new car.",
        "zh": "他喜欢炫耀自己那辆昂贵的新车。"
      },
      "senseId": "canonical-example:1520453:91d456c52695b01585de04478053605a8acb9d83adc44849a6b5916d7b574027",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "uptown",
      "canonicalId": 2064764,
      "canonicalSourceSha256": "aa43805e96c8ac45e6fb21ee669fd822a40ca643397b16f6eea6d2a045929acd",
      "exactCanonicalRecord": {
        "id": 2064764,
        "term": "uptown",
        "partOfSpeech": "noun · adjective",
        "meaning": "n. 非中心区, 住宅区\na. 住宅区的",
        "forms": [
          "uptowner"
        ],
        "source": "mit",
        "seed": {
          "rank": 16133,
          "forms": [
            "uptowner"
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
        "term": "uptown",
        "senses": [
          {
            "id": "example:uptown",
            "partOfSpeech": "adverb",
            "meaningZh": "向住宅区",
            "examples": [
              {
                "en": "We took a bus uptown to visit her pottery studio.",
                "zh": "我们坐公交车到住宅区去参观她的陶艺工作室。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "7720a40c2948b68083d6101773e9f8762da79678e723cfe2525e72ac5cb7a392",
      "acceptedDisplayContexts": [
        {
          "term": "uptown",
          "partOfSpeech": "noun · adjective",
          "meaning": "n. 非中心区, 住宅区\na. 住宅区的"
        },
        {
          "term": "uptown",
          "partOfSpeech": "noun · adjective",
          "meaning": "① n. 非中心区, 住宅区\n② adj. 住宅区的"
        }
      ],
      "replacementPair": {
        "term": "uptown",
        "partOfSpeech": "noun · adjective",
        "meaningZh": "n. 非中心区, 住宅区\na. 住宅区的",
        "en": "Their new apartment is on a quiet uptown street, far from the downtown offices.",
        "zh": "他们的新公寓坐落在一条安静的住宅区街道上，远离市中心的办公楼。"
      },
      "senseId": "canonical-example:2064764:aa43805e96c8ac45e6fb21ee669fd822a40ca643397b16f6eea6d2a045929acd",
      "reviewer": "AI/common-class-vocabulary-author"
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
      "term": "wholemeal",
      "canonicalId": 2012087,
      "canonicalSourceSha256": "04fe16512e52ae7659942ef8c692eb60b8e6e7728ff8d666fec152f0aa8e3357",
      "exactCanonicalRecord": {
        "id": 2012087,
        "term": "wholemeal",
        "partOfSpeech": "noun",
        "meaning": "n. 全麦面粉",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 15722,
          "forms": [],
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
        "term": "wholemeal",
        "senses": [
          {
            "id": "example:wholemeal",
            "partOfSpeech": "adjective",
            "meaningZh": "全麦的",
            "examples": [
              {
                "en": "The bakery sold wholemeal bread beside white rolls.",
                "zh": "面包店在白面包卷旁出售全麦面包。"
              }
            ],
            "reviewer": "AI/examples8_a",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "ba373c18c273bd8aff94aa2a4d6a9a67a354eaf61efdbec724939e9332e9c3e3",
      "acceptedDisplayContexts": [
        {
          "term": "wholemeal",
          "partOfSpeech": "noun",
          "meaning": "n. 全麦面粉"
        },
        {
          "term": "wholemeal",
          "partOfSpeech": "noun",
          "meaning": "① n. 全麦面粉"
        }
      ],
      "replacementPair": {
        "term": "wholemeal",
        "partOfSpeech": "noun",
        "meaningZh": "n. 全麦面粉",
        "en": "She mixed 200 grams of wholemeal with the white flour before adding water.",
        "zh": "她先把200克全麦面粉和白面粉混合，再加水。"
      },
      "senseId": "canonical-example:2012087:04fe16512e52ae7659942ef8c692eb60b8e6e7728ff8d666fec152f0aa8e3357",
      "reviewer": "AI/common-class-vocabulary-author"
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
    },
    {
      "term": "x-ray",
      "canonicalId": 667762,
      "canonicalSourceSha256": "b96c5a5b06e98db7289df67f4ba544843d0bab0f499dc688e21affb082df0786",
      "exactCanonicalRecord": {
        "id": 667762,
        "term": "x-ray",
        "partOfSpeech": "adjective · verb",
        "meaning": "a. X射线的\nvt. 用X光检查, 照X光\nvi. 使用X光",
        "forms": [
          "x-rayed",
          "x-raying",
          "x-rays"
        ],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "adjective · verb",
            "meaning": "a. X射线的\nvt. 用X光检查, 照X光\nvi. 使用X光",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 5216,
          "forms": [
            "x-rayed",
            "x-raying",
            "x-rays"
          ],
          "workbook": false
        }
      },
      "canonicalSourceDescriptor": {
        "name": "ECDICT · 已上线核心整理",
        "license": "MIT and project editorial additions",
        "url": "https://github.com/skywind3000/ECDICT",
        "sha256": "62c196b29efc1e994cb418c377d655ebcbfc2f7ba0bb4c24933a75a3624c12e1"
      },
      "expectedOriginalEntry": {
        "term": "x-ray",
        "senses": [
          {
            "id": "example:x-ray",
            "partOfSpeech": "noun",
            "meaningZh": "X光片",
            "examples": [
              {
                "en": "The dentist examined the x-ray on the screen.",
                "zh": "牙医查看了屏幕上的X光片。"
              }
            ],
            "reviewer": "AI/examples4_a",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "1a5303929b33c6d5336fa3eaad98032f7b7c81bbeb6ede8af9baf682e653b0a7",
      "acceptedDisplayContexts": [
        {
          "term": "x-ray",
          "partOfSpeech": "adjective · verb",
          "meaning": "a. X射线的\nvt. 用X光检查, 照X光\nvi. 使用X光"
        },
        {
          "term": "x-ray",
          "partOfSpeech": "adjective · verb",
          "meaning": "① adj. X射线的\n② vt. 用X光检查, 照X光\n③ vi. 使用X光"
        }
      ],
      "replacementPair": {
        "term": "x-ray",
        "partOfSpeech": "adjective · verb",
        "meaningZh": "a. X射线的\nvt. 用X光检查, 照X光\nvi. 使用X光",
        "en": "The technician will x-ray her wrist before she returns to the waiting room.",
        "zh": "技师会先给她的手腕拍X光片，然后她再回候诊室。"
      },
      "senseId": "canonical-example:667762:b96c5a5b06e98db7289df67f4ba544843d0bab0f499dc688e21affb082df0786",
      "reviewer": "AI/common-class-vocabulary-author"
    }
  ]
});
