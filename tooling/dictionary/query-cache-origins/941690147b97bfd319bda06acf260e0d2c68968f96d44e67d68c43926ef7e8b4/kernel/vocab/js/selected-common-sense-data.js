// Generated independently reviewed canonical selected-sense group bindings; raw source and old group evidence remain unchanged.
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const SELECTED_COMMON_SENSE_BINDINGS = freeze([
  {
    "groupId": "common-240",
    "sourceId": "pwn30:01129920-n",
    "groupTerms": [
      "义务",
      "职责",
      "责任"
    ],
    "runtimeGroup": {
      "id": "common-240",
      "number": 240,
      "sourceId": "pwn30:01129920-n",
      "pos": "noun",
      "sense": "义务／职责／责任",
      "terms": [
        "义务",
        "职责",
        "责任"
      ],
      "heads": [
        "duty",
        "responsibility",
        "obligation"
      ],
      "note": "名词：社会或道德要求承担的义务；duty 不取关税，responsibility 不仅指事故过错归责。",
      "forbidden": [
        "tariff"
      ],
      "evidence": [
        {
          "head": "duty",
          "partOfSpeech": "noun",
          "meaning": "n. 责任, 关税, 职务, 尊敬\n[化] 职责",
          "source": "core",
          "terms": [
            "职责",
            "责任"
          ]
        },
        {
          "head": "duty",
          "partOfSpeech": "noun",
          "meaning": "n. 责任, 关税, 职务, 尊敬\n[化] 职责",
          "source": "mit",
          "terms": [
            "职责",
            "责任"
          ]
        },
        {
          "head": "duty",
          "partOfSpeech": "noun (countable or uncountable) · noun (countable, often plural)",
          "meaning": "1. noun (countable or uncountable)：责任；义务；因为身份、规则或道德而应当做的事情。\n2. noun (countable, often plural)：职责；分派的工作任务；on duty 表示在值班，off duty 表示不在值班。\n3. noun (countable or uncountable)：税；关税；政府对某些商品、交易或进出口活动收取的税款。",
          "source": "original",
          "terms": [
            "义务",
            "责任"
          ]
        },
        {
          "head": "responsibility",
          "partOfSpeech": "noun",
          "meaning": "n. 责任, 职责, 负担, 可靠性\n[化] 职责",
          "source": "core",
          "terms": [
            "职责",
            "责任"
          ]
        },
        {
          "head": "responsibility",
          "partOfSpeech": "noun",
          "meaning": "n. 责任, 职责, 负担, 可靠性\n[化] 职责",
          "source": "mit",
          "terms": [
            "职责",
            "责任"
          ]
        },
        {
          "head": "obligation",
          "partOfSpeech": "noun",
          "meaning": "n. 义务, 责任, 约束, 契约, 恩惠, 债务\n[经] 待付款, 债务, 义务",
          "source": "core",
          "terms": [
            "义务",
            "责任"
          ]
        },
        {
          "head": "obligation",
          "partOfSpeech": "noun",
          "meaning": "n. 义务, 责任, 约束, 契约, 恩惠, 债务\n[经] 待付款, 债务, 义务",
          "source": "mit",
          "terms": [
            "义务",
            "责任"
          ]
        }
      ],
      "exampleSenses": {
        "duty": [
          {
            "id": "duty-noun-obligation",
            "partOfSpeech": "noun (countable or uncountable)",
            "meaningZh": "责任；义务；因为身份、规则或道德而应当做的事情。",
            "examples": [
              {
                "en": "We have a duty to report the damaged safety barrier.",
                "zh": "我们有责任报告安全护栏的损坏情况。"
              }
            ]
          },
          {
            "id": "duty-noun-assigned-work",
            "partOfSpeech": "noun (countable, often plural)",
            "meaningZh": "职责；分派的工作任务；on duty 表示在值班，off duty 表示不在值班。",
            "examples": [
              {
                "en": "Her duties include checking bookings and welcoming visitors.",
                "zh": "她的职责包括核对预约和接待访客。"
              }
            ]
          }
        ],
        "responsibility": [
          {
            "id": "example:responsibility",
            "partOfSpeech": "noun",
            "meaningZh": "由某人负责完成或确保落实的职责。",
            "examples": [
              {
                "en": "It is my responsibility to check that the laboratory doors are locked.",
                "zh": "确认实验室的门已上锁，是我的职责。"
              }
            ]
          }
        ],
        "obligation": [
          {
            "id": "example:obligation",
            "partOfSpeech": "noun",
            "meaningZh": "义务",
            "examples": [
              {
                "en": "I felt an obligation to keep my promise.",
                "zh": "我觉得自己有义务信守承诺。"
              }
            ]
          }
        ]
      }
    },
    "head": "obligation",
    "canonicalId": 374313,
    "canonicalSourceSha256": "08d90801abf6b543e65bed68342b422c03c1b610d26e55c82965476d488f60a6",
    "canonicalManifestVersion": "cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644",
    "canonicalShard": {
      "bucket": 41,
      "file": "cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644/en-041.json",
      "sha256": "93563255ea3986dd832a765c40155aa355b6bb66648bbbd450602efe3429696a",
      "bytes": 353646
    },
    "canonicalRecordJSON": "{\"id\":374313,\"term\":\"obligation\",\"partOfSpeech\":\"noun\",\"meaning\":\"n. 义务, 责任, 约束, 契约, 恩惠, 债务\\n[经] 待付款, 债务, 义务\",\"forms\":[\"obligations\"],\"source\":\"core\",\"variants\":[{\"partOfSpeech\":\"noun\",\"meaning\":\"n. 义务, 责任, 约束, 契约, 恩惠, 债务\\n[经] 待付款, 债务, 义务\",\"source\":\"mit\"}],\"seed\":{\"rank\":2924,\"forms\":[\"obligations\"],\"workbook\":true}}",
    "selectedSourceSha256": "6dcdff7cc95ac55ac9980de12e0c63c5e49c0be416f372798b031075fe5ad46b",
    "selectedRowSha256": "2ed4022d80c134b39e63c0facac10177d25bf3f4255afdc63a320d263188d563",
    "selectedRow": {
      "term": "obligation",
      "partOfSpeech": "noun",
      "meaning": "① 义务；责任，指法律、承诺、道德或社会关系要求履行的事情。\n② 负有义务的状态或责任感；受到承诺、约定等约束的情形。\n③ 具有约束力的承诺、契约或约定。\n④ 财务用语：债务；应付款项；负有偿付责任的债务凭证。\n⑤ 人情债；因受人帮助而感到应当感激或回报的责任。",
      "chineseAliases": [
        "应尽的责任",
        "必须履行的义务",
        "人情债"
      ],
      "englishForms": [
        "obligations"
      ],
      "en": "I declined the extra weekend shift because of a family obligation.",
      "zh": "因为家中有必须处理的事，我没有接下额外的周末班次。",
      "references": [
        "https://www.merriam-webster.com/dictionary/obligation"
      ],
      "canonicalId": 374313,
      "canonicalSourceSha256": "08d90801abf6b543e65bed68342b422c03c1b610d26e55c82965476d488f60a6"
    },
    "directTerms": [
      "义务",
      "责任"
    ],
    "selectedExampleProof": {
      "id": "reviewed-sense:d87c4a79387af529",
      "partOfSpeech": "noun",
      "meaningZh": "① 义务；责任，指法律、承诺、道德或社会关系要求履行的事情。\n② 负有义务的状态或责任感；受到承诺、约定等约束的情形。\n③ 具有约束力的承诺、契约或约定。\n④ 财务用语：债务；应付款项；负有偿付责任的债务凭证。\n⑤ 人情债；因受人帮助而感到应当感激或回报的责任。",
      "examples": [
        {
          "en": "I declined the extra weekend shift because of a family obligation.",
          "zh": "因为家中有必须处理的事，我没有接下额外的周末班次。"
        }
      ]
    },
    "originalDTOJSON": "{\"term\":\"obligation\",\"senses\":[{\"id\":\"example:obligation\",\"partOfSpeech\":\"noun\",\"meaningZh\":\"义务\",\"examples\":[{\"en\":\"I felt an obligation to keep my promise.\",\"zh\":\"我觉得自己有义务信守承诺。\"}],\"reviewer\":\"AI/examples_0003_a\",\"source\":\"原创例句·AI复核（精选义项）\"}]}",
    "originalDTOSha256": "3c967b1dc88a26d12d64cd97b3de9e710fd0fd6ae152765e0742de35cb6ea1e3",
    "legacySavedContexts": [
      {
        "term": "obligation",
        "partOfSpeech": "noun",
        "meaning": "n. 义务, 责任, 约束, 契约, 恩惠, 债务\n[经] 待付款, 债务, 义务"
      },
      {
        "term": "obligation",
        "partOfSpeech": "noun",
        "meaning": "① n. 义务, 责任, 约束, 契约, 恩惠, 债务\n   [经] 待付款, 债务, 义务"
      }
    ]
  }
]);
