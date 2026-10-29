// Generated selected example components; canonical definitions and complete old DTOs remain unchanged.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const CANONICAL_EXAMPLE_COMPONENTS=freeze({
  "schemaVersion": 1,
  "kind": "canonical-additional-example-components-v1",
  "pins": {
    "version": "cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644",
    "manifestSha256": "2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f"
  },
  "sourceSha256": "f71cabbeff614fab47dae406df336baa599cd1fae1d590c5eee07ef6ec5b326f",
  "reviewSha256": "4dbdca45ad39454ffc90437dc2e8b68c8d7915265f840a8d58f424cc87384863",
  "admissionSha256": "843a7d2ef9cddd0f73ba2f89720b005d198ff15bf73fa4b59695c3ecf17ee881",
  "rows": [
    {
      "term": "respectable",
      "canonicalId": 534573,
      "canonicalSourceSha256": "7e2b415223d66f133dbd53067d285d92525cbfc77ce231243b028cf305c8abbc",
      "exactCanonicalRecord": {
        "id": 534573,
        "term": "respectable",
        "partOfSpeech": "adjective · noun",
        "meaning": "a. 值得尊重的, 人格高尚的, 相当数量的\nn. 品格高尚的人",
        "forms": [
          "respectables"
        ],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "adjective · noun",
            "meaning": "a. 值得尊重的, 人格高尚的, 相当数量的\nn. 品格高尚的人",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 4176,
          "forms": [
            "respectables"
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
        "term": "respectable",
        "senses": [
          {
            "id": "example:respectable",
            "partOfSpeech": "adjective",
            "meaningZh": "数量或成绩相当不错的",
            "examples": [
              {
                "en": "The tiny bookshop attracted a respectable crowd to its first reading event.",
                "zh": "这家小书店的首场朗读活动吸引了相当多的人。"
              }
            ],
            "reviewer": "AI/examples_0003_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "c40f1c0ef7a4e80606f5b0921fc2e7cda8ff62d6e2e56b394e505e0eda7cc0b2",
      "canonicalContexts": [
        {
          "term": "respectable",
          "partOfSpeech": "adjective · noun",
          "meaning": "a. 值得尊重的, 人格高尚的, 相当数量的\nn. 品格高尚的人"
        },
        {
          "term": "respectable",
          "partOfSpeech": "adjective · noun",
          "meaning": "① adj. 值得尊重的, 人格高尚的, 相当数量的\n② n. 品格高尚的人"
        }
      ],
      "legacyContexts": [
        {
          "term": "respectable",
          "partOfSpeech": "adjective",
          "meaning": "数量或成绩相当不错的"
        }
      ],
      "componentContexts": [
        {
          "term": "respectable",
          "partOfSpeech": "adjective",
          "meaning": "体面的；得到社会认可、符合普遍行为规范的。"
        }
      ],
      "componentPair": {
        "term": "respectable",
        "partOfSpeech": "adjective",
        "meaningZh": "体面的；得到社会认可、符合普遍行为规范的。",
        "en": "She wanted a respectable job that would earn her family's approval.",
        "zh": "她想找一份体面的工作，得到家人的认可。"
      },
      "componentPairSha256": "9f5f5e978ae968143d91e1c569e4ff4fec8cadfd2d43fe435eed19a7a1326d3d",
      "componentId": "canonical-component:c34b8098be54e6297a379a00f1ed846b99fb3b7aae53d40e8343809e18ac5626",
      "reviewer": "AI/classroom_components_0011_reader_b",
      "sourceQualification": "Only this selected role and finite display association are authorized; the complete raw canonical definition remains unapproved.",
      "wholeRawSourceApproved": false
    },
    {
      "term": "persistently",
      "canonicalId": 2470535,
      "canonicalSourceSha256": "5fbb102847b37bbc5b84dbb97fcdec638ab63064c764ba5e000c33232531ab83",
      "exactCanonicalRecord": {
        "id": 2470535,
        "term": "persistently",
        "partOfSpeech": "adverb",
        "meaning": "adv. 坚持地; 固执地; 一个劲儿",
        "forms": [],
        "source": "mit",
        "seed": {
          "rank": 19305,
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
        "term": "persistently",
        "senses": [
          {
            "id": "example:persistently",
            "partOfSpeech": "adverb",
            "meaningZh": "坚持不懈地",
            "examples": [
              {
                "en": "She persistently searched the archive until the missing name appeared.",
                "zh": "她坚持不懈地查找档案，直到那个遗漏的名字出现。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "80fb8e9a51d27af85be196ba268d978cf8ec7314e1020db7b786e18382f68649",
      "canonicalContexts": [
        {
          "term": "persistently",
          "partOfSpeech": "adverb",
          "meaning": "adv. 坚持地; 固执地; 一个劲儿"
        },
        {
          "term": "persistently",
          "partOfSpeech": "adverb",
          "meaning": "① adv. 坚持地; 固执地; 一个劲儿"
        }
      ],
      "legacyContexts": [
        {
          "term": "persistently",
          "partOfSpeech": "adverb",
          "meaning": "坚持不懈地"
        }
      ],
      "componentContexts": [
        {
          "term": "persistently",
          "partOfSpeech": "adverb",
          "meaning": "持续地；长时间一直如此或反复发生。"
        }
      ],
      "componentPair": {
        "term": "persistently",
        "partOfSpeech": "adverb",
        "meaningZh": "持续地；长时间一直如此或反复发生。",
        "en": "Attendance at the evening classes has been persistently low.",
        "zh": "晚间课程的出勤率一直很低。"
      },
      "componentPairSha256": "f189f530c4c9ba7b2ba50cb13cdd2e2d56480bb56f963775312fe370da61ba3e",
      "componentId": "canonical-component:5765712634f778e1e4b41b9c6191e265756182694595280077c49c426c650a42",
      "reviewer": "AI/classroom_components_0011_reader_b",
      "sourceQualification": "Selected continuing-state sense separately supported; frozen perseverance-oriented gloss remains unapproved as a whole.",
      "wholeRawSourceApproved": false
    },
    {
      "term": "burden",
      "canonicalId": 300853,
      "canonicalSourceSha256": "95f65a8392dd2990c205781d99ee99b3bad2bfd5eb61db283ed21620a8d3d6a1",
      "exactCanonicalRecord": {
        "id": 300853,
        "term": "burden",
        "partOfSpeech": "noun · verb",
        "meaning": "n. 负担, 重载, 担子, 责任\nvt. 装货于, 烦扰, 使负担",
        "forms": [
          "burdened",
          "burdening",
          "burdens"
        ],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "noun · verb",
            "meaning": "n. 负担, 重载, 担子, 责任\nvt. 装货于, 烦扰, 使负担",
            "source": "mit"
          },
          {
            "partOfSpeech": "noun (countable)",
            "meaning": "1. noun (countable)：负担；令人感到沉重的责任、工作、费用或忧虑。\n2. noun (countable)：重物；载荷；人或动物背负的沉重东西，较正式。",
            "source": "original"
          }
        ],
        "seed": {
          "rank": 2350,
          "forms": [
            "burdened",
            "burdening",
            "burdens"
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
        "term": "burden",
        "senses": [
          {
            "id": "burden-noun-difficult-duty",
            "partOfSpeech": "noun (countable)",
            "meaningZh": "负担；令人感到沉重的责任、工作、费用或忧虑。",
            "examples": [
              {
                "en": "Sharing the paperwork reduced the burden on the coordinator.",
                "zh": "分担文书工作减轻了协调员的负担。"
              }
            ],
            "reviewer": "AI/noun-cross-review",
            "source": "原创例句·AI复核（精选义项）"
          },
          {
            "id": "burden-noun-heavy-load",
            "partOfSpeech": "noun (countable)",
            "meaningZh": "重物；载荷；人或动物背负的沉重东西，较正式。",
            "examples": [
              {
                "en": "The mule stopped beneath the weight of its burden.",
                "zh": "那头骡子被身上的重物压得停了下来。"
              }
            ],
            "reviewer": "AI/noun-cross-review",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "66fd875028414f889c39483b39c5177ec17415ece3b1e6f597bd622a92b7b10f",
      "canonicalContexts": [
        {
          "term": "burden",
          "partOfSpeech": "noun · verb",
          "meaning": "n. 负担, 重载, 担子, 责任\nvt. 装货于, 烦扰, 使负担"
        },
        {
          "term": "burden",
          "partOfSpeech": "noun · verb",
          "meaning": "① n. 负担, 重载, 担子, 责任\n② vt. 装货于, 烦扰, 使负担"
        }
      ],
      "legacyContexts": [
        {
          "term": "burden",
          "partOfSpeech": "noun (countable)",
          "meaning": "负担；令人感到沉重的责任、工作、费用或忧虑。"
        },
        {
          "term": "burden",
          "partOfSpeech": "noun (countable)",
          "meaning": "重物；载荷；人或动物背负的沉重东西，较正式。"
        }
      ],
      "componentContexts": [
        {
          "term": "burden",
          "partOfSpeech": "verb",
          "meaning": "给某人增添负担；使某人承担造成困难或忧虑的事情。"
        }
      ],
      "componentPair": {
        "term": "burden",
        "partOfSpeech": "verb",
        "meaningZh": "给某人增添负担；使某人承担造成困难或忧虑的事情。",
        "en": "I didn't want to burden my parents with another unexpected expense.",
        "zh": "我不想再给父母增添一笔意外开支的负担。"
      },
      "componentPairSha256": "e8e79b88ac2738c8f5f0e90dbcd8702b8075baf0d1e66089eff5d7078434ca15",
      "componentId": "canonical-component:a5a66cb3e301e1f97d7e5c473850f7a8e422baada45976afacfebb29c5d3cb66",
      "reviewer": "AI/classroom_components_0011_reader_b",
      "sourceQualification": "Only this selected role and finite display association are authorized; the complete raw canonical definition remains unapproved.",
      "wholeRawSourceApproved": false
    },
    {
      "term": "honor",
      "canonicalId": 1180687,
      "canonicalSourceSha256": "511c1fc5ad294a0c6c15533de4f78fa90cf80f8236abbd6f8a9b916940476912",
      "exactCanonicalRecord": {
        "id": 1180687,
        "term": "honor",
        "partOfSpeech": "noun · verb",
        "meaning": "n. 荣誉, 头衔, 信用, 尊敬, 名誉, 阁下, 勋章\nvt. 尊敬, 授予荣誉, 承兑, 实践",
        "forms": [
          "honored",
          "honoring",
          "honors"
        ],
        "source": "mit",
        "seed": {
          "rank": 9224,
          "forms": [
            "honored",
            "honoring",
            "honors"
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
        "term": "honor",
        "senses": [
          {
            "id": "example:honor",
            "partOfSpeech": "noun",
            "meaningZh": "荣誉",
            "examples": [
              {
                "en": "The invitation was a great honor for the young musician.",
                "zh": "这份邀请是年轻音乐家的莫大荣誉。"
              }
            ],
            "reviewer": "AI/examples4_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "553546e21040fcdae364e192fe5046154a60af9f98d8b152aa62dc6e92233cfa",
      "canonicalContexts": [
        {
          "term": "honor",
          "partOfSpeech": "noun · verb",
          "meaning": "n. 荣誉, 头衔, 信用, 尊敬, 名誉, 阁下, 勋章\nvt. 尊敬, 授予荣誉, 承兑, 实践"
        },
        {
          "term": "honor",
          "partOfSpeech": "noun · verb",
          "meaning": "① n. 荣誉, 头衔, 信用, 尊敬, 名誉, 阁下, 勋章\n② vt. 尊敬, 授予荣誉, 承兑, 实践"
        }
      ],
      "legacyContexts": [
        {
          "term": "honor",
          "partOfSpeech": "noun",
          "meaning": "荣誉"
        }
      ],
      "componentContexts": [
        {
          "term": "honor",
          "partOfSpeech": "verb",
          "meaning": "履行或兑现承诺、约定或协议的条款。"
        }
      ],
      "componentPair": {
        "term": "honor",
        "partOfSpeech": "verb",
        "meaningZh": "履行或兑现承诺、约定或协议的条款。",
        "en": "The insurer agreed to honor the coverage commitments described in the policy.",
        "zh": "保险公司同意兑现保单中载明的保障承诺。"
      },
      "componentPairSha256": "41899f1af212c16cc02ac1d64d36b68b8da752e8e87fc26b57604b48b76aaf0c",
      "componentId": "canonical-component:df50fbbc5b7f36c4583eb275e8906f009323450a81a23d4496cb4675f6578fa6",
      "reviewer": "AI/classroom_components_0011_reader_b",
      "sourceQualification": "Only this selected role and finite display association are authorized; the complete raw canonical definition remains unapproved.",
      "wholeRawSourceApproved": false
    },
    {
      "term": "snuff",
      "canonicalId": 2051771,
      "canonicalSourceSha256": "717bfed799e817a3a8dabae6c3f69edfc98d0e8debdb6b9975597bc0717ad903",
      "exactCanonicalRecord": {
        "id": 2051771,
        "term": "snuff",
        "partOfSpeech": "noun · verb",
        "meaning": "n. 烛花, 用鼻吸气, 嗅, 闻, 鼻烟, 气味\nvt. 剪烛花, 掐灭, 扼杀, 消灭, 用鼻吸, 嗅出, 闻出\nvi. 嗅, 闻",
        "forms": [
          "snuffed",
          "snuffing",
          "snuffs"
        ],
        "source": "mit",
        "seed": {
          "rank": 16032,
          "forms": [
            "snuffed",
            "snuffing",
            "snuffs"
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
        "term": "snuff",
        "senses": [
          {
            "id": "example:snuff",
            "partOfSpeech": "verb",
            "meaningZh": "熄灭",
            "examples": [
              {
                "en": "A gust through the doorway snuffed the candle beside the mirror.",
                "zh": "门口吹来一阵风，熄灭了镜子旁的蜡烛。"
              }
            ],
            "reviewer": "AI/examples8_b",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "841435c69a97043b0c5aaac17b5e65495304cf619af1828cf24864789de4106f",
      "canonicalContexts": [
        {
          "term": "snuff",
          "partOfSpeech": "noun · verb",
          "meaning": "n. 烛花, 用鼻吸气, 嗅, 闻, 鼻烟, 气味\nvt. 剪烛花, 掐灭, 扼杀, 消灭, 用鼻吸, 嗅出, 闻出\nvi. 嗅, 闻"
        },
        {
          "term": "snuff",
          "partOfSpeech": "noun · verb",
          "meaning": "① n. 烛花, 用鼻吸气, 嗅, 闻, 鼻烟, 气味\n② vt. 剪烛花, 掐灭, 扼杀, 消灭, 用鼻吸, 嗅出, 闻出\n③ vi. 嗅, 闻"
        }
      ],
      "legacyContexts": [
        {
          "term": "snuff",
          "partOfSpeech": "verb",
          "meaning": "熄灭"
        }
      ],
      "componentContexts": [
        {
          "term": "snuff",
          "partOfSpeech": "noun",
          "meaning": "鼻烟；通过鼻子吸入的粉末状烟草制品。"
        }
      ],
      "componentPair": {
        "term": "snuff",
        "partOfSpeech": "noun",
        "meaningZh": "鼻烟；通过鼻子吸入的粉末状烟草制品。",
        "en": "The museum displayed a small box once used for snuff.",
        "zh": "博物馆展出一个过去用来装鼻烟的小盒子。"
      },
      "componentPairSha256": "29b2f08f26e7728913c253058e301c9eccbdb23536296fa7f4a47096bc616232",
      "componentId": "canonical-component:507059fc8ad3f5a31506863d0d230825ec2fab7bcacfce65cbd27196085bd170",
      "reviewer": "AI/classroom_components_0011_reader_b",
      "sourceQualification": "Only this selected role and finite display association are authorized; the complete raw canonical definition remains unapproved.",
      "wholeRawSourceApproved": false
    },
    {
      "term": "fertilize",
      "canonicalId": 1051295,
      "canonicalSourceSha256": "33b2a401787f4dfcdd13f8fb0091134d8404a2f82415af9ddb72bc5e7996f907",
      "exactCanonicalRecord": {
        "id": 1051295,
        "term": "fertilize",
        "partOfSpeech": "verb",
        "meaning": "vt. 施肥, 使丰饶, 使受精",
        "forms": [
          "fertilized",
          "fertilizes",
          "fertilizing"
        ],
        "source": "mit",
        "seed": {
          "rank": 8213,
          "forms": [
            "fertilized",
            "fertilizes",
            "fertilizing"
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
        "term": "fertilize",
        "senses": [
          {
            "id": "example:fertilize",
            "partOfSpeech": "verb",
            "meaningZh": "施肥",
            "examples": [
              {
                "en": "The gardeners fertilized the rose beds before the exhibition.",
                "zh": "园丁们在展览前给玫瑰花坛施了肥。"
              }
            ],
            "reviewer": "AI/examples4_a",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "6453907e4308eb512c9d34b4eceb0ebbf7d6c52e7748e00c1280ceba5c8f3905",
      "canonicalContexts": [
        {
          "term": "fertilize",
          "partOfSpeech": "verb",
          "meaning": "vt. 施肥, 使丰饶, 使受精"
        },
        {
          "term": "fertilize",
          "partOfSpeech": "verb",
          "meaning": "① vt. 施肥, 使丰饶, 使受精"
        }
      ],
      "legacyContexts": [
        {
          "term": "fertilize",
          "partOfSpeech": "verb",
          "meaning": "施肥"
        }
      ],
      "componentContexts": [
        {
          "term": "fertilize",
          "partOfSpeech": "verb",
          "meaning": "使受精；使精子与卵细胞结合。"
        }
      ],
      "componentPair": {
        "term": "fertilize",
        "partOfSpeech": "verb",
        "meaningZh": "使受精；使精子与卵细胞结合。",
        "en": "A single sperm cell fertilized the egg.",
        "zh": "一个精子使卵细胞受精。"
      },
      "componentPairSha256": "d0d1ff36f1d78f0cc2293eaa581b12bddd549c1bad8dbf8d4fe1c1e00a898ee3",
      "componentId": "canonical-component:b5efe964216f3403e3b6f174829b47eaf221866441ad3ad198ba549037a3cf12",
      "reviewer": "AI/classroom_components_0011_reader_b",
      "sourceQualification": "Only this selected role and finite display association are authorized; the complete raw canonical definition remains unapproved.",
      "wholeRawSourceApproved": false
    },
    {
      "term": "socialize",
      "canonicalId": 1832172,
      "canonicalSourceSha256": "4db838a17b0a04958c6769b3903b5f5850161b1e3d8952fd2f6b5a75c281eb3e",
      "exactCanonicalRecord": {
        "id": 1832172,
        "term": "socialize",
        "partOfSpeech": "verb",
        "meaning": "vt. 使社会化, 使社会主义化, 使适合社会需要\nvi. (美)(非正式)参加社交活动, 发生社交往来",
        "forms": [
          "socialized",
          "socializes",
          "socializing"
        ],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "verb",
            "meaning": "vt. 使社会化, 使社会主义化, 使适合社会需要\nvi. (美)(非正式)参加社交活动, 发生社交往来",
            "source": "mit"
          }
        ],
        "seed": {
          "rank": 14316,
          "forms": [
            "socialized",
            "socializes",
            "socializing"
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
        "term": "socialize",
        "senses": [
          {
            "id": "example:socialize",
            "partOfSpeech": "verb",
            "meaningZh": "参加社交活动",
            "examples": [
              {
                "en": "The shared kitchen gave residents somewhere to socialize.",
                "zh": "共用厨房给住户们提供了一个社交场所。"
              }
            ],
            "reviewer": "AI/examples8_c",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "0d1b494cc06cd1d79301351261aa9252975dd2d8f575da55f1e50b722a07dda9",
      "canonicalContexts": [
        {
          "term": "socialize",
          "partOfSpeech": "verb",
          "meaning": "vt. 使社会化, 使社会主义化, 使适合社会需要\nvi. (美)(非正式)参加社交活动, 发生社交往来"
        },
        {
          "term": "socialize",
          "partOfSpeech": "verb",
          "meaning": "① vt. 使社会化, 使社会主义化, 使适合社会需要\n② vi. (美)(非正式)参加社交活动, 发生社交往来"
        }
      ],
      "legacyContexts": [
        {
          "term": "socialize",
          "partOfSpeech": "verb",
          "meaning": "参加社交活动"
        }
      ],
      "componentContexts": [
        {
          "term": "socialize",
          "partOfSpeech": "verb",
          "meaning": "使社会化；教导某人学习所属社会的行为规范和与人相处的方式。"
        }
      ],
      "componentPair": {
        "term": "socialize",
        "partOfSpeech": "verb",
        "meaningZh": "使社会化；教导某人学习所属社会的行为规范和与人相处的方式。",
        "en": "Parents and teachers socialize children into the norms of their community.",
        "zh": "父母和老师引导孩子学习他们所在社群的行为规范。"
      },
      "componentPairSha256": "675ca2f24e95188c168ed716357db5f2e1fbbed9bf0472122eacdb97e30a5655",
      "componentId": "canonical-component:4d71713c04f617abf93e39aad0a3c4458109fc04da0e300d04d4a8993f234409",
      "reviewer": "AI/classroom_components_0011_reader_b",
      "sourceQualification": "Only this selected role and finite display association are authorized; the complete raw canonical definition remains unapproved.",
      "wholeRawSourceApproved": false
    },
    {
      "term": "claim",
      "canonicalId": 59375,
      "canonicalSourceSha256": "57c801a0373146719837475073f710d0a578a3849735f69bd1b8dedf1ca6c756",
      "exactCanonicalRecord": {
        "id": 59375,
        "term": "claim",
        "partOfSpeech": "noun · verb",
        "meaning": "n. 要求, 要求权, 断言, 权利\nvt. 要求, 认领, 主张\nvi. 提出要求, 主张, 断言",
        "forms": [
          "claimed",
          "claiming",
          "claims"
        ],
        "source": "core",
        "variants": [
          {
            "partOfSpeech": "noun · verb",
            "meaning": "n. 要求, 要求权, 断言, 权利\nvt. 要求, 认领, 主张\nvi. 提出要求, 主张, 断言",
            "source": "mit"
          },
          {
            "partOfSpeech": "verb · noun",
            "meaning": "1. verb：声称；宣称某事真实，但说话者不一定已经提供足够证据。\n2. verb：申领；索取自己认为有权获得的钱、物品或赔偿。\n3. noun：说法；主张，也可指要求获得权利、款项等的申请。",
            "source": "original"
          }
        ],
        "seed": {
          "rank": 463,
          "forms": [
            "claimed",
            "claiming",
            "claims"
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
        "term": "claim",
        "senses": [
          {
            "id": "zhuo:claim:verb:1",
            "partOfSpeech": "verb",
            "meaningZh": "声称；宣称某事真实，但说话者不一定已经提供足够证据。",
            "examples": [
              {
                "en": "The seller claims that the table is more than a century old.",
                "zh": "卖家声称这张桌子已有一百多年的历史。"
              }
            ],
            "reviewer": "AI/verb-and-pilot-cross-review",
            "source": "原创例句·AI复核（精选义项）"
          },
          {
            "id": "zhuo:claim:verb:2",
            "partOfSpeech": "verb",
            "meaningZh": "申领；索取自己认为有权获得的钱、物品或赔偿。",
            "examples": [
              {
                "en": "You can claim travel expenses if you keep the tickets.",
                "zh": "保留车票后，你可以申报差旅费用。"
              }
            ],
            "reviewer": "AI/verb-and-pilot-cross-review",
            "source": "原创例句·AI复核（精选义项）"
          },
          {
            "id": "zhuo:claim:noun:1",
            "partOfSpeech": "noun",
            "meaningZh": "说法；主张，也可指要求获得权利、款项等的申请。",
            "examples": [
              {
                "en": "We need independent evidence before accepting that claim.",
                "zh": "接受那个说法前，我们需要独立证据。"
              }
            ],
            "reviewer": "AI/verb-and-pilot-cross-review",
            "source": "原创例句·AI复核（精选义项）"
          }
        ]
      },
      "expectedOriginalEntrySha256": "3f96f6ef69c94f3c03ca067155133b15a130219f0065e8f4a01b8769da4d09bb",
      "canonicalContexts": [
        {
          "term": "claim",
          "partOfSpeech": "noun · verb",
          "meaning": "n. 要求, 要求权, 断言, 权利\nvt. 要求, 认领, 主张\nvi. 提出要求, 主张, 断言"
        },
        {
          "term": "claim",
          "partOfSpeech": "noun · verb",
          "meaning": "① n. 要求, 要求权, 断言, 权利\n② vt. 要求, 认领, 主张\n③ vi. 提出要求, 主张, 断言"
        }
      ],
      "legacyContexts": [
        {
          "term": "claim",
          "partOfSpeech": "verb",
          "meaning": "声称；宣称某事真实，但说话者不一定已经提供足够证据。"
        },
        {
          "term": "claim",
          "partOfSpeech": "verb",
          "meaning": "申领；索取自己认为有权获得的钱、物品或赔偿。"
        },
        {
          "term": "claim",
          "partOfSpeech": "noun",
          "meaning": "说法；主张，也可指要求获得权利、款项等的申请。"
        }
      ],
      "componentContexts": [
        {
          "term": "claim",
          "partOfSpeech": "noun",
          "meaning": "对财产等主张的权利；认为自己有权拥有或获得某物的权利主张。"
        }
      ],
      "componentPair": {
        "term": "claim",
        "partOfSpeech": "noun",
        "meaningZh": "对财产等主张的权利；认为自己有权拥有或获得某物的权利主张。",
        "en": "He has no legal claim to the family business.",
        "zh": "他对这家家族企业没有合法的权利主张。"
      },
      "componentPairSha256": "a93f67d3ede44b7a23dae979bee07c008f6d88f62d136683c8f7349d65085596",
      "componentId": "canonical-component:44369ac02a463128561f37ddc64be34dad594990eb080dc8835da646e1359f38",
      "reviewer": "AI/classroom_components_0011_reader_b",
      "sourceQualification": "Only this selected role and finite display association are authorized; the complete raw canonical definition remains unapproved.",
      "wholeRawSourceApproved": false
    }
  ]
});
